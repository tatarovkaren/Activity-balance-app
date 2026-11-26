import { describe, expect, it } from 'vitest';
import { layoutColumns } from './layout';

describe('Fold layout after removing manual column switch', () => {
  it('uses one readable column on outer and inner screens', () => {
    expect(layoutColumns(390)).toBe(1);
    expect(layoutColumns(820)).toBe(1);
    expect(layoutColumns(1100)).toBe(1);
  });
  it('ignores legacy settings saved before the column selector was removed', () => {
    expect(layoutColumns(820, 'double')).toBe(1);
    expect(layoutColumns(820, 'single')).toBe(1);
    expect(layoutColumns(820, 'auto')).toBe(1);
    expect(layoutColumns(Number.NaN, 'double')).toBe(1);
  });
});
