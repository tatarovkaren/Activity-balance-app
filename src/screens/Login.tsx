import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { todayISO } from '../core/dates';
import { useStore } from '../data/store';
import { cloudConfigured, NATIVE_OAUTH, sendEmailCode, signInOAuth, verifyEmailCode, type OAuthProvider } from '../data/cloud';
import { Btn, Gap, Note, Row, Seg, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { errorText, LANG_CODES, LANGS, useI18n } from '../i18n';
import type { LangPref } from '../core/types';
import { LEGAL_DOCS, LEGAL_VERSION, REQUIRED_DOCS, type LegalDoc } from '../legal';
import { ConsentCheck } from './Legal';

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
  // галочки уже принятой версии документов остаются отмеченными; новая версия — отметить заново
  const c = data.consent.version === LEGAL_VERSION ? data.consent : {};
  const [checks, setChecks] = useState<Record<LegalDoc, boolean>>({
    terms: !!c.terms,
    privacy: !!c.privacy,
    consent: !!c.health,
    marketing: !!c.marketing,
  });
  const agree = REQUIRED_DOCS.every((d) => checks[d]);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const cloud = cloudConfigured();

  const guard = (fn: () => void | Promise<void>) => async () => {
    setErr('');
    if (!agree) return setErr(tx.login.consentRequired);
    const today = todayISO();
    const keep = (d: string | undefined) => (c === data.consent && d ? d : today);
    setConsent({
      terms: keep(c.terms),
      privacy: keep(c.privacy),
      health: keep(c.health),
      marketing: checks.marketing ? keep(c.marketing) : undefined,
      version: LEGAL_VERSION,
    });
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
      {LEGAL_DOCS.map((d) => (
        <ConsentCheck
          key={d}
          doc={d}
          on={checks[d]}
          onToggle={() => setChecks((s) => ({ ...s, [d]: !s[d] }))}
          {...tx.login.accept[d]}
          testID={'consent-' + d}
        />
      ))}
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
