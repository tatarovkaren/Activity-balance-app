// Профиль → «О приложении»: название, слоган, версия и дата выпуска, документы и контакты.
// Версия и дата берутся из src/about (собираются автоматически, см. docs/versioning.md).

import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { APP_VERSION, BUILD, RELEASE } from '../about';
import { CHANGELOG } from '../about/changelog';
import { LEGAL_DOCS } from '../legal';
import { OPERATOR } from '../legal/operator';
import { Btn, Card, Divider, Gap, Row, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';
import { openLegal } from './Legal';

/** Сколько прошлых версий показывать в «Подробнее». */
const EARLIER = 6;

function Item({ text, mark = '•' }: { text: string; mark?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
      <T size={13} color={t.muted} style={{ minWidth: mark.length > 1 ? 44 : 10 }}>{mark}</T>
      <View style={{ flex: 1 }}>
        <T size={13}>{text}</T>
      </View>
    </View>
  );
}

export function AboutCard() {
  const t = useTheme();
  const { lang, tx, f } = useI18n();
  const A = tx.about;
  const [open, setOpen] = useState(false);
  const email = OPERATOR.email[lang] || OPERATOR.email.ru;
  const site = OPERATOR.site[lang] || OPERATOR.site.ru;
  const latest = CHANGELOG[0];
  const earlier = CHANGELOG.slice(1, 1 + EARLIER);

  return (
    <Card
      title={A.title}
      accent={t.muted}
      right={<Btn small title={open ? A.less : A.more} onPress={() => setOpen(!open)} testID="aboutToggle" />}
    >
      <T size={16} bold>{tx.app.name}</T>
      <View testID="aboutVersion">
        <T muted size={13}>{A.version(APP_VERSION, f.dmy(RELEASE))}</T>
      </View>
      {latest ? (
        <View testID="aboutNews" style={{ marginTop: 8 }}>
          <T size={13} bold>{A.whatsNew(latest.v)}</T>
          {latest[lang].map((s, i) => (
            <Item key={i} text={s} />
          ))}
        </View>
      ) : null}
      {open ? (
        <View testID="aboutMore">
          {earlier.length ? (
            <View testID="aboutEarlier" style={{ marginTop: 8 }}>
              <T size={13} bold>{A.earlier}</T>
              {earlier.map((e) =>
                e[lang].map((s, i) => <Item key={e.v + i} text={s} mark={i ? '•' : e.v} />),
              )}
            </View>
          ) : null}
          <Gap h={8} />
          <T size={14}>{A.slogan}</T>
          {BUILD ? <T muted size={12}>{A.build(BUILD)}</T> : null}
          <Divider />
          <T muted size={12}>{A.docs}:</T>
          <Row style={{ flexWrap: 'wrap' }}>
            {LEGAL_DOCS.map((d) => (
              <Btn key={d} small kind="link" title={tx.legal.docs[d]} onPress={() => openLegal(d)} testID={'aboutDoc-' + d} />
            ))}
          </Row>
          <Gap h={6} />
          <T muted size={12}>{A.contacts}:</T>
          {email || site ? (
            <Row style={{ flexWrap: 'wrap' }}>
              {email ? <Btn small kind="link" title={A.email + ': ' + email} onPress={() => Linking.openURL('mailto:' + email)} /> : null}
              {site ? <Btn small kind="link" title={A.site + ': ' + site} onPress={() => Linking.openURL(/^https?:/.test(site) ? site : 'https://' + site)} /> : null}
            </Row>
          ) : (
            <T muted size={12}>{A.noContacts}</T>
          )}
          <Gap h={6} />
          <T muted size={11}>{A.copyright(RELEASE.slice(0, 4))}</T>
        </View>
      ) : null}
    </Card>
  );
}
