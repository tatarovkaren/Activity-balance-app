// Профиль → «О приложении»: название, слоган, версия и дата выпуска, документы и контакты.
// Версия и дата берутся из src/about (собираются автоматически, см. docs/versioning.md).

import React, { useState } from 'react';
import { Linking, View } from 'react-native';
import { APP_VERSION, BUILD, RELEASE } from '../about';
import { LEGAL_DOCS } from '../legal';
import { OPERATOR } from '../legal/operator';
import { Btn, Card, Divider, Gap, Row, T } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useI18n } from '../i18n';
import { openLegal } from './Legal';

export function AboutCard() {
  const t = useTheme();
  const { lang, tx, f } = useI18n();
  const A = tx.about;
  const [open, setOpen] = useState(false);
  const email = OPERATOR.email[lang] || OPERATOR.email.ru;
  const site = OPERATOR.site[lang] || OPERATOR.site.ru;

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
      {open ? (
        <View testID="aboutMore">
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
