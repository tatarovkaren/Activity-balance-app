// Промокоды кураторов (схема от 18.11.2026).
// Код = фамилия куратора латиницей + сквозной номер по всей системе: IVANOV0001, SMIRNOVA0042.
// Клиент вводит код → привязан к куратору, Премиум бесплатно, пока идёт ведение (место в тарифе куратора).
// Ведение закончилось → клиенту предложение Премиума со скидкой, куратору бонус за каждые 3 оплаты.
// Размер скидки и бонуса — гипотезы, обсудить с куратором.

import { shiftDate, type ISODate } from './dates';

// ---- Тарифы куратора ----

export type CuratorPlan = 'trial' | 'start' | 'pro';
export const CURATOR_PLANS: CuratorPlan[] = ['trial', 'start', 'pro'];

/**
 * Места и общий лимит фото по тарифу (таблица тарифов v3, 18.11.2026):
 * в среднем 6 приёмов пищи в день на клиента, один клиент — не больше 30 в день.
 */
export const CURATOR_LIMITS: Record<CuratorPlan, { seats: number; photosPerDay: number }> = {
  trial: { seats: 2, photosPerDay: 12 },
  start: { seats: 10, photosPerDay: 60 },
  pro: { seats: 50, photosPerDay: 300 },
};
export const PHOTO_PER_CLIENT_MAX = 30;

// ---- Предложение после ведения и бонус куратору (гипотезы) ----

export const REFERRAL = {
  /** Скидка на Премиум для бывшего клиента, %. */
  discountPct: 30,
  /** На сколько месяцев действует скидка. */
  months: 3,
  /** Сколько дней предложение ждёт клиента. */
  validDays: 30,
  /** Месяц тарифа куратору за каждые N оплат. */
  paidPerBonus: 3,
};

// ---- Формат кода ----

const TRANSLIT: Record<string, string> = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z', и: 'I', й: 'Y', к: 'K', л: 'L',
  м: 'M', н: 'N', о: 'O', п: 'P', р: 'R', с: 'S', т: 'T', у: 'U', ф: 'F', х: 'KH', ц: 'TS', ч: 'CH',
  ш: 'SH', щ: 'SHCH', ъ: '', ы: 'Y', ь: '', э: 'E', ю: 'YU', я: 'YA',
  // украинские и белорусские буквы — на случай фамилий из соседних стран
  і: 'I', ї: 'YI', є: 'YE', ґ: 'G', ў: 'U',
};

/** Самая длинная часть фамилии в коде. Длиннее — обрезаем, чтобы код помещался в поле и в ссылку. */
export const SURNAME_MAX = 12;
export const NUMBER_DIGITS = 4;
const CODE_RE = /^([A-Z]{2,12})(\d{4,7})$/;

/** Кириллица → латиница (как в загранпаспорте, но й → Y, ю → YU, я → YA). Остальное — только A–Z. */
export function latinSurname(surname: string): string {
  const out = [...surname.trim().toLowerCase()]
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é → e, ö → o
    .toUpperCase()
    .replace(/[^A-Z]/g, '');
  return out.slice(0, SURNAME_MAX);
}

/** Фамилия годится для кода: после транслитерации хотя бы 2 буквы. */
export function surnameOk(surname: string): boolean {
  return latinSurname(surname).length >= 2;
}

/** Код из фамилии и сквозного номера: ('Иванов', 1) → IVANOV0001. Номер больше 9999 просто длиннее. */
export function makeCode(surname: string, seq: number): string {
  const s = latinSurname(surname);
  if (s.length < 2) throw new Error('surname');
  if (!Number.isInteger(seq) || seq < 1) throw new Error('seq');
  return s + String(seq).padStart(NUMBER_DIGITS, '0');
}

/**
 * Приводит введённое к виду кода: верхний регистр, без пробелов и дефисов. Понимает ссылку-приглашение
 * целиком и код, набранный кириллицей («Иванов0001» → IVANOV0001).
 */
