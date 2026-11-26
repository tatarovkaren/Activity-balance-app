import React, { useEffect, useState } from 'react';
import { clampWorkoutGoal, WORKOUT_GOAL_DEFAULT } from '../core/workouts';
import { View } from 'react-native';
import { LAYOUT_MODES, type LayoutMode } from '../ui/layout';
import { ageAt, isISODate, todayISO, toLocalISO } from '../core/dates';
import { MEASURE_FREQS } from '../core/body';
import {
  applyFoodDays,
  applyWeights,
  normDate,
  parseBackup,
  parseWeightHistory,
} from '../core/importers';
import { applyReport, isReportBackup, parseReportBackup } from '../core/import-report';
import { DEFAULT_PROFILE, PALETTES, TEXT_SIZES, type PalettePref, UI_MODES, type MeasureFreq, type Profile, type Sex, type TextSize, type ThemePref, type UiMode } from '../core/types';
import { useStore } from '../data/store';
import { cloudConfigured } from '../data/cloud';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, DateField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { pickTextFile } from '../ui/files';
import { useBackupExport } from '../ui/backup';
import { importFatSecretFile } from '../ui/fatsecret';
import { importSummaryText } from '../ui/format';
import { errorText, useI18n } from '../i18n';
import { LangSwitch } from './Login';
import { GoalCard, ProposalCards } from './Goal';
import { ConsentCheck, openLegal } from './Legal';
import { LEGAL_DOCS } from '../legal';
import { HelpCard } from './Help';
import { AboutCard } from './About';
import { FeedbackCard } from './Feedback';
import { WikiCard } from './Wiki';
import { CodeEntry, OfferCard } from './Promo';
import { NotifyCard } from './Notify';
import { CuratorRequestBlock } from './CuratorRequest';

