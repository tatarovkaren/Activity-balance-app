// Справочник продуктов: ккал и БЖУ на 100 г готового продукта (напитки — на 100 мл),
// плотность (г/мл) и коэффициент уварки (готовый вес / сухой или сырой вес).
// Первые записи (BASE) — справочник фото-подсчёта; ядро справочника — в catalog.ts.
// Источник у каждой записи (source). Свои продукты пользователя и из штрихкода — в данных пользователя (customFoods).

import { CATALOG, type SrcCode } from './catalog';

export type FoodCategory = 'grain' | 'meat' | 'fish' | 'veg' | 'fruit' | 'dairy' | 'bakery' | 'fat' | 'dish' | 'sweet' | 'drink';

export const FOOD_CATEGORIES: FoodCategory[] = ['grain', 'meat', 'fish', 'veg', 'fruit', 'dairy', 'bakery', 'fat', 'dish', 'sweet', 'drink'];

/**
 * Откуда цифры: usda — USDA FoodData Central (общественное достояние); ru — российские таблицы химического состава;
 * label — типичная маркировка; recipe — расчёт по рецептуре; user — продукт пользователя или куратора;
 * off — Open Food Facts по штрихкоду (лицензия ODbL, нужна ссылка на источник).
 */
export type FoodSource = 'usda' | 'ru' | 'label' | 'recipe' | 'user' | 'off';

export interface Food {
  id: string;
  name: string;
  /** Название по-английски (для английского интерфейса и поиска). У своих продуктов может не быть. */
  nameEn?: string;
  source: FoodSource;
  category: FoodCategory;
  /** На 100 г в том виде, в каком лежит на тарелке. */
  kcal: number;
  p: number;
  f: number;
  c: number;
  /** г/мл — для перевода объёма в вес. */
  density: number;
  /** Готовый вес / вес в дневнике «сухим или сырым» (гречка ≈2,5–3, мясо ≈0,65–0,7). */
  cookYield?: number;
  /** Еда, где обычно есть скрытое масло (жарка, ресторан). */
  oily?: boolean;
  /** Типичная порция, г (демо-оценка по названию). Без значения — по категории (PORTION_BY_CATEGORY). */
  portion?: number;
  /** Вес одной штуки, г («1 шт»: яйцо, яблоко, кусок хлеба). */
  piece?: number;
  /** Другие слова для поиска по названию (RU/EN): «картошка», «potatoes», «блины». */
  aliases?: string[];
  /** Свой продукт или из штрихкода: штрихкод, марка, кто добавил, когда. */
  barcode?: string;
  brand?: string;
  author?: 'client' | 'curator';
  createdAt?: number;
  updatedAt?: number;
}

/** Типичная порция по категории, г — если у продукта не задана своя. */
export const PORTION_BY_CATEGORY: Record<FoodCategory, number> = {
  grain: 180,
  meat: 120,
  fish: 150,
  veg: 150,
  fruit: 150,
  dairy: 150,
  bakery: 50,
  fat: 15,
  dish: 300,
  sweet: 60,
  drink: 250,
};

/** Плотность по категории, г/мл — для записей ядра без своей. */
export const DENSITY_BY_CATEGORY: Record<FoodCategory, number> = {
  grain: 0.8,
  meat: 1.05,
  fish: 1.05,
  veg: 0.6,
  fruit: 0.8,
  dairy: 1.03,
  bakery: 0.4,
  fat: 0.9,
  dish: 0.9,
  sweet: 0.7,
  drink: 1,
};

export function typicalPortion(f: Food): number {
  return f.portion ?? PORTION_BY_CATEGORY[f.category];
}

