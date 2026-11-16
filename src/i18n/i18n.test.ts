import { describe, expect, it } from 'vitest';
import { FOODS } from '../core/photo/foods';
import { adaptiveTDEE, goalForecast } from '../core/adaptive';
import { classifyWorkout } from '../core/energy';
import { normDate } from '../core/importers';
import { demoDays, demoProfile } from '../core/demo';
import { shiftDate } from '../core/dates';
import { ANOMALY_REASONS } from '../core/types';
import { errorText, foodName, i18nFor, LANG_CODES, LANGS, resolveLang } from './core';
import { ru } from './ru';
import { detailText, goalText, importSummaryText, reliabilityDetails } from '../ui/format';
import { parseNum } from '../ui/kit.parse';

/** Все ключи словаря (вложенные через точку) — для сравнения языков. */
function keys(o: unknown, prefix = ''): string[] {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) return [prefix];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, prefix ? prefix + '.' + k : k));
}

describe('словари', () => {
  it('у каждого языка те же ключи, что у русского', () => {
    const base = keys(ru).sort();
    for (const code of LANG_CODES) expect(keys(LANGS[code].dict).sort(), code).toEqual(base);
  });
  it('все продукты справочника переведены', () => {
    for (const code of LANG_CODES)
      for (const f of FOODS) expect(LANGS[code].dict.foods[f.id], `${code}: ${f.id}`).toBeTruthy();
  });
  it('в английском словаре нет кириллицы', () => {
    const walk = (o: unknown, path: string): void => {
      if (typeof o === 'string') expect(/[А-Яа-яЁё]/.test(o), path + ': ' + o).toBe(false);
      else if (typeof o === 'function') {
        const out = (o as (...a: unknown[]) => unknown)(1, 2, 3, true, 5, 6, 7);
        if (typeof out === 'string') expect(/[А-Яа-яЁё]/.test(out), path + ': ' + out).toBe(false);
      } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path + '.' + k);
    };
    walk(LANGS.en.dict, 'en');
  });
  it('причины необычного дня и частоты замеров есть в словарях', () => {
    for (const code of LANG_CODES) for (const r of ANOMALY_REASONS) expect(LANGS[code].dict.common.reason[r]).toBeTruthy();
  });
});

describe('выбор языка', () => {
  it('явный выбор главнее системы', () => {
    expect(resolveLang('en', ['ru-RU'])).toBe('en');
    expect(resolveLang('ru', ['en-US'])).toBe('ru');
  });
  it('как в системе: первый поддержанный язык', () => {
    expect(resolveLang('system', ['de-DE', 'ru-RU'])).toBe('ru');
    expect(resolveLang('system', ['en-GB'])).toBe('en');
    expect(resolveLang(undefined, ['ru'])).toBe('ru');
  });
  it('неподдержанный язык: СНГ → русский, остальные → английский', () => {
    expect(resolveLang('system', ['kk-KZ'])).toBe('ru');
    expect(resolveLang('system', ['de-DE'])).toBe('en');
    expect(resolveLang('system', [])).toBe('en');
  });
});

describe('форматы', () => {
  const ruL = i18nFor('ru');
  const enL = i18nFor('en');
  it('числа', () => {
    expect(ruL.f.num(72.456, 1)).toBe('72,5');
    expect(enL.f.num(72.456, 1)).toBe('72.5');
    expect(ruL.f.int(12345)).toBe('12 345');
    expect(enL.f.int(12345)).toBe('12,345');
    expect(enL.f.int(-1500)).toBe('−1,500');
    expect(ruL.f.signed(-0.4)).toBe('−0,40');
    expect(enL.f.signed(0.25)).toBe('+0.25');
  });
  it('даты по местному времени', () => {
    expect(ruL.f.dm('2026-11-16')).toBe('16.11');
    expect(ruL.f.dmy('2026-11-16')).toBe('16.11.2026');
    expect(enL.f.dm('2026-11-16')).toBe('Nov 16');
    expect(enL.f.dmy('2026-11-16')).toBe('Nov 16, 2026');
    expect(ruL.f.weekday('2026-11-16')).toBe('понедельник');
    expect(enL.f.weekday('2026-11-16')).toBe('Monday');
    expect(ruL.f.longDate('2026-01-01')).toBe('1 января');
    expect(enL.f.longDate('2026-01-01')).toBe('January 1');
  });
  it('дата в поле ввода разбирается обратно', () => {
    for (const L of [ruL, enL]) expect(normDate(L.f.dateInput('1978-06-20'))).toBe('1978-06-20');
    expect(normDate('20 June 1978')).toBe('1978-06-20');
    expect(normDate('Jun 20, 1978')).toBe('1978-06-20');
  });
  it('ввод чисел: запятая и точка', () => {
    expect(parseNum('72,5')).toBe(72.5);
    expect(parseNum('72.5', '.')).toBe(72.5);
    expect(parseNum('12,000', '.')).toBe(12000);
    expect(parseNum('1,234.5', '.')).toBe(1234.5);
    expect(parseNum('72,5', '.')).toBe(72.5);
    expect(parseNum('')).toBeUndefined();
  });
});

describe('тексты из кодов ядра', () => {
  const enL = i18nFor('en');
  it('автонаходки и причины переводятся', () => {
    const today = '2026-11-16';
    const days = demoDays(today);
    const spike = shiftDate(today, -5);
    days[spike] = { ...days[spike], weight: (days[shiftDate(today, -6)]?.weight || 78) + 2.5 };
    const r = adaptiveTDEE(today, { profile: demoProfile(), days }, {})!;
    const item = r.exclList.find((x) => x.d === spike)!;
    expect(item.why).toBe('weightJump');
    expect(detailText(enL, item.detail)).toMatch(/^weight \+\d\.\d kg vs trend$/);
    expect(detailText(i18nFor('ru'), item.detail)).toMatch(/^вес \+\d,\d кг к тренду$/);
    expect(reliabilityDetails(enL, r)).toMatch(/normal days \d+ of 28/);
    const g = goalForecast(r, today, 74, undefined);
    expect(goalText(enL, g)).toMatch(/^Goal 74\.0 kg/);
  });
  it('итог импорта и ошибки', () => {
    expect(importSummaryText(enL, { added: 2, updated: 1, skipped: 0, from: '2026-10-01', to: '2026-10-03' })).toBe(
      'Imported 3 days (Oct 1–Oct 3): 2 new, 1 updated',
    );
    expect(errorText(enL, { code: 'serverNotConnected' })).toBe('Server not connected');
    expect(errorText(enL, 'backupNotOurs')).toBe('This is not an Activity Balance backup.');
    expect(errorText(enL, { code: 'photoServiceStatus', status: 500 })).toBe('The estimation service responded with 500');
    expect(errorText(enL, new Error('custom server text'))).toBe('custom server text');
  });
  it('английские тренировки классифицируются', () => {
    expect(classifyWorkout('Strength', 60)).toBe('strength');
    expect(classifyWorkout('Exercise bike', 30)).toBe('cardioNoSteps');
    expect(classifyWorkout('Swimming', 30)).toBe('cardioNoSteps');
    expect(classifyWorkout('Running', 30)).toBe('cardioLegs');
    expect(classifyWorkout('Elliptical', 30)).toBe('cardioLegs');
    expect(classifyWorkout('none', 30)).toBe('none');
  });
  it('название продукта по языку', () => {
    expect(foodName(enL, 'buckwheat')).toBe('Buckwheat, boiled');
    expect(foodName(i18nFor('ru'), 'buckwheat')).toBe('Гречка отварная');
  });
});
