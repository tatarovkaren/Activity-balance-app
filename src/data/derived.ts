import { useMemo } from 'react';
import { adaptiveTDEE, makeDayModel, type AdaptiveResult } from '../core/adaptive';
import type { ISODate } from '../core/dates';
import { windowStats, PaceIndex, weightNear, type EnergyResult } from '../core/energy';
import type { DayMap, KeepMap, Profile } from '../core/types';

export interface Derived {
  model: ReturnType<typeof makeDayModel>;
  today: EnergyResult | null;
  week: { intake: number; total: number; n: number } | null;
  adaptive: AdaptiveResult | null;
  pace: { pace: number; personal: boolean };
  weight?: number;
}

export function computeDerived(profile: Profile, days: DayMap, keep: KeepMap, sel: ISODate): Derived {
  const ctx = { profile, days };
  const model = makeDayModel(ctx);
  const e = days[sel] || {};
  return {
    model,
    today: model(e, sel),
    week: windowStats(days, sel, 7, (x, d) => model(x, d)),
    adaptive: adaptiveTDEE(sel, ctx, keep),
    pace: new PaceIndex(days).paceBefore(sel),
    weight: weightNear(days, sel),
  };
}

export function useDerived(profile: Profile, days: DayMap, keep: KeepMap, sel: ISODate): Derived {
  return useMemo(() => computeDerived(profile, days, keep, sel), [profile, days, keep, sel]);
}
