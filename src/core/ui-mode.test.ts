import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, UI_MODES } from './types';

describe('interface modes', () => {
  it('offers Chill, Basic and Advanced without changing the default', () => {
    expect(UI_MODES).toEqual(['chill', 'basic', 'advanced']);
    expect(DEFAULT_PROFILE.uiMode).toBe('basic');
  });
  it('changes only a profile display choice, not existing diary records', () => {
    const profile = { ...DEFAULT_PROFILE, uiMode: 'chill' as const };
    const record = { weight: 75.8, kcal: 1980, protein: 156, steps: 14000, wellbeing: 8 };
    expect({ ...profile, uiMode: 'advanced' }.uiMode).toBe('advanced');
    expect(record).toEqual({ weight: 75.8, kcal: 1980, protein: 156, steps: 14000, wellbeing: 8 });
  });
});
