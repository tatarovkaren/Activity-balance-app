// Импорт резервной копии прототипа «Ежедневный отчёт» (артефакт, ТЗ v32–v36).
//
// Формат файла: { app: "daily-report", owner, version: 1, exportedAt, data: { "<owner>_<ключ>": "<JSON-строка>" } }.
// Ключи берутся по окончанию, без префикса владельца:
//   daily_entries_v1   — дни: weightToday/Yesterday, steps, protein/fat/carbs, kcalOut (съедено), trainType (текст),
//                        trainMin, trainSteps, hrAvg/hrMax, comment, wellbeing, anomalyType;
//   weight_history_v1, steps_history_v1 — дата → значение; bodyfat_history_v1 — дата → { bf, neck, waist, hips };
//   anomaly_keep_v1    — автоматически найденные необычные дни, возвращённые в расчёт;
//   daily_report_v2/v1 — черновик экрана (последний день) + weightGoal, stepsGoal.
// Числа бывают с запятой («71,6»), пустая строка = нет данных. Даты — ключи ГГГГ-ММ-ДД, как есть (местные).

import { isISODate, shiftDate, type ISODate } from './dates';
import { compactEntry, isBlank } from './merge';
import { ANOMALY_REASONS, type AnomalyReason, type DayEntry, type DayMap, type KeepMap, type Profile } from './types';

export const REPORT_APP = 'daily-report';

export interface ReportImport {
  days: DayMap;
  keep: KeepMap;
  goalWeightKg?: number;
  stepGoal?: number;
}

export type ReportParse = { ok: true; report: ReportImport } | { ok: false; error: 'backupUnreadable' | 'backupNotOurs' };

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\s ]/g, '').replace(',', '.');
  if (!s) return undefined;
  const x = parseFloat(s);
  return Number.isFinite(x) ? x : undefined;
};
const inRange = (v: number | undefined, min: number, max: number) => (v != null && v >= min && v <= max ? v : undefined);
const r1 = (v: number | undefined) => (v == null ? undefined : Math.round(v * 10) / 10);
const r2 = (v: number | undefined) => (v == null ? undefined : Math.round(v * 100) / 100);
const int = (v: number | undefined) => (v == null ? undefined : Math.round(v));

const REST_RE = /^(отдых|выходной|нет|rest|none|no|off)(?=$|[\s,.:;!—-])/i;
const STRENGTH_RE = /сил|зал|желез|strength|gym|lift/i;
const CARDIO_RE = /кардио|эллипс|орбитр|бег|ходьб|вело|плав|гребл|степп|cardio|ellip|run|walk|bike|cycl|swim|row/i;

/** «Силовая», «Кардио/эллипс», «Отдых, досыпал» → вид и название тренировки. Отдых — тренировки нет. */
export function mapTrainType(raw: unknown): { workoutKind?: 'cardio' | 'strength'; workoutType?: string } {
  const t = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!t || REST_RE.test(t)) return {};
  if (STRENGTH_RE.test(t)) return { workoutKind: 'strength', workoutType: t };
  if (CARDIO_RE.test(t)) return { workoutKind: 'cardio', workoutType: t };
  return { workoutType: t }; // вид определится по названию (core/energy.ts)
}

const ANOMALY_TEXT: [RegExp, AnomalyReason][] = [
  [/поезд|trip|travel/i, 'trip'],
  [/застол|праздн|feast|party/i, 'feast'],
  [/болез|болел|ill|sick/i, 'illness'],
  [/неполн|incomplete/i, 'incomplete'],
  [/цикл|cycle|period/i, 'cycle'],
  [/друг|other/i, 'other'],
];
function mapAnomaly(raw: unknown): AnomalyReason | undefined {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (!t) return undefined;
  if ((ANOMALY_REASONS as string[]).includes(t)) return t as AnomalyReason;
  return ANOMALY_TEXT.find(([re]) => re.test(t))?.[1] ?? 'other';
}

