import type { DayEntry } from './types';
export type DayBaseline = { owner: string; entries: Record<string, DayEntry | null> };
export function rememberBaseline(journal: DayBaseline, owner: string, date: string, base: DayEntry | null): DayBaseline {
  if (!owner || journal.owner !== owner) throw new Error('Diary owner mismatch');
  if (Object.prototype.hasOwnProperty.call(journal.entries, date)) return journal;
  return { owner, entries: { ...journal.entries, [date]: base === null ? null : JSON.parse(JSON.stringify(base)) as DayEntry } };
}
export function requireBaseline(journal: DayBaseline, owner: string, date: string): DayEntry | null {
  if (!owner || journal.owner !== owner || !Object.prototype.hasOwnProperty.call(journal.entries, date)) throw new Error('Missing verified diary baseline');
  return journal.entries[date];
}