export function normalizeCode(input: string): string {
  const s = input.trim();
  const fromLink = s.match(/(?:#\/invite\/|[?&]code=)([^&#/\s]+)/i);
  const raw = fromLink ? decodeURIComponent(fromLink[1]) : s;
  const letters = raw.match(/^[^\d]*/)?.[0] || '';
  const digits = raw.slice(letters.length).replace(/[\s-]/g, '');
  return latinSurname(letters).slice(0, SURNAME_MAX) + digits;
}

export function isCode(code: string): boolean {
  return CODE_RE.test(code);
}

export function parseCode(code: string): { surname: string; seq: number } | null {
  const m = code.match(CODE_RE);
  return m ? { surname: m[1], seq: Number(m[2]) } : null;
}

/** Ссылка-приглашение. На вебе — адрес приложения + #/invite/КОД. */
export function inviteLink(base: string, code: string): string {
  return base.replace(/#.*$/, '') + '#/invite/' + code;
}

/** Код из адреса страницы (#/invite/КОД или ?code=КОД), если он там есть. */
export function codeFromUrl(url: string): string | null {
  if (!/#\/invite\/|[?&]code=/i.test(url)) return null;
  const c = normalizeCode(url);
  return isCode(c) ? c : null;
}

// ---- Кабинет куратора: кто пришёл по коду ----

export type ReferralStatus = 'active' | 'ended' | 'removed';

export interface Referral {
  /** id клиента (в демо — id демо-клиента, «self» — пользователь этого устройства). */
  id: string;
  name: string;
  linkedAt: ISODate;
  status: ReferralStatus;
  /** Когда закончилось ведение или куратор отвязал клиента. */
  endedAt?: ISODate;
  /** Клиент оформил Премиум со скидкой после ведения — идёт в бонус куратору. */
  paidAt?: ISODate;
}

export interface CuratorAccount {
  /** Фамилия, как её ввёл куратор (для подписи). */
  surname: string;
  /** Имя для клиентов: «Ирина Смирнова». */
  displayName: string;
  code: string;
  plan: CuratorPlan;
  createdAt: ISODate;
  referrals: Referral[];
}

export function activeCount(acc: CuratorAccount): number {
  return acc.referrals.filter((r) => r.status === 'active').length;
}

export function seatsLeft(acc: CuratorAccount): number {
  return Math.max(0, CURATOR_LIMITS[acc.plan].seats - activeCount(acc));
}

/** Бонус куратору: месяц тарифа за каждые 3 оплаты бывших клиентов. */
export function curatorBonus(acc: CuratorAccount) {
  const paid = acc.referrals.filter((r) => r.paidAt).length;
  const n = REFERRAL.paidPerBonus;
  return { paid, months: Math.floor(paid / n), toNext: n - (paid % n) };
}

export type CodeError = 'format' | 'notFound' | 'noSeats' | 'already';

/** Проверка кода перед привязкой. Код работает, только пока у куратора есть свободные места. */
export function checkCode(code: string, acc: CuratorAccount | undefined, clientId: string): CodeError | null {
  if (!isCode(code)) return 'format';
  if (!acc || acc.code !== code) return 'notFound';
  if (acc.referrals.some((r) => r.id === clientId && r.status === 'active')) return 'already';
  if (seatsLeft(acc) <= 0) return 'noSeats';
  return null;
}

/** Клиент пришёл по коду: новая запись или повторная привязка (после отвязки — заново на ведении). */
export function addReferral(acc: CuratorAccount, client: { id: string; name: string }, today: ISODate): CuratorAccount {
  const rest = acc.referrals.filter((r) => r.id !== client.id);
  const prev = acc.referrals.find((r) => r.id === client.id);
  return { ...acc, referrals: [...rest, { id: client.id, name: client.name, linkedAt: today, status: 'active', paidAt: prev?.paidAt }] };
}

export function setReferralStatus(acc: CuratorAccount, id: string, status: Exclude<ReferralStatus, 'active'>, today: ISODate): CuratorAccount {
  return { ...acc, referrals: acc.referrals.map((r) => (r.id === id && r.status === 'active' ? { ...r, status, endedAt: today } : r)) };
}

export function markPaid(acc: CuratorAccount, id: string, today: ISODate): CuratorAccount {
  return { ...acc, referrals: acc.referrals.map((r) => (r.id === id && r.status === 'ended' && !r.paidAt ? { ...r, paidAt: today } : r)) };
}

// ---- Клиент: предложение после ведения ----

export interface ReferralOffer {
  curatorName: string;
  code: string;
  discountPct: number;
  months: number;
  /** До какого дня можно оформить. */
  until: ISODate;
  /** Оформил (оплата пока не подключена — отметка для пилота). */
  acceptedAt?: ISODate;
  /** Скидка действует до (включительно). */
  discountUntil?: ISODate;
}

export function makeOffer(curatorName: string, code: string, today: ISODate): ReferralOffer {
  return { curatorName, code, discountPct: REFERRAL.discountPct, months: REFERRAL.months, until: shiftDate(today, REFERRAL.validDays) };
}

export function offerOpen(o: ReferralOffer | undefined, today: ISODate): boolean {
  return !!o && !o.acceptedAt && today <= o.until;
}
