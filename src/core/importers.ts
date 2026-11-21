// Импорт: выгрузка FatSecret (один день или период), история веса из CSV, резервная копия.

import { isISODate, type ISODate } from './dates';
import { mergeEntry } from './merge';
import { withPhotoOnTop } from './photo/meals';
import type { DayEntry, DayMap } from './types';

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQ = false;
  // Разделитель по первой строке: ';' (Excel в РФ), таб или ','.
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  const isSep = (ch: string) => ch === sep;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (isSep(ch)) {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((v) => (v || '').trim() !== ''));
}

function matchCol(headers: string[], include: string[], exclude: string[]): number {
  const lower = headers.map((h) => (h || '').toLowerCase().trim());
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i];
    if (exclude.some((x) => h.includes(x))) continue;
    if (include.some((x) => h.startsWith(x) || h.includes(x))) return i;
  }
  return -1;
}

const RU_MONTHS: Record<string, number> = {
  января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6,
  июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
};
const EN_MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
/** Коды ошибок импорта. Текст — в словарях src/i18n (errors.*). */
export type ImportError =
  | 'fatsecretNoHeader'
  | 'fatsecretNoKcal'
  | 'fatsecretNoDays'
  | 'fatsecretPdf'
  | 'fileEmpty'
  | 'weightNoRows'
  | 'backupUnreadable'
  | 'backupNotOurs'
  | 'backupOtherAccount'
  | 'pdfUnreadable'
  | 'pdfNoText';

const p2 = (n: number | string) => String(n).padStart(2, '0');

export function normDate(s: string): string {
  s = (s || '').trim();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
  if ((m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + p2(m[1]) + '-' + p2(m[2]);
  const low = s.toLowerCase();
  if ((m = low.match(/([а-яё]+)\s+(\d{1,2}),?\s*(\d{4})/))) {
    const mo = RU_MONTHS[m[1]];
    if (mo) return m[3] + '-' + p2(mo) + '-' + p2(m[2]);
  }
  if ((m = low.match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/))) {
    const mo = RU_MONTHS[m[2]];
    if (mo) return m[3] + '-' + p2(mo) + '-' + p2(m[1]);
  }
  if ((m = low.match(/([a-z]+)\.?\s+(\d{1,2}),?\s*(\d{4})/))) {
    const mo = EN_MONTHS[m[1]];
    if (mo) return m[3] + '-' + p2(mo) + '-' + p2(m[2]);
  }
  if ((m = low.match(/(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})/))) {
    const mo = EN_MONTHS[m[2]];
    if (mo) return m[3] + '-' + p2(mo) + '-' + p2(m[1]);
  }
  return s;
}

const num = (v: string | undefined) => {
  const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(x) ? x : undefined;
};

function isTotalRow(r: string[]): boolean {
  const f0 = r[0] || '';
  if (/^\s/.test(f0)) return false; // с отступом — приём пищи или продукт, не итог дня
  const t = f0.trim().toLowerCase();
  if (t === '' || t === 'дата' || t === 'date' || t.startsWith('#')) return false;
  return r.length >= 5;
}

export interface FoodDay {
  date: ISODate;
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
}

export type FatSecretParse =
  | { ok: true; days: FoodDay[]; skipped: number }
  | { ok: false; error: ImportError };

/** Разбор выгрузки FatSecret. Пустая ячейка = нет данных; день без калорий пропускается. */
export function parseFatSecret(text: string): FatSecretParse {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  const headerIdx = rows.findIndex((r) => {
    const t = (r[0] || '').trim().toLowerCase();
    return t === 'дата' || t === 'date';
  });
  if (headerIdx === -1) return { ok: false, error: 'fatsecretNoHeader' };
  const headers = rows[headerIdx];
  const dateIdx = 0;
  const kcalIdx = matchCol(headers, ['кал', 'calor', 'energy'], ['калий', 'potass']);
  const fatIdx = matchCol(headers, ['жир', 'fat'], ['н/жир', 'sat']);
  const carbIdx = matchCol(headers, ['углев', 'carb'], []);
  const proteinIdx = matchCol(headers, ['белк', 'protein'], []);
  if (kcalIdx === -1) return { ok: false, error: 'fatsecretNoKcal' };
  const byDate = new Map<ISODate, string[]>();
  for (const r of rows.slice(headerIdx + 1)) {
    if (!isTotalRow(r)) continue;
    const d = normDate(r[dateIdx]);
    if (!isISODate(d)) continue; // строка «Всего» и пр.
    if (!byDate.has(d)) byDate.set(d, r); // первая итоговая строка даты
  }
  if (!byDate.size) return { ok: false, error: 'fatsecretNoDays' };
  const days: FoodDay[] = [];
  let skipped = 0;
  for (const d of [...byDate.keys()].sort()) {
    const r = byDate.get(d)!;
    const raw = (ix: number) => (ix === -1 ? undefined : (r[ix] ?? '').trim() || undefined);
    const kcal = num(raw(kcalIdx));
    if (!(kcal && kcal > 0)) {
      skipped++;
      continue;
    }
    const r1 = (v: number | undefined) => (v == null ? undefined : Math.round(v * 10) / 10);
    days.push({
      date: d,
      kcal: Math.round(kcal),
      protein: r1(num(raw(proteinIdx))),
      fat: r1(num(raw(fatIdx))),
      carbs: r1(num(raw(carbIdx))),
    });
  }
  return { ok: true, days, skipped };
}

