import { describe, expect, it } from 'vitest';
import {
  activeGoal,
  anchorDate,
  computeTargets,
  dayPlan,
  factLags,
  fatTone,
  kcalTone,
  mondayOf,
  planForecast,
  proteinTone,
  resolvePace,
  validateSetting,
  withGoal,
  type GoalSetting,
  type TargetInput,
  type Targets,
} from './targets';
import { shiftDate } from './dates';
import { mifflin } from './energy';
import { DEFAULT_PROFILE, type DayMap, type Profile } from './types';

// Проверка из ТЗ v36, раздел 8: данные автора на 17.11.2026.
const base: Omit<TargetInput, 'setting'> = {
  E: 2268,
  weight: 71.8,
  weightSource: 'trend',
  bodyFatPct: 19.5,
  sex: 'male',
  age: 48,
  heightCm: 170,
  asOf: '2026-11-17',
};
const goal = (s: Partial<GoalSetting>): GoalSetting => ({ start: '2026-11-17', mode: 'deficit', ...s });
const calc = (s: Partial<GoalSetting>, extra: Partial<TargetInput> = {}) => {
  const r = computeTargets({ ...base, ...extra, setting: goal(s) });
  if ('error' in r) throw new Error(r.error.code);
  return r;
};
const macros = (t: Targets) => [t.kcal, t.protein, t.fat, t.carbs];

describe('цели КБЖУ: проверочные числа ТЗ (E 2268, 71,8 кг, жир 19,5 %)', () => {
  it('БМР ≈ 1546, сухая масса 57,8', () => {
    expect(Math.round(mifflin('male', 71.8, 170, 48))).toBe(1546);
    expect(calc({}).leanMass!.toFixed(1)).toBe('57.8');
  });
  it('дефицит 0,25 % → −0,18 кг/нед, 2070, Б 116 / Ж 57 / У 273', () => {
    const t = calc({ pacePct: 0.25 });
    expect(t.kgPerWeek.toFixed(2)).toBe('-0.18');
    expect(macros(t)).toEqual([2070, 116, 57, 273]);
  });
  it('дефицит 0,5 % (по умолчанию) → −0,36 кг/нед, 1870, Б 116 / Ж 57 / У 223', () => {
    const t = calc({});
    expect(t.pct).toBe(0.5);
    expect(t.kgPerWeek.toFixed(2)).toBe('-0.36');
    expect(macros(t)).toEqual([1870, 116, 57, 223]);
    expect(t.warnings).toEqual([]);
  });
  it('дефицит 0,75 % → −0,54 кг/нед, 1680, Б 116 / Ж 57 / У 176', () => {
    const t = calc({ pacePct: 0.75 });
    expect(t.kgPerWeek.toFixed(2)).toBe('-0.54');
    expect(macros(t)).toEqual([1680, 116, 57, 176]);
  });
  it('поддержание → 2270, Б 104 / Ж 57 / У 335', () => {
    const t = calc({ mode: 'maintain' });
    expect(t.kgPerWeek).toBe(0);
    expect(macros(t)).toEqual([2270, 104, 57, 335]);
  });
  it('профицит 0,1 % (по умолчанию) → +0,07 кг/нед, 2350, Б 104 / Ж 57 / У 355', () => {
    const t = calc({ mode: 'surplus' });
    expect(t.kgPerWeek.toFixed(2)).toBe('0.07');
    expect(macros(t)).toEqual([2350, 104, 57, 355]);
  });
  it('профицит 0,25 % → 2470, У 385', () => {
    const t = calc({ mode: 'surplus', pacePct: 0.25 });
    expect(t.kcal).toBe(2470);
    expect(t.carbs).toBe(385);
  });
  it('дефицит 1,5 % — отклонить (максимум 1 %)', () => {
    expect(validateSetting({ mode: 'deficit', pacePct: 1.5 })).toEqual({ code: 'paceHigh', max: 1 });
    const r = computeTargets({ ...base, setting: goal({ pacePct: 1.5 }) });
    expect('error' in r && r.error.code).toBe('paceHigh');
    expect(validateSetting({ mode: 'deficit', pacePct: 1 })).toBeNull();
  });
  it('ккал 1500 при БМР 1546 — предупреждение', () => {
    const t = calc({}, { E: 1895 }); // 1895 − 395 = 1500
    expect(t.kcal).toBe(1500);
    expect(t.warnings).toContain('belowBmr');
  });
});

