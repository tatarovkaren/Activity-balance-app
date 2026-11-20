// Общий расчёт приложения (src/core) для серверных функций: склеивает нужные модули в один файл
// supabase/functions/<имя>/core.gen.ts, чтобы сервер считал тренд, «расход по факту» и прогноз цели
// ровно так же, как приложение. Запускается из `npm run fn:bundle`; файл не править руками
// (тест src/core/notify-bot.test.ts проверяет, что он не отстал от src/core).
import { readFileSync } from 'node:fs';

/** Порядок важен: каждый модуль видит объявления предыдущих. */
export const CORE_FILES = ['dates.ts', 'types.ts', 'body.ts', 'energy.ts', 'adaptive.ts'];

export function buildCore(root = '.') {
  const parts = CORE_FILES.map((f) => {
    let src = readFileSync(`${root}/src/core/${f}`, 'utf8');
    // локальные импорты не нужны: всё в одном файле (многострочные тоже)
    src = src.replace(/^import [\s\S]*?from '\.{1,2}\/[^']+';\n/gm, '');
    return `// ======== src/core/${f} ========\n${src.trim()}\n`;
  });
  const head =
    '// СОБРАНО АВТОМАТИЧЕСКИ из src/core командой `npm run fn:bundle`. Не править руками.\n' +
    '// Типы, которые серверу не нужны, заменены заглушками.\n' +
    'type GoalSetting = any;\ntype NotifyPrefs = any;\n\n';
  return head + parts.join('\n');
}
