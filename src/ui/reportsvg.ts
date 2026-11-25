// Отчёт дня картинкой (для куратора): Dark Premium; специальная палитра для дальтоников остаётся светлой.
// Вид — вариант A «шкалы с коридором» + фраза-итог, фирменная бирюзовая шапка (решение Карэна 23.11.2026,
// макеты design/day-report/). При «Цветах для дальтоников» — синий/оранжевый и светлая шапка.
// Цвет никогда не единственный признак: у статусов всегда значок и слово, промах — штриховка.
// Язык — язык интерфейса автора отчёта.

import type { ISODate } from '../core/dates';
import type { AdaptiveResult } from '../core/adaptive';
import type { EnergyResult } from '../core/energy';
import type { DayEntry, DayMap, Profile } from '../core/types';
import { carriedMeasure, extraMeasureKeys, hasMeasurement, navyBodyFat } from '../core/body';
import { DAY_CLOSE_HOUR, type DayScore, type MetricScore, type ScoreTone } from '../core/dayscore';
import type { I18n } from '../i18n';
import type { DayPlan, GoalMode } from '../core/targets';
import { pctText } from './targets';
import { workoutName } from './format';
import { colorblind, DARK, LIGHT, type Palette } from './palette';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FONT = 'Inter, -apple-system, &quot;Segoe UI&quot;, Roboto, Arial, sans-serif';
const W = 600;
const PAD = 26;
const IW = W - PAD * 2;
/** Фирменная шапка: бирюзовый градиент. */
const BRAND = ['#07343C', '#087C82'];
/** Палитра только для экспортируемой картинки — UI приложения не меняется. */
const REPORT_DARK: Palette = {
  ...DARK, bg: '#0B1720', card: '#1B303B', text: '#F5F8FA', muted: '#B2C2CC',
  teal: '#299DAD', green: '#43CA96', warn: '#E9AA4B', amber: '#E9AA4B',
  red: '#EF6570', blue: '#55B6DE',
};

type Kind = 'kcal' | 'protein' | 'steps';

export interface ReportInput {
  date: ISODate;
  name: string;
  profile: Profile;
  e: DayEntry;
  energy: EnergyResult | null;
  adaptive: AdaptiveResult | null;
  prevWeight?: number;
  /** Режим цели: строка плана, шкалы и «факт / цель». */
  plan?: DayPlan;
  /** Итог дня по цели (как на экране «День»). */
  score?: DayScore | null;
  /** Все дни — чтобы показать последний замер, если за этот день его нет. */
  days?: DayMap;
  /** Цвета для дальтоников (Профиль → «Цвета»). */
  colorblind?: boolean;
}

export function toneColor(t: Palette, tone: ScoreTone): string {
  return tone === 'ok' ? t.green : tone === 'warn' ? t.warn : tone === 'bad' ? t.red : tone === 'progress' ? t.progress : t.muted;
}

/** Цвет баланса по режиму цели (как «Баланс» на экране «День»). */
function balanceTone(mode: GoalMode | undefined, deficit: number, total: number): ScoreTone {
  if (mode === 'surplus') return deficit <= 0 ? 'ok' : 'bad';
  if (mode === 'maintain') return Math.abs(deficit) <= total * 0.1 ? 'ok' : 'warn';
  return deficit >= 0 ? 'ok' : 'bad';
}

/** Перенос по словам: грубо по числу знаков (SVG не умеет переносить сам). */
export function wrapText(s: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) {
      out.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) out.push(cur);
  return out;
}

/** «а, б и в» — перечисление с союзом языка. */
const list = (a: string[], and: string) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' ' + and + ' ' + a[a.length - 1]);

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export interface ReportSummary {
  /** Жирное начало: «Мимо цели: 3.» (пусто, если день в цели или идёт). */
  head: string;
  text: string;
  icon: string;
  tone: ScoreTone;
}

