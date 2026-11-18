import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { dateRange, dayDiff, isISODate, shiftDate, type ISODate } from '../core/dates';
import { wls } from '../core/adaptive';
import { navyBodyFat } from '../core/body';
import { normDate } from '../core/importers';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Card, Gap, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { Chart } from '../ui/Chart';
import { useI18n } from '../i18n';
import { useAdvanced } from '../ui/mode';

type Scale = 'week' | 'month' | '3m' | 'all' | 'custom';

export function ChartsScreen({ sel }: { sel: ISODate }) {
  const t = useTheme();
  const { tx, f } = useI18n();
  const C = tx.charts;
  const { data } = useStore();
  const { profile, days, keep } = data;
  const [scale, setScale] = useState<Scale>('month');
  const [cFrom, setCFrom] = useState('');
  const [cTo, setCTo] = useState('');
  const d = useDerived(profile, days, keep, sel);
  const adv = useAdvanced();

  const allDates = Object.keys(days).sort();
  const first = allDates[0] || sel;
  let from: ISODate = scale === 'week' ? shiftDate(sel, -6) : scale === 'month' ? shiftDate(sel, -29) : scale === '3m' ? shiftDate(sel, -89) : first;
  let to: ISODate = sel;
  if (scale === 'custom') {
    const f = normDate(cFrom);
    const tt = normDate(cTo);
    if (isISODate(f)) from = f;
    if (isISODate(tt)) to = tt;
  }
  if (from > to) from = to;
  const freeCut = profile.plan === 'free' && dayDiff(from, to) > 29;

  const series = useMemo(() => {
    const range = dateRange(from, to);
    const excl = new Set(d.adaptive?.exclList.map((x) => x.d) || []);
    const manualOrAuto = (dd: ISODate) => !!days[dd]?.anomaly || excl.has(dd);
    const weights = range.filter((x) => days[x]?.weight).map((x) => ({ d: x, v: days[x].weight! }));
    const fit = wls(weights.filter((p) => !manualOrAuto(p.d)).map((p) => [dayDiff(from, p.d), p.v, 1]));
    const trend = fit && weights.length >= 3 ? [from, to].map((x) => ({ d: x, v: fit.at(dayDiff(from, x)) })) : [];
    const fat = range
      .map((x) => ({ d: x, v: navyBodyFat(profile.sex, days[x] || {}, profile.heightCm) }))
      .filter((p): p is { d: ISODate; v: number } => p.v != null);
    const intake: { d: ISODate; v: number }[] = [];
    const total: { d: ISODate; v: number }[] = [];
    let cum = 0;
    const expected: { d: ISODate; v: number }[] = [];
    for (const x of range) {
      const m = days[x] ? d.model(days[x], x) : null;
      if (m && m.intake) {
        intake.push({ d: x, v: m.intake });
        total.push({ d: x, v: m.total });
        cum += (m.intake - m.total) / 7700;
        expected.push({ d: x, v: cum });
      }
    }
    const w0 = fit ? fit.at(0) : weights[0]?.v;
    const actual = w0 != null ? weights.filter((p) => !manualOrAuto(p.d)).map((p) => ({ d: p.d, v: p.v - w0 })) : [];
    const factE = (d.adaptive?.series || []).filter((p) => p.E != null && p.d >= from && p.d <= to).map((p) => ({ d: p.d, v: p.E! }));
    return { weights, trend, fat, intake, total, expected, actual, factE, slope: fit?.slope, marks: range.filter(manualOrAuto) };
  }, [from, to, days, profile, d]);

  return (
    <View>
      <T size={22} bold>{C.title}</T>
      <T muted size={13}>{C.subtitle}</T>
      <Gap h={10} />
      <Seg<Scale>
        value={scale}
        onChange={setScale}
        options={(['week', 'month', '3m', 'all', 'custom'] as Scale[]).map((v) => ({ v, label: C.scale[v] }))}
      />
      {scale === 'custom' ? (
        <Fields>
          <TextField value={cFrom} onChange={setCFrom} placeholder={C.from(f.dateInputPlaceholder)} />
          <TextField value={cTo} onChange={setCTo} placeholder={C.to(f.dateInputPlaceholder)} />
        </Fields>
      ) : null}
      {freeCut ? <T muted size={12} style={{ marginTop: 6 }}>{C.freeCut}</T> : null}
      <Gap h={12} />

      <Card title={C.weightTitle} accent={t.blue}>
        {series.weights.length ? (
          <>
            <Chart
              exportName={`${C.files.weight}-${from}-${to}`}
              spec={{
                title: C.weightTitle,
                from,
                to,
                series: [
                  { label: C.weight, color: t.blue, dots: true, width: 1.6, points: series.weights },
                  { label: C.trend, color: t.amber, dash: true, gapDays: 1e6, points: series.trend },
                ],
                marks: series.marks,
              }}
            />
            {series.slope != null ? <T muted size={12}>{C.pace(f.signed(series.slope * 7, 2))}</T> : null}
          </>
        ) : (
          <T muted>{C.noWeights}</T>
        )}
      </Card>

      <Card title={C.kcalTitle} accent={t.amber}>
        {series.intake.length ? (
          <Chart
            exportName={`${C.files.kcal}-${from}-${to}`}
            spec={{
              title: C.kcalTitle,
              from,
              to,
              yStep: 100,
              series: [
                { label: C.eaten, color: t.amber, bars: true, points: series.intake },
                { label: C.formula, color: t.muted, dash: true, points: series.total },
                ...(adv ? [{ label: C.fact, color: t.green, points: series.factE }] : []),
              ],
            }}
          />
        ) : (
          <T muted>{C.noKcal}</T>
        )}
      </Card>

      {adv ? (
      <Card title={C.deficitTitle} accent={t.green}>
        {series.expected.length ? (
          <>
            <Chart
              exportName={`${C.files.deficit}-${from}-${to}`}
              spec={{
                title: C.deficitExport,
                from,
                to,
                zeroLine: true,
                series: [
                  { label: C.expected, color: t.amber, dash: true, points: series.expected },
                  { label: C.actual, color: t.green, dots: true, width: 1.6, points: series.actual },
                ],
              }}
            />
            <T muted size={12}>{C.deficitNote}</T>
          </>
        ) : (
          <T muted>{C.deficitEmpty}</T>
        )}
      </Card>
      ) : null}

      <Card title={C.fatTitle} accent={t.teal}>
        {series.fat.length ? (
          <Chart
            height={140}
            exportName={`${C.files.fat}-${from}-${to}`}
            spec={{ title: C.fatTitle, from, to, series: [{ label: C.fat, color: t.teal, dots: true, points: series.fat }] }}
          />
        ) : (
          <T muted>{C.noFat}</T>
        )}
      </Card>
    </View>
  );
}
