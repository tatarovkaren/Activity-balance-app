// Кабинет куратора (веб): все клиенты на одном экране — кто не отчитался или не взвешивался,
// у кого низкая надёжность, темп и прогноз цели; ниже — отчёт дня выбранного клиента и комментарий.

import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { dayDiff, shiftDate, todayISO, type ISODate } from '../core/dates';
import { adaptiveTDEE, goalForecast, type AdaptiveResult } from '../core/adaptive';
import { demoClients } from '../core/demo';
import { makeDayModel } from '../core/adaptive';
import type { DayMap, Profile } from '../core/types';
import { useStore } from '../data/store';
import { addCuratorComment, curatorClients } from '../data/cloud';
import { Btn, Card, Gap, Note, Row, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { goalShort, reasonText } from '../ui/format';
import { errorText, useI18n, type I18n } from '../i18n';
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

function statusOf(L: I18n, days: DayMap, today: ISODate): ClientRow['status'] {
  const S = L.tx.curator.status;
  const all = Object.keys(days).sort();
  const first = all[0];
  if (first && dayDiff(first, today) < 14) return { text: S.newClient(dayDiff(first, today) + 1), tone: 'muted' };
  const e = days[today];
  if (e?.anomaly) {
    let n = 0;
    for (let i = 0; i < 7 && days[shiftDate(today, -i)]?.anomaly; i++) n++;
    return { text: S.unusual(L.tx.common.reason[e.anomaly], n), tone: 'warn' };
  }
  let lastW: ISODate | undefined;
  for (let i = 0; i < 30; i++) if (days[shiftDate(today, -i)]?.weight) { lastW = shiftDate(today, -i); break; }
  const noW = lastW ? dayDiff(lastW, today) : 30;
  if (noW >= 3) return { text: S.noWeight(noW), tone: 'warn' };
  if (!e || !(e.kcal || e.protein)) return { text: S.noReport, tone: 'warn' };
  if (e.reportSentAt) return { text: S.sent, tone: 'ok' };
  return { text: S.filled, tone: 'ok' };
}

export function CuratorScreen() {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const C = tx.curator;
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
        .catch((e) => setErr(errorText(L, e)));
    } else setRaw(demoClients(today, tx.demo));
  }, [session.mode, today, L, tx.demo]);

  const rows: ClientRow[] = useMemo(
    () =>
      raw.map((c) => {
        const r = adaptiveTDEE(today, { profile: c.profile, days: c.days }, {});
        let weight: number | undefined;
        for (let i = 0; i < 14 && !weight; i++) weight = c.days[shiftDate(today, -i)]?.weight;
        const g = goalForecast(r, today, c.profile.goalWeightKg, weight);
        return { ...c, r, weight, status: statusOf(L, c.days, today), goal: goalShort(L, g) };
      }),
    [raw, today, L],
  );
  const attention = rows.filter((r) => r.status.tone === 'warn' || r.r?.reliability === 'low').length;
  const sel = rows.find((r) => r.id === selId) || rows[0];

  const cols = C.cols;

  const sidebar = (
    <View style={{ width: wide ? 200 : '100%', paddingRight: wide ? 16 : 0, marginBottom: 12 }}>
      <T bold size={16}>{C.brand(tx.app.name)}</T>
      <Gap />
      {C.menu.map((x, i) => (
        <T key={x} size={14} color={i === 0 ? t.amber : t.muted} style={{ paddingVertical: 4 }}>{x}</T>
      ))}
      <Gap />
      <T muted size={12}>{C.plan(rows.length)}</T>
      <T muted size={12}>
        {C.invite}
        <T mono bold size={12}>FIT-2048</T>
      </T>
      <Gap />
      <Btn small title={C.myDiary} onPress={() => setRole('client')} />
      <Gap h={6} />
      <Btn small title={C.logout} color={t.red} onPress={logout} />
    </View>
  );

  return (
    <View style={{ flexDirection: wide ? 'row' : 'column' }}>
      {sidebar}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T size={22} bold>{C.title}</T>
            <T muted size={13}>
              {tx.day.title(f.dmy(today), f.weekday(today))}
              {session.mode !== 'cloud' ? C.demoData : ''}
            </T>
          </View>
          <T size={13} color={attention ? t.amber : t.green}>{C.summary(rows.length - attention, rows.length, attention)}</T>
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
                    <T mono size={13} style={{ flex: 1 }}>{c.weight ? f.num(c.weight) : '—'} · {c.r?.slope != null ? f.signed(c.r.slope * 7) : '—'}</T>
                    <T mono size={13} style={{ flex: 1 }}>
                      {c.r?.E != null ? f.int(c.r.E) : '—'}
                      {c.r && c.r.alpha === 0 ? <T muted size={11}>{C.formula}</T> : null}
                    </T>
                    <T size={13} style={{ flex: 1 }} color={rel === 'high' ? t.green : rel === 'low' ? t.amber : t.text}>{rel ? tx.common.reliability[rel] : '—'}</T>
                    <T size={13} style={{ flex: 1 }} muted={c.goal === '—'}>{c.goal}</T>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        {sel ? <ClientDay c={sel} today={today} comments={comments[sel.id] || []} onComment={async (text) => {
          if (session.mode === 'cloud') await addCuratorComment(sel.id, today, text).catch((e) => setErr(errorText(L, e)));
          setComments({ ...comments, [sel.id]: [...(comments[sel.id] || []), text] });
        }} comment={comment} setComment={setComment} /> : null}
      </View>
    </View>
  );
}

