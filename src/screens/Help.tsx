// Профиль → «Помощь и ЧаВо»: быстрый старт, руководство по экранам со скриншотами и частые вопросы.
// Тексты — src/i18n/help.*.ts, картинки — assets/help/<язык>/ (scripts/help-shots.cjs).

import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { boldParts } from '../legal';
import { HELP_SHOTS, type HelpShot } from '../help/shots.gen';
import { Btn, Card, Gap, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';

/** Текст с **жирными** частями. */
function Rich({ text, size = 14, color }: { text: string; size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text style={{ color: color || t.text, fontSize: size, lineHeight: Math.round(size * 1.5) }}>
      {boldParts(text).map((s, i) => (i % 2 ? <Text key={i} style={{ fontWeight: '700' }}>{s}</Text> : s))}
    </Text>
  );
}

function Bullet({ mark, text }: { mark: string; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
      <T color={t.amber} bold style={{ minWidth: 16 }}>{mark}</T>
      <View style={{ flex: 1 }}>
        <Rich text={text} />
      </View>
    </View>
  );
}

/** Заголовок раскрывающегося блока. */
function Toggle({ open, title, onPress, testID }: { open: boolean; title: string; onPress: () => void; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      role="button"
      aria-expanded={open}
      testID={testID}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}
    >
      <T color={t.amber} size={14} style={{ width: 14 }}>{open ? '▾' : '▸'}</T>
      <T size={15} bold style={{ flex: 1 }}>{title}</T>
    </Pressable>
  );
}

/** Скриншот во всю ширину колонки: высота по пропорциям картинки (aspectRatio у Image на вебе ненадёжен). */
function Shot({ src, w, h, label, testID }: { src: HelpShot['src']; w: number; h: number; label: string; testID?: string }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
      {width ? (
        <Image
          source={src}
          accessibilityLabel={label}
          resizeMode="contain"
          style={{ width, height: Math.round((width * h) / w), borderRadius: 12, borderWidth: 1, borderColor: t.line }}
          testID={testID}
        />
      ) : null}
    </View>
  );
}

export function HelpScreen({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const { lang, tx } = useI18n();
  const H = tx.help;
  const shots = HELP_SHOTS[lang] || HELP_SHOTS.en;
  const [open, setOpen] = useState<string | null>(null);
  const [faq, setFaq] = useState<number | null>(null);

  return (
    <View testID="help">
      <Btn small title={'← ' + H.back} onPress={onClose} testID="helpBack" />
      <Gap h={8} />
      <T size={22} bold>{H.title}</T>
      <Gap h={8} />
      <View style={{ borderLeftWidth: 3, borderColor: t.amber, backgroundColor: t.card, borderRadius: 8, padding: 12 }} testID="helpMotto">
        <Rich text={H.motto} size={15} />
      </View>
      <Gap h={8} />
      <Rich text={H.intro} color={t.muted} />
      <Gap h={12} />

      <Card title={H.quickTitle} accent={t.amber}>
        {H.quick.map((s, i) => (
          <Bullet key={i} mark={i + 1 + '.'} text={s} />
        ))}
      </Card>

      <Card title={H.guideTitle} accent={t.blue}>
        <T muted size={12}>{H.guideNote}</T>
        {H.guide.map((g, i) => {
          const on = open === g.id;
          const shot = shots[g.id];
          return (
            <View key={g.id} style={{ borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
              <Toggle open={on} title={g.title} onPress={() => setOpen(on ? null : g.id)} testID={'help-' + g.id} />
              {on ? (
                <View style={{ paddingBottom: 12 }}>
                  {shot ? (
                    <View style={{ width: '100%', maxWidth: 390, alignSelf: 'center', marginBottom: 10 }}>
                      <Shot src={shot.src} w={shot.w} h={shot.h} label={g.title} testID={'helpShot-' + g.id} />
                      <T muted size={11} style={{ textAlign: 'center', marginTop: 4 }}>{H.shotCaption}</T>
                    </View>
                  ) : null}
                  {g.text.map((s, k) => (
                    <Bullet key={k} mark="•" text={s} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card title={H.faqTitle} accent={t.green}>
        {H.faq.map((x, i) => {
          const on = faq === i;
          return (
            <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: t.line }}>
              <Toggle open={on} title={x.q} onPress={() => setFaq(on ? null : i)} testID={'faq-' + i} />
              {on ? (
                <View style={{ paddingBottom: 12, paddingLeft: 24 }}>
                  <Rich text={x.a} />
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card title={H.moreTitle} accent={t.muted}>
        <Rich text={H.more} color={t.muted} size={13} />
      </Card>
      <Btn small title={'← ' + H.back} onPress={onClose} />
    </View>
  );
}

/** Карточка в профиле, открывающая раздел. */
export function HelpCard({ onOpen }: { onOpen: () => void }) {
  const t = useTheme();
  const { tx } = useI18n();
  return (
    <Card title={tx.help.title} accent={t.blue} right={<Btn small title={tx.help.open} onPress={onOpen} testID="openHelp" />}>
      <T muted size={13}>{tx.help.cardNote}</T>
    </Card>
  );
}
