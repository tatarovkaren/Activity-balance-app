// Рекомендации по корректировке планки калорий и шагов (вариант Б, решение Карэна 23.11.2026).
// Раз в неделю (с понедельника, вместе с пересчётом планки) приложение ищет причину, почему результат
// не совпадает с целью, и предлагает одно действие (или выбор из 2–3) с кнопками «Применить» / «Не сейчас».
// Само ничего не меняет. Если есть куратор — рекомендация сначала уходит ему.
// Ядро отдаёт коды и числа, тексты — в src/i18n.

import { adaptiveTDEE, type AdaptiveResult } from './adaptive';
import { ageAt, dayDiff, parseISO, shiftDate, type ISODate } from './dates';
import { dayKcal, mifflin } from './energy';
import { planCache } from './dayscore';
import { activeGoal, KCAL_FLOOR, MIN_PAL, mondayOf, type GoalSetting } from './targets';
import type { AdviceMark, DayMap, KeepMap, Profile } from './types';

export const ADVICE = {
  /** Окно анализа, дней. */
  WINDOW: 28,
  /** Цель должна действовать не меньше, дней. */
  GOAL_MIN_DAYS: 14,
  /** Пауза после смены цели или применённой рекомендации, дней. */
  PAUSE_DAYS: 14,
  MIN_WEIGHINGS: 10,
  MIN_KCAL_DAYS: 20,
  /** Ест больше планки: в среднем выше +5 %. */
  OVER_SHARE: 0.05,
  /** Вес отстаёт от плана больше чем на 30 %. */
  LAG_SHARE: 0.3,
  /** Худеет быстрее 1 % веса в неделю. */
  FAST_PCT: 1,
  /** Расход по факту ниже формулы на 15 % — признак недоучёта. */
  UNDER_FORMULA: 0.15,
  /** Потолок шагов. */
  STEPS_MAX: 14000,
} as const;

/** Что можно применить одной кнопкой. */
export type AdviceAction =
  | { kind: 'kcal'; delta: number; from: number; to: number }
  | { kind: 'steps'; from: number; to: number; kcalMin: number; kcalMax: number; kgMonth: number }
  | { kind: 'date'; from: ISODate; to: ISODate };

/** Признаки недоучёта еды. */
export type UnderSign = 'lowExpenditure' | 'atMinimum' | 'emptyWeekends' | 'flatWeekdays';

export type Advice =
  /** Мало данных: взвешиваться 4 раза в неделю и вносить все дни. Планку не трогаем. */
  | { reason: 'lowData'; weighings: number; kcalDays: number }
  /** Ест больше планки (в профиците — меньше): где перебор. Планку не трогаем. */
  | { reason: 'overeat'; avgPct: number; weekendPct: number | null; weekdayPct: number | null; under: boolean; mode: GoalSetting['mode'] }
  /** Вносит по планке, а вес отстаёт: подозрение на недоучёт. Чек-лист и контрольная неделя. */
  | { reason: 'underreport'; signs: UnderSign[]; planKgWeek: number; factKgWeek: number }
  /** Данные надёжные, соблюдает, а темп ниже плана: на выбор — калории, шаги, дата. */
  | { reason: 'slow'; planKgWeek: number; factKgWeek: number; actions: AdviceAction[] }
  /** Худеет быстрее 1 %/нед (или набирает быстрее плана): поднять (в профиците — снизить) планку. */
  | { reason: 'fast'; planKgWeek: number; factKgWeek: number; pctWeek: number; actions: AdviceAction[] };

export interface AdviceResult {
  /** Понедельник недели, к которой относится рекомендация: «Не сейчас» прячет её до следующего. */
  week: ISODate;
  advice: Advice;
}

export type { AdviceMark };

/**
 * Шаг снижения калорий по запасу до нижней границы max(минимум 1500/1200, БМР):
 * запас ≥300 → 150, 150–300 → 100, 50–150 → 50, меньше 50 → 0 (калории не снижаем).
 */
