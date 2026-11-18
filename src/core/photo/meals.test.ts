import { describe, expect, it } from 'vitest';
import { applyFoodDays } from '../importers';
import { compactEntry } from '../merge';
import type { DayEntry, PhotoMeal } from '../types';
import { buildDraft, REFERENCE_HAND } from './estimate';
import { addPhotoMeal, editsFromMeal, editsSummary, mealFromDraft, removePhotoMeal } from './meals';

const meal = (id: string, kcal: number, items: PhotoMeal['items'] = []): PhotoMeal => ({
  id,
  meal: 'lunch',
  at: Number(id),
  provider: 'demo',
  kcal,
  p: 30,
  f: 10,
  c: 50,
  kcalMin: kcal - 50,
  kcalMax: kcal + 50,
  rangePct: 15,
  items,
});

const apply = (e: DayEntry | undefined, patch: Partial<DayEntry>) => compactEntry({ ...(e || {}), ...patch });

describe('приёмы по фото', () => {
  it('прибавляются к записанному и ничего не затирают', () => {
    const e = apply({ kcal: 1200, protein: 80, fat: 40, carbs: 120, weight: 72 }, addPhotoMeal({ kcal: 1200, protein: 80, fat: 40, carbs: 120, weight: 72 }, meal('1', 500)));
    expect(e).toMatchObject({ kcal: 1700, protein: 110, fat: 50, carbs: 170, weight: 72, kcalManual: true });
    expect(e.photoMeals).toHaveLength(1);
  });

  it('удаление вычитает только свой приём; пустое становится «нет данных»', () => {
    let e = apply(undefined, addPhotoMeal(undefined, meal('1', 500)));
    e = apply(e, addPhotoMeal(e, meal('2', 300)));
    expect(e.kcal).toBe(800);
    e = apply(e, removePhotoMeal(e, '1'));
    expect(e.kcal).toBe(300);
    e = apply(e, removePhotoMeal(e, '2'));
    expect(e.kcal).toBeUndefined();
    expect(e.protein).toBeUndefined();
    expect(e.photoMeals).toBeUndefined();
  });

  it('импорт FatSecret = его цифры + фото; повторный импорт не задваивает', () => {
    const day = apply({ weight: 71 }, addPhotoMeal({ weight: 71 }, meal('1', 400)));
    const fs = [{ date: '2026-11-18', kcal: 1500, protein: 100, fat: 50, carbs: 150 }];
    let s = applyFoodDays({ '2026-11-18': day }, fs);
    expect(s.days['2026-11-18']).toMatchObject({ kcal: 1900, protein: 130, fat: 60, carbs: 200, weight: 71 });
    s = applyFoodDays(s.days, fs);
    expect(s.days['2026-11-18'].kcal).toBe(1900);
    expect(s.days['2026-11-18'].photoMeals).toHaveLength(1);
  });

  it('правка граммов сохраняется как ошибка оценки', () => {
    const m = meal('5', 400, [
      { name: 'Гречка', grams: 100, kcal: 110, p: 4, f: 1, c: 21, estGrams: 130 },
      { name: 'Котлета', grams: 80, kcal: 172, p: 14, f: 10, c: 6, estGrams: 81 }, // мелочь — не правка
      { name: 'Салат', grams: 60, kcal: 13, p: 1, f: 0, c: 2 }, // добавлен вручную
    ]);
    const ed = editsFromMeal(m, '2026-11-18');
    expect(ed).toHaveLength(1);
    expect(ed[0]).toMatchObject({ name: 'Гречка', estGrams: 130, grams: 100, errorPct: 30 });
    expect(editsSummary([...ed, { ...ed[0], errorPct: 10 }, { ...ed[0], errorPct: -5 }])).toEqual({ n: 3, medianPct: 10 });
  });

  it('черновик превращается в приём с граммами ИИ', () => {
    const d = buildDraft([{ foodId: 'buckwheat', amount: { kind: 'grams', grams: 90 } }], { hand: REFERENCE_HAND, quality: 'good', hiddenOil: true, diaryWeights: 'raw' });
    const m = mealFromDraft(d, { id: '9', meal: 'dinner', provider: 'http', at: 9 }, [120]);
    expect(m.items[0]).toMatchObject({ grams: 90, estGrams: 120, diaryGrams: 33 });
    expect(m.oilKcal).toBe(75);
    expect(m.kcal).toBe(d.kcal);
  });
});
