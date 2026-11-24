import { describe, expect, it } from 'vitest';
import { checkRequest, normContact, normKey, requestSubject, requestText, sendCuratorRequest, web3formsBody, type CuratorRequest } from '.';

const KEY = '1a2b3c4d-0000-4111-8222-123456789abc';
const req = (over: Partial<CuratorRequest> = {}): CuratorRequest => ({
  goal: 'lose',
  name: 'Алекс',
  contactKind: 'telegram',
  contact: 't.me/alex_fit',
  about: 'Хожу в зал 2 раза в неделю',
  meta: { lang: 'Русский', version: '0.41.0', mode: 'демо', date: '24.11.2026' },
  ...over,
});

describe('заявка «Хочу куратора»', () => {
  it('контакт приводится к одному виду', () => {
    expect(normContact('telegram', '@alex_fit')).toBe('@alex_fit');
    expect(normContact('telegram', 'https://t.me/alex_fit')).toBe('@alex_fit');
    expect(normContact('telegram', 'al')).toBe('');
    expect(normContact('email', ' Alex@Mail.RU ')).toBe('alex@mail.ru');
    expect(normContact('email', 'alex@')).toBe('');
    expect(normContact('phone', '8 (900) 123-45-67')).toBe('+79001234567');
    expect(normContact('phone', '+49 151 2345 6789')).toBe('+4915123456789');
    expect(normContact('phone', '123')).toBe('');
  });
  it('без контакта или согласия не отправляем', () => {
    expect(checkRequest({ contactKind: 'email', contact: 'x' }, true)).toBe('contact');
    expect(checkRequest({ contactKind: 'telegram', contact: '@alex_fit' }, false)).toBe('consent');
    expect(checkRequest({ contactKind: 'telegram', contact: '@alex_fit' }, true)).toBeNull();
  });
  it('ключ формы — только UUID', () => {
    expect(normKey(' ' + KEY.toUpperCase() + ' ')).toBe(KEY);
    expect(normKey('my-key')).toBe('');
    expect(normKey('')).toBe('');
  });
  it('письмо: тема, цель, контакт, цифры профиля только по галочке', () => {
    expect(requestSubject(req())).toBe('Хочу куратора: Алекс · снизить вес');
    const plain = requestText(req());
    expect(plain).toContain('Связаться: Telegram @alex_fit');
    expect(plain).toContain('Хожу в зал');
    expect(plain).not.toContain('Из профиля');
    const withP = requestText(req({ profile: { sex: 'male', age: 35, heightCm: 180, weightKg: 71.8, goalWeightKg: 70 } }));
    expect(withP).toContain('Из профиля: мужчина, 35 лет, рост 180 см, вес 71,8 кг, цель 70 кг');
  });
  it('почта клиента — адрес для ответа', () => {
    const b = web3formsBody(KEY, req({ contactKind: 'email', contact: 'Alex@mail.ru' }));
    expect(b.access_key).toBe(KEY);
    expect(b.replyto).toBe('alex@mail.ru');
    expect(b.botcheck).toBe(false);
    expect(web3formsBody(KEY, req()).replyto).toBeUndefined();
  });
  it('отправка: без ключа — демо, ответ сервиса разбирается', async () => {
    expect(await sendCuratorRequest(req(), '')).toEqual({ ok: false, reason: 'notConfigured' });
    let sent: { url: string; body: Record<string, unknown> } | null = null;
    const ok = await sendCuratorRequest(req(), KEY, async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return { ok: true, status: 200, json: async () => ({ success: true }) };
    });
    expect(ok).toEqual({ ok: true });
    expect(sent!.url).toBe('https://api.web3forms.com/submit');
    expect(sent!.body.subject).toContain('Хочу куратора');
    const bad = await sendCuratorRequest(req(), KEY, async () => ({ ok: false, status: 400, json: async () => ({ success: false, message: 'Invalid access key' }) }));
    expect(bad).toEqual({ ok: false, reason: 'rejected', detail: 'Invalid access key' });
    const off = await sendCuratorRequest(req(), KEY, async () => {
      throw new Error('Failed to fetch');
    });
    expect(off.ok).toBe(false);
    expect(!off.ok && off.reason).toBe('network');
  });
});
