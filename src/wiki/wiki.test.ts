import { describe, expect, it } from 'vitest';
import { LANG_CODES, LANGS } from '../i18n/core';
import { WIKI_REFS, WIKI_SECTIONS, refById } from './refs';

describe('Wiki: баланс энергии', () => {
  it('у источников корректные id, DOI и PMID', () => {
    const ids = WIKI_REFS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of WIKI_REFS) {
      expect(r.doi, r.id).toMatch(/^10\.\d{4,9}\/\S+$/);
      expect(r.pmid, r.id).toMatch(/^\d{6,9}$/);
      expect(r.nAuthors, r.id).toBeGreaterThanOrEqual(r.authors.length);
      expect(r.year, r.id).toBeGreaterThan(1990);
    }
  });
  it('каждый источник ровно в одном разделе', () => {
    const inSections = WIKI_SECTIONS.flatMap((s) => s.refs);
    expect(inSections.slice().sort()).toEqual(WIKI_REFS.map((r) => r.id).sort());
    for (const id of inSections) expect(refById(id), id).toBeTruthy();
  });
  it('во всех языках есть тексты каждого раздела и источника', () => {
    for (const code of LANG_CODES) {
      const W = LANGS[code].dict.wiki;
      for (const s of WIKI_SECTIONS) expect(W.sections[s.id as keyof typeof W.sections]?.title, `${code}: ${s.id}`).toBeTruthy();
      for (const r of WIKI_REFS) {
        const it = W.items[r.id as keyof typeof W.items];
        expect(it?.summary.length, `${code}: ${r.id}`).toBeGreaterThan(0);
        expect(W.kinds[r.kind], `${code}: ${r.kind}`).toBeTruthy();
      }
      expect(Object.keys(W.items).sort(), code).toEqual(WIKI_REFS.map((r) => r.id).sort());
      expect(W.conclusions.length, code).toBe(LANGS.ru.dict.wiki.conclusions.length);
    }
  });
  it('жирный текст размечен парами **', () => {
    for (const code of LANG_CODES) {
      const W = LANGS[code].dict.wiki;
      const all = [W.intro, ...Object.values(W.items).flatMap((x) => [...x.summary, x.limits, x.inApp]), ...W.conclusions.map((c) => c.text)];
      for (const s of all) expect((s.match(/\*\*/g) || []).length % 2, s).toBe(0);
    }
  });
});
