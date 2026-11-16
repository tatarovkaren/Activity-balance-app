import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { todayISO } from '../core/dates';
import { useStore } from '../data/store';
import { cloudConfigured, NATIVE_OAUTH, sendEmailCode, signInOAuth, verifyEmailCode, type OAuthProvider } from '../data/cloud';
import { Btn, Gap, Note, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { errorText, LANG_CODES, LANGS, useI18n } from '../i18n';
import type { LangPref } from '../core/types';

const PROVIDERS: { id: OAuthProvider; bg: string; fg: string }[] = [
  { id: 'google', bg: '#FFFFFF', fg: '#111820' },
  { id: 'apple', bg: '#000000', fg: '#FFFFFF' },
  { id: 'yandex', bg: '#FC3F1D', fg: '#FFFFFF' },
  { id: 'vk', bg: '#0077FF', fg: '#FFFFFF' },
];

/** Переключатель языка: «как в системе» + самоназвания языков. Используется на входе и в профиле. */
export function LangSwitch({ testID }: { testID?: string }) {
  const { tx } = useI18n();
  const { data, setProfile } = useStore();
  return (
    <Seg<LangPref>
      testID={testID}
      value={data.profile.lang}
      onChange={(v) => setProfile({ lang: v })}
      options={[{ v: 'system', label: tx.lang.system }, ...LANG_CODES.map((c) => ({ v: c, label: LANGS[c].name }))]}
    />
  );
}

export function LoginScreen() {
  const t = useTheme();
  const L = useI18n();
  const { tx } = L;
  const { startLocal, startDemo, startCloud, setConsent, data } = useStore();
  const [agree, setAgree] = useState(!!data.consent.health);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const cloud = cloudConfigured();

  const guard = (fn: () => void | Promise<void>) => async () => {
    setErr('');
    if (!agree) return setErr(tx.login.consentRequired);
    setConsent({ health: todayISO() });
    try {
      await fn();
    } catch (e) {
      setErr(errorText(L, e));
    }
  };

  return (
    <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', paddingTop: 40 }}>
      <Row style={{ justifyContent: 'center', marginTop: -24, marginBottom: 16 }}>
        <LangSwitch testID="loginLang" />
      </Row>
      <T size={34} bold style={{ textAlign: 'center' }}>{tx.app.name}</T>
      <Gap h={4} />
      <T size={15} style={{ textAlign: 'center' }}>{tx.app.tagline}</T>
      <Gap h={28} />
      {PROVIDERS.map((p) => {
        const available = cloud && NATIVE_OAUTH.includes(p.id);
        return (
          <Pressable
            key={p.id}
            onPress={guard(() => signInOAuth(p.id))}
            disabled={!available}
            style={{ backgroundColor: p.bg, borderRadius: 12, paddingVertical: 13, marginBottom: 10, opacity: available ? 1 : 0.45, borderWidth: 1, borderColor: t.line }}
          >
            <T bold color={p.fg} style={{ textAlign: 'center' }}>{tx.login[p.id]}</T>
          </Pressable>
        );
      })}
      {cloud ? (
        <View>
          <Gap h={4} />
          <Fields>
            <TextField value={email} onChange={setEmail} placeholder={tx.login.email} />
            <Btn small title={sent ? tx.login.resend : tx.login.sendCode} onPress={guard(async () => { await sendEmailCode(email); setSent(true); })} />
          </Fields>
          {sent ? (
            <Fields>
              <TextField value={code} onChange={setCode} placeholder={tx.login.code} />
              <Btn small kind="solid" title={tx.login.signIn} onPress={guard(async () => { await verifyEmailCode(email, code); await startCloud(); })} />
            </Fields>
          ) : null}
        </View>
      ) : (
        <T muted size={12} style={{ textAlign: 'center' }}>
          {tx.login.noServer}
        </T>
      )}
      <Gap h={16} />
      <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }} testID="consent">
        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: agree ? t.amber : t.muted, backgroundColor: agree ? t.amber : 'transparent', marginTop: 1 }} />
        <T size={12} muted style={{ flex: 1 }}>
          {tx.login.consent}
        </T>
      </Pressable>
      {err ? <Note color={t.red}>{err}</Note> : null}
      <Gap h={16} />
      <Btn kind="solid" title={tx.login.startLocal} onPress={guard(() => startLocal('client'))} testID="startLocal" />
      <Gap h={8} />
      <Row style={{ justifyContent: 'center' }}>
        <Btn small title={tx.login.demo} onPress={guard(() => startDemo('client', tx.demo))} testID="startDemo" />
        <Btn small title={tx.login.curatorDemo} onPress={guard(() => startDemo('curator', tx.demo))} testID="startCurator" />
      </Row>
      <Gap h={18} />
      <T muted size={11} style={{ textAlign: 'center' }}>{tx.app.disclaimer}</T>
    </View>
  );
}
