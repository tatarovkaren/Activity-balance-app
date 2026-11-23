// Рекомендации по корректировке планки (вариант Б): причина и одно действие (или выбор из 2–3)
// с кнопками «Применить» / «Не сейчас». Без куратора — карточка на «Дне» у клиента;
// с куратором — подсказка сначала уходит куратору в кабинет, клиенту приходит уже его решение.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { applyAction, weeklyAdvice, type Advice, type AdviceAction, type AdviceResult } from '../core/advice';
import { todayISO } from '../core/dates';
import { activeGoal, type GoalProposal } from '../core/targets';
import type { DayMap, Profile } from '../core/types';
import { proposeGoal } from '../data/cloud';
import { useStore } from '../data/store';
import { errorText, useI18n, type I18n } from '../i18n';
import { Btn, Card, Gap, Note, T } from '../ui/kit';
import { useTheme } from '../ui/theme';

/** Текст причины и, для недоучёта, список признаков. */
export function adviceText(L: I18n, a: Advice): { text: string; list?: string[]; after?: string } {
  const A = L.tx.target.advice;
  const { f } = L;
  const kg = (v: number) => f.signed(v, 2);
  const pct = (v: number) => f.num(Math.abs(v), 1);
  switch (a.reason) {
    case 'lowData':
      return { text: A.lowData(a.weighings, a.kcalDays) };
    case 'overeat': {
      const we = a.weekendPct;
      const wd = a.weekdayPct;
      // где больше перебор (недобор): выходные или будни, если разница заметная
      let where = '';
      if (we != null && wd != null && Math.abs(we - wd) >= 3) {
        const worseWeekend = a.under ? we < wd : we > wd;
        where = worseWeekend ? A.whereWeekend(f.signed(we, 1)) : A.whereWeekdays(f.signed(wd, 1));
      }
      if (!a.under) return { text: A.overeat(pct(a.avgPct), where) };
      return { text: (a.mode === 'maintain' ? A.undereatMaintain : a.mode === 'deficit' ? A.undereatDeficit : A.undereat)(pct(a.avgPct), where) };
    }
    case 'underreport':
      return { text: A.underreport(kg(a.planKgWeek), kg(a.factKgWeek)), list: a.signs.map((s) => A.signs[s]), after: A.checklist };
    case 'slow':
      return { text: a.planKgWeek > 0 ? A.slowSurplus(kg(a.planKgWeek), kg(a.factKgWeek)) : A.slow(kg(a.planKgWeek), kg(a.factKgWeek)) };
    case 'fast':
      return { text: a.planKgWeek > 0 ? A.fastSurplus(kg(a.planKgWeek), kg(a.factKgWeek)) : A.fast(f.num(a.pctWeek, 2)) };
  }
}

export function actionText(L: I18n, a: AdviceAction): string {
  const A = L.tx.target.advice.action;
  const { f } = L;
  if (a.kind === 'kcal') return (a.delta < 0 ? A.kcalDown : A.kcalUp)(f.int(Math.abs(a.delta)), f.int(a.from), f.int(a.to));
  if (a.kind === 'steps') return A.steps(f.int(a.from), f.int(a.to), f.int(a.kcalMin), f.int(a.kcalMax), f.num(a.kgMonth, 1));
  return A.date(f.dmy(a.from), f.dmy(a.to));
}

const actionsOf = (a: Advice): AdviceAction[] => (a.reason === 'slow' || a.reason === 'fast' ? a.actions : []);

/** Тело подсказки: причина, признаки, действия с кнопкой у каждого. */
function AdviceBody({ res, onAction, actionTitle }: { res: AdviceResult; onAction: (a: AdviceAction) => void; actionTitle: string }) {
  const L = useI18n();
  const x = adviceText(L, res.advice);
  const actions = actionsOf(res.advice);
  return (
    <>
      <T size={14}>{x.text}</T>
      {x.list?.map((s) => (
        <T key={s} size={13}>{'• ' + s}</T>
      ))}
      {x.after ? <T muted size={13}>{x.after}</T> : null}
      {actions.map((a, i) => (
        <View key={i} style={{ marginTop: 8, gap: 4 }} testID={'adviceAction-' + a.kind}>
          <T size={13} bold>{actionText(L, a)}</T>
          <View style={{ flexDirection: 'row' }}>
            <Btn small kind="solid" title={actionTitle} onPress={() => onAction(a)} testID={'adviceApply-' + a.kind} />
          </View>
        </View>
      ))}
    </>
  );
}

