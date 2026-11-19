// Функция «notify» одним файлом. Собрано командой `npm run fn:bundle` из supabase/functions/notify/.
// Supabase → Edge Functions → Deploy a new function → Via Editor → имя «notify» → вставить весь файл.

// ======== webpush.ts ========
// Веб-пуш без сторонних библиотек: подпись VAPID (RFC 8292) и шифрование aes128gcm (RFC 8291 / 8188)
// на WebCrypto. Работает одинаково в Supabase Edge (Deno) и в Node 20+ (тесты src/core/notify.test.ts).

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const subtle = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array) => u as unknown as BufferSource;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, buf(data)));
}

// ---- Ключи VAPID ----

/** Ключи сервера: закрытый в JWK (хранится в базе, таблица notify_secrets), открытый — 65 байт в base64url для приложения. */
interface VapidKeys {
  publicKey: string;
  privateJwk: JsonWebKey;
}

async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  const privateJwk = await subtle().exportKey('jwk', kp.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

/** Заголовок Authorization для службы пушей (Google, Mozilla, Apple). Подпись ES256, срок 12 часов. */
async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const key = await subtle().importKey('jwk', { ...keys.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(head + '.' + body))));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${keys.publicKey}`;
}

// ---- Шифрование сообщения ----

interface PushSubscriptionKeys {
  endpoint: string;
  /** Открытый ключ браузера, base64url (65 байт). */
  p256dh: string;
  /** Секрет браузера, base64url (16 байт). */
  auth: string;
}

/** Тело запроса aes128gcm: соль, размер записи, открытый ключ сервера на один раз, шифротекст. */
async function encryptPayload(sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const ephemeral = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey));
  const uaKey = await subtle().importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, ephemeral.privateKey, 256));
  const { cek, nonce } = await deriveKeys(shared, authSecret, uaPublic, asPublic, salt);
  const key = await subtle().importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  // одна запись: сообщение + разделитель 0x02 (последняя запись), без дополнения
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(concat(payload, new Uint8Array([2])))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** Общая часть для шифрования и расшифровки (расшифровку делает браузер; в тестах — мы). */
async function deriveKeys(shared: Uint8Array, authSecret: Uint8Array, uaPublic: Uint8Array, asPublic: Uint8Array, salt: Uint8Array) {
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  return { cek, nonce };
}

type PushResult = 'ok' | 'gone' | 'error';

/** Отправить одно сообщение на одно устройство. gone — подписка больше не действует, её надо удалить. */
async function sendWebPush(sub: PushSubscriptionKeys, message: unknown, keys: VapidKeys, subject: string, ttlSec = 12 * 3600): Promise<PushResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSec),
      Urgency: 'normal',
    },
    body: buf(body) as BodyInit,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'ok' : 'error';
}

// ======== logic.ts ========
// Логика функции «notify» без обращений к сети и базе: настройки, местное время, что пора отправить,
// тексты сообщений, разбор команд Telegram. Проверяется тестами src/core/notify.test.ts.
// Настройки пишет приложение в profiles.data.notify (тип NotifyPrefs в src/core/notify.ts — те же поля).

type Lang = 'ru' | 'en';
type Kind = 'weigh' | 'diary' | 'comment' | 'backup' | 'test';

interface Prefs {
  weigh: { on: boolean; time: string };
  diary: { on: boolean; time: string };
  comment: { on: boolean };
  backup: { on: boolean };
  tz: string;
  lang: Lang;
  /** Адрес приложения (https) — для кнопки «Открыть» в Telegram и перехода из пуша. */
  appUrl?: string;
  /** Последняя резервная копия, мс. */
  backupAt?: number;
}

const DEFAULT_TZ = 'Europe/Moscow';

/** Время «ЧЧ:ММ» → минуты от полуночи; неверное — null. */
function parseTime(s: unknown): number | null {
  const m = typeof s === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function validTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Настройки из профиля с подстановкой значений по умолчанию (как в приложении). */
function normPrefs(raw: unknown, profileLang?: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const on = (x: any, d: boolean) => (typeof x?.on === 'boolean' ? x.on : d);
  const time = (x: any, d: string) => (parseTime(x?.time) != null ? String(x.time).trim().padStart(5, '0') : d);
  const lang: Lang = r.lang === 'en' || r.lang === 'ru' ? r.lang : profileLang === 'en' ? 'en' : 'ru';
  const appUrl = typeof r.appUrl === 'string' && /^https:\/\/[^\s]+$/.test(r.appUrl) ? r.appUrl : undefined;
  return {
    weigh: { on: on(r.weigh, true), time: time(r.weigh, '08:00') },
    diary: { on: on(r.diary, true), time: time(r.diary, '21:00') },
    comment: { on: on(r.comment, true) },
    backup: { on: on(r.backup, true) },
    tz: validTz(r.tz) ? r.tz : DEFAULT_TZ,
    lang,
    appUrl,
    backupAt: typeof r.backupAt === 'number' ? r.backupAt : undefined,
  };
}

/** Местная дата (ГГГГ-ММ-ДД), минуты от полуночи и день недели (1 = пн) в часовом поясе пользователя. */
function localParts(now: Date, tz: string): { date: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday')) + 1;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')), weekday: wd };
}

/** Понедельник недели, в которую попадает местная дата (ключ «раз в неделю»). */
function weekKey(date: string, weekday: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (weekday - 1));
  return d.toISOString().slice(0, 10);
}

/** Напоминание приходит в выбранное время или позже, но не позже чем через 3 часа (если сервер спал — не будим ночью). */
const WINDOW_MIN = 180;
/** Напоминание о копии — в полдень, раз в неделю, если копии не было 7 дней. */
const BACKUP_TIME = 12 * 60;

interface DayFacts {
  weight?: unknown;
  kcal?: unknown;
  photoMeals?: unknown[];
  anomaly?: unknown;
}

interface Due {
  kind: Kind;
  /** Ключ в журнале notify_log: одно и то же сообщение не уходит дважды. */
  ref: string;
}

/** Какие напоминания пора отправить пользователю сейчас. Проверка журнала — снаружи (по ref). */
function dueReminders(p: Prefs, now: Date, today: DayFacts | undefined): Due[] {
  const l = localParts(now, p.tz);
  const inWindow = (t: string) => {
    const m = parseTime(t)!;
    return l.minutes >= m && l.minutes < m + WINDOW_MIN;
  };
  const out: Due[] = [];
  const has = (v: unknown) => v != null && v !== '';
  if (p.weigh.on && inWindow(p.weigh.time) && !has(today?.weight)) out.push({ kind: 'weigh', ref: 'weigh:' + l.date });
  const ate = has(today?.kcal) || (today?.photoMeals?.length || 0) > 0;
  if (p.diary.on && inWindow(p.diary.time) && !ate && !has(today?.anomaly)) out.push({ kind: 'diary', ref: 'diary:' + l.date });
  const stale = !p.backupAt || now.getTime() - p.backupAt >= 7 * 86400_000;
  if (p.backup.on && stale && l.minutes >= BACKUP_TIME && l.minutes < BACKUP_TIME + WINDOW_MIN)
    out.push({ kind: 'backup', ref: 'backup:' + weekKey(l.date, l.weekday) });
  return out;
}

// ---- Тексты ----

const dm = (iso: string, lang: Lang) => {
  const [y, m, d] = iso.split('-');
  return lang === 'en' ? `${y}-${m}-${d}` : `${d}.${m}`;
};

const TEXTS: Record<Lang, Record<Kind, (x: { curator?: string; date?: string }) => { title: string; body: string }>> = {
  ru: {
    weigh: () => ({ title: 'Пора взвеситься', body: 'Утром натощак, после туалета. Впишите вес на экране «День».' }),
    diary: () => ({ title: 'Дневник за сегодня пустой', body: 'Добавьте калории и БЖУ, пока помните, что ели.' }),
    comment: (x) => ({ title: 'Комментарий куратора', body: `${x.curator || 'Куратор'}: новый комментарий к дню ${x.date ? dm(x.date, 'ru') : ''}. Откройте приложение, чтобы прочитать.` }),
    backup: () => ({ title: 'Сохраните резервную копию', body: 'Копии не было больше 7 дней. Профиль → «Экспорт данных».' }),
    test: () => ({ title: 'Проверка уведомлений', body: 'Если вы видите это сообщение, уведомления работают.' }),
  },
  en: {
    weigh: () => ({ title: 'Time to weigh in', body: 'In the morning, before breakfast. Enter your weight on the Day screen.' }),
    diary: () => ({ title: "Today's diary is empty", body: 'Add calories and macros while you still remember what you ate.' }),
    comment: (x) => ({ title: 'Coach comment', body: `${x.curator || 'Your coach'}: new comment on ${x.date ? dm(x.date, 'en') : 'a day'}. Open the app to read it.` }),
    backup: () => ({ title: 'Save a backup', body: 'No backup for more than 7 days. Profile → “Export data”.' }),
    test: () => ({ title: 'Notification test', body: 'If you can see this, notifications work.' }),
  },
};

interface Message {
  kind: Kind;
  title: string;
  body: string;
  /** Куда открыть приложение по нажатию. */
  url?: string;
  /** Одинаковый tag заменяет старое уведомление тем же видом. */
  tag: string;
}

/** В сообщениях нет цифр дневника и текста комментария: только повод открыть приложение. */
function message(kind: Kind, p: Pick<Prefs, 'lang' | 'appUrl'>, x: { curator?: string; date?: string } = {}): Message {
  const t = TEXTS[p.lang][kind](x);
  return { kind, ...t, url: p.appUrl, tag: 'ab-' + kind };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Сообщение Telegram (parse_mode HTML) с кнопкой «Открыть приложение». */
function telegramPayload(chatId: number | string, m: Message, lang: Lang) {
  return {
    chat_id: chatId,
    text: `<b>${esc(m.title)}</b>\n${esc(m.body)}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(m.url ? { reply_markup: { inline_keyboard: [[{ text: lang === 'en' ? 'Open the app' : 'Открыть приложение', url: m.url }]] } } : {}),
  };
}