/** Фраза-итог: «Мимо цели: 3. Перебор калорий +483 за счёт жиров (+46 г) и углеводов (+47 г), не хватило белка 17 г и шагов 911.» */
export function reportSummary(L: I18n, s: DayScore, macros: { fat?: number; carbs?: number; fatT?: number; carbsT?: number }): ReportSummary | null {
  const { f } = L;
  const S = L.tx.report.summary;
  if (s.verdict === 'noData') return null;
  if (s.verdict === 'open') return { head: '', text: S.open(String(DAY_CLOSE_HOUR) + ':00'), icon: '◷', tone: 'progress' };
  if (s.verdict === 'ok') return { head: '', text: S.ok(s.steps.status !== 'none'), icon: '✓', tone: 'ok' };
  const parts: string[] = [];
  const shorts: string[] = [];
  const abs = (v: number | undefined) => f.int(Math.abs(v || 0));
  const k = s.kcal;
  if (k.status === 'over') {
    const causes: string[] = [];
    if (macros.fat != null && macros.fatT && macros.fat > macros.fatT) causes.push(S.fatCause(f.int(macros.fat - macros.fatT)));
    if (macros.carbs != null && macros.carbsT && macros.carbs > macros.carbsT) causes.push(S.carbsCause(f.int(macros.carbs - macros.carbsT)));
    parts.push(S.kcalOver(abs(k.diff), causes.length ? list(causes, S.and) : null));
  } else if (k.status === 'near' && (k.diff || 0) > 0) parts.push(S.kcalNearOver(abs(k.diff)));
  else if (k.status === 'under' || k.status === 'near') shorts.push(S.shortKcal(abs(k.diff)));
  if (s.protein.status === 'under' || s.protein.status === 'near') shorts.push(S.shortProtein(abs(s.protein.diff)));
  if (s.steps.status === 'under' || s.steps.status === 'near') shorts.push(S.shortSteps(abs(s.steps.diff)));
  if (shorts.length) parts.push(S.short(list(shorts, S.and)));
  const near = s.verdict === 'near';
  return {
    head: S.head(near ? 'near' : 'miss', s.misses),
    text: parts.length ? cap(parts.join(', ')) + '.' : '',
    icon: near ? '≈' : '!',
    tone: near ? 'warn' : s.tone === 'bad' ? 'bad' : 'warn',
  };
}

type Span = { s: string; size?: number; bold?: boolean; fill?: string };
interface Tile {
  label: string;
  value: Span[];
  sub?: string;
  subFill?: string;
  span?: number;
}