/** Карточка на «Дне» у клиента без куратора. */
export function AdviceCard() {
  const t = useTheme();
  const L = useI18n();
  const A = L.tx.target.advice;
  const { data, setGoal, setProfile } = useStore();
  const { profile, days, keep } = data;
  const today = todayISO();
  const [done, setDone] = useState(false);
  const res = useMemo(() => (data.curator ? null : weeklyAdvice(profile, days, keep, today)), [data.curator, profile, days, keep, today]);
  if (done) return <Note color={t.green}>{A.applied}</Note>;
  if (!res) return null;
  const mark = (action: 'applied' | 'dismissed', extra?: Partial<Profile>) =>
    setProfile({ ...extra, advice: [...(profile.advice || []), { week: res.week, at: today, action, reason: res.advice.reason }].slice(-30) });
  const apply = (a: AdviceAction) => {
    if (a.kind === 'steps') mark('applied', { stepGoal: a.to });
    else {
      const g = activeGoal(profile.goals, today);
      const next = g ? applyAction(g, a) : null;
      if (!next) return;
      setGoal({ ...next, by: 'user' });
      mark('applied');
    }
    setDone(true);
  };
  return (
    <View testID="adviceCard">
      <Card title={A.title} accent={t.blue}>
        <AdviceBody res={res} onAction={apply} actionTitle={A.apply} />
        <Gap h={8} />
        <View style={{ flexDirection: 'row' }}>
          <Btn small title={A.later} onPress={() => mark('dismissed')} testID="adviceLater" />
        </View>
        <Gap h={6} />
        <T muted size={11}>{A.disclaimer}</T>
      </Card>
    </View>
  );
}

/** Подсказка по клиенту в кабинете куратора: «Предложить клиенту» или «Скрыть». */
export function CuratorAdvice({ id, profile, days }: { id: string; profile: Profile; days: DayMap }) {
  const t = useTheme();
  const L = useI18n();
  const A = L.tx.target.advice;
  const C = A.curator;
  const { session } = useStore();
  const today = todayISO();
  const res = useMemo(() => weeklyAdvice(profile, days, {}, today), [profile, days, today]);
  const [hidden, setHidden] = useState<Record<string, true>>({});
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const key = id + ':' + (res?.week || '');
  if (!res || hidden[key]) return msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null;
  const propose = async (a: AdviceAction) => {
    const g = activeGoal(profile.goals, today);
    if (!g) return;
    const { start: _s, by: _b, ...cur } = g;
    const setting: GoalProposal['setting'] | null = a.kind === 'steps' ? { ...cur, stepGoal: a.to } : applyAction(g, a);
    if (!setting) return;
    if (session.mode !== 'cloud') {
      setMsg({ text: C.demo, ok: true });
      setHidden({ ...hidden, [key]: true });
      return;
    }
    try {
      await proposeGoal(id, setting, C.noteFrom(actionText(L, a)));
      setMsg({ text: C.sent, ok: true });
      setHidden({ ...hidden, [key]: true });
    } catch (e) {
      setMsg({ text: errorText(L, e), ok: false });
    }
  };
  return (
    <View testID="curatorAdvice" style={{ marginTop: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: t.blue + '55' }}>
      <T size={12} bold color={t.blue}>{C.title}</T>
      <T muted size={12}>{C.intro}</T>
      <Gap h={4} />
      <AdviceBody res={res} onAction={propose} actionTitle={C.propose} />
      <Gap h={8} />
      <View style={{ flexDirection: 'row' }}>
        <Btn small title={C.hide} onPress={() => setHidden({ ...hidden, [key]: true })} />
      </View>
      {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
    </View>
  );
}
