// Кабинет куратора (веб): все клиенты на одном экране — кто не отчитался или не взвешивался,
// у кого низкая надёжность, темп и прогноз цели; ниже — отчёт дня выбранного клиента и комментарий.

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { dayDiff, dm, dmy, shiftDate, todayISO, weekday, type ISODate } from '../core/dates';
import { adaptiveTDEE, fmtSignedKg, goalForecast, type AdaptiveResult } from '../core/adaptive';
import { demoClients } from '../core/demo';
import { makeDayModel } from '../core/adaptive';
import { ANOMALY_LABELS, type DayMap, type Profile } from '../core/types';
import { useStore } from '../data/store';
import { addCuratorComment, curatorClients } from '../data/cloud';
import { Btn, Card, Gap, Note, Row, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { int, kg, RELIABILITY_LABEL } from '../ui/format';
import { Chart } from '../ui/Chart';

interface ClientRow {
  id: string;
  name: string;
  profile: Profile;
  days: DayMap;
  r: AdaptiveResult | null;
  status: { text: string; tone: 'ok' | 'warn' | 'muted' };
  weight?: number;
  goal: string;
}

function statusOf(days: DayMap, today: ISODate, r: AdaptiveResult | null): ClientRow['status'] {
  const all = Object.keys(days).sort();
  const first = all[0];
  if (first && dayDiff(first, today) < 14) return { text: `новый клиент, ${dayDiff(first, today) + 1} дн.`, tone: 'muted' };
  const e = days[today];
  if (e?.anomaly) {
    let n = 0;
    for (let i = 0; i < 7 && days[shiftDate(today, -i)]?.anomaly; i++) n++;
    return { text: `${ANOMALY_LABELS[e.anomaly]}, ${n} дн. вне расчёта`, tone: 'warn' };
  }
  let lastW: ISODate | undefined;
  for (let i = 0; i < 30; i++) if (days[shiftDate(today, -i)]?.weight) { lastW = shiftDate(today, -i); break; }
  const noW = lastW ? dayDiff(lastW, today) : 30;
  if (noW >= 3) return { text: `нет веса ${noW} дн.`, tone: 'warn' };
  if (!e || !(e.kcal || e.protein)) return { text: 'не отчитался', tone: 'warn' };
  if (e.reportSentAt) return { text: 'отчёт отправлен', tone: 'ok' };
  return { text: 'заполнен', tone: 'ok' };
}

export function CuratorScreen() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const { session, setRole, logout } = useStore();
  const today = todayISO();
  const [raw, setRaw] = useState<{ id: string; name: string; profile: Profile; days: DayMap }[]>([]);
  const [err, setErr] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (session.mode === 'cloud') {
      curatorClients(shiftDate(today, -120))
        .then((rows) => setRaw(rows.map((r) => ({ id: r.client_id, name: r.name, profile: r.profile, days: r.days }))))
        .catch((e) => setErr(e.message));
    } else setRaw(demoClients(today));
  }, [session.mode, today]);

  const rows: ClientRow[] = useMemo(
    () =>
      raw.map((c) => {
        const r = adaptiveTDEE(today, { profile: c.profile, days: c.days }, {});
        let weight: number | undefined;
        for (let i = 0; i < 14 && !weight; i++) weight = c.days[shiftDate(today, -i)]?.weight;
        const g = goalForecast(r, today, c.profile.goalWeightKg, weight);
        const goal = g.kind === 'date' ? dmy(g.date) : g.kind === 'reached' ? 'достигнута' : g.kind === 'notApproaching' ? 'не приближается' : g.kind === 'noTrend' ? 'набор данных' : '—';
        return { ...c, r, weight, status: statusOf(c.days, today, r), goal };
      }),
    [raw, today],
  );
  const attention = rows.filter((r) => r.status.tone === 'warn' || r.r?.reliability === 'low').length;
  const sel = rows.find((r) => r.id === selId) || rows[0];

  const cols = ['Клиент', 'Отчёт сегодня', 'Вес · тренд/нед', 'Расход по факту', 'Надёжность', 'До цели'];

  const sidebar = (
    <View style={{ width: wide ? 200 : '100%', paddingRight: wide ? 16 : 0, marginBottom: 12 }}>
      <T bold size={16}>Баланс · куратор</T>
      <Gap />
      {['Клиенты', 'Отчёты дня', 'Чат (скоро)', 'Шаблоны планов (скоро)'].map((x, i) => (
        <T key={x} size={14} color={i === 0 ? t.amber : t.muted} style={{ paddingVertical: 4 }}>{x}</T>
      ))}
      <Gap />
      <T muted size={12}>Тариф «Старт»: до 10 клиентов · сейчас {rows.length}</T>
      <T muted size={12}>Код приглашения: <T mono bold size={12}>FIT-2048</T></T>
      <Gap />
      <Btn small title="Мой дневник" onPress={() => setRole('client')} />
      <Gap h={6} />
      <Btn small title="Выйти" color={t.red} onPress={logout} />
    </View>
  );

  return (
    <View style={{ flexDirection: wide ? 'row' : 'column' }}>
      {sidebar}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T size={22} bold>Клиенты</T>
            <T muted size={13}>{weekday(today)}, {dmy(today)}{session.mode !== 'cloud' ? ' · демо-данные' : ''}</T>
          </View>
          <T size={13} color={attention ? t.amber : t.green}>{rows.length - attention} из {rows.length} в норме · {attention} требуют внимания</T>
        </Row>
        {err ? <Note color={t.red}>{err}</Note> : null}
        <Gap />
        <Card style={{ padding: 0 }}>
          <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
            <View style={{ minWidth: 760, width: '100%' }}>
              <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }}>
                {cols.map((c, i) => (
                  <T key={c} muted size={11} style={{ flex: i === 0 ? 1.2 : 1, letterSpacing: 0.8 }}>{c.toUpperCase()}</T>
                ))}
              </View>
              {rows.map((c) => {
                const on = sel?.id === c.id;
                const toneC = c.status.tone === 'ok' ? t.text : c.status.tone === 'warn' ? t.amber : t.muted;
                const rel = c.r?.reliability;
                return (
                  <View key={c.id} style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line, backgroundColor: on ? t.amber + '14' : 'transparent' }}>
                    <T size={14} style={{ flex: 1.2 }} bold={on}>
                      <T color={c.status.tone === 'warn' ? t.amber : t.green}>● </T>
                      <T onPress={() => setSelId(c.id)} style={{ textDecorationLine: 'underline' }}>{c.name}</T>
                    </T>
                    <T size={13} color={toneC} style={{ flex: 1 }}>{c.status.text}</T>
                    <T mono size={13} style={{ flex: 1 }}>{c.weight ? kg(c.weight) : '—'} · {c.r?.slope != null ? fmtSignedKg(c.r.slope * 7) : '—'}</T>
                    <T mono size={13} style={{ flex: 1 }}>
                      {c.r?.E != null ? int(c.r.E) : '—'}
                      {c.r && c.r.alpha === 0 ? <T muted size={11}> (формула)</T> : null}
                    </T>
                    <T size={13} style={{ flex: 1 }} color={rel === 'high' ? t.green : rel === 'low' ? t.amber : t.text}>{rel ? RELIABILITY_LABEL[rel] : '—'}</T>
                    <T size={13} style={{ flex: 1 }} muted={c.goal === '—'}>{c.goal}</T>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        {sel ? <ClientDay c={sel} today={today} comments={comments[sel.id] || []} onComment={async (text) => {
          if (session.mode === 'cloud') await addCuratorComment(sel.id, today, text).catch((e) => setErr(e.message));
          setComments({ ...comments, [sel.id]: [...(comments[sel.id] || []), text] });
        }} comment={comment} setComment={setComment} /> : null}
      </View>
    </View>
  );
}

