// Тексты режима и целей КБЖУ на языке интерфейса. Ядро (core/targets) отдаёт числа и коды.

import type { GoalForecast } from '../core/adaptive';
import { DEFAULT_PACE_PCT } from '../core/targets';
import type { DayPlan, GoalSetting, PlanForecast, SettingError, Targets, Tone } from '../core/targets';
import type { I18n } from '../i18n/core';
import type { Palette } from './theme';
import { goalText } from './format';

/** Процент без лишних нулей: 0,5 / 0,25 / 0,41. */
export const pctText = (L: I18n, v: number) => L.f.input(Math.round(v * 100) / 100);

export function settingErrorText(L: I18n, e: SettingError): string {
  const E = L.tx.target.errors;
  switch (e.code) {
    case 'paceHigh':
      return E.paceHigh(pctText(L, e.max));
    case 'paceLow':
      return E.paceLow(pctText(L, e.min));
    case 'proteinRange':
      return E.proteinRange(L.f.input(e.min), L.f.input(e.max));
    case 'proteinWeightRange':
      return E.proteinWeightRange(L.f.input(e.min), L.f.input(e.max));
    case 'kcalRange':
      return E.kcalRange(L.f.int(e.min), L.f.int(e.max));
    default:
      return E[e.code];
  }
}

function pacePart(L: I18n, t: Pick<Targets, 'mode' | 'pct' | 'kgPerWeek' | 'manual'>): string {
  return t.mode === 'maintain' && !t.manual ? '' : L.tx.target.pacePart(pctText(L, t.pct), L.f.signed(t.kgPerWeek, 2));
}

/** «План: дефицит 0,5 %/нед (−0,36 кг) → 1870 ккал · Б 116 · Ж 57 · У 223 · с 17.11». */
export function planLine(L: I18n, p: DayPlan): string {
  const T = L.tx.target;
  if (p.kind === 'none') return T.noGoal;
  if (p.kind === 'noData') return T.noData;
  if (p.kind === 'error') return settingErrorText(L, p.error);
  const t = p.targets;
  const { int } = L.f;
  return T.planLine(T.modeLower[t.mode], pacePart(L, t), int(t.kcal), int(t.protein), int(t.fat), int(t.carbs), L.f.dm(p.anchor));
}

/** Пояснения к планке: темп от даты, белок, предупреждения. */
export function planNotes(L: I18n, t: Targets): { text: string; warn: boolean }[] {
  const T = L.tx.target;
  const out: { text: string; warn: boolean }[] = [];
  if (t.pace.clamped) out.push({ text: T.clamped(pctText(L, t.pace.clamped.max), L.f.dmy(t.pace.clamped.realDate)), warn: true });
  else if (t.pace.fromDate) out.push({ text: T.fromDate(pctText(L, t.pct)), warn: false });
  if (t.manual) out.push({ text: T.manualNote(pctText(L, Math.round(t.pct * 100) / 100)), warn: false });
  if (t.proteinBasis === 'weight') out.push({ text: T.proteinNoMeasure(L.f.num(t.proteinCoef, 1)), warn: false });
  for (const w of t.warnings)
    out.push({ text: w === 'floored' ? T.warn.floored(L.f.int(t.floor ?? t.kcal)) : T.warn[w], warn: w !== 'start' });
  return out;
}

export function basisLine(L: I18n, t: Targets): string {
  const T = L.tx.target;
  const lean = t.leanMass != null ? ' · ' + T.proteinLean(L.f.num(t.proteinCoef, 1), L.f.num(t.leanMass, 1)) : '';
  return T.basis(L.f.int(t.E), L.f.num(t.weight, 1), t.weightSource === 'trend') + lean;
}

export function historyLine(L: I18n, g: GoalSetting): string {
  const T = L.tx.target;
  const pace =
    g.mode === 'maintain'
      ? ''
      : g.targetDate
        ? T.historyDate(L.f.dmy(g.targetDate))
        : T.paceOnly(pctText(L, g.pacePct ?? DEFAULT_PACE_PCT[g.mode]));
  const kcal = g.kcalManual != null ? T.historyKcal(L.f.int(g.kcalManual)) : '';
  return T.historyLine(L.f.dmy(g.start), T.modeLower[g.mode], (g.kcalManual != null && g.mode !== 'maintain' ? '' : pace) + kcal, g.by === 'curator');
}

export function planForecastText(L: I18n, p: PlanForecast): string {
  const T = L.tx.target;
  const { tx, f } = L;
  switch (p.kind) {
    case 'none':
      return T.forecastPlanNone;
    case 'reached':
      return T.forecastPlanReached;
    case 'wrongWay':
      return T.forecastPlanWrong;
    case 'date':
      return T.forecastPlan(f.dmy(p.date), p.days < 14 ? tx.common.days(p.days) : tx.common.weeks(Math.round(p.days / 7)));
  }
}

export function factForecastText(L: I18n, g: GoalForecast): string {
  return L.tx.target.forecastFact + goalText(L, g);
}

export function toneColor(t: Palette, tone: Tone): string {
  return tone === 'ok' ? t.green : tone === 'warn' ? t.amber : tone === 'bad' ? t.red : t.muted;
}
