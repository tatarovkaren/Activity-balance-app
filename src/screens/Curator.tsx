// Кабинет куратора (веб): все клиенты на одном экране — кто не отчитался или не взвешивался,
// у кого низкая надёжность, темп и прогноз цели; ниже — отчёт дня выбранного клиента и комментарий.

import React, { useEffect, useMemo, useState } from 'react';
import { AppState, ScrollView, useWindowDimensions, View } from 'react-native';
import { dayDiff, shiftDate, todayISO, type ISODate } from '../core/dates';
import { adaptiveTDEE, goalForecast, type AdaptiveResult } from '../core/adaptive';
import { demoClients } from '../core/demo';
import { makeDayModel } from '../core/adaptive';
import type { DayMap, Profile } from '../core/types';
import { SELF_ID, useStore } from '../data/store';
import {
  addCuratorComment,
  createCuratorCode,
  curatorClients,
  curatorCommentsFor,
  curatorReferrals,
  endCuratorLink,
  myCuratorAccount,
  proposeGoal,
} from '../data/cloud';
import type { CuratorAccount } from '../core/promo';
import { PromoPanel, PromoSidebar, type PromoActions } from './Promo';
import { dayPlan, GOAL_MODES, validateSetting, type DayPlan, type GoalMode } from '../core/targets';
import { historyLine, planLine, settingErrorText } from '../ui/targets';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { goalShort, reasonText, workoutName } from '../ui/format';
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
  plan: DayPlan;
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
  const { session, data, setRole, logout, createCuratorAccount, setCuratorPlan, endReferral } = useStore();
  const cloud = session.mode === 'cloud';
  const today = todayISO();
  const [raw, setRaw] = useState<{ id: string; name: string; profile: Profile; days: DayMap }[]>([]);
  const [err, setErr] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<Record<string, { date: ISODate; text: string }[]>>({});
  const [cloudAcc, setCloudAcc] = useState<CuratorAccount | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const [promoErr, setPromoErr] = useState('');

  // без сервера кабинет живёт на этом устройстве (в демо — демо-куратор), в облаке — на сервере
  const acc = cloud ? cloudAcc : data.curatorAccount;

  useEffect(() => {
    if (!cloud) return;
    curatorClients(shiftDate(today, -120))
      .then((rows) => setRaw(rows.map((r) => ({ id: r.client_id, name: r.name, profile: r.profile, days: r.days }))))
      .catch((e) => setErr(errorText(L, e)));
    Promise.all([myCuratorAccount(), curatorReferrals().catch(() => [])])
      .then(([a, refs]) =>
        setCloudAcc(a ? { surname: a.surname, displayName: a.display_name, code: a.invite_code, plan: a.plan, createdAt: today, referrals: refs } : undefined),
      )
      .catch((e) => setPromoErr(errorText(L, e)));
  }, [cloud, today, L, reload]);

  // вернулись в приложение — подтянуть свежие дневники клиентов
  useEffect(() => {
    if (!cloud) return;
    const sub = AppState.addEventListener('change', (st) => st === 'active' && setReload((n) => n + 1));
    return () => sub.remove();
  }, [cloud]);

  // без сервера: в таблице — клиенты на ведении из списка «пришли по коду»
  const self = !!(data.curator && acc && data.curator.code === acc.code);
  const localRaw = useMemo(() => {
    if (cloud) return null;
    const active = new Set((acc?.referrals || []).filter((r) => r.status === 'active').map((r) => r.id));
    const list = session.mode === 'demo' ? demoClients(today, tx.demo).filter((c) => active.has(c.id)) : [];
    if (self && active.has(SELF_ID)) {
      const name = acc!.referrals.find((r) => r.id === SELF_ID)?.name || tx.curatorPromo.selfName;
      list.push({ id: SELF_ID, name, profile: data.profile, days: data.days });
    }
    return list;
  }, [cloud, acc, session.mode, today, tx.demo, tx.curatorPromo.selfName, self, data.profile, data.days]);
  useEffect(() => {
    if (localRaw) setRaw(localRaw);
  }, [localRaw]);

  const promoActions: PromoActions = cloud
    ? {
        create: async (surname, name) => {
          await createCuratorCode(name, surname);
          setReload((n) => n + 1);
        },
        end: async (id, how) => {
          await endCuratorLink(id, how).catch((e) => setPromoErr(errorText(L, e)));
          setReload((n) => n + 1);
        },
      }
    : { create: createCuratorAccount, setPlan: setCuratorPlan, end: endReferral };

  const rows: ClientRow[] = useMemo(
    () =>
      raw.map((c) => {
        const r = adaptiveTDEE(today, { profile: c.profile, days: c.days }, {});
        let weight: number | undefined;
        for (let i = 0; i < 14 && !weight; i++) weight = c.days[shiftDate(today, -i)]?.weight;
        const g = goalForecast(r, today, c.profile.goalWeightKg, weight);
        return { ...c, r, weight, status: statusOf(L, c.days, today), goal: goalShort(L, g), plan: dayPlan(c.profile, c.days, {}, today) };
      }),
    [raw, today, L],
  );
  const attention = rows.filter((r) => r.status.tone === 'warn' || r.r?.reliability === 'low').length;
  const sel = rows.find((r) => r.id === selId) || rows[0];

  // комментарии, оставленные раньше (в облаке они хранятся на сервере)
  const selKey = sel?.id;
  useEffect(() => {
    if (!cloud || !selKey) return;
    curatorCommentsFor(selKey, shiftDate(today, -14))
      .then((list) => setComments((cur) => ({ ...cur, [selKey]: list.map((x) => ({ date: x.date, text: x.text })) })))
      .catch(() => {});
  }, [cloud, selKey, today, reload]);

  const cols = C.cols;

  const sidebar = (
    <View style={{ width: wide ? 200 : '100%', paddingRight: wide ? 16 : 0, marginBottom: 12 }}>
      <T bold size={16}>{C.brand(tx.app.name)}</T>
      <Gap />
      {C.menu.map((x, i) => (
        <T key={x} size={14} color={i === 0 ? t.amber : t.muted} style={{ paddingVertical: 4 }}>{x}</T>
      ))}
      <Gap />
      <PromoSidebar acc={acc} />
      <Gap />
      {cloud ? (
        <>
          <Btn small title={C.refresh} onPress={() => { setErr(''); setReload((n) => n + 1); }} testID="curatorRefresh" />
          <Gap h={6} />
        </>
      ) : null}
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
            <View style={{ minWidth: 860, width: '100%' }}>
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
                    <T mono size={13} style={{ flex: 1 }} muted={c.plan.kind !== 'ok'}>
                      {c.plan.kind === 'ok' ? f.int(c.plan.targets.kcal) + ' · ' + tx.target.modeLower[c.plan.targets.mode] : '—'}
                    </T>
                    <T size={13} style={{ flex: 1 }} muted={c.goal === '—'}>{c.goal}</T>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        {sel ? <ClientDay c={sel} today={today} comments={comments[sel.id] || []} onComment={async (text) => {
          if (session.mode === 'cloud') await addCuratorComment(sel.id, today, text).catch((e) => setErr(errorText(L, e)));
          setComments({ ...comments, [sel.id]: [...(comments[sel.id] || []), { date: today, text }] });
        }} comment={comment} setComment={setComment} /> : null}

        <View testID="promoPanel">
          <PromoPanel acc={acc} actions={promoActions} err={promoErr} />
        </View>
      </View>
    </View>
  );
}

