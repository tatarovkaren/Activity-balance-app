// Telegram-бот: быстрый ввод (вес, шаги, самочувствие), запись в день, сводка за неделю,
// защита записанного ботом от старой копии дня в приложении и свежесть core.gen.ts.
import { describe, expect, it } from 'vitest';
import { keepBotWrites, mergeEntry } from './merge';
import { shiftDate } from './dates';
import type { DayMap } from './types';
import { applyQuick, callbackDateOk, parseCallback, parseQuick, QUICK_REPLIES, weekSummary, weekSummaryText, wellbeingKeyboard } from '../../supabase/functions/notify/bot';
import { dueReminders, normPrefs, telegramPayload, message } from '../../supabase/functions/notify/logic';
import { buildCore } from '../../scripts/fn-core.mjs';

// типов Node в проекте нет — берём fs через process.getBuiltinModule (как в help.test.ts)
const { readFileSync } = (globalThis as unknown as { process: { getBuiltinModule(n: 'fs'): { readFileSync(p: string, enc: 'utf8'): string } } }).process.getBuiltinModule('fs');

const set = (field: string, value: number, day = 'today') => ({ kind: 'set', field, value, day });

describe('быстрый ввод: разбор сообщения', () => {
  it('голое число — вес, с запятой и точкой', () => {
    expect(parseQuick('71.3')).toEqual(set('weight', 71.3));
    expect(parseQuick('71,3')).toEqual(set('weight', 71.3));
    expect(parseQuick(' 71,35 кг ')).toEqual(set('weight', 71.35));
    expect(parseQuick('72')).toEqual(set('weight', 72));
    expect(parseQuick('вес 71,3')).toEqual(set('weight', 71.3));
    expect(parseQuick('Вчера 71,6')).toEqual(set('weight', 71.6, 'yesterday'));
    expect(parseQuick('71.6 вчера')).toEqual(set('weight', 71.6, 'yesterday'));
  });
  it('большое целое — шаги, с разделителями тысяч тоже', () => {
    expect(parseQuick('9500')).toEqual(set('steps', 9500));
    expect(parseQuick('12 000')).toEqual(set('steps', 12000));
    expect(parseQuick('12,000')).toEqual(set('steps', 12000));
    expect(parseQuick('12.000')).toEqual(set('steps', 12000));
    expect(parseQuick('шаги 300')).toEqual(set('steps', 300));
    expect(parseQuick('14289 шагов')).toEqual(set('steps', 14289));
    expect(parseQuick('yesterday steps 8000')).toEqual(set('steps', 8000, 'yesterday'));
  });
  it('ответ на вопрос «Сколько шагов» — шаги даже для маленького числа', () => {
    expect(parseQuick('300', 'Сколько шагов за сегодня? Пришлите число')).toEqual(set('steps', 300));
    expect(parseQuick('300')).toEqual({ kind: 'bad', reason: 'range' });
  });
  it('самочувствие 1–10, кнопки и команды', () => {
    expect(parseQuick('самочувствие 8')).toEqual(set('wellbeing', 8));
    expect(parseQuick('самочувствие 11')).toEqual({ kind: 'bad', reason: 'wellbeing' });
    expect(parseQuick('7')).toEqual({ kind: 'bad', reason: 'small' });
    expect(parseQuick('👣 Шаги')).toEqual({ kind: 'askSteps' });
    expect(parseQuick('🙂 Wellbeing')).toEqual({ kind: 'askWellbeing' });
    expect(parseQuick('📊 Неделя')).toEqual({ kind: 'week' });
    expect(parseQuick('/week')).toEqual({ kind: 'week' });
  });
  it('вне диапазона и не число', () => {
    expect(parseQuick('400')).toEqual({ kind: 'bad', reason: 'range' });
    expect(parseQuick('вес 20')).toEqual({ kind: 'bad', reason: 'range' });
    expect(parseQuick('1000000')).toEqual({ kind: 'bad', reason: 'range' });
    expect(parseQuick('привет')).toBeNull();
    expect(parseQuick('/help')).toBeNull();
    expect(parseQuick(undefined)).toBeNull();
  });
});

