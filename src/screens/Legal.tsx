import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { boldParts, LEGAL_DOCS, LEGAL_DRAFT, legalText, parseLegal, type LegalDoc } from '../legal';
import { Btn, Gap, Note, Row, T } from '../ui/kit';
import { useFs, useTheme } from '../ui/theme';
import { useI18n } from '../i18n';

function Rich({ text, size, color }: { text: string; size: number; color: string }) {
  const px = useFs()(size);
  return (
    <Text style={{ color, fontSize: px, lineHeight: Math.round(px * 1.5) }}>
      {boldParts(text).map((s, i) => (i % 2 ? <Text key={i} style={{ fontWeight: '700' }}>{s}</Text> : s))}
    </Text>
  );
}

/** Документ на языке интерфейса. На вебе у каждого есть свой адрес: …/#/legal/privacy. */
export function LegalView({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const t = useTheme();
  const { lang, tx } = useI18n();
  const blocks = parseLegal(legalText(doc, lang));
  return (
    <View style={{ maxWidth: 720, width: '100%', alignSelf: 'center' }} testID={'legal-' + doc}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Btn small title={'← ' + tx.legal.back} onPress={onClose} testID="legalBack" />
      </Row>
      {LEGAL_DRAFT ? <Note color={t.amber}>{tx.legal.draft}</Note> : null}
      <Gap h={8} />
      {blocks.map((b, i) =>
        b.kind === 'h1' ? (
          <T key={i} size={24} bold style={{ marginBottom: 8 }}>{b.text}</T>
        ) : b.kind === 'h2' ? (
          <T key={i} size={17} bold style={{ marginTop: 16, marginBottom: 6 }}>{b.text}</T>
        ) : b.kind === 'li' ? (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 4, paddingLeft: 4 }}>
            <T color={t.muted}>•</T>
            <View style={{ flex: 1 }}><Rich text={b.text} size={14} color={t.text} /></View>
          </View>
        ) : (
          <View key={i} style={{ marginBottom: 8 }}><Rich text={b.text} size={14} color={t.text} /></View>
        ),
      )}
      <Gap h={16} />
      <Row style={{ flexWrap: 'wrap' }}>
        {LEGAL_DOCS.filter((d) => d !== doc).map((d) => (
          <Btn key={d} small kind="link" title={tx.legal.docs[d]} onPress={() => openLegal(d)} />
        ))}
      </Row>
      <Gap h={8} />
      <Btn small title={'← ' + tx.legal.back} onPress={onClose} />
    </View>
  );
}

// ——— адрес документа на вебе ———

const HASH = /^#\/?legal\/(\w+)/;
let setGlobal: ((d: LegalDoc | null) => void) | null = null;

function fromHash(): LegalDoc | null {
  if (Platform.OS !== 'web' || typeof location === 'undefined') return null;
  const m = HASH.exec(location.hash);
  return m && (LEGAL_DOCS as string[]).includes(m[1]) ? (m[1] as LegalDoc) : null;
}

/** Открыть документ поверх любого экрана. */
export function openLegal(doc: LegalDoc) {
  if (Platform.OS === 'web' && typeof location !== 'undefined') location.hash = '#/legal/' + doc;
  else setGlobal?.(doc);
}

/** Какой документ открыт сейчас (null — никакой) и как его закрыть. Используется в App. */
export function useLegalRoute(): [LegalDoc | null, () => void] {
  const [doc, setDoc] = useState<LegalDoc | null>(fromHash);
  useEffect(() => {
    setGlobal = setDoc;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const h = () => {
      setDoc(fromHash());
      window.scrollTo?.(0, 0);
    };
    window.addEventListener('hashchange', h);
    return () => {
      window.removeEventListener('hashchange', h);
      setGlobal = null;
    };
  }, []);
  const close = () => {
    if (Platform.OS === 'web' && typeof location !== 'undefined' && HASH.test(location.hash)) {
      history.replaceState(null, '', location.pathname + location.search);
    }
    setDoc(null);
  };
  return [doc, close];
}

/** Галочка с текстом, в котором часть — ссылка на документ. */
export function ConsentCheck({
  on,
  onToggle,
  pre,
  link,
  post,
  doc,
  testID,
}: {
  on: boolean;
  onToggle: () => void;
  pre: string;
  link: string;
  post: string;
  doc: LegalDoc;
  testID?: string;
}) {
  const t = useTheme();
  const fs = useFs();
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
      <Pressable
        onPress={onToggle}
        testID={testID}
        role="checkbox"
        aria-checked={on}
        hitSlop={8}
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 1.5,
          borderColor: on ? t.amber : t.muted,
          backgroundColor: on ? t.amber : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Text style={{ color: t.bg, fontSize: 14, fontWeight: '700', lineHeight: 16 }}>✓</Text> : null}
      </Pressable>
      <Text style={{ flex: 1, color: t.muted, fontSize: fs(13), lineHeight: fs(19) }} onPress={onToggle}>
        {pre}
        <Text style={{ color: t.amber, textDecorationLine: 'underline' }} onPress={() => openLegal(doc)} testID={testID ? testID + 'Link' : undefined}>
          {link}
        </Text>
        {post}
      </Text>
    </View>
  );
}
