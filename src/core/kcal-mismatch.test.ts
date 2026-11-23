import { describe, expect, it } from 'vitest';
import { kcalMismatch } from './energy';
import { addPhotoMeal } from './photo/meals';
import type { PhotoMeal } from './types';

describe('ккал не сходятся с БЖУ', () => {
  it('пример со скриншота: 1400 ккал при Б100 Ж100 У100 (1700) — предупреждение', () => {
    expect(kcalMismatch({ kcal: 1400, kcalManual: true, protein: 100, fat: 100, carbs: 100 })).toEqual({ kcal: 1400, macro: 1700, diff: -300 });
  });
  it('ккал посчитаны по БЖУ (не вручную) — молчим', () => {
    expect(kcalMismatch({ protein: 100, fat: 100, carbs: 100 })).toBeUndefined();
    expect(kcalMismatch({ kcal: 1400, protein: 100, fat: 100, carbs: 100 })).toBeUndefined();
  });
  it('небольшая разница (клетчатка, алкоголь, округления FatSecret) — молчим', () => {
    // БЖУ дают ≈2000; допуск 15 % (≈300 ккал)
    expect(kcalMismatch({ kcal: 2250, kcalManual: true, protein: 125, fat: 60, carbs: 241.25 })).toBeUndefined();
    expect(kcalMismatch({ kcal: 1800, kcalManual: true, protein: 125, fat: 60, carbs: 241.25 })).toBeUndefined();
    // маленький день: допуск не меньше 100 ккал
    expect(kcalMismatch({ kcal: 290, kcalManual: true, protein: 10, fat: 10, carbs: 30 })).toBeUndefined();
  });
  it('ккал больше БЖУ сверх допуска — предупреждение', () => {
    expect(kcalMismatch({ kcal: 2600, kcalManual: true, protein: 125, fat: 60, carbs: 241.25 })?.diff).toBe(595);
  });
  it('БЖУ введены не все: молчим, пока они не превысили введённые ккал', () => {
    expect(kcalMismatch({ kcal: 1800, kcalManual: true, protein: 120 })).toBeUndefined();
    expect(kcalMismatch({ kcal: 800, kcalManual: true, protein: 100, fat: 100 })?.macro).toBe(1300);
  });
  it('без ккал или без БЖУ — молчим', () => {
    expect(kcalMismatch({ kcal: 1400, kcalManual: true })).toBeUndefined();
    expect(kcalMismatch(undefined)).toBeUndefined();
  });
});

describe('фото/справочник поверх ккал по БЖУ', () => {
  const meal: PhotoMeal = { id: 'm1', meal: 'lunch', at: 0, provider: 'catalog', kcal: 300, kcalMin: 300, kcalMax: 300, p: 20, f: 10, c: 30, items: [] } as unknown as PhotoMeal;
  it('ккал не вводились — база берётся из БЖУ, расхождения нет', () => {
    const e = { protein: 100, fat: 50, carbs: 200 }; // 1650
    const patch = addPhotoMeal(e, meal);
    expect(patch.kcal).toBe(1950);
    expect(kcalMismatch({ ...e, ...patch })).toBeUndefined();
  });
});
