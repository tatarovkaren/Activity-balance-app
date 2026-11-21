// Поиск по справочнику продуктов по названию (RU и EN сразу) и по штрихкоду.
// Работает по мере набора: «греч» находит гречку, «котлетой» — котлету (сравнение по началу слова),
// «молоко 2,5» — молоко нужной жирности (цифры тоже слова). Свои продукты выше встроенных при равном совпадении.

import type { Food } from './foods';
import { normalizeWord, wordMatch } from './match';

/** Слова строки для поиска: буквы и цифры, «2,5» → «2,5» одним словом. */
export function searchWords(text: string): string[] {
  return normalizeWord(text)
    .replace(/(\d)[.,](\d)/g, '$1,$2')
    .split(/[^a-zа-я0-9,]+|,(?!\d)/)
    .map((w) => w.replace(/^,|,$/g, ''))
    .filter(Boolean);
}

/** Насколько слово запроса совпало со словом продукта: 0 — нет. */
function tokenScore(q: string, w: string): number {
  if (w === q) return 4;
  if (w.startsWith(q)) return 3; // набирает дальше: «греч» → «гречка»
  return q.length >= 4 && w.length >= 4 && wordMatch(q, w) ? 2 : 0; // падежи: «котлетой» → «котлета»
}

/** Надбавка только к совпавшему слову. */
const bonus = (score: number, add: number) => (score > 0 ? score + add : 0);

export interface FoodHit {
  food: Food;
  score: number;
}

/**
 * Продукты по запросу. Каждое слово запроса должно найтись в названии (RU или EN), другом названии или марке.
 * Пустой запрос — пустой список (что показать без запроса, решает экран).
 */
export function searchFoods(query: string, foods: Food[], limit = 30): FoodHit[] {
  const qs = searchWords(query);
  if (!qs.length) return [];
  const digits = query.replace(/\s/g, '');
  if (/^\d{8,14}$/.test(digits)) return foods.filter((f) => f.barcode === digits).map((food) => ({ food, score: 100 }));
  const qNorm = normalizeWord(query.trim());
  const hits: FoodHit[] = [];
  for (const food of foods) {
    const name = searchWords(food.name);
    const en = searchWords(food.nameEn || '');
    const other = [...(food.aliases || []), food.brand || ''].flatMap(searchWords);
    let score = 0;
    let ok = true;
    for (const q of qs) {
      const best = Math.max(
        0,
        ...name.map((w, i) => bonus(tokenScore(q, w), i === 0 ? 1 : 0)),
        ...en.map((w, i) => bonus(tokenScore(q, w), i === 0 ? 0.5 : 0)),
        ...other.map((w) => bonus(tokenScore(q, w), -0.5)),
      );
      if (best <= 0) {
        ok = false;
        break;
      }
      score += best;
    }
    if (!ok) continue;
    if (normalizeWord(food.name).startsWith(qNorm) || normalizeWord(food.nameEn || '').startsWith(qNorm)) score += 3;
    if (food.source === 'user' || food.source === 'off') score += 0.5;
    // короче название — точнее совпадение: «Молоко 2,5%» выше «Молочного коктейля»
    score -= Math.min(1, name.length / 20);
    hits.push({ food, score });
  }
  return hits.sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length).slice(0, limit);
}
