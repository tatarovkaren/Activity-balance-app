// Публикация поста из очереди channel/posts/ в информационный Telegram-канал (см. docs/channel.md).
//   node --experimental-strip-types scripts/channel-post.mjs          — показать очередь и что ушло бы сейчас
//   node --experimental-strip-types scripts/channel-post.mjs --send   — отправить один созревший пост
// Для --send нужны CHANNEL_BOT_TOKEN и CHANNEL_CHAT_ID (секреты GitHub). Отправленный пост
// записывается в channel/published.json — workflow коммитит этот файл обратно в main.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost, pickPost, validatePost } from '../src/channel/posts.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'channel', 'posts');
const pubFile = join(root, 'channel', 'published.json');

const posts = readdirSync(dir)
  .filter((f) => f.endsWith('.md'))
  .map((f) => parsePost(f.slice(0, -3), readFileSync(join(dir, f), 'utf8')));
const bad = posts.map((p) => [p.id, validatePost(p)]).filter(([, e]) => e.length);
if (bad.length) {
  for (const [id, e] of bad) console.error(`${id}: ${e.join('; ')}`);
  process.exit(1);
}

const published = JSON.parse(readFileSync(pubFile, 'utf8'));
const now = new Date();
const fmt = (d) => d.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', dateStyle: 'short', timeStyle: 'short' });

console.log('Очередь (время МСК):');
for (const p of [...posts].sort((a, b) => a.publishAt - b.publishAt))
  console.log(`  ${published[p.id] ? '✓' : '·'} ${fmt(p.publishAt)}  ${p.id}`);

const { next, stale } = pickPost(posts, published, now);
for (const p of stale)
  console.log(`::warning::Пост ${p.id} просрочен больше чем на 3 дня (${fmt(p.publishAt)}) и не отправлен — поставьте новую дату publish_at.`);
if (!next) {
  console.log('\nСейчас отправлять нечего.');
  process.exit(0);
}
console.log(`\nК отправке: ${next.id}\n\n${next.text}\n`);

if (process.argv.includes('--send')) {
  const token = process.env.CHANNEL_BOT_TOKEN;
  const chatId = process.env.CHANNEL_CHAT_ID;
  if (!token || !chatId) {
    console.error('Нет секретов CHANNEL_BOT_TOKEN / CHANNEL_CHAT_ID — пост не отправлен.');
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: next.text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error(`Telegram ответил ошибкой: ${res.status} ${body.description ?? ''}`);
    process.exit(1);
  }
  published[next.id] = { at: now.toISOString(), messageId: body.result?.message_id };
  writeFileSync(pubFile, JSON.stringify(published, null, 2) + '\n');
  console.log('Отправлено в канал.');
}