// ---- Telegram: привязка ----

/** Код привязки: 10 знаков без похожих букв, годен 30 минут. */
const LINK_CODE_MIN = 30;
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeLinkCode(rnd: Uint8Array = crypto.getRandomValues(new Uint8Array(10))): string {
  return Array.from(rnd, (b) => ABC[b % ABC.length]).join('');
}

type BotCommand = { cmd: 'start'; code?: string } | { cmd: 'stop' } | { cmd: 'other' };

/** «/start КОД» (переход по ссылке из приложения), «/stop», остальное — подсказка. */
function parseCommand(text: unknown): BotCommand {
  const s = typeof text === 'string' ? text.trim() : '';
  const m = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/.exec(s);
  if (m) return { cmd: 'start', code: m[1]?.toUpperCase() };
  if (/^\/stop(?:@\w+)?$/.test(s)) return { cmd: 'stop' };
  return { cmd: 'other' };
}

const BOT_REPLIES: Record<Lang, Record<'linked' | 'badCode' | 'noCode' | 'stopped' | 'help', string>> = {
  ru: {
    linked: 'Готово! Напоминания Activity Balance будут приходить сюда. Что именно присылать, настраивается в приложении: Профиль → «Уведомления». Отключить: команда /stop.',
    badCode: 'Ссылка устарела. Откройте приложение: Профиль → «Уведомления» → «Подключить Telegram» и нажмите кнопку ещё раз.',
    noCode: 'Чтобы получать напоминания, откройте приложение Activity Balance: Профиль → «Уведомления» → «Подключить Telegram».',
    stopped: 'Напоминания в Telegram отключены. Подключить снова можно в приложении: Профиль → «Уведомления».',
    help: 'Я присылаю напоминания Activity Balance. Настройки — в приложении: Профиль → «Уведомления». Отключить: /stop.',
  },
  en: {
    linked: 'Done! Activity Balance reminders will arrive here. Choose what to receive in the app: Profile → “Notifications”. To turn off, send /stop.',
    badCode: 'This link has expired. Open the app: Profile → “Notifications” → “Connect Telegram” and tap the button again.',
    noCode: 'To get reminders, open the Activity Balance app: Profile → “Notifications” → “Connect Telegram”.',
    stopped: 'Telegram reminders are off. You can reconnect in the app: Profile → “Notifications”.',
    help: 'I send Activity Balance reminders. Settings are in the app: Profile → “Notifications”. To turn off, send /stop.',
  },
};

