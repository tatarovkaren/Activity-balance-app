import React from 'react';
import { View } from 'react-native';
import { dm, type ISODate } from '../core/dates';
import { goalForecast, fmtSignedKg, PARAMS } from '../core/adaptive';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Btn, Card, Divider, Gap, Note, Row, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { calibLine, factLine, goalText, RELIABILITY_LABEL, reliabilityDetails } from '../ui/format';
import { Chart } from '../ui/Chart';

export function FactScreen({ sel }: { sel: ISODate }) {
  const t = useTheme();
  const { data, setKeep, setDay } = useStore();
  const { profile, days, keep } = data;
  const d = useDerived(profile, days, keep, sel);
  const r = d.adaptive;
  const goal = goalForecast(r, sel, profile.goalWeightKg, days[sel]?.weight || d.weight);
  const premiumLocked = profile.plan === 'free';

  if (!r)
    return (
      <Card title="Расход по факту" accent={t.amber}>
        <T muted>Нужны вес и калории хотя бы за один день. Быстрее всего — импорт истории веса и выгрузки FatSecret в профиле.</T>
      </Card>
    );
  const c = calibLine(r);
  const relColor = r.reliability === 'high' ? t.green : r.reliability === 'low' ? t.amber : t.text;
  const pts = r.series.filter((p) => p.E != null);

  return (
    <View>
      <T size={22} bold>Расход по факту</T>
      <T muted size={13}>Уточняется по вашему весу каждый день · на {dm(sel)}</T>
      <Gap h={12} />
      <Card accent={t.amber}>
        <T bold mono size={32} color={t.amber}>{c.main}</T>
        <T muted size={13}>{c.sub}</T>
        <Gap h={6} />
        <T size={13}>{factLine(r)}</T>
        <T size={13}>
          Надёжность: <T bold color={relColor}>{RELIABILITY_LABEL[r.reliability]}</T> · {reliabilityDetails(r)}
        </T>
        {premiumLocked ? (
          <>
            <Gap h={6} />
            <T muted size={12}>«Расход по факту» входит в премиум (гипотеза плана). В пилоте доступен всем.</T>
          </>
        ) : null}
      </Card>

      {pts.length >= 7 ? (
        <Card title={`Расход, ккал/день · до ${PARAMS.WIN} дней`} accent={t.amber}>
          <Chart
            height={150}
            exportName={`rashod-po-faktu-${sel}`}
            spec={{
              title: 'Расход по факту и по формуле',
              from: pts[0].d,
              to: pts[pts.length - 1].d,
              yStep: 100,
              series: [
                { label: 'по факту', color: t.amber, width: 2.4, points: pts.map((p) => ({ d: p.d, v: p.E! })) },
                { label: 'по формуле', color: t.muted, dash: true, width: 1.5, points: r.series.filter((p) => p.formula != null).map((p) => ({ d: p.d, v: p.formula! })) },
              ],
              marks: r.series.filter((p) => p.excl).map((p) => p.d),
            }}
          />
        </Card>
      ) : null}

      <Card title="Вне расчёта за 28 дней" accent={t.red}>
        {r.exclList.length ? (
          r.exclList.map((x) => (
            <Row key={x.d} gap={6} style={{ marginBottom: 4 }}>
              <T size={13}>
                {dm(x.d)} — {x.why} <T muted size={12}>{x.auto ? `(авто: ${x.t})` : '(ваша отметка)'}</T>
              </T>
              {x.auto ? (
                <Btn kind="link" small title="вернуть в расчёт" onPress={() => setKeep(x.d, true)} />
              ) : (
                <Btn kind="link" small title="снять отметку" onPress={() => setDay(x.d, { anomaly: undefined })} />
              )}
            </Row>
          ))
        ) : (
          <T muted size={13}>нет</T>
        )}
        {r.recList.length ? (
          <>
            <Gap h={6} />
            <T muted size={12}>Вес после необычных дней (2–3 дня) не идёт в тренд: {r.recList.map(dm).join(', ')}</T>
          </>
        ) : null}
        {r.kept.length ? (
          <>
            <Divider />
            <T bold size={13}>Возвращены в расчёт вручную</T>
            {r.kept.map((x) => (
              <Row key={x.d} gap={6}>
                <T size={13}>
                  {dm(x.d)} — {x.why}
                </T>
                <Btn kind="link" small title="исключить снова" onPress={() => setKeep(x.d, false)} />
              </Row>
            ))}
          </>
        ) : null}
        {r.autoList.length ? (
          <>
            <Gap h={6} />
            <Note>Автонаходки — это подсказка. Если день был обычным, верните его в расчёт.</Note>
          </>
        ) : null}
      </Card>

      <Card title="Прогноз цели" accent={t.blue}>
        <T size={14}>{goalText(goal)}</T>
        {r.trendW ? <T muted size={12}>Вес по тренду сейчас {r.trendW.toFixed(1).replace('.', ',')} кг{r.slope != null ? ` · темп ${fmtSignedKg(r.slope * 7)} кг/нед` : ''}</T> : null}
      </Card>

      <Card title="Как это считается" accent={t.muted}>
        <T muted size={13}>
          Старт — с формулы (БМР + шаги + тренировки + переваривание). Каждый день приложение считает тренд веса по обычным дням за 56 дней (свежие дни весят больше, влияние дня уполовинивается за 14 дней) и сравнивает со средними калориями. Оценка сдвигается к факту на долю, которая растёт с данными (полное доверие — 14 взвешиваний и 20 дней с калориями за 28 дней), и не больше чем на ±50 ккал за день. Поездки, застолья, болезнь, неполный дневник{profile.sex === 'female' ? ', цикл' : ''} и 2–3 дня после них в тренд не идут. Если исключено больше 20% дней, доверие снижается вдвое.
        </T>
      </Card>
    </View>
  );
}
