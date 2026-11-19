// Без react-native: чтобы проверялось в тестах.
const BUNDLE_RE = /_expo\/static\/js\/web\/index-[a-f0-9]+\.js/;

/** Имя бандла веб-сборки (index-<хэш>.js) из index.html или адреса скрипта; нет — null. */
export function bundleName(html: string): string | null {
  const m = html.match(BUNDLE_RE);
  return m ? m[0] : null;
}
