/** User-selectable layout: independent of Basic / Chill / Advanced information density. */
export type LayoutMode = 'auto' | 'single' | 'double';
export const LAYOUT_MODES: LayoutMode[] = ['auto', 'single', 'double'];

/** Compute columns from *available window width*, not physical device or orientation. */
export function layoutColumns(width: number, mode: LayoutMode = 'auto'): 1 | 2 {
  if (!Number.isFinite(width) || width < 620) return 1;
  if (mode === 'single') return 1;
  if (mode === 'double') return 2;
  return width >= 720 ? 2 : 1;
}
