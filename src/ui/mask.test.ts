import { describe, expect, it } from 'vitest';
import { maskDate } from './kit.parse';

describe('маска даты', () => {
  it('ставит точки сама и не мешает стирать', () => {
    expect(maskDate('1', 'ДД.ММ.ГГГГ')).toBe('1');
    expect(maskDate('14', 'ДД.ММ.ГГГГ')).toBe('14');
    expect(maskDate('140', 'ДД.ММ.ГГГГ')).toBe('14.0');
    expect(maskDate('14031980', 'ДД.ММ.ГГГГ')).toBe('14.03.1980');
    expect(maskDate('14.03.19801', 'ДД.ММ.ГГГГ')).toBe('14.03.1980');
    expect(maskDate('14.03.', 'ДД.ММ.ГГГГ')).toBe('14.03'); // стирание: точка не «залипает»
    expect(maskDate('19800314', 'YYYY-MM-DD')).toBe('1980-03-14');
    expect(maskDate('14 марта 1980', 'ДД.ММ.ГГГГ')).toBe('14 марта 1980');
  });
});

import { classifyWorkout } from '../core/energy';
describe('вид тренировки', () => {
  it('явный выбор главнее названия', () => {
    expect(classifyWorkout('бег', 40, 'strength')).toBe('strength');
    expect(classifyWorkout('ноги + спина', 60, 'cardio')).toBe('cardioLegs');
    expect(classifyWorkout('велотренажёр', 40, 'cardio')).toBe('cardioNoSteps');
    expect(classifyWorkout('Силовая', 60)).toBe('strength'); // старые записи — по названию
    expect(classifyWorkout('', 0, 'cardio')).toBe('none');
  });
});
