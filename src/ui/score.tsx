// Итог дня на экране «День» (вариант B): шкала с коридором цели, статус значком и словом,
// метка итога в заголовке карточки. Цвет никогда не единственный признак: всегда значок и слово,
// при перерасходе и недоборе полоска заштрихована.

import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import type { DayScore, DayVerdict, MetricScore, ScoreTone } from '../core/dayscore';
import { useI18n, type I18n } from '../i18n';
import { T } from './kit';
import { useTheme, type Palette } from './theme';

export function scoreColor(t: Palette, tone: ScoreTone): string {
  return tone === 'ok' ? t.green : tone === 'warn' ? t.warn : tone === 'bad' ? t.red : tone === 'progress' ? t.progress : t.muted;
}

/** Значок итога дня для календаря. */
export const VERDICT_ICON: Record<DayVerdict, string> = { ok: '✓', near: '≈', over: '▲', under: '▼', open: '◷', noData: '•' };

/** Текст статуса показателя: «✓ в коридоре», «▲ перебор +320», «ещё 660–840». */
export function metricText(L: I18n, m: MetricScore, kind: 'kcal' | 'protein' | 'steps'): string {
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
      return kind === 'steps' ? S.stepsNone : '';
  }
}

/** Метка итога в заголовке карточки: «✓ день в цели», «! мимо: 2», «◷ день идёт». */
export function DayLabel({ s, testID }: { s: DayScore; testID?: string }) {
  const t = useTheme();
  const { tx } = useI18n();
  const S = tx.day.score;
  const kind = s.verdict === 'open' ? 'open' : s.verdict === 'noData' ? 'noData' : s.verdict === 'ok' ? 'ok' : s.verdict === 'near' ? 'near' : 'miss';
  const text = kind === 'miss' ? S.label.miss(s.misses) : kind === 'near' ? S.label.near(s.misses) : S.label[kind];
  const a11y = kind === 'miss' ? S.a11y.miss(s.misses) : kind === 'near' ? S.a11y.near(s.misses) : S.a11y[kind];
  const c = kind === 'ok' ? t.green : kind === 'miss' ? (s.tone === 'bad' ? t.red : t.warn) : kind === 'near' ? t.warn : t.muted;
  const dashed = kind === 'open' || kind === 'noData';
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11y}
      style={{ borderWidth: 1.5, borderStyle: dashed ? 'dashed' : 'solid', borderColor: c, backgroundColor: c + '1F', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, flexShrink: 0 }}
    >
      <T size={12} bold color={dashed ? t.muted : c}>
        {text}
      </T>
    </View>
  );
}

/**
 * Полоска: серый трек, пунктирный «коридор» цели, заливка до факта и отметка.
 * Шкала: у калорий до max(1,4 × цель, факт), у белка и шагов коридор — от цели до конца шкалы (1,5 × цель).
 */
export function CorridorBar({ m, kind }: { m: MetricScore; kind: 'kcal' | 'protein' | 'steps' }) {
  const t = useTheme();
  const fact = m.fact || 0;
  const max = Math.max(kind === 'kcal' ? m.target * 1.4 : m.target * 1.5, fact * 1.05, 1);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const zoneHi = m.hi ?? max;
  const c = scoreColor(t, m.tone === 'none' ? 'progress' : m.tone);
  const hatch = m.status === 'over' || m.status === 'under';
  const track = t.dark ? '#1B2530' : '#E3E8EE';
  const zoneLine = t.dark ? 'rgba(236,242,247,0.55)' : 'rgba(17,24,32,0.45)';
  const id = 'hatch-' + kind;
  return (
    <View style={{ height: 20, justifyContent: 'center' }}>
      <Svg width="100%" height={20}>
        <Defs>
          <Pattern id={id} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
            <Line x1={0} y1={0} x2={0} y2={7} stroke={t.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'} strokeWidth={3} />
          </Pattern>
        </Defs>
        <Rect x={0} y={3} width="100%" height={14} rx={7} fill={track} />
        <Rect x={pct(m.lo)} y={0.75} width={pct(zoneHi - m.lo)} height={18.5} rx={5} fill={t.green + '22'} stroke={zoneLine} strokeWidth={1.5} strokeDasharray="4,3" />
        {fact > 0 ? <Rect x={0} y={3} width={pct(fact)} height={14} rx={7} fill={c} /> : null}
        {fact > 0 && hatch ? <Rect x={0} y={3} width={pct(fact)} height={14} rx={7} fill={`url(#${id})`} /> : null}
        {fact > 0 && kind === 'kcal' ? <Rect x={pct(fact)} y={0} width={3} height={20} rx={1.5} fill={t.text} /> : null}
      </Svg>
    </View>
  );
}

/** Строка показателя: «1842 / 1870 ккал … ✓ в коридоре», полоска и подпись коридора. */
export function ScoreRow({ m, kind, unit, testID }: { m: MetricScore; kind: 'kcal' | 'protein' | 'steps'; unit: string; testID?: string }) {
  const t = useTheme();
  const L = useI18n();
  const { f, tx } = L;
  const S = tx.day.score;
  const status = metricText(L, m, kind);
  const color = scoreColor(t, m.tone);
  return (
    <View testID={testID} style={{ marginTop: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 8 }}>
        <T size={13}>
          {S[kind] + ' '}
          <T bold size={13}>{m.fact != null ? f.int(m.fact) : '—'}</T>
          <T muted size={13}>{` / ${f.int(m.target)} ${unit}`}</T>
        </T>
        {status ? (
          <T size={13} bold color={color} testID={testID ? testID + '-status' : undefined}>
            {status}
          </T>
        ) : null}
      </View>
      <CorridorBar m={m} kind={kind} />
      <T muted size={11}>
        {m.hi != null ? S.corridor(f.int(m.lo), f.int(m.hi)) : S.atLeast(f.int(m.lo) + (unit ? ' ' + unit : ''))}
      </T>
    </View>
  );
}
