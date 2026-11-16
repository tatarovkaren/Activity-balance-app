// «Расход по факту» — адаптивная оценка без необычных дней (ТЗ v35, раздел «Баланс энергии»).
// Ключевая функция продукта: честность важнее скорости реакции.

import { dayDiff, dm, shiftDate, type ISODate } from './dates';
import { lastBodyFat } from './body';
import { dayKcal, energyModel, KCAL_PER_KG, PaceIndex, weightNear, type EnergyResult } from './energy';
import { ANOMALY_LABELS, type DayEntry, type DayMap, type KeepMap, type Profile } from './types';

export const PARAMS = {
  MIN_W: 14, // взвешиваний за 28 дней для полного доверия
  MIN_K: 20, // дней с калориями за 28 дней для полного доверия
  GAP_WARN: 3,
  HALF_LIFE: 14,
  WIN: 56,
  STEP: 50, // максимальный сдвиг показателя за день, ккал
  MAX_DAYS: 400,
  EXCL_SHARE: 0.2,
};

export interface WLSFit {
  slope: number;
  at: (x: number) => number;
}

/** Взвешенный МНК: pts = [x, y, w]. */
export function wls(pts: [number, number, number][]): WLSFit | null {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sw += p[2];
    sx += p[2] * p[0];
    sy += p[2] * p[1];
  }
  if (!sw) return null;
  const mx = sx / sw;
  const my = sy / sw;
  let nu = 0;
  let de = 0;
  for (const p of pts) {
    nu += p[2] * (p[0] - mx) * (p[1] - my);
    de += p[2] * (p[0] - mx) * (p[0] - mx);
  }
  if (!de) return null;
  const b = nu / de;
  return { slope: b, at: (x) => my + b * (x - mx) };
}

export interface ExclItem {
  d: ISODate;
  why: string;
  auto: boolean;
  /** Пояснение автонаходки: «вес +1,3 кг к тренду». */
  t: string;
}

export interface SeriesPoint {
  d: ISODate;
  E: number | null;
  formula: number | null;
  excl: boolean;
}

export type Reliability = 'high' | 'medium' | 'low';

export interface AdaptiveResult {
  E: number | null;
  formula: number | null;
  fact: number | null;
  /** Наклон тренда, кг/день. */
  slope: number | null;
  trendW: number | null;
  alpha: number;
  nW28: number;
  nK28: number;
  nWts: number;
  excl28: number;
  normal28: number;
  exclShare: number;
  reasons: Record<string, number>;
  gap: number;
  reliability: Reliability;
  autoList: { d: ISODate; why: string }[];
  exclList: ExclItem[];
  kept: { d: ISODate; why: string }[];
  recList: ISODate[];
  series: SeriesPoint[];
}

export function reliabilityOf(r: Pick<AdaptiveResult, 'alpha' | 'exclShare' | 'gap'>): Reliability {
  if (r.alpha >= 1 && r.exclShare <= PARAMS.EXCL_SHARE && r.gap < PARAMS.GAP_WARN) return 'high';
  if (r.alpha < 0.5 || r.gap >= PARAMS.GAP_WARN) return 'low';
  return 'medium';
}

export interface ModelCtx {
  profile: Profile;
  days: DayMap;
}

/** Модель расхода для дня с учётом темпа шагов, веса за прошлые дни и % жира. */
export function makeDayModel(ctx: ModelCtx) {
  const pace = new PaceIndex(ctx.days);
  return (e: DayEntry, d: ISODate, fallbackWeight?: number): EnergyResult | null =>
    energyModel(e, d, {
      profile: ctx.profile,
      fallbackWeight: fallbackWeight ?? weightNear(ctx.days, d),
      pace: pace.paceBefore(d),
      bodyFatPct:
        ctx.profile.bmrFormula === 'lean'
          ? lastBodyFat(ctx.days, d, ctx.profile.sex, ctx.profile.heightCm)
          : undefined,
    });
}

