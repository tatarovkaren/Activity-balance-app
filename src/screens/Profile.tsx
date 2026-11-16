import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { isISODate, todayISO } from '../core/dates';
import { MEASURE_FREQS } from '../core/body';
import {
  applyFoodDays,
  applyWeights,
  makeBackup,
  normDate,
  parseBackup,
  parseFatSecret,
  parseWeightHistory,
} from '../core/importers';
import type { MeasureFreq, Profile, Sex, ThemePref } from '../core/types';
import { useStore } from '../data/store';
import { cloudConfigured, linkCurator } from '../data/cloud';
import { Btn, Card, Divider, Gap, Note, NumField, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { downloadText, pickTextFile } from '../ui/files';
import { importSummaryText } from '../ui/format';
import { errorText, useI18n } from '../i18n';
import { LangSwitch } from './Login';

export function ProfileScreen({ openHand }: { openHand: () => void }) {
  const t = useTheme();
  const L = useI18n();
  const { tx, f } = L;
  const P = tx.profile;
  const kg = f.num;
  const st = useStore();
  const { data, session, setProfile, replaceDays, importBackup, setCurator, logout, setRole } = st;
  const p = data.profile;
  const [birth, setBirth] = useState(f.dateInput(p.birthDate));
  // смена языка — показать дату рождения в формате нового языка
  useEffect(() => setBirth(f.dateInput(p.birthDate)), [f]); // eslint-disable-line react-hooks/exhaustive-deps
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [code, setCode] = useState('');
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
    const f = await pickTextFile();
    if (!f) return;
    const r = parseFatSecret(f.text);
    if (!r.ok) return setMsg({ text: errorText(L, r.error), ok: false });
    const s = applyFoodDays(data.days, r.days, r.skipped);
    replaceDays(s.days);
    setMsg({ text: importSummaryText(L, s), ok: true });
  };
  const exportAll = () => {
    const b = makeBackup(session.userId, { profile: p, days: data.days, keep: data.keep, hand: data.hand, refs: data.refs });
    downloadText(`${P.backupFile}-${todayISO()}.json`, JSON.stringify(b, null, 1));
    setMsg({ text: P.backupDone(Object.keys(data.days).length), ok: true });
  };
  const importAll = async () => {
    const f = await pickTextFile(['application/json', '*/*']);
    if (!f) return;
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

      <Card title={P.sexTitle} accent={t.amber}>
        <Seg<Sex> value={p.sex} onChange={(v) => set({ sex: v })} options={[{ v: 'male', label: P.male }, { v: 'female', label: P.female }]} testID="sex" />
        <Gap h={6} />
        <T muted size={12}>{p.sex === 'male' ? P.maleNote : P.femaleNote}</T>
        <Gap />
        <Fields>
          <TextField label={P.name} value={p.name} onChange={(v) => set({ name: v })} />
          <TextField
            label={P.birth}
            value={birth}
            onChange={(v) => {
              setBirth(v);
              const iso = normDate(v);
              if (isISODate(iso)) set({ birthDate: iso });
            }}
            placeholder={f.dateInputPlaceholder}
          />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField label={P.height} value={p.heightCm} onChange={(v) => v && set({ heightCm: v })} />
          <NumField label={P.goal} value={p.goalWeightKg} onChange={(v) => set({ goalWeightKg: v })} digits={1} testID="goal" />
          <NumField label={P.stepGoal} value={p.stepGoal} onChange={(v) => v && set({ stepGoal: Math.round(v) })} />
        </Fields>
        <Gap h={6} />
        <Fields>
          <NumField label={P.protein} value={p.proteinPerKg} onChange={(v) => set({ proteinPerKg: v })} digits={1} placeholder={P.proteinPh} />
        </Fields>
        <Gap h={8} />
        <T muted size={12}>{P.measureFreq}</T>
        <Seg<MeasureFreq> value={p.measureFreq} onChange={(v) => set({ measureFreq: v })} options={MEASURE_FREQS.map((k) => ({ v: k, label: tx.common.freq[k] }))} />
        <Gap h={8} />
        <T muted size={12}>{P.bmr}</T>
        <Seg value={p.bmrFormula} onChange={(v) => set({ bmrFormula: v })} options={[{ v: 'mifflin', label: P.mifflin }, { v: 'lean', label: P.lean }]} />
        <Gap h={8} />
        <T muted size={12}>{P.diary}</T>
        <Seg value={p.diaryWeights} onChange={(v) => set({ diaryWeights: v })} options={[{ v: 'raw', label: P.diaryRaw }, { v: 'cooked', label: P.diaryCooked }]} />
      </Card>

      <Card title={tx.lang.title} accent={t.violet}>
        <LangSwitch testID="lang" />
        <Gap h={6} />
        <T muted size={12}>{tx.lang.note}</T>
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
          <Btn small title={P.importBackup} onPress={importAll} />
        </Row>
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
            <Btn small title={P.unlink} color={t.red} onPress={() => setCurator(undefined)} />
          </>
        ) : (
          <>
            <T muted size={13}>{P.codeIntro}</T>
            <Gap h={6} />
            <Fields>
              <TextField value={code} onChange={setCode} placeholder={P.codePh} testID="curatorCode" />
              <Btn
                small
                title={P.link}
                disabled={code.trim().length < 4}
                onPress={async () => {
                  let name = P.curatorDefault;
                  if (session.mode === 'cloud') {
                    try {
                      name = await linkCurator(code);
                    } catch (e) {
                      return setMsg({ text: errorText(L, e), ok: false });
                    }
                  } else name = P.curatorDemo;
                  setCurator({ name, code: code.trim().toUpperCase(), linkedAt: todayISO(), share: { food: true, workouts: true, measurements: true, comments: true, photos: false } });
                }}
              />
            </Fields>
          </>
        )}
      </Card>

      <Card title={P.plan} accent={t.amber}>
        <Seg value={p.plan} onChange={(v) => set({ plan: v })} options={[{ v: 'free', label: P.free }, { v: 'premium', label: P.premium }]} />
        <T muted size={12}>{P.planNote}</T>
      </Card>

      <Card title={P.account} accent={t.muted}>
        {!cloudConfigured() ? <T muted size={13}>{P.noServer}</T> : null}
        <T muted size={12}>
          {P.consents(data.consent.health ? f.dmy(data.consent.health) : P.notGiven, data.consent.photoAI ? f.dmy(data.consent.photoAI) : P.notGiven)}
        </T>
        <T muted size={12}>{P.disclaimer}</T>
        <Divider />
        <Row>
          <Btn small title={P.toCurator} onPress={() => setRole('curator')} testID="toCurator" />
          <Btn small title={session.mode === 'demo' ? P.logoutDemo : P.logout} color={t.red} onPress={logout} />
        </Row>
      </Card>
    </View>
  );
}