function ClientDay({ c, today, comments, onComment, comment, setComment }: { c: ClientRow; today: ISODate; comments: string[]; onComment: (t: string) => void; comment: string; setComment: (s: string) => void }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const C = tx.curator;
  let d = today;
  for (let i = 0; i < 7 && !c.days[d]; i++) d = shiftDate(d, -1);
  const e = c.days[d] || {};
  const model = makeDayModel({ profile: c.profile, days: c.days });
  const m = model(e, d);
  const r = c.r;
  const n = (v: number | undefined) => (v != null ? f.input(v) : '—');
  const weights = Object.keys(c.days).filter((x) => x >= shiftDate(today, -55) && c.days[x].weight).sort().map((x) => ({ d: x, v: c.days[x].weight! }));
  return (
    <Card title={C.dayTitle(c.name, f.dm(d))} accent={t.amber}>
      <T size={13}>
        {m?.intake ? C.eaten(f.int(m.intake), f.int(m.total)) : ''}
        {C.macros(n(e.protein), n(e.fat), n(e.carbs))} · {e.steps ? C.steps(f.int(e.steps)) : C.noSteps}
        {e.workoutMin ? C.workout(e.workoutType || tx.report.workoutFallback, e.workoutMin) : ''}
        {e.wellbeing ? C.wellbeing(e.wellbeing) : ''}
      </T>
      {e.comment ? <T muted size={13}>{C.comment(e.comment)}</T> : null}
      {r?.exclList.length ? (
        <T muted size={12}>{C.excluded(r.exclList.map((x) => `${f.dm(x.d)} ${reasonText(L, x.why)}${x.auto ? C.autoMark : ''}`).join(', '))}</T>
      ) : null}
      {weights.length >= 3 ? (
        <>
          <Gap h={6} />
          <Chart height={120} spec={{ from: weights[0].d, to: weights[weights.length - 1].d, legend: false, series: [{ label: C.weight, color: t.blue, dots: true, points: weights }] }} />
        </>
      ) : null}
      {comments.map((x, i) => (
        <T key={i} size={13} color={t.violet}>{C.you(x)}</T>
      ))}
      <Gap h={6} />
      <Fields>
        <TextField value={comment} onChange={setComment} placeholder={C.commentPh} />
        <Btn small title={C.send} disabled={!comment.trim()} onPress={() => { onComment(comment.trim()); setComment(''); }} />
      </Fields>
    </Card>
  );
}
