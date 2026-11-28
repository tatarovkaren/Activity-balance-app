import type { DayMap, DayEntry } from './types';

export type FatSecretDay = { date: string; kcal: number; protein: number; fat: number; carbs: number };
export type FatSecretPreview = { date: string; status: 'new' | 'unchanged' | 'conflict'; incoming: FatSecretDay; existing?: DayEntry };
const fields = ['kcal', 'protein', 'fat', 'carbs'] as const;

/** Pure preview only: no network, mutation or persistence. Existing nutrition is never overwritten. */
export function planFatSecretImport(rows: readonly FatSecretDay[], days: DayMap): FatSecretPreview[] {
  const seen = new Set<string>();
  return rows.map<FatSecretPreview>(row => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) ||
        new Date(row.date).toISOString().slice(0, 10) !== row.date || seen.has(row.date) ||
        fields.some(k => typeof row[k] !== 'number' || !Number.isFinite(row[k]) || row[k] < 0)) {
      throw new Error('Invalid or duplicate FatSecret day');
    }
    seen.add(row.date);
    const existing = days[row.date];
    const occupied = !!existing && (fields.some(k => existing[k] !== undefined) || !!existing.photoMeals?.length);
    const same = occupied && !existing?.photoMeals?.length && fields.every(k => existing?.[k] === row[k]);
    return { date: row.date, status: same ? 'unchanged' : occupied ? 'conflict' : 'new', incoming: {...row}, existing };
  }).sort((a,b) => a.date.localeCompare(b.date));
}

/** Pure staging only. Caller must persist with concurrency protection; never write a stale snapshot. */
export function stageFatSecretImport(rows: readonly FatSecretDay[], latest: DayMap, selectedDates: readonly string[], now: number) {
  if (!Number.isFinite(now) || now <= 0) throw new Error('Invalid timestamp');
  const selected = new Set(selectedDates);
  const preview = planFatSecretImport(rows, latest);
  if (selectedDates.length !== selected.size || [...selected].some(date => !preview.some(p => p.date === date))) throw new Error('Invalid selection');
  const days: DayMap = {...latest};
  const applied: string[] = [], conflicts: string[] = [], unchanged: string[] = [];
  for (const p of preview) {
    if (!selected.has(p.date)) continue;
    if (p.status === 'conflict') { conflicts.push(p.date); continue; }
    if (p.status === 'unchanged') { unchanged.push(p.date); continue; }
    const {kcal,protein,fat,carbs} = p.incoming;
    days[p.date] = {...latest[p.date],kcal,protein,fat,carbs,kcalManual:true,updatedAt:now};
    applied.push(p.date);
  }
  return {days,applied,conflicts,unchanged};
}