// ---- FatSecret: PDF-отчёт ----

/** Строка текста PDF: элементы с координатой x (pt) и шириной. */
export interface PdfLine {
  page: number;
  items: { x: number; w: number; str: string }[];
}

type Col = 'kcal' | 'fat' | 'carbs' | 'protein';
const COL_KEYS: Record<Col, [string[], string[]]> = {
  kcal: [['кал', 'ккал', 'calor', 'energy', 'kcal'], ['калий', 'potass']],
  fat: [['жир', 'fat'], ['н/жир', 'нас', 'sat', 'trans']],
  carbs: [['углев', 'carb'], []],
  protein: [['белк', 'белок', 'prot'], []],
};
const TOTAL_RE = /^(всего|итого|итог|total|daily total|day total)/i;
const PERIOD_RE = /(период|period|summary|сводк)/i;
const SKIP_RE = /(создан|сформир|напечат|generated|printed|created|www\.|fatsecret\.|стр\.|страница|page \d)/i;
const NUM_RE = /^-?\d[\d\s\u00a0\u202f]*([.,]\d+)?$/;

function pdfNum(s: string): number | undefined {
  let x = s.replace(/[\s\u00a0\u202f]/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(x)) x = x.replace(/,/g, ''); // 1,499 (англ.)
  const v = parseFloat(x.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}

function dateCount(t: string): number {
  const low = t.toLowerCase();
  const numeric = (low.match(/\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2}/g) || []).length;
  const words = low.split(/[^a-zа-яё]+/).filter((w) => w in RU_MONTHS || (w.length > 2 && w in EN_MONTHS && w !== 'may')).length;
  return numeric + words;
}

/** Числа строки с x-центром; «52,3 180 1 499» в одном элементе делится на части. */
function lineNums(l: PdfLine): { x: number; v: number }[] {
  const out: { x: number; v: number }[] = [];
  for (const it of l.items) {
    const s = it.str.replace(/(ккал|kcal|г|g)$/i, '').trim();
    if (NUM_RE.test(s) && (!/\s/.test(s) || /^\d{1,3}([\s\u00a0\u202f]\d{3})+([.,]\d+)?$/.test(s))) {
      const v = pdfNum(s);
      if (v != null) out.push({ x: it.x + it.w / 2, v });
      continue;
    }
    const parts = s.split(/\s+/);
    if (parts.length > 1 && parts.every((p) => NUM_RE.test(p))) {
      const step = it.w / parts.length;
      parts.forEach((p, i) => {
        const v = pdfNum(p);
        if (v != null) out.push({ x: it.x + step * (i + 0.5), v });
      });
    }
  }
  return out;
}

function headerCols(l: PdfLine): Partial<Record<Col, number>> | null {
  const cols: Partial<Record<Col, number>> = {};
  for (const it of l.items) {
    const h = it.str.toLowerCase();
    for (const c of Object.keys(COL_KEYS) as Col[]) {
      if (cols[c] != null) continue;
      const [inc, exc] = COL_KEYS[c];
      if (exc.some((x) => h.includes(x))) continue;
      if (inc.some((x) => h.includes(x))) {
        cols[c] = it.x + it.w / 2;
        break;
      }
    }
  }
  return cols.kcal != null && (cols.fat != null || cols.carbs != null || cols.protein != null) ? cols : null;
}

