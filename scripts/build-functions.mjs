// Собирает серверную функцию в один файл для вставки в редактор Supabase (Edge Functions → Via Editor),
// когда нет Supabase CLI: supabase/functions/<имя>/*.ts → supabase/dashboard/<имя>.ts.
// Локальные import './x.ts' склеиваются, внешние (npm:…) остаются. Не править результат руками.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildCore } from './fn-core.mjs';

// общий расчёт приложения для сводки за неделю (src/core → core.gen.ts)
writeFileSync('supabase/functions/notify/core.gen.ts', buildCore());
console.log('supabase/functions/notify/core.gen.ts');

const FUNCS = { notify: ['core.gen.ts', 'webpush.ts', 'logic.ts', 'bot.ts', 'index.ts'] };
mkdirSync('supabase/dashboard', { recursive: true });
for (const [name, files] of Object.entries(FUNCS)) {
  const parts = files.map((f) => {
    const src = readFileSync(join('supabase/functions', name, f), 'utf8')
      .replace(/^import (?:type )?\{[^}]*\} from '\.\/[\w.-]+\.ts';\n/gm, '')
      .replace(/^export (?=(async |const |function |interface |type |let |class ))/gm, '');
    return `// ======== ${f} ========\n${src.trim()}\n`;
  });
  const head = `// Функция «${name}» одним файлом. Собрано командой \`npm run fn:bundle\` из supabase/functions/${name}/.\n// Supabase → Edge Functions → Deploy a new function → Via Editor → имя «${name}» → вставить весь файл.\n\n`;
  writeFileSync(join('supabase/dashboard', name + '.ts'), head + parts.join('\n'));
  console.log(`supabase/dashboard/${name}.ts`);
}
