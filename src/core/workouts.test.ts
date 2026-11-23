import { describe, expect, it } from 'vitest';
import { clampWorkoutGoal, dayWorkoutKind, weekMonday, weekWorkouts } from './workouts';
import type { DayEntry } from './types';

// 23.11.2026 — понедельник
const S: DayEntry = { workoutKind: 'strength', workoutMin: 50, workoutType: 'Fullbody' };
const K: DayEntry = { workoutKind: 'cardio', workoutMin: 30, workoutType: 'Бег' };

describe('тренировки недели', () => {
  it('неделя с понедельника по воскресенье', () => {
    expect(weekMonday('2026-11-23')).toBe('2026-11-23');
    expect(weekMonday('2026-11-29')).toBe('2026-11-23');
    expect(weekMonday('2026-11-25')).toBe('2026-11-23');
    expect(weekMonday('2026-11-22')).toBe('2026-11-16');
  });
  it('вид по выбору, по названию у старых записей; без минут — нет тренировки', () => {
    expect(dayWorkoutKind(S)).toBe('strength');
    expect(dayWorkoutKind(K)).toBe('cardio');
    expect(dayWorkoutKind({ workoutType: 'зал', workoutMin: 40 })).toBe('strength');
    expect(dayWorkoutKind({ workoutKind: 'cardio' })).toBeNull();
    expect(dayWorkoutKind(undefined)).toBeNull();
  });
  it('цель: по умолчанию 3, от 2 до 7', () => {
    expect(clampWorkoutGoal(undefined)).toBe(3);
    expect(clampWorkoutGoal(1)).toBe(2);
    expect(clampWorkoutGoal(9)).toBe(7);
    expect(clampWorkoutGoal(4.4)).toBe(4);
  });
  it('середина недели: 2 из 3, осталось 1 — лучше силовую', () => {
    const w = weekWorkouts({ '2026-11-23': S, '2026-11-25': K, '2026-11-27': S }, '2026-11-25', '2026-11-25');
    expect(w.days.map((x) => x.kind)).toEqual(['strength', null, 'cardio', null, null, null, null]);
    expect(w.days[4].future).toBe(true); // пятница ещё не наступила — запись не считается
    expect(w).toMatchObject({ done: 2, strength: 1, goal: 3, hint: { kind: 'left', left: 1, strengthLeft: 1 } });
  });
  it('цель набрана, но одна силовая — подсказка про силовую', () => {
    const w = weekWorkouts({ '2026-11-23': K, '2026-11-24': K, '2026-11-25': S }, '2026-11-25', '2026-11-25');
    expect(w.hint).toEqual({ kind: 'doneNeedStrength', strengthLeft: 1 });
  });
  it('цель набрана с двумя силовыми — ✓', () => {
    const w = weekWorkouts({ '2026-11-23': S, '2026-11-24': K, '2026-11-25': S }, '2026-11-25', '2026-11-25');
    expect(w.hint).toEqual({ kind: 'done' });
  });
  it('с куратором — без совета про силовые', () => {
    const w = weekWorkouts({ '2026-11-23': K }, '2026-11-23', '2026-11-23', 3, false);
    expect(w.hint).toEqual({ kind: 'left', left: 2, strengthLeft: 0 });
  });
  it('прошлая неделя: не набрано — missed, набрано — done', () => {
    const days = { '2026-11-16': S, '2026-11-18': K };
    expect(weekWorkouts(days, '2026-11-18', '2026-11-25').hint).toEqual({ kind: 'missed' });
    expect(weekWorkouts(days, '2026-11-18', '2026-11-25', 2).hint).toEqual({ kind: 'done' });
  });
});
