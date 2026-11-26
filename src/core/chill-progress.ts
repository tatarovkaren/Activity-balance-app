// Compact Chill charts use only recorded diary data. No missing day is treated as zero.
import { shiftDate, type ISODate } from './dates';
import { macroKcal } from './energy';
import type { DayMap } from './types';

export function chillProgress(days: DayMap, to: ISODate) {
  const from = shiftDate(to, -13);
  const dates = Array.from({ length: 14 }, (_, i) => shiftDate(from, i));
  const weightPoints = dates.filter((d) => days[d]?.weight != null).map((d) => ({ d, v: days[d].weight! }));
  const intakePoints = dates.flatMap((d) => {
    const e = days[d];
    if (!e) return [];
    const v = e.kcal ?? macroKcal(e.protein, e.fat, e.carbs);
    return v == null ? [] : [{ d, v: Math.round(v) }];
  });
  const stepsPoints = dates.filter((d) => days[d]?.steps != null).map((d) => ({ d, v: days[d].steps! }));
  const wellbeingPoints = dates.filter((d) => days[d]?.wellbeing != null).map((d) => ({ d, v: days[d].wellbeing! }));
  const weightChange = weightPoints.length >= 2 ? weightPoints[weightPoints.length - 1].v - weightPoints[0].v : null;
  const averageSteps = stepsPoints.length ? Math.round(stepsPoints.reduce((sum, p) => sum + p.v, 0) / stepsPoints.length) : null;
  const averageFeeling = wellbeingPoints.length ? wellbeingPoints.reduce((sum, p) => sum + p.v, 0) / wellbeingPoints.length : null;
  return { from, weightPoints, intakePoints, stepsPoints, wellbeingPoints, weightChange, averageSteps, averageFeeling };
}
