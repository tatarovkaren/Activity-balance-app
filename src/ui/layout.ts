/** Legacy layout preference retained only for compatibility with saved profiles. */
export type LayoutMode = 'auto' | 'single' | 'double';
export const LAYOUT_MODES: LayoutMode[] = ['auto', 'single', 'double'];

/** A single readable column on all screens; legacy saved layout modes are ignored. */
export function layoutColumns(_width: number, _mode: LayoutMode = 'auto'): 1 {
  return 1;
}
