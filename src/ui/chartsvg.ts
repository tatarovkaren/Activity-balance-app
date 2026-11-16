// Графики как SVG-строка: одна и та же разметка показывается на экране (SvgXml) и выгружается в PNG/PDF.

import { dayDiff, dm, type ISODate } from '../core/dates';
import type { Palette } from './theme';

export interface Series {
  label: string;
  color: string;
  points: { d: ISODate; v: number }[];
  dash?: boolean;
  dots?: boolean;
  width?: number;
  axis?: 'left' | 'right';
  /** Столбики вместо линии. */
  bars?: boolean;
  /** Разрыв линии при пропуске больше N дней (по умолчанию 7). */
  gapDays?: number;
}

export interface ChartSpec {
  title?: string;
  width: number;
  height: number;
  from: ISODate;
  to: ISODate;
  series: Series[];
  /** Метки у оси X (необычные дни). */
  marks?: ISODate[];
  markColor?: string;
  markLabel?: string;
  yUnit?: string;
  yRightUnit?: string;
  yStep?: number;
  zeroLine?: boolean;
  legend?: boolean;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const FONT = 'font-family="ui-monospace, Menlo, Consolas, monospace"';

function niceRange(vals: number[], step?: number): [number, number] {
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return [0, 1];
  if (step) {
    lo = Math.floor((lo - step / 2) / step) * step;
    hi = Math.ceil((hi + step / 2) / step) * step;
    if (hi - lo < 2 * step) hi = lo + 2 * step;
    return [lo, hi];
  }
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1;
  return [lo - pad, hi + pad];
}

const fmtY = (v: number) => {
  const a = Math.abs(v);
  return (a >= 100 ? Math.round(v).toString() : v.toFixed(1)).replace('.', ',');
};

export function chartSvg(spec: ChartSpec, t: Palette): string {
  const { width: W, height: H } = spec;
  const legendH = spec.legend === false ? 0 : 18;
  const pL = 40;
  const hasRight = spec.series.some((s) => s.axis === 'right' && s.points.length);
  const pR = hasRight ? 38 : 10;
  const pT = 10;
  const pB = 20 + legendH;
  const span = Math.max(1, dayDiff(spec.from, spec.to));
  const x = (d: ISODate) => pL + (dayDiff(spec.from, d) / span) * (W - pL - pR);
  const leftVals = spec.series.filter((s) => s.axis !== 'right').flatMap((s) => s.points.map((p) => p.v));
  const rightVals = spec.series.filter((s) => s.axis === 'right').flatMap((s) => s.points.map((p) => p.v));
  if (spec.zeroLine) leftVals.push(0);
  const [lo, hi] = leftVals.length ? niceRange(leftVals, spec.yStep) : [0, 1];
  const [rlo, rhi] = rightVals.length ? niceRange(rightVals) : [0, 1];
  const yL = (v: number) => pT + (1 - (v - lo) / (hi - lo || 1)) * (H - pT - pB);
  const yR = (v: number) => pT + (1 - (v - rlo) / (rhi - rlo || 1)) * (H - pT - pB);
  let g = '';
  for (let k = 0; k <= 3; k++) {
    const v = lo + (k * (hi - lo)) / 3;
    const gy = yL(v).toFixed(1);
    g += `<line x1="${pL}" y1="${gy}" x2="${W - pR}" y2="${gy}" stroke="${t.line}" stroke-width="1"/>`;
    g += `<text x="${pL - 5}" y="${+gy + 3}" fill="${t.muted}" font-size="9" text-anchor="end" ${FONT}>${fmtY(v)}</text>`;
    if (hasRight) {
      const rv = rlo + (k * (rhi - rlo)) / 3;
      g += `<text x="${W - pR + 5}" y="${+gy + 3}" fill="${t.muted}" font-size="9" ${FONT}>${fmtY(rv)}</text>`;
    }
  }
  if (spec.zeroLine && lo < 0 && hi > 0)
    g += `<line x1="${pL}" y1="${yL(0).toFixed(1)}" x2="${W - pR}" y2="${yL(0).toFixed(1)}" stroke="${t.muted}" stroke-width="1"/>`;
  const bw = Math.max(2, ((W - pL - pR) / (span + 1)) * 0.9);
  for (const m of spec.marks || [])
    g += `<rect x="${(x(m) - bw / 2).toFixed(1)}" y="${H - pB - 4}" width="${bw.toFixed(1)}" height="4" fill="${spec.markColor || t.red}" opacity=".75"/>`;
  for (const s of spec.series) {
    if (!s.points.length) continue;
    const y = s.axis === 'right' ? yR : yL;
    const pts = [...s.points].sort((a, b) => (a.d < b.d ? -1 : 1));
    if (s.bars) {
      const base = yL(Math.max(lo, Math.min(hi, 0)));
      for (const p of pts) {
        const yy = y(p.v);
        g += `<rect x="${(x(p.d) - bw / 2).toFixed(1)}" y="${Math.min(yy, base).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(base - yy).toFixed(1)}" fill="${s.color}" opacity=".55"/>`;
      }
      continue;
    }
    // разрыв линии при пропуске больше 7 дней
    let dPath = '';
    let prev: ISODate | null = null;
    for (const p of pts) {
      const jump = !prev || dayDiff(prev, p.d) > (s.gapDays ?? 7);
      dPath += (jump ? 'M' : 'L') + x(p.d).toFixed(1) + ',' + y(p.v).toFixed(1) + ' ';
      prev = p.d;
    }
    g += `<path d="${dPath}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="4 3"' : ''} stroke-linejoin="round"/>`;
    if (s.dots)
      for (const p of pts) g += `<circle cx="${x(p.d).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.2" fill="${s.color}"/>`;
  }
  g += `<text x="${pL}" y="${H - pB + 13}" fill="${t.muted}" font-size="9" ${FONT}>${dm(spec.from)}</text>`;
  g += `<text x="${W - pR}" y="${H - pB + 13}" fill="${t.muted}" font-size="9" text-anchor="end" ${FONT}>${dm(spec.to)}</text>`;
  if (legendH) {
    let lx = pL;
    const items = spec.series.filter((s) => s.points.length).map((s) => ({ c: s.color, l: s.label, dash: s.dash }));
    if (spec.marks?.length) items.push({ c: spec.markColor || t.red, l: spec.markLabel || 'необычный день', dash: false });
    for (const it of items) {
      g += `<line x1="${lx}" y1="${H - 6}" x2="${lx + 14}" y2="${H - 6}" stroke="${it.c}" stroke-width="2.5" ${it.dash ? 'stroke-dasharray="3 2"' : ''}/>`;
      g += `<text x="${lx + 18}" y="${H - 3}" fill="${t.muted}" font-size="9.5" font-family="sans-serif">${esc(it.l)}</text>`;
      lx += 26 + it.l.length * 5.4;
    }
  }
  const title = spec.title ? `<title>${esc(spec.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${title}${g}</svg>`;
}
