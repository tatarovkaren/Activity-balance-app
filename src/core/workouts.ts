// Тренировки недели (Пн–Вс) для карточки «Тренировка» на «Дне»: отметки по дням, счётчик и подсказка.
// Рекомендация по умолчанию — 3 в неделю (не меньше 2), из них силовых не меньше 2 (ВОЗ: силовые 2+ дня в неделю).

import { classifyWorkout } from './energy';
import { dayDiff, parseISO, shiftDate, type ISODate } from './dates';
import type { DayEntry } from './types';

export const WORKOUT_GOAL_DEFAULT = 3;
export const WORKOUT_GOAL_MIN = 2;
export const WORKOUT_GOAL_MAX = 7;
/** Силовых в неделю — не меньше (но не больше цели). */
export const STRENGTH_MIN = 2;

export type WeekKind = 'cardio' | 'strength';

export interface WeekDay {
  date: ISODate;
  kind: WeekKind | null;
  /** День после сегодняшнего. */
  future: boolean;
}

export type WeekHint =
  /** Цель недели выполнена (и силовых достаточно или куратор ведёт). */
  | { kind: 'done' }
  /** Цель по числу есть, но силовых меньше рекомендованного. */
  | { kind: 'doneNeedStrength'; strengthLeft: number }
  /** Неделя ещё идёт: осталось left, из них лучше силовых strengthLeft. */
  | { kind: 'left'; left: number; strengthLeft: number }
  /** Неделя прошла, цель не набрана. */
  | { kind: 'missed' };

export interface WeekWorkouts {
  days: WeekDay[];
  done: number;
  strength: number;
  goal: number;
  hint: WeekHint;
}

export function clampWorkoutGoal(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return WORKOUT_GOAL_DEFAULT;
  return Math.max(WORKOUT_GOAL_MIN, Math.min(WORKOUT_GOAL_MAX, Math.round(n)));
}

/** Понедельник недели, в которую входит дата. */
export function weekMonday(d: ISODate): ISODate {
  const wd = parseISO(d).getDay(); // 0 — вс
  return shiftDate(d, -((wd + 6) % 7));
}

/** Вид тренировки за день: силовая/кардио или нет тренировки (нет минут). */
export function dayWorkoutKind(e: DayEntry | undefined): WeekKind | null {
  if (!e) return null;
  const k = classifyWorkout(e.workoutType, e.workoutMin, e.workoutKind);
  return k === 'none' ? null : k === 'strength' ? 'strength' : 'cardio';
}

/**
 * Неделя Пн–Вс вокруг выбранной даты.
 * withStrength = false — без совета про силовые (когда план ведёт куратор, приложение пишет нейтрально).
 */
export function weekWorkouts(days: Record<ISODate, DayEntry | undefined>, sel: ISODate, today: ISODate, goalPref?: number, withStrength = true): WeekWorkouts {
  const mon = weekMonday(sel);
  const list: WeekDay[] = [...Array(7)].map((_, i) => {
    const date = shiftDate(mon, i);
    const future = dayDiff(today, date) > 0;
    return { date, kind: future ? null : dayWorkoutKind(days[date]), future };
  });
  const done = list.filter((x) => x.kind).length;
  const strength = list.filter((x) => x.kind === 'strength').length;
  const goal = clampWorkoutGoal(goalPref);
  const strengthLeft = withStrength ? Math.max(0, Math.min(STRENGTH_MIN, goal) - strength) : 0;
  const weekOver = dayDiff(shiftDate(mon, 6), today) > 0;
  let hint: WeekHint;
  if (done >= goal) hint = strengthLeft > 0 && !weekOver ? { kind: 'doneNeedStrength', strengthLeft } : { kind: 'done' };
  else if (weekOver) hint = { kind: 'missed' };
  else hint = { kind: 'left', left: goal - done, strengthLeft: Math.min(strengthLeft, goal - done) };
  return { days: list, done, strength, goal, hint };
}
