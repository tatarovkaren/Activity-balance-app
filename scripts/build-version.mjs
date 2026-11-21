// Версия и дата выпуска для раздела «О приложении» — один источник.
//   • номер версии — поле "version" в package.json (меняется вручную при выпуске, см. docs/versioning.md);
//     скрипт сам переписывает тот же номер в app.json (expo.version), чтобы они не расходились;
//   • дата выпуска — дата последнего коммита, из которого собрано приложение (по Москве);
//   • сборка — короткий хэш этого коммита.
// Результат — src/about/version.gen.ts (не хранится в git). Скрипт запускается сам
// после npm install / npm ci, перед npm run build:web и npm run web.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src', 'about', 'version.gen.ts');

const git = (cmd) => {
  try {
    return execSync('git ' + cmd, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TZ: 'Europe/Moscow' } })
      .toString()
      .trim();
  } catch {
    return '';
  }
};

/** Дата YYYY-MM-DD по Москве (UTC+3, без перехода на летнее время). */
const moscowDate = (d) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10);

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
if (app.expo.version !== version) {
  app.expo.version = version;
  writeFileSync(join(root, 'app.json'), JSON.stringify(app, null, 2) + '\n');
}

const commitIso = git('log -1 --format=%cI');
const date = commitIso ? moscowDate(new Date(commitIso)) : moscowDate(new Date());
const build = (process.env.VERCEL_GIT_COMMIT_SHA || git('rev-parse HEAD')).slice(0, 7);

writeFileSync(
  OUT,
  '// Сгенерировано scripts/build-version.mjs — не редактировать и не добавлять в git.\n' +
    `export const APP_VERSION = ${JSON.stringify(version)};\n` +
    `export const RELEASE_DATE = ${JSON.stringify(date)};\n` +
    `export const BUILD = ${JSON.stringify(build)};\n`,
);
console.log(`Activity Balance ${version} от ${date}${build ? ' (' + build + ')' : ''}`);
