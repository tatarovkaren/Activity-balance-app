import React, { useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { dayDiff, shiftDate, todayISO, ageAt, type ISODate } from '../core/dates';
import { bodyFatNorm, measureHint, navyBodyFat } from '../core/body';
import { classifyWorkout, KCAL_PER_KG, macroKcal } from '../core/energy';
import { applyFoodDays } from '../core/importers';
import { ANOMALY_REASONS, MEAL_SLOTS, type AnomalyReason, type MealSlot } from '../core/types';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Bar, Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { calibLine, detailText, importSummaryText } from '../ui/format';
import { errorText, useI18n } from '../i18n';
import { downloadBlob, svgToPng } from '../ui/files';
import { importFatSecretFile } from '../ui/fatsecret';
import { reportSvg } from '../ui/reportsvg';
import { dayPlan, fatTone, kcalTone, proteinTone, type Tone } from '../core/targets';
import { planLine, planNotes, toneColor } from '../ui/targets';
import { ProposalCards } from './Goal';
import { useAdvanced } from '../ui/mode';

export function DayScreen({
  sel,
  setSel,
  openFact,
  openPhoto,
}: {
  sel: ISODate;
  setSel: (d: ISODate) => void;
  openFact: () => void;
  /** «Сфотографировать» в приёме пищи: экран фото с выбранным приёмом. */
  openPhoto?: (meal?: MealSlot) => void;
}) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const D = tx.day;
  const { dm, int } = f;
  const kg = f.num;
  const { data, setDay, clearDay, replaceDays, setKeep, removeMeal } = useStore();
  const [askMeal, setAskMeal] = useState(false);
  const { profile, days, keep } = data;
  const e = days[sel] || {};
  const d = useDerived(profile, days, keep, sel);
  const plan = useMemo(() => dayPlan(profile, days, keep, sel), [profile, days, keep, sel]);
  const tg = plan.kind === 'ok' ? plan.targets : null;
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [reportMsg, setReportMsg] = useState('');
  const adv = useAdvanced();
  const today = todayISO();
  const set = (patch: Parameters<typeof setDay>[1]) => setDay(sel, patch);

  // ---- вес ----
  const prevW = days[shiftDate(sel, -1)]?.weight;
  const dW = e.weight && prevW ? e.weight - prevW : null;
  const w7 = [...Array(7)].map((_, i) => days[shiftDate(sel, -i)]?.weight).filter((x): x is number => !!x);
  let weighHint = '';
  if (!e.weight) {
    let last: ISODate | null = null;
    for (let i = 1; i <= 60; i++) {
      const dd = shiftDate(sel, -i);
      if (days[dd]?.weight) {
        last = dd;
        break;
      }
    }
    const ago = last ? dayDiff(last, sel) : 0;
    weighHint = sel === today ? (new Date().getHours() < 12 ? D.weight.hintMorning : D.weight.hintAfternoon) : D.weight.hintPast;
    if (last) weighHint += D.weight.hintLast(dm(last), ago);
    if (ago >= 3) weighHint += D.weight.hintSlow;
  }

  // ---- КБЖУ ----
  const autoKcal = macroKcal(e.protein, e.fat, e.carbs);
  const kcalShown = e.kcalManual ? e.kcal : autoKcal != null ? Math.round(autoKcal) : e.kcal;

  // ---- тренировка ----
  const kind = classifyWorkout(e.workoutType, e.workoutMin, e.workoutKind);
  // вид для переключателя: выбранный явно, а у старых записей — определённый по названию
  const kindChoice = e.workoutKind ?? (kind === 'strength' ? 'strength' : kind === 'none' ? undefined : 'cardio');
  const stepsFieldOn = kind === 'cardioLegs';
  const en = d.today;

  // ---- замеры ----
  const mh = measureHint(days, sel, profile.measureFreq);
  const bf = navyBodyFat(profile.sex, e, profile.heightCm);
  const age = ageAt(profile.birthDate, sel);
  const norm = age != null ? bodyFatNorm(profile.sex, age) : null;

  const r = d.adaptive;
  const anomalyOptions: { v: AnomalyReason | 'none'; label: string }[] = [
    { v: 'none', label: tx.common.no },
    ...ANOMALY_REASONS.filter((k) => k !== 'cycle' || profile.sex === 'female').map((k) => ({ v: k, label: tx.common.reason[k] })),
  ];

  const importCsv = async () => {
    const p = await importFatSecretFile();
    if (!p) return;
    if (!p.ok) return setImportMsg({ text: errorText(L, p.error), ok: false });
    const s = applyFoodDays(days, p.days, p.skipped);
    replaceDays(s.days);
    setImportMsg({ text: importSummaryText(L, s), ok: true });
    if (p.days.length === 1 && p.days[0].date !== sel) setSel(p.days[0].date);
  };

  const makeReport = async (send: boolean) => {
    const rep = reportSvg(L, { date: sel, name: profile.name || D.report.clientFallback, profile, e, energy: en, adaptive: r, prevWeight: prevW, plan });
    if (Platform.OS === 'web' && !send) {
      const b = await svgToPng(rep.svg, rep.w, rep.h);
      if (b) downloadBlob(`${tx.report.file}-${sel}.png`, b);
    }
    if (send) {
      set({ reportSentAt: Date.now() });
      setReportMsg(data.curator ? D.report.sent(dm(sel), data.curator.name) : D.report.noCurator);
    }
  };

  return (
    <View>
      {/* шапка с датой */}
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <T muted size={11} style={{ letterSpacing: 1.5 }}>{D.motto}</T>
          <T size={22} bold>
            {D.title(sel === today ? tx.common.today : sel === shiftDate(today, -1) ? tx.common.yesterday : f.longDate(sel), f.weekday(sel), sel >= shiftDate(today, -1))}
          </T>
          {e.reportSentAt ? <T muted size={12}>{D.reportSent}</T> : null}
        </View>
        <Row gap={6}>
          <Btn small title="‹" onPress={() => setSel(shiftDate(sel, -1))} testID="prevDay" />
          {sel !== today ? <Btn small title={tx.common.today} onPress={() => setSel(today)} /> : null}
          <Btn small title="›" onPress={() => setSel(shiftDate(sel, 1))} disabled={sel >= today} testID="nextDay" />
        </Row>
      </Row>

      <ProposalCards />

      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {/* Вес */}
        <Card title={D.weight.title} accent={t.blue} style={{ flexGrow: 1, flexBasis: 160 }}>
          <NumField big value={e.weight} onChange={(v) => set({ weight: v })} placeholder={D.weight.placeholder} digits={2} suffix={tx.common.kg} testID="weight" />
          <Gap h={6} />
          {dW != null ? (
            <T size={13} color={dW <= 0 ? t.green : t.red}>
              {D.weight.delta(dW <= 0 ? '▼' : '▲', kg(Math.abs(dW), 2))}
            </T>
          ) : null}
          {w7.length ? <T muted size={12}>{D.weight.weekAvg(kg(w7.reduce((a, b) => a + b, 0) / w7.length, 2), w7.length)}</T> : null}
          {weighHint ? <Note>{weighHint}</Note> : null}
        </Card>

        {/* Шаги */}
        <Card title={D.steps.title} accent={t.green} style={{ flexGrow: 1, flexBasis: 160 }}>
          <NumField big value={e.steps} onChange={(v) => set({ steps: v == null ? undefined : Math.round(v) })} placeholder="0" testID="steps" />
          <Gap h={8} />
          <Bar value={(e.steps || 0) / (profile.stepGoal || 10000)} color={t.green} />
          <Gap h={4} />
          <T muted size={12}>{D.steps.goal(int(profile.stepGoal))}{e.steps ? ` · ${Math.round(((e.steps || 0) / profile.stepGoal) * 100)}%` : ''}</T>
        </Card>
      </View>

      {/* КБЖУ */}
      <Card
        title={D.food.title}
        accent={t.amber}
      >
        <Row gap={6} style={{ marginBottom: 10 }}>
          {openPhoto ? <Btn small kind="solid" title={D.food.photo} onPress={() => setAskMeal(!askMeal)} testID="photoMeal" /> : null}
          <Btn small title={D.food.importFs} onPress={importCsv} testID="importCsv" />
        </Row>
        {askMeal && openPhoto ? (
          <View style={{ marginBottom: 10, gap: 6 }}>
            <T muted size={12}>{D.food.whichMeal}</T>
            <Row gap={6}>
              {MEAL_SLOTS.map((m) => (
                <Btn key={m} small kind="solid" title={'📷 ' + tx.meals[m]} onPress={() => openPhoto(m)} testID={'photoMeal-' + m} />
              ))}
            </Row>
          </View>
        ) : null}
        <NumField big label={D.food.kcal} value={kcalShown} onChange={(v) => set({ kcal: v == null ? undefined : Math.round(v), kcalManual: v != null })} placeholder="0" testID="kcal" />
        {tg ? <FactTarget fact={kcalShown} target={tg.kcal} tone={kcalTone(kcalShown, tg.kcal)} testID="kcalTarget" /> : null}
        <Gap h={6} />
        <Fields>
          <View>
            <NumField label={D.food.p} value={e.protein} onChange={(v) => set({ protein: v })} digits={1} testID="protein" />
            {tg ? <FactTarget fact={e.protein} target={tg.protein} tone={proteinTone(e.protein, tg.protein)} unit testID="proteinTarget" /> : null}
          </View>
          <View>
            <NumField label={D.food.f} value={e.fat} onChange={(v) => set({ fat: v })} digits={1} testID="fat" />
            {tg ? <FactTarget fact={e.fat} target={tg.fat} tone={fatTone(e.fat, tg.weight)} unit testID="fatTarget" /> : null}
          </View>
          <View>
            <NumField label={D.food.c} value={e.carbs} onChange={(v) => set({ carbs: v })} digits={1} testID="carbs" />
            {tg ? <FactTarget fact={e.carbs} target={tg.carbs} tone="none" unit testID="carbsTarget" /> : null}
          </View>
        </Fields>
        <Gap h={6} />
        <T muted size={12}>
          {e.kcalManual ? D.food.manual : autoKcal != null ? D.food.auto : ''}
          {tg ? tx.target.targetLabel + (fatTone(e.fat, tg.weight) === 'bad' ? ' · ' + tx.target.fatLow : '') : D.food.fsHint}
        </T>
        {importMsg ? <Note color={importMsg.ok ? t.green : t.red}>{importMsg.text}</Note> : null}
        {e.photoMeals?.length ? (
          <>
            <Divider />
            <T muted size={12}>{D.food.photoMeals}</T>
            {[...e.photoMeals]
              .sort((a, b) => MEAL_SLOTS.indexOf(a.meal) - MEAL_SLOTS.indexOf(b.meal) || a.at - b.at)
              .map((m) => (
                <View key={m.id} style={{ paddingVertical: 4 }} testID="photoMealRow">
                  <Row style={{ justifyContent: 'space-between' }}>
                    <T size={13} style={{ flexShrink: 1 }}>
                      <T bold size={13}>{tx.meals[m.meal]}</T>
                      <T size={11} color={t.amber}>{'  ' + D.food.byPhoto}</T>
                      {' · ' + m.items.map((it) => `${it.name} ${it.grams} ${tx.common.g}`).join(', ')}
                    </T>
                    <Btn small kind="link" title={tx.common.remove} color={t.muted} onPress={() => removeMeal(sel, m.id)} />
                  </Row>
                  <T muted mono size={12}>
                    {D.food.photoLine(int(m.kcal), int(m.kcalMin), int(m.kcalMax), kg(m.p), kg(m.f), kg(m.c))}
                  </T>
                </View>
              ))}
            <T muted size={11}>{D.food.photoNote}</T>
          </>
        ) : null}
      </Card>

      {/* Тренировка */}
      <Card title={D.workout.title} accent={t.red}>
        <Seg<'cardio' | 'strength'>
          value={kindChoice}
          onChange={(v) => set({ workoutKind: v })}
          options={[{ v: 'cardio', label: D.workout.cardio }, { v: 'strength', label: D.workout.strength }]}
          testID="workoutKind"
        />
        <Gap h={6} />
        <TextField value={e.workoutType} onChange={(v) => set({ workoutType: v })} placeholder={D.workout.typePlaceholder} testID="workoutType" />
        <Gap h={8} />
        <Fields>
          <NumField label={D.workout.minutes} value={e.workoutMin} onChange={(v) => set({ workoutMin: v })} testID="workoutMin" />
          <NumField label={D.workout.hrAvg} value={e.hrAvg} onChange={(v) => set({ hrAvg: v })} testID="hrAvg" />
          {adv ? <NumField label={D.workout.hrMax} value={e.hrMax} onChange={(v) => set({ hrMax: v })} /> : null}
        </Fields>
        {adv ? (
          <>
        <Gap h={8} />
        <NumField
          label={D.workout.steps}
          value={e.workoutSteps}
          onChange={(v) => set({ workoutSteps: v == null ? undefined : Math.round(v) })}
          disabled={!stepsFieldOn}
          placeholder={stepsFieldOn ? '≈' + int(Math.round((e.workoutMin || 0) * d.pace.pace)) : ''}
          testID="workoutSteps"
        />
        <T muted size={12}>
          {!stepsFieldOn ? D.workout.stepsOnlyLegs : e.workoutSteps != null ? D.workout.stepsTracker : D.workout.stepsEstimate(Math.round(d.pace.pace), d.pace.personal)}
        </T>
          </>
        ) : null}
        {kind !== 'none' ? (
          <T muted size={12}>{kind === 'strength' ? D.workout.strengthNote : kind === 'cardioNoSteps' ? D.workout.noStepsNote : ''}</T>
        ) : null}
        <Divider />
        {en ? (
          <>
            <T>
              {D.workout.expenditure}
              <T bold mono>{int(en.total)}</T> {tx.common.kcal}
            </T>
            {adv ? <T muted size={12}>{D.workout.breakdown(int(en.bmr), int(en.neat), int(en.train), int(en.tef))}</T> : null}
            {adv && en.workoutStepsDeducted > 0 ? (
              <T muted size={12}>{D.workout.stepsDeducted(int(en.workoutStepsDeducted), en.workoutStepsSource === 'tracker')}</T>
            ) : null}
          </>
        ) : (
          <T muted size={13}>{D.workout.noEnergy}</T>
        )}
      </Card>

      {/* Баланс */}
      <Card title={D.balance.title} accent={t.amber}>
        {en && en.intake ? (
          <T>
            {D.balance.today}
            <T bold>{int(en.intake)}</T>
            {D.balance.spent}
            <T bold>{int(en.total)}</T> →{' '}
            {en.total - en.intake >= 0 ? (
              <T color={t.green} bold>{D.balance.deficit(int(en.total - en.intake))}</T>
            ) : (
              <T color={t.red} bold>{D.balance.surplus(int(en.intake - en.total))}</T>
            )}
          </T>
        ) : (
          <T muted>{D.balance.todayEmpty}</T>
        )}
        <Gap h={4} />
        {d.week && d.week.n >= 3 ? (
          <T muted size={13}>
            {D.balance.week(
              d.week.n,
              int(d.week.intake),
              int(d.week.total),
              d.week.total >= d.week.intake,
              int(Math.abs(d.week.total - d.week.intake)),
              f.signed((-(d.week.total - d.week.intake) * 7) / KCAL_PER_KG),
            )}
          </T>
        ) : (
          <T muted size={13}>{D.balance.weekEmpty}</T>
        )}
        <Divider />
        <T size={13} bold={!!tg} color={tg ? t.text : t.muted}>{planLine(L, plan)}</T>
        {tg ? planNotes(L, tg).map((n, i) => <T key={i} size={12} color={n.warn ? t.amber : t.muted}>{n.text}</T>) : null}
        <Divider />
        <Pressable onPress={openFact} testID="openFact">
          {r ? (
            <>
              <T>
                {D.balance.fact}
                <T bold mono color={t.amber}>{calibLine(L, r).main}</T>
              </T>
              <T muted size={12}>{calibLine(L, r).sub}</T>
              {adv ? (
                <T size={12} color={r.reliability === 'high' ? t.green : r.reliability === 'low' ? t.amber : t.text}>
                  {D.balance.reliability(tx.common.reliability[r.reliability])}
                </T>
              ) : null}
            </>
          ) : (
            <T muted>{D.balance.factEmpty}</T>
          )}
        </Pressable>
        {adv ? null : r && r.exclList.length ? <Note>{tx.fact.moreInAdvanced(r.exclList.length)}</Note> : null}
        {adv && r?.autoList.slice(-3).map((a) => (
          <Row key={a.d} gap={6}>
            <Note>{D.balance.autoDay(dm(a.d), detailText(L, a.detail))}</Note>
            <Btn kind="link" small title={D.balance.returnToCalc} onPress={() => setKeep(a.d, true)} />
          </Row>
        ))}
      </Card>

      {/* Замеры */}
      <Card title={D.body.title(tx.common.freq[profile.measureFreq])} accent={t.teal}>
        {mh.kind === 'next' ? <T muted size={13}>{D.body.next(f.dmy(mh.date), mh.inDays)}</T> : null}
        {mh.kind === 'due' ? <Note>{D.body.due(f.dmy(mh.last), mh.agoDays)}</Note> : null}
        {mh.kind === 'first' ? <Note>{D.body.first(profile.sex === 'female')}</Note> : null}
        <Gap h={6} />
        <Fields>
          <NumField label={D.body.neck} value={e.neck} onChange={(v) => set({ neck: v })} digits={1} />
          <NumField label={D.body.waist} value={e.waist} onChange={(v) => set({ waist: v })} digits={1} />
          {profile.sex === 'female' ? <NumField label={D.body.hips} value={e.hips} onChange={(v) => set({ hips: v })} digits={1} /> : null}
        </Fields>
        <Gap h={8} />
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T muted size={11}>{D.body.fat}</T>
            <T bold mono size={20}>{bf != null ? kg(bf) + '%' : '—'}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T muted size={11}>{D.body.ageNorm}</T>
            <T mono>{age != null && norm ? `${age} · ${norm[0]}–${norm[1]}%` : '—'}</T>
          </View>
        </Row>
      </Card>

      {/* Комментарий */}
      <Card title={D.comment.title} accent={t.violet}>
        <TextField multiline value={e.comment} onChange={(v) => set({ comment: v })} placeholder={D.comment.placeholder} testID="comment" />
        <Gap h={8} />
        <T muted size={12}>{D.comment.wellbeing}</T>
        <Row gap={6}>
          {[...Array(10)].map((_, i) => {
            const n = i + 1;
            const on = e.wellbeing === n;
            return (
              <Pressable
                key={n}
                onPress={() => set({ wellbeing: on ? undefined : n })}
                style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: on ? t.violet : t.line, backgroundColor: on ? t.violet : 'transparent', alignItems: 'center', justifyContent: 'center' }}
              >
                <T size={13} color={on ? t.onAccent : t.text}>{n}</T>
              </Pressable>
            );
          })}
        </Row>
        <Gap h={10} />
        <T muted size={12}>{D.comment.unusual}</T>
        <Seg
          testID="anomaly"
          color={t.violet}
          options={anomalyOptions}
          value={e.anomaly || 'none'}
          onChange={(v) => set({ anomaly: v === 'none' ? undefined : v })}
        />
        <Gap h={4} />
        <T muted size={12}>{D.comment.unusualNote}</T>
        {profile.sex === 'female' && e.anomaly === 'cycle' ? (
          <Note color={t.violet}>{D.comment.cycleNote}</Note>
        ) : null}
      </Card>

      <Row gap={8} style={{ marginBottom: 6 }}>
        <Btn kind="solid" title={D.report.send} onPress={() => makeReport(true)} style={{ flexGrow: 1 }} testID="sendReport" />
        {Platform.OS === 'web' ? <Btn title={D.report.image} onPress={() => makeReport(false)} style={{ flexGrow: 1 }} /> : null}
      </Row>
      {reportMsg ? <Note color={t.green}>{reportMsg}</Note> : null}
      <Gap h={6} />
      {confirmClear ? (
        <Row>
          <T muted size={13}>{D.clear.ask(dm(sel))}</T>
          <Btn small title={D.clear.yes} color={t.red} kind="solid" onPress={() => { clearDay(sel); setConfirmClear(false); }} />
          <Btn small title={tx.common.cancel} onPress={() => setConfirmClear(false)} />
        </Row>
      ) : (
        <Btn kind="link" small title={D.clear.link} color={t.muted} onPress={() => setConfirmClear(true)} />
      )}
    </View>
  );
}

/** «факт / цель» под полем КБЖУ с цветом по правилам ТЗ. */
function FactTarget({ fact, target, tone, unit }: { fact: number | undefined; target: number; tone: Tone; unit?: boolean; testID?: string }) {
  const t = useTheme();
  const { tx, f } = useI18n();
  return (
    <T size={12} mono color={tone === 'none' ? t.muted : toneColor(t, tone)}>
      {tx.target.factTarget(fact != null ? f.int(fact) : '—', f.int(target))}
      {unit ? ' ' + tx.common.g : ''}
    </T>
  );
}
