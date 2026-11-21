// Профиль → «Wiki: баланс энергии»: ключевые исследования с краткой сутью, ограничениями и ссылками.
// Библиография — src/wiki/refs.ts, тексты — src/i18n/wiki.*.ts.

import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { WIKI_SECTIONS, doiUrl, pubmedUrl, refById, type WikiRef } from '../wiki/refs';
import { Btn, Card, Gap, Row, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';
import { Bullet, Rich, Toggle } from './Help';

const ACCENTS = ['amber', 'blue', 'green', 'violet', 'muted'] as const;

/** «Hall KD, Sacks G, Chandramohan D и др. (2011)» */
export function shortCite(r: WikiRef, etAl: string) {
  return r.authors.join(', ') + (r.nAuthors > r.authors.length ? ' ' + etAl : '') + ' (' + r.year + ')';
}

function RefItem({ r, first }: { r: WikiRef; first: boolean }) {
  const t = useTheme();
  const { tx } = useI18n();
  const W = tx.wiki;
  const it = W.items[r.id as keyof typeof W.items];
  const [open, setOpen] = useState(false);
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderColor: t.line }}>
      <Toggle open={open} title={shortCite(r, W.etAl)} onPress={() => setOpen(!open)} testID={'wiki-' + r.id} />
      <View style={{ paddingLeft: 24, marginTop: -6, paddingBottom: open ? 0 : 10 }}>
        <T muted size={13}>{r.title}</T>
      </View>
      {open ? (
        <View style={{ paddingLeft: 24, paddingBottom: 12, paddingTop: 6 }} testID={'wikiBody-' + r.id}>
          <T muted size={12}>
            {r.journal + '. ' + r.year + ';' + r.cite + ' · ' + W.kinds[r.kind]}
          </T>
          <Gap h={8} />
          {it.summary.map((s, k) => (
            <Bullet key={k} mark="•" text={s} />
          ))}
          {it.limits ? <Rich text={'**' + W.limitsLabel + ':** ' + it.limits} size={13} color={t.muted} /> : null}
          {it.inApp ? (
            <>
              <Gap h={6} />
              <Rich text={'**' + W.inAppLabel + ':** ' + it.inApp} size={13} color={t.blue} />
            </>
          ) : null}
          <Row style={{ flexWrap: 'wrap' }}>
            <Btn small kind="link" title={W.doi + ': ' + r.doi} onPress={() => Linking.openURL(doiUrl(r.doi))} testID={'wikiDoi-' + r.id} />
            <Btn small kind="link" title={W.pubmed + ': ' + r.pmid} onPress={() => Linking.openURL(pubmedUrl(r.pmid))} />
          </Row>
        </View>
      ) : null}
    </View>
  );
}

export function WikiScreen({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const { tx } = useI18n();
  const W = tx.wiki;
  return (
    <View testID="wiki">
      <Btn small title={'← ' + W.back} onPress={onClose} testID="wikiBack" />
      <Gap h={8} />
      <T size={22} bold>{W.title}</T>
      <Gap h={8} />
      <Rich text={W.intro} />
      <Gap h={6} />
      <T muted size={12}>{W.checked + ' ' + W.howTo}</T>
      <Gap h={12} />

      {WIKI_SECTIONS.map((s, i) => {
        const S = W.sections[s.id as keyof typeof W.sections];
        return (
          <Card key={s.id} title={S.title} accent={t[ACCENTS[i % ACCENTS.length]]}>
            <T muted size={13}>{S.note}</T>
            <Gap h={4} />
            {s.refs.map((id, k) => (
              <RefItem key={id} r={refById(id)!} first={k === 0} />
            ))}
          </Card>
        );
      })}

      <Card title={W.conclusionsTitle} accent={t.amber}>
        {W.conclusions.map((c, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: t.line, paddingVertical: 8 }}>
            <T bold size={14}>{c.aspect}</T>
            <Rich text={c.text} />
          </View>
        ))}
      </Card>

      <T muted size={12}>{W.disclaimer}</T>
      <Gap h={8} />
      <Btn small title={'← ' + W.back} onPress={onClose} />
    </View>
  );
}

/** Карточка в профиле, открывающая Wiki. */
export function WikiCard({ onOpen }: { onOpen: () => void }) {
  const t = useTheme();
  const { tx } = useI18n();
  return (
    <Card title={tx.wiki.title} accent={t.green} right={<Btn small title={tx.wiki.open} onPress={onOpen} testID="openWiki" />}>
      <T muted size={13}>{tx.wiki.cardNote}</T>
    </Card>
  );
}