/** Числа строки → столбцы заголовка по ближайшему x. */
function assign(nums: { x: number; v: number }[], cols: Partial<Record<Col, number>>): Partial<Record<Col, number>> {
  const out: Partial<Record<Col, number>> = {};
  const xs = Object.values(cols) as number[];
  const gap = xs.length > 1 ? Math.min(...xs.flatMap((a, i) => xs.slice(i + 1).map((b) => Math.abs(a - b)))) : 60;
  for (const c of Object.keys(cols) as Col[]) {
    let best: { d: number; v: number } | null = null;
    for (const n of nums) {
      const d = Math.abs(n.x - cols[c]!);
      if (d <= Math.max(gap * 0.6, 12) && (!best || d < best.d)) best = { d, v: n.v };
    }
    if (best) out[c] = best.v;
  }
  return out;
}

/**
 * Разбор PDF-отчёта FatSecret по строкам текста. Поддержаны два вида таблицы:
 * строка дня с датой и итогами (как в CSV) и заголовок-дата → приёмы пищи → строка «Всего/Итого».
 * Столбцы находятся по заголовку («Кал», «Жир», «Углев», «Белк» / Calories, Fat, Carbs, Protein)
 * и сопоставляются числам по горизонтали, поэтому лишние столбцы (клетчатка, сахар) не мешают.
 * Сводка за период и итоги приёмов пищи не берутся. Пустой день пропускается.
 */
export function parseFatSecretPdf(lines: PdfLine[]): FatSecretParse {
  let cols: Partial<Record<Col, number>> | null = null;
  let anyHeader = false;
  let cur: ISODate | null = null;
  let inPeriod = false;
  const byDate = new Map<ISODate, Partial<Record<Col, number>>>();
  const blockTotal = new Map<ISODate, Partial<Record<Col, number>>>();
  for (const l of lines) {
    const text = l.items.map((i) => i.str).join(' ').trim();
    const h = headerCols(l);
    if (h && lineNums(l).length < 2) {
      cols = h;
      anyHeader = true;
      continue;
    }
    if (SKIP_RE.test(text)) continue; // колонтитулы: дата печати, номер страницы, сайт
    if (PERIOD_RE.test(text) && !TOTAL_RE.test(text)) {
      inPeriod = true;
      continue;
    }
    if (dateCount(text) >= 2) {
      inPeriod = true; // «01.11.2026 – 16.11.2026» — диапазон отчёта, не день
      continue;
    }
    const d = normDate(text);
    const nums = lineNums(l);
    if (isISODate(d)) {
      // строка «дата + итоги дня» (как в CSV)
      const v = cols ? assign(nums.filter((n) => n.v < 30000), cols) : {};
      if (cols && v.kcal != null && Object.keys(v).length >= 2) {
        if (!byDate.has(d)) byDate.set(d, v);
        cur = null;
      } else cur = d; // заголовок дня
      inPeriod = false;
      continue;
    }
    if (cur && cols && !inPeriod && TOTAL_RE.test(text)) {
      const v = assign(nums, cols);
      if (v.kcal != null) blockTotal.set(cur, v); // последний итог в блоке дня — итог дня
    }
  }
  for (const [d, v] of blockTotal) if (!byDate.has(d)) byDate.set(d, v);
  if (!anyHeader) return { ok: false, error: 'fatsecretNoHeader' };
  if (!byDate.size) return { ok: false, error: 'fatsecretNoDays' };
  const days: FoodDay[] = [];
  let skipped = 0;
  const r1 = (v: number | undefined) => (v == null ? undefined : Math.round(v * 10) / 10);
  for (const d of [...byDate.keys()].sort()) {
    const v = byDate.get(d)!;
    if (!(v.kcal && v.kcal > 0 && v.kcal < 15000)) {
      skipped++;
      continue;
    }
    days.push({ date: d, kcal: Math.round(v.kcal), protein: r1(v.protein), fat: r1(v.fat), carbs: r1(v.carbs) });
  }
  return { ok: true, days, skipped };
}

export interface ImportSummary {
  days: DayMap;
  added: number;
  updated: number;
  skipped: number;
  from?: ISODate;
  to?: ISODate;
}

