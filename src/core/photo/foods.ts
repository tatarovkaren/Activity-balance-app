// Справочник продуктов для подсчёта по фото: ккал и БЖУ на 100 г готового продукта,
// плотность (г/мл) и коэффициент уварки (готовый вес / сухой или сырой вес).
// Значения стартовые, ориентир — таблицы калорийности; уточнять на взвешенных эталонах.

export type FoodCategory = 'grain' | 'meat' | 'fish' | 'veg' | 'fruit' | 'dairy' | 'bakery' | 'fat' | 'dish' | 'sweet';

export interface Food {
  id: string;
  name: string;
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
  /** Другие слова для поиска по названию (RU/EN): «картошка», «potatoes», «блины». */
  aliases?: string[];
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
};

export function typicalPortion(f: Food): number {
  return f.portion ?? PORTION_BY_CATEGORY[f.category];
}

export const FOODS: Food[] = [
  { id: 'buckwheat', name: 'Гречка отварная', category: 'grain', kcal: 110, p: 4.2, f: 1.1, c: 21.3, density: 0.75, cookYield: 2.7, aliases: ['гречневая', 'гречку'] },
  { id: 'rice', name: 'Рис отварной', category: 'grain', kcal: 130, p: 2.7, f: 0.3, c: 28.2, density: 0.8, cookYield: 3.0, aliases: ['рисом'] },
  { id: 'pasta', name: 'Макароны отварные', category: 'grain', kcal: 140, p: 5, f: 1.1, c: 27.5, density: 0.65, cookYield: 2.3, aliases: ['спагетти', 'паста', 'spaghetti', 'noodles'] },
  { id: 'oats', name: 'Овсянка на воде', category: 'grain', kcal: 88, p: 3, f: 1.7, c: 15, density: 0.95, cookYield: 3.5, aliases: ['каша', 'овсяная', 'oatmeal', 'porridge'] },
  { id: 'potato_boiled', name: 'Картофель отварной', category: 'veg', kcal: 82, p: 2, f: 0.4, c: 17, density: 0.75, aliases: ['картошка', 'potatoes'] },
  { id: 'potato_mash', name: 'Пюре картофельное', category: 'veg', kcal: 105, p: 2.2, f: 4, c: 15, density: 1.0, aliases: ['mashed'] },
  { id: 'potato_fried', name: 'Картофель жареный', category: 'veg', kcal: 192, p: 2.8, f: 9.5, c: 23.4, density: 0.6, oily: true, aliases: ['картошка', 'картофель фри', 'fries', 'potatoes'] },
  { id: 'chicken_breast', name: 'Куриная грудка готовая', category: 'meat', kcal: 165, p: 31, f: 3.6, c: 0, density: 1.05, cookYield: 0.7, portion: 130, aliases: ['курица', 'курицей', 'грудка'] },
  { id: 'chicken_cutlet', name: 'Котлета куриная', category: 'meat', kcal: 215, p: 18, f: 13, c: 7, density: 1.0, oily: true, portion: 100 },
  { id: 'beef_cutlet', name: 'Котлета говяжья', category: 'meat', kcal: 250, p: 17, f: 18, c: 6, density: 1.0, oily: true, portion: 100, aliases: ['биточки'] },
  { id: 'beef', name: 'Говядина тушёная', category: 'meat', kcal: 220, p: 25, f: 13, c: 0, density: 1.05, cookYield: 0.65, aliases: ['говяжий'] },
  { id: 'pork', name: 'Свинина запечённая', category: 'meat', kcal: 260, p: 24, f: 18, c: 0, density: 1.05, cookYield: 0.65, aliases: ['свиной'] },
  { id: 'fish_white', name: 'Рыба белая запечённая', category: 'fish', kcal: 105, p: 22, f: 1.5, c: 0, density: 1.05, cookYield: 0.8, aliases: ['треска', 'минтай', 'хек', 'cod'] },
  { id: 'salmon', name: 'Сёмга запечённая', category: 'fish', kcal: 210, p: 22, f: 13, c: 0, density: 1.05, cookYield: 0.8, aliases: ['лосось', 'форель', 'trout'] },
  { id: 'egg', name: 'Яйцо варёное', category: 'dairy', kcal: 155, p: 12.7, f: 10.6, c: 1.1, density: 1.03, portion: 55, aliases: ['яйца', 'eggs'] },
  { id: 'omelet', name: 'Омлет', category: 'dairy', kcal: 185, p: 11, f: 15, c: 1.8, density: 0.7, oily: true, aliases: ['omelette', 'яичница', 'scrambled'] },
  { id: 'cottage', name: 'Творог 5%', category: 'dairy', kcal: 121, p: 17, f: 5, c: 1.8, density: 0.95, aliases: ['творожок'] },
  { id: 'cheese', name: 'Сыр твёрдый', category: 'dairy', kcal: 360, p: 25, f: 28, c: 0, density: 1.1, portion: 30 },
  { id: 'veg_fresh', name: 'Овощи свежие (салат)', category: 'veg', kcal: 22, p: 1, f: 0.2, c: 4, density: 0.45, aliases: ['овощи', 'огурцы', 'помидоры', 'vegetables'] },
  { id: 'veg_salad_oil', name: 'Салат овощной с маслом', category: 'veg', kcal: 85, p: 1, f: 7, c: 4, density: 0.5, oily: true, aliases: ['салат'] },
  { id: 'veg_stew', name: 'Овощи тушёные', category: 'veg', kcal: 60, p: 1.5, f: 3, c: 7, density: 0.85, aliases: ['рагу'] },
  { id: 'bread', name: 'Хлеб', category: 'bakery', kcal: 250, p: 8, f: 2.5, c: 49, density: 0.35 },
  { id: 'apple', name: 'Яблоко', category: 'fruit', kcal: 47, p: 0.4, f: 0.4, c: 10, density: 0.8, portion: 180, aliases: ['apples'] },
  { id: 'banana', name: 'Банан', category: 'fruit', kcal: 96, p: 1.5, f: 0.5, c: 21, density: 0.95, portion: 120, aliases: ['bananas'] },
  { id: 'soup', name: 'Суп (средний)', category: 'dish', kcal: 45, p: 2.5, f: 1.8, c: 5, density: 1.0, aliases: ['супчик', 'бульон', 'broth'] },
  { id: 'borscht', name: 'Борщ', category: 'dish', kcal: 55, p: 2.5, f: 2.5, c: 5.5, density: 1.0, aliases: ['borsch'] },
  { id: 'plov', name: 'Плов', category: 'dish', kcal: 190, p: 7, f: 8, c: 23, density: 0.8, oily: true, portion: 250, aliases: ['pilaf'] },
  { id: 'pelmeni', name: 'Пельмени', category: 'dish', kcal: 245, p: 11, f: 12, c: 24, density: 0.85, portion: 250, aliases: ['вареники', 'dumplings'] },
  { id: 'pizza', name: 'Пицца', category: 'dish', kcal: 265, p: 11, f: 10, c: 33, density: 0.6, oily: true, portion: 250 },
  { id: 'nuts', name: 'Орехи', category: 'fat', kcal: 620, p: 18, f: 55, c: 14, density: 0.6, portion: 30, aliases: ['миндаль', 'фундук', 'almonds'] },
  { id: 'oil', name: 'Масло растительное', category: 'fat', kcal: 900, p: 0, f: 100, c: 0, density: 0.92, portion: 10 },
  { id: 'butter', name: 'Масло сливочное', category: 'fat', kcal: 740, p: 0.5, f: 82, c: 0.8, density: 0.91, portion: 10 },
  { id: 'sauce_mayo', name: 'Майонез / сливочный соус', category: 'fat', kcal: 600, p: 1, f: 65, c: 3, density: 0.95, portion: 20, aliases: ['соус', 'майонезом', 'mayonnaise'] },
  { id: 'chocolate', name: 'Шоколад', category: 'sweet', kcal: 540, p: 6, f: 32, c: 56, density: 1.2, portion: 30 },
  { id: 'pancakes', name: 'Блины / панкейки', category: 'bakery', kcal: 230, p: 6, f: 9, c: 31, density: 0.5, portion: 150, aliases: ['блинчики', 'панкейки', 'оладьи', 'pancake', 'crepes', 'fritters'] },
  { id: 'cake', name: 'Торт / пирожное', category: 'sweet', kcal: 380, p: 5, f: 20, c: 45, density: 0.7, portion: 100, aliases: ['пирожное', 'десерт', 'dessert', 'pastry'] },
];

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(FOODS.map((f) => [f.id, f]));

export function findFood(query: string): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOODS;
  return FOODS.filter((f) => f.name.toLowerCase().includes(q));
}
