// Уведомления: настройки, расписание (местное время), тексты, команды бота и шифрование веб-пуша.
import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFY, appUrlOf, isTime, maskTime, withDefaults } from './notify';
import { dueReminders, localParts, makeLinkCode, message, normPrefs, parseCommand, telegramPayload, weekKey, type Prefs } from '../../supabase/functions/notify/logic';
import { b64url, concat, deriveKeys, encryptPayload, fromB64url, generateVapidKeys, vapidAuth } from '../../supabase/functions/notify/webpush';

const subtle = globalThis.crypto.subtle;
const B = (u: Uint8Array) => u as unknown as BufferSource;
const at = (iso: string) => new Date(iso);
const P = (over: Partial<Prefs> = {}): Prefs => ({ ...normPrefs({ tz: 'Europe/Moscow' }), ...over });

describe('настройки уведомлений', () => {
  it('значения по умолчанию в приложении и на сервере совпадают', () => {
    const s = normPrefs(undefined);
    expect({ weigh: s.weigh, diary: s.diary, comment: s.comment, backup: s.backup }).toEqual(DEFAULT_NOTIFY);
    expect(withDefaults({ weigh: { on: false, time: '07:30' } }).diary).toEqual(DEFAULT_NOTIFY.diary);
  });
  it('мусор в настройках заменяется значениями по умолчанию', () => {
    const s = normPrefs({ weigh: { on: 'yes', time: '25:00' }, tz: 'Mars/Base', lang: 'de', appUrl: 'http://x' }, 'en');
    expect(s.weigh).toEqual({ on: true, time: '08:00' });
    expect(s.tz).toBe('Europe/Moscow');
    expect(s.lang).toBe('en');
    expect(s.appUrl).toBeUndefined();
    expect(normPrefs({ diary: { on: false, time: '7:05' } }).diary).toEqual({ on: false, time: '07:05' });
  });
  it('маска и проверка времени', () => {
    expect(maskTime('0830')).toBe('08:30');
    expect(maskTime('8')).toBe('8');
    expect(maskTime('21:0')).toBe('21:0');
    expect(isTime('08:30')).toBe(true);
    expect(isTime('24:00')).toBe(false);
    expect(appUrlOf('https://ab.vercel.app/?x=1#/day')).toBe('https://ab.vercel.app/');
    expect(appUrlOf('http://localhost:8081/')).toBeUndefined();
  });
});

describe('расписание по местному времени', () => {
  it('местная дата и время, а не UTC', () => {
    // 22:30 UTC — в Москве уже следующий день, 01:30
    expect(localParts(at('2026-11-19T22:30:00Z'), 'Europe/Moscow')).toEqual({ date: '2026-11-20', minutes: 90, weekday: 5 });
    expect(localParts(at('2026-11-19T22:30:00Z'), 'America/New_York').date).toBe('2026-11-19');
  });
  it('утреннее взвешивание: в окне 3 часа и только если веса нет', () => {
    const p = P();
    expect(dueReminders(p, at('2026-11-19T04:55:00Z'), undefined)).toEqual([]); // 07:55
    expect(dueReminders(p, at('2026-11-19T05:00:00Z'), undefined)).toEqual([{ kind: 'weigh', ref: 'weigh:2026-11-19' }]);
    expect(dueReminders(p, at('2026-11-19T05:00:00Z'), { weight: 72.1 })).toEqual([]);
    expect(dueReminders(p, at('2026-11-19T08:00:00Z'), undefined)).toEqual([]); // 11:00 — окно прошло, ночью/днём не догоняем
    expect(dueReminders(P({ weigh: { on: false, time: '08:00' } }), at('2026-11-19T05:00:00Z'), undefined)).toEqual([]);
  });
  it('дневник: нет калорий и нет приёмов по фото; необычный день не трогаем', () => {
    const p = P();
    const nine = at('2026-11-19T18:10:00Z'); // 21:10
    expect(dueReminders(p, nine, { weight: 72 })).toEqual([{ kind: 'diary', ref: 'diary:2026-11-19' }]);
    expect(dueReminders(p, nine, { kcal: 1800 })).toEqual([]);
    expect(dueReminders(p, nine, { photoMeals: [{}] })).toEqual([]);
    expect(dueReminders(p, nine, { anomaly: 'trip' })).toEqual([]);
  });
  it('резервная копия: в полдень, ключ — неделя', () => {
    const noon = at('2026-11-19T09:30:00Z'); // чт 12:30
    const old = noon.getTime() - 8 * 86400_000;
    expect(dueReminders(P({ backupAt: old }), noon, { weight: 1, kcal: 1 })).toEqual([{ kind: 'backup', ref: 'backup:2026-11-16' }]);
    expect(dueReminders(P({ backupAt: noon.getTime() - 86400_000 }), noon, {})).toEqual([]);
    expect(weekKey('2026-11-22', 7)).toBe('2026-11-16');
  });
});

