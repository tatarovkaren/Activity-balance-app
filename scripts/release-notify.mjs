// Сообщение тестерам в Telegram о новой версии (см. docs/release-notify.md).
//   node --experimental-strip-types scripts/release-notify.mjs            — только показать текст
//   node --experimental-strip-types scripts/release-notify.mjs --send     — отправить в группу
//   … --count 6                                                          — последние 6 версий одним сообщением
// Для --send нужны переменные окружения TESTERS_BOT_TOKEN и TESTERS_CHAT_ID (секреты GitHub).
// Номер версии в package.json и верхняя запись changelog обязаны совпадать — иначе ничего не шлём.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGELOG } from '../src/about/changelog.ts';
import { releaseDigest } from '../src/about/releaseMessage.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const top = CHANGELOG[0];

if (top.v !== version) {
  console.error(`Версия ${version} в package.json, а верхняя запись «Что нового» — ${top.v}. Сообщение не отправлено.`);
  process.exit(1);
}

const i = process.argv.indexOf('--count');
const count = i > 0 ? Math.max(1, Math.min(20, parseInt(process.argv[i + 1], 10) || 1)) : 1;
const text = releaseDigest(CHANGELOG.slice(0, count));
console.log(text);

if (process.argv.includes('--send')) {
  const token = process.env.TESTERS_BOT_TOKEN;
  const chatId = process.env.TESTERS_CHAT_ID;
  if (!token || !chatId) {
    console.error('Нет секретов TESTERS_BOT_TOKEN / TESTERS_CHAT_ID — сообщение не отправлено.');
    process.exit(1);
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error(`Telegram ответил ошибкой: ${res.status} ${body.description ?? ''}`);
    process.exit(1);
  }
  console.log('\nОтправлено в группу.');
}
