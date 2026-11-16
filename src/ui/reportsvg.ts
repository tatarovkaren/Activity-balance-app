// Отчёт дня картинкой (для куратора). Всегда светлая палитра, без полей ввода и кнопок.

import { dmy, weekday, type ISODate } from '../core/dates';
import type { AdaptiveResult } from '../core/adaptive';
import type { EnergyResult } from '../core/energy';
import { ANOMALY_LABELS, type DayEntry, type Profile } from '../core/types';
import { navyBodyFat } from '../core/body';
import { LIGHT as t } from './theme';
import { int, kg, RELIABILITY_LABEL } from './format';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function reportSvg(p: {
  date: ISODate;
  name: string;
  profile: Profile;
  e: DayEntry;
  energy: EnergyResult | null;
  adaptive: AdaptiveResult | null;
  prevWeight?: number;
}): { svg: string; w: number; h: number } {
  const { e, energy, adaptive } = p;
  const W = 560;
  const rows: [string, string, string][] = [];
  const dW = e.weight && p.prevWeight ? e.weight - p.prevWeight : null;
  rows.push(['Вес', e.weight ? kg(e.weight, 2) + ' кг' + (dW != null ? `  (${dW <= 0 ? '▼' : '▲'} ${kg(Math.abs(dW), 2)})` : '') : '—', t.blue]);
  rows.push(['Шаги', e.steps ? int(e.steps) + ` / цель ${int(p.profile.stepGoal)}` : '—', t.green]);
  const kc = energy?.intake;
  rows.push(['Питание', kc ? `${int(kc)} ккал · Б ${kg(e.protein || 0, 0)} · Ж ${kg(e.fat || 0, 0)} · У ${kg(e.carbs || 0, 0)}` : '—', t.amber]);
  rows.push([
    'Тренировка',
    e.workoutMin ? `${e.workoutType || 'тренировка'} · ${e.workoutMin} мин${e.hrAvg ? ' · пульс ' + e.hrAvg : ''}${e.workoutSteps ? ' · шагов ' + int(e.workoutSteps) : ''}` : 'нет',
    t.red,
  ]);
  if (energy) {
    const def = energy.total - (kc || 0);
    rows.push(['Расход', `${int(energy.total)} ккал${kc ? (def >= 0 ? ` · дефицит ${int(def)}` : ` · профицит ${int(-def)}`) : ''}`, t.amber]);
  }
  if (adaptive?.E != null)
    rows.push(['По факту', `${int(adaptive.E)} ккал/день · надёжность ${RELIABILITY_LABEL[adaptive.reliability]}`, t.amber]);
  const bf = navyBodyFat(p.profile.sex, e, p.profile.heightCm);
  if (e.waist || e.neck)
    rows.push(['Замеры', `шея ${e.neck ?? '—'} · талия ${e.waist ?? '—'}${p.profile.sex === 'female' ? ' · бёдра ' + (e.hips ?? '—') : ''}${bf ? ' · жир ' + kg(bf) + '%' : ''}`, t.teal]);
  if (e.anomaly) rows.push(['Необычный день', ANOMALY_LABELS[e.anomaly], t.violet]);
  if (e.wellbeing) rows.push(['Самочувствие', `${e.wellbeing} из 10`, t.violet]);
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
  g += `<text x="24" y="34" font-size="11" letter-spacing="1.5" fill="${t.muted}" font-family="sans-serif">ОТЧЁТ ДНЯ · ${esc(p.name.toUpperCase())}</text>`;
  g += `<text x="24" y="64" font-size="22" font-weight="700" fill="${t.text}" font-family="sans-serif">${dmy(p.date)}, ${weekday(p.date)}</text>`;
  let y = 96;
  for (const [k, v, c] of rows) {
    g += `<rect x="24" y="${y - 12}" width="6" height="16" rx="2" fill="${c}"/>`;
    g += `<text x="40" y="${y + 1}" font-size="13" fill="${t.muted}" font-family="sans-serif">${esc(k)}</text>`;
    g += `<text x="170" y="${y + 1}" font-size="14" fill="${t.text}" font-family="ui-monospace, Menlo, monospace">${esc(v)}</text>`;
    y += 30;
  }
  if (lines.length) {
    g += `<text x="24" y="${y + 4}" font-size="13" fill="${t.muted}" font-family="sans-serif">Комментарий</text>`;
    y += 24;
    for (const l of lines) {
      g += `<text x="24" y="${y}" font-size="14" fill="${t.text}" font-family="sans-serif">${esc(l)}</text>`;
      y += 18;
    }
  }
  g += `<text x="24" y="${H - 16}" font-size="10" fill="${t.muted}" font-family="sans-serif">Баланс · оценки по формулам и тренду веса, не медицинская рекомендация</text>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`, w: W, h: H };
}
