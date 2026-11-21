import { describe, expect, it } from 'vitest';
import { buildDraft, REFERENCE_HAND } from './estimate';
import { componentsFromName, matchFoods, oilyHint, UNKNOWN_DISH } from './match';
import { demoProvider, DEMO_EXAMPLE } from './provider';

const ids = (t: string) => matchFoods(t).map((m) => m.food.id);
const opts = { hand: REFERENCE_HAND, quality: 'good' as const, hiddenOil: false, diaryWeights: 'cooked' as const };

describe('демо-оценка по названию блюда', () => {
  it('находит продукты справочника с учётом падежей, RU и EN', () => {
    expect(ids('Панкейки')).toEqual(['pancakes']);
    expect(ids('гречка с котлетой, ресторан')).toEqual(['buckwheat', 'chicken_cutlet']);
    expect(ids('котлета куриная')).toEqual(['chicken_cutlet']);
    expect(ids('котлета говяжья с пюре')).toEqual(['beef_cutlet', 'potato_mash']);
    expect(ids('картошка жареная')).toEqual(['potato_fried']);
    expect(ids('рис и курица')).toEqual(['rice', 'chicken_breast']);
    expect(ids('Pancakes')).toEqual(['pancakes']);
    expect(ids('rice with salmon')).toEqual(['rice', 'salmon']);
    expect(ids('pastry')).toEqual(['cake']);
    expect(ids('бургер')).toEqual(['burger']);
    expect(ids('вареники с картошкой')).toEqual(['vareniki_potato']);
    expect(ids('картофель фри')).toEqual(['french_fries']);
    expect(ids('рататуй')).toEqual([]);
  });

  it('из справочника — КБЖУ продукта и типичная порция в граммах', () => {
    const c = componentsFromName('Панкейки');
    expect(c).toEqual([{ foodId: 'pancakes', amount: { kind: 'grams', grams: 150 }, confidence: 0.5 }]);
    const d = buildDraft(c, opts);
    expect(d.components[0]).toMatchObject({ grams: 150, kcal: 345 });
  });

  it('нет в справочнике — одна строка с этим названием и пометкой «проверьте»', () => {
    const c = componentsFromName('  рататуй   по-провански ');
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ name: 'Рататуй по-провански', unverified: true, amount: { kind: 'grams', grams: UNKNOWN_DISH.grams } });
    const d = buildDraft(c, opts);
    expect(d.components[0]).toMatchObject({ name: 'Рататуй по-провански', grams: 250, kcal: 425 });
  });

  it('найдено не всё — ненайденные части тоже строками с пометкой, «ресторан» не блюдо', () => {
    const c = componentsFromName('Шакшука с хлебом');
    expect(c).toEqual([
      expect.objectContaining({ name: 'Шакшука', unverified: true, amount: { kind: 'grams', grams: UNKNOWN_DISH.sideGrams } }),
      expect.objectContaining({ foodId: 'bread', amount: { kind: 'grams', grams: 50 } }),
    ]);
    expect(componentsFromName('гречка с котлетой, ресторан').map((x) => x.foodId)).toEqual(['buckwheat', 'chicken_cutlet']);
    expect(componentsFromName('Рататуй по-провански')).toHaveLength(1);
  });

  it('масло: по слову «ресторан» или жареному продукту', () => {
    expect(oilyHint('гречка, ресторан')).toBe(true);
    expect(oilyHint('гречка')).toBe(false);
  });

  it('демо-провайдер: с названием — из него, без названия — прежний пример', async () => {
    const base = { photos: { top: 'x', side: 'y' }, hand: REFERENCE_HAND, locale: 'ru' as const };
    const empty = await demoProvider.estimate({ ...base, note: '  ' });
    expect(empty.components).toEqual(DEMO_EXAMPLE);
    const named = await demoProvider.estimate({ ...base, note: 'Панкейки' });
    expect(named.components.map((c) => c.foodId)).toEqual(['pancakes']);
    expect(named.oilyGuess).toBe(false);
    const unknown = await demoProvider.estimate({ ...base, note: 'Шакшука' });
    expect(unknown.components[0]).toMatchObject({ name: 'Шакшука', unverified: true });
  });
});
