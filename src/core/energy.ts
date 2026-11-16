// Формулы расхода энергии (ТЗ v35, раздел 5) с режимом мужчина / женщина.
// Итог = БМР + шаги + тренировка + переваривание. Всё, кроме БМР, — «сверх покоя».

import { ageAt, shiftDate, type ISODate } from './dates';
import type { DayEntry, DayMap, Profile, Sex } from './types';

export const KCAL_PER_KG = 7700;
export const DEFAULT_PACE = 130; // шаг/мин, пока нет своих тренировок с шагами
export const PACE_MIN = 40;
export const PACE_MAX = 200;

export type WorkoutKind = 'none' | 'strength' | 'cardioNoSteps' | 'cardioLegs';

const STRENGTH_RE = /сил|зал|желез|strength|отжим|присед|подтяг|выпад|планк|пресс|собствен|турник|брус|гантел|штанг|гири|гиря/;
const NO_STEP_RE = /вело|bike|плав|бассейн|swim|гребл|rowing|байдар/;

export function classifyWorkout(type: string | undefined, minutes: number | undefined): WorkoutKind {
  if (!(minutes && minutes > 0)) return 'none';
  const t = String(type || '').toLowerCase();
  if (/^\s*нет\s*$/.test(t)) return 'none';
  if (STRENGTH_RE.test(t)) return 'strength';
  if (NO_STEP_RE.test(t)) return 'cardioNoSteps';
  return 'cardioLegs';
}

export function mifflin(sex: Sex, w: number, h: number, age: number): number {
  return 10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161);
}

/** БМР по сухой массе (Кетч — МакАрдл): 370 + 21,6 × сухая масса. */
export function leanMassBmr(w: number, bodyFatPct: number): number {
  return 370 + 21.6 * w * (1 - bodyFatPct / 100);
}

/** Формула Кейтеля, валовые ккал/мин по среднему пульсу. */
export function keytelGross(sex: Sex, hr: number, w: number, age: number): number {
  return sex === 'male'
    ? (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184
    : (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184;
}

export function macroKcal(p?: number, f?: number, c?: number): number | undefined {
  if (p == null && f == null && c == null) return undefined;
  return (p || 0) * 4 + (f || 0) * 9 + (c || 0) * 4;
}

/** Ккал дня: введённые вручную или посчитанные по БЖУ. */
export function dayKcal(e: DayEntry | undefined): number | undefined {
  if (!e) return undefined;
  if (e.kcal != null && e.kcal > 0) return e.kcal;
  const m = macroKcal(e.protein, e.fat, e.carbs);
  return m && m > 0 ? m : undefined;
}

/** Вес из записи дня, а если его нет — ближайший за предыдущие 3 дня. */
export function weightNear(days: DayMap, iso: ISODate): number | undefined {
  for (let i = 0; i < 4; i++) {
    const w = days[shiftDate(iso, -i)]?.weight;
    if (w && w > 0) return w;
  }
  return undefined;
}

/**
 * Личный темп шагов на кардио на ногах = Σ введённых шагов / Σ минут по прошлым дням,
 * ограничение 40–200 шаг/мин; без своих данных — 130.
 */
export class PaceIndex {
  private dates: ISODate[] = [];
  private cumSteps: number[] = [];
  private cumMin: number[] = [];

  constructor(days: DayMap) {
    const list = Object.keys(days)
      .filter((d) => {
        const e = days[d];
        return (
          classifyWorkout(e.workoutType, e.workoutMin) === 'cardioLegs' &&
          e.workoutSteps != null &&
          e.workoutSteps > 0
        );
      })
      .sort();
    let s = 0;
    let m = 0;
    for (const d of list) {
      s += days[d].workoutSteps!;
      m += days[d].workoutMin!;
      this.dates.push(d);
      this.cumSteps.push(s);
      this.cumMin.push(m);
    }
  }

  /** Темп по тренировкам строго до даты iso. */
  paceBefore(iso: ISODate): { pace: number; personal: boolean } {
    let lo = 0;
    let hi = this.dates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid] < iso) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return { pace: DEFAULT_PACE, personal: false };
    const p = this.cumSteps[lo - 1] / this.cumMin[lo - 1];
    return { pace: Math.min(PACE_MAX, Math.max(PACE_MIN, p)), personal: true };
  }
}

