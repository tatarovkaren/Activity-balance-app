import React from 'react';
import { View } from 'react-native';
import type { ISODate } from '../core/dates';
import { goalForecast, PARAMS } from '../core/adaptive';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Btn, Card, Divider, Gap, Note, Row, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { calibLine, detailText, factLine, goalText, reasonText, reliabilityDetails } from '../ui/format';
import { useI18n } from '../i18n';
import { Chart } from '../ui/Chart';

export function FactScreen({ sel }: { sel: ISODate }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const F = tx.fact;
  const dm = f.dm;
  const { data, setKeep, setDay } = useStore();
  const { profile, days, keep } = data;
  const d = useDerived(profile, days, keep, sel);
  const r = d.adaptive;
  const goal = goalForecast(r, sel, profile.goalWeightKg, days[sel]?.weight || d.weight);
  const premiumLocked = profile.plan === 'free';

  if (!r)
    return (
      <Card title={F.title} accent={t.amber}>
        <T muted>{F.empty}</T>
      </Card>
    );
  const c = calibLine(L, r);
  const relColor = r.reliability === 'high' ? t.green : r.reliability === 'low' ? t.amber : t.text;
  const pts = r.series.filter((p) => p.E != null);

  return (
    <View>
      <T size={22} bold>{F.title}</T>
      <T muted size={13}>{F.subtitle(dm(sel))}</T>
      <Gap h={12} />
      <Card accent={t.amber}>
        <T bold mono size={32} color={t.amber}>{c.main}</T>
        <T muted size={13}>{c.sub}</T>
        <Gap h={6} />
        <T size={13}>{factLine(L, r)}</T>
        <T size={13}>
          {F.reliability}<T bold color={relColor}>{tx.common.reliability[r.reliability]}</T> · {reliabilityDetails(L, r)}
        </T>
        {premiumLocked ? (
          <>
            <Gap h={6} />
            <T muted size={12}>{F.premium}</T>
          </>
        ) : null}
      </Card>

      {pts.length >= 7 ? (
        <Card title={F.chartTitle(PARAMS.WIN)} accent={t.amber}>
          <Chart
            height={150}
            exportName={`${F.chartFile}-${sel}`}
            spec={{
              title: F.chartExport,
              from: pts[0].d,
              to: pts[pts.length - 1].d,
              yStep: 100,
              series: [
                { label: F.seriesFact, color: t.amber, width: 2.4, points: pts.map((p) => ({ d: p.d, v: p.E! })) },
                { label: F.seriesFormula, color: t.muted, dash: true, width: 1.5, points: r.series.filter((p) => p.formula != null).map((p) => ({ d: p.d, v: p.formula! })) },
              ],
              marks: r.series.filter((p) => p.excl).map((p) => p.d),
            }}
          />
        </Card>
      ) : null}

      <Card title={F.excluded} accent={t.red}>
        {r.exclList.length ? (
          r.exclList.map((x) => (
            <Row key={x.d} gap={6} style={{ marginBottom: 4 }}>
              <T size={13}>
                {dm(x.d)} — {reasonText(L, x.why)} <T muted size={12}>{x.auto ? F.auto(detailText(L, x.detail)) : F.yours}</T>
              </T>
              {x.auto ? (
                <Btn kind="link" small title={F.returnToCalc} onPress={() => setKeep(x.d, true)} />
              ) : (
                <Btn kind="link" small title={F.unmark} onPress={() => setDay(x.d, { anomaly: undefined })} />
              )}
            </Row>
          ))
        ) : (
          <T muted size={13}>{F.none}</T>
        )}
        {r.recList.length ? (
          <>
            <Gap h={6} />
            <T muted size={12}>{F.recovery(r.recList.map(dm).join(', '))}</T>
          </>
        ) : null}
        {r.kept.length ? (
          <>
            <Divider />
            <T bold size={13}>{F.kept}</T>
            {r.kept.map((x) => (
              <Row key={x.d} gap={6}>
                <T size={13}>
                  {dm(x.d)} — {detailText(L, x.detail)}
                </T>
                <Btn kind="link" small title={F.excludeAgain} onPress={() => setKeep(x.d, false)} />
              </Row>
            ))}
          </>
        ) : null}
        {r.autoList.length ? (
          <>
            <Gap h={6} />
            <Note>{F.autoNote}</Note>
          </>
        ) : null}
      </Card>

      <Card title={F.goalTitle} accent={t.blue}>
        <T size={14}>{goalText(L, goal)}</T>
        {r.trendW ? <T muted size={12}>{F.trendNow(f.num(r.trendW, 1), r.slope != null ? f.signed(r.slope * 7) : '')}</T> : null}
      </Card>

      <Card title={F.howTitle} accent={t.muted}>
        <T muted size={13}>{F.how(profile.sex === 'female')}</T>
      </Card>
    </View>
  );
}
