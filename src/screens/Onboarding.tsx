// Анкета первого входа: пол, имя, дата рождения, рост, вес, цель.
// Без неё формулы считали по возрасту и росту «по умолчанию», и было непонятно, откуда взялся возраст.

import React, { useState } from 'react';
import { View } from 'react-native';
import { ageAt, isISODate, todayISO } from '../core/dates';
import { normDate } from '../core/importers';
import type { Sex } from '../core/types';
import { useStore } from '../data/store';
import { Btn, Card, DateField, Fields, Gap, Note, NumField, Seg, T, TextField } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';

export function OnboardingScreen() {
  const t = useTheme();
  const { tx, f } = useI18n();
  const O = tx.onboard;
  const P = tx.profile;
  const { data, session, setProfile, setDay } = useStore();
  const p = data.profile;
  const demo = session.mode === 'demo';
  const today = todayISO();
  // в демо поля заполнены примером; без входа и в облаке — пустые, чтобы не подставлять чужой возраст
  const lastWeight = Object.keys(data.days)
    .sort()
    .reverse()
    .map((d) => data.days[d].weight)
    .find((w) => w && w > 0);

  const [sex, setSex] = useState<Sex>(p.sex);
  const [name, setName] = useState(p.name);
  const [birth, setBirth] = useState(demo ? f.dateInput(p.birthDate) : '');
  const [height, setHeight] = useState<number | undefined>(demo ? p.heightCm : undefined);
  const initialWeight = data.days[today]?.weight ?? (demo ? lastWeight : undefined);
  const [weight, setWeight] = useState<number | undefined>(initialWeight);
  const [goal, setGoal] = useState<number | undefined>(p.goalWeightKg);
  const [err, setErr] = useState('');

  const iso = normDate(birth);
  const age = isISODate(iso) ? ageAt(iso, today) : null;

  const done = () => {
    const miss: string[] = [];
    if (age == null) miss.push(O.need.birth);
    if (!(height && height >= 100 && height <= 250)) miss.push(O.need.height);
    if (!(weight && weight >= 25 && weight <= 350)) miss.push(O.need.weight);
    if (miss.length) return setErr(O.missing(miss.join(', ')));
    if (age! < 10 || age! > 100) return setErr(O.badBirth);
    setProfile({ sex, name: name.trim(), birthDate: iso, heightCm: Math.round(height!), goalWeightKg: goal, onboarded: true });
    // вес из примера в демо не записываем в сегодняшний день — только если его поменяли
    if (weight !== initialWeight || (!demo && data.days[today]?.weight !== weight)) setDay(today, { weight });
  };

  return (
    <View style={{ maxWidth: 480, width: '100%', alignSelf: 'center' }}>
      <T size={24} bold>{O.title}</T>
      <Gap h={4} />
      <T muted size={14}>{O.intro}</T>
      {demo ? <Note>{O.demoNote}</Note> : null}
      <Gap h={12} />
      <Card title={P.sexTitle} accent={t.amber}>
        <Seg<Sex> value={sex} onChange={setSex} options={[{ v: 'male', label: P.male }, { v: 'female', label: P.female }]} testID="onbSex" />
        <Gap />
        <TextField label={P.name} value={name} onChange={setName} testID="onbName" />
        <Gap h={6} />
        <DateField label={P.birth} value={birth} onChange={(v) => { setBirth(v); setErr(''); }} testID="onbBirth" />
        {age != null ? <T muted size={12}>{O.age(age)}</T> : null}
        <Gap h={6} />
        <Fields>
          <NumField label={P.height} value={height} onChange={(v) => { setHeight(v); setErr(''); }} testID="onbHeight" />
          <NumField label={O.weight} value={weight} onChange={(v) => { setWeight(v); setErr(''); }} digits={2} testID="onbWeight" />
          <NumField label={O.goal} value={goal} onChange={setGoal} digits={1} testID="onbGoal" />
        </Fields>
      </Card>
      {err ? <Note color={t.red}>{err}</Note> : null}
      <Gap h={8} />
      <Btn kind="solid" title={O.start} onPress={done} testID="onbDone" />
    </View>
  );
}