export function kcalStepDown(kcal: number, floor: number): number {
  const room = kcal - floor;
  if (room >= 300) return 150;
  if (room >= 150) return 100;
  if (room >= 50) return 50;
  return 0;
}

const round500 = (x: number) => Math.round(x / 500) * 500;

/** Новая цель по шагам от своей средней за 4 недели; null — шаги не предлагаем (больше 14 тыс.). */
export function stepsUp(avg: number): number | null {
  if (avg > ADVICE.STEPS_MAX) return null;
  if (avg < 5000) return 7500;
  if (avg < 8000) return round500(avg + 2000);
  return Math.min(ADVICE.STEPS_MAX, round500(avg + 1000));
}

/** Честный эффект добавленных шагов: ≈ 0,5–0,65 ккал на шаг на 1000 кг (+2000 при 70 кг ≈ 70–90 ккал). */
export function stepsEffect(extra: number, weight: number): { kcalMin: number; kcalMax: number; kgMonth: number } {
  const kcalMin = Math.round((extra * weight * 0.0005) / 5) * 5;
  const kcalMax = Math.round((extra * weight * 0.00065) / 5) * 5;
  const kgMonth = Math.round((((kcalMin + kcalMax) / 2) * 30) / 7700 * 10) / 10;
  return { kcalMin, kcalMax, kgMonth };
}

/** Последняя дата, когда что-то меняли в цели: смена режима или применённая рекомендация. */
function lastChange(profile: Profile): ISODate | undefined {
  const g = profile.goals || [];
  const applied = (profile.advice || []).filter((m) => m.action === 'applied').map((m) => m.at);
  return [...g.map((x) => x.start), ...applied].sort().pop();
}

/**
 * Рекомендация на неделю, в которую входит today. Считается по данным до конца прошлой недели
 * (окно 4 недели, необычные дни исключены). null — рекомендации нет (рано, пауза, всё по плану, отложена).
 */
export function weeklyAdvice(profile: Profile, days: DayMap, keep: KeepMap, today: ISODate): AdviceResult | null {
  const week = mondayOf(today);
  if ((profile.advice || []).some((m) => m.week === week)) return null;
  const g = activeGoal(profile.goals, today);
  if (!g) return null;
  const end = shiftDate(week, -1);
  if (dayDiff(g.start, week) < ADVICE.GOAL_MIN_DAYS) return null;
  const changed = lastChange(profile);
  if (changed && dayDiff(changed, today) < ADVICE.PAUSE_DAYS) return null;
  const advice = analyze(profile, days, keep, g, end);
  return advice ? { week, advice } : null;
}

