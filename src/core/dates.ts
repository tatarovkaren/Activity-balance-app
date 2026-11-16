// Даты только по местному времени. Никогда не использовать toISOString() для строки даты:
// в Москве (UTC+3) она откатывает дату на сутки (урок прототипа).

export type ISODate = string; // 'ГГГГ-ММ-ДД'

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalISO(d: Date): ISODate {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function todayISO(now: Date = new Date()): ISODate {
  return toLocalISO(now);
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Полдень местного времени — устойчиво к переходам на летнее время. */
export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function shiftDate(iso: ISODate, delta: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + delta);
  return toLocalISO(d);
}

export function dayDiff(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

/** Тот же день следующего месяца; если такого дня нет — последний день месяца. */
export function addMonthsClamped(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(d, last));
  return toLocalISO(target);
}

export function ageAt(birthDate: ISODate | undefined, iso: ISODate): number | null {
  if (!birthDate || !isISODate(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age >= 0 ? age : null;
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = dayDiff(from, to);
  for (let i = 0; i <= n; i++) out.push(shiftDate(from, i));
  return out;
}

// Форматирование дат для интерфейса (по языку) — в src/i18n/format.ts.
