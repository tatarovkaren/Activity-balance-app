// Текст сообщения в Telegram-группу тестеров о новой версии.
// Берёт верхнюю запись «Что нового» (src/about/changelog.ts) — те же слова, что видит пользователь
// в Профиль → «О приложении». Отправляет scripts/release-notify.mjs из GitHub Actions
// (.github/workflows/release-notify.yml), инструкция — docs/release-notify.md.
// Без импортов (кроме типов): файл запускается напрямую через node --experimental-strip-types.

import type { ChangelogEntry } from './changelog';

export const SITE_URL = 'https://activity-balance-app.vercel.app/';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const items = (entry: ChangelogEntry) => entry.ru.map((p) => '• ' + esc(p)).join('\n');

const footer = (siteUrl: string) => [
  `Открыть: ${esc(siteUrl)}`,
  'Если видите старую версию — обновите страницу через пару минут.',
  'Ошибки и идеи пишите сюда, в группу (или Профиль → «Обратная связь»).',
];

/** Сообщение в разметке HTML для Telegram Bot API (parse_mode: 'HTML'). */
export function releaseMessage(entry: ChangelogEntry, siteUrl: string = SITE_URL): string {
  return [`🆕 <b>Activity Balance ${esc(entry.v)}</b>`, '', 'Что нового:', items(entry), '', ...footer(siteUrl)].join('\n');
}

/** Сводка нескольких последних версий (новые сверху) — для ручной рассылки «последние N изменений». */
export function releaseDigest(entries: ChangelogEntry[], siteUrl: string = SITE_URL): string {
  if (entries.length === 1) return releaseMessage(entries[0], siteUrl);
  const blocks = entries.map((e) => `<b>${esc(e.v)}</b>\n${items(e)}`);
  return [
    `🆕 <b>Activity Balance ${esc(entries[0].v)}</b>: последние изменения`,
    '',
    blocks.join('\n\n'),
    '',
    ...footer(siteUrl),
  ].join('\n');
}