/** Разбор окна из 4 недель, заканчивающегося днём end. */
export function analyze(profile: Profile, days: DayMap, keep: KeepMap, g: GoalSetting, end: ISODate): Advice | null {
  const r = adaptiveTDEE(end, { profile, days }, keep);
  const excl = new Set((r?.exclList || []).map((x) => x.d));
  const win: ISODate[] = [];
  for (let i = ADVICE.WINDOW - 1; i >= 0; i--) {
    const d = shiftDate(end, -i);
    if (!excl.has(d) && !days[d]?.anomaly) win.push(d);
  }
  const weighings = win.filter((d) => (days[d]?.weight || 0) > 0).length;
  const kcalDays = win.filter((d) => (dayKcal(days[d]) || 0) > 0);
  if (weighings < ADVICE.MIN_WEIGHINGS || kcalDays.length < ADVICE.MIN_KCAL_DAYS) return { reason: 'lowData', weighings, kcalDays: kcalDays.length };

  // соблюдение планки: среднее отклонение съеденного от планки дня
  const plan = planCache(profile, days, keep);
  const dev: { d: ISODate; pct: number }[] = [];
  for (const d of kcalDays) {
    const p = plan(d);
    if (p.kind === 'ok') dev.push({ d, pct: (dayKcal(days[d])! - p.targets.kcal) / p.targets.kcal });
  }
  if (!dev.length) return null;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const isWeekend = (d: ISODate) => [0, 6].includes(parseISO(d).getDay());
  const avgPct = avg(dev.map((x) => x.pct))!;
  const weekendPct = avg(dev.filter((x) => isWeekend(x.d)).map((x) => x.pct));
  const weekdayPct = avg(dev.filter((x) => !isWeekend(x.d)).map((x) => x.pct));
  const mode = g.mode;
  const pct100 = (x: number | null) => (x == null ? null : Math.round(x * 1000) / 10);

  // 2. ест больше планки (в профиците — меньше; в поддержании — в любую сторону)
  const over = avgPct > ADVICE.OVER_SHARE;
  const under = avgPct < -ADVICE.OVER_SHARE;
  if ((mode === 'deficit' && over) || (mode === 'surplus' && under) || (mode === 'maintain' && (over || under)))
    return { reason: 'overeat', avgPct: pct100(avgPct)!, weekendPct: pct100(weekendPct), weekdayPct: pct100(weekdayPct), under, mode };
  if (mode === 'maintain') return null;

  const cur = plan(end);
  if (cur.kind !== 'ok' || !r || r.slope == null || !r.trendW) return null;
  const tg = cur.targets;
  const planKgWeek = tg.kgPerWeek;
  const factKgWeek = r.slope * 7;
  const weight = r.trendW;
  const pctWeek = (Math.abs(factKgWeek) / weight) * 100;
  const kgW = (x: number) => Math.round(x * 100) / 100;
  const age = ageAt(profile.birthDate, end) ?? 30;
  const bmr = mifflin(profile.sex, weight, profile.heightCm, age);
  const floor = Math.max(KCAL_FLOOR[profile.sex], Math.round(bmr));

  if (mode === 'deficit') {
    // 5. худеет быстрее 1 % в неделю — поднять планку, чтобы сберечь мышцы
    if (factKgWeek < 0 && pctWeek > ADVICE.FAST_PCT) {
      // ест заметно меньше планки — дело не в планке: добирать её, а не поднимать
      if (under) return { reason: 'overeat', avgPct: pct100(avgPct)!, weekendPct: pct100(weekendPct), weekdayPct: pct100(weekdayPct), under, mode };
      const delta = pctWeek > 1.25 ? 150 : 100;
      return { reason: 'fast', planKgWeek: kgW(planKgWeek), factKgWeek: kgW(factKgWeek), pctWeek: Math.round(pctWeek * 100) / 100, actions: [{ kind: 'kcal', delta, from: tg.kcal, to: tg.kcal + delta }] };
    }
    // 3–4. вес отстаёт от плана больше чем на 30 %
    if (planKgWeek < 0 && factKgWeek > planKgWeek * (1 - ADVICE.LAG_SHARE)) {
      const signs = underSigns(r, days, win, bmr);
      if (signs.length) return { reason: 'underreport', signs, planKgWeek: kgW(planKgWeek), factKgWeek: kgW(factKgWeek) };
      const actions: AdviceAction[] = [];
      const step = kcalStepDown(tg.kcal, floor);
      if (step) actions.push({ kind: 'kcal', delta: -step, from: tg.kcal, to: tg.kcal - step });
      const steps = win.map((d) => days[d]?.steps || 0).filter((x) => x > 0);
      const avgSteps = avg(steps);
      const to = avgSteps != null && steps.length >= 10 ? stepsUp(avgSteps) : null;
      if (to != null && to > profile.stepGoal) actions.push({ kind: 'steps', from: profile.stepGoal, to, ...stepsEffect(to - Math.max(avgSteps!, 0), weight) });
      const shifted = shiftedDate(g, profile, weight, factKgWeek, end);
      if (shifted) actions.push(shifted);
      if (!actions.length) return null;
      return { reason: 'slow', planKgWeek: kgW(planKgWeek), factKgWeek: kgW(factKgWeek), actions };
    }
    return null;
  }

  // профицит: набирает быстрее плана — снизить планку; медленнее — поднять
  if (planKgWeek > 0 && factKgWeek > planKgWeek * (1 + ADVICE.LAG_SHARE)) {
    return { reason: 'fast', planKgWeek: kgW(planKgWeek), factKgWeek: kgW(factKgWeek), pctWeek: Math.round(pctWeek * 100) / 100, actions: [{ kind: 'kcal', delta: -100, from: tg.kcal, to: tg.kcal - 100 }] };
  }
  if (planKgWeek > 0 && factKgWeek < planKgWeek * (1 - ADVICE.LAG_SHARE)) {
    const actions: AdviceAction[] = [{ kind: 'kcal', delta: 100, from: tg.kcal, to: tg.kcal + 100 }];
    const shifted = shiftedDate(g, profile, weight, factKgWeek, end);
    if (shifted) actions.push(shifted);
    return { reason: 'slow', planKgWeek: kgW(planKgWeek), factKgWeek: kgW(factKgWeek), actions };
  }
  return null;
}

