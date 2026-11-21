// База USDA FoodData Central (~6 400 продуктов) — дополнение к ядру справочника.
// Большая, поэтому лежит отдельным куском (usda.gen.ts) и загружается при первом поиске, без сети не нужна:
// кусок входит в сборку приложения. Русское название собирается из описания USDA (usda-ru.ts).

import { DENSITY_BY_CATEGORY, type Food, type FoodCategory } from './foods';
import { ruFromUsda } from './usda-ru';

const CAT: Record<string, FoodCategory> = { g: 'grain', m: 'meat', f: 'fish', v: 'veg', u: 'fruit', d: 'dairy', b: 'bakery', o: 'fat', h: 'dish', s: 'sweet', k: 'drink' };

/** Строки usda.gen.ts → продукты справочника (id usda_<fdcId>, источник usda). */
export function parseUsda(rows: string): Food[] {
  const out: Food[] = [];
  for (const line of rows.split('\n')) {
    const [id, cat, kcal, p, f, c, portion, desc] = line.split('|');
    const category = CAT[cat];
    if (!id || !category || !desc) continue;
    const food: Food = {
      id: 'usda_' + id,
      name: ruFromUsda(desc) || desc,
      nameEn: desc,
      source: 'usda',
      category,
      kcal: +kcal,
      p: +p,
      f: +f,
      c: +c,
      density: DENSITY_BY_CATEGORY[category],
      fdcId: +id,
    };
    if (portion) food.portion = +portion;
    out.push(food);
  }
  return out;
}

let cache: Food[] | null = null;
let pending: Promise<Food[]> | null = null;

/** Уже загруженная база (пусто, пока не загрузили). */
export const usdaFoods = (): Food[] => cache || [];

/** Загрузить базу один раз; ошибка — пустой список (справочник работает и без неё). */
export function loadUsda(): Promise<Food[]> {
  pending ??= import('./usda.gen')
    .then((m) => (cache = parseUsda(m.USDA_ROWS)))
    .catch(() => {
      pending = null;
      return [];
    });
  return pending;
}
