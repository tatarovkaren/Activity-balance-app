// Тема через цветовые токены: тёмная, светлая или как в системе (по умолчанию).
// Графики и выгрузка PNG всегда в светлой палитре — отчёт куратору выглядит одинаково.

import React, { createContext, useContext } from 'react';
import { Platform, useColorScheme } from 'react-native';
import type { PalettePref, TextSize, ThemePref } from '../core/types';

import { colorblind, DARK, LIGHT, type Palette } from './palette';
export { colorblind, DARK, LIGHT, type Palette };

const Ctx = createContext<Palette>(DARK);

export function ThemeProvider({ pref, palette, children }: { pref: ThemePref; palette?: PalettePref; children: React.ReactNode }) {
  const sys = useColorScheme();
  const dark = pref === 'dark' || (pref === 'system' && sys !== 'light');
  const base = dark ? DARK : LIGHT;
  const value = React.useMemo(() => (palette === 'colorblind' ? colorblind(base) : base), [base, palette]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
