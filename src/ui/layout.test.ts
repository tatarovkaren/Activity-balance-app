import { describe, expect, it } from 'vitest';
import { layoutColumns } from './layout';

describe('fold layout', () => {
  it('uses one column on a narrow cover display', () => {
    expect(layoutColumns(390, 'auto')).toBe(1);
    expect(layoutColumns(390, 'double')).toBe(1);
  });
  it('uses two columns when the inner display provides enough room', () => {
    expect(layoutColumns(820, 'auto')).toBe(2);
    expect(layoutColumns(820, 'double')).toBe(2);
    expect(layoutColumns(820, 'single')).toBe(1);
  });
  it('respects split-screen and rejects unusable width', () => {
    expect(layoutColumns(580, 'double')).toBe(1);
    expect(layoutColumns(Number.NaN, 'auto')).toBe(1);
    expect(layoutColumns(680, 'auto')).toBe(1);
    expect(layoutColumns(680, 'double')).toBe(2);
  });
});
