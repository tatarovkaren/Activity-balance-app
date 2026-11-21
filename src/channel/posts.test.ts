import { describe, expect, it } from 'vitest';
import { parsePost, pickPost, validatePost, type ChannelPost } from './posts';

// типов Node в проекте нет — берём fs через process.getBuiltinModule (Node 22+), как в help.test.ts
type Fs = { readdirSync(p: string): string[]; readFileSync(p: string, enc: 'utf8'): string };
const fs = (globalThis as unknown as { process: { getBuiltinModule(n: 'fs'): Fs } }).process.getBuiltinModule('fs');
const dir = new URL('../../channel/posts/', import.meta.url).pathname;
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));

describe('посты канала в очереди', () => {
  it('очередь не пустая', () => expect(files.length).toBeGreaterThan(0));

  for (const f of files) {
    it(`${f}: разметка, длина, рубрика и источник в порядке`, () => {
      const p = parsePost(f.slice(0, -3), fs.readFileSync(dir + f, 'utf8'));
      expect(validatePost(p)).toEqual([]);
    });
  }

  it('published.json — объект с отметками', () => {
    const pub = JSON.parse(fs.readFileSync(dir + '../published.json', 'utf8'));
    expect(typeof pub).toBe('object');
    expect(Array.isArray(pub)).toBe(false);
  });
});

describe('проверка поста', () => {
  const post = (text: string): ChannelPost => ({ id: 'x', publishAt: new Date(), text });
  it('ловит неподдерживаемые теги, незакрытые теги и голый &', () => {
    expect(validatePost(post('<p>a</p> #приложение'))).toContain('тег <p> Telegram не поддерживает');
    expect(validatePost(post('<b>a #приложение'))).toContain('не закрыты теги: b');
    expect(validatePost(post('Hall & Guo #приложение'))).toContain('символ & в тексте пишите как &amp;');
  });
  it('требует рубрику и источник для научных рубрик', () => {
    expect(validatePost(post('текст'))[0]).toMatch(/нет хештега рубрики/);
    expect(validatePost(post('текст #наука'))).toContain('нет строки «Источник:» / «Источники:»');
    expect(validatePost(post('новая версия #приложение'))).toEqual([]);
  });
  it('шапка без часового пояса — ошибка', () => {
    expect(() => parsePost('x', '---\npublish_at: 2026-11-25T09:00\n---\nтекст')).toThrow(/часовым поясом/);
  });
});

describe('выбор поста к отправке', () => {
  const at = (iso: string, id: string): ChannelPost => ({ id, publishAt: new Date(iso), text: '' });
  const posts = [at('2026-11-25T09:00+03:00', 'b'), at('2026-11-23T09:00+03:00', 'a'), at('2026-11-27T09:00+03:00', 'c')];

  it('один самый ранний созревший, отправленные пропускает', () => {
    const now = new Date('2026-11-25T06:05Z');
    expect(pickPost(posts, {}, now).next?.id).toBe('a');
    expect(pickPost(posts, { a: { at: '' } }, now).next?.id).toBe('b');
    expect(pickPost(posts, { a: { at: '' }, b: { at: '' } }, now).next).toBeUndefined();
  });
  it('запуск чуть раньше 9:00 МСК пост уже берёт', () => {
    expect(pickPost(posts, { a: { at: '' } }, new Date('2026-11-25T05:30Z')).next?.id).toBe('b');
  });
  it('просроченный больше чем на 3 дня не шлёт', () => {
    const r = pickPost(posts, {}, new Date('2026-11-27T06:00Z'));
    expect(r.stale.map((p) => p.id)).toEqual(['a']);
    expect(r.next?.id).toBe('b');
  });
});
