// Профиль → «Куратор» (пока куратора нет) → «Хочу куратора»: короткая заявка — цель, как связаться,
// пара слов о себе, по желанию цифры из профиля. Уходит письмом команде (src/curator-request, Web3Forms).
// Подбора куратора в приложении пока нет: заявку разбирают вручную и пишут клиенту сами.

import React, { useState } from 'react';
import { View } from 'react-native';
import { APP_VERSION } from '../about';
import { ageAt, todayISO, toLocalISO } from '../core/dates';
import type { GoalMode } from '../core/targets';
import {
  ABOUT_MAX,
  CONTACT_KINDS,
  REQUEST_GOALS,
  checkRequest,
  curatorFormKey,
  requestText,
  sendCuratorRequest,
  type ContactKind,
  type CuratorRequest,
  type RequestGoal,
} from '../curator-request';
import { useStore } from '../data/store';
import { LANGS } from '../i18n/core';
import { useI18n } from '../i18n';
import { Btn, Divider, Gap, Note, Seg, T, TextField } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { ConsentCheck } from './Legal';

/** Цель заявки по текущему режиму цели клиента: дефицит → снизить вес и т.д. */
function goalFromMode(mode: GoalMode | undefined): RequestGoal {
  if (mode === 'deficit') return 'lose';
  if (mode === 'surplus') return 'gain';
  if (mode === 'maintain') return 'keep';
  return 'lose';
}

export function CuratorRequestBlock() {
  const t = useTheme();
  const { lang, tx, f } = useI18n();
  const R = tx.curatorRequest;
  const { data, session, markCuratorRequest } = useStore();
  const p = data.profile;
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState<RequestGoal>(() => goalFromMode(p.goals?.[p.goals.length - 1]?.mode));
  const [name, setName] = useState(p.name || '');
  const [contactKind, setContactKind] = useState<ContactKind>('telegram');
  const [contact, setContact] = useState('');
  const [about, setAbout] = useState('');
  const [withProfile, setWithProfile] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [preview, setPreview] = useState<CuratorRequest | null>(null);
  const configured = !!curatorFormKey();

  const lastWeight = (): number | null => {
    const dates = Object.keys(data.days).filter((d) => data.days[d as keyof typeof data.days]?.weight != null).sort();
    const last = dates[dates.length - 1];
    return last ? (data.days[last as keyof typeof data.days]!.weight as number) : null;
  };

  const build = (): CuratorRequest => ({
    goal,
    name,
    contactKind,
    contact,
    about,
    profile: withProfile
      ? { sex: p.sex, age: ageAt(p.birthDate, todayISO()), heightCm: p.heightCm, weightKg: lastWeight(), goalWeightKg: p.goalWeightKg }
      : undefined,
    meta: { lang: LANGS[lang].name, version: APP_VERSION, mode: tx.feedback.modes[session.mode] || session.mode, date: f.dmy(todayISO()) },
  });

  const submit = async () => {
    const problem = checkRequest({ contactKind, contact }, consent);
    if (problem) return setMsg({ text: problem === 'contact' ? R.problem.contact[contactKind] : R.problem.consent, ok: false });
    const req = build();
    setBusy(true);
    setMsg(null);
    try {
      const r = await sendCuratorRequest(req);
      if (r.ok) {
        markCuratorRequest(true);
        setPreview(null);
        setOpen(false);
      } else if (r.reason === 'notConfigured') {
        markCuratorRequest(false);
        setPreview(req);
        setMsg({ text: R.demoNotSent, ok: true });
      } else {
        setMsg({ text: r.reason === 'network' ? R.errNetwork : R.errRejected(r.detail || ''), ok: false });
      }
    } finally {
      setBusy(false);
    }
  };

  const last = data.curatorRequest;
  if (!open)
    return (
      <View>
        <Divider />
        <T size={14} bold>{R.noCurator}</T>
        <T muted size={13}>{R.pitch}</T>
        {last ? (
          <Note color={last.sent ? t.green : t.muted}>{last.sent ? R.sentAt(f.dmy(toLocalISO(new Date(last.at)))) : R.demoAt(f.dmy(toLocalISO(new Date(last.at))))}</Note>
        ) : null}
        <Gap h={6} />
        <Btn kind={last?.sent ? 'ghost' : 'solid'} title={last?.sent ? R.again : R.open} onPress={() => { setOpen(true); setMsg(null); }} testID="curatorRequestOpen" />
      </View>
    );

  return (
    <View testID="curatorRequestForm">
      <Divider />
      <T size={14} bold>{R.title}</T>
      <T muted size={13}>{R.intro}</T>
      <Gap h={8} />
      <T muted size={12}>{R.goal}</T>
      <Seg<RequestGoal> value={goal} onChange={setGoal} options={REQUEST_GOALS.map((g) => ({ v: g, label: R.goals[g] }))} testID="curatorRequestGoal" />
      <Gap h={8} />
      <TextField label={R.name} value={name} onChange={setName} placeholder={R.namePh} testID="curatorRequestName" />
      <Gap h={8} />
      <T muted size={12}>{R.contactHow}</T>
      <Seg<ContactKind>
        value={contactKind}
        onChange={(v) => { setContactKind(v); setMsg(null); }}
        options={CONTACT_KINDS.map((k) => ({ v: k, label: R.contactKinds[k] }))}
        testID="curatorRequestContactKind"
      />
      <Gap h={6} />
      <TextField value={contact} onChange={(v) => { setContact(v); setMsg(null); }} placeholder={R.contactPh[contactKind]} testID="curatorRequestContact" />
      <Gap h={8} />
      <TextField label={R.about} value={about} onChange={(v) => setAbout(v.slice(0, ABOUT_MAX))} placeholder={R.aboutPh} multiline testID="curatorRequestAbout" />
      <Gap h={10} />
      <ConsentCheck on={withProfile} onToggle={() => setWithProfile(!withProfile)} pre={R.withProfile} testID="curatorRequestProfile" />
      <ConsentCheck on={consent} onToggle={() => { setConsent(!consent); setMsg(null); }} {...R.consent} doc="privacy" testID="curatorRequestConsent" />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn kind="solid" title={busy ? R.sending : R.send} disabled={busy} onPress={submit} testID="curatorRequestSend" />
        <Btn title={tx.common.cancel} onPress={() => { setOpen(false); setMsg(null); setPreview(null); }} testID="curatorRequestCancel" />
      </View>
      {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
      {preview ? (
        <View testID="curatorRequestPreview" style={{ marginTop: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.input }}>
          <T size={12} mono>{R.previewHead}</T>
          <Gap h={4} />
          <T size={12} mono>{requestText(preview)}</T>
        </View>
      ) : null}
      <Gap h={6} />
      <T muted size={11}>{configured ? R.privacy : R.demoNote}</T>
    </View>
  );
}