/** Признаки недоучёта еды в окне. */
function underSigns(r: AdaptiveResult, days: DayMap, win: ISODate[], bmr: number): UnderSign[] {
  const out: UnderSign[] = [];
  const fact = r.fact ?? r.E;
  if (fact != null && r.formula != null && fact <= r.formula * (1 - ADVICE.UNDER_FORMULA)) out.push('lowExpenditure');
  if (fact != null && fact <= bmr * MIN_PAL + 1) out.push('atMinimum');
  const wd = (d: ISODate) => parseISO(d).getDay();
  const weekend = win.filter((d) => wd(d) === 0 || wd(d) === 6);
  const weekdays = win.filter((d) => wd(d) !== 0 && wd(d) !== 6);
  const filled = (list: ISODate[]) => list.filter((d) => (dayKcal(days[d]) || 0) > 0);
  if (weekend.length >= 4 && filled(weekend).length <= weekend.length / 2 && filled(weekdays).length >= weekdays.length * 0.8)
    out.push('emptyWeekends');
  const k = filled(weekdays).map((d) => dayKcal(days[d])!);
  if (k.length >= 8) {
    const m = k.reduce((a, b) => a + b, 0) / k.length;
    const sd = Math.sqrt(k.reduce((a, b) => a + (b - m) ** 2, 0) / k.length);
    if (m > 0 && sd / m < 0.03) out.push('flatWeekdays');
  }
  return out;
}

/** «Сдвинуть дату цели» — только если цель задана датой: новая дата по фактическому темпу. */
function shiftedDate(g: GoalSetting, profile: Profile, weight: number, factKgWeek: number, end: ISODate): AdviceAction | null {
  if (!g.targetDate || !profile.goalWeightKg) return null;
  const need = profile.goalWeightKg - weight;
  if (!factKgWeek || Math.sign(need) !== Math.sign(factKgWeek)) return null;
  const to = shiftDate(end, Math.ceil((need / factKgWeek) * 7));
  if (to <= g.targetDate || dayDiff(end, to) > 730) return null;
  return { kind: 'date', from: g.targetDate, to };
}

/** Настройка цели после применения действия (для setGoal или предложения куратора). */
export function applyAction(g: GoalSetting, a: AdviceAction): Omit<GoalSetting, 'start' | 'by'> | null {
  const { start: _s, by: _b, ...rest } = g;
  if (a.kind === 'kcal')
    return g.kcalManual != null ? { ...rest, kcalManual: g.kcalManual + a.delta } : { ...rest, kcalAdjust: (g.kcalAdjust || 0) + a.delta || undefined };
  if (a.kind === 'date') return { ...rest, targetDate: a.to };
  return null;
}