export function reportSvg(L: I18n, p: ReportInput): { svg: string; w: number; h: number } {
  const { tx, f } = L;
  const R = tx.report;
  const S = tx.day.score;
  const t = p.colorblind ? colorblind(LIGHT) : REPORT_DARK;
  const brand = !p.colorblind;
  const { e, energy, adaptive } = p;
  const tg = p.plan?.kind === 'ok' ? p.plan.targets : null;
  const sc = tg ? p.score ?? null : null;
  const kc = energy?.intake;
  const card = brand ? REPORT_DARK.card : '#F3F5F8';
  const track = brand ? '#354953' : '#E3E8EE';

  const tspan = (x: Span) =>
    `<tspan${x.size ? ` font-size="${x.size}"` : ''} font-weight="${x.bold ? 700 : 400}"${x.fill ? ` fill="${x.fill}"` : ''}>${esc(x.s)}</tspan>`;
  const text = (x: number, y: number, spans: Span[] | string, o: { size?: number; bold?: boolean; fill?: string; anchor?: 'end' | 'middle'; ls?: number } = {}) =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${o.size || 14}"${o.bold ? ' font-weight="700"' : ''} fill="${o.fill || t.text}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${typeof spans === 'string' ? esc(spans) : spans.map(tspan).join('')}</text>`;

  let g = '';
  let y = 0;

  // ---- шапка ----
  const planLine =
    tg && p.plan?.kind === 'ok'
      ? cap(R.planLine(tx.target.modeLower[tg.mode], tg.mode === 'maintain' ? '' : tx.target.pacePart(pctText(L, tg.pct), f.signed(tg.kgPerWeek, 2)), f.dm(p.plan.anchor)))
      : '';
  const HH = planLine ? 108 : 86;
  const hdrTx = brand ? '#FFFFFF' : t.text;
  const hdrMu = brand ? 'rgba(255,255,255,0.8)' : t.muted;
  if (brand) g += `<rect width="${W}" height="${HH}" fill="url(#brand)"/>`;
  g += text(PAD, 36, R.header(p.name.toUpperCase()), { size: 12, bold: true, fill: hdrMu, ls: 2 });
  g += text(PAD, 66, tx.day.title(f.dmy(p.date), f.weekday(p.date)), { size: 25, bold: true, fill: hdrTx });
  if (planLine) g += text(PAD, 89, planLine, { size: 13, fill: hdrMu });
  if (sc) {
    const kind = sc.verdict === 'open' ? 'open' : sc.verdict === 'noData' ? 'noData' : sc.verdict === 'ok' ? 'ok' : sc.verdict === 'near' ? 'near' : 'miss';
    const label = kind === 'miss' ? S.label.miss(sc.misses) : kind === 'near' ? S.label.near(sc.misses) : S.label[kind];
    const c = kind === 'ok' ? t.green : kind === 'miss' ? (sc.tone === 'bad' ? t.red : t.warn) : kind === 'near' ? t.warn : t.muted;
    const cw = Math.round(label.length * 8.2 + 24);
    const cx = W - PAD - cw;
    g += `<rect x="${cx}" y="26" width="${cw}" height="28" rx="14" fill="${brand ? '#FFFFFF' : c}" fill-opacity="${brand ? 1 : 0.1}" stroke="${brand ? '#FFFFFF' : c}" stroke-width="1.5"${kind === 'open' || kind === 'noData' ? ' stroke-dasharray="4 3"' : ''}/>`;
    g += text(cx + cw / 2, 45, label, { size: 13, bold: true, fill: c, anchor: 'middle' });
  }
  y = HH;

  // ---- фраза-итог ----
  const sum = sc ? reportSummary(L, sc, { fat: e.fat, carbs: e.carbs, fatT: tg?.fat, carbsT: tg?.carbs }) : null;
  if (sum) {
    y += 16;
    const c = toneColor(t, sum.tone);
    const full = (sum.head ? sum.head + ' ' : '') + sum.text;
    const lines = wrapText(full, 64);
    const bh = 20 + lines.length * 20;
    g += `<rect x="${PAD}" y="${y}" width="${IW}" height="${bh}" rx="12" fill="${c}" fill-opacity="${brand ? 0.14 : 0.07}" stroke="${c}" stroke-width="1.5"/>`;
    g += `<circle cx="${PAD + 24}" cy="${y + 22}" r="11" fill="${c}"/>`;
    g += text(PAD + 24, y + 27, sum.icon, { size: 13, bold: true, fill: '#FFFFFF', anchor: 'middle' });
    lines.forEach((l, i) => {
      const spans: Span[] = i === 0 && sum.head && l.startsWith(sum.head) ? [{ s: sum.head, bold: true }, { s: l.slice(sum.head.length) }] : [{ s: l }];
      g += text(PAD + 46, y + 27 + i * 20, spans, { size: 14 });
    });
    y += bh;
  }

  const section = (title: string, color: string) => {
    y += 32;
    g += `<circle cx="${PAD + 4}" cy="${y - 4}" r="4" fill="${color}"/>`;
    g += text(PAD + 15, y, title, { size: 11.5, bold: true, fill: t.muted, ls: 1.4 });
    y += 6;
  };

  // плитки: раскладка по колонкам, плитка может занимать несколько
  const tiles = (list: Tile[], cols: number) => {
    if (!list.length) return;
    const gap = 8;
    const cw = (IW - gap * (cols - 1)) / cols;
    const th = 66;
    let col = 0;
    y += 6;
    for (const tl of list) {
      const span = Math.min(tl.span || 1, cols);
      if (col + span > cols) {
        col = 0;
        y += th + gap;
      }
      const x = PAD + col * (cw + gap);
      const w = cw * span + gap * (span - 1);
      const maxCh = Math.floor((w - 20) / 6.6);
      const cut = (s: string) => (s.length > maxCh ? s.slice(0, maxCh - 1) + '…' : s);
      g += `<rect x="${x}" y="${y}" width="${w}" height="${th}" rx="10" fill="${card}"${brand ? ' stroke="#38515D" stroke-width="0.8"' : ''}/>`;
      g += text(x + 10, y + 18, cut(tl.label), { size: 12, fill: t.muted });
      g += text(x + 10, y + 40, tl.value, { size: 18, bold: true });
      if (tl.sub) g += text(x + 10, y + 57, cut(tl.sub), { size: 12, bold: true, fill: tl.subFill || t.muted });
      col += span;
    }
    y += th;
  };

  const n0 = (v: number | undefined) => (v != null ? f.int(v) : '—');
  const big = (s: string): Span => ({ s, bold: true });
  const unit = (s: string): Span => ({ s, size: 12.5, fill: t.muted });

  // ---- питание и шаги ----
  section(R.foodSec, t.amber);
  if (sc && tg) {
    const rows: [Kind, MetricScore, Span[]][] = [
      ['kcal', sc.kcal, [{ s: kc ? f.int(kc) : '—', size: 22, bold: true }, { s: ` / ${f.int(tg.kcal)} ${tx.common.kcal}`, size: 15, fill: t.muted }]],
      ['protein', sc.protein, [{ s: R.protein + ' ', size: 15 }, { s: n0(e.protein), size: 22, bold: true }, { s: ` / ${f.int(tg.protein)} ${tx.common.g}`, size: 15, fill: t.muted }]],
      ['steps', sc.steps, [{ s: R.steps + ' ', size: 15 }, { s: e.steps ? f.int(e.steps) : '—', size: 22, bold: true }, { s: ` / ${f.int(p.profile.stepGoal)}`, size: 15, fill: t.muted }]],
    ];
    for (const [kind, m, left] of rows) {
      y += 6;
      const st = m.status === 'none' ? '—' : metricLine(L, m, kind);
      const c = toneColor(t, m.tone === 'none' ? 'progress' : m.tone);
      g += text(PAD, y + 20, left);
      g += text(W - PAD, y + 20, st, { size: 14, bold: true, fill: m.status === 'none' ? t.muted : c, anchor: 'end' });
      const ty = y + 31;
      const fact = m.fact || 0;
      const max = Math.max(kind === 'kcal' ? m.target * 1.4 : m.target * 1.5, fact * 1.05, 1);
      const X = (v: number) => PAD + Math.max(0, Math.min(1, v / max)) * IW;
      const zLo = X(m.lo);
      const zHi = X(m.hi ?? max);
      g += `<rect x="${PAD}" y="${ty}" width="${IW}" height="13" rx="6.5" fill="${track}"/>`;
      g += `<rect x="${zLo}" y="${ty - 4}" width="${Math.max(zHi - zLo, 4)}" height="21" rx="5" fill="${t.green}" fill-opacity="0.16" stroke="${brand ? '#A4C7CE' : 'rgba(17,24,32,0.45)'}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      if (fact > 0) {
        const fw = Math.max(X(fact) - PAD, 13);
        if (kind === 'kcal' && m.status === 'over') {
          // Красный и штриховка — только участок выше допустимого коридора.
          const overStart = Math.max(PAD, Math.min(X(fact), X(m.hi ?? m.target)));
          const normalWidth = Math.max(0, overStart - PAD);
          const excessWidth = Math.max(0, fw - normalWidth);
          if (normalWidth > 0) g += `<rect x="${PAD}" y="${ty}" width="${normalWidth}" height="13" rx="6.5" fill="${t.teal}"/>`;
          if (excessWidth > 0) {
            g += `<rect x="${overStart}" y="${ty}" width="${excessWidth}" height="13" rx="3" fill="${t.red}"/>`;
            g += `<rect x="${overStart}" y="${ty}" width="${excessWidth}" height="13" rx="3" fill="url(#hatch)"/>`;
          }
        } else {
          g += `<rect x="${PAD}" y="${ty}" width="${fw}" height="13" rx="6.5" fill="${c}"/>`;
        }
        if (kind === 'kcal') g += `<rect x="${X(fact) - 1.5}" y="${ty - 6}" width="3" height="25" rx="1.5" fill="${t.text}"/>`;
      }
      y = ty + 13;
      if (kind === 'kcal' && m.hi != null) {
        const cx = Math.max(PAD + 70, Math.min(W - PAD - 70, (zLo + zHi) / 2));
        g += text(cx, y + 20, S.corridor(f.int(m.lo), f.int(m.hi)), { size: 11.5, fill: t.muted, anchor: 'middle' });
        y += 20;
      }
      y += 8;
    }
  }

  const macro = (label: string, v: number | undefined, target: number | undefined): Tile => {
    if (target == null) return { label, value: [big(n0(v)), unit(' ' + tx.common.g)] };
    const d = v != null ? Math.round(v - target) : null;
    const over = sc?.kcal.status === 'over' && d != null && d > 0;
    return {
      label,
      value: [big(n0(v)), unit(' /' + f.int(target))],
      sub: d == null ? undefined : d > 0 ? `▲ +${f.int(d)}` : d < 0 ? `▼ −${f.int(-d)}` : '= 0',
      subFill: over ? t.red : t.muted,
    };
  };
  const workout: Tile = e.workoutMin
    ? {
        label: R.workout,
        value: [big(String(e.workoutMin)), unit(' ' + tx.common.min)],
        sub: workoutName(L, e.workoutType, e.workoutKind) + (e.hrAvg ? ' · ♥ ' + e.hrAvg : ''),
      }
    : { label: R.workout, value: [{ s: R.none, bold: true, size: 16 }], sub: '—' };
  const wellbeing: Tile = e.wellbeing
    ? { label: R.wellbeing, value: [big(String(e.wellbeing)), unit(' /10')], sub: '●'.repeat(e.wellbeing) + '○'.repeat(Math.max(0, 10 - e.wellbeing)) }
    : { label: R.wellbeing, value: [big('—')] };
  const food: Tile[] = [];
  if (!sc) {
    food.push({ label: R.kcal, value: [big(kc ? f.int(kc) : '—'), unit(' ' + tx.common.kcal)] });
    food.push(macro(R.protein, e.protein, undefined));
  }
  food.push(macro(R.fat, e.fat, tg?.fat), macro(R.carbs, e.carbs, tg?.carbs));
  if (!sc) food.push({ label: R.steps, value: [big(e.steps ? f.int(e.steps) : '—'), unit(' /' + f.int(p.profile.stepGoal))] });
  food.push(workout, wellbeing);
  tiles(food, 4);

  // ---- энергия и тело ----
  section(R.energySec, t.blue);
  const body: Tile[] = [];
  if (energy) {
    const def = energy.total - (kc || 0);
    body.push({
      label: R.spent,
      value: [big(f.int(energy.total)), unit(' ' + tx.common.kcal)],
      sub: kc ? (def >= 0 ? R.deficitShort(f.int(def)) : R.surplusShort(f.int(-def))) : undefined,
      subFill: kc ? toneColor(t, balanceTone(tg?.mode, def, energy.total)) : undefined,
    });
  }
  if (adaptive?.E != null)
    body.push({ label: R.factTrend, value: [big(f.int(adaptive.E)), unit(' ' + tx.common.kcal)], sub: R.reliability(tx.common.reliability[adaptive.reliability]) });
  {
    const dW = e.weight && p.prevWeight ? e.weight - p.prevWeight : null;
    const dTxt = dW == null ? undefined : Math.abs(dW) < 0.005 ? '= ' + f.num(0, 2) : `${dW < 0 ? '▼' : '▲'} ${f.num(Math.abs(dW), 2)}`;
    body.push({ label: R.weight, value: e.weight ? [big(f.num(e.weight, 2)), unit(' ' + tx.common.kg)] : [big('—')], sub: dTxt ? R.vsYesterday(dTxt) : undefined });
  }
  const n = (v: number | undefined) => (v != null ? f.input(v) : '—');
  const female = p.profile.sex === 'female';
  if (hasMeasurement(e)) {
    const bf = navyBodyFat(p.profile.sex, e, p.profile.heightCm);
    body.push({ label: R.bodyFat, value: bf ? [big(f.num(bf)), unit(' %')] : [big('—')], sub: R.bodyLine(n(e.neck), n(e.waist), female ? n(e.hips) : null, null) });
  } else if (p.days) {
    // замера за день нет — последний замер серым, с датой
    const c = carriedMeasure(p.days, p.date, p.profile.sex, p.profile.heightCm);
    if (c && (c.neck || c.waist))
      body.push({
        label: R.bodyFat,
        value: c.bf ? [{ s: f.num(c.bf.v), bold: true, fill: t.muted }, unit(' %')] : [{ s: '—', bold: true, fill: t.muted }],
        sub: c.bf ? R.carried(f.dm(c.bf.date)) : R.bodyLine(n(c.neck), n(c.waist), female ? n(c.hips) : null, null),
      });
  }
  {
    // необязательные замеры — только введённые в этот день
    const ex = extraMeasureKeys(p.profile.sex);
    const pick = (k: 'chest' | 'biceps' | 'hips') => (ex.includes(k) && e[k] ? f.input(e[k]!) : null);
    const line = R.volumesLine(pick('chest'), pick('biceps'), pick('hips'));
    if (line) body.push({ label: R.volumesCm, value: [{ s: line, bold: true, size: 16 }], span: 2 });
  }
  if (e.anomaly) body.push({ label: R.unusual, value: [{ s: tx.common.reason[e.anomaly], bold: true, size: 15 }], span: 2 });
  tiles(body, 3);

  // ---- комментарий ----
  const comment = (e.comment || '').trim();
  if (comment) {
    y += 28;
    g += text(PAD, y, R.comment, { size: 12, fill: t.muted });
    for (const l of wrapText(comment, 70)) {
      y += 20;
      g += text(PAD, y, l, { size: 14 });
    }
  }

  // ---- подвал ----
  y += 18;
  g += `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${brand ? '#3E5660' : 'rgba(17,24,32,0.1)'}"/>`;
  y += 22;
  g += text(PAD, y, R.footer(tx.app.name), { size: 11.5, fill: t.muted });
  const H = Math.ceil(y + 18);

  const defs =
    `<defs><linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BRAND[0]}"/><stop offset="1" stop-color="${BRAND[1]}"/></linearGradient>` +
    `<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="7" fill="#FFFFFF" fill-opacity="0.38"/></pattern></defs>`;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<rect width="${W}" height="${H}" fill="${brand ? t.bg : '#FFFFFF'}"/>${g}</svg>`,
    w: W,
    h: H,
  };
}

/** Статус показателя словами (как на «Дне»): «▲ перебор +483», «≈ рядом −911», «✓ в коридоре». */
function metricLine(L: I18n, m: MetricScore, kind: Kind): string {
  const S = L.tx.day.score;
  const n = (v: number) => (kind === 'protein' ? L.f.int(Math.abs(v)) + ' ' + L.tx.common.g : L.f.int(Math.abs(v)));
  switch (m.status) {
    case 'ok':
      return kind === 'kcal' ? S.kcalOk : kind === 'steps' ? S.stepsOk : S.ok;
    case 'over':
      return S.over(n(m.diff!));
    case 'under':
      return S.under(n(m.diff!));
    case 'near':
      return S.near((m.diff! > 0 ? '+' : '−') + n(m.diff!));
    case 'left':
      return m.leftMin != null && m.leftMax != null ? S.leftRange(L.f.int(m.leftMin), L.f.int(m.leftMax)) : S.left(n(m.diff!));
    default:
      return '';
  }
}
