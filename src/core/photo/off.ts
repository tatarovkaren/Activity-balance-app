// Продукт по штрихкоду из Open Food Facts (openfoodfacts.org): открытая база, бесплатно, без ключа.
// Лицензия базы — ODbL: в приложении у такого продукта подпись «Данные: Open Food Facts».
// Найденный продукт сохраняется в свои продукты (source 'off'), второй раз находится без сети.
// Цифры в базе вносят люди: приложение проверяет их и просит сверить с этикеткой.

import { makeCustomFood, type CustomFoodInput } from './custom';
import type { Food } from './foods';

export const OFF_URL = 'https://world.openfoodfacts.org';
export const OFF_ATTRIBUTION = 'Open Food Facts (ODbL)';

/** Штрихкод EAN-8 / UPC-A / EAN-13 / GTIN-14 с верной контрольной цифрой. */
export function isValidBarcode(raw: string): boolean {
  const s = raw.replace(/\s/g, '');
  if (!/^(\d{8}|\d{12,14})$/.test(s)) return false;
  const d = s.split('').map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export const cleanBarcode = (raw: string) => raw.replace(/\D/g, '');

interface OffNutriments {
  'energy-kcal_100g'?: number | string;
  energy_100g?: number | string;
  proteins_100g?: number | string;
  fat_100g?: number | string;
  carbohydrates_100g?: number | string;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_ru?: string;
  product_name_en?: string;
  brands?: string;
  serving_quantity?: number | string;
  nutriments?: OffNutriments;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Ответ Open Food Facts → свой продукт. null — в базе нет названия или калорийности на 100 г
 * (тогда пользователь вводит продукт сам, штрихкод сохранится).
 */
export function productFromOff(code: string, p: OffProduct | undefined, lang: string, now = Date.now()): Food | null {
  if (!p) return null;
  const n = p.nutriments || {};
  const kcal = num(n['energy-kcal_100g']) ?? (num(n.energy_100g) != null ? num(n.energy_100g)! / 4.184 : undefined);
  const name = (lang === 'ru' ? p.product_name_ru || p.product_name : p.product_name_en || p.product_name) || p.product_name_ru || p.product_name_en || '';
  if (!name.trim() || kcal == null) return null;
  const brand = (p.brands || '').split(',')[0]?.trim();
  const input: CustomFoodInput = {
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name.trim()}, ${brand}` : name,
    kcal,
    p: num(n.proteins_100g) ?? 0,
    f: num(n.fat_100g) ?? 0,
    c: num(n.carbohydrates_100g) ?? 0,
    portion: num(p.serving_quantity),
    barcode: code,
    brand,
    source: 'off',
  };
  return makeCustomFood(input, now);
}

export class OffError extends Error {
  constructor(public code: 'badCode' | 'notFound' | 'network') {
    super(code);
  }
}

/** Запрос в Open Food Facts. fetchFn — для тестов. */
export async function fetchOffProduct(raw: string, lang: string, fetchFn: typeof fetch = fetch): Promise<Food> {
  const code = cleanBarcode(raw);
  if (!isValidBarcode(code)) throw new OffError('badCode');
  let res: Response;
  try {
    res = await fetchFn(`${OFF_URL}/api/v2/product/${code}.json?fields=code,product_name,product_name_ru,product_name_en,brands,serving_quantity,nutriments&lc=${lang}`);
  } catch {
    throw new OffError('network');
  }
  if (res.status === 404) throw new OffError('notFound');
  if (!res.ok) throw new OffError('network');
  const j = (await res.json().catch(() => null)) as { status?: number; product?: OffProduct } | null;
  const food = j && j.status === 1 ? productFromOff(code, j.product, lang) : null;
  if (!food) throw new OffError('notFound');
  return food;
}
