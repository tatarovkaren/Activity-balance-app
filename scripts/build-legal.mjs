// Собирает тексты юридических документов из docs/legal/<язык>/<документ>.md
// в src/legal/texts.gen.ts, чтобы приложение показывало их без сети.
// Запуск: npm run legal. Тест src/legal/legal.test.ts проверяет, что сборка не устарела.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'docs', 'legal');
export const OUT = join(root, 'src', 'legal', 'texts.gen.ts');

export function buildLegal() {
  const langs = readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const out = {};
  for (const lang of langs) {
    out[lang] = {};
    for (const f of readdirSync(join(src, lang)).filter((x) => x.endsWith('.md')).sort()) {
      out[lang][f.replace(/\.md$/, '')] = readFileSync(join(src, lang, f), 'utf8').replace(/\r\n/g, '\n');
    }
  }
  return (
    '// Сгенерировано scripts/build-legal.mjs из docs/legal — не редактировать вручную, запустите npm run legal.\n' +
    `export const LEGAL_TEXTS = ${JSON.stringify(out, null, 2)} as const;\n`
  );
}

/** true, если src/legal/texts.gen.ts совпадает с тем, что соберётся сейчас. */
export const isUpToDate = () => readFileSync(OUT, 'utf8') === buildLegal();

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUT, buildLegal());
  console.log('legal texts →', OUT);
}