/** Язык ответа бота по языку Telegram, пока мы не знаем пользователя. */
const tgLang = (code: unknown): Lang => (typeof code === 'string' && !code.toLowerCase().startsWith('ru') ? 'en' : 'ru');

/** Секрет вебхука Telegram — производный от токена бота, отдельный секрет заводить не нужно. */
async function webhookSecret(botToken: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ab-webhook:' + botToken)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ======== index.ts ========
// Supabase Edge Function «notify»: веб-пуши и Telegram-бот.
//
// Что делает:
//   • каждые 5 минут (pg_cron, задание ставится само при первом вызове) рассылает напоминания:
//     взвеситься утром, дневник не заполнен, новый комментарий куратора, резервная копия;
//   • отдаёт приложению открытый ключ VAPID (ключи создаются сами и хранятся в базе);
//   • выдаёт ссылку привязки Telegram и отвечает боту (вебхук тоже ставится сам);
//   • присылает тестовое уведомление по кнопке в Профиле.
//
// Настройка (docs/notifications.md): развернуть функцию с выключенной проверкой JWT
// (вход проверяется внутри), для Telegram — секрет TELEGRAM_BOT_TOKEN. Больше ничего.
// Таблицы — миграция 0007_notifications.sql.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const FN_URL = SB_URL.replace(/\/$/, '') + '/functions/v1/notify';
const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:push@activity-balance.app';
const admin: SupabaseClient = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// ---- секреты в базе (таблица notify_secrets, доступна только серверу) ----

async function secret(key: string): Promise<string | null> {
  const { data } = await admin.from('notify_secrets').select('value').eq('key', key).maybeSingle();
  return (data?.value as string) || null;
}

let vapidCache: VapidKeys | null = null;
async function vapid(): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  let v = await secret('vapid');
  if (!v) {
    // первый запуск: создать ключи; если параллельно создал другой экземпляр — взять его ключи
    await admin.from('notify_secrets').upsert({ key: 'vapid', value: JSON.stringify(await generateVapidKeys()) }, { onConflict: 'key', ignoreDuplicates: true });
    v = await secret('vapid');
  }
  vapidCache = JSON.parse(v!) as VapidKeys;
  return vapidCache;
}

