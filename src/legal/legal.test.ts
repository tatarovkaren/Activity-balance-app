import { describe, expect, it } from 'vitest';
// @ts-ignore — скрипт сборки на JS без типов
import { isUpToDate } from '../../scripts/build-legal.mjs';
import { LANG_CODES } from '../i18n/core';
import { LEGAL_DOCS, legalText, parseLegal } from './index';
import { LEGAL_PLACEHOLDERS } from './operator';
import { LEGAL_TEXTS } from './texts.gen';

const texts = LEGAL_TEXTS as unknown as Record<string, Record<string, string>>;

describe('юридические документы', () => {
  it('src/legal/texts.gen.ts собран из актуальных docs/legal (npm run legal)', () => {
    expect(isUpToDate()).toBe(true);
  });

  it('у каждого языка интерфейса есть все документы', () => {
    for (const lang of LANG_CODES) for (const d of LEGAL_DOCS) expect(texts[lang]?.[d], `${lang}/${d}`).toBeTruthy();
  });

  it('в шаблонах только известные поля, после подстановки фигурных скобок не остаётся', () => {
    for (const lang of LANG_CODES)
      for (const d of LEGAL_DOCS) {
        for (const m of texts[lang][d].matchAll(/\{\{(\w+)\}\}/g)) expect(LEGAL_PLACEHOLDERS, `${lang}/${d}`).toContain(m[1]);
        expect(legalText(d, lang)).not.toMatch(/\{\{|\}\}/);
      }
  });

  it('незаполненные реквизиты видны как пометка', () => {
    expect(legalText('privacy', 'ru')).toContain('[укажите:');
    expect(legalText('privacy', 'en')).toContain('[to be filled:');
  });

  it('русская и английская редакции совпадают по разделам', () => {
    for (const d of LEGAL_DOCS) {
      const n = (lang: string) => parseLegal(texts[lang][d]).filter((b) => b.kind === 'h2').length;
      expect(n('en'), d).toBe(n('ru'));
    }
  });

  it('в английских текстах нет кириллицы', () => {
    for (const d of LEGAL_DOCS) expect(legalText(d, 'en'), d).not.toMatch(/[а-яё]/i);
  });

  it('разбор Markdown: заголовки, пункты, абзацы', () => {
    const b = parseLegal('# A\n\nтекст\nещё\n\n## B\n\n- один\n- два\n');
    expect(b.map((x) => x.kind)).toEqual(['h1', 'p', 'h2', 'li', 'li']);
    expect(b[1].text).toBe('текст\nещё');
  });
});
