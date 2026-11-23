// Итог дня по цели (вариант B «шкала с коридором», решение Карэна 23.11.2026).
// Калории, белок и шаги оцениваются с учётом режима; углеводы не оцениваются, жиры — только «ниже 0,6 г/кг».
// Сегодняшний день «идёт», пока его не закрыли (21:00, кнопка или отчёт куратору): недобор не красим.
// Ядро отдаёт коды и числа, тексты — в src/i18n, цвета — в src/ui.

import { shiftDate, todayISO, type ISODate } from './dates';
import { dayKcal } from './energy';
import { anchorDate, activeGoal, dayPlan, KCAL_FLOOR, type DayPlan, type GoalMode, type Targets } from './targets';
import type { DayEntry, DayMap, KeepMap, Profile, Sex } from './types';

/** Коридор калорий: ±5 % — «в цели», до ±10 % — «рядом». */
export const KCAL_OK = 0.05;
export const KCAL_NEAR = 0.1;
/** Белок и шаги: от цели — ✓, от 90 % — ≈, ниже — ▼. */
export const NEAR_SHARE = 0.9;
/** Во сколько день закрывается сам, по местному времени. */
export const DAY_CLOSE_HOUR = 21;

/**
 * Состояние показателя:
 * ok — в цели (✓), near — рядом (≈), over — перебор (▲), under — недобор (▼),
 * left — день идёт, до цели ещё не дошли, none — не внесено.
 */
export type MetricStatus = 'ok' | 'near' | 'over' | 'under' | 'left' | 'none';
/** Цвет: ok — зелёный, warn — жёлтый, bad — красный, progress — синий «в процессе», none — серый. */
export type ScoreTone = 'ok' | 'warn' | 'bad' | 'progress' | 'none';

export interface MetricScore {
  status: MetricStatus;
  tone: ScoreTone;
  fact?: number;
  target: number;
  /** Коридор цели: от lo до hi (у белка и шагов hi нет — «и больше»). */
  lo: number;
  hi?: number;
  /** Отклонение от цели (перебор +, недобор −) или сколько осталось до коридора (left). */
  diff?: number;
  /** Для left у калорий: осталось от lo до hi. */
  leftMin?: number;
  leftMax?: number;
}

const round10 = (x: number) => Math.round(x / 10) * 10;

/** Коридор калорий цели, округлённый до 10: 1870 → 1780–1960. */
export function kcalCorridor(target: number): { lo: number; hi: number } {
  return { lo: round10(target * (1 - KCAL_OK)), hi: round10(target * (1 + KCAL_OK)) };
}

/**
 * Калории. Дефицит: перебор красный, недобор жёлтый (красный ниже минимума 1500/1200).
 * Профицит: недобор красный, перебор жёлтый. Поддержание: оба направления красные.
 * Рядом (5–10 %) — жёлтый в любом режиме.
 */
export function scoreKcal(fact: number | undefined, target: number, mode: GoalMode, sex: Sex, open: boolean): MetricScore {
  const { lo, hi } = kcalCorridor(target);
  const base = { target, lo, hi, fact };
  if (!fact) return { ...base, status: 'none', tone: 'none' };
  const dev = (fact - target) / target;
  if (fact >= lo && fact <= hi) return { ...base, status: 'ok', tone: 'ok' };
  if (fact < lo && open) return { ...base, status: 'left', tone: 'progress', leftMin: lo - fact, leftMax: hi - fact, diff: lo - fact };
  const over = fact > hi;
  // отклонение — от самой цели (как «перебор +320» в макете), а не от края коридора
  const diff = fact - target;
  if (Math.abs(dev) <= KCAL_NEAR + 1e-9) return { ...base, status: 'near', tone: 'warn', diff };
  if (over) return { ...base, status: 'over', tone: mode === 'surplus' ? 'warn' : 'bad', diff };
  const tone: ScoreTone = mode === 'deficit' ? (fact < KCAL_FLOOR[sex] ? 'bad' : 'warn') : 'bad';
  return { ...base, status: 'under', tone, diff };
}

/** Белок: от цели и выше ✓, 90–100 % ≈, ниже 90 % ▼ красный. Перебор не наказываем. */
export function scoreProtein(fact: number | undefined, target: number, open: boolean): MetricScore {
  const base = { target, lo: target, fact };
  if (fact == null) return { ...base, status: 'none', tone: 'none' };
  if (fact >= target) return { ...base, status: 'ok', tone: 'ok' };
  if (open) return { ...base, status: 'left', tone: 'progress', diff: target - fact };
  if (fact >= NEAR_SHARE * target) return { ...base, status: 'near', tone: 'warn', diff: fact - target };
  return { ...base, status: 'under', tone: 'bad', diff: fact - target };
}

/** Шаги: от цели ✓, 90–100 % ≈, ниже ▼ жёлтый. Не внесены — не оцениваем. */
export function scoreSteps(fact: number | undefined, goal: number, open: boolean): MetricScore {
  const base = { target: goal, lo: goal, fact };
  if (!fact || !(goal > 0)) return { ...base, status: 'none', tone: 'none' };
  if (fact >= goal) return { ...base, status: 'ok', tone: 'ok' };
  if (open) return { ...base, status: 'left', tone: 'progress', diff: goal - fact };
  if (fact >= NEAR_SHARE * goal) return { ...base, status: 'near', tone: 'warn', diff: fact - goal };
  return { ...base, status: 'under', tone: 'warn', diff: fact - goal };
}

