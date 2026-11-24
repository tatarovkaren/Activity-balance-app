// Заявка «Хочу куратора»: клиент без куратора оставляет цель, контакт и пару слов о себе,
// заявка уходит письмом команде (сервис форм Web3Forms — без своего сервера).
// Ключ формы — одна настройка: CURATOR_FORM_KEY ниже или EXPO_PUBLIC_CURATOR_FORM_KEY при сборке.
// Ключ Web3Forms не секретный: по нему можно только отправить письмо на почту, указанную при его создании.
// Подбора куратора пока нет: заявку разбирают вручную. Описание — docs/curator-request.md.

/** Ключ доступа Web3Forms (вида 1a2b3c4d-…). Пусто = отправка не настроена, форма работает как демо. */
export const CURATOR_FORM_KEY = '';

export const CURATOR_FORM_URL = 'https://api.web3forms.com/submit';

export function curatorFormKey(): string {
  const env = (process.env.EXPO_PUBLIC_CURATOR_FORM_KEY || '').trim();
  return normKey(env || CURATOR_FORM_KEY);
}

/** Ключ Web3Forms — UUID; всё остальное считаем «не задан». */
export function normKey(s: string): string {
  const v = s.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v.toLowerCase() : '';
}

export const REQUEST_GOALS = ['lose', 'gain', 'keep', 'other'] as const;
export type RequestGoal = (typeof REQUEST_GOALS)[number];
export const CONTACT_KINDS = ['telegram', 'email', 'phone'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** Сколько символов «о себе» отправляем (дальше обрезаем). */
export const ABOUT_MAX = 1000;

export type CuratorRequest = {
  goal: RequestGoal;
  name: string;
  contactKind: ContactKind;
  contact: string;
  about: string;
  /** Данные профиля — только если клиент поставил галочку «приложить». */
  profile?: { sex?: 'male' | 'female'; age?: number | null; heightCm?: number; weightKg?: number | null; goalWeightKg?: number };
  /** Служебное: язык интерфейса, версия, режим входа, дата по местному времени. */
  meta: { lang: string; version: string; mode: string; date: string };
};

/** Контакт к единому виду: @имя для Telegram, почта в нижнем регистре, телефон +цифры. '' = не похоже на контакт. */
export function normContact(kind: ContactKind, raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (kind === 'telegram') {
    const m = v.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{5,32})\/?$/i) || v.match(/^@?([A-Za-z0-9_]{5,32})$/);
    return m ? '@' + m[1] : '';
  }
  if (kind === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v.toLowerCase() : '';
  const digits = v.replace(/[\s()\-.]/g, '');
  if (!/^\+?\d{10,15}$/.test(digits)) return '';
  // российский номер без «+»: 8XXXXXXXXXX → +7XXXXXXXXXX
  if (/^8\d{10}$/.test(digits)) return '+7' + digits.slice(1);
  return digits.startsWith('+') ? digits : '+' + digits;
}

export type RequestProblem = 'contact' | 'consent';

/** Что мешает отправить: пустой/неверный контакт, нет согласия. */
export function checkRequest(r: Pick<CuratorRequest, 'contactKind' | 'contact'>, consent: boolean): RequestProblem | null {
  if (!normContact(r.contactKind, r.contact)) return 'contact';
  if (!consent) return 'consent';
  return null;
}

const GOAL_RU: Record<RequestGoal, string> = { lose: 'снизить вес', gain: 'набрать массу', keep: 'держать вес', other: 'другое' };
const CONTACT_RU: Record<ContactKind, string> = { telegram: 'Telegram', email: 'почта', phone: 'телефон' };

const num = (v: number) => String(Math.round(v * 10) / 10).replace('.', ',');

/** Тема письма: «Хочу куратора: Алекс · снизить вес». */
export function requestSubject(r: CuratorRequest): string {
  return 'Хочу куратора: ' + (r.name.trim() || 'без имени') + ' · ' + GOAL_RU[r.goal];
}

/** Текст письма (всегда по-русски: читает команда). */
export function requestText(r: CuratorRequest): string {
  const rows: string[] = [];
  rows.push('Цель: ' + GOAL_RU[r.goal]);
  rows.push('Имя: ' + (r.name.trim() || '—'));
  rows.push('Связаться: ' + CONTACT_RU[r.contactKind] + ' ' + (normContact(r.contactKind, r.contact) || r.contact.trim()));
  const about = r.about.trim().slice(0, ABOUT_MAX);
  rows.push('', 'О себе:', about || '—');
  const p = r.profile;
  if (p) {
    const parts: string[] = [];
    if (p.sex) parts.push(p.sex === 'male' ? 'мужчина' : 'женщина');
    if (p.age != null) parts.push(p.age + ' лет');
    if (p.heightCm) parts.push('рост ' + num(p.heightCm) + ' см');
    if (p.weightKg != null) parts.push('вес ' + num(p.weightKg) + ' кг');
    if (p.goalWeightKg) parts.push('цель ' + num(p.goalWeightKg) + ' кг');
    if (parts.length) rows.push('', 'Из профиля: ' + parts.join(', '));
  }
  rows.push('', '—', 'Activity Balance ' + r.meta.version + ' · ' + r.meta.mode + ' · язык: ' + r.meta.lang + ' · ' + r.meta.date);
  rows.push('Клиент согласился передать эти данные для подбора куратора.');
  return rows.join('\n');
}

/** Тело запроса к Web3Forms. botcheck — ловушка для ботов, у людей всегда пустая. */
export function web3formsBody(key: string, r: CuratorRequest): Record<string, string | boolean> {
  const body: Record<string, string | boolean> = {
    access_key: key,
    subject: requestSubject(r),
    from_name: 'Activity Balance',
    name: r.name.trim() || 'Без имени',
    message: requestText(r),
    botcheck: false,
  };
  const email = r.contactKind === 'email' ? normContact('email', r.contact) : '';
  if (email) {
    body.email = email;
    body.replyto = email;
  }
  return body;
}

export type SendResult = { ok: true } | { ok: false; reason: 'notConfigured' | 'network' | 'rejected'; detail?: string };

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Отправить заявку письмом. Без ключа — notConfigured (демо). */
export async function sendCuratorRequest(r: CuratorRequest, key = curatorFormKey(), fetchFn: FetchLike = fetch as unknown as FetchLike): Promise<SendResult> {
  if (!key) return { ok: false, reason: 'notConfigured' };
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchFn(CURATOR_FORM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(web3formsBody(key, r)),
    });
  } catch (e) {
    return { ok: false, reason: 'network', detail: String((e as Error)?.message || e) };
  }
  let data: { success?: boolean; message?: string } = {};
  try {
    data = ((await res.json()) || {}) as typeof data;
  } catch {
    /* не JSON */
  }
  if (res.ok && data.success !== false) return { ok: true };
  return { ok: false, reason: 'rejected', detail: data.message || 'HTTP ' + res.status };
}
