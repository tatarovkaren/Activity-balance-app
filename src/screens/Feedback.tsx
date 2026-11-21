// Профиль → «Обратная связь»: тестер выбирает «ошибка / идея / вопрос», приложение собирает заготовку
// (версия, устройство, браузер, язык, режим — без личных данных), копирует её и открывает Telegram-чат.
// Адрес чата — src/feedback (FEEDBACK_CHAT или EXPO_PUBLIC_FEEDBACK_CHAT).

import React, { useState } from 'react';
import { Dimensions, Linking, Platform, Share, View } from 'react-native';
import { APP_VERSION, BUILD } from '../about';
import { todayISO } from '../core/dates';
import { buildReport, describeUA, FEEDBACK_KINDS, feedbackChat, type FeedbackKind } from '../feedback';
import { useStore } from '../data/store';
import { LANGS } from '../i18n/core';
import { Btn, Card, Gap, Note, Seg, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';

function deviceLine(): string {
  if (Platform.OS === 'web') return typeof navigator !== 'undefined' ? describeUA(navigator.userAgent || '') : '';
  return (Platform.OS === 'ios' ? 'iOS ' : 'Android ') + String(Platform.Version);
}

function installedPWA(): boolean {
  try {
    return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

function copyText(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) return navigator.clipboard.writeText(text).then(() => true, () => false);
  } catch {
    /* ignore */
  }
  return Promise.resolve(false);
}

export function FeedbackCard() {
  const t = useTheme();
  const { lang, tx, f } = useI18n();
  const F = tx.feedback;
  const { session } = useStore();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [shown, setShown] = useState<{ text: string; copied: boolean } | null>(null);
  const chat = feedbackChat();

  const report = () => {
    const w = Dimensions.get('window');
    return buildReport(
      kind,
      {
        version: APP_VERSION,
        build: BUILD,
        device: deviceLine(),
        screen: Math.round(w.width) + '×' + Math.round(w.height),
        installed: installedPWA(),
        lang: LANGS[lang].name,
        mode: F.modes[session.mode] || session.mode,
        date: f.dmy(todayISO()),
      },
      F,
    );
  };

  const send = async () => {
    const text = report();
    if (Platform.OS !== 'web') {
      // на телефоне — системное «Поделиться»: тестер выбирает Telegram и чат
      try {
        await Share.share({ message: text });
      } catch {
        /* ignore */
      }
      setShown({ text, copied: false });
      return;
    }
    const copied = await copyText(text);
    setShown({ text, copied });
    if (chat) Linking.openURL(chat);
  };

  return (
    <Card title={F.title} accent={t.green}>
      <T muted size={13}>{F.intro}</T>
      <Gap h={8} />
      <Seg<FeedbackKind> value={kind} onChange={(v) => { setKind(v); setShown(null); }} options={FEEDBACK_KINDS.map((k) => ({ v: k, label: F.kinds[k] }))} testID="feedbackKind" />
      <Gap h={8} />
      <Btn kind="solid" title={chat ? F.send : F.copy} onPress={send} testID="feedbackSend" />
      {shown ? (
        <View testID="feedbackShown" style={{ marginTop: 8 }}>
          <Note color={t.green}>{shown.copied ? (chat ? F.copiedChat : F.copiedNoChat) : F.notCopied}</Note>
          <View style={{ marginTop: 6, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: t.line, backgroundColor: t.input }}>
            <T size={12} mono>{shown.text}</T>
          </View>
          {chat ? <Btn small kind="link" title={F.openAgain} onPress={() => Linking.openURL(chat)} testID="feedbackOpen" /> : null}
        </View>
      ) : null}
      <Gap h={6} />
      <T muted size={11}>{F.privacy}</T>
    </Card>
  );
}
