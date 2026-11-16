// Языки интерфейса без привязки к React (тестируется в vitest). Как добавить язык — docs/i18n.md:
// 1) код в Lang (src/core/types.ts); 2) словарь src/i18n/<код>.ts с типом Dict; 3) строка в LANGS ниже.

import type { Lang, LangPref } from '../core/types';
import { en } from './en';
import { makeFmt, type Fmt } from './format';
import { ru, type Dict } from './ru';

export type { Dict };
export type { Fmt };

/** Зарегистрированные языки. name — самоназвание (показывается в переключателе на любом языке). */
export const LANGS: Record<Lang, { name: string; dict: Dict }> = {
  ru: { name: 'Русский', dict: ru },
  en: { name: 'English', dict: en },
};

export const LANG_CODES = Object.keys(LANGS) as Lang[];

/**
 * Если язык системы не поддержан: для этих языков (страны СНГ) понятнее русский, для остальных — английский.
 */
const FALLBACK_RU = ['be', 'kk', 'ky', 'uz', 'tg', 'tk', 'hy', 'az'];
export const DEFAULT_LANG: Lang = 'en';

/** Языки системы по порядку предпочтения: браузер (navigator.languages) или Intl на телефоне. */
export function systemLocales(): string[] {
  const out: string[] = [];
  try {
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages)) out.push(...navigator.languages);
      if (navigator.language) out.push(navigator.language);
    }
  } catch {
    /* ignore */
  }
  try {
    const l = Intl.DateTimeFormat().resolvedOptions().locale;
    if (l) out.push(l);
  } catch {
    /* Intl недоступен */
  }
  return out;
}

/** «Как в системе» → первый поддержанный язык системы; иначе русский для СНГ, иначе английский. */
export function resolveLang(pref: LangPref | undefined, locales: string[] = systemLocales()): Lang {
  if (pref && pref !== 'system' && pref in LANGS) return pref;
  const bases = locales.map((l) => l.toLowerCase().split(/[-_]/)[0]);
  const hit = bases.find((b) => b in LANGS);
  if (hit) return hit as Lang;
  if (bases.some((b) => FALLBACK_RU.includes(b))) return 'ru';
  return DEFAULT_LANG;
}

export interface I18n {
  lang: Lang;
  /** Словарь выбранного языка. */
  tx: Dict;
  /** Форматирование чисел и дат по языку. */
  f: Fmt;
}

const cache: Partial<Record<Lang, I18n>> = {};
export function i18nFor(lang: Lang): I18n {
  return (cache[lang] ||= { lang, tx: LANGS[lang].dict, f: makeFmt(LANGS[lang].dict.fmt) });
}

/** Название продукта справочника на языке интерфейса (если перевода нет — русское). */
export function foodName(i: I18n, id: string): string {
  return i.tx.foods[id] || ru.foods[id] || id;
}

/** Текст ошибки: код из словаря errors.*, иначе исходное сообщение (например, от сервера). */
export function errorText(i: I18n, e: unknown): string {
  const err = (typeof e === 'string' ? { code: e } : e) as { code?: string; status?: number; message?: string };
  const code = err?.code || err?.message;
  const m = code ? (i.tx.errors as Record<string, unknown>)[code] : undefined;
  if (typeof m === 'function') return (m as (s: number) => string)(err.status ?? 0);
  if (typeof m === 'string') return m;
  return err?.message || String(e);
}

