// % жира по ВМС США, нормы по возрасту и график замеров.

import { addMonthsClamped, dayDiff, shiftDate, type ISODate } from './dates';
import type { DayMap, MeasureFreq, Sex } from './types';

export function navyBodyFat(
  sex: Sex,
  m: { neck?: number; waist?: number; hips?: number },
  heightCm: number,
): number | null {
  const { neck, waist, hips } = m;
  if (!(neck && waist && heightCm)) return null;
  if (sex === 'male') {
    if (waist - neck <= 0) return null;
    const v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
    return Number.isFinite(v) && v > 0 && v < 70 ? v : null;
  }
  if (!hips || waist + hips - neck <= 0) return null;
  const v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450;
  return Number.isFinite(v) && v > 0 && v < 70 ? v : null;
}

/**
 * Норма % жира по возрасту. Мужские — из ТЗ прототипа; женские — ориентир,
 * перед запуском сверить с источником (как сказано в плане).
 */
export function bodyFatNorm(sex: Sex, age: number): [number, number] {
  const male: [number, [number, number]][] = [
    [30, [7, 17]],
    [40, [12, 21]],
    [50, [14, 23]],
    [60, [16, 24]],
    [999, [17, 25]],
  ];
  const female: [number, [number, number]][] = [
    [30, [16, 24]],
    [40, [17, 25]],
    [50, [19, 28]],
    [60, [22, 31]],
    [999, [22, 33]],
  ];
  const t = sex === 'male' ? male : female;
  for (const [lim, r] of t) if (age < lim) return r;
  return t[t.length - 1][1];
}

/** Варианты частоты замеров. Подписи — в словарях src/i18n. */
export const MEASURE_FREQS: MeasureFreq[] = ['week', '2weeks', 'month'];

export function hasMeasurement(e: { neck?: number; waist?: number; hips?: number } | undefined): boolean {
  return !!(e && (e.neck || e.waist || e.hips));
}

export function nextMeasureDate(last: ISODate, freq: MeasureFreq): ISODate {
  if (freq === 'week') return shiftDate(last, 7);
  if (freq === '2weeks') return shiftDate(last, 14);
  return addMonthsClamped(last, 1);
}

export type MeasureHint =
  | { kind: 'none' }
  | { kind: 'first' }
  | { kind: 'next'; date: ISODate; inDays: number }
  | { kind: 'due'; last: ISODate; agoDays: number };

export function measureHint(days: DayMap, sel: ISODate, freq: MeasureFreq): MeasureHint {
  if (hasMeasurement(days[sel])) return { kind: 'none' };
  const last = Object.keys(days)
    .filter((d) => d <= sel && hasMeasurement(days[d]))
    .sort()
    .pop();
  if (!last) return { kind: 'first' };
  const next = nextMeasureDate(last, freq);
  if (next > sel) return { kind: 'next', date: next, inDays: dayDiff(sel, next) };
  return { kind: 'due', last, agoDays: dayDiff(last, sel) };
}

/** Последний % жира на дату (для БМР по сухой массе и графиков). */
export function lastBodyFat(days: DayMap, sel: ISODate, sex: Sex, heightCm: number): number | undefined {
  const ds = Object.keys(days)
    .filter((d) => d <= sel && hasMeasurement(days[d]))
    .sort()
    .reverse();
  for (const d of ds) {
    const v = navyBodyFat(sex, days[d], heightCm);
    if (v != null) return v;
  }
  return undefined;
}