export function adaptiveTDEE(sel: ISODate, ctx: ModelCtx, keep: KeepMap): AdaptiveResult | null {
  const { days: all } = ctx;
  const P = PARAMS;
  const model = makeDayModel(ctx);
  const has = (d: ISODate) => {
    const e = all[d];
    return !!e && ((e.weight || 0) > 0 || (dayKcal(e) || 0) > 0);
  };
  const known = Object.keys(all)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= sel && has(d))
    .sort();
  if (!known.length) return null;
  let start = known[0];
  const lim = shiftDate(sel, -P.MAX_DAYS);
  if (start < lim) start = lim;
  const n = dayDiff(start, sel) + 1;
  const days: ISODate[] = [];
  for (let i = 0; i < n; i++) days.push(shiftDate(start, i));

  const W: Record<string, number> = {};
  const K: Record<string, number> = {};
  const man: Record<string, string> = {};
  const F: Record<string, number> = {};
  let lastW = 0;
  for (const d of days) {
    const e = all[d] || {};
    const wv = e.weight || 0;
    W[d] = wv > 0 ? wv : 0;
    if (wv > 0) lastW = wv;
    const k = dayKcal(e) || 0;
    K[d] = k > 0 ? k : 0;
    man[d] = e.anomaly ? ANOMALY_LABELS[e.anomaly] : '';
    const m = all[d] && K[d] > 0 ? model(e, d, lastW || undefined) : null;
    F[d] = m ? m.total : 0;
  }

  // Проход 1: необычные дни (ручные главнее авто), дни восстановления для тренда.
  const excl: Record<string, boolean> = {};
  const why: Record<string, string> = {};
  const auto: Record<string, boolean> = {};
  const rec: Record<string, boolean> = {};
  const autoList: { d: ISODate; why: string }[] = [];
  const kept: { d: ISODate; why: string }[] = [];
  let wRun = 0;
  let exRun = 0;
  let lastExEnd = -99;
  let lastExRun = 0;
  days.forEach((d, i) => {
    if (man[d]) {
      excl[d] = true;
      why[d] = man[d];
    } else {
      let a: { r: string; t: string } | null = null;
      if (W[d] > 0 && wRun < 3) {
        const pts: [number, number, number][] = [];
        for (let j = Math.max(0, i - 21); j < i; j++) {
          const dj = days[j];
          if (W[dj] > 0 && !excl[dj] && !rec[dj]) pts.push([j, W[dj], 1]);
        }
        if (pts.length >= 5) {
          const f = wls(pts);
          if (f) {
            const pred = f.at(i);
            const dv = W[d] - pred;
            if (Math.abs(dv) > Math.max(1.0, 0.015 * pred))
              a = {
                r: 'скачок веса',
                t: 'вес ' + (dv > 0 ? '+' : '−') + Math.abs(dv).toFixed(1).replace('.', ',') + ' кг к тренду',
              };
          }
        }
      }
      if (!a && K[d] > 0) {
        const ks: number[] = [];
        for (let j = Math.max(0, i - 14); j < i; j++) {
          const dj = days[j];
          if (K[dj] > 0 && !excl[dj]) ks.push(K[dj]);
        }
        if (ks.length >= 5) {
          ks.sort((x, y) => x - y);
          const med = ks[Math.floor(ks.length / 2)];
          if (K[d] < 0.5 * med)
            a = { r: 'неполный дневник', t: 'ккал ' + Math.round(K[d]) + ' при обычных ~' + Math.round(med) };
        }
      }
      if (a && !keep[d]) {
        excl[d] = true;
        why[d] = a.r;
        auto[d] = true;
        autoList.push({ d, why: a.t });
      } else if (a && keep[d]) kept.push({ d, why: a.t });
      wRun = a && a.r === 'скачок веса' ? wRun + 1 : 0;
    }
    if (excl[d]) {
      exRun++;
      lastExEnd = i;
      lastExRun = exRun;
    } else {
      exRun = 0;
      if (i - lastExEnd <= (lastExRun >= 2 ? 3 : 2)) rec[d] = true;
    }
  });

  // Проход 2: оценка день за днём.
  let E: number | null = null;
  let out: AdaptiveResult | null = null;
  const series: SeriesPoint[] = [];
  days.forEach((t, i) => {
    const wp: [number, number, number][] = [];
    const kp: [number, number][] = [];
    let nW28 = 0;
    let nK28 = 0;
    let excl28 = 0;
    let normal28 = 0;
    const reasons: Record<string, number> = {};
    for (let j = Math.max(0, i - P.WIN + 1); j <= i; j++) {
      const d = days[j];
      const age = i - j;
      const w = Math.pow(0.5, age / P.HALF_LIFE);
      if (!excl[d] && !rec[d] && W[d] > 0) wp.push([j, W[d], w]);
      if (!excl[d] && K[d] > 0) kp.push([K[d], w]);
      if (age < 28) {
        if (excl[d]) {
          excl28++;
          reasons[why[d]] = (reasons[why[d]] || 0) + 1;
        } else {
          if (W[d] > 0 && !rec[d]) nW28++;
          if (K[d] > 0) nK28++;
          if (W[d] > 0 || K[d] > 0) normal28++;
        }
      }
    }
    let slope: number | null = null;
    let trendW: number | null = null;
    if (wp.length >= 8 && wp[wp.length - 1][0] - wp[0][0] >= 15) {
      const f = wls(wp);
      if (f) {
        slope = f.slope;
        trendW = f.at(i);
      }
    }
    let fact: number | null = null;
    if (slope != null && kp.length) {
      let sw = 0;
      let sk = 0;
      for (const p of kp) {
        sw += p[1];
        sk += p[1] * p[0];
      }
      fact = sk / sw - slope * KCAL_PER_KG;
    }
    const fs: number[] = [];
    for (let j = i; j >= 0 && fs.length < 7 && i - j < 28; j--) {
      const d = days[j];
      if (!excl[d] && F[d] > 0) fs.push(F[d]);
    }
    const formula = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null;
    const exclShare = excl28 / 28;
    let alpha = fact == null ? 0 : Math.min(1, nW28 / P.MIN_W, nK28 / P.MIN_K);
    if (exclShare > P.EXCL_SHARE) alpha *= 0.5;
    if (formula != null) {
      const T = (1 - alpha) * formula + alpha * (fact != null ? fact : formula);
      E = E == null ? formula : E + Math.max(-P.STEP, Math.min(P.STEP, T - E));
    }
    if (n - 1 - i < P.WIN) series.push({ d: t, E, formula, excl: !!excl[t] });
    if (i === n - 1) {
      let gapW = 0;
      let runW = 0;
      let gapK = 0;
      let runK = 0;
      for (let j = Math.max(0, i - 27); j <= i; j++) {
        const d = days[j];
        if (W[d] > 0) runW = 0;
        else {
          runW++;
          gapW = Math.max(gapW, runW);
        }
        if (K[d] > 0) runK = 0;
        else {
          runK++;
          gapK = Math.max(gapK, runK);
        }
      }
      const first28 = Math.max(0, i - 27);
      const gapLimit = i - first28 + 1;
      const base = {
        E,
        formula,
        fact,
        slope,
        alpha,
        nW28,
        nK28,
        nWts: wp.length,
        excl28,
        normal28,
        exclShare,
        reasons,
        gap: Math.min(Math.max(gapW, gapK), gapLimit),
        trendW,
      };
      out = {
        ...base,
        reliability: reliabilityOf(base),
        autoList: autoList.filter((a) => dayDiff(a.d, sel) < 28),
        exclList: days
          .filter((d) => excl[d] && dayDiff(d, sel) < 28)
          .map((d) => ({
            d,
            why: why[d],
            auto: !!auto[d],
            t: autoList.find((a) => a.d === d)?.why || '',
          })),
        kept: kept.filter((a) => dayDiff(a.d, sel) < 28),
        recList: days.filter((d) => rec[d] && dayDiff(d, sel) < 28),
        series,
      };
    }
  });
  return out;
}

