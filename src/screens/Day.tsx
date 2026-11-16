import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { dayDiff, dm, shiftDate, todayISO, weekday, longDate, ageAt, type ISODate } from '../core/dates';
import { bodyFatNorm, FREQ_LABEL, measureHint, navyBodyFat } from '../core/body';
import { classifyWorkout, KCAL_PER_KG, macroKcal } from '../core/energy';
import { fmtSignedKg } from '../core/adaptive';
import { applyFoodDays, importSummaryText, parseFatSecret } from '../core/importers';
import { ANOMALY_LABELS, type AnomalyReason } from '../core/types';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Bar, Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { calibLine, int, kg, RELIABILITY_LABEL } from '../ui/format';
import { pickTextFile, downloadBlob, svgToPng } from '../ui/files';
import { reportSvg } from '../ui/reportsvg';

const WORKOUT_CHIPS = ['Силовая', 'Орбитрек', 'Бег', 'Ходьба', 'Велотренажёр', 'Плавание'];

export function DayScreen({ sel, setSel, openFact }: { sel: ISODate; setSel: (d: ISODate) => void; openFact: () => void }) {
  const t = useTheme();
  const { data, setDay, clearDay, replaceDays, setKeep } = useStore();
  const { profile, days, keep } = data;
  const e = days[sel] || {};
  const d = useDerived(profile, days, keep, sel);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [reportMsg, setReportMsg] = useState('');
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
    weighHint =
      sel === today
        ? new Date().getHours() < 12
          ? 'Веса ещё нет — взвесьтесь натощак, после туалета.'
          : 'Веса нет. Днём он выше утреннего на 0,5–1,5 кг — лучше завтра утром натощак.'
        : 'В этот день веса нет — в тренд не идёт.';
    if (last) weighHint += ` Последнее: ${dm(last)}${ago > 1 ? ` (${ago} дн. назад)` : ''}.`;
    if (ago >= 3) weighHint += ' Без взвешиваний расход по факту уточняется медленнее.';
  }

  // ---- КБЖУ ----
  const autoKcal = macroKcal(e.protein, e.fat, e.carbs);
  const kcalShown = e.kcalManual ? e.kcal : autoKcal != null ? Math.round(autoKcal) : e.kcal;

  // ---- тренировка ----
  const kind = classifyWorkout(e.workoutType, e.workoutMin);
  const stepsFieldOn = kind === 'cardioLegs';
  const en = d.today;

  // ---- замеры ----
  const mh = measureHint(days, sel, profile.measureFreq);
  const bf = navyBodyFat(profile.sex, e, profile.heightCm);
  const age = ageAt(profile.birthDate, sel);
  const norm = age != null ? bodyFatNorm(profile.sex, age) : null;

  const r = d.adaptive;
  const anomalyOptions: { v: AnomalyReason | 'none'; label: string }[] = [
    { v: 'none', label: 'нет' },
    ...(Object.keys(ANOMALY_LABELS) as AnomalyReason[])
      .filter((k) => k !== 'cycle' || profile.sex === 'female')
      .map((k) => ({ v: k, label: ANOMALY_LABELS[k] })),
  ];

  const importCsv = async () => {
    const f = await pickTextFile(['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*']);
    if (!f) return;
    const p = parseFatSecret(f.text);
    if (!p.ok) return setImportMsg({ text: p.error, ok: false });
    const s = applyFoodDays(days, p.days, p.skipped);
    replaceDays(s.days);
    setImportMsg({ text: importSummaryText(s), ok: true });
    if (p.days.length === 1 && p.days[0].date !== sel) setSel(p.days[0].date);
  };

  const makeReport = async (send: boolean) => {
    const rep = reportSvg({ date: sel, name: profile.name || 'Клиент', profile, e, energy: en, adaptive: r, prevWeight: prevW });
    if (Platform.OS === 'web' && !send) {
      const b = await svgToPng(rep.svg, rep.w, rep.h);
      if (b) downloadBlob(`report-${sel}.png`, b);
    }
    if (send) {
      set({ reportSentAt: Date.now() });
      setReportMsg(data.curator ? `Отчёт за ${dm(sel)} отправлен куратору (${data.curator.name}).` : 'Куратор не подключён — подключите его в профиле. Отчёт сохранён как отправленный.');
    }
  };

  return (
    <View>
      {/* шапка с датой */}
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <T muted size={11} style={{ letterSpacing: 1.5 }}>ПРОЦЕСС · ДИСЦИПЛИНА</T>
          <T size={22} bold>
            {sel === today ? 'Сегодня' : sel === shiftDate(today, -1) ? 'Вчера' : longDate(sel)}, {weekday(sel)}
          </T>
          {e.reportSentAt ? <T muted size={12}>Отчёт куратору отправлен</T> : null}
        </View>
        <Row gap={6}>
          <Btn small title="‹" onPress={() => setSel(shiftDate(sel, -1))} testID="prevDay" />
          {sel !== today ? <Btn small title="Сегодня" onPress={() => setSel(today)} /> : null}
          <Btn small title="›" onPress={() => setSel(shiftDate(sel, 1))} disabled={sel >= today} testID="nextDay" />
        </Row>
      </Row>

      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {/* Вес */}
        <Card title="Утренний вес" accent={t.blue} style={{ flexGrow: 1, flexBasis: 160 }}>
          <NumField big value={e.weight} onChange={(v) => set({ weight: v })} placeholder="0,00" digits={2} suffix="кг" testID="weight" />
          <Gap h={6} />
          {dW != null ? (
            <T size={13} color={dW <= 0 ? t.green : t.red}>
              Δ к вчерашнему: {dW <= 0 ? '▼' : '▲'} {kg(Math.abs(dW), 2)} кг
            </T>
          ) : null}
          {w7.length ? <T muted size={12}>Среднее за неделю: {kg(w7.reduce((a, b) => a + b, 0) / w7.length, 2)} кг ({w7.length} дн.)</T> : null}
          {weighHint ? <Note>{weighHint}</Note> : null}
        </Card>

        {/* Шаги */}
        <Card title="Шаги" accent={t.green} style={{ flexGrow: 1, flexBasis: 160 }}>
          <NumField big value={e.steps} onChange={(v) => set({ steps: v == null ? undefined : Math.round(v) })} placeholder="0" testID="steps" />
          <Gap h={8} />
          <Bar value={(e.steps || 0) / (profile.stepGoal || 10000)} color={t.green} />
          <Gap h={4} />
          <T muted size={12}>цель {int(profile.stepGoal)}{e.steps ? ` · ${Math.round(((e.steps || 0) / profile.stepGoal) * 100)}%` : ''}</T>
        </Card>
      </View>

      {/* КБЖУ */}
      <Card
        title="Питание · КБЖУ"
        accent={t.amber}
        right={<Btn small title="Импорт FatSecret" onPress={importCsv} testID="importCsv" />}
      >
        <NumField big label="Ккал" value={kcalShown} onChange={(v) => set({ kcal: v == null ? undefined : Math.round(v), kcalManual: v != null })} placeholder="0" testID="kcal" />
        <Gap h={6} />
        <Fields>
          <NumField label="Б, г" value={e.protein} onChange={(v) => set({ protein: v })} digits={1} testID="protein" />
          <NumField label="Ж, г" value={e.fat} onChange={(v) => set({ fat: v })} digits={1} testID="fat" />
          <NumField label="У, г" value={e.carbs} onChange={(v) => set({ carbs: v })} digits={1} testID="carbs" />
        </Fields>
        <Gap h={6} />
        <T muted size={12}>
          {e.kcalManual ? 'Ккал введены вручную · ' : autoKcal != null ? 'Ккал = Б×4 + Ж×9 + У×4 · ' : ''}
          {profile.proteinPerKg && d.weight ? `норма белка ${Math.round(profile.proteinPerKg * d.weight)} г (${kg(profile.proteinPerKg)} г/кг)` : 'выгрузка FatSecret: один день или период — все дни сразу'}
        </T>
        {importMsg ? <Note color={importMsg.ok ? t.green : t.red}>{importMsg.text}</Note> : null}
      </Card>

      {/* Тренировка */}
      <Card title="Тренировка" accent={t.red}>
        <TextField value={e.workoutType} onChange={(v) => set({ workoutType: v })} placeholder="Тип: силовая, орбитрек, бег…" testID="workoutType" />
        <Gap h={6} />
        <Row gap={6}>
          {WORKOUT_CHIPS.map((c) => (
            <Pressable key={c} onPress={() => set({ workoutType: c })}>
              <T size={12} color={(e.workoutType || '').toLowerCase() === c.toLowerCase() ? t.red : t.muted}>{c}</T>
            </Pressable>
          ))}
        </Row>
        <Gap h={8} />
        <Fields>
          <NumField label="Время, мин" value={e.workoutMin} onChange={(v) => set({ workoutMin: v })} testID="workoutMin" />
          <NumField label="Пульс ср." value={e.hrAvg} onChange={(v) => set({ hrAvg: v })} testID="hrAvg" />
          <NumField label="Пульс макс." value={e.hrMax} onChange={(v) => set({ hrMax: v })} />
        </Fields>
        <Gap h={8} />
        <NumField
          label="Шаги на тренировке"
          value={e.workoutSteps}
          onChange={(v) => set({ workoutSteps: v == null ? undefined : Math.round(v) })}
          disabled={!stepsFieldOn}
          placeholder={stepsFieldOn ? '≈' + int(Math.round((e.workoutMin || 0) * d.pace.pace)) : ''}
          testID="workoutSteps"
        />
        <T muted size={12}>
          {!stepsFieldOn
            ? 'только для кардио на ногах'
            : e.workoutSteps != null
              ? 'из трекера — учтено точно'
              : `оценка ${Math.round(d.pace.pace)} шаг/мин (${d.pace.personal ? 'по вашим тренировкам' : 'по умолчанию'}) — впишите из трекера`}
        </T>
        {kind !== 'none' ? (
          <T muted size={12}>{kind === 'strength' ? 'Силовая считается по нагрузке, не по пульсу.' : kind === 'cardioNoSteps' ? 'Кардио без шагов: шаги не вычитаются.' : ''}</T>
        ) : null}
        <Divider />
        {en ? (
          <>
            <T>
              Расход энергии: <T bold mono>{int(en.total)}</T> ккал
            </T>
            <T muted size={12}>
              БМР {int(en.bmr)} · шаги {int(en.neat)} · трен. {int(en.train)} · переваривание {int(en.tef)}
            </T>
            {en.workoutStepsDeducted > 0 ? (
              <T muted size={12}>
                шаги на тренировке (−{int(en.workoutStepsDeducted)}, {en.workoutStepsSource === 'tracker' ? 'из трекера' : 'оценка'}) учтены в тренировке
              </T>
            ) : null}
          </>
        ) : (
          <T muted size={13}>Расход появится, когда будут вес (за день или 3 дня до), рост и дата рождения.</T>
        )}
      </Card>

      {/* Баланс */}
      <Card title="Баланс энергии" accent={t.amber}>
        {en && en.intake ? (
          <T>
            Сегодня: съедено <T bold>{int(en.intake)}</T> · расход <T bold>{int(en.total)}</T> →{' '}
            {en.total - en.intake >= 0 ? (
              <T color={t.green} bold>дефицит {int(en.total - en.intake)} ккал</T>
            ) : (
              <T color={t.red} bold>профицит {int(en.intake - en.total)} ккал</T>
            )}
          </T>
        ) : (
          <T muted>Сегодня: — (нужны калории и вес)</T>
        )}
        <Gap h={4} />
        {d.week && d.week.n >= 3 ? (
          <T muted size={13}>
            7 дней ({d.week.n} дн.): ср. съедено {int(d.week.intake)} · ср. расход {int(d.week.total)} →{' '}
            {d.week.total >= d.week.intake ? 'дефицит' : 'профицит'} {int(Math.abs(d.week.total - d.week.intake))} ккал/день · ожидаемо{' '}
            {fmtSignedKg((-(d.week.total - d.week.intake) * 7) / KCAL_PER_KG)} кг/нед
          </T>
        ) : (
          <T muted size={13}>7 дней: нужно минимум 3 дня с калориями</T>
        )}
        <Divider />
        <Pressable onPress={openFact} testID="openFact">
          {r ? (
            <>
              <T>
                Расход по факту: <T bold mono color={t.amber}>{calibLine(r).main}</T>
              </T>
              <T muted size={12}>{calibLine(r).sub}</T>
              <T size={12} color={r.reliability === 'high' ? t.green : r.reliability === 'low' ? t.amber : t.text}>
                Надёжность: {RELIABILITY_LABEL[r.reliability]} · подробнее ›
              </T>
            </>
          ) : (
            <T muted>Расход по факту появится, когда будут вес и калории.</T>
          )}
        </Pressable>
        {r?.autoList.slice(-3).map((a) => (
          <Row key={a.d} gap={6}>
            <Note>⚠ {dm(a.d)} похож на необычный день ({a.why})</Note>
            <Btn kind="link" small title="вернуть в расчёт" onPress={() => setKeep(a.d, true)} />
          </Row>
        ))}
      </Card>

      {/* Замеры */}
      <Card title={`Замеры тела · ${FREQ_LABEL[profile.measureFreq]}`} accent={t.teal}>
        {mh.kind === 'next' ? <T muted size={13}>Следующий замер: {dm(mh.date)}.{mh.date.slice(0, 4)} (через {mh.inDays} дн.)</T> : null}
        {mh.kind === 'due' ? <Note>Пора сделать замер: последний {dm(mh.last)}.{mh.last.slice(0, 4)} ({mh.agoDays} дн. назад)</Note> : null}
        {mh.kind === 'first' ? <Note>Сделайте первый замер: шея и живот{profile.sex === 'female' ? ' и бёдра' : ''} утром натощак</Note> : null}
        <Gap h={6} />
        <Fields>
          <NumField label="Шея, см" value={e.neck} onChange={(v) => set({ neck: v })} digits={1} />
          <NumField label="Живот (у пупка), см" value={e.waist} onChange={(v) => set({ waist: v })} digits={1} />
          {profile.sex === 'female' ? <NumField label="Бёдра, см" value={e.hips} onChange={(v) => set({ hips: v })} digits={1} /> : null}
        </Fields>
        <Gap h={8} />
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T muted size={11}>% ЖИРА (ВМС США)</T>
            <T bold mono size={20}>{bf != null ? kg(bf) + '%' : '—'}</T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T muted size={11}>ВОЗРАСТ · НОРМА</T>
            <T mono>{age != null && norm ? `${age} · ${norm[0]}–${norm[1]}%` : '—'}</T>
          </View>
        </Row>
      </Card>

      {/* Комментарий */}
      <Card title="Комментарий и самочувствие" accent={t.violet}>
        <TextField multiline value={e.comment} onChange={(v) => set({ comment: v })} placeholder="Сон, настроение, что было необычного…" testID="comment" />
        <Gap h={8} />
        <T muted size={12}>Самочувствие</T>
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
        <T muted size={12}>Необычный день</T>
        <Seg
          testID="anomaly"
          color={t.violet}
          options={anomalyOptions}
          value={e.anomaly || 'none'}
          onChange={(v) => set({ anomaly: v === 'none' ? undefined : v })}
        />
        <Gap h={4} />
        <T muted size={12}>Необычные дни не попадают в «расход по факту», чтобы вода и соль не выдавались за жир.</T>
        {profile.sex === 'female' && e.anomaly === 'cycle' ? (
          <Note color={t.violet}>Прибавка может быть из-за фазы цикла — это вода, а не жир. День не испортит расчёт.</Note>
        ) : null}
      </Card>

      <Row gap={8} style={{ marginBottom: 6 }}>
        <Btn kind="solid" title="Отправить отчёт куратору" onPress={() => makeReport(true)} style={{ flexGrow: 1 }} testID="sendReport" />
        {Platform.OS === 'web' ? <Btn title="Отчёт картинкой" onPress={() => makeReport(false)} style={{ flexGrow: 1 }} /> : null}
      </Row>
      {reportMsg ? <Note color={t.green}>{reportMsg}</Note> : null}
      <Gap h={6} />
      {confirmClear ? (
        <Row>
          <T muted size={13}>Очистить все поля за {dm(sel)}? Цели и настройки не трогаются.</T>
          <Btn small title="Очистить" color={t.red} kind="solid" onPress={() => { clearDay(sel); setConfirmClear(false); }} />
          <Btn small title="Отмена" onPress={() => setConfirmClear(false)} />
        </Row>
      ) : (
        <Btn kind="link" small title="Очистить день" color={t.muted} onPress={() => setConfirmClear(true)} />
      )}
    </View>
  );
}
