// Логика серверной функции оценки (supabase/functions/photo-estimate/logic.ts).
import { describe, expect, it } from 'vitest';
import { FOOD_IDS, imageBlock, quotaCheck, SYSTEM_PROMPT, toAppResponse, userText } from '../../../supabase/functions/photo-estimate/logic';
import { FOODS } from './foods';
import { buildDraft, REFERENCE_HAND, type ComponentInput } from './estimate';

const nul = { unit: null, count: null, ml: null, grams: null, lengthCm: null, widthCm: null, heightCm: null, shape: null };

describe('сервер оценки по фото', () => {
  it('справочник на сервере совпадает со справочником приложения', () => {
    expect([...FOOD_IDS].sort()).toEqual(FOODS.map((f) => f.id).sort());
    expect(SYSTEM_PROMPT).toContain('buckwheat');
  });

  it('лимит: бесплатно 2 приёма в сутки, премиум — защита 30', () => {
    expect(quotaCheck('free', 1).ok).toBe(true);
    expect(quotaCheck('free', 2)).toMatchObject({ ok: false, limit: 2 });
    expect(quotaCheck('premium', 29).ok).toBe(true);
    expect(quotaCheck('premium', 30).ok).toBe(false);
  });

  it('ответ модели переводится в контракт приложения, мусор отбрасывается', () => {
    const r = toAppResponse({
      components: [
        { name: 'Гречка', foodId: 'buckwheat', per100: { kcal: 110, p: 4, f: 1, c: 21, density: 0.8 }, amount: { ...nul, kind: 'hand', unit: 'fist', count: 0.7 }, confidence: 0.7 },
        { name: 'Борщ домашний', foodId: null, per100: { kcal: 50, p: 2.5, f: 2.2, c: 5, density: 1 }, amount: { ...nul, kind: 'volume', ml: 350 }, confidence: 0.6 },
        { name: 'Сметана', foodId: 'unknown_id', per100: { kcal: 200, p: 2.5, f: 20, c: 3.4, density: 1 }, amount: { ...nul, kind: 'hand', unit: 'thumb', count: 1 }, confidence: 0.5 },
        { name: 'Без размера', foodId: 'rice', per100: { kcal: 130, p: 3, f: 0, c: 28, density: 0.8 }, amount: { ...nul, kind: 'hand', unit: 'fist', count: null }, confidence: 1 },
      ],
      quality: 'good',
      oilyGuess: false,
      retake: [],
      comment: 'Сметана может быть жирнее.',
    });
    expect(r.components).toHaveLength(3);
    expect(r.components[0]).toMatchObject({ foodId: 'buckwheat', amount: { kind: 'hand', unit: 'fist', count: 0.7 } });
    expect(r.components[0]).not.toHaveProperty('per100'); // известный продукт — цифры из справочника (с уваркой)
    expect(r.components[1]).toMatchObject({ name: 'Борщ домашний', per100: { kcal: 50 }, amount: { kind: 'volume', ml: 350 } });
    expect(r.components[2]).not.toHaveProperty('foodId');
    expect(r).toMatchObject({ quality: 'good', comment: 'Сметана может быть жирнее.' });
    expect(r).not.toHaveProperty('retake');
    // и приложение по этому ответу строит черновик
    const d = buildDraft(r.components as unknown as ComponentInput[], { hand: REFERENCE_HAND, quality: 'good', hiddenOil: false, diaryWeights: 'cooked' });
    expect(d.components).toHaveLength(3);
    expect(d.components[1].grams).toBe(350);
    expect(d.components[1].kcal).toBe(175);
  });

  it('снимок и текст запроса', () => {
    expect(imageBlock('data:image/jpeg;base64,QUJD')).toMatchObject({ source: { media_type: 'image/jpeg', data: 'QUJD' } });
    expect(imageBlock('blob:http://x')).toBeNull();
    const t = userText({ photos: { top: 'x' }, hand: { palmWidth: 10, palmLength: 10.5, fistWidth: 9, fistHeight: 10, thumbLength: 6.5 }, locale: 'ru', note: 'суп' });
    expect(t).toContain('кулак 9×10');
    expect(t).toContain('снимка сбоку нет');
    expect(t).toContain('суп');
  });
});
