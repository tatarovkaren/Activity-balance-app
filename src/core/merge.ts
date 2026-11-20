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

/**
 * Перед отправкой дня на сервер: сохранить то, что туда записал Telegram-бот, а это устройство ещё не видело.
 * Бот ставит botAt[поле] = время записи. Если у локальной копии дня то же время (день уже подтянут с сервера) —
 * побеждает локальная правка (в том числе стирание). Если другое — значение бота остаётся.
 * Возвращает запись для отправки; null — день можно удалять (на сервере нет невиданных записей бота).
 */
export function keepBotWrites(local: DayEntry | null | undefined, server: DayEntry | null | undefined): DayEntry | null {
  const bot = server?.botAt;
  if (!bot) return local || null;
  let out: DayEntry | null = local ? { ...local } : null;
  for (const k of Object.keys(bot) as (keyof NonNullable<DayEntry['botAt']>)[]) {
    const at = bot[k];
    if (at == null || local?.botAt?.[k] === at || isBlank(server![k])) continue;
    out = out || {};
    (out as Record<string, unknown>)[k] = server![k];
    out.botAt = { ...out.botAt, [k]: at };
  }
  return out;
}
