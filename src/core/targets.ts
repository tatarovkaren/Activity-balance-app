// Режим и цели по калориям и БЖУ (ТЗ v36, раздел 8 — только для приложения).
// Одна планка на все дни: ккал = «расход по факту» ± темп; белок от сухой массы, жиры 0,8 г/кг,
// углеводы — остаток. Планка пересчитывается по понедельникам, при смене режима и по кнопке
// «пересчитать сейчас»; внутри недели не меняется. Ядро отдаёт числа и коды, тексты — в src/i18n.

import { adaptiveTDEE, makeDayModel, type AdaptiveResult, type Reliability } from './adaptive';
import { ageAt, dayDiff, parseISO, shiftDate, type ISODate } from './dates';
import { lastBodyFat } from './body';
import { KCAL_PER_KG, mifflin } from './energy';
import type { DayMap, KeepMap, Profile, Sex } from './types';

export type GoalMode = 'deficit' | 'maintain' | 'surplus';
export const GOAL_MODES: GoalMode[] = ['deficit', 'maintain', 'surplus'];

/** Готовые темпы, % веса в неделю. */
export const PACE_PRESETS: Record<'deficit' | 'surplus', number[]> = {
  deficit: [0.25, 0.5, 0.75, 1.0],
  surplus: [0.1, 0.25],
};
export const DEFAULT_PACE_PCT: Record<'deficit' | 'surplus', number> = { deficit: 0.5, surplus: 0.1 };
/** Свой темп — в пределах готовых. */
export const PACE_LIMITS: Record<'deficit' | 'surplus', [number, number]> = { deficit: [0.25, 1.0], surplus: [0.1, 0.25] };
/** Предел темпа, когда он считается от даты цели: дальше — «к дате не успеть». */
export const DATE_PACE_MAX: Record<'deficit' | 'surplus', number> = { deficit: 1.0, surplus: 0.5 };

/** Белок, г на кг сухой массы. */
export const PROTEIN_DEFAULT: Record<GoalMode, number> = { deficit: 2.0, maintain: 1.8, surplus: 1.8 };
export const PROTEIN_LIMITS: [number, number] = [1.6, 3.0];
/** Без замеров — г на кг общего веса (по умолчанию 1,6; свой коэффициент 1,6–3,0, как и на сухую массу — решение Карэна 19.11.2026). */
export const PROTEIN_NO_MEASURE = 1.6;
export const PROTEIN_WEIGHT_LIMITS: [number, number] = [1.6, 3.0];
/** Своя планка калорий, ккал/день: в этих пределах (ниже всё равно действует безопасный минимум). */
export const KCAL_MANUAL_LIMITS: [number, number] = [1000, 5000];
export const FAT_PER_KG = 0.8;
export const FAT_MIN_PER_KG = 0.6;
export const CARBS_WARN = 50;
/** Углеводов не меньше — при нехватке калорий планка поднимается, а не урезает углеводы до нуля. */
export const CARBS_MIN = 50;
/** Безопасный минимум калорий: ниже планка не опускается при любом темпе. */
export const KCAL_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };
/** Стартовый расход без дневника: основной обмен × 1,4 (малоподвижный + бытовая активность). */
export const START_PAL = 1.4;
/** Расход ниже основного обмена × 1,2 не бывает у живого человека — значит, дневник неполный. */
export const MIN_PAL = 1.2;

/** Режим с датой начала. История режимов — массив, отсортированный по start. */
export interface GoalSetting {
  start: ISODate;
  mode: GoalMode;
  /** Темп, % веса в неделю (для дефицита и профицита). Пусто — по умолчанию режима. */
  pacePct?: number;
  /** Альтернатива темпу: дата, к которой дойти до целевого веса из профиля. */
  targetDate?: ISODate;
  /** Белок, г на кг сухой массы. Пусто — по умолчанию режима. */
  proteinPerLean?: number;
  /** Белок, г на кг общего веса — пока нет замера % жира. Пусто — 1,6. */
  proteinPerKg?: number;
  /** Своя планка калорий, ккал/день. Задана — темп не считается, а выводится из неё. */
  kcalManual?: number;
  /**
   * Поправка к расчётной планке, ккал/день (минус — ниже): из рекомендации «снизить / поднять планку».
   * Пересчёт по понедельникам сохраняется, темп выводится из итоговой планки.
   */
  kcalAdjust?: number;
  /** Кто задал: пользователь или куратор (принято пользователем). */
  by?: 'user' | 'curator';
}