export function ProfileScreen({ openHand, openHelp, openWiki }: { openHand: () => void; openHelp: () => void; openWiki: () => void }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const P = tx.profile;
  const kg = f.num;
  const st = useStore();
  const { data, session, setProfile, replaceDays, importBackup, importReport, setCurator, unlinkCurator, logout, setRole, setConsent } = st;
  const p = data.profile;
  const [birth, setBirth] = useState(f.dateInput(p.birthDate));
  // смена языка — показать дату рождения в формате нового языка
  useEffect(() => setBirth(f.dateInput(p.birthDate)), [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const age = ageAt(p.birthDate, todayISO());
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const set = (patch: Partial<Profile>) => setProfile(patch);

  const importWeights = async () => {
    const f = await pickTextFile();
    if (!f) return;
    const r = parseWeightHistory(f.text);
    if (!r.ok) return setMsg({ text: errorText(L, r.error), ok: false });
    const a = applyWeights(data.days, r.points);
    replaceDays(a.days);
    setMsg({ text: P.weightsDone(a.added, a.kept), ok: true });
  };
  const importFood = async () => {
    const r = await importFatSecretFile();
    if (!r) return;
    if (!r.ok) return setMsg({ text: errorText(L, r.error), ok: false });
    const s = applyFoodDays(data.days, r.days, r.skipped);
    replaceDays(s.days);
    setMsg({ text: importSummaryText(L, s), ok: true });
  };
  const saveBackup = useBackupExport();
  const exportAll = () => setMsg({ text: P.backupDone(saveBackup()), ok: true });
  const importAll = async () => {
    const f = await pickTextFile(['application/json', '*/*']);
    if (!f) return;
    // резервная копия прототипа «Ежедневный отчёт» — перенос истории без затирания
    let report = false;
    try {
      report = isReportBackup(JSON.parse(f.text));
    } catch {}
    if (report) {
      const rr = parseReportBackup(f.text);
      if (!rr.ok) return setMsg({ text: errorText(L, rr.error), ok: false });
      const a = applyReport(data.days, data.keep, p, rr.report, DEFAULT_PROFILE.stepGoal);
      importReport(a);
      return setMsg({ text: P.reportImported(a.total, a.added, a.filled, a.from ? L.f.dmy(a.from) : '', a.to ? L.f.dmy(a.to) : ''), ok: true });
    }
    const r = parseBackup(f.text, session.userId);
    if (!r.ok) return setMsg({ text: errorText(L, r.error), ok: false });
    importBackup(r.backup.data as never);
    setMsg({ text: P.backupImported(Object.keys(r.backup.data.days).length), ok: true });
  };

  return (
    <View>
      <T size={22} bold>{P.title}</T>
      <T muted size={13}>{session.mode === 'cloud' ? P.cloud(session.email || '') : session.mode === 'demo' ? P.demo : P.local}</T>
      <Gap h={12} />

      <HelpCard onOpen={openHelp} />
      <WikiCard onOpen={openWiki} />
      <FeedbackCard />
      <AboutCard />
      <OfferCard />

      <Card title={P.uiMode.title} accent={t.violet}>
        <Seg<UiMode> value={p.uiMode} onChange={(v) => set({ uiMode: v })} options={UI_MODES.map((m) => ({ v: m, label: P.uiMode[m] }))} testID="uiMode" />
        <Gap h={6} />
        <T muted size={12}>{p.uiMode === 'chill' ? P.uiMode.chillNote : p.uiMode === 'basic' ? P.uiMode.basicNote : P.uiMode.advancedNote}</T>
      </Card>

      <Card title={P.layout.title} accent={t.teal}>
        <Seg<LayoutMode> value={p.layoutMode || 'auto'} onChange={(v) => set({ layoutMode: v })} options={LAYOUT_MODES.map((v) => ({ v, label: P.layout[v] }))} testID="foldLayoutMode" />
        <Gap h={6} />
        <T muted size={12}>{P.layout.note}</T>
      </Card>

      <Card title={P.sexTitle} accent={t.amber}>
        <Seg<Sex> value={p.sex} onChange={(v) => set({ sex: v })} options={[{ v: 'male', label: P.male }, { v: 'female', label: P.female }]} testID="sex" />
        <Gap h={6} />
        <T muted size={12}>{p.sex === 'male' ? P.maleNote : P.femaleNote}</T>
        <Gap />
        <Fields>
          <TextField label={P.name} value={p.name} onChange={(v) => set({ name: v })} />
          <DateField
            label={P.birth}
            value={birth}
            onChange={(v) => {
              setBirth(v);
              const iso = normDate(v);
              if (isISODate(iso)) set({ birthDate: iso });
            }}
            testID="birth"
          />
        </Fields>
        {age != null ? <T muted size={12} style={{ textAlign: 'right' }}>{P.age(age)}</T> : null}
        <Gap h={6} />
        <Fields>
          <NumField label={P.height} value={p.heightCm} onChange={(v) => v && set({ heightCm: v })} />
          <NumField label={P.goal} value={p.goalWeightKg} onChange={(v) => set({ goalWeightKg: v })} digits={1} testID="goal" />
          <NumField label={P.stepGoal} value={p.stepGoal} onChange={(v) => v && set({ stepGoal: Math.round(v) })} />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField
            label={P.workoutGoal}
            value={p.workoutGoal}
            placeholder={String(WORKOUT_GOAL_DEFAULT)}
            onChange={(v) => set({ workoutGoal: v == null ? undefined : clampWorkoutGoal(v) })}
            testID="workoutGoal"
          />
        </Fields>
        <T muted size={12}>{P.workoutGoalNote}</T>
        <Gap h={8} />
        <T muted size={12}>{P.measureFreq}</T>
        <Seg<MeasureFreq> value={p.measureFreq} onChange={(v) => set({ measureFreq: v })} options={MEASURE_FREQS.map((k) => ({ v: k, label: tx.common.freq[k] }))} />
        <Gap h={8} />
        {p.uiMode !== 'basic' ? (
          <>
            <T muted size={12}>{P.bmr}</T>
            <Seg value={p.bmrFormula} onChange={(v) => set({ bmrFormula: v })} options={[{ v: 'mifflin', label: P.mifflin }, { v: 'lean', label: P.lean }]} />
            <Gap h={8} />
          </>
        ) : null}
        <T muted size={12}>{P.diary}</T>
        <Seg value={p.diaryWeights} onChange={(v) => set({ diaryWeights: v })} options={[{ v: 'raw', label: P.diaryRaw }, { v: 'cooked', label: P.diaryCooked }]} />
      </Card>

      <ProposalCards />
      <GoalCard />

      <Card title={tx.lang.title} accent={t.violet}>
        <LangSwitch testID="lang" />
        <Gap h={6} />
        <T muted size={12}>{tx.lang.note}</T>
      </Card>

      <Card title={P.textSize.title} accent={t.violet}>
        <Seg<TextSize>
          value={p.textSize || 'normal'}
          onChange={(v) => set({ textSize: v })}
          options={TEXT_SIZES.map((k) => ({ v: k, label: P.textSize[k] }))}
          testID="textSize"
        />
        <Gap h={6} />
        <T muted size={12}>{P.textSize.note}</T>
      </Card>

      <Card title={P.palette.title} accent={t.violet}>
        <Seg<PalettePref>
          value={p.palette || 'normal'}
          onChange={(v) => set({ palette: v })}
          options={PALETTES.map((k) => ({ v: k, label: P.palette[k] }))}
          testID="palette"
        />
        <Gap h={6} />
        <T muted size={12}>{P.palette.note}</T>
      </Card>

      <Card title={P.theme} accent={t.violet}>
        <Seg<ThemePref> value={p.theme} onChange={(v) => set({ theme: v })} options={[{ v: 'system', label: P.themeSystem }, { v: 'light', label: P.themeLight }, { v: 'dark', label: P.themeDark }]} testID="theme" />
      </Card>

      <Card title={P.sources} accent={t.green}>
        <T size={13}>{P.srcFs}</T>
        <T size={13}>{P.srcWeight}</T>
        <T muted size={13}>{P.srcHealth}</T>
        <T muted size={13}>{P.srcGarmin}</T>
        <Gap />
        <Row>
          <Btn small title={P.importFs} onPress={importFood} />
          <Btn small title={P.importWeights} onPress={importWeights} testID="importWeights" />
        </Row>
        <Gap h={6} />
        <Row>
          <Btn small title={P.export} onPress={exportAll} />
          <Btn small title={P.importBackup} onPress={importAll} testID="importBackup" />
        </Row>
        <Gap h={10} />
        <T size={13}>{P.backupReminder}</T>
        <Gap h={6} />
        <Seg<'on' | 'off'>
          value={p.backupReminder === false ? 'off' : 'on'}
          onChange={(v) => set({ backupReminder: v === 'on' })}
          options={[{ v: 'on', label: P.backupReminderOn }, { v: 'off', label: P.backupReminderOff }]}
          testID="backupReminder"
        />
        <T muted size={12}>{P.backupReminderNote(data.lastBackupAt ? f.dmy(toLocalISO(new Date(data.lastBackupAt))) : null)}</T>
        {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
      </Card>

      <Card title={P.handTitle} accent={t.teal} right={<Btn small title={data.hand ? tx.common.change : P.handMeasure} onPress={openHand} />}>
        {data.hand ? (
          <T size={13}>
            {P.handLine(kg(data.hand.palmWidth), kg(data.hand.palmLength), kg(data.hand.fistWidth), kg(data.hand.fistHeight), kg(data.hand.thumbLength), data.hand.source === 'card')}
          </T>
        ) : (
          <T muted size={13}>{P.handNone}</T>
        )}
      </Card>

      <Card title={P.curator} accent={t.blue}>
        {data.curator ? (
          <>
            <T size={14}>{P.curatorLinked(data.curator.name, f.dmy(data.curator.linkedAt))}</T>
            <T muted size={12} mono>{data.curator.code}</T>
            <Gap h={6} />
            <T muted size={12}>{P.curatorSees}</T>
            {(['food', 'workouts', 'measurements', 'comments', 'photos'] as const).map((k) => (
              <Row key={k}>
                <T size={13} style={{ flex: 1 }}>{P.share[k]}</T>
                <Seg
                  value={data.curator!.share[k] ? 'y' : 'n'}
                  onChange={(v) => setCurator({ ...data.curator!, share: { ...data.curator!.share, [k]: v === 'y' } })}
                  options={[{ v: 'y', label: tx.common.yes }, { v: 'n', label: tx.common.no }]}
                />
              </Row>
            ))}
            <Gap h={6} />
            <T muted size={12}>{tx.promo.unlinkNote}</T>
            <Gap h={4} />
            <Btn small title={P.unlink} color={t.red} onPress={unlinkCurator} testID="curatorUnlink" />
          </>
        ) : (
          <>
            <CodeEntry />
            <CuratorRequestBlock />
          </>
        )}
      </Card>

      <NotifyCard />

      <Card title={P.plan} accent={t.amber}>
        {data.curator && data.curator.premium !== false ? (
          <T size={13} color={t.green}>{tx.promo.premiumByCurator(data.curator.name)}</T>
        ) : (
          <>
            <Seg value={p.plan} onChange={(v) => set({ plan: v })} options={[{ v: 'free', label: P.free }, { v: 'premium', label: P.premium }]} />
            <T muted size={12}>{P.planNote}</T>
          </>
        )}
      </Card>

      <Card title={P.account} accent={t.muted}>
        {!cloudConfigured() ? <T muted size={13}>{P.noServer}</T> : null}
        <T muted size={12}>
          {P.consents(data.consent.health ? f.dmy(data.consent.health) : P.notGiven, data.consent.photoAI ? f.dmy(data.consent.photoAI) : P.notGiven)}
        </T>
        <T muted size={12}>{P.disclaimer}</T>
        <Gap h={6} />
        <ConsentCheck
          doc="marketing"
          on={!!data.consent.marketing}
          onToggle={() => setConsent({ marketing: data.consent.marketing ? undefined : todayISO() })}
          {...tx.login.accept.marketing}
          testID="profileMarketing"
        />
        <T muted size={12}>{P.docs}:</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {LEGAL_DOCS.map((d) => (
            <Btn key={d} small kind="link" title={tx.legal.docs[d]} onPress={() => openLegal(d)} testID={'profileDoc-' + d} />
          ))}
        </Row>
        <Divider />
        <Row>
          <Btn small title={P.toCurator} onPress={() => setRole('curator')} testID="toCurator" />
          <Btn small title={session.mode === 'demo' ? P.logoutDemo : P.logout} color={t.red} onPress={logout} />
        </Row>
      </Card>
    </View>
  );
}
