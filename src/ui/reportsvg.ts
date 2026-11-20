// Отчёт дня картинкой (для куратора). Всегда светлая палитра, без полей ввода и кнопок.
// Язык — язык интерфейса автора отчёта.

import type { ISODate } from '../core/dates';
import type { AdaptiveResult } from '../core/adaptive';
import type { EnergyResult } from '../core/energy';
import type { DayEntry, DayMap, Profile } from '../core/types';
import { carriedMeasure, hasMeasurement, navyBodyFat } from '../core/body';
import type { I18n } from '../i18n';
import type { DayPlan } from '../core/targets';
import { pctText } from './targets';
import { workoutName } from './format';
import { LIGHT as t } from './theme';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function reportSvg(
  L: I18n,
  p: {
    date: ISODate;
    name: string;
    profile: Profile;
    e: DayEntry;
    energy: EnergyResult | null;
    adaptive: AdaptiveResult | null;
    prevWeight?: number;
    /** Режим цели: строка плана и «факт / цель» в питании. */
    plan?: DayPlan;
    /** Все дни — чтобы показать последний замер, если за этот день его нет. */
    days?: DayMap;
  },
): { svg: string; w: number; h: number } {
  const { tx, f } = L;
  const R = tx.report;
  const { e, energy, adaptive } = p;
  const tg = p.plan?.kind === 'ok' ? p.plan.targets : null;
  const W = tg ? 680 : 560;
  // [подпись, значение, цвет метки, цвет значения (по умолчанию обычный)]
  const rows: [string, string, string, string?][] = [];
  const dW = e.weight && p.prevWeight ? e.weight - p.prevWeight : null;
  rows.push([
    R.weight,
    e.weight ? f.num(e.weight, 2) + ' ' + tx.common.kg + (dW != null ? `  (${dW <= 0 ? '▼' : '▲'} ${f.num(Math.abs(dW), 2)})` : '') : '—',
    t.blue,
  ]);
  rows.push([R.steps, e.steps ? R.stepsGoal(f.int(e.steps), f.int(p.profile.stepGoal)) : '—', t.green]);
  const kc = energy?.intake;
  const n0 = (v: number | undefined) => f.num(v || 0, 0);
  rows.push([
    R.food,
    tg
      ? R.foodTarget(kc ? f.int(kc) : '—', f.int(tg.kcal), n0(e.protein), f.int(tg.protein), n0(e.fat), f.int(tg.fat), n0(e.carbs), f.int(tg.carbs))
      : kc
        ? R.foodLine(f.int(kc), n0(e.protein), n0(e.fat), n0(e.carbs))
        : '—',
    t.amber,
  ]);
  rows.push([
    R.workout,
    e.workoutMin
      ? R.workoutLine(workoutName(L, e.workoutType, e.workoutKind), e.workoutMin, e.hrAvg ? String(e.hrAvg) : '', e.workoutSteps ? f.int(e.workoutSteps) : '')
      : R.none,
    t.red,
  ]);
  if (energy) {
    const def = energy.total - (kc || 0);
    rows.push([R.spent, R.spentLine(f.int(energy.total), kc ? (def >= 0 ? R.deficit(f.int(def)) : R.surplus(f.int(-def))) : ''), t.amber]);
  }
  if (adaptive?.E != null) rows.push([R.fact, R.factLine(f.int(adaptive.E), tx.common.reliability[adaptive.reliability]), t.amber]);
  if (tg && p.plan?.kind === 'ok') {
    const pace = tg.mode === 'maintain' ? '' : tx.target.pacePart(pctText(L, tg.pct), f.signed(tg.kgPerWeek, 2));
    rows.push([R.plan, R.planLine(tx.target.modeLower[tg.mode], pace, f.dm(p.plan.anchor)), t.amber]);
  }
  const bf = navyBodyFat(p.profile.sex, e, p.profile.heightCm);
  const n = (v: number | undefined) => (v != null ? f.input(v) : '—');
  if (hasMeasurement(e))
    rows.push([R.body, R.bodyLine(n(e.neck), n(e.waist), p.profile.sex === 'female' ? n(e.hips) : null, bf ? f.num(bf) : null), t.teal]);
  else if (p.days) {
    // замера за день нет — последний замер серым, с датой
    const c = carriedMeasure(p.days, p.date, p.profile.sex, p.profile.heightCm);
    if (c && (c.neck || c.waist))
      rows.push([
        R.body,
        R.bodyLine(n(c.neck), n(c.waist), p.profile.sex === 'female' ? n(c.hips) : null, c.bf ? f.num(c.bf.v) : null) +
          (c.bf ? ' · ' + R.carried(f.dm(c.bf.date)) : ''),
        t.teal,
        t.muted,
      ]);
  }
  if (e.anomaly) rows.push([R.unusual, tx.common.reason[e.anomaly], t.violet]);
  if (e.wellbeing) rows.push([R.wellbeing, R.wellbeingLine(e.wellbeing), t.violet]);
  const comment = (e.comment || '').trim();
  const lines: string[] = [];
  if (comment) {
    const words = comment.split(/\s+/);
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).length > 62) {
        lines.push(cur);
        cur = w;
      } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
  }
  const H = 96 + rows.length * 30 + (lines.length ? 24 + lines.length * 18 : 0) + 30;
  let g = `<rect width="${W}" height="${H}" rx="18" fill="#FFFFFF"/>`;
  g += `<text x="24" y="34" font-size="11" letter-spacing="1.5" fill="${t.muted}" font-family="sans-serif">${esc(R.header(p.name.toUpperCase()))}</text>`;
  g += `<text x="24" y="64" font-size="22" font-weight="700" fill="${t.text}" font-family="sans-serif">${esc(tx.day.title(f.dmy(p.date), f.weekday(p.date)))}</text>`;
  let y = 96;
  for (const [k, v, c, vc] of rows) {
    g += `<rect x="24" y="${y - 12}" width="6" height="16" rx="2" fill="${c}"/>`;
    g += `<text x="40" y="${y + 1}" font-size="13" fill="${t.muted}" font-family="sans-serif">${esc(k)}</text>`;
    g += `<text x="170" y="${y + 1}" font-size="14" fill="${vc || t.text}" font-family="ui-monospace, Menlo, monospace">${esc(v)}</text>`;
    y += 30;
  }
  if (lines.length) {
    g += `<text x="24" y="${y + 4}" font-size="13" fill="${t.muted}" font-family="sans-serif">${esc(R.comment)}</text>`;
    y += 24;
    for (const l of lines) {
      g += `<text x="24" y="${y}" font-size="14" fill="${t.text}" font-family="sans-serif">${esc(l)}</text>`;
      y += 18;
    }
  }
  g += `<text x="24" y="${H - 16}" font-size="10" fill="${t.muted}" font-family="sans-serif">${esc(R.footer(tx.app.name))}</text>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`, w: W, h: H };
}