describe('цели КБЖУ: правила', () => {
  it('у женщин БМР −161: 1530 ккал ниже БМР мужчины (1546), но не женщины (1380)', () => {
    const m = calc({}, { E: 1920 });
    const f = calc({}, { sex: 'female', E: 1920 });
    expect(m.kcal).toBe(1530);
    expect(f.bmr).toBeCloseTo(1545.5 - 166, 5);
    expect(m.warnings).toContain('belowBmr');
    expect(f.warnings).not.toContain('belowBmr');
  });
  it('без замеров белок 1,6 г на кг веса', () => {
    const t = calc({}, { bodyFatPct: undefined });
    expect(t.proteinBasis).toBe('weight');
    expect(t.protein).toBe(115); // 1,6 × 71,8
  });
  it('свой коэффициент белка 1,6–3,0', () => {
    expect(calc({ proteinPerLean: 2.2 }).protein).toBe(127);
    expect(validateSetting({ mode: 'deficit', proteinPerLean: 3.5 })?.code).toBe('proteinRange');
  });
  it('безопасный минимум: не ниже 1500 ккал (мужчины) / 1200 (женщины), углеводов не меньше 50 г', () => {
    const t = calc({}, { E: 1100 });
    expect(t.kcal).toBe(1500);
    expect(t.floor).toBe(1500);
    expect(t.warnings).toContain('floored');
    expect(t.warnings).toContain('belowBmr');
    expect(t.carbs).toBeGreaterThanOrEqual(50);
    expect(t.kgPerWeek).toBe(0); // расход ниже минимума — снижения по плану нет
    const f = calc({}, { E: 900, sex: 'female' });
    expect(f.kcal).toBe(1200);
    expect(f.carbs).toBeGreaterThanOrEqual(50);
    expect(f.fat).toBeGreaterThanOrEqual(43);
  });
  it('минимум поднимает планку, если белка и жиров много: углеводы ≥ 50 г', () => {
    const t = calc({}, { E: 1700, weight: 120, bodyFatPct: undefined });
    // белок 192, жиры не ниже 72 → минимум 192×4 + 72×9 + 200 = 1616 → 1620
    expect(t.carbs).toBeGreaterThanOrEqual(50);
    expect(t.kcal).toBeGreaterThanOrEqual(1620);
  });
  it('у мужчины 1500 при расходе 1895 — без подъёма, только «ниже обмена»', () => {
    const t = calc({}, { E: 1895 });
    expect(t.floor).toBeUndefined();
    expect(t.warnings).not.toContain('floored');
  });
  it('низкая надёжность — «цель грубая»', () => {
    expect(calc({}, { reliability: 'low' }).warnings).toContain('rough');
  });
  it('темп от даты цели: 68 кг к 15.02.2027', () => {
    const p = resolvePace({ mode: 'deficit', targetDate: '2027-02-15' }, 71.8, 68, '2026-11-17');
    // 3,8 кг за 90 дн. ≈ 12,86 нед → 0,41 %/нед
    expect(p.pct.toFixed(2)).toBe('0.41');
    expect(p.clamped).toBeUndefined();
  });
  it('к дате не успеть — темп 1 %/нед и реальная дата', () => {
    const p = resolvePace({ mode: 'deficit', targetDate: '2026-12-01' }, 71.8, 66.6, '2026-11-17');
    expect(p.pct).toBe(1);
    // 5,2 кг / 0,718 кг/нед = 7,24 нед = 51 день
    expect(p.clamped?.realDate).toBe(shiftDate('2026-11-17', 51));
    const s = resolvePace({ mode: 'surplus', targetDate: '2026-12-01' }, 71.8, 75, '2026-11-17');
    expect(s.pct).toBe(0.5);
  });
  it('дата цели: нет целевого веса, дата прошла, цель не в ту сторону', () => {
    expect(resolvePace({ mode: 'deficit', targetDate: '2027-01-01' }, 71.8, undefined, '2026-11-17').error?.code).toBe('needGoalWeight');
    expect(resolvePace({ mode: 'deficit', targetDate: '2026-11-01' }, 71.8, 68, '2026-11-17').error?.code).toBe('datePast');
    expect(resolvePace({ mode: 'deficit', targetDate: '2027-01-01' }, 71.8, 75, '2026-11-17').error?.code).toBe('dateWrongWay');
  });
  it('факт / цель: цвета', () => {
    expect(kcalTone(1960, 1870)).toBe('ok'); // +4,8 %
    expect(kcalTone(2040, 1870)).toBe('warn'); // +9,1 %
    expect(kcalTone(2100, 1870)).toBe('bad');
    expect(kcalTone(undefined, 1870)).toBe('none');
    expect(proteinTone(128, 116)).toBe('ok');
    expect(proteinTone(105, 116)).toBe('warn');
    expect(proteinTone(100, 116)).toBe('bad');
    expect(fatTone(42, 71.8)).toBe('bad');
    expect(fatTone(50, 71.8)).toBe('none');
  });
  it('два прогноза: по плану и подсказка, если факт отстаёт больше 30 %', () => {
    const t = calc({});
    const p = planForecast(t, 68, 71.8, '2026-11-17');
    expect(p.kind).toBe('date');
    if (p.kind !== 'date') return;
    expect(p.days).toBe(Math.ceil((3.8 / 0.359) * 7)); // 75 дн.
    expect(factLags(p, { kind: 'date', days: 90 })).toBe(false);
    expect(factLags(p, { kind: 'date', days: 100 })).toBe(true);
    expect(factLags(p, { kind: 'notApproaching' })).toBe(true);
    expect(planForecast(calc({ mode: 'maintain' }), 68, 71.8, '2026-11-17').kind).toBe('none');
    expect(planForecast(t, 75, 71.8, '2026-11-17').kind).toBe('wrongWay');
  });
});

