// Собирает справочник USDA FoodData Central для приложения → src/core/photo/usda.gen.ts.
// Исходники (общественное достояние) в репозиторий не кладём — они большие; скачать на
// https://fdc.nal.usda.gov/download-datasets: «SR Legacy» (JSON или CSV не важно — сейчас JSON)
// и «Foundation Foods» (CSV), распаковать и запустить:
//
//   node scripts/build-usda.mjs <sr_legacy.json> <папка foundation csv>
//
// Что берём: всё, кроме детского питания, фастфуда и ресторанов США, блюд коренных народов Аляски
// и товаров конкретных марок. Foundation Foods точнее и новее — при одинаковом описании берём их.
// Ккал, Б, Ж, У на 100 г; порция — первая мера USDA от 5 до 500 г. Русские названия делает приложение
// (src/core/photo/usda-ru.ts) при загрузке, чтобы не хранить их дважды.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [srPath, fdDir] = process.argv.slice(2);
if (!srPath || !fdDir) {
  console.error('node scripts/build-usda.mjs <sr_legacy.json> <foundation csv dir>');
  process.exit(1);
}

const SKIP_CAT = new Set(['Baby Foods', 'American Indian/Alaska Native Foods', 'Fast Foods', 'Restaurant Foods']);
const BRANDS = [
  'quaker', 'mars snackfood', 'malt-o-meal', 'ocean spray', 'chobani', 'nestle', 'breyers', 'v8 ', 'coca-cola', 'kraft', 'pillsbury',
  'nabisco', 'pepperidge farm', 'oscar mayer', 'archway', 'glutino', "udi's", "van's", 'george weston', 'schar', 'martha white',
  "andrea's", 'crunchmaster', "rudi's", 'heinz', 'interstate brands', "mary's gone", 'sage valley', 'lean pockets', 'reddi wip',
  'continental mills', 'mckee', 'hormel', 'mission foods', 'dutch brand', 'kellogg', 'general mills', 'keebler', 'hershey', 'campbell',
  'kashi', 'nature valley', 'post ', ', post', 'tyson', 'lipton', 'snapple', 'gatorade', 'powerade', 'arizona', 'nesquik', 'carnation',
  'ovaltine', 'kool-aid', 'tang', 'smucker', 'jif', 'skippy', 'stouffer', 'banquet', 'healthy choice', 'weight watchers', 'whiteys',
];
// марки в SR пишутся заглавными: KELLOGG'S, McDONALD'S
const UPPER = /\b[A-Z][A-Z'&.]{2,}/;
const CAT = {
  'Beef Products': 'meat', 'Pork Products': 'meat', 'Lamb, Veal, and Game Products': 'meat', 'Poultry Products': 'meat',
  'Sausages and Luncheon Meats': 'meat', 'Finfish and Shellfish Products': 'fish', 'Vegetables and Vegetable Products': 'veg',
  'Spices and Herbs': 'veg', 'Fruits and Fruit Juices': 'fruit', 'Dairy and Egg Products': 'dairy', 'Baked Products': 'bakery',
  'Breakfast Cereals': 'grain', 'Cereal Grains and Pasta': 'grain', 'Legumes and Legume Products': 'grain', 'Nut and Seed Products': 'fat',
  'Fats and Oils': 'fat', Sweets: 'sweet', Snacks: 'sweet', Beverages: 'drink', 'Alcoholic Beverages': 'drink',
  'Soups, Sauces, and Gravies': 'dish', 'Meals, Entrees, and Side Dishes': 'dish',
};
const CAT_CODE = { grain: 'g', meat: 'm', fish: 'f', veg: 'v', fruit: 'u', dairy: 'd', bakery: 'b', fat: 'o', dish: 'h', sweet: 's', drink: 'k' };

const r1 = (x) => Math.round(x * 10) / 10;
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const branded = (d) => UPPER.test(d) || BRANDS.some((b) => norm(d).includes(b));

function category(cat, desc) {
  const c = CAT[cat];
  if (!c) return null;
  if (c === 'fruit' && /juice|nectar/i.test(desc)) return 'drink';
  return c;
}

/** Ккал, Б, Ж, У из списка нутриентов по id. Нет ккал или БЖУ — запись не берём. */
function macros(get) {
  const kcal = get(1008) ?? get(2048) ?? get(2047);
  const p = get(1003);
  const f = get(1004);
  const c = get(1005) ?? get(1050);
  if (kcal == null || p == null || f == null || c == null) return null;
  if (p + f + c > 101) return null;
  return { kcal: Math.round(kcal), p: r1(p), f: r1(f), c: r1(Math.max(0, c)) };
}

function portionOf(list) {
  for (const x of list) {
    const g = x.g;
    if (g >= 5 && g <= 500) return Math.round(g);
  }
  return 0;
}

const out = new Map(); // норм. описание → запись

// ---- Foundation Foods (CSV) ----
function csv(file) {
  const text = readFileSync(join(fdDir, file), 'utf8');
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...data] = rows;
  return data.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const fdFiles = readdirSync(fdDir);
if (fdFiles.includes('foundation_food.csv')) {
  const ids = new Set(csv('foundation_food.csv').map((r) => r.fdc_id));
  const cats = Object.fromEntries(csv('food_category.csv').map((r) => [r.id, r.description]));
  const foods = csv('food.csv').filter((r) => ids.has(r.fdc_id));
  const nut = new Map();
  for (const r of csv('food_nutrient.csv')) {
    if (!ids.has(r.fdc_id)) continue;
    if (!nut.has(r.fdc_id)) nut.set(r.fdc_id, {});
    nut.get(r.fdc_id)[r.nutrient_id] = parseFloat(r.amount);
  }
  const por = new Map();
  for (const r of csv('food_portion.csv')) {
    if (!ids.has(r.fdc_id)) continue;
    if (!por.has(r.fdc_id)) por.set(r.fdc_id, []);
    por.get(r.fdc_id).push({ g: parseFloat(r.gram_weight) / (parseFloat(r.amount) || 1) });
  }
  for (const f of foods) {
    const cat = category(cats[f.food_category_id], f.description);
    if (!cat || branded(f.description)) continue;
    const n = nut.get(f.fdc_id) || {};
    const m = macros((id) => (Number.isFinite(n[id]) ? n[id] : undefined));
    if (!m) continue;
    out.set(norm(f.description), { id: +f.fdc_id, cat, ...m, portion: portionOf(por.get(f.fdc_id) || []), desc: f.description.trim() });
  }
}
const fdCount = out.size;

// ---- SR Legacy (JSON) ----
const sr = JSON.parse(readFileSync(srPath, 'utf8')).SRLegacyFoods;
for (const f of sr) {
  const cat = category(f.foodCategory?.description, f.description);
  if (!cat || SKIP_CAT.has(f.foodCategory?.description) || branded(f.description)) continue;
  const key = norm(f.description);
  if (out.has(key)) continue;
  const n = {};
  for (const x of f.foodNutrients || []) if (x.nutrient && typeof x.amount === 'number') n[x.nutrient.id] = x.amount;
  const m = macros((id) => n[id]);
  if (!m) continue;
  const por = (f.foodPortions || []).map((x) => ({ g: x.gramWeight / (x.amount || 1) }));
  out.set(key, { id: f.fdcId, cat, ...m, portion: portionOf(por), desc: f.description.trim() });
}

const rows = [...out.values()].sort((a, b) => a.desc.localeCompare(b.desc));
const lines = rows.map((r) => [r.id, CAT_CODE[r.cat], r.kcal, r.p, r.f, r.c, r.portion || '', r.desc.replace(/[|\n]/g, ' ')].join('|'));
const body = `// Сгенерировано scripts/build-usda.mjs из USDA FoodData Central (SR Legacy 2018-04 + Foundation Foods). Не править руками.
// Строка: fdcId|категория|ккал|Б|Ж|У|порция г|описание USDA. Данные — общественное достояние (U.S. Department of Agriculture).
// Загружается отдельным куском при первом поиске (src/core/photo/usda.ts), в основной бандл не входит.

export const USDA_ROWS = ${JSON.stringify(lines.join('\n'))};
`;
writeFileSync('src/core/photo/usda.gen.ts', body);
console.log(`usda.gen.ts: ${rows.length} продуктов (Foundation ${fdCount}, SR Legacy ${rows.length - fdCount}), ${Math.round(body.length / 1024)} КБ`);