/** Предложение куратора: применяется только после подтверждения пользователем. */
export interface GoalProposal {
  id: string;
  curatorName: string;
  createdAt: ISODate;
  setting: Omit<GoalSetting, 'start' | 'by'> & {
    /** Новая цель по шагам (рекомендация «добавить шаги»). */
    stepGoal?: number;
    /** Тренировок в неделю (куратор предлагает вместе с целью). */
    workoutGoal?: number;
  };
  note?: string;
}

export type SettingError =
  | { code: 'paceHigh'; max: number }
  | { code: 'paceLow'; min: number }
  | { code: 'proteinRange'; min: number; max: number }
  | { code: 'proteinWeightRange'; min: number; max: number }
  | { code: 'kcalRange'; min: number; max: number }
  | { code: 'needGoalWeight' }
  | { code: 'datePast' }
  | { code: 'dateWrongWay' };

/** Проверка настроек перед сохранением (и предложений куратора). null — всё в порядке. */
export function validateSetting(s: Omit<GoalSetting, 'start' | 'by'>): SettingError | null {
  if (s.mode !== 'maintain' && s.pacePct != null && s.targetDate == null && s.kcalManual == null) {
    const [min, max] = PACE_LIMITS[s.mode];
    if (s.pacePct > max + 1e-9) return { code: 'paceHigh', max };
    if (s.pacePct < min - 1e-9) return { code: 'paceLow', min };
  }
  if (s.proteinPerLean != null) {
    const [min, max] = PROTEIN_LIMITS;
    if (s.proteinPerLean < min - 1e-9 || s.proteinPerLean > max + 1e-9) return { code: 'proteinRange', min, max };
  }
  if (s.proteinPerKg != null) {
    const [min, max] = PROTEIN_WEIGHT_LIMITS;
    if (s.proteinPerKg < min - 1e-9 || s.proteinPerKg > max + 1e-9) return { code: 'proteinWeightRange', min, max };
  }
  if (s.kcalManual != null) {
    const [min, max] = KCAL_MANUAL_LIMITS;
    if (s.kcalManual < min || s.kcalManual > max) return { code: 'kcalRange', min, max };
  }
  return null;
}

/** Режим, действующий на дату. */
export function activeGoal(goals: GoalSetting[] | undefined, sel: ISODate): GoalSetting | undefined {
  let out: GoalSetting | undefined;
  for (const g of goals || []) if (g.start <= sel && (!out || g.start >= out.start)) out = g;
  return out;
}

/** Добавить режим в историю: в один день действует последняя правка. */
export function withGoal(goals: GoalSetting[] | undefined, g: GoalSetting): GoalSetting[] {
  return [...(goals || []).filter((x) => x.start !== g.start), g].sort((a, b) => (a.start < b.start ? -1 : 1));
}

export function mondayOf(iso: ISODate): ISODate {
  const wd = parseISO(iso).getDay(); // 0 — воскресенье
  return shiftDate(iso, -((wd + 6) % 7));
}

/**
 * С какой даты действует планка дня sel: понедельник недели, смена режима или ручной пересчёт —
 * что позже (но не позже sel).
 */
export function anchorDate(sel: ISODate, g: GoalSetting, recalc: ISODate[] | undefined): ISODate {
  let a = mondayOf(sel);
  if (g.start > a && g.start <= sel) a = g.start;
  for (const r of recalc || []) if (r > a && r <= sel) a = r;
  return a;
}

export interface PaceResolved {
  /** Темп, % веса в неделю, всегда ≥ 0; направление — по режиму. */
  pct: number;
  /** Темп от даты цели упёрся в предел. */
  clamped?: { realDate: ISODate; max: number };
  fromDate?: boolean;
  error?: SettingError;
}

