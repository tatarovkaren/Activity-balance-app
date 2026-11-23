import { describe, expect, it } from 'vitest';
import { scoreDay } from '../core/dayscore';
import type { DayPlan, Targets } from '../core/targets';
import type { DayEntry, Profile } from '../core/types';
import { i18nFor } from '../i18n/core';
import { reportSummary, reportSvg, wrapText } from './reportsvg';

// День со скрина Карэна (22.11.2026): дефицит, перебор калорий, недобор белка, шагов чуть меньше цели.
const profile = { name: 'Карэн', sex: 'male', heightCm: 178, stepGoal: 14000 } as Profile;
const e: DayEntry = { weight: 70.75, steps: 13089, kcal: 2183, protein: 115, fat: 103, carbs: 212, neck: 37, waist: 85.3, chest: 101.5, biceps: 36.1, hips: 92, wellbeing: 7 } as DayEntry;
const tg = { mode: 'deficit', pct: 0.71, kgPerWeek: -0.5, kcal: 1700, protein: 132, fat: 57, carbs: 165 } as Targets;
const plan = { kind: 'ok', anchor: '2026-11-20', targets: tg, adaptive: null } as unknown as DayPlan;
const now = new Date(2026, 10, 23, 12);
const score = scoreDay(e, '2026-11-22', tg, profile, now);
const base = {
  date: '2026-11-22',
  name: 'Карэн',
  profile,
  e,
  energy: { intake: 2183, total: 2117 } as never,
  adaptive: { E: 2302, reliability: 'low' } as never,
  prevWeight: 70.75,
  plan,
  score,
};

describe('отчёт дня картинкой', () => {
  it('фраза-итог называет причины промаха', () => {
    const s = reportSummary(i18nFor('ru'), score, { fat: 103, carbs: 212, fatT: 57, carbsT: 165 })!;
    expect(s.head).toBe('Мимо цели: 3.');
    expect(s.text).toBe('Перебор калорий +483 за счёт жиров (+46 г) и углеводов (+47 г), не хватило белка 17 г и шагов 911.');
    const en = reportSummary(i18nFor('en'), score, { fat: 103, carbs: 212, fatT: 57, carbsT: 165 })!;
    expect(en.text).toBe('Calories over by 483 from fat (+46 g) and carbs (+47 g), short on protein by 17 g and steps by 911.');
  });

  it('день в цели и день, который идёт', () => {
    const ok = scoreDay({ ...e, kcal: 1700, protein: 140, steps: 15000 }, '2026-11-22', tg, profile, now);
    expect(reportSummary(i18nFor('ru'), ok, {})!.text).toBe('День в цели: калории, белок и шаги.');
    const open = scoreDay({ ...e, kcal: 900 }, '2026-11-23', tg, profile, now);
    expect(reportSummary(i18nFor('ru'), open, {})!.icon).toBe('◷');
  });

  it('рисует шапку, итог, шкалы и плитки; без «▼ 0,00» при неизменном весе', () => {
    const { svg, h } = reportSvg(i18nFor('ru'), base);
    expect(svg).toContain('url(#brand)');
    expect(svg).toContain('! мимо: 3');
    expect(svg).toContain('▲ перебор +483');
    expect(svg).toContain('= 0,00 к вчера');
    expect(svg).not.toContain('▼ 0,00');
    expect(svg).toContain('грудь 101,5 · бицепс 36,1 · бёдра 92');
    expect(h).toBeGreaterThan(500);
  });

  it('для дальтоников — без фирменной шапки, синий/оранжевый', () => {
    const { svg } = reportSvg(i18nFor('ru'), { ...base, colorblind: true });
    expect(svg).not.toContain('url(#brand)"/>');
    expect(svg).toContain('#C75F00');
  });

  it('без цели — плитки без шкал и итога', () => {
    const { svg } = reportSvg(i18nFor('ru'), { ...base, plan: undefined, score: null });
    expect(svg).not.toContain('мимо');
    expect(svg).toContain('Калории');
  });

  it('перенос по словам', () => {
    expect(wrapText('раз два три четыре', 9)).toEqual(['раз два', 'три', 'четыре']);
  });
});
