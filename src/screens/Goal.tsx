// Профиль → «Цель по калориям и БЖУ»: режим, темп или дата цели, коэффициент белка, планка,
// пересчёт и история режимов. И карточка предложения куратора (принять / отклонить).

import React, { useMemo, useState } from 'react';
import { isISODate, todayISO } from '../core/dates';
import { normDate } from '../core/importers';
import {
  activeGoal,
  dayPlan,
  DEFAULT_PACE_PCT,
  GOAL_MODES,
  PACE_LIMITS,
  PACE_PRESETS,
  PROTEIN_DEFAULT,
  validateSetting,
  type GoalMode,
  type GoalSetting,
} from '../core/targets';
import { useStore } from '../data/store';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { errorText, useI18n } from '../i18n';
import { basisLine, historyLine, pctText, planLine, planNotes, settingErrorText } from '../ui/targets';

type PaceChoice = string; // '0.5' | 'custom' | 'date'

const strip = (g: GoalSetting): Omit<GoalSetting, 'start'> => ({
  mode: g.mode,
  pacePct: g.pacePct,
  targetDate: g.targetDate,
  proteinPerLean: g.proteinPerLean,
});

export function GoalCard() {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const G = tx.target;
  const { data, setGoal, recalcGoal } = useStore();
  const { profile, days, keep } = data;
  const today = todayISO();
  const cur = activeGoal(profile.goals, today);
  const plan = useMemo(() => dayPlan(profile, days, keep, today), [profile, days, keep, today]);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [dateText, setDateText] = useState(cur?.targetDate ? f.dateInput(cur.targetDate) : '');
  // «свой» и «к дате» выбираются до того, как введено число или дата
  const [pick, setPick] = useState<'custom' | 'date' | null>(() =>
    cur && cur.mode !== 'maintain' && cur.pacePct != null && !PACE_PRESETS[cur.mode].includes(cur.pacePct) ? 'custom' : null,
  );

  const apply = (g: Omit<GoalSetting, 'start'>) => {
    const e = validateSetting(g);
    if (e) return setErr(settingErrorText(L, e));
    setErr('');
    setDone(false);
    setGoal({ ...g, by: 'user' });
  };

  const paceChoice: PaceChoice | undefined =
    !cur || cur.mode === 'maintain'
      ? undefined
      : cur.targetDate
        ? 'date'
        : pick || String(cur.pacePct ?? DEFAULT_PACE_PCT[cur.mode]);

  const paceOptions = (m: 'deficit' | 'surplus') => [
    ...PACE_PRESETS[m].map((v, i) => ({
      v: String(v),
      label: G.preset(pctText(L, v), (m === 'deficit' ? G.deficitNames : G.surplusNames)[i]),
    })),
    { v: 'custom', label: G.custom },
    { v: 'date', label: G.byDate },
  ];

  return (
    <Card title={G.title} accent={t.amber}>
      <T muted size={12}>{G.intro}</T>
      <Gap h={8} />
      <Seg<GoalMode>
        testID="goalMode"
        value={cur?.mode}
        onChange={(m) => {
          setPick(null);
          apply({ mode: m, proteinPerLean: cur?.proteinPerLean });
        }}
        options={GOAL_MODES.map((m) => ({ v: m, label: G.mode[m] }))}
      />
      {cur && cur.mode !== 'maintain' ? (
        <>
          <Gap h={8} />
          <T muted size={12}>{G.paceTitle}</T>
          <Seg<PaceChoice>
            testID="goalPace"
            value={paceChoice}
            onChange={(v) => {
              if (v === 'custom' || v === 'date') {
                setPick(v);
                if (v === 'custom' && cur.targetDate) apply({ ...strip(cur), targetDate: undefined });
                if (v === 'date') {
                  const iso = normDate(dateText);
                  if (isISODate(iso)) apply({ ...strip(cur), targetDate: iso, pacePct: undefined });
                }
                return;
              }
              setPick(null);
              apply({ ...strip(cur), pacePct: Number(v), targetDate: undefined });
            }}
            options={paceOptions(cur.mode)}
          />
          {paceChoice === 'custom' ? (
            <>
              <Gap h={6} />
              <Fields>
                <NumField
                  label={G.customLabel(pctText(L, PACE_LIMITS[cur.mode][0]), pctText(L, PACE_LIMITS[cur.mode][1]))}
                  value={cur.pacePct}
                  digits={2}
                  onChange={(v) => v != null && apply({ ...strip(cur), pacePct: v, targetDate: undefined })}
                  testID="goalCustomPace"
                />
              </Fields>
            </>
          ) : null}
          {paceChoice === 'date' ? (
            <>
              <Gap h={6} />
              <Fields>
                <TextField
                  label={G.dateLabel}
                  value={dateText}
                  placeholder={f.dateInputPlaceholder}
                  onChange={(v) => {
                    setDateText(v);
                    const iso = normDate(v);
                    if (isISODate(iso)) apply({ ...strip(cur), targetDate: iso, pacePct: undefined });
                  }}
                  testID="goalDate"
                />
              </Fields>
              <T muted size={12}>
                {profile.goalWeightKg ? G.dateNote(f.num(profile.goalWeightKg, 1)) : G.errors.needGoalWeight}
              </T>
            </>
          ) : null}
        </>
      ) : null}
      {cur ? (
        <>
          <Gap h={6} />
          <Fields>
            <NumField
              label={G.protein}
              value={cur.proteinPerLean}
              digits={1}
              placeholder={G.proteinPh(f.num(PROTEIN_DEFAULT[cur.mode], 1))}
              onChange={(v) => apply({ ...strip(cur), proteinPerLean: v })}
              testID="goalProtein"
            />
          </Fields>
        </>
      ) : null}
      {err ? <Note color={t.red}>{err}</Note> : null}
      <Divider />
      <T size={14} bold={plan.kind === 'ok'}>
        {planLine(L, plan)}
      </T>
      {plan.kind === 'ok' ? (
        <>
          <T muted size={12}>{basisLine(L, plan.targets)}</T>
          {planNotes(L, plan.targets).map((n, i) => (
            <T key={i} size={12} color={n.warn ? t.amber : t.muted}>
              {n.text}
            </T>
          ))}
        </>
      ) : null}
      {cur ? (
        <>
          <Gap h={6} />
          <Row>
            <Btn
              small
              title={G.recalc}
              onPress={() => {
                recalcGoal();
                setDone(true);
              }}
              testID="goalRecalc"
            />
            {done ? <T muted size={12}>{G.recalcDone}</T> : null}
          </Row>
        </>
      ) : null}
      {profile.goals && profile.goals.length ? (
        <>
          <Divider />
          <T muted size={12}>{G.history}</T>
          {[...profile.goals]
            .reverse()
            .slice(0, 12)
            .map((g) => (
              <T key={g.start} size={12}>
                {historyLine(L, g)}
              </T>
            ))}
        </>
      ) : null}
    </Card>
  );
}

/** Предложения куратора: применяются с сегодняшнего дня только после «Принять». */
export function ProposalCards() {
  const t = useTheme();
  const L = useI18n();
  const G = L.tx.target;
  const { data, answerProposal } = useStore();
  const [err, setErr] = useState('');
  const list = data.goalProposals || [];
  if (!list.length) return null;
  return (
    <>
      {list.map((p) => (
        <Card key={p.id} title={G.proposal.title(p.curatorName)} accent={t.blue}>
          <T size={14}>{historyLine(L, { ...p.setting, start: todayISO() })}</T>
          {p.note ? <T muted size={13}>{G.proposal.note(p.note)}</T> : null}
          <Gap h={6} />
          <Row>
            <Btn
              small
              kind="solid"
              title={G.proposal.accept}
              onPress={() => answerProposal(p.id, true).catch((e) => setErr(errorText(L, e)))}
              testID="proposalAccept"
            />
            <Btn small title={G.proposal.decline} onPress={() => answerProposal(p.id, false).catch((e) => setErr(errorText(L, e)))} />
          </Row>
          {err ? <Note color={t.red}>{err}</Note> : null}
        </Card>
      ))}
    </>
  );
}