// ---- одноразовая настройка: расписание и вебхук ----

let cronDone = false;
async function ensureCron() {
  if (cronDone) return;
  const { error } = await admin.rpc('ensure_notify_cron', { fn_url: FN_URL });
  if (error) console.warn('ensure_notify_cron:', error.message);
  else cronDone = true;
}

async function tg(method: string, body?: unknown): Promise<{ ok: boolean; status: number; result?: any }> {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, status: r.status, result: j.result };
}

let hookDone = false;
let botName = '';
async function ensureTelegram() {
  if (!BOT || hookDone) return;
  const me = await tg('getMe');
  if (me.ok) botName = me.result.username;
  const info = await tg('getWebhookInfo');
  if (!info.ok || info.result?.url !== FN_URL) {
    const r = await tg('setWebhook', { url: FN_URL, secret_token: await webhookSecret(BOT), allowed_updates: ['message'] });
    if (!r.ok) return console.warn('setWebhook failed', r.status);
  }
  hookDone = !!botName;
}

// ---- доставка ----

interface Channels {
  push: { endpoint: string; p256dh: string; auth: string }[];
  chat?: number;
}

async function channelsOf(userIds: string[]): Promise<Map<string, Channels>> {
  const m = new Map<string, Channels>();
  const get = (u: string) => m.get(u) || (m.set(u, { push: [] }), m.get(u)!);
  let q1 = admin.from('push_subscriptions').select('user_id, endpoint, p256dh, auth');
  let q2 = admin.from('telegram_links').select('user_id, chat_id');
  if (userIds.length) {
    q1 = q1.in('user_id', userIds);
    q2 = q2.in('user_id', userIds);
  }
  const [a, b] = await Promise.all([q1, BOT ? q2 : Promise.resolve({ data: [] as any[] })]);
  for (const r of a.data || []) get(r.user_id).push.push(r);
  for (const r of b.data || []) get(r.user_id).chat = Number(r.chat_id);
  return m;
}

