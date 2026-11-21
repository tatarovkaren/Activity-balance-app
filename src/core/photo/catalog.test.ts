import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog';
import { CORE, FOOD_BY_ID, FOODS, PHOTO_FOOD_IDS } from './foods';
import { searchFoods, searchWords } from './search';
import { customFoodError, foodTotals, kcalMismatch, makeCustomFood, mealFromFoods, mergeCustomFoods, upsertCustomFood } from './custom';
import { fetchOffProduct, isValidBarcode, OffError, productFromOff } from './off';
import { addPhotoMeal } from './meals';

const ids = (q: string, foods = FOODS) => searchFoods(q, foods).map((h) => h.food.id);

describe('ядро справочника', () => {
  it('300+ продуктов, id уникальные, у каждого источник и английское название', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(f.nameEn, f.id).toBeTruthy();
      expect(['usda', 'ru', 'label', 'recipe'], f.id).toContain(f.source);
      expect(f.density, f.id).toBeGreaterThan(0);
    }
    // справочник фото-подсчёта не изменился: на эти id ссылаются старые записи и сервер
    expect(PHOTO_FOOD_IDS).toHaveLength(36);
    expect(FOOD_BY_ID.buckwheat.kcal).toBe(110);
  });

  it('ккал сходятся с Б×4 + Ж×9 + У×4 (ловит опечатки), кроме алкоголя', () => {
    const alc = new Set(Object.values(CATALOG).flatMap((rows) => rows!.filter((r) => r[8]?.alc).map((r) => r[0])));
    for (const f of FOODS) {
      expect(f.p + f.f + f.c, f.id).toBeLessThanOrEqual(100.5);
      if (alc.has(f.id) || f.kcal < 30) continue;
      // клетчатка и округление дают до ~15 % (у овощей и зелени до ~25 %), больше — скорее опечатка
      const exp = f.p * 4 + f.f * 9 + f.c * 4;
      expect(Math.abs(f.kcal - exp) / f.kcal, `${f.id}: ${f.kcal} vs ${Math.round(exp)}`).toBeLessThan(f.kcal < 100 ? 0.25 : 0.16);
    }
  });

  it('порция и штука — разумные', () => {
    for (const f of CORE) {
      if (f.portion) expect(f.portion, f.id).toBeLessThanOrEqual(500);
      if (f.piece) expect(f.piece, f.id).toBeLessThanOrEqual(300);
    }
  });
});

describe('поиск по названию', () => {
  it('по мере набора, RU и EN, без ё', () => {
    expect(ids('греч')[0]).toBe('buckwheat');
    expect(ids('buckwheat')[0]).toBe('buckwheat');
    expect(ids('ряженка')).toEqual(['ryazhenka']);
    expect(ids('свекла')).toContain('beet');
    expect(ids('сёмга')).toContain('salmon_salted');
    expect(ids('Yogurt')).toContain('greek_yogurt');
  });

  it('несколько слов и жирность цифрами', () => {
    expect(ids('молоко 2,5')[0]).toBe('milk_25');
    expect(ids('молоко 2.5')[0]).toBe('milk_25');
    expect(ids('творог 9')[0]).toBe('cottage_9');
    expect(ids('кефир 1')[0]).toBe('kefir_1');
    expect(searchWords('Молоко 2,5%')).toEqual(['молоко', '2,5']);
  });

  it('падежи и другие названия', () => {
    expect(ids('котлетой')).toContain('chicken_cutlet');
    expect(ids('картошка')).toContain('potato_boiled');
    expect(ids('нутелла')).toEqual(['choco_spread']);
    expect(ids('ничегоподобного')).toEqual([]);
    expect(ids('')).toEqual([]);
  });

  it('свои продукты — в поиске, выше встроенных; штрихкод ищется цифрами', () => {
    const mine = makeCustomFood({ name: 'Гречка с грибами по-бабушкиному', kcal: 140, p: 5, f: 5, c: 20, barcode: '4600000000008' }, 1);
    const list = [mine, ...FOODS];
    expect(ids('гречка с грибами', list)[0]).toBe(mine.id);
    expect(ids('4600000000008', list)).toEqual([mine.id]);
  });
});

