// Слияние без потерь: заполненное значение никогда не затирается пустым (урок синхронизации прототипа).

import type { DayEntry, DayMap } from './types';

export function isBlank(v: unknown): boolean {
  if (v === '' || v == null) return true;
  if (typeof v === 'number') return !Number.isFinite(v);
  if (typeof v === 'object' && !Array.isArray(v))
    return Object.keys(v as object).every((k) => isBlank((v as Record<string, unknown>)[k]));
  return false;
}

/** Объединить запись дня: заполненные поля `incoming` побеждают, пустые — не затирают. */
export function mergeEntry(cur: DayEntry | undefined, incoming: DayEntry | undefined): DayEntry {
  const out: DayEntry = { ...(cur || {}) };
  if (!incoming) return out;
  for (const k of Object.keys(incoming) as (keyof DayEntry)[]) {
    const v = incoming[k];
    if (!isBlank(v)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

export function mergeDays(cur: DayMap, incoming: DayMap): DayMap {
  const out: DayMap = { ...cur };
  for (const d of Object.keys(incoming)) {
    if (isBlank(incoming[d])) continue;
    out[d] = mergeEntry(cur[d], incoming[d]);
  }
  return out;
}

/** Убрать пустые поля, чтобы «нет данных» не хранилось как ноль/пустая строка. */
export function compactEntry(e: DayEntry): DayEntry {
  const out: DayEntry = {};
  for (const k of Object.keys(e) as (keyof DayEntry)[]) {
    const v = e[k];
    if (!isBlank(v)) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