async function deliver(userId: string, ch: Channels, msg: Message, lang: Prefs['lang']) {
  let push = 0;
  let telegram = false;
  const keys = ch.push.length ? await vapid() : null;
  for (const s of ch.push) {
    const r = await sendWebPush(s, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }, keys!, SUBJECT).catch(() => 'error' as const);
    if (r === 'ok') push++;
    if (r === 'gone') await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
  }
  if (ch.chat && BOT) {
    const r = await tg('sendMessage', telegramPayload(ch.chat, msg, lang));
    telegram = r.ok;
    // пользователь заблокировал бота — отвязать
    if (r.status === 403) await admin.from('telegram_links').delete().eq('user_id', userId);
  }
  return { push, telegram };
}

async function profiles(ids: string[]): Promise<Map<string, Prefs>> {
  const m = new Map<string, Prefs>();
  if (!ids.length) return m;
  const { data } = await admin.from('profiles').select('id, data').in('id', ids);
  for (const r of data || []) m.set(r.id, normPrefs(r.data?.notify, r.data?.lang));
  for (const id of ids) if (!m.has(id)) m.set(id, normPrefs(null));
  return m;
}

// ---- по расписанию ----

async function tick() {
  const now = new Date();
  const ch = await channelsOf([]);
  const users = [...ch.keys()];
  const prefs = await profiles(users);

  // 1. Напоминания по времени
  const localDate = new Map(users.map((u) => [u, localParts(now, prefs.get(u)!.tz).date]));
  const dates = [...new Set(localDate.values())];
  const days = new Map<string, any>();
  if (users.length) {
    const { data } = await admin.from('day_entries').select('user_id, date, data').in('user_id', users).in('date', dates);
    for (const r of data || []) if (r.date === localDate.get(r.user_id)) days.set(r.user_id, r.data);
  }
  const due = users.flatMap((u) => dueReminders(prefs.get(u)!, now, days.get(u)).map((d) => ({ user_id: u, ...d })));
  let sent = 0;
  if (due.length) {
    // журнал: ушедшее не уходит ещё раз, даже если функцию вызвали дважды
    const { data: fresh } = await admin
      .from('notify_log')
      .upsert(due.map((d) => ({ user_id: d.user_id, ref: d.ref })), { onConflict: 'user_id,ref', ignoreDuplicates: true })
      .select('user_id, ref');
    const ok = new Set((fresh || []).map((r) => r.user_id + '|' + r.ref));
    for (const d of due) {
      if (!ok.has(d.user_id + '|' + d.ref)) continue;
      const p = prefs.get(d.user_id)!;
      await deliver(d.user_id, ch.get(d.user_id)!, message(d.kind, p), p.lang);
      sent++;
    }
  }

  // 2. Новые комментарии куратора (за последние сутки, ещё не отмеченные)
  const { data: cs } = await admin
    .from('day_comments')
    .select('id, client_id, curator_id, date')
    .is('notified_at', null)
    .gte('created_at', new Date(now.getTime() - 86400_000).toISOString())
    .order('created_at')
    .limit(500);
  if (cs?.length) {
    await admin.from('day_comments').update({ notified_at: now.toISOString() }).in('id', cs.map((c) => c.id));
    const names = new Map<string, string>();
    const { data: cur } = await admin.from('curators').select('id, name').in('id', [...new Set(cs.map((c) => c.curator_id))]);
    for (const c of cur || []) names.set(c.id, c.name);
    // несколько комментариев одному клиенту за раз — одно сообщение
    const seen = new Set<string>();
    for (const c of cs) {
      const key = c.client_id + '|' + c.date;
      if (seen.has(key) || !ch.has(c.client_id)) continue;
      seen.add(key);
      const p = prefs.get(c.client_id)!;
      if (!p.comment.on) continue;
      await deliver(c.client_id, ch.get(c.client_id)!, message('comment', p, { curator: names.get(c.curator_id), date: c.date }), p.lang);
      sent++;
    }
  }

  // 3. Уборка
  await admin.from('notify_log').delete().lt('sent_at', new Date(now.getTime() - 90 * 86400_000).toISOString());
  await admin.from('telegram_link_codes').delete().lt('expires_at', now.toISOString());
  return { users: users.length, sent };
}

