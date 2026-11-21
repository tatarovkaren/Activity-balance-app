import { describe, expect, it } from 'vitest';
import { dayPart, greetName } from './greeting';

describe('приветствие на «Дне»', () => {
  it('часть суток по местному часу', () => {
    expect([4, 5, 11, 12, 16, 17, 22, 23, 0].map(dayPart)).toEqual([
      'night', 'morning', 'morning', 'day', 'day', 'evening', 'evening', 'night', 'night',
    ]);
  });
  it('имя без лишних пробелов, пустое — пусто', () => {
    expect(greetName('  Карен  ')).toBe('Карен');
    expect(greetName('Анна   Мария')).toBe('Анна Мария');
    expect(greetName('   ')).toBe('');
    expect(greetName(undefined)).toBe('');
  });
});
