// Очередь постов информационного Telegram-канала (см. docs/channel.md).
// Пост — файл channel/posts/<имя>.md: шапка с publish_at и текст в HTML-разметке Telegram.
// Здесь только чистая логика (разбор, проверка, выбор поста к отправке) — без файлов и сети.

export type ChannelPost = {
  /** Имя файла без .md — по нему пост отмечается отправленным. */
  id: string;
  publishAt: Date;
  text: string;
};

export type Published = Record<string, { at: string; messageId?: number }>;

/** Рубрики канала: в каждом посте должен быть хотя бы один из этих хештегов. */
export const RUBRICS = ['#наука', '#мифилифакт', '#каксчитать', '#приложение'];
/** Рубрики, где обязательна строка «Источник…» со ссылкой. */
export const SOURCED = ['#наука', '#мифилифакт', '#каксчитать'];

export const TELEGRAM_LIMIT = 4096;
/** Пост можно отправить чуть раньше времени: запуск по расписанию — раз в день около 9:00 МСК. */
export const EARLY_MS = 60 * 60 * 1000;
/** Пост, просроченный больше чем на 3 дня, не отправляем: дату надо поставить заново. */
export const STALE_MS = 3 * 24 * 60 * 60 * 1000;

const ALLOWED_TAGS = ['b', 'i', 'u', 's', 'a', 'code', 'blockquote'];

export function parsePost(id: string, raw: string): ChannelPost {
  const m = raw.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${id}: нет шапки --- publish_at: … ---`);
  const at = m[1].match(/^publish_at:\s*(\S+)\s*$/m);
  if (!at) throw new Error(`${id}: в шапке нет publish_at`);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?([+-]\d\d:\d\d|Z)$/.test(at[1]))
    throw new Error(`${id}: publish_at должен быть вида 2026-11-25T09:00+03:00 (с часовым поясом)`);
  const publishAt = new Date(at[1]);
  if (Number.isNaN(publishAt.getTime())) throw new Error(`${id}: неверная дата ${at[1]}`);
  return { id, publishAt, text: m[2].trim() };
}

/** Текст так, как его увидит читатель (без тегов, с раскрытыми &amp; и т. п.). */
export function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Ошибки поста; пустой список — всё хорошо. */
export function validatePost(p: ChannelPost): string[] {
  const errs: string[] = [];
  const t = p.text;
  if (!t) errs.push('пустой текст');
  if (visibleText(t).length > TELEGRAM_LIMIT) errs.push(`длиннее ${TELEGRAM_LIMIT} символов`);

  // Разметка: только теги, которые понимает Telegram, и все закрыты по порядку.
  const stack: string[] = [];
  for (const m of t.matchAll(/<(\/?)([a-z]+)([^>]*)>/g)) {
    const [, close, tag, attrs] = m;
    if (!ALLOWED_TAGS.includes(tag)) {
      errs.push(`тег <${tag}> Telegram не поддерживает`);
      continue;
    }
    if (close) {
      if (stack.pop() !== tag) errs.push(`тег </${tag}> закрыт не по порядку`);
    } else {
      if (tag === 'a' && !/^\s+href="https?:\/\/[^"]+"$/.test(attrs)) errs.push('у ссылки <a> нет href="https://…"');
      stack.push(tag);
    }
  }
  if (stack.length) errs.push(`не закрыты теги: ${stack.join(', ')}`);
  const bare = t.replace(/<\/?[a-z]+[^>]*>/g, '');
  if (/</.test(bare) || />/.test(bare)) errs.push('символы < и > в тексте пишите как &lt; и &gt;');
  if (/&(?!(lt|gt|amp|quot);)/.test(bare)) errs.push('символ & в тексте пишите как &amp;');

  const tags = RUBRICS.filter((r) => t.includes(r));
  if (!tags.length) errs.push(`нет хештега рубрики (${RUBRICS.join(', ')})`);
  if (tags.some((r) => SOURCED.includes(r)) && !/Источник/.test(t)) errs.push('нет строки «Источник:» / «Источники:»');
  return errs;
}

/**
 * Что делать с очередью сейчас: какой пост отправить (не больше одного за запуск, самый ранний)
 * и какие пропущены, потому что просрочены больше чем на 3 дня.
 */
export function pickPost(posts: ChannelPost[], published: Published, now: Date): { next?: ChannelPost; stale: ChannelPost[] } {
  const waiting = posts
    .filter((p) => !published[p.id])
    .filter((p) => p.publishAt.getTime() - EARLY_MS <= now.getTime())
    .sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
  const stale = waiting.filter((p) => now.getTime() - p.publishAt.getTime() > STALE_MS);
  const next = waiting.find((p) => !stale.includes(p));
  return { next, stale };
}
