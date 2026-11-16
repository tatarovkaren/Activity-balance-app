// Форматирование чисел и дат по языку. Правила языка (разделители, месяцы, порядок даты) лежат
// в словаре (раздел fmt), здесь — общие функции. Intl не используется: на Android (Hermes) его
// поддержка неполная, а так формат одинаковый на всех платформах.
// Даты — только по местному времени: строка ГГГГ-ММ-ДД разбирается без toISOString (урок прототипа).

import type { ISODate } from '../core/dates';

export interface FmtSpec {
  /** Десятичный разделитель: «,» в русском, «.» в английском. */
  decimal: string;
  /** Разделитель тысяч. */
  group: string;
  /** Знак минуса (типографский «−»). */
  minus: string;
  weekdays: string[]; // с воскресенья, как Date.getDay()
  /** Короткая дата без года: «16.11» / «Nov 16». m — с 1. */
  dm: (d: number, m: number) => string;
  /** Полная дата: «16.11.2026» / «Nov 16, 2026». */
  dmy: (d: number, m: number, y: number) => string;
  /** Дата словами без года: «16 ноября» / «November 16». */
  longDate: (d: number, m: number) => string;
  /** Как показывать дату в поле ввода (и подсказка формата). Разбор — normDate из importers. */
  dateInput: (d: number, m: number, y: number) => string;
  dateInputPlaceholder: string;
}

export interface Fmt {
  decimal: string;
  /** Число с заданным числом знаков, без разделителя тысяч: 72,5 / 72.5. */
  num: (v: number, digits?: number) => string;
  /** Целое с разделителем тысяч: 12 000 / 12,000. */
  int: (v: number) => string;
  /** Со знаком: +0,25 / −0,40. */
  signed: (v: number, digits?: number) => string;
  /** Число для поля ввода (без лишних нулей), пусто — ''. */
  input: (v: number | undefined, digits?: number) => string;
  dm: (iso: ISODate) => string;
  dmy: (iso: ISODate) => string;
  longDate: (iso: ISODate) => string;
  weekday: (iso: ISODate) => string;
  dateInput: (iso: ISODate) => string;
  dateInputPlaceholder: string;
}

const parts = (iso: ISODate) => iso.split('-').map(Number) as [number, number, number];

export function makeFmt(s: FmtSpec): Fmt {
  const num = (v: number, digits = 1) => {
    const str = v.toFixed(digits);
    return (str.startsWith('-') ? s.minus + str.slice(1) : str).replace('.', s.decimal);
  };
  const int = (v: number) => {
    const r = Math.round(v);
    const abs = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, s.group);
    return (r < 0 ? s.minus : '') + abs;
  };
  return {
    decimal: s.decimal,
    num,
    int,
    signed: (v, digits = 2) => (v > 0 ? '+' : s.minus) + num(Math.abs(v), digits),
    input: (v, digits) => (v == null ? '' : (digits != null ? v.toFixed(digits) : String(v)).replace('.', s.decimal)),
    dm: (iso) => {
      const [, m, d] = parts(iso);
      return s.dm(d, m);
    },
    dmy: (iso) => {
      const [y, m, d] = parts(iso);
      return s.dmy(d, m, y);
    },
    longDate: (iso) => {
      const [, m, d] = parts(iso);
      return s.longDate(d, m);
    },
    weekday: (iso) => {
      const [y, m, d] = parts(iso);
      return s.weekdays[new Date(y, m - 1, d, 12).getDay()];
    },
    dateInput: (iso) => {
      const [y, m, d] = parts(iso);
      return s.dateInput(d, m, y);
    },
    dateInputPlaceholder: s.dateInputPlaceholder,
  };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
