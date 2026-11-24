// Профиль → «Уведомления»: что и во сколько присылать, пуш в этом браузере и Telegram-бот.
// Настройки лежат в профиле (уходят на сервер вместе с ним), отправляет функция supabase/functions/notify.

import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { appUrlOf, deviceTz, isTime, maskTime, NOTIFY_KINDS, TIMED, withDefaults, type NotifyKind, type NotifyPrefs } from '../core/notify';
import { useStore } from '../data/store';
import { notifyInfo, sendTestNotification, telegramLinkUrl, telegramStatus, telegramUnlink, type NotifyServerInfo } from '../data/cloud';
import { Btn, Card, Divider, Gap, Note, Row, Seg, T, TextField } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { disablePush, enablePush, pushState, type PushState } from '../ui/push';
import { errorText, useI18n } from '../i18n';
import { createTelegramLinkRequest } from './telegramLink';

const here = () => (typeof window !== 'undefined' ? appUrlOf(window.location?.href) : undefined);

// Keep pending codes while navigating away from and back to the profile.
const telegramRequests = new Map<string, ReturnType<typeof createTelegramLinkRequest>>();

function telegramRequest(userId: string) {
  let request = telegramRequests.get(userId);
  if (!request) {
    request = createTelegramLinkRequest(telegramLinkUrl);
    telegramRequests.set(userId, request);
  }
  return request;
}

function TimeInput({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <View style={{ width: 84 }}>
      <TextField
        value={v}
        numeric
        placeholder="08:00"
        onChange={(x) => {
          const m = maskTime(x);
          setV(m);
          if (isTime(m)) onChange(m);
        }}
        testID={testID}
      />
    </View>
  );
}

export function NotifyCard() {
  const { session } = useStore();
  return <NotifyCardContent key={session.mode + ':' + session.userId} />;
}

