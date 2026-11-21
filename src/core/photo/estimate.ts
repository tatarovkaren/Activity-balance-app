// Подсчёт по фото без привязки к ИИ.
// Схема метода: размер (по руке) → объём → плотность → граммы → ккал и БЖУ.
// Любой провайдер (ИИ или ручной ввод) только называет продукты и их размер/объём;
// граммы, ккал, диапазон и скрытое масло всегда считает приложение — одинаково для всех моделей.

import { FOOD_BY_ID, type Food } from './foods';

/** Размеры руки, см. По умолчанию — замеры Карэна из метода. */
export interface HandProfile {
  palmWidth: number; // ширина ладони без большого пальца
  palmLength: number; // длина ладони без пальцев
  fistWidth: number;
  fistHeight: number;
  thumbLength: number;
  source: 'manual' | 'card';
  measuredAt?: string;
}

export const REFERENCE_HAND: HandProfile = {
  palmWidth: 10,
  palmLength: 10.5,
  fistWidth: 9,
  fistHeight: 10,
  thumbLength: 6.5,
  source: 'manual',
};

/** Банковская карта ISO/IEC 7810 ID-1 — эталон масштаба для проверки замера руки. */
export const CARD_MM = { w: 85.6, h: 53.98 };

export type HandUnit = 'palm' | 'fist' | 'cupped' | 'thumb' | 'fingertip';


/** Объём одной единицы руки, мл. Параметры стартовые, уточняются на взвешенных эталонах. */
export function handUnitMl(unit: HandUnit, h: HandProfile): number {
  const thumbScale = Math.pow(h.thumbLength / REFERENCE_HAND.thumbLength, 3);
  switch (unit) {
    case 'palm':
      return h.palmWidth * h.palmLength * 1.5 * 0.85; // пласт мяса/рыбы толщиной 1,5 см
    case 'fist':
      return (Math.PI / 6) * h.fistWidth * h.fistHeight * (0.6 * h.fistWidth); // эллипсоид
    case 'cupped':
      return 0.4 * handUnitMl('fist', h);
    case 'thumb':
      return 15 * thumbScale; // ≈ столовая ложка
    case 'fingertip':
      return 5 * thumbScale; // ≈ чайная ложка
  }
}

export type Shape = 'slab' | 'mound' | 'cylinder';

export type Amount =
  | { kind: 'hand'; unit: HandUnit; count: number }
  | { kind: 'grams'; grams: number }
  | { kind: 'volume'; ml: number }
  | { kind: 'dims'; lengthCm: number; widthCm: number; heightCm: number; shape: Shape };

export function amountMl(a: Amount, hand: HandProfile): number | null {
  switch (a.kind) {
    case 'hand':
      return handUnitMl(a.unit, hand) * a.count;
    case 'volume':
      return a.ml;
    case 'dims': {
      const k = a.shape === 'slab' ? 0.85 : a.shape === 'mound' ? 0.5 : Math.PI / 4;
      return a.lengthCm * a.widthCm * a.heightCm * k;
    }
    case 'grams':
      return null;
  }
}

export interface ComponentInput {
  /** Продукт из справочника; если нет — свои значения на 100 г. */
  foodId?: string;
  name?: string;
  per100?: { kcal: number; p: number; f: number; c: number; density?: number };
  amount: Amount;
  /** Уверенность провайдера 0–1 (для ИИ); у ручного ввода не задаётся. */
  confidence?: number;
  /** Продукта нет в справочнике, КБЖУ и вес примерные — в черновике пометка «проверьте». */
  unverified?: boolean;
}

export interface DraftComponent {
  name: string;
  foodId?: string;
  grams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
  amount: Amount;
  /** Вес для дневника «сухим/сырым», если пользователь так ведёт дневник. */
  diaryGrams?: number;
  /** Что записать в дневник: сухая крупа (уварка > 1) или сырой вес (мясо, рыба). Текст — в словарях. */
  diaryKind?: 'dry' | 'raw';
}

export type PhotoQuality = 'good' | 'topOnly' | 'poor';

export interface DraftOptions {
  hand: HandProfile;
  quality: PhotoQuality;
  /** Ресторанная или жареная еда — добавить скрытое масло отдельной строкой. */
  hiddenOil: boolean;
  diaryWeights: 'raw' | 'cooked';
}

