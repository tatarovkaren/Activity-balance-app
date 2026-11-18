import { describe, expect, it } from 'vitest';
import { LANG_CODES, LANGS } from '../i18n/core';
import { ru } from '../i18n/ru';

// типов Node в проекте нет — берём fs через process.getBuiltinModule (Node 22+)
type Fs = { existsSync(p: string): boolean; readFileSync(p: string, enc: 'utf8'): string };
const fs = (globalThis as unknown as { process: { getBuiltinModule(n: 'fs'): Fs } }).process.getBuiltinModule('fs');
const ROOT = new URL('../../', import.meta.url).pathname;
const join = (...p: string[]) => p.join('/').replace(/\/+/g, '/');
const gen = fs.readFileSync(join(ROOT, 'src/help/shots.gen.ts'), 'utf8');

describe('Помощь и ЧаВо', () => {
  it('во всех языках те же разделы и столько же вопросов', () => {
    for (const code of LANG_CODES) {
      const h = LANGS[code].dict.help;
      expect(h.guide.map((g) => g.id), code).toEqual(ru.help.guide.map((g) => g.id));
      expect(h.quick.length, code).toBe(ru.help.quick.length);
      expect(h.faq.length, code).toBe(ru.help.faq.length);
      for (const g of h.guide) expect(g.text.length, `${code}: ${g.id}`).toBeGreaterThan(0);
      for (const x of h.faq) expect(x.q && x.a, code).toBeTruthy();
    }
  });
  it('у каждого раздела есть картинка на каждом языке', () => {
    for (const code of LANG_CODES)
      for (const g of ru.help.guide) {
        const rel = `assets/help/${code}/${g.id}.png`;
        expect(fs.existsSync(join(ROOT, rel)), rel).toBe(true);
        expect(gen.includes(`../../${rel}`), 'shots.gen.ts: ' + rel).toBe(true);
      }
  });
  it('жирный текст размечен парами **', () => {
    for (const code of LANG_CODES) {
      const h = LANGS[code].dict.help;
      const all = [h.motto, h.intro, ...h.quick, ...h.guide.flatMap((g) => g.text), ...h.faq.map((x) => x.a), h.more];
      for (const s of all) expect((s.match(/\*\*/g) || []).length % 2, s).toBe(0);
    }
  });
});
