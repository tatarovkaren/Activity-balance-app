import { describe, expect, it } from 'vitest';
import { APP_VERSION, BUILD, RELEASE } from '.';
import { isISODate } from '../core/dates';
import { LANG_CODES, LANGS } from '../i18n/core';
import { CHANGELOG } from './changelog';

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
  it('«Что нового»: верхняя запись — текущая версия (поднял версию — добавь запись)', () => {
    expect(CHANGELOG[0].v).toBe(APP_VERSION);
  });
  it('«Что нового»: версии по убыванию, без повторов, пункты на всех языках', () => {
    const num = (v: string) => v.split('.').map(Number);
    for (let i = 1; i < CHANGELOG.length; i++) {
      const [a, b] = [num(CHANGELOG[i - 1].v), num(CHANGELOG[i].v)];
      expect(a[0] * 1e6 + a[1] * 1e3 + a[2] > b[0] * 1e6 + b[1] * 1e3 + b[2], CHANGELOG[i].v).toBe(true);
    }
    for (const e of CHANGELOG)
      for (const code of LANG_CODES) {
        expect(e[code].length, e.v + ' ' + code).toBeGreaterThan(0);
        expect(e[code].length, e.v + ' ' + code).toBe(e.ru.length);
        for (const s of e[code]) expect(s.trim().length).toBeGreaterThan(0);
      }
    for (const e of CHANGELOG) for (const s of e.en) expect(/[А-Яа-яЁё]/.test(s), s).toBe(false);
  });
});