// ---- Прогноз даты цели ----

export type GoalForecast =
  | { kind: 'noGoal' }
  | { kind: 'noWeight'; goal: number }
  | { kind: 'reached'; goal: number }
  | { kind: 'noTrend'; goal: number }
  | { kind: 'notApproaching'; goal: number; paceKgWeek: number; current: number }
  | { kind: 'tooLong'; goal: number; paceKgWeek: number }
  | {
      kind: 'date';
      goal: number;
      date: ISODate;
      days: number;
      paceKgWeek: number;
      left: number;
      rough: boolean;
    };

export function goalForecast(
  r: AdaptiveResult | null,
  sel: ISODate,
  goal: number | undefined,
  currentWeight: number | undefined,
): GoalForecast {
  if (!goal) return { kind: 'noGoal' };
  const cur = (r && r.trendW) || currentWeight;
  if (!cur) return { kind: 'noWeight', goal };
  const need = goal - cur;
  if (Math.abs(need) < 0.1) return { kind: 'reached', goal };
  if (!r || r.slope == null) return { kind: 'noTrend', goal };
  const wk = r.slope * 7;
  if (Math.sign(wk) !== Math.sign(need) || Math.abs(wk) < 0.05)
    return { kind: 'notApproaching', goal, paceKgWeek: wk, current: cur };
  const days = Math.round(need / r.slope);
  if (days > 730) return { kind: 'tooLong', goal, paceKgWeek: wk };
  return { kind: 'date', goal, date: shiftDate(sel, days), days, paceKgWeek: wk, left: need, rough: r.alpha < 1 };
}

export const fmtSignedKg = (v: number, digits = 2) =>
  (v > 0 ? '+' : '−') + Math.abs(v).toFixed(digits).replace('.', ',');

export const fmtKg = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

export { dm };
