// Юридические документы: список, тексты на языке интерфейса, простой разбор Markdown для показа.

import type { Lang } from '../core/types';
import { fillLegal, LEGAL_VERSION } from './operator';
import { LEGAL_TEXTS } from './texts.gen';

export { LEGAL_DRAFT, LEGAL_VERSION } from './operator';

/** terms — условия, privacy — политика, consent — согласие на обработку ПДн, marketing — рассылки (необязательно). */
export type LegalDoc = 'terms' | 'privacy' | 'consent' | 'marketing';
export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy', 'consent', 'marketing'];
/** Без этих трёх галочек войти нельзя. */
export const REQUIRED_DOCS: LegalDoc[] = ['terms', 'privacy', 'consent'];

const DMY: Record<Lang, (iso: string) => string> = {
  ru: (iso) => iso.split('-').reverse().join('.'),
  en: (iso) => iso,
};

export function legalText(doc: LegalDoc, lang: Lang): string {
  const texts = LEGAL_TEXTS as unknown as Record<string, Record<string, string>>;
  const raw = texts[lang]?.[doc] ?? texts.ru[doc];
  return fillLegal(raw, lang, DMY[lang](LEGAL_VERSION));
}

export type LegalBlock =
  | { kind: 'h1' | 'h2' | 'p'; text: string }
  | { kind: 'li'; text: string };

/** Разбор подмножества Markdown: заголовки #/##, пункты «- », абзацы. **жирный** остаётся в тексте и выделяется при показе. */
export function parseLegal(md: string): LegalBlock[] {
  const out: LegalBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join('\n') });
    para = [];
  };
  for (const line of md.split('\n')) {
    const l = line.trimEnd();
    if (!l.trim()) flush();
    else if (l.startsWith('## ')) (flush(), out.push({ kind: 'h2', text: l.slice(3) }));
    else if (l.startsWith('# ')) (flush(), out.push({ kind: 'h1', text: l.slice(2) }));
    else if (l.startsWith('- ')) (flush(), out.push({ kind: 'li', text: l.slice(2) }));
    else para.push(l);
  }
  flush();
  return out;
}

/** Делит строку на куски по **…**: нечётные куски — жирные. */
export const boldParts = (s: string) => s.split('**');