export interface EnergyResult {
  bmr: number;
  neat: number;
  train: number;
  tef: number;
  total: number;
  intake: number | undefined;
  weight: number;
  age: number;
  kind: WorkoutKind;
  /** Сколько шагов вычтено из дневных как уже учтённые в тренировке. */
  workoutStepsDeducted: number;
  workoutStepsSource: 'tracker' | 'estimate' | 'none';
  pace: number;
  pacePersonal: boolean;
}

export interface EnergyCtx {
  profile: Pick<Profile, 'sex' | 'birthDate' | 'heightCm' | 'bmrFormula'>;
  /** Вес на случай, если в записи дня его нет. */
  fallbackWeight?: number;
  pace?: { pace: number; personal: boolean };
  /** Последний известный % жира (для БМР по сухой массе). */
  bodyFatPct?: number;
}

export function energyModel(e: DayEntry, iso: ISODate, ctx: EnergyCtx): EnergyResult | null {
  const { sex, heightCm: h, birthDate, bmrFormula } = ctx.profile;
  const age = ageAt(birthDate, iso);
  const w = e.weight && e.weight > 0 ? e.weight : ctx.fallbackWeight;
  if (!(w && w > 0 && h > 0 && age != null)) return null;

  const bmr =
    bmrFormula === 'lean' && ctx.bodyFatPct && ctx.bodyFatPct > 0
      ? leanMassBmr(w, ctx.bodyFatPct)
      : mifflin(sex, w, h, age);

  const min = e.workoutMin || 0;
  const hr = e.hrAvg || 0;
  const kind = classifyWorkout(e.workoutType, min);
  const steps = e.steps || 0;
  const pace = ctx.pace || { pace: DEFAULT_PACE, personal: false };

  // Трекер считает шаги и на орбитреке — их расход уже входит в тренировку, не задваиваем.
  let deducted = 0;
  let source: EnergyResult['workoutStepsSource'] = 'none';
  if (kind === 'cardioLegs') {
    if (e.workoutSteps != null && e.workoutSteps >= 0) {
      deducted = Math.min(steps, e.workoutSteps);
      source = 'tracker';
    } else {
      deducted = Math.min(steps, Math.round(min * pace.pace));
      source = 'estimate';
    }
  }
  const neat = (steps - deducted) * 0.00042 * w; // ≈0,55 ккал/кг/км при шаге ~0,75 м

  let train = 0;
  if (kind === 'strength') {
    train = (3.5 * w * min) / 60; // силовая по нагрузке, не по пульсу
  } else if (kind !== 'none') {
    if (hr > 0) train = Math.max(0, keytelGross(sex, hr, w, age) - bmr / 1440) * min;
    else train = (4 * w * min) / 60;
  }

  const intake = dayKcal(e);
  const P = e.protein || 0;
  const F = e.fat || 0;
  const C = e.carbs || 0;
  const tef = P || F || C ? 0.25 * P * 4 + 0.07 * C * 4 + 0.02 * F * 9 : 0.1 * (intake || 0);

  return {
    bmr,
    neat,
    train,
    tef,
    total: bmr + neat + train + tef,
    intake,
    weight: w,
    age,
    kind,
    workoutStepsDeducted: deducted,
    workoutStepsSource: source,
    pace: pace.pace,
    pacePersonal: pace.personal,
  };
}

/** Средние за окно дней (для блока «7 дней»). */
export function windowStats(
  days: DayMap,
  sel: ISODate,
  n: number,
  model: (e: DayEntry, d: ISODate) => EnergyResult | null,
): { intake: number; total: number; n: number } | null {
  let si = 0;
  let st = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const d = shiftDate(sel, -i);
    const e = days[d];
    if (!e) continue;
    const m = model(e, d);
    if (!m || !(m.intake && m.intake > 0)) continue;
    si += m.intake;
    st += m.total;
    k++;
  }
  return k ? { intake: si / k, total: st / k, n: k } : null;
}