/**
 * Итог дня:
 * open — день идёт (◷), noData — без калорий не оцениваем (серая точка), ok — день в цели (✓),
 * near — только «рядом» (≈), over — перебор калорий (▲), under — недобор (▼).
 */
export type DayVerdict = 'ok' | 'near' | 'over' | 'under' | 'open' | 'noData';

export interface DayScore {
  verdict: DayVerdict;
  /** Сколько показателей (ккал, белок, шаги) не в цели — для «! мимо: 2». */
  misses: number;
  open: boolean;
  /** Как закрыт: прошлый день, 21:00, кнопкой или отчётом куратору. */
  closedBy?: 'past' | 'time' | 'button' | 'report';
  kcal: MetricScore;
  protein: MetricScore;
  steps: MetricScore;
  mode: GoalMode;
  /** Худший цвет среди показателей (для значка в календаре). */
  tone: ScoreTone;
}

/** Закрыт ли день: прошлые — всегда, сегодня — после 21:00, по кнопке или отправке отчёта. */
export function dayClosed(e: DayEntry | undefined, d: ISODate, now: Date = new Date()): DayScore['closedBy'] | null {
  const today = todayISO(now);
  if (d < today) return 'past';
  if (d > today) return null;
  if (e?.reportSentAt) return 'report';
  if (e?.closedAt) return 'button';
  if (now.getHours() >= DAY_CLOSE_HOUR) return 'time';
  return null;
}

const TONE_RANK: Record<ScoreTone, number> = { none: 0, ok: 1, progress: 2, warn: 3, bad: 4 };

/** Оценка дня по готовой планке. */
export function scoreDay(e: DayEntry | undefined, d: ISODate, tg: Targets, profile: Pick<Profile, 'sex' | 'stepGoal'>, now: Date = new Date()): DayScore {
  const closedBy = dayClosed(e, d, now);
  const open = closedBy == null;
  const kcal = scoreKcal(dayKcal(e), tg.kcal, tg.mode, profile.sex, open);
  const protein = scoreProtein(e?.protein, tg.protein, open);
  const steps = scoreSteps(e?.steps, profile.stepGoal, open);
  const list = [kcal, protein, steps].filter((m) => m.status !== 'none');
  const misses = list.filter((m) => m.status !== 'ok' && m.status !== 'left').length;
  const tone = list.reduce<ScoreTone>((w, m) => (TONE_RANK[m.tone] > TONE_RANK[w] ? m.tone : w), 'none');
  let verdict: DayVerdict;
  if (kcal.status === 'none') verdict = open ? 'open' : 'noData';
  else if (open) verdict = 'open';
  else if (kcal.status === 'over') verdict = 'over';
  else if (list.some((m) => m.status === 'under')) verdict = 'under';
  else if (misses) verdict = 'near';
  else verdict = 'ok';
  return { verdict, misses, open, closedBy: closedBy ?? undefined, kcal, protein, steps, mode: tg.mode, tone };
}

/**
 * Планки для многих дней сразу (календарь, рекомендации): дни с одной датой отсчёта
 * (неделя, смена режима, пересчёт) делят одну планку — считаем её один раз.
 */
export function planCache(profile: Profile, days: DayMap, keep: KeepMap) {
  const cache = new Map<string, DayPlan>();
  return (d: ISODate): DayPlan => {
    const g = activeGoal(profile.goals, d);
    if (!g) return { kind: 'none' };
    const key = anchorDate(d, g, profile.goalRecalc);
    let p = cache.get(key);
    if (!p) {
      p = dayPlan(profile, days, keep, d);
      cache.set(key, p);
    }
    return p;
  };
}

/** Итоги дней месяца (или любого списка дат) для календаря; null — нет планки на этот день. */
export function scoreDays(
  profile: Profile,
  days: DayMap,
  keep: KeepMap,
  dates: ISODate[],
  now: Date = new Date(),
): Record<ISODate, DayScore | null> {
  const plan = planCache(profile, days, keep);
  const today = todayISO(now);
  const out: Record<ISODate, DayScore | null> = {};
  for (const d of dates) {
    if (d > today) continue;
    const p = plan(d);
    out[d] = p.kind === 'ok' ? scoreDay(days[d], d, p.targets, profile, now) : null;
  }
  return out;
}

/** «В цели 12 из 17 дней» за набор дат: оцениваются только закрытые дни с калориями. */
export function monthSummary(scores: Record<ISODate, DayScore | null>): { ok: number; total: number; over: number; under: number } {
  let ok = 0;
  let total = 0;
  let over = 0;
  let under = 0;
  for (const s of Object.values(scores)) {
    if (!s || s.verdict === 'open' || s.verdict === 'noData') continue;
    total++;
    if (s.verdict === 'ok') ok++;
    if (s.verdict === 'over') over++;
    if (s.verdict === 'under') under++;
  }
  return { ok, total, over, under };
}

/** Все даты месяца (для календаря). */
export function monthDates(y: number, m0: number): ISODate[] {
  const first = `${y}-${String(m0 + 1).padStart(2, '0')}-01`;
  const out: ISODate[] = [];
  for (let d = first; d.slice(0, 7) === first.slice(0, 7); d = shiftDate(d, 1)) out.push(d);
  return out;
}