const BASE: Food[] = [
  { id: 'buckwheat', name: 'Гречка отварная', nameEn: 'Buckwheat, boiled', source: 'ru', category: 'grain', kcal: 110, p: 4.2, f: 1.1, c: 21.3, density: 0.75, cookYield: 2.7, aliases: ['гречневая', 'гречку'] },
  { id: 'rice', name: 'Рис отварной', nameEn: 'Rice, boiled', source: 'usda', category: 'grain', kcal: 130, p: 2.7, f: 0.3, c: 28.2, density: 0.8, cookYield: 3.0, aliases: ['рисом'] },
  { id: 'pasta', name: 'Макароны отварные', nameEn: 'Pasta, boiled', source: 'ru', category: 'grain', kcal: 140, p: 5, f: 1.1, c: 27.5, density: 0.65, cookYield: 2.3, aliases: ['спагетти', 'паста', 'spaghetti', 'noodles'] },
  { id: 'oats', name: 'Овсянка на воде', nameEn: 'Oatmeal with water', source: 'ru', category: 'grain', kcal: 88, p: 3, f: 1.7, c: 15, density: 0.95, cookYield: 3.5, aliases: ['каша', 'овсяная', 'oatmeal', 'porridge'] },
  { id: 'potato_boiled', name: 'Картофель отварной', nameEn: 'Potatoes, boiled', source: 'ru', category: 'veg', kcal: 82, p: 2, f: 0.4, c: 17, density: 0.75, aliases: ['картошка', 'potatoes'] },
  { id: 'potato_mash', name: 'Пюре картофельное', nameEn: 'Mashed potatoes', source: 'recipe', category: 'veg', kcal: 105, p: 2.2, f: 4, c: 15, density: 1.0, aliases: ['mashed'] },
  { id: 'potato_fried', name: 'Картофель жареный', nameEn: 'Potatoes, fried', source: 'ru', category: 'veg', kcal: 192, p: 2.8, f: 9.5, c: 23.4, density: 0.6, oily: true, aliases: ['картошка', 'potatoes'] },
  { id: 'chicken_breast', name: 'Куриная грудка готовая', nameEn: 'Chicken breast, cooked', source: 'usda', category: 'meat', kcal: 165, p: 31, f: 3.6, c: 0, density: 1.05, cookYield: 0.7, portion: 130, aliases: ['курица', 'курицей', 'грудка'] },
  { id: 'chicken_cutlet', name: 'Котлета куриная', nameEn: 'Chicken cutlet', source: 'recipe', category: 'meat', kcal: 215, p: 18, f: 13, c: 7, density: 1.0, oily: true, portion: 100 },
  { id: 'beef_cutlet', name: 'Котлета говяжья', nameEn: 'Beef cutlet', source: 'recipe', category: 'meat', kcal: 250, p: 17, f: 18, c: 6, density: 1.0, oily: true, portion: 100, aliases: ['биточки'] },
  { id: 'beef', name: 'Говядина тушёная', nameEn: 'Beef, stewed', source: 'recipe', category: 'meat', kcal: 220, p: 25, f: 13, c: 0, density: 1.05, cookYield: 0.65, aliases: ['говяжий'] },
  { id: 'pork', name: 'Свинина запечённая', nameEn: 'Pork, roasted', source: 'recipe', category: 'meat', kcal: 260, p: 24, f: 18, c: 0, density: 1.05, cookYield: 0.65, aliases: ['свиной'] },
  { id: 'fish_white', name: 'Рыба белая запечённая', nameEn: 'White fish, baked', source: 'ru', category: 'fish', kcal: 105, p: 22, f: 1.5, c: 0, density: 1.05, cookYield: 0.8, aliases: ['треска', 'минтай', 'хек', 'cod'] },
  { id: 'salmon', name: 'Сёмга запечённая', nameEn: 'Salmon, baked', source: 'usda', category: 'fish', kcal: 210, p: 22, f: 13, c: 0, density: 1.05, cookYield: 0.8, aliases: ['лосось', 'форель', 'trout'] },
  { id: 'egg', name: 'Яйцо варёное', piece: 55, nameEn: 'Egg, boiled', source: 'usda', category: 'dairy', kcal: 155, p: 12.7, f: 10.6, c: 1.1, density: 1.03, portion: 55, aliases: ['яйца', 'eggs'] },
  { id: 'omelet', name: 'Омлет', nameEn: 'Omelette', source: 'recipe', category: 'dairy', kcal: 185, p: 11, f: 15, c: 1.8, density: 0.7, oily: true, aliases: ['omelette', 'яичница', 'scrambled'] },
  { id: 'cottage', name: 'Творог 5%', nameEn: 'Cottage cheese 5%', source: 'label', category: 'dairy', kcal: 121, p: 17, f: 5, c: 1.8, density: 0.95, aliases: ['творожок'] },
  { id: 'cheese', name: 'Сыр твёрдый', nameEn: 'Hard cheese', source: 'ru', category: 'dairy', kcal: 360, p: 25, f: 28, c: 0, density: 1.1, portion: 30 },
  { id: 'veg_fresh', name: 'Овощи свежие (салат)', nameEn: 'Fresh vegetables (salad)', source: 'recipe', category: 'veg', kcal: 22, p: 1, f: 0.2, c: 4, density: 0.45, aliases: ['овощи', 'огурцы', 'помидоры', 'vegetables'] },
  { id: 'veg_salad_oil', name: 'Салат овощной с маслом', nameEn: 'Vegetable salad with oil', source: 'recipe', category: 'veg', kcal: 85, p: 1, f: 7, c: 4, density: 0.5, oily: true, aliases: ['салат'] },
  { id: 'veg_stew', name: 'Овощи тушёные', nameEn: 'Stewed vegetables', source: 'recipe', category: 'veg', kcal: 60, p: 1.5, f: 3, c: 7, density: 0.85, aliases: ['рагу'] },
  { id: 'bread', name: 'Хлеб', nameEn: 'Bread', source: 'ru', category: 'bakery', kcal: 250, p: 8, f: 2.5, c: 49, density: 0.35 },
  { id: 'apple', name: 'Яблоко', nameEn: 'Apple', source: 'ru', category: 'fruit', kcal: 47, p: 0.4, f: 0.4, c: 10, density: 0.8, portion: 180, aliases: ['apples'], piece: 180 },
  { id: 'banana', name: 'Банан', nameEn: 'Banana', source: 'ru', category: 'fruit', kcal: 96, p: 1.5, f: 0.5, c: 21, density: 0.95, portion: 120, aliases: ['bananas'], piece: 120 },
  { id: 'soup', name: 'Суп (средний)', nameEn: 'Soup (average)', source: 'recipe', category: 'dish', kcal: 45, p: 2.5, f: 1.8, c: 5, density: 1.0, aliases: ['супчик', 'бульон', 'broth'] },
  { id: 'borscht', name: 'Борщ', nameEn: 'Borscht', source: 'recipe', category: 'dish', kcal: 55, p: 2.5, f: 2.5, c: 5.5, density: 1.0, aliases: ['borsch'] },
  { id: 'plov', name: 'Плов', nameEn: 'Plov (pilaf)', source: 'recipe', category: 'dish', kcal: 190, p: 7, f: 8, c: 23, density: 0.8, oily: true, portion: 250, aliases: ['pilaf'] },
  { id: 'pelmeni', name: 'Пельмени', nameEn: 'Pelmeni (dumplings)', source: 'label', category: 'dish', kcal: 245, p: 11, f: 12, c: 24, density: 0.85, portion: 250, aliases: ['dumplings'], piece: 12 },
  { id: 'pizza', name: 'Пицца', nameEn: 'Pizza', source: 'usda', category: 'dish', kcal: 265, p: 11, f: 10, c: 33, density: 0.6, oily: true, portion: 250 },
  { id: 'nuts', name: 'Орехи', nameEn: 'Nuts', source: 'ru', category: 'fat', kcal: 620, p: 18, f: 55, c: 14, density: 0.6, portion: 30, aliases: ['миндаль', 'фундук', 'almonds'] },
  { id: 'oil', name: 'Масло растительное', nameEn: 'Vegetable oil', source: 'usda', category: 'fat', kcal: 900, p: 0, f: 100, c: 0, density: 0.92, portion: 10 },
  { id: 'butter', name: 'Масло сливочное', nameEn: 'Butter', source: 'label', category: 'fat', kcal: 740, p: 0.5, f: 82, c: 0.8, density: 0.91, portion: 10 },
  { id: 'sauce_mayo', name: 'Майонез / сливочный соус', nameEn: 'Mayonnaise / cream sauce', source: 'label', category: 'fat', kcal: 600, p: 1, f: 65, c: 3, density: 0.95, portion: 20, aliases: ['соус', 'майонезом', 'mayonnaise'] },
  { id: 'chocolate', name: 'Шоколад', nameEn: 'Chocolate', source: 'ru', category: 'sweet', kcal: 540, p: 6, f: 32, c: 56, density: 1.2, portion: 30 },
  { id: 'pancakes', name: 'Блины / панкейки', nameEn: 'Pancakes / crepes', source: 'recipe', category: 'bakery', kcal: 230, p: 6, f: 9, c: 31, density: 0.5, portion: 150, aliases: ['блинчики', 'панкейки', 'оладьи', 'pancake', 'crepes', 'fritters'] },
  { id: 'cake', name: 'Торт / пирожное', nameEn: 'Cake / pastry', source: 'recipe', category: 'sweet', kcal: 380, p: 5, f: 20, c: 45, density: 0.7, portion: 100, aliases: ['пирожное', 'десерт', 'наполеон', 'медовик', 'dessert', 'pastry'] },
];

const SRC: Record<SrcCode, FoodSource> = { U: 'usda', R: 'ru', L: 'label', C: 'recipe' };

/** Ядро справочника из компактных строк catalog.ts. */
export const CORE: Food[] = FOOD_CATEGORIES.flatMap((category) =>
  (CATALOG[category] || []).map(([id, name, nameEn, kcal, p, f, c, src, x = {}]) => {
    const food: Food = { id, name, nameEn, source: SRC[src], category, kcal, p, f, c, density: x.density ?? DENSITY_BY_CATEGORY[category] };
    if (x.portion) food.portion = x.portion;
    if (x.piece) food.piece = x.piece;
    if (x.oily) food.oily = true;
    if (x.aliases) food.aliases = x.aliases;
    return food;
  }),
);

/** Весь встроенный справочник: продукты фото-подсчёта + ядро. Свои продукты — отдельно (customFoods). */
export const FOODS: Food[] = [...BASE, ...CORE];

/** id продуктов фото-подсчёта: этот короткий список видит модель на сервере. */
export const PHOTO_FOOD_IDS = BASE.map((f) => f.id);

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));
