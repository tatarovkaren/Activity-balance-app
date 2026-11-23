import { describe, expect, it } from 'vitest';
import { applyAction, kcalStepDown, stepsEffect, stepsUp, weeklyAdvice } from './advice';
import { shiftDate } from './dates';
import { DEFAULT_PROFILE, type DayMap, type Profile } from './types';

const today = '2026-11-23'; // понедельник
const prof = (extra: Partial<Profile> = {}): Profile => ({
  ...DEFAULT_PROFILE,
  sex: 'male',
  birthDate: '1978-05-01',
  heightCm: 170,
  stepGoal: 10000,
  goals: [{ start: shiftDate(today, -60), mode: 'deficit' }],
  ...extra,
});
/** n дней до сегодня (без сегодня); i — номер дня от начала. */
function mk(n: number, f: (i: number) => { weight?: number; kcal?: number; steps?: number }): DayMap {
  const days: DayMap = {};
  for (let i = n; i >= 1; i--) {
    const x = f(n - i);
    days[shiftDate(today, -i)] = { ...x, kcalManual: x.kcal != null };
  }
  return days;
}

describe('шаг изменения планки и шагов', () => {
  it('калории: по запасу до нижней границы', () => {
    expect(kcalStepDown(1900, 1500)).toBe(150);
    expect(kcalStepDown(1700, 1500)).toBe(100);
    expect(kcalStepDown(1600, 1500)).toBe(50);
    expect(kcalStepDown(1540, 1500)).toBe(0);
  });
  it('шаги от своей средней: <5 тыс. → 7,5; 5–8 → +2; 8–14 → +1, не выше 14; >14 — не предлагаем', () => {
    expect(stepsUp(3200)).toBe(7500);
    expect(stepsUp(6000)).toBe(8000);
    expect(stepsUp(9000)).toBe(10000);
    expect(stepsUp(13600)).toBe(14000);
    expect(stepsUp(15000)).toBeNull();
  });
  it('честный эффект: +2000 шагов при 70 кг ≈ 70–90 ккал, ≈0,3 кг в месяц', () => {
    expect(stepsEffect(2000, 70)).toEqual({ kcalMin: 70, kcalMax: 90, kgMonth: 0.3 });
  });
  it('применение: поправка к планке копится, своя планка меняется напрямую, дата — новая', () => {
    const g = { start: '2026-10-01', mode: 'deficit' as const, pacePct: 0.5 };
    expect(applyAction(g, { kind: 'kcal', delta: -150, from: 1900, to: 1750 })).toEqual({ mode: 'deficit', pacePct: 0.5, kcalAdjust: -150 });
    expect(applyAction({ ...g, kcalAdjust: -150 }, { kind: 'kcal', delta: 150, from: 1750, to: 1900 })).toEqual({ mode: 'deficit', pacePct: 0.5, kcalAdjust: undefined });
    expect(applyAction({ ...g, kcalManual: 1800 }, { kind: 'kcal', delta: -100, from: 1800, to: 1700 })).toMatchObject({ kcalManual: 1700 });
    expect(applyAction({ ...g, targetDate: '2027-03-01' }, { kind: 'date', from: '2027-03-01', to: '2027-04-15' })).toMatchObject({ targetDate: '2027-04-15' });
  });
});

describe('рекомендация недели: причины по порядку', () => {
  it('мало взвешиваний — «мало данных», планку не трогаем', () => {
    const r = weeklyAdvice(prof(), mk(70, (i) => ({ weight: i % 5 === 0 ? 80 : undefined, kcal: 1800 })), {}, today);
    expect(r?.advice).toMatchObject({ reason: 'lowData', weighings: 5 });
  });
  it('ест больше планки — показываем перебор, не снижаем', () => {
    const r = weeklyAdvice(prof(), mk(70, (i) => ({ weight: 80, kcal: i < 42 ? 2300 : 2800, steps: 8000 })), {}, today);
    expect(r?.advice.reason).toBe('overeat');
    expect(r?.advice).toMatchObject({ under: false });
  });
  it('вносит ровно по планке, вес стоит, расход упёрся в минимум — недоучёт', () => {
    const r = weeklyAdvice(prof(), mk(70, () => ({ weight: 80, kcal: 1500, steps: 8000 })), {}, today);
    expect(r?.advice.reason).toBe('underreport');
    if (r?.advice.reason === 'underreport') expect(r.advice.signs).toEqual(expect.arrayContaining(['atMinimum', 'flatWeekdays']));
  });
  it('худеет быстрее 1 %/нед, ест по планке — поднять планку', () => {
    // планка сама подстраивается под факт, поэтому быстрый темп — после перемены: 6 недель вес стоит, потом −0,2 кг/день
    const days = mk(70, (i) => (i < 42 ? { weight: 80, kcal: 2300, steps: 8000 } : { weight: 80 - (i - 41) * 0.2, kcal: 2000, steps: 8000 }));
    const r = weeklyAdvice(prof(), days, {}, today);
    expect(r?.advice.reason).toBe('fast');
    if (r?.advice.reason === 'fast') expect(r.advice.actions[0]).toMatchObject({ kind: 'kcal', delta: 150 });
  });
  it('худеет быстро, потому что ест сильно меньше планки — добирать планку, не поднимать', () => {
    const r = weeklyAdvice(prof(), mk(70, (i) => ({ weight: 80 - i * 0.18, kcal: 1800, steps: 8000 })), {}, today);
    expect(r?.advice).toMatchObject({ reason: 'overeat', under: true, mode: 'deficit' });
  });
});

describe('когда рекомендаций нет', () => {
  const days = mk(70, () => ({ weight: 80, kcal: 1500, steps: 8000 }));
  it('цель действует меньше 14 дней', () => {
    expect(weeklyAdvice(prof({ goals: [{ start: shiftDate(today, -10), mode: 'deficit' }] }), days, {}, today)).toBeNull();
  });
  it('нет цели', () => {
    expect(weeklyAdvice(prof({ goals: [] }), days, {}, today)).toBeNull();
  });
  it('«Не сейчас» прячет до следующего понедельника', () => {
    const p = prof({ advice: [{ week: today, at: today, action: 'dismissed', reason: 'underreport' }] });
    expect(weeklyAdvice(p, days, {}, today)).toBeNull();
    expect(weeklyAdvice(p, days, {}, shiftDate(today, 3))).toBeNull();
    expect(weeklyAdvice(p, days, {}, shiftDate(today, 7))).not.toBeNull();
  });
  it('после применённой рекомендации — пауза 2 недели', () => {
    const p = prof({ advice: [{ week: shiftDate(today, -7), at: shiftDate(today, -6), action: 'applied', reason: 'slow' }] });
    expect(weeklyAdvice(p, days, {}, today)).toBeNull();
    expect(weeklyAdvice(p, days, {}, shiftDate(today, 8))).not.toBeNull();
  });
});