describe('свои продукты', () => {
  it('проверка ввода и подсказка про ккал', () => {
    expect(customFoodError({ name: ' ', kcal: 100 })).toBe('name');
    expect(customFoodError({ name: 'Сырник', kcal: undefined })).toBe('kcal');
    expect(customFoodError({ name: 'Сырник', kcal: 200, p: 60, f: 30, c: 30 })).toBe('macros');
    expect(customFoodError({ name: 'Сырник', kcal: 220, p: 14, f: 10, c: 19 })).toBeNull();
    expect(kcalMismatch(220, 14, 10, 19)).toBeNull();
    expect(kcalMismatch(22, 14, 10, 19)).toBe(222); // ккал на порцию или опечатка
  });

  it('создание, замена по id и штрихкоду, слияние по времени правки', () => {
    const a = makeCustomFood({ name: '  Мой   хлеб ', kcal: 250, p: 8, f: 3, c: 48, portion: 40, piece: 35, author: 'curator' }, 1000);
    expect(a).toMatchObject({ id: 'u_rs', name: 'Мой хлеб', source: 'user', author: 'curator', portion: 40, piece: 35, density: 0.9 });
    const b = { ...a, kcal: 240, updatedAt: 2000 };
    expect(upsertCustomFood([a], b)).toEqual([b]);
    expect(mergeCustomFoods([a], [b])).toEqual([b]);
    expect(mergeCustomFoods([b], [a])).toEqual([b]);
  });

  it('приём из справочника: точные цифры по весу, прибавляется к дню', () => {
    const m = mealFromFoods(
      [
        { food: FOOD_BY_ID.buckwheat, grams: 200 },
        { food: FOOD_BY_ID.chicken_breast, grams: 150 },
        { food: FOOD_BY_ID.egg, grams: 0 },
      ],
      { id: '1', meal: 'lunch', at: 1 },
    );
    expect(m).toMatchObject({ provider: 'catalog', kcal: 468, kcalMin: 468, kcalMax: 468, rangePct: 0, p: 54.9, f: 7.6, c: 42.6 });
    expect(m.items).toHaveLength(2);
    expect(foodTotals(FOOD_BY_ID.buckwheat, 200)).toEqual({ kcal: 220, p: 8.4, f: 2.2, c: 42.6 });
    expect(addPhotoMeal({ kcal: 500, protein: 20, fat: 10, carbs: 60 }, m)).toMatchObject({ kcal: 968, protein: 74.9 });
  });
});

describe('штрихкод: Open Food Facts', () => {
  it('контрольная цифра', () => {
    expect(isValidBarcode('4607001771532')).toBe(false);
    expect(isValidBarcode('4600000000008')).toBe(true);
    expect(isValidBarcode('4006381333931')).toBe(true);
    expect(isValidBarcode('96385074')).toBe(true);
    expect(isValidBarcode('123')).toBe(false);
  });

  const product = {
    product_name: 'Kefir',
    product_name_ru: 'Кефир 3,2%',
    brands: 'Простоквашино, Danone',
    serving_quantity: '250',
    nutriments: { 'energy-kcal_100g': 59, proteins_100g: 2.9, fat_100g: '3,2', carbohydrates_100g: 4 },
  };

  it('ответ базы → свой продукт с маркой, порцией и штрихкодом', () => {
    const f = productFromOff('4006381333931', product, 'ru', 5);
    expect(f).toMatchObject({ id: 'off_4006381333931', name: 'Кефир 3,2%, Простоквашино', source: 'off', kcal: 59, f: 3.2, portion: 250, barcode: '4006381333931', brand: 'Простоквашино' });
    expect(productFromOff('4006381333931', product, 'en')?.name).toBe('Kefir, Простоквашино');
    // ккал нет, есть кДж
    expect(productFromOff('1', { product_name: 'X', nutriments: { energy_100g: 418.4 } }, 'ru')?.kcal).toBe(100);
    expect(productFromOff('1', { product_name: 'X', nutriments: {} }, 'ru')).toBeNull();
  });

  it('запрос: найден, нет в базе, неверный код, нет сети', async () => {
    const ok = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    const f = await fetchOffProduct('4006381333931', 'ru', ok({ status: 1, product }));
    expect(f.name).toBe('Кефир 3,2%, Простоквашино');
    await expect(fetchOffProduct('4006381333931', 'ru', ok({ status: 0 }))).rejects.toMatchObject({ code: 'notFound' });
    await expect(fetchOffProduct('4006381333931', 'ru', ok({}, 404))).rejects.toMatchObject({ code: 'notFound' });
    await expect(fetchOffProduct('12345', 'ru', ok({}))).rejects.toBeInstanceOf(OffError);
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(fetchOffProduct('4006381333931', 'ru', down)).rejects.toMatchObject({ code: 'network' });
  });
});