export interface Draft {
  components: DraftComponent[];
  hiddenOil: { kcalMin: number; kcalMax: number; kcal: number; fat: number } | null;
  rangePct: number;
  kcal: number;
  kcalMin: number;
  kcalMax: number;
  p: number;
  f: number;
  c: number;
  grams: number;
}

export function rangePctFor(q: PhotoQuality): number {
  return q === 'good' ? 15 : q === 'topOnly' ? 20 : 30;
}

const r0 = (x: number) => Math.round(x);
const r1 = (x: number) => Math.round(x * 10) / 10;

export function resolveFood(ci: ComponentInput): { name: string; food?: Food; per100: { kcal: number; p: number; f: number; c: number; density: number } } | null {
  const food = ci.foodId ? FOOD_BY_ID[ci.foodId] : undefined;
  if (food) return { name: ci.name || food.name, food, per100: food };
  if (ci.per100) return { name: ci.name || '', per100: { density: 1, ...ci.per100 } };
  return null;
}

export function buildComponent(ci: ComponentInput, opts: DraftOptions): DraftComponent | null {
  const res = resolveFood(ci);
  if (!res) return null;
  let grams: number;
  if (ci.amount.kind === 'grams') grams = ci.amount.grams;
  else {
    const ml = amountMl(ci.amount, opts.hand);
    if (ml == null) return null;
    grams = ml * res.per100.density;
  }
  if (!(grams > 0)) return null;
  const k = grams / 100;
  const comp: DraftComponent = {
    name: res.name,
    foodId: res.food?.id,
    grams: r0(grams),
    kcal: r0(res.per100.kcal * k),
    p: r1(res.per100.p * k),
    f: r1(res.per100.f * k),
    c: r1(res.per100.c * k),
    amount: ci.amount,
  };
  // Пересчёт уварки: ккал те же, меняется только вес для дневника.
  if (opts.diaryWeights === 'raw' && res.food?.cookYield) {
    comp.diaryGrams = r0(grams / res.food.cookYield);
    comp.diaryKind = res.food.cookYield > 1 ? 'dry' : 'raw';
  }
  return comp;
}

export function buildDraft(inputs: ComponentInput[], opts: DraftOptions): Draft {
  const components = inputs.map((ci) => buildComponent(ci, opts)).filter((c): c is DraftComponent => !!c);
  const hiddenOil = opts.hiddenOil ? { kcalMin: 50, kcalMax: 100, kcal: 75, fat: r1(75 / 9) } : null;
  const sum = (k: 'kcal' | 'p' | 'f' | 'c' | 'grams') => components.reduce((a, c) => a + c[k], 0);
  const base = sum('kcal');
  const rangePct = rangePctFor(opts.quality);
  const kcal = base + (hiddenOil?.kcal || 0);
  return {
    components,
    hiddenOil,
    rangePct,
    kcal: r0(kcal),
    kcalMin: r0(base * (1 - rangePct / 100) + (hiddenOil?.kcalMin || 0)),
    kcalMax: r0(base * (1 + rangePct / 100) + (hiddenOil?.kcalMax || 0)),
    p: r1(sum('p')),
    f: r1(sum('f') + (hiddenOil?.fat || 0)),
    c: r1(sum('c')),
    grams: r0(sum('grams')),
  };
}

/** Ошибка оценки в % при известном реальном весе (для личных эталонов и поправки). */
export function estimateErrorPct(estimatedGrams: number, realGrams: number): number | null {
  if (!(realGrams > 0)) return null;
  return ((estimatedGrams - realGrams) / realGrams) * 100;
}

/** Средняя ошибка по истории эталонов — поправочный множитель (во второй очереди применяется к оценке). */
export function biasFactor(errorsPct: number[]): number | null {
  if (errorsPct.length < 3) return null;
  const mean = errorsPct.reduce((a, b) => a + b, 0) / errorsPct.length;
  return 1 / (1 + mean / 100);
}

/** Размер руки по снимку с картой: px руки × (мм карты / px карты). */
export function handFromCard(cardPx: number, objectPx: number, cardMm = CARD_MM.w): number | null {
  if (!(cardPx > 0 && objectPx > 0)) return null;
  return r1(((objectPx * cardMm) / cardPx) / 10);
}
