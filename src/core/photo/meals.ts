// Приёмы пищи «по фото» в дневнике: как они складываются с ручным вводом и импортом FatSecret.
//
// Правило одно: КБЖУ дня = то, что записано руками или пришло из FatSecret, + сумма приёмов по фото.
// - Запись по фото прибавляется к уже записанному (ничего не затирает).
// - Импорт FatSecret заменяет свою часть, а приёмы по фото прибавляются сверху,
//   поэтому повторный импорт того же дня не задваивает и не теряет фото.
// - Удаление приёма по фото вычитает только его.
// Если блюдо уже записано в FatSecret, приём по фото за тот же день надо удалить, иначе оно посчитается дважды.

import type { DayEntry, PhotoMeal } from '../types';
import type { Draft, DraftComponent } from './estimate';
import { macroKcal } from '../energy';

const r1 = (x: number) => Math.round(x * 10) / 10;

export interface FoodTotals {
  kcal: number;
  p: number;
  f: number;
  c: number;
}

export function photoTotals(e: DayEntry | undefined): FoodTotals {
  const out = { kcal: 0, p: 0, f: 0, c: 0 };
  for (const m of e?.photoMeals || []) {
    out.kcal += m.kcal;
    out.p += m.p;
    out.f += m.f;
    out.c += m.c;
  }
  return { kcal: Math.round(out.kcal), p: r1(out.p), f: r1(out.f), c: r1(out.c) };
}

/** Собрать приём по фото из черновика. estGrams — граммы каждого продукта в ответе ИИ (по индексу). */
export function mealFromDraft(
  draft: Draft,
  meta: { id: string; meal: PhotoMeal['meal']; provider: string; at: number },
  estGrams: (number | undefined)[] = [],
): PhotoMeal {
  return {
    ...meta,
    kcal: draft.kcal,
    p: draft.p,
    f: draft.f,
    c: draft.c,
    kcalMin: draft.kcalMin,
    kcalMax: draft.kcalMax,
    rangePct: draft.rangePct,
    oilKcal: draft.hiddenOil?.kcal,
    items: draft.components.map((c: DraftComponent, i) => ({
      name: c.name,
      foodId: c.foodId,
      grams: c.grams,
      kcal: c.kcal,
      p: c.p,
      f: c.f,
      c: c.c,
      ...(estGrams[i] != null ? { estGrams: estGrams[i] } : {}),
      ...(c.diaryGrams != null ? { diaryGrams: c.diaryGrams } : {}),
    })),
  };
}

/** Патч дня: добавить приём по фото к уже записанному КБЖУ. */
export function addPhotoMeal(e: DayEntry | undefined, m: PhotoMeal): Partial<DayEntry> {
  const cur = e || {};
  // ккал до приёма: введённые вручную, а если их нет — посчитанные по БЖУ (иначе авто‑ккал терялись)
  const base = cur.kcal ?? Math.round(macroKcal(cur.protein, cur.fat, cur.carbs) ?? 0);
  return {
    photoMeals: [...(cur.photoMeals || []).filter((x) => x.id !== m.id), m],
    kcal: Math.round(base + m.kcal),
    kcalManual: true,
    protein: r1((cur.protein || 0) + m.p),
    fat: r1((cur.fat || 0) + m.f),
    carbs: r1((cur.carbs || 0) + m.c),
  };
}

/** Патч дня: убрать приём по фото и вычесть только его. Пустое КБЖУ становится «нет данных», а не 0. */
export function removePhotoMeal(e: DayEntry | undefined, id: string): Partial<DayEntry> {
  const cur = e || {};
  const m = (cur.photoMeals || []).find((x) => x.id === id);
  if (!m) return {};
  const rest = (cur.photoMeals || []).filter((x) => x.id !== id);
  const sub = (v: number | undefined, d: number, round: (x: number) => number) => {
    if (v == null) return undefined;
    const x = round(v - d);
    return x > 0.05 ? x : undefined;
  };
  const kcal = sub(cur.kcal, m.kcal, Math.round);
  return {
    photoMeals: rest.length ? rest : undefined,
    kcal,
    kcalManual: kcal != null ? cur.kcalManual : undefined,
    protein: sub(cur.protein, m.p, r1),
    fat: sub(cur.fat, m.f, r1),
    carbs: sub(cur.carbs, m.c, r1),
  };
}

/** Импорт FatSecret за день: его значения + приёмы по фото этого дня. */
export function withPhotoOnTop(e: DayEntry | undefined, fs: { kcal?: number; protein?: number; fat?: number; carbs?: number }) {
  const t = photoTotals(e);
  if (!e?.photoMeals?.length) return fs;
  const add = (v: number | undefined, d: number, round: (x: number) => number) => (v == null ? (d ? d : undefined) : round(v + d));
  return {
    kcal: add(fs.kcal, t.kcal, Math.round),
    protein: add(fs.protein, t.p, r1),
    fat: add(fs.fat, t.f, r1),
    carbs: add(fs.carbs, t.c, r1),
  };
}

// ---- Правки граммов: ошибка оценки для будущей калибровки ----

/** Одна правка: ИИ оценил estGrams, пользователь сохранил grams. */
export interface PhotoEdit {
  date: string;
  /** Время, мс. */
  at: number;
  provider: string;
  foodId?: string;
  name: string;
  estGrams: number;
  grams: number;
  /** (оценка − итог) / итог × 100. Плюс — ИИ завысил. */
  errorPct: number;
}

/** Правки из подтверждённого приёма: продукты, у которых граммы изменили больше чем на 2 % (и не меньше 3 г). */
export function editsFromMeal(m: PhotoMeal, date: string): PhotoEdit[] {
  const out: PhotoEdit[] = [];
  for (const it of m.items) {
    if (it.estGrams == null || !(it.grams > 0)) continue;
    const diff = it.estGrams - it.grams;
    if (Math.abs(diff) < 3 || Math.abs(diff) / it.grams < 0.02) continue;
    out.push({
      date,
      at: m.at,
      provider: m.provider,
      foodId: it.foodId,
      name: it.name,
      estGrams: it.estGrams,
      grams: it.grams,
      errorPct: Math.round((diff / it.grams) * 1000) / 10,
    });
  }
  return out;
}

/** Сводка правок: сколько и в какую сторону в среднем ошибается оценка (медиана устойчивее к опечаткам). */
export function editsSummary(edits: PhotoEdit[]): { n: number; medianPct: number } | null {
  if (edits.length < 3) return null;
  const xs = edits.map((e) => e.errorPct).sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  return { n: edits.length, medianPct: Math.round(median) };
}