/** Темп режима: заданный, по умолчанию или от даты цели. */
export function resolvePace(
  g: Pick<GoalSetting, 'mode' | 'pacePct' | 'targetDate' | 'kcalManual'>,
  weight: number,
  goalWeight: number | undefined,
  asOf: ISODate,
): PaceResolved {
  if (g.mode === 'maintain' || g.kcalManual != null) return { pct: 0 };
  if (g.targetDate) {
    if (!goalWeight) return { pct: 0, fromDate: true, error: { code: 'needGoalWeight' } };
    const days = dayDiff(asOf, g.targetDate);
    if (days <= 0) return { pct: 0, fromDate: true, error: { code: 'datePast' } };
    const need = weight - goalWeight; // > 0 — надо сбросить
    if ((g.mode === 'deficit' && need <= 0) || (g.mode === 'surplus' && need >= 0))
      return { pct: 0, fromDate: true, error: { code: 'dateWrongWay' } };
    const pct = (Math.abs(need) / (days / 7) / weight) * 100;
    const max = DATE_PACE_MAX[g.mode];
    if (pct > max) {
      const weeks = Math.abs(need) / ((max / 100) * weight);
      return { pct: max, fromDate: true, clamped: { realDate: shiftDate(asOf, Math.ceil(weeks * 7)), max } };
    }
    return { pct, fromDate: true };
  }
  const pct = g.pacePct ?? DEFAULT_PACE_PCT[g.mode];
  const err = validateSetting({ mode: g.mode, pacePct: pct });
  return err ? { pct, error: err } : { pct };
}

export type TargetWarning = 'floored' | 'belowBmr' | 'paceHigh' | 'carbsLow' | 'rough' | 'start';

export interface TargetInput {
  setting: GoalSetting;
  /** Расход по факту (при α = 0 — по формуле), ккал/день. */
  E: number;
  /** Вес по тренду, а если тренда нет — последний. */
  weight: number;
  weightSource: 'trend' | 'last';
  /** % жира по последнему замеру; нет — белок от общего веса. */
  bodyFatPct?: number;
  sex: Sex;
  age: number;
  heightCm: number;
  goalWeightKg?: number;
  reliability?: Reliability;
  /** Дата, на которую считается планка (для темпа от даты цели). */
  asOf: ISODate;
  /** Расход — стартовая оценка по формуле (дневника с калориями ещё нет). */
  eStart?: boolean;
}

export interface Targets {
  mode: GoalMode;
  pct: number;
  pace: PaceResolved;
  /** Изменение веса в неделю по плану, кг (минус — снижение). */
  kgPerWeek: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  proteinCoef: number;
  proteinBasis: 'lean' | 'weight';
  leanMass?: number;
  bmr: number;
  E: number;
  weight: number;
  weightSource: 'trend' | 'last';
  /** Планка поднята до безопасного минимума (калорий или углеводов): значение минимума. */
  floor?: number;
  /** Планка задана вручную: темп и кг/нед выведены из неё. */
  manual?: boolean;
  /** Поправка к расчётной планке из рекомендации, ккал. */
  adjust?: number;
  warnings: TargetWarning[];
}

const round10 = (x: number) => Math.round(x / 10) * 10;
const round10Up = (x: number) => Math.ceil(x / 10) * 10;

