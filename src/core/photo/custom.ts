// Свои продукты и блюда пользователя (и куратора): КБЖУ на 100 г, своя порция и вес штуки.
// Пока хранятся на устройстве (AppData.customFoods) и в резервной копии; поля author/createdAt/updatedAt —
// задел под синхронизацию с сервером и общий список куратора для клиентов.
// Продукт по штрихкоду из Open Food Facts сохраняется так же (source 'off'), чтобы второй раз найтись без сети.

import { DENSITY_BY_CATEGORY, type Food, type FoodCategory } from './foods';
import type { PhotoMeal } from '../types';

export interface CustomFoodInput {
  name: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  category?: FoodCategory;
  portion?: number;
  piece?: number;
  barcode?: string;
  brand?: string;
  source?: 'user' | 'off';
  author?: 'client' | 'curator';
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Ккал по БЖУ (Б×4 + Ж×9 + У×4). */
export const kcalFromMacros = (p: number, f: number, c: number) => Math.round(p * 4 + f * 9 + c * 4);

/**
 * Проверка своих цифр: ккал сильно расходятся с Б×4 + Ж×9 + У×4 — скорее всего, опечатка
 * (или цифры на порцию, а не на 100 г). Возвращает ожидаемые ккал, если расхождение больше 20 % и 20 ккал.
 */
export function kcalMismatch(kcal: number, p: number, f: number, c: number): number | null {
  const exp = kcalFromMacros(p, f, c);
  return Math.abs(kcal - exp) > Math.max(20, exp * 0.2) ? exp : null;
}

/** Что не так с вводом: нет названия, нет ккал, на 100 г белка, жиров и углеводов больше 100 г. */
export function customFoodError(x: Partial<CustomFoodInput>): 'name' | 'kcal' | 'macros' | null {
  if (!x.name?.trim()) return 'name';
  if (x.kcal == null || !(x.kcal >= 0) || x.kcal > 900) return 'kcal';
  const sum = (x.p || 0) + (x.f || 0) + (x.c || 0);
  if ([x.p, x.f, x.c].some((v) => v != null && v < 0) || sum > 100.5) return 'macros';
  return null;
}

export function makeCustomFood(x: CustomFoodInput, now = Date.now()): Food {
  const category = x.category || 'dish';
  const food: Food = {
    id: x.barcode ? `off_${x.barcode}` : `u_${now.toString(36)}`,
    name: x.name.trim().replace(/\s+/g, ' ').slice(0, 80),
    source: x.source || 'user',
    category,
    kcal: Math.round(x.kcal),
    p: r1(x.p || 0),
    f: r1(x.f || 0),
    c: r1(x.c || 0),
    density: DENSITY_BY_CATEGORY[category],
    author: x.author || 'client',
    createdAt: now,
    updatedAt: now,
  };
  if (x.portion && x.portion > 0) food.portion = Math.round(x.portion);
  if (x.piece && x.piece > 0) food.piece = Math.round(x.piece);
  if (x.barcode) food.barcode = x.barcode;
  if (x.brand?.trim()) food.brand = x.brand.trim();
  return food;
}

/** Добавить или заменить (тот же id или тот же штрихкод). Новые — сверху. */
export function upsertCustomFood(list: Food[] | undefined, food: Food): Food[] {
  const rest = (list || []).filter((x) => x.id !== food.id && !(food.barcode && x.barcode === food.barcode));
  return [food, ...rest].slice(0, 1000);
}

/** Слияние списков (резервная копия, второе устройство): по id, побеждает более новая правка. */
export function mergeCustomFoods(a: Food[] | undefined, b: Food[] | undefined): Food[] {
  const by = new Map<string, Food>();
  for (const f of [...(a || []), ...(b || [])]) {
    const cur = by.get(f.id);
    if (!cur || (f.updatedAt || 0) > (cur.updatedAt || 0)) by.set(f.id, f);
  }
  return [...by.values()].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
}

// ---- приём пищи из справочника ----

export interface PickedFood {
  food: Food;
  grams: number;
}

/** КБЖУ продукта на столько граммов. */
export function foodTotals(food: Pick<Food, 'kcal' | 'p' | 'f' | 'c'>, grams: number) {
  const k = grams / 100;
  return { kcal: Math.round(food.kcal * k), p: r1(food.p * k), f: r1(food.f * k), c: r1(food.c * k) };
}

/** id провайдера у приёмов, записанных из справочника (а не по фото). */
export const CATALOG_PROVIDER = 'catalog';

/**
 * Приём пищи из справочника — та же запись, что и по фото (прибавляется к КБЖУ дня, не затирается импортом FatSecret),
 * но цифры точные по весу: диапазон равен самому значению.
 */
export function mealFromFoods(items: PickedFood[], meta: { id: string; meal: PhotoMeal['meal']; at: number }): PhotoMeal {
  const rows = items
    .filter((x) => x.grams > 0)
    .map(({ food, grams }) => ({ name: food.name, foodId: food.id, grams: Math.round(grams), ...foodTotals(food, grams) }));
  const sum = (k: 'kcal' | 'p' | 'f' | 'c') => rows.reduce((a, x) => a + x[k], 0);
  const kcal = Math.round(sum('kcal'));
  return {
    ...meta,
    provider: CATALOG_PROVIDER,
    kcal,
    p: r1(sum('p')),
    f: r1(sum('f')),
    c: r1(sum('c')),
    kcalMin: kcal,
    kcalMax: kcal,
    rangePct: 0,
    items: rows,
  };
}
