import { describe, expect, it } from 'vitest';
import { chillProgress } from './chill-progress';

describe('Chill 14-day charts', () => {
  it('does not invent numbers from empty records', () => {
    const r = chillProgress({}, '2026-11-26');
    expect(r.weightPoints).toEqual([]);
    expect(r.intakePoints).toEqual([]);
    expect(r.stepsPoints).toEqual([]);
    expect(r.wellbeingPoints).toEqual([]);
    expect(r.weightChange).toBeNull();
    expect(r.averageSteps).toBeNull();
    expect(r.averageFeeling).toBeNull();
  });
  it('shows the actual change and averages across recorded days only', () => {
    const r = chillProgress({
      '2026-11-20': { weight: 77, steps: 10000, wellbeing: 8, kcal: 1700 },
      '2026-11-23': { weight: 76.5, steps: 12000, wellbeing: 6, kcal: 1900 },
      '2026-11-26': { weight: 76.4 },
    }, '2026-11-26');
    expect(r.weightChange).toBeCloseTo(-0.6);
    expect(r.averageSteps).toBe(11000);
    expect(r.averageFeeling).toBe(7);
    expect(r.intakePoints.map(p => p.v)).toEqual([1700, 1900]);
  });
  it('does not claim a weight trend from one measurement', () => {
    expect(chillProgress({ '2026-11-26': { weight: 70 } }, '2026-11-26').weightChange).toBeNull();
  });
  it('uses 4/9/4 if the day has macros but no entered calories', () => {
    const r = chillProgress({ '2026-11-26': { protein: 100, fat: 50, carbs: 150 } }, '2026-11-26');
    expect(r.intakePoints).toEqual([{ d: '2026-11-26', v: 1450 }]);
  });
  it('excludes entries outside the 14-day window', () => {
    const r = chillProgress({ '2026-11-12': { steps: 99 }, '2026-11-13': { steps: 500 } }, '2026-11-26');
    expect(r.stepsPoints).toEqual([{ d: '2026-11-13', v: 500 }]);
  });
});