// ---- Telegram: входящие сообщения ----

async function onTelegram(update: any) {
  const msg = update?.message;
  if (!msg?.chat?.id || msg.chat.type !== 'private') return;
  const chatId = Number(msg.chat.id);
  let lang = tgLang(msg.from?.language_code);
  const reply = (text: string) => tg('sendMessage', { chat_id: chatId, text });
  const c = parseCommand(msg.text);
  if (c.cmd === 'start') {
    if (!c.code) return reply(BOT_REPLIES[lang].noCode);
    const { data: row } = await admin.from('telegram_link_codes').select('user_id, expires_at').eq('code', c.code).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) return reply(BOT_REPLIES[lang].badCode);
    await admin.from('telegram_links').upsert({ user_id: row.user_id, chat_id: chatId, username: msg.from?.username || null, linked_at: new Date().toISOString() });
    await admin.from('telegram_link_codes').delete().eq('user_id', row.user_id);
    lang = (await profiles([row.user_id])).get(row.user_id)!.lang;
    return reply(BOT_REPLIES[lang].linked);
  }
  if (c.cmd === 'stop') {
    await admin.from('telegram_links').delete().eq('chat_id', chatId);
    return reply(BOT_REPLIES[lang].stopped);
  }
  return reply(BOT_REPLIES[lang].help);
}

// ---- вход пользователя ----

async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  ensureCron().catch(() => {});

  // Telegram присылает обновления с секретом в заголовке
  const hook = req.headers.get('x-telegram-bot-api-secret-token');
  if (hook != null) {
    if (!BOT || hook !== (await webhookSecret(BOT))) return new Response('forbidden', { status: 403 });
    await onTelegram(await req.json().catch(() => null)).catch((e) => console.warn('telegram', e));
    return new Response('ok');
  }

  // Приложение: открытый ключ для подписки на пуши и есть ли бот
  if (req.method === 'GET') {
    const v = await vapid();
    return json(200, { vapidKey: v.publicKey, telegram: !!BOT });
  }
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'tick') {
    const s = await secret('cron');
    if (!s || req.headers.get('x-cron-secret') !== s) return json(403, { error: 'forbidden' });
    await ensureTelegram().catch(() => {});
    return json(200, await tick());
  }

  const userId = await userOf(req);
  if (!userId) return json(401, { error: 'auth' });

  if (action === 'tg-link') {
    if (!BOT) return json(503, { error: 'telegram-off' });
    await ensureTelegram();
    if (!botName) return json(503, { error: 'telegram-off' });
    const code = makeLinkCode();
    await admin.from('telegram_link_codes').delete().eq('user_id', userId);
    const { error } = await admin.from('telegram_link_codes').insert({ code, user_id: userId, expires_at: new Date(Date.now() + LINK_CODE_MIN * 60_000).toISOString() });
    if (error) return json(500, { error: 'db' });
    return json(200, { url: `https://t.me/${botName}?start=${code}` });
  }

  if (action === 'test') {
    const p = (await profiles([userId])).get(userId)!;
    const ch = (await channelsOf([userId])).get(userId);
    if (!ch) return json(200, { push: 0, telegram: false });
    return json(200, await deliver(userId, ch, message('test', p), p.lang));
  }

  return json(400, { error: 'action' });
});