describe('быстрый ввод: запись в день', () => {
  it('меняет только своё поле и помечает время записи ботом', () => {
    const r = applyQuick({ weight: 71.5, kcal: 1800, comment: 'ок' }, 'weight', 71.3, 1000);
    expect(r.prev).toBe(71.5);
    expect(r.entry).toEqual({ weight: 71.3, kcal: 1800, comment: 'ок', updatedAt: 1000, botAt: { weight: 1000 } });
    const s = applyQuick(r.entry, 'steps', 9500, 2000);
    expect(s.prev).toBeUndefined();
    expect(s.entry.botAt).toEqual({ weight: 1000, steps: 2000 });
    expect(applyQuick(undefined, 'wellbeing', 8, 5).entry).toEqual({ wellbeing: 8, updatedAt: 5, botAt: { wellbeing: 5 } });
  });
  it('кнопки самочувствия: 1–10 на дату, старые кнопки — не дальше 7 дней', () => {
    const kb = wellbeingKeyboard('2026-11-20');
    expect(kb.inline_keyboard.flat().map((b) => b.callback_data)).toHaveLength(10);
    expect(parseCallback(kb.inline_keyboard[1][4].callback_data)).toEqual({ field: 'wellbeing', value: 10, date: '2026-11-20' });
    expect(parseCallback('wb:0:2026-11-20')).toBeNull();
    expect(parseCallback('wb:5:20.11')).toBeNull();
    expect(callbackDateOk('2026-11-13', '2026-11-20')).toBe(true);
    expect(callbackDateOk('2026-11-12', '2026-11-20')).toBe(false);
    expect(callbackDateOk('2026-11-21', '2026-11-20')).toBe(false);
  });
  it('ответы: дата, прежнее значение', () => {
    expect(QUICK_REPLIES.ru.saved('weight', 71.3, '2026-11-20', true, 71.5)).toBe('✅ Вес 71,3 кг записан за сегодня, 20.11. Было 71,5.');
    expect(QUICK_REPLIES.ru.saved('steps', 12000, '2026-11-19', false)).toBe('✅ Шаги 12 000 записаны за 19.11.');
    expect(QUICK_REPLIES.en.saved('wellbeing', 8, '2026-11-20', true)).toBe('✅ Wellbeing 8 of 10 saved for today, 11/20.');
  });
});

describe('приложение не затирает записанное ботом', () => {
  const server = { weight: 71.3, kcal: 1800, botAt: { weight: 1000 } };
  it('устройство не видело записи бота — вес с сервера остаётся', () => {
    expect(keepBotWrites({ kcal: 1900, steps: 8000 }, server)).toEqual({ kcal: 1900, steps: 8000, weight: 71.3, botAt: { weight: 1000 } });
  });
  it('устройство видело запись (то же время) — побеждает правка в приложении, в том числе стирание', () => {
    expect(keepBotWrites({ weight: 71.0, botAt: { weight: 1000 } }, server)).toEqual({ weight: 71.0, botAt: { weight: 1000 } });
    expect(keepBotWrites({ kcal: 1800, botAt: { weight: 1000 } }, server)).toEqual({ kcal: 1800, botAt: { weight: 1000 } });
  });
  it('день удалён на устройстве, а бот успел записать — день не удаляется', () => {
    expect(keepBotWrites(null, server)).toEqual({ weight: 71.3, botAt: { weight: 1000 } });
    expect(keepBotWrites(null, { kcal: 1800 })).toBeNull();
    expect(keepBotWrites({ kcal: 1 }, null)).toEqual({ kcal: 1 });
  });
  it('после подтягивания с сервера отметка botAt сохраняется в локальной копии', () => {
    expect(mergeEntry({ kcal: 1800 }, server).botAt).toEqual({ weight: 1000 });
  });
});

