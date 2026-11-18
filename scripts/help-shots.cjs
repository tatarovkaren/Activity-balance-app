#!/usr/bin/env node
// Скриншоты для раздела «Помощь и ЧаВо»: демо-режим, светлая тема, ширина телефона 390 px.
// Пишет assets/help/<язык>/<id>.png и src/help/shots.gen.ts (размеры картинок для вёрстки).
//
//   npm run build:web            # или EXPO_OFFLINE=1 npx expo export -p web
//   npm run help:shots           # сам поднимет dist/ на localhost; нужен playwright
//
// Переснимать после изменения экранов. id картинок = id разделов в src/i18n/help.*.ts.

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'assets', 'help');
const GEN = path.join(ROOT, 'src', 'help', 'shots.gen.ts');
const LANGS = { ru: 'ru-RU', en: 'en-US' };
const W = 390;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.css': 'text/css', '.ttf': 'font/ttf' };
function serve() {
  return new Promise((ok) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(DIST, p);
      if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => ok(srv));
  });
}

/** Прямоугольник карточки, в которой лежит элемент (ближайший предок со скруглением шириной почти во весь экран). */
const CARD_BOX = `(el) => {
  for (let n = el; n; n = n.parentElement) {
    const cs = getComputedStyle(n), r = n.getBoundingClientRect();
    if (parseFloat(cs.borderTopLeftRadius) > 0 && r.width >= ${W - 40}) return { top: r.top + scrollY, bottom: r.bottom + scrollY };
  }
  const r = el.getBoundingClientRect();
  return { top: r.top + scrollY, bottom: r.bottom + scrollY };
}`;
/** Нижний край последней карточки экрана, которая целиком помещается выше limit. */
const CARDS_UNTIL = `(limit) => {
  let best = 0;
  for (const n of document.querySelectorAll('div')) {
    const cs = getComputedStyle(n), r = n.getBoundingClientRect();
    if (parseFloat(cs.borderTopLeftRadius) > 0 && r.width >= ${W - 40} && r.bottom + scrollY <= limit) best = Math.max(best, r.bottom + scrollY);
  }
  return best;
}`;

async function main() {
  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch {
    console.error('Нужен playwright: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('Нет dist/ — сначала npm run build:web');
    process.exit(1);
  }
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const sizes = {};

  for (const [lang, locale] of Object.entries(LANGS)) {
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    sizes[lang] = {};
    const ctx = await browser.newContext({ viewport: { width: W, height: 3600 }, deviceScaleFactor: 2, locale, colorScheme: 'light' });
    const p = await ctx.newPage();
    const card = async (sel) => p.locator(`[data-testid=${sel}]`).first().evaluate(new Function('return ' + CARD_BOX)());
    const top = async (sel) => p.locator(`[data-testid=${sel}]`).first().evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const bottom = async (sel) => p.locator(`[data-testid=${sel}]`).first().evaluate((el) => el.getBoundingClientRect().bottom + scrollY);
    const shot = async (id, y0, y1) => {
      const y = Math.max(0, Math.floor(y0) - 8);
      const h = Math.ceil(y1) + 8 - y;
      await p.screenshot({ path: path.join(dir, id + '.png'), clip: { x: 0, y, width: W, height: h } });
      sizes[lang][id] = [W * 2, h * 2];
      console.log(lang, id, W + '×' + h);
    };
    const screen = async (tab, limit) => {
      await p.click(`[data-testid=tab-${tab}]`);
      await p.waitForTimeout(400);
      return p.evaluate(new Function('return ' + CARDS_UNTIL)(), limit);
    };

    await p.goto(url);
    await p.waitForSelector('[data-testid=startDemo]');
    await p.waitForTimeout(300);
    await shot('start', 0, await bottom('startCurator'));
    for (const d of ['terms', 'privacy', 'consent']) await p.click(`[data-testid=consent-${d}]`);
    await p.click('[data-testid=startDemo]');
    await p.waitForSelector('[data-testid=tab-day]');
    await p.waitForTimeout(400);

    // День
    await shot('day', 0, (await card('kcal')).bottom);
    await shot('workout', (await card('workoutType')).top, (await card('openFact')).bottom);
    await shot('comment', (await card('comment')).top, await bottom('sendReport'));
    // Расход, графики, фото — верх экрана целыми карточками
    await shot('fact', 0, await screen('fact', 980));
    await shot('charts', 0, await screen('charts', 900));
    await p.click('[data-testid=tab-photo]');
    await p.waitForTimeout(300);
    if (await p.locator('[data-testid=photoConsent]').count()) await p.click('[data-testid=photoConsent]');
    await shot('photo', 0, await screen('photo', 900));
    // Профиль
    await screen('profile', 0);
    await shot('profile', (await card('sex')).top, (await card('sex')).bottom);
    await shot('goal', (await card('goalMode')).top, (await card('goalMode')).bottom);
    await shot('import', (await card('importWeights')).top, (await card('importWeights')).bottom);
    await shot('curator', (await card('curatorCode')).top, (await card('curatorCode')).bottom);
    await shot('settings', (await card('lang')).top, (await card('theme')).bottom);
    await ctx.close();
  }
  await browser.close();
  srv.close();

  // Сжать до палитры, если есть Pillow (картинки в 3–4 раза легче, текст не мылится)
  try {
    require('child_process').execFileSync('python3', ['-I', '-c', `
import sys, glob
from PIL import Image
for f in glob.glob(sys.argv[1] + '/*/*.png'):
    Image.open(f).convert('RGB').quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(f, optimize=True)
`, OUT]);
  } catch {
    console.warn('Pillow не найден — картинки не сжаты');
  }

  const ids = Object.keys(sizes.ru);
  const lines = [
    '// Сгенерировано scripts/help-shots.cjs — не править руками.',
    "import type { ImageSourcePropType } from 'react-native';",
    '',
    'export interface HelpShot { src: ImageSourcePropType; w: number; h: number }',
    '',
    'export const HELP_SHOTS: Record<string, Record<string, HelpShot>> = {',
    ...Object.entries(sizes).flatMap(([lang, m]) => [
      `  ${lang}: {`,
      ...ids.map((id) => `    ${id}: { src: require('../../assets/help/${lang}/${id}.png'), w: ${m[id][0]}, h: ${m[id][1]} },`),
      '  },',
    ]),
    '};',
    '',
  ];
  fs.mkdirSync(path.dirname(GEN), { recursive: true });
  fs.writeFileSync(GEN, lines.join('\n'));
  console.log('→', path.relative(ROOT, GEN));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
