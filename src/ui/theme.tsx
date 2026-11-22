// Тема через цветовые токены: тёмная, светлая или как в системе (по умолчанию).
// Графики и выгрузка PNG всегда в светлой палитре — отчёт куратору выглядит одинаково.

import React, { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';
import type { TextSize, ThemePref } from '../core/types';

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
};

const Ctx = createContext<Palette>(DARK);

export function ThemeProvider({ pref, children }: { pref: ThemePref; children: React.ReactNode }) {
  const sys = useColorScheme();
  const dark = pref === 'dark' || (pref === 'system' && sys !== 'light');
  return <Ctx.Provider value={dark ? DARK : LIGHT}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

export const MONO = Platform.select({ web: 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace', ios: 'Menlo', default: 'monospace' });

/** Во сколько раз крупнее текст в режиме «Крупный». */
export const LARGE_SCALE = 1.2;
export const textScale = (size: TextSize | undefined) => (size === 'large' ? LARGE_SCALE : 1);

const ScaleCtx = createContext(1);

/** Размер шрифта по выбору в профиле: оборачивает всё приложение. */
export function TextSizeProvider({ size, children }: { size: TextSize | undefined; children: React.ReactNode }) {
  return <ScaleCtx.Provider value={textScale(size)}>{children}</ScaleCtx.Provider>;
}

/** Множитель шрифта (1 или 1,2). */
export const useTextScale = () => useContext(ScaleCtx);

/** Размер шрифта с учётом выбора «Обычный / Крупный»: fs(14) → 14 или 17. */
export function useFs() {
  const k = useContext(ScaleCtx);
  return (n: number) => (k === 1 ? n : Math.round(n * k));
}