/** Запись дня прототипа → запись приложения (пустые поля не попадают). */
export function mapReportDay(e: Record<string, unknown>): DayEntry {
  const train = mapTrainType(e.trainType);
  const min = inRange(int(num(e.trainMin)), 1, 600);
  const p = r1(inRange(num(e.protein), 0, 1000));
  const f = r1(inRange(num(e.fat), 0, 1000));
  const c = r1(inRange(num(e.carbs), 0, 2000));
  const kcal = int(inRange(num(e.kcalOut ?? e.kcal), 1, 15000));
  const wb = int(num(e.wellbeing));
  const comment = typeof e.comment === 'string' ? e.comment.trim() : '';
  const out: DayEntry = {
    weight: r2(inRange(num(e.weightToday ?? e.weight), 25, 350)),
    steps: int(inRange(num(e.steps), 0, 200000)),
    protein: p,
    fat: f,
    carbs: c,
    kcal,
    kcalManual: kcal != null ? true : undefined,
    ...train,
    workoutMin: train.workoutType ? min : undefined,
    workoutSteps: train.workoutType ? int(inRange(num(e.trainSteps), 1, 100000)) : undefined,
    hrAvg: int(inRange(num(e.hrAvg), 30, 250)),
    hrMax: int(inRange(num(e.hrMax), 30, 250)),
    comment: comment || undefined,
    wellbeing: wb != null && wb >= 1 && wb <= 10 ? wb : undefined,
    anomaly: mapAnomaly(e.anomalyType),
  };
  // «Отдых, досыпал» — пометка дня, а не тренировка: в комментарий, если он пуст
  if (!out.comment && !train.workoutType && typeof e.trainType === 'string') {
    const rest = e.trainType.replace(/^\s*(отдых|выходной|rest)\s*[,.:;—-]*\s*/i, '').trim();
    if (rest) out.comment = rest;
  }
  return compactEntry(out);
}