function ClientDay({ c, today, comments, onComment, comment, setComment }: { c: ClientRow; today: ISODate; comments: string[]; onComment: (t: string) => void; comment: string; setComment: (s: string) => void }) {
  const t = useTheme();
  let d = today;
  for (let i = 0; i < 7 && !c.days[d]; i++) d = shiftDate(d, -1);
  const e = c.days[d] || {};
  const model = makeDayModel({ profile: c.profile, days: c.days });
  const m = model(e, d);
  const r = c.r;
  const weights = Object.keys(c.days).filter((x) => x >= shiftDate(today, -55) && c.days[x].weight).sort().map((x) => ({ d: x, v: c.days[x].weight! }));
  return (
    <Card title={`Отчёт дня · ${c.name} · ${dm(d)}`} accent={t.amber}>
      <T size={13}>
        {m?.intake ? `Съедено ${int(m.intake)} из ${int(m.total)} · ` : ''}Б {e.protein ?? '—'} Ж {e.fat ?? '—'} У {e.carbs ?? '—'} · {e.steps ? int(e.steps) + ' шагов' : 'шагов нет'}
        {e.workoutMin ? ` · ${e.workoutType} ${e.workoutMin} мин` : ''}{e.wellbeing ? ` · самочувствие ${e.wellbeing}/10` : ''}
      </T>
      {e.comment ? <T muted size={13}>Комментарий: «{e.comment}»</T> : null}
      {r?.exclList.length ? <T muted size={12}>Вне расчёта за 28 дней: {r.exclList.map((x) => `${dm(x.d)} ${x.why}${x.auto ? ' (авто)' : ''}`).join(', ')}</T> : null}
      {weights.length >= 3 ? (
        <>
          <Gap h={6} />
          <Chart height={120} spec={{ from: weights[0].d, to: weights[weights.length - 1].d, legend: false, series: [{ label: 'вес', color: t.blue, dots: true, points: weights }] }} />
        </>
      ) : null}
      {comments.map((x, i) => (
        <T key={i} size={13} color={t.violet}>Вы: {x}</T>
      ))}
      <Gap h={6} />
      <Fields>
        <TextField value={comment} onChange={setComment} placeholder="Комментарий к дню" />
        <Btn small title="Отправить" disabled={!comment.trim()} onPress={() => { onComment(comment.trim()); setComment(''); }} />
      </Fields>
    </Card>
  );
}
