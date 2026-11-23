// Цветовые палитры без React: их берут и экраны (через theme.tsx), и отчёт картинкой, и тесты.

export interface Palette {
  dark: boolean;
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  muted: string;
  line: string;
  input: string;
  blue: string;
  green: string;
  amber: string;
  red: string;
  teal: string;
  violet: string;
  onAccent: string;
  /** «В процессе» (день идёт): синий; в палитре для дальтоников — серый, чтобы не путать с «в цели». */
  progress: string;
  /** «Рядом / жёлтый» в оценке дня: янтарный; в палитре для дальтоников — жёлтый, чтобы не путать с оранжевым. */
  warn: string;
  /** Палитра для дальтоников включена. */
  cb?: boolean;
}

export const DARK: Palette = {
  dark: true,
  bg: '#080B10',
  card: '#111820',
  cardBorder: 'rgba(255,255,255,0.08)',
  text: '#ECF2F7',
  muted: '#8A9CAD',
  line: 'rgba(255,255,255,0.08)',
  input: '#0B1118',
  blue: '#4FA8E8',
  green: '#3ECF7E',
  amber: '#F0A93B',
  red: '#EF5D6F',
  teal: '#3ED9D1',
  violet: '#8B7CF0',
  onAccent: '#080B10',
  progress: '#4FA8E8',
  warn: '#F0A93B',
};

export const LIGHT: Palette = {
  dark: false,
  bg: '#F3F5F8',
  card: '#FFFFFF',
  cardBorder: 'rgba(17,24,32,0.08)',
  text: '#111820',
  muted: '#5B6B7B',
  line: 'rgba(17,24,32,0.08)',
  input: '#F3F5F8',
  blue: '#1F7BC4',
  green: '#1C9455',
  amber: '#B8720B',
  red: '#D23A4E',
  teal: '#12918B',
  violet: '#6252D1',
  onAccent: '#FFFFFF',
  progress: '#1F7BC4',
  warn: '#B8720B',
};

/**
 * Для дальтоников: зелёный → синий, красный → оранжевый, жёлтый светлее. Пара синий/оранжевый различима
 * при всех частых видах дальтонизма; значки и слова остаются.
 */
export function colorblind(p: Palette): Palette {
  return p.dark
    ? { ...p, green: '#4FA8E8', red: '#F28C28', warn: '#E3CF4A', progress: '#A7B4C2', cb: true }
    : { ...p, green: '#1F6FB8', red: '#C75F00', warn: '#857200', progress: '#6B7A89', cb: true };
}