function NotifyCardContent() {
  const t = useTheme();
  const L = useI18n();
  const N = L.tx.notify;
  const { data, session, setProfile } = useStore();
  const prefs = withDefaults(data.profile.notify);
  const cloud = session.mode === 'cloud';
  const [server, setServer] = useState<NotifyServerInfo | null | undefined>(undefined);
  const [push, setPush] = useState<PushState | undefined>(undefined);
  const [tgLink, setTgLink] = useState<{ username?: string } | null | undefined>(undefined);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tgRequest] = useState(() => telegramRequest(session.userId));

  const ctx = (): Pick<NotifyPrefs, 'tz' | 'lang' | 'appUrl'> => ({ tz: deviceTz(), lang: L.lang, appUrl: here() || prefs.appUrl });
  const update = (patch: Partial<NotifyPrefs>) => setProfile({ notify: { ...data.profile.notify, ...patch, ...ctx() } });
  const setKind = (k: NotifyKind, patch: { on?: boolean; time?: string }) => update({ [k]: { ...prefs[k], ...patch } } as Partial<NotifyPrefs>);

  // часовой пояс, язык и адрес приложения держим актуальными (переезд, смена языка)
  useEffect(() => {
    if (!cloud) return;
    const c = ctx();
    const cur = data.profile.notify;
    if (cur?.tz !== c.tz || cur?.lang !== c.lang || (c.appUrl && cur?.appUrl !== c.appUrl)) update({});
  }, [cloud, L.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    async function refresh() {
      const push = await pushState();
      if (!active) return;
      setPush(push);
      if (!cloud) return;
      const info = await notifyInfo();
      if (!active) return;
      if (info?.telegram) {
        const st = await telegramStatus().catch(() => undefined);
        if (!active) return;
        setTgLink(st);
        if (st) tgRequest.clear();
        if (st === null) void tgRequest.prepare().catch(() => {});
      }
      setServer(info);
    }
    void refresh();
    return () => { active = false; };
  }, [cloud, tgRequest]);

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg({ text: errorText(L, e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const ready = cloud && !!server;
  const connectTg = () => run(async () => {
    await tgRequest.open((url) => Linking.openURL(url));
    setMsg({ text: N.tgOpened, ok: true });
  });

  return (
    <Card title={N.title} accent={t.blue}>
      <T muted size={12}>{N.intro}</T>
      <Gap h={8} />
      {NOTIFY_KINDS.map((k) => (
        <View key={k} style={{ marginBottom: 8 }}>
          <Row>
            <T size={14} style={{ flex: 1 }}>{N.kind[k]}</T>
            {TIMED.includes(k) && prefs[k].on ? (
              <TimeInput value={(prefs[k] as { time: string }).time} onChange={(v) => setKind(k, { time: v })} testID={'notifyTime-' + k} />
            ) : null}
            <Seg<'on' | 'off'>
              value={prefs[k].on ? 'on' : 'off'}
              onChange={(v) => setKind(k, { on: v === 'on' })}
              options={[{ v: 'on', label: N.on }, { v: 'off', label: N.off }]}
              testID={'notify-' + k}
            />
          </Row>
          <T muted size={12}>{N.kindNote[k]}</T>
        </View>
      ))}
      <T muted size={12}>{N.tz(prefs.tz && cloud ? prefs.tz : deviceTz())}</T>

      <Divider />
      <T size={14} bold>{N.channels}</T>
      <Gap h={4} />
      {session.mode === 'demo' ? (
        <Note color={t.muted}>{N.demo}</Note>
      ) : !cloud ? (
        <Note color={t.muted}>{N.needCloud}</Note>
      ) : server === null ? (
        <Note color={t.muted}>{N.noServer}</Note>
      ) : null}

      <Row>
        <T size={14} style={{ flex: 1 }}>{N.push}</T>
        {push === 'on' ? (
          <Btn small title={N.pushOff} disabled={busy || !ready} onPress={() => run(async () => setPush(await disablePush()))} testID="pushOff" />
        ) : (
          <Btn
            small
            kind="solid"
            title={N.pushOn}
            disabled={busy || !ready || push === 'unsupported' || push === 'iosInstall'}
            onPress={() => run(async () => setPush(await enablePush()))}
            testID="pushOn"
          />
        )}
      </Row>
      {push && (cloud || push === 'iosInstall') ? <T muted size={12}>{N.pushState[push]}</T> : null}
      <Gap h={8} />

      <Row>
        <T size={14} style={{ flex: 1 }}>{N.telegram}</T>
        {tgLink ? (
          <Btn small title={N.tgUnlink} color={t.red} disabled={busy} onPress={() => run(async () => {
            await telegramUnlink();
            tgRequest.clear();
            setTgLink(null);
            await tgRequest.prepare().catch(() => {});
          })} testID="tgUnlink" />
        ) : (
          <>
            <Btn small title={N.tgCheck} disabled={busy || !ready || !server?.telegram} onPress={() => run(async () => {
              const st = await telegramStatus();
              setTgLink(st);
              if (st) tgRequest.clear();
              else setMsg({ text: N.tgNotYet, ok: false });
            })} testID="tgCheck" />
            <Btn small kind="solid" title={N.tgConnect} disabled={busy || !ready || !server?.telegram} onPress={connectTg} testID="tgConnect" />
          </>
        )}
      </Row>
      <T muted size={12}>{tgLink ? N.tgLinked(tgLink.username) : ready && !server?.telegram ? N.tgOff : N.tgNone}</T>
      {tgLink ? <T muted size={12}>{N.tgQuick}</T> : null}

      {ready && (push === 'on' || tgLink) ? (
        <>
          <Gap h={8} />
          <Btn small title={N.test} disabled={busy} onPress={() => run(async () => {
            const r = await sendTestNotification();
            setMsg({ text: N.testDone(r.push, r.telegram), ok: !!(r.push || r.telegram) });
          })} testID="notifyTest" />
        </>
      ) : null}
      {msg ? <Note color={msg.ok ? t.green : t.red}>{msg.text}</Note> : null}
    </Card>
  );
}