/** Планка дня по заданному расходу и весу. Числа — как в проверке ТЗ (E 2268, 71,8 кг, жир 19,5 %). */
export function computeTargets(i: TargetInput): Targets | { error: SettingError } {
  const g = i.setting;
  const pace = resolvePace(g, i.weight, i.goalWeightKg, i.asOf);
  if (pace.error) return { error: pace.error };
  const sign = g.mode === 'deficit' ? -1 : g.mode === 'surplus' ? 1 : 0;
  const manual = g.kcalManual != null;
  const adjust = !manual && g.kcalAdjust ? g.kcalAdjust : 0;
  let kgPerWeek = (sign * pace.pct * i.weight) / 100;
  let kcal = round10(i.E + (kgPerWeek * KCAL_PER_KG) / 7 + adjust);
  // поправка меняет и темп: он — следствие итоговой планки
  if (adjust) kgPerWeek = ((kcal - i.E) * 7) / KCAL_PER_KG;
  if (manual) {
    // своя планка: темп — следствие разницы с расходом
    kcal = round10(g.kcalManual!);
    kgPerWeek = ((kcal - i.E) * 7) / KCAL_PER_KG;
  }

  const lean = i.bodyFatPct != null && i.bodyFatPct > 0 ? i.weight * (1 - i.bodyFatPct / 100) : undefined;
  // есть замер — г на кг сухой массы; нет — г на кг веса (свой коэффициент или 1,6)
  const coef = lean != null ? g.proteinPerLean ?? PROTEIN_DEFAULT[g.mode] : g.proteinPerKg ?? PROTEIN_NO_MEASURE;
  const protein = Math.round(coef * (lean ?? i.weight));
  const fatMin = Math.round(FAT_MIN_PER_KG * i.weight);

  // Безопасный минимум: не ниже 1500 ккал у мужчин / 1200 у женщин и не меньше,
  // чем нужно на белок, жиры по минимуму (0,6 г/кг) и 50 г углеводов. Лучше медленнее, чем голодовка.
  const floor = Math.max(KCAL_FLOOR[i.sex], round10Up(protein * 4 + fatMin * 9 + CARBS_MIN * 4));
  let floored: number | undefined;
  if (kcal < floor) {
    floored = floor;
    kcal = floor;
    // фактический темп при поднятой планке; в дефиците — не «в плюс»
    if (manual || adjust) kgPerWeek = ((kcal - i.E) * 7) / KCAL_PER_KG;
    else if (g.mode === 'deficit') kgPerWeek = Math.min(0, ((kcal - i.E) * 7) / KCAL_PER_KG);
  }

  let fat = Math.round(FAT_PER_KG * i.weight);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  if (carbs < CARBS_MIN) {
    // калорий мало — жиры снижаются (не ниже 0,6 г/кг), чтобы углеводов осталось хотя бы 50 г
    fat = Math.max(fatMin, Math.floor((kcal - protein * 4 - CARBS_MIN * 4) / 9));
    carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  }

  const bmr = mifflin(i.sex, i.weight, i.heightCm, i.age);
  const warnings: TargetWarning[] = [];
  if (floored != null) warnings.push('floored');
  if (kcal < bmr) warnings.push('belowBmr');
  const pct = manual || adjust ? (Math.abs(kgPerWeek) / i.weight) * 100 : pace.pct;
  if ((manual ? kgPerWeek < 0 : g.mode === 'deficit') && pct > 1 + 1e-9) warnings.push('paceHigh');
  if (carbs < CARBS_WARN) warnings.push('carbsLow');
  if (i.eStart) warnings.push('start');
  else if (i.reliability === 'low') warnings.push('rough');

  return {
    mode: g.mode,
    pct,
    pace,
    kgPerWeek,
    kcal,
    protein,
    fat,
    carbs,
    proteinCoef: coef,
    proteinBasis: lean != null ? 'lean' : 'weight',
    leanMass: lean,
    bmr,
    E: i.E,
    weight: i.weight,
    weightSource: i.weightSource,
    floor: floored,
    manual: manual || undefined,
    adjust: adjust || undefined,
    warnings,
  };
}

// ---- Планка на выбранный день из дневника ----

export type DayPlan =
  | { kind: 'none' }
  | { kind: 'noData'; setting: GoalSetting; anchor: ISODate }
  | { kind: 'error'; setting: GoalSetting; anchor: ISODate; error: SettingError }
  | { kind: 'ok'; setting: GoalSetting; anchor: ISODate; targets: Targets; adaptive: AdaptiveResult | null };

/**
 * Планка на день sel. Расход и вес берутся на конец дня перед датой отсчёта (понедельник,
 * смена режима или пересчёт), поэтому внутри недели планка не меняется от новых записей.
 * Если до даты отсчёта данных нет (первый день) — по данным самой даты отсчёта.
 */
