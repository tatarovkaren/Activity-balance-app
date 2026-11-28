import { describe, it, expect } from 'vitest';
import { rememberBaseline, requireBaseline } from './daySyncJournal';
describe('day sync baseline', () => {
  it('preserves first snapshot across subsequent edits', () => {
    const base = { weight: 75 };
    const j = rememberBaseline({owner:'a',entries:{}},'a','2025-01-01',base);
    base.weight = 80;
    expect(requireBaseline(rememberBaseline(j,'a','2025-01-01',base),'a','2025-01-01')).toEqual({weight:75});
  });
  it('rejects other accounts and unknown baselines', () => {
    const j = {owner:'a',entries:{}};
    expect(() => requireBaseline(j,'a','2025-01-01')).toThrow();
    expect(() => rememberBaseline(j,'b','2025-01-01',null)).toThrow();
  });
  it('distinguishes verified absent day from unknown day', () => {
    const j = rememberBaseline({owner:'a',entries:{}},'a','2025-01-01',null);
    expect(requireBaseline(j,'a','2025-01-01')).toBeNull();
  });
});