function parseJsonValue(v: unknown): any {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/** Значение data по окончанию ключа (без префикса владельца: karen_daily_entries_v1 → daily_entries_v1). */
function pick(data: Record<string, unknown>, suffix: string): any {
  const k = Object.keys(data).find((x) => x === suffix || x.endsWith('_' + suffix));
  return k ? parseJsonValue(data[k]) : undefined;
}

/** Дополнить запись: только пустые поля `cur` заполняются из `add`. */
function fillGaps(cur: DayEntry | undefined, add: DayEntry): DayEntry {
  const out: DayEntry = { ...(cur || {}) };
  for (const k of Object.keys(add) as (keyof DayEntry)[]) {
    if (isBlank(out[k]) && !isBlank(add[k])) (out as Record<string, unknown>)[k] = add[k];
  }
  return out;
}

export function isReportBackup(j: any): boolean {
  return !!j && j.app === REPORT_APP && !!j.data && typeof j.data === 'object';
}

export function parseReportBackup(text: string): ReportParse {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'backupUnreadable' };
  }
  if (!isReportBackup(j)) return { ok: false, error: 'backupNotOurs' };
  const data = j.data as Record<string, unknown>;
  const days: DayMap = {};
  const put = (d: string, e: DayEntry) => {
    if (!isISODate(d) || isBlank(e)) return;
    days[d] = fillGaps(days[d], e);
  };

  // 1) дни; черновики экрана — ниже приоритетом (в истории тот же день обычно уже есть)
  const entries = pick(data, 'daily_entries_v1');
  const drafts = [pick(data, 'daily_report_v2'), pick(data, 'daily_report_v1')].filter((x) => x && typeof x === 'object');
  if (entries && typeof entries === 'object')
    for (const [d, e] of Object.entries(entries)) if (e && typeof e === 'object') put(d, mapReportDay(e as Record<string, unknown>));
  for (const dr of drafts) if (isISODate(dr.date)) put(dr.date, mapReportDay(dr));

  // 2) «вес вчера» — вес предыдущего дня, если он не записан
  const yest: [ISODate, number][] = [];
  if (entries && typeof entries === 'object')
    for (const [d, e] of Object.entries(entries) as [string, any][]) {
      const w = r2(inRange(num(e?.weightYesterday), 25, 350));
      if (isISODate(d) && w) yest.push([d, w]);
    }
  for (const dr of drafts) {
    const w = r2(inRange(num(dr.weightYesterday), 25, 350));
    if (isISODate(dr.date) && w) yest.push([dr.date, w]);
  }

  // 3) истории веса, шагов и замеров тела
  const wh = pick(data, 'weight_history_v1');
  if (wh && typeof wh === 'object')
    for (const [d, v] of Object.entries(wh)) {
      const w = r2(inRange(num(v), 25, 350));
      if (w) put(d, { weight: w });
    }
  for (const [d, w] of yest) put(shiftDate(d, -1), { weight: w });
  const sh = pick(data, 'steps_history_v1');
  if (sh && typeof sh === 'object')
    for (const [d, v] of Object.entries(sh)) {
      const s = int(inRange(num(v), 0, 200000));
      if (s != null) put(d, { steps: s });
    }
  const bh = pick(data, 'bodyfat_history_v1');
  if (bh && typeof bh === 'object')
    for (const [d, v] of Object.entries(bh) as [string, any][]) {
      if (!v || typeof v !== 'object') continue;
      put(d, compactEntry({
        neck: r1(inRange(num(v.neck), 20, 70)),
        waist: r1(inRange(num(v.waist), 40, 200)),
        hips: r1(inRange(num(v.hips), 50, 200)),
      }));
    }

  // 4) возвращённые в расчёт дни и цели
  const keep: KeepMap = {};
  const kp = pick(data, 'anomaly_keep_v1');
  if (kp && typeof kp === 'object') for (const [d, v] of Object.entries(kp)) if (v && isISODate(d)) keep[d] = true;
  const report = drafts[0] || {};
  const goalWeightKg = r1(inRange(num(report.weightGoal), 25, 350));
  const stepGoal = int(inRange(num(report.stepsGoal), 1000, 100000));

  if (!Object.keys(days).length) return { ok: false, error: 'backupNotOurs' };
  return { ok: true, report: { days, keep, goalWeightKg, stepGoal } };
}

export interface ReportApply {
  days: DayMap;
  keep: KeepMap;
  profile: Partial<Profile>;
  /** Дней в файле / новых дней / дней, где что-то дописано. */
  total: number;
  added: number;
  filled: number;
  from?: ISODate;
  to?: ISODate;
}

/**
 * Перенос в приложение: данные из файла только дополняют то, что уже есть. Заполненное в приложении
 * не затирается (пустое тоже). Цели — только если в профиле их нет (шаги — пока стоит значение по умолчанию).
 */
export function applyReport(cur: DayMap, curKeep: KeepMap, profile: Profile, r: ReportImport, defaultStepGoal: number): ReportApply {
  const days: DayMap = { ...cur };
  let added = 0;
  let filled = 0;
  const now = Date.now();
  for (const [d, e] of Object.entries(r.days)) {
    const before = cur[d];
    const next = fillGaps(before, e);
    const changed = Object.keys(next).length !== Object.keys(before || {}).length;
    if (!changed) continue;
    days[d] = { ...next, updatedAt: now };
    before && !isBlank(before) ? filled++ : added++;
  }
  const patch: Partial<Profile> = {};
  if (r.goalWeightKg && !profile.goalWeightKg) patch.goalWeightKg = r.goalWeightKg;
  if (r.stepGoal && profile.stepGoal === defaultStepGoal) patch.stepGoal = r.stepGoal;
  const ds = Object.keys(r.days).sort();
  return { days, keep: { ...r.keep, ...curKeep }, profile: patch, total: ds.length, added, filled, from: ds[0], to: ds[ds.length - 1] };
}