export function dayPlan(profile: Profile, days: DayMap, keep: KeepMap, sel: ISODate): DayPlan {
  const g = activeGoal(profile.goals, sel);
  if (!g) return { kind: 'none' };
  const anchor = anchorDate(sel, g, profile.goalRecalc);
  const hasWeightBy = (d: ISODate) => Object.keys(days).some((x) => x <= d && (days[x].weight || 0) > 0);
  const base = hasWeightBy(shiftDate(anchor, -1)) ? shiftDate(anchor, -1) : anchor;

  const ctx = { profile, days };
  const r = adaptiveTDEE(base, ctx, keep);
  let weight: number | undefined = r?.trendW ?? undefined;
  const weightSource: 'trend' | 'last' = weight ? 'trend' : 'last';
  if (!weight) {
    const last = Object.keys(days)
      .filter((x) => x <= base && (days[x].weight || 0) > 0)
      .sort()
      .pop();
    weight = last ? days[last].weight : undefined;
  }
  const age = ageAt(profile.birthDate, anchor);
  if (!weight || age == null || !(profile.heightCm > 0)) return { kind: 'noData', setting: g, anchor };
  const bmr = mifflin(profile.sex, weight, profile.heightCm, age);

  let E = r?.E ?? r?.formula ?? null;
  const eStart = E == null;
  if (E == null) {
    // ни одного дня с калориями: стартовая оценка. Модель дня без еды даёт почти голый БМР
    // (нет переваривания, шагов и тренировки), поэтому берём БМР × 1,4 или модель дня, если она больше.
    const m = makeDayModel(ctx)(days[base] || {}, base, weight);
    E = Math.max(bmr * START_PAL, m ? m.total / 0.9 : 0);
  }
  // неполный дневник (нет шагов, недописанная еда) занижает расход — не ниже БМР × 1,2
  E = Math.max(E, bmr * MIN_PAL);

  const res = computeTargets({
    setting: g,
    E,
    weight,
    weightSource,
    bodyFatPct: lastBodyFat(days, base, profile.sex, profile.heightCm),
    sex: profile.sex,
    age,
    heightCm: profile.heightCm,
    goalWeightKg: profile.goalWeightKg,
    reliability: r ? r.reliability : 'low',
    asOf: anchor,
    eStart,
  });
  if ('error' in res) return { kind: 'error', setting: g, anchor, error: res.error };
  return { kind: 'ok', setting: g, anchor, targets: res, adaptive: r };
}

// ---- Факт / цель ----

export type Tone = 'ok' | 'warn' | 'bad' | 'none';

/** Ккал: зелёный при отклонении ≤5 %, янтарный ≤10 %, красный больше. */
export function kcalTone(fact: number | undefined, target: number): Tone {
  if (!fact) return 'none';
  const dev = Math.abs(fact - target) / target;
  return dev <= 0.05 + 1e-9 ? 'ok' : dev <= 0.1 + 1e-9 ? 'warn' : 'bad';
}

/** Белок: зелёный ≥ цели, янтарный ≥90 %, красный ниже. */
export function proteinTone(fact: number | undefined, target: number): Tone {
  if (fact == null) return 'none';
  return fact >= target ? 'ok' : fact >= 0.9 * target ? 'warn' : 'bad';
}

/** Жиры: красный, если ниже 0,6 г/кг. */
export function fatTone(fact: number | undefined, weight: number): Tone {
  if (fact == null) return 'none';
  return fact < FAT_MIN_PER_KG * weight ? 'bad' : 'none';
}

// ---- Два прогноза даты цели ----

export type PlanForecast =
  | { kind: 'none' }
  | { kind: 'reached' }
  | { kind: 'wrongWay' }
  | { kind: 'date'; date: ISODate; days: number };

/** Прогноз по выбранному темпу (от текущего веса, темп в кг/нед — по плану). */
export function planForecast(t: Targets, goalWeight: number | undefined, from: number, asOf: ISODate): PlanForecast {
  if (!goalWeight || (t.mode === 'maintain' && !t.manual) || !t.kgPerWeek) return { kind: 'none' };
  const need = goalWeight - from;
  if (Math.abs(need) < 0.1) return { kind: 'reached' };
  if (Math.sign(need) !== Math.sign(t.kgPerWeek)) return { kind: 'wrongWay' };
  const days = Math.ceil((need / t.kgPerWeek) * 7);
  return { kind: 'date', date: shiftDate(asOf, days), days };
}

/** Факт отстаёт от плана больше чем на 30 %: прогноз по тренду дальше плана или вес не идёт к цели. */
export function factLags(plan: PlanForecast, fact: { kind: string; days?: number }): boolean {
  if (plan.kind !== 'date') return false;
  if (fact.kind === 'notApproaching' || fact.kind === 'tooLong') return true;
  if (fact.kind !== 'date' || fact.days == null) return false;
  return fact.days > plan.days * 1.3;
}