export function applyFoodDays(cur: DayMap, food: FoodDay[], skipped = 0): ImportSummary {
  const out: DayMap = { ...cur };
  let added = 0;
  let updated = 0;
  for (const f of food) {
    const had = !!(cur[f.date] && (cur[f.date].kcal || cur[f.date].protein));
    // приёмы «по фото» за этот день не теряются: FatSecret + фото (core/photo/meals.ts)
    const inc: DayEntry = { ...withPhotoOnTop(cur[f.date], { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs }), kcalManual: true };
    out[f.date] = { ...mergeEntry(cur[f.date], inc), updatedAt: Date.now() };
    had ? updated++ : added++;
  }
  const ds = food.map((f) => f.date).sort();
  return { days: out, added, updated, skipped, from: ds[0], to: ds[ds.length - 1] };
}


/**
 * История веса из CSV: «дата; вес» в любом из форматов дат (ГГГГ-ММ-ДД, ДД.ММ.ГГГГ, «сентября 30, 2026»),
 * с заголовком или без. Берётся первый столбец, похожий на дату, и столбец «вес/weight»
 * (или первое число 25–350 в строке). Несколько замеров за день — берётся самый ранний (утренний).
 */
export function parseWeightHistory(text: string): { ok: true; points: { date: ISODate; weight: number }[] } | { ok: false; error: ImportError } {
  const rows = parseCSV(text.replace(/^﻿/, ''));
  if (!rows.length) return { ok: false, error: 'fileEmpty' };
  let wIdx = -1;
  let dIdx = -1;
  let start = 0;
  const head = rows[0].map((h) => (h || '').toLowerCase());
  if (head.some((h) => /вес|weight|масса|kg|кг/.test(h)) || head.some((h) => /дата|date|time|время/.test(h))) {
    wIdx = head.findIndex((h) => /вес|weight|масса/.test(h) && !/жир|fat|bmi|имт/.test(h));
    dIdx = head.findIndex((h) => /дата|date|time|время/.test(h));
    start = 1;
  }
  const best = new Map<ISODate, { w: number; t: string }>();
  for (const r of rows.slice(start)) {
    let d: string | undefined;
    let tRaw = '';
    if (dIdx >= 0) {
      d = normDate(r[dIdx] || '');
      tRaw = r[dIdx] || '';
    } else {
      for (const c of r) {
        const x = normDate(c);
        if (isISODate(x)) {
          d = x;
          tRaw = c;
          break;
        }
      }
    }
    if (!d || !isISODate(d)) continue;
    let w: number | undefined;
    if (wIdx >= 0) w = num(r[wIdx]);
    else
      for (let i = 0; i < r.length; i++) {
        if (i === dIdx) continue;
        const c = r[i];
        if (isISODate(normDate(c))) continue;
        const x = num(c);
        if (x && x >= 25 && x <= 350) {
          w = x;
          break;
        }
      }
    if (!(w && w >= 25 && w <= 350)) continue;
    const prev = best.get(d);
    if (!prev || tRaw < prev.t) best.set(d, { w: Math.round(w * 100) / 100, t: tRaw });
  }
  if (!best.size) return { ok: false, error: 'weightNoRows' };
  return {
    ok: true,
    points: [...best.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, weight: v.w })),
  };
}

/** Вес из файла дополняет историю, но не затирает уже введённый за день вес. */
export function applyWeights(cur: DayMap, points: { date: ISODate; weight: number }[]) {
  const out: DayMap = { ...cur };
  let added = 0;
  let kept = 0;
  for (const p of points) {
    if (cur[p.date]?.weight) {
      kept++;
      continue;
    }
    out[p.date] = { ...(cur[p.date] || {}), weight: p.weight, updatedAt: Date.now() };
    added++;
  }
  return { days: out, added, kept };
}

// ---- Резервная копия ----

export const BACKUP_APP = 'balans';

export interface Backup {
  app: typeof BACKUP_APP;
  version: 1;
  exportedAt: string;
  owner: string;
  data: { profile: unknown; days: DayMap; keep: unknown; hand?: unknown; refs?: unknown; photoEdits?: unknown; customFoods?: unknown };
}

export function makeBackup(owner: string, data: Backup['data'], now = new Date()): Backup {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { app: BACKUP_APP, version: 1, exportedAt: stamp, owner, data };
}

export function parseBackup(text: string, owner: string): { ok: true; backup: Backup } | { ok: false; error: ImportError } {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    return { ok: false, error: 'backupUnreadable' };
  }
  if (!j || j.app !== BACKUP_APP || !j.data || typeof j.data.days !== 'object')
    return { ok: false, error: 'backupNotOurs' };
  if (owner && j.owner && j.owner !== owner)
    return { ok: false, error: 'backupOtherAccount' };
  return { ok: true, backup: j as Backup };
}