describe('цели КБЖУ: история режимов и пересчёт по понедельникам', () => {
  it('понедельник недели', () => {
    expect(mondayOf('2026-11-17')).toBe('2026-11-16'); // вторник
    expect(mondayOf('2026-11-16')).toBe('2026-11-16');
    expect(mondayOf('2026-11-22')).toBe('2026-11-16'); // воскресенье
  });
  it('история: действует последний режим с началом не позже даты; правка в тот же день заменяет', () => {
    let h = withGoal(undefined, goal({ start: '2026-11-01', pacePct: 0.25 }));
    h = withGoal(h, goal({ start: '2026-11-17', mode: 'maintain' }));
    h = withGoal(h, goal({ start: '2026-11-17', mode: 'surplus' }));
    expect(h.length).toBe(2);
    expect(activeGoal(h, '2026-11-10')?.pacePct).toBe(0.25);
    expect(activeGoal(h, '2026-11-20')?.mode).toBe('surplus');
    expect(activeGoal(h, '2026-10-01')).toBeUndefined();
  });
  it('дата отсчёта: понедельник, смена режима или ручной пересчёт', () => {
    const g = goal({ start: '2026-11-04' });
    expect(anchorDate('2026-11-19', g, [])).toBe('2026-11-16');
    expect(anchorDate('2026-11-19', goal({ start: '2026-11-18' }), [])).toBe('2026-11-18');
    expect(anchorDate('2026-11-19', g, ['2026-11-17', '2026-11-20'])).toBe('2026-11-17');
    expect(anchorDate('2026-11-24', g, ['2026-11-17'])).toBe('2026-11-23');
  });

  // Ровный дневник: вес снижается на 0,5 кг/нед, 1900 ккал в день.
  const days: DayMap = {};
  for (let i = 0; i < 60; i++) {
    const d = shiftDate('2026-09-20', i);
    days[d] = { weight: Math.round((76 - (0.5 / 7) * i) * 10) / 10, kcal: 1900, protein: 120, fat: 60, carbs: 220, steps: 9000 };
  }
  days['2026-11-02'] = { ...days['2026-11-02'], neck: 39, waist: 86 };
  const prof: Profile = { ...DEFAULT_PROFILE, sex: 'male', birthDate: '1978-06-20', heightCm: 170, goalWeightKg: 68, goals: [goal({ start: '2026-11-01' })] };

  it('планка не меняется внутри недели от новых записей', () => {
    const a = dayPlan(prof, days, {}, '2026-11-17');
    const b = dayPlan(prof, { ...days, '2026-11-17': { weight: 60, kcal: 4000 } }, {}, '2026-11-18');
    expect(a.kind).toBe('ok');
    expect(b.kind).toBe('ok');
    if (a.kind !== 'ok' || b.kind !== 'ok') return;
    expect(a.anchor).toBe('2026-11-16');
    expect(b.targets.kcal).toBe(a.targets.kcal);
    expect(a.targets.proteinBasis).toBe('lean');
    // расход по факту ≈ 1900 + 0,5 кг/нед × 7700 / 7 ≈ 2450, минус 0,5 %
    expect(a.targets.kcal).toBeGreaterThan(1800);
    expect(a.targets.kcal).toBeLessThan(2200);
  });
  it('без режима — нет планки; без данных — «нужны данные»', () => {
    expect(dayPlan({ ...prof, goals: [] }, days, {}, '2026-11-17').kind).toBe('none');
    expect(dayPlan(prof, {}, {}, '2026-11-17').kind).toBe('noData');
  });

  it('только вес на сегодня (ошибка 19.11.2026: 950 ккал, углеводы 2 г) — стартовая оценка БМР × 1,4', () => {
    const p: Profile = { ...prof, goals: [goal({ start: '2026-11-19', pacePct: 0.75 })] };
    const r = dayPlan(p, { '2026-11-19': { weight: 71 } }, {}, '2026-11-19');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const t = r.targets;
    // БМР 1537,5 × 1,4 ≈ 2153; −0,75 % от 71 кг ≈ −586 ккал/день
    expect(Math.round(t.E)).toBe(2153);
    expect(t.kcal).toBe(1570);
    expect(t.protein).toBe(114); // 1,6 × 71
    expect(t.fat).toBe(57);
    expect(t.carbs).toBeGreaterThan(130);
    expect(t.warnings).toContain('start');
    expect(t.warnings).not.toContain('rough');
  });
  it('дневник без шагов занижает расход — не ниже БМР × 1,2', () => {
    const d: DayMap = {};
    for (let i = 0; i < 10; i++) d[shiftDate('2026-11-05', i)] = { weight: 71, kcal: 900 };
    const r = dayPlan({ ...prof, goals: [goal({ start: '2026-11-10' })] }, d, {}, '2026-11-14');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.targets.E).toBeGreaterThanOrEqual(mifflin('male', r.targets.weight, 170, 48) * 1.2 - 1);
    expect(r.targets.kcal).toBeGreaterThanOrEqual(1500);
  });
  it('без роста — «заполните профиль»', () => {
    expect(dayPlan({ ...prof, heightCm: 0 }, days, {}, '2026-11-17').kind).toBe('noData');
  });

  it('без замера белок — свой коэффициент на кг веса (жалоба 19.11: коэффициент ничего не менял)', () => {
    const t = calc({ proteinPerKg: 2.2 }, { bodyFatPct: undefined });
    expect(t.proteinBasis).toBe('weight');
    expect(t.proteinCoef).toBe(2.2);
    expect(t.protein).toBe(158); // 2,2 × 71,8
    // коэффициент на сухую массу без замера не используется, на кг веса при замере — тоже
    expect(calc({ proteinPerLean: 2.5 }, { bodyFatPct: undefined }).protein).toBe(115);
    expect(calc({ proteinPerKg: 2.2 }).protein).toBe(116);
    expect(validateSetting({ mode: 'deficit', proteinPerKg: 1.5 })?.code).toBe('proteinWeightRange'); // минимум 1,6
    expect(validateSetting({ mode: 'deficit', proteinPerKg: 1.6 })).toBeNull();
    expect(calc({ proteinPerKg: 1.6 }, { bodyFatPct: undefined }).protein).toBe(115);
  });
  it('своя планка ккал: БЖУ от неё, темп и дата цели пересчитаны', () => {
    const t = calc({ kcalManual: 1700, pacePct: 0.25 });
    expect(t.manual).toBe(true);
    expect(macros(t)).toEqual([1700, 116, 57, 181]);
    // (1700 − 2268) × 7 / 7700 ≈ −0,52 кг/нед ≈ 0,72 %
    expect(t.kgPerWeek.toFixed(2)).toBe('-0.52');
    expect(t.pct.toFixed(2)).toBe('0.72');
    const f = planForecast(t, 68, 71.8, '2026-11-17');
    expect(f.kind).toBe('date');
    // в поддержании своя планка тоже даёт прогноз
    const m = calc({ mode: 'maintain', kcalManual: 2000 });
    expect(planForecast(m, 68, 71.8, '2026-11-17').kind).toBe('date');
  });
  it('своя планка не ниже безопасного минимума; вне 1000–5000 — отклонить', () => {
    const t = calc({ kcalManual: 1100 });
    expect(t.kcal).toBe(1500);
    expect(t.warnings).toContain('floored');
    expect(calc({ kcalManual: 1000 }, { E: 2268 }).warnings).toContain('floored');
    expect(validateSetting({ mode: 'deficit', kcalManual: 900 })?.code).toBe('kcalRange');
    expect(calc({ kcalManual: 1100 }, { sex: 'female' }).kcal).toBeGreaterThanOrEqual(1200);
  });
  it('своя планка с большим дефицитом — «темп выше 1 %»', () => {
    expect(calc({ kcalManual: 1500 }, { E: 2600 }).warnings).toContain('paceHigh');
  });
});
