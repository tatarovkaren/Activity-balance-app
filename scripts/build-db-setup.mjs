// Собирает все миграции из supabase/migrations в один файл supabase/setup.sql —
// его целиком вставляют в SQL Editor нового проекта Supabase (см. docs/supabase-setup.md).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const head = [
  '-- Activity Balance: вся схема базы одним файлом. Собрано командой `npm run db:setup` из supabase/migrations.',
  '-- Выполняется один раз в новом проекте Supabase: SQL Editor → New query → вставить всё → Run.',
  '-- Не править руками: меняйте миграции и пересоберите.',
  '',
].join('\n');
const body = files.map((f) => `-- ======== ${f} ========\n\n` + readFileSync(join(dir, f), 'utf8').trim() + '\n').join('\n');
writeFileSync('supabase/setup.sql', head + '\n' + body);
console.log('supabase/setup.sql: ' + files.join(', '));
