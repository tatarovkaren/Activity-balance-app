import { describe, it, expect } from 'vitest';
import { planFatSecretImport } from './fatsecretSync';
const row = { date: '2026-11-01', kcal: 1800, protein: 150, fat: 60, carbs: 165 };
describe('FatSecret preview', () => {
  it('allows empty nutrition but preserves other fields', () => {
    const days = { [row.date]: { weight: 75 } };
    expect(planFatSecretImport([row], days)[0].status).toBe('new');
    expect(days[row.date]).toEqual({weight:75});
  });
  it('recognizes identical totals', () => {
    expect(planFatSecretImport([row], {[row.date]: row})[0].status).toBe('unchanged');
  });
  it('protects partial and zero-valued manual records', () => {
    expect(planFatSecretImport([row], {[row.date]: {kcal:0}})[0].status).toBe('conflict');
    expect(planFatSecretImport([row], {[row.date]: {protein:100}})[0].status).toBe('conflict');
  });
  it('rejects invalid dates, duplicates and nonfinite or negative values', () => {
    for (const rows of [[row,row],[{...row,date:'2026-02-30'}],[{...row,kcal:NaN}],[{...row,fat:-1}]]) {
      expect(() => planFatSecretImport(rows, {})).toThrow();
    }
  });
});