function ClientDay({ c, today, comments, onComment, comment, setComment }: { c: ClientRow; today: ISODate; comments: { date: ISODate; text: string }[]; onComment: (t: string) => void; comment: string; setComment: (s: string) => void }) {
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
        {e.workoutMin ? C.workout(workoutName(L, e.workoutType, e.workoutKind), e.workoutMin) : ''}
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
      <Divider />
      <T size={13} bold={c.plan.kind === 'ok'}>{c.plan.kind === 'none' ? C.goalNone : planLine(L, c.plan)}</T>
      {c.profile.goals?.length ? (
        <T muted size={12}>{C.goalHistory([...c.profile.goals].reverse().slice(0, 6).map((g) => historyLine(L, g)).join('; '))}</T>
      ) : null}
      <ProposeGoal c={c} />
      <Divider />
      {comments.map((x, i) => (
        <T key={i} size={13} color={t.violet}>{x.date === today ? C.you(x.text) : C.youOn(f.dm(x.date), x.text)}</T>
      ))}
      <Gap h={6} />
      <Fields>
        <TextField value={comment} onChange={setComment} placeholder={C.commentPh} />
        <Btn small title={C.send} disabled={!comment.trim()} onPress={() => { onComment(comment.trim()); setComment(''); }} />
      </Fields>
    </Card>
  );
}

/** Куратор предлагает режим цели; у клиента он применится только после подтверждения. */
function ProposeGoal({ c }: { c: ClientRow }) {
  const t = useTheme();
  const L = useI18n();
  const { tx } = L;
  const C = tx.curator;
  const G = tx.target;
  const { session } = useStore();
  const cur = c.plan.kind === 'none' ? undefined : c.plan.setting;
  const [mode, setMode] = useState<GoalMode | undefined>(undefined);
  const [pace, setPace] = useState<number | undefined>(undefined);
  const [protein, setProtein] = useState<number | undefined>(undefined);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  useEffect(() => {
    setMode(undefined);
    setPace(undefined);
    setProtein(undefined);
    setNote('');
    setMsg(null);
  }, [c.id]);
  const m = mode || cur?.mode;
  const send = async () => {
    if (!m) return;
    const setting = { mode: m, pacePct: m === 'maintain' ? undefined : pace, proteinPerLean: protein };
    const e = validateSetting(setting);
    if (e) return setMsg({ text: settingErrorText(L, e), ok: false });
    if (session.mode !== 'cloud') return setMsg({ text: C.proposeDemo, ok: true });
    try {
      await proposeGoal(c.id, setting, note.trim() || undefined);
      setMsg({ text: C.proposeSent, ok: true });
    } catch (err) {
      setMsg({ text: errorText(L, err), ok: false });
    }
  };
  return (
    <>
      <Gap h={6} />
      <T muted size={12}>{C.proposeTitle}</T>
      <Seg<GoalMode> value={m} onChange={setMode} options={GOAL_MODES.map((x) => ({ v: x, label: G.mode[x] }))} />
      <Gap h={6} />
      <Fields>
        {m && m !== 'maintain' ? <NumField label={G.paceTitle} value={pace} digits={2} onChange={setPace} placeholder={cur?.pacePct != null ? L.f.input(cur.pacePct) : ''} /> : null}
        <NumField label={G.protein} value={protein} digits={1} onChange={setProtein} />
      </Fields>
      <Gap h={6} />
      <Fields>
        <TextField value={note} onChange={setNote} placeholder={C.proposeNote} />
        <Btn small title={C.proposeSend} disabled={!m} onPress={send} />
      </Fields>
      {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
    </>
  );
}
