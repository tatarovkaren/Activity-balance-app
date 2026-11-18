// Тексты «расхода по факту» и прогноза цели на языке интерфейса. Ядро (core/adaptive) отдаёт
// коды и числа, здесь они превращаются в строки через словарь (src/i18n).

import { PARAMS, type AdaptiveResult, type AutoDetail, type ExclReason, type GoalForecast } from '../core/adaptive';
import type { I18n } from '../i18n/core';

export function reasonText(L: I18n, r: ExclReason): string {
  return L.tx.common.reason[r];
}

export function detailText(L: I18n, d: AutoDetail | undefined): string {
  if (!d) return '';
  return d.kind === 'weightJump' ? L.tx.fact.detailWeight(L.f.signed(d.dv, 1)) : L.tx.fact.detailKcal(L.f.int(d.kcal), L.f.int(d.usual));
}

export function factLine(L: I18n, r: AdaptiveResult): string {
  return r.slope != null ? L.tx.fact.factLine(r.nWts, L.f.signed(r.slope * 7)) : L.tx.fact.factLineEmpty;
}

export function calibLine(L: I18n, r: AdaptiveResult): { main: string; sub: string } {
  const { tx, f } = L;
  if (r.alpha > 0 && r.E != null) {
    const diff = r.formula ? (r.formula / r.E - 1) * 100 : 0;
    const pct = Math.round(Math.abs(diff));
    const cmp = Math.abs(diff) < 5 ? tx.fact.cmpSame : diff > 0 ? tx.fact.cmpOver(pct) : tx.fact.cmpUnder(pct);
    return { main: `${f.int(r.E)} ${tx.common.kcalPerDay}`, sub: tx.fact.byFact(r.formula ? f.int(r.formula) : '—', cmp) };
  }
  if (r.formula)
    return {
      main: `${f.int(r.formula)} ${tx.common.kcalPerDay}`,
      sub: tx.fact.byFormula(r.nW28, PARAMS.MIN_W, r.nK28, PARAMS.MIN_K),
    };
  return { main: '—', sub: tx.fact.needData };
}

export function reliabilityDetails(L: I18n, r: AdaptiveResult): string {
  const reasons = (Object.keys(r.reasons) as ExclReason[]).map((k) => reasonText(L, k) + ' ' + r.reasons[k]).join(', ');
  return L.tx.fact.relDetails(r.normal28, r.excl28, reasons, r.gap);
}

export function goalText(L: I18n, g: GoalForecast): string {
  const { tx, f } = L;
  const gs = (v: number) => f.num(v, 1);
  switch (g.kind) {
    case 'noGoal':
      return tx.goal.noGoal;
    case 'noWeight':
      return tx.goal.noWeight(gs(g.goal));
    case 'reached':
      return tx.goal.reached(gs(g.goal));
    case 'noTrend':
      return tx.goal.noTrend(gs(g.goal));
    case 'notApproaching':
      return tx.goal.notApproaching(gs(g.goal), f.signed(g.paceKgWeek), f.num(g.current));
    case 'tooLong':
      return tx.goal.tooLong(gs(g.goal), f.signed(g.paceKgWeek));
    case 'date':
      return tx.goal.date(
        gs(g.goal),
        f.dmy(g.date),
        g.days < 14 ? tx.common.days(g.days) : tx.common.weeks(Math.round(g.days / 7)),
        f.signed(g.paceKgWeek),
        f.num(Math.abs(g.left), 2),
        g.rough,
      );
  }
}

/** Короткий текст для колонки «До цели» в кабинете куратора. */
export function goalShort(L: I18n, g: GoalForecast): string {
  const { tx, f } = L;
  return g.kind === 'date'
    ? f.dmy(g.date)
    : g.kind === 'reached'
      ? tx.goal.shortReached
      : g.kind === 'notApproaching'
        ? tx.goal.shortNotApproaching
        : g.kind === 'noTrend'
          ? tx.goal.shortNoTrend
          : '—';
}

/** Итог импорта FatSecret на языке интерфейса. */
export function importSummaryText(L: I18n, s: { added: number; updated: number; skipped: number; from?: string; to?: string }): string {
  const n = s.added + s.updated;
  if (!n) return L.tx.importSummary.none(s.skipped);
  const range = s.from && s.to ? (s.from === s.to ? L.f.dm(s.from) : `${L.f.dm(s.from)}–${L.f.dm(s.to)}`) : '';
  return L.tx.importSummary.done(n, range, s.added, s.updated, s.skipped);
}

/** Подпись тренировки для куратора и отчёта: «Кардио · бег», «Силовая», «бег» (старые записи). */
export function workoutName(L: I18n, name: string | undefined, kind: 'cardio' | 'strength' | undefined): string {
  const k = kind ? L.tx.day.workout[kind] : '';
  const n = (name || '').trim();
  if (k && n && n.toLowerCase() !== k.toLowerCase()) return `${k} · ${n}`;
  return n || k || L.tx.report.workoutFallback;
}