describe('сводка за неделю', () => {
  // 5 недель: вес плавно снижается на 0,1 кг в день, питание каждый день, шаги
  const to = '2026-11-22'; // воскресенье
  const days: DayMap = {};
  for (let i = 0; i < 35; i++) {
    const d = shiftDate(to, -i);
    days[d] = { weight: 72 - 0.1 * (34 - i) + (i % 2 ? 0.2 : -0.2), protein: 120, fat: 60, carbs: 200, steps: i % 3 ? 11000 : 8000 };
  }
  days['2026-11-18'] = { ...days['2026-11-18'], anomaly: 'feast' };
  const profile = { sex: 'male' as const, birthDate: '1985-05-01', heightCm: 178, goalWeightKg: 66, stepGoal: 10000 };

  it('считает средние, тренд и прогноз тем же кодом, что приложение', () => {
    const s = weekSummary(profile, days, {}, to);
    expect(s.from).toBe('2026-11-16');
    expect(s.weight!.n).toBe(7);
    expect(s.weight!.avg - s.weight!.prevAvg!).toBeCloseTo(-0.7, 0);
    expect(s.trendKgWeek!).toBeLessThan(-0.5);
    expect(s.food).toMatchObject({ kcal: 120 * 4 + 60 * 9 + 200 * 4, p: 120, n: 7 });
    expect(s.steps).toMatchObject({ n: 7, goal: 10000 });
    expect(s.goal.kind).toBe('date');
    expect(s.anomalies).toBe(1);
  });
  it('текст: русские числа, цель, необычные дни', () => {
    const t = weekSummaryText(weekSummary(profile, days, {}, to), 'ru', 'weekly');
    expect(t).toContain('<b>Неделя 16.11–22.11</b>');
    expect(t).toMatch(/Вес: в среднем \d+,\d кг, −0,\d к прошлой неделе \(взвешиваний: 7 из 7\)/);
    expect(t).toContain('🍽 Питание: в среднем 1 820 ккал · Б 120 · Ж 60 · У 200 г (дней с дневником: 7 из 7)');
    expect(t).toMatch(/🎯 Цель 66 кг: (примерно )?к \d\d\.\d\d\.20\d\d/);
    expect(t).toContain('Необычных дней: 1');
  });
  it('пустая неделя не ломается', () => {
    const t = weekSummaryText(weekSummary(null, {}, null, to), 'en', 'last7');
    expect(t).toContain('no weigh-ins');
    expect(t).toContain('diary is empty');
    expect(t).not.toContain('🎯');
  });
  it('по понедельникам в 10:00, раз в неделю; выключается в настройках', () => {
    const p = normPrefs({ tz: 'Europe/Moscow', weigh: { on: false }, diary: { on: false }, backup: { on: false } });
    expect(dueReminders(p, new Date('2026-11-23T07:05:00Z'), undefined)).toEqual([{ kind: 'weekly', ref: 'weekly:2026-11-23' }]); // пн 10:05
    expect(dueReminders(p, new Date('2026-11-23T06:55:00Z'), undefined)).toEqual([]); // 09:55
    expect(dueReminders(p, new Date('2026-11-24T07:05:00Z'), undefined)).toEqual([]); // вторник
    expect(dueReminders({ ...p, weekly: { on: false } }, new Date('2026-11-23T07:05:00Z'), undefined)).toEqual([]);
  });
  it('готовый HTML уходит в Telegram вместо заголовка', () => {
    const p = normPrefs({ appUrl: 'https://ab.example/' });
    const m = telegramPayload(1, message('weekly', p), 'ru', '<b>x</b>');
    expect(m.text).toBe('<b>x</b>');
    expect(m.reply_markup?.inline_keyboard[0][0].url).toBe('https://ab.example/');
  });
});

describe('сборка функции', () => {
  it('core.gen.ts собран из текущего src/core (иначе: npm run fn:bundle)', () => {
    expect(readFileSync('supabase/functions/notify/core.gen.ts', 'utf8')).toBe(buildCore());
  });
});
