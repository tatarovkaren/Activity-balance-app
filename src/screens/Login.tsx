import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { todayISO } from '../core/dates';
import { useStore } from '../data/store';
import { cloudConfigured, NATIVE_OAUTH, sendEmailCode, signInOAuth, verifyEmailCode, type OAuthProvider } from '../data/cloud';
import { Btn, Gap, Note, Row, T, TextField, Fields } from '../ui/kit';
import { useTheme } from '../ui/theme';

const PROVIDERS: { id: OAuthProvider; label: string; bg: string; fg: string }[] = [
  { id: 'google', label: 'Войти через Google', bg: '#FFFFFF', fg: '#111820' },
  { id: 'apple', label: 'Войти через Apple', bg: '#000000', fg: '#FFFFFF' },
  { id: 'yandex', label: 'Войти через Яндекс ID', bg: '#FC3F1D', fg: '#FFFFFF' },
  { id: 'vk', label: 'Войти через VK ID', bg: '#0077FF', fg: '#FFFFFF' },
];

export function LoginScreen() {
  const t = useTheme();
  const { startLocal, startDemo, startCloud, setConsent, data } = useStore();
  const [agree, setAgree] = useState(!!data.consent.health);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const cloud = cloudConfigured();

  const guard = (fn: () => void | Promise<void>) => async () => {
    setErr('');
    if (!agree) return setErr('Отметьте согласие на обработку данных о здоровье.');
    setConsent({ health: todayISO() });
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <View style={{ maxWidth: 420, width: '100%', alignSelf: 'center', paddingTop: 40 }}>
      <T size={34} bold style={{ textAlign: 'center' }}>Activity Balance</T>
      <Gap h={4} />
      <T size={15} style={{ textAlign: 'center' }}>Узнайте свой настоящий расход энергии</T>
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
            <T bold color={p.fg} style={{ textAlign: 'center' }}>{p.label}</T>
          </Pressable>
        );
      })}
      {cloud ? (
        <View>
          <Gap h={4} />
          <Fields>
            <TextField value={email} onChange={setEmail} placeholder="Почта" />
            <Btn small title={sent ? 'Ещё раз' : 'Код на почту'} onPress={guard(async () => { await sendEmailCode(email); setSent(true); })} />
          </Fields>
          {sent ? (
            <Fields>
              <TextField value={code} onChange={setCode} placeholder="Код из письма" />
              <Btn small kind="solid" title="Войти" onPress={guard(async () => { await verifyEmailCode(email, code); await startCloud(); })} />
            </Fields>
          ) : null}
        </View>
      ) : (
        <T muted size={12} style={{ textAlign: 'center' }}>
          Вход и синхронизация между устройствами заработают после подключения сервера. Яндекс ID и VK ID — через отдельный шлюз для РФ-контура.
        </T>
      )}
      <Gap h={16} />
      <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }} testID="consent">
        <View style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: agree ? t.amber : t.muted, backgroundColor: agree ? t.amber : 'transparent', marginTop: 1 }} />
        <T size={12} muted style={{ flex: 1 }}>
          Согласен(на) на обработку данных о здоровье (вес, питание, пульс, замеры) для расчёта баланса энергии. Данные пользователей из России хранятся в России, из ЕС — в ЕС.
        </T>
      </Pressable>
      {err ? <Note color={t.red}>{err}</Note> : null}
      <Gap h={16} />
      <Btn kind="solid" title="Начать без входа (данные на этом устройстве)" onPress={guard(() => startLocal('client'))} testID="startLocal" />
      <Gap h={8} />
      <Row style={{ justifyContent: 'center' }}>
        <Btn small title="Посмотреть демо" onPress={guard(() => startDemo('client'))} testID="startDemo" />
        <Btn small title="Я куратор → демо кабинета" onPress={guard(() => startDemo('curator'))} testID="startCurator" />
      </Row>
      <Gap h={18} />
      <T muted size={11} style={{ textAlign: 'center' }}>Оценки расхода — ориентир, не медицинская рекомендация.</T>
    </View>
  );
}
