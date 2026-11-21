import { describe, expect, it } from 'vitest';
import { APP_VERSION, BUILD, RELEASE } from '.';
import { isISODate } from '../core/dates';
import { LANG_CODES, LANGS } from '../i18n/core';

import pkg from '../../package.json';
import app from '../../app.json';

describe('о приложении', () => {
  it('версия из package.json, в формате major.minor.patch', () => {
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('app.json не расходится с package.json', () => {
    expect(app.expo.version).toBe(pkg.version);
  });
  it('дата выпуска и сборка заполнены', () => {
    expect(isISODate(RELEASE)).toBe(true);
    expect(BUILD).toMatch(/^[0-9a-f]{7}$|^$/);
  });
  it('слоган совпадает с описанием в манифесте PWA', () => {
    expect(LANGS.ru.dict.about.slogan).toBe(app.expo.web.description);
    for (const code of LANG_CODES) expect(LANGS[code].dict.about.slogan.startsWith('Activity Balance')).toBe(true);
  });
  it('строка версии на обоих языках', () => {
    expect(LANGS.ru.dict.about.version('0.27.0', '21.11.2026')).toBe('Версия 0.27.0 от 21.11.2026');
    expect(LANGS.en.dict.about.version('0.27.0', '21.11.2026')).toBe('Version 0.27.0, released 21.11.2026');
  });
});