describe('сообщения и бот', () => {
  it('в тексте нет данных дневника, есть кнопка открыть приложение', () => {
    const m = message('comment', { lang: 'ru', appUrl: 'https://ab.app/' }, { curator: 'Анна <b>', date: '2026-11-18' });
    expect(m.body).toContain('18.11');
    const tg = telegramPayload(1, m, 'ru');
    expect(tg.text).toContain('Анна &lt;b&gt;');
    expect(tg.reply_markup?.inline_keyboard[0][0].url).toBe('https://ab.app/');
    expect(telegramPayload(1, message('weigh', { lang: 'en' }), 'en').reply_markup).toBeUndefined();
  });
  it('команды: /start КОД, /stop, прочее', () => {
    expect(parseCommand('/start abc123XYZ0')).toEqual({ cmd: 'start', code: 'ABC123XYZ0' });
    expect(parseCommand('/start')).toEqual({ cmd: 'start', code: undefined });
    expect(parseCommand('/stop')).toEqual({ cmd: 'stop' });
    expect(parseCommand('привет')).toEqual({ cmd: 'other' });
    expect(makeLinkCode()).toMatch(/^[A-Z2-9]{10}$/);
  });
});

describe('веб-пуш: шифрование и подпись', () => {
  it('браузер расшифровывает сообщение (RFC 8291)', async () => {
    // «браузер»: свой ключ и секрет
    const ua = (await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const uaPublic = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const text = JSON.stringify({ title: 'Пора взвеситься', body: 'тест' });
    const body = await encryptPayload({ p256dh: b64url(uaPublic), auth: b64url(authSecret) }, new TextEncoder().encode(text));

    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)).toBe(4096);
    const idlen = body[20];
    const asPublic = body.slice(21, 21 + idlen);
    const ct = body.slice(21 + idlen);
    const asKey = await subtle.importKey('raw', B(asPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
    const { cek, nonce } = await deriveKeys(shared, authSecret, uaPublic, asPublic, salt);
    const k = await subtle.importKey('raw', B(cek), 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: B(nonce) }, k, B(ct)));
    expect(plain[plain.length - 1]).toBe(2); // разделитель последней записи
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe(text);
  });

  it('подпись VAPID проверяется открытым ключом', async () => {
    const keys = await generateVapidKeys();
    expect(fromB64url(keys.publicKey).length).toBe(65);
    const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/abc', keys, 'mailto:x@y.z', 1_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_000_000 + 43200, sub: 'mailto:x@y.z' });
    const pub = await subtle.importKey('raw', B(fromB64url(keys.publicKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, B(fromB64url(m[3])), B(new TextEncoder().encode(m[1] + '.' + m[2])));
    expect(ok).toBe(true);
    expect(concat(new Uint8Array([1]), new Uint8Array([2]))).toEqual(new Uint8Array([1, 2]));
  });
});
