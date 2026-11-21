// Поиск продуктов справочника по названию блюда, которое ввёл пользователь («гречка с котлетой», «Pancakes»).
// Нужен демо-оценке: она не смотрит на снимок, а собирает черновик из названия.
// Сравнение по началу слова, чтобы ловить падежи и множественное число: «котлетой» = «котлета», «eggs» = «egg».

import { FOODS, typicalPortion, type Food } from './foods';
import type { ComponentInput } from './estimate';

/** Слова о способе приготовления: уточняют выбор, но сами по себе продукт не находят. */
const MODIFIERS = ['отварн', 'варен', 'готов', 'запеч', 'жарен', 'тушен', 'свеж', 'средн', 'boiled', 'cooked', 'baked', 'fried', 'stewed', 'roasted', 'fresh', 'average'];
/** Слова, которые говорят о скрытом масле. */
const OILY_WORDS = ['ресторан', 'жарен', 'фри', 'кафе', 'restaurant', 'fried', 'cafe'];
/** Мелкие слова, которые не ищем: предлоги, союзы. */
const SHORT_OK = 3;

export const normalizeWord = (w: string) => w.toLowerCase().replace(/ё/g, 'е');

export function words(text: string): string[] {
  return normalizeWord(text)
    .split(/[^a-zа-я0-9]+/)
    .filter((w) => w.length >= SHORT_OK);
}

const isModifier = (w: string) => MODIFIERS.some((m) => w.startsWith(m));

/** Сила совпадения двух слов: длина общего начала, если её хватает; иначе 0. */
export function wordMatch(a: string, b: string): number {
  const short = Math.min(a.length, b.length);
  let n = 0;
  while (n < short && a[n] === b[n]) n++;
  // короткие слова («рис», «egg») — только целиком; длинные — общее начало ≥ 4 букв и ≥ 60 % короткого слова
  const need = short <= SHORT_OK ? short : Math.max(4, Math.ceil(short * 0.6));
  return n >= need ? n : 0;
}

function foodWords(f: Food): string[] {
  return [...new Set([...words(f.name), ...f.id.split('_').filter((w) => w.length >= SHORT_OK), ...(f.aliases || []).flatMap(words)])];
}

export interface FoodMatch {
  food: Food;
  /** Какие слова названия ушли на этот продукт. */
  used: string[];
}

/**
 * Продукты справочника, названные в тексте, в порядке упоминания.
 * Каждое слово текста достаётся одному продукту — тому, что совпал сильнее
 * («котлета куриная» → только «Котлета куриная», без «Куриной грудки» и «Котлеты говяжьей»).
 */
export function matchFoods(text: string, max = 3): FoodMatch[] {
  const ws = words(text);
  if (!ws.length) return [];
  const scored = FOODS.map((food, order) => {
    const fw = foodWords(food);
    let core = 0;
    let mod = 0;
    let first = Infinity;
    const used: string[] = [];
    ws.forEach((w, i) => {
      const best = Math.max(0, ...fw.map((x) => wordMatch(w, x)));
      if (!best) return;
      if (isModifier(w)) mod += best;
      else {
        core += best;
        used.push(w);
        first = Math.min(first, i);
      }
    });
    return { food, used, score: core * 10 + mod, first, order };
  }).filter((x) => x.used.length);
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const taken = new Set<string>();
  const picked: (FoodMatch & { first: number })[] = [];
  for (const s of scored) {
    if (s.used.every((w) => taken.has(w))) continue;
    s.used.forEach((w) => taken.add(w));
    picked.push({ food: s.food, used: s.used, first: s.first });
  }
  return picked
    .sort((a, b) => a.first - b.first)
    .slice(0, max)
    .map(({ food, used }) => ({ food, used }));
}

/** Есть ли в названии намёк на жарку или ресторан. */
export function oilyHint(text: string): boolean {
  return words(text).some((w) => OILY_WORDS.some((o) => w.startsWith(o)));
}

/**
 * Средние значения «блюда вообще» на 100 г — для названия, которого нет в справочнике.
 * Порция примерная, в черновике строка помечена «проверьте».
 */
export const UNKNOWN_DISH = {
  per100: { kcal: 170, p: 7, f: 7, c: 20, density: 0.8 },
  /** Блюдо целиком, когда в названии ничего не нашлось. */
  grams: 250,
  /** Ненайденная часть рядом с найденными продуктами («шакшука» в «шакшука с хлебом»). */
  sideGrams: 150,
};

/** Название, как его ввёл пользователь: без лишних пробелов, с заглавной буквы, не длиннее 60 знаков. */
export function dishName(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, 60);
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** Части названия: «гречка с котлетой, ресторан» → «гречка», «котлетой», «ресторан». */
export function nameParts(text: string): string[] {
  return text
    .split(/[,;+/&]|\s(?:с|со|и|with|and)\s/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Часть, где нет ничего, кроме слов про масло/ресторан и способ готовки, — не блюдо. */
const isNoise = (part: string) => words(part).every((w) => isModifier(w) || OILY_WORDS.some((o) => w.startsWith(o)));

/**
 * Черновик из названия: продукты справочника с типичной порцией.
 * Если ни один продукт не найден — одна строка с этим названием, средним КБЖУ и пометкой «проверьте».
 * Если найдены не все части («шакшука с хлебом») — ненайденные части тоже строками с пометкой.
 */
export function componentsFromName(text: string, max = 4): ComponentInput[] {
  const name = dishName(text);
  if (!name) return [];
  const unknown = (n: string, grams: number): ComponentInput => ({
    name: dishName(n),
    per100: { ...UNKNOWN_DISH.per100 },
    amount: { kind: 'grams', grams },
    confidence: 0.2,
    unverified: true,
  });
  const out: ComponentInput[] = [];
  const seen = new Set<string>();
  let found = 0;
  for (const part of nameParts(text)) {
    const m = matchFoods(part).filter(({ food }) => !seen.has(food.id));
    if (m.length) {
      for (const { food } of m) {
        seen.add(food.id);
        out.push({ foodId: food.id, amount: { kind: 'grams', grams: typicalPortion(food) }, confidence: 0.5 });
        found++;
      }
    } else if (!isNoise(part)) {
      out.push(unknown(part, UNKNOWN_DISH.sideGrams));
    }
  }
  if (!found) return [unknown(name, UNKNOWN_DISH.grams)];
  return out.slice(0, max);
}
