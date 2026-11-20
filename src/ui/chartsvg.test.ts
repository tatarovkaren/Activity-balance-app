import { describe, expect, it } from 'vitest';
import { nearestDate, seriesAt, valuesAt } from './chartsvg';

const weights = { label: 'вес', color: '#00f', dots: true, points: [{ d: '2026-11-01', v: 72 }, { d: '2026-11-05', v: 71.6 }] };
const trend = { label: 'тренд', color: '#fa0', dash: true, gapDays: 1e6, points: [{ d: '2026-11-01', v: 72 }, { d: '2026-11-11', v: 71 }] };
const spec = { width: 350, height: 180, from: '2026-11-01', to: '2026-11-11', series: [weights, trend] };

describe('ползунок графика', () => {
  it('выбирает ближайший день с данными', () => {
    // область построения 40…340 px, 10 дней по 30 px
    expect(nearestDate(spec, 40)).toBe('2026-11-01');
    expect(nearestDate(spec, 150)).toBe('2026-11-05');
    expect(nearestDate(spec, 330)).toBe('2026-11-11');
    expect(nearestDate({ ...spec, series: [] }, 100)).toBeNull();
  });
  it('линию тренда интерполирует, замеры — только точно', () => {
    expect(seriesAt(trend, '2026-11-06')).toBeCloseTo(71.5);
    expect(seriesAt(weights, '2026-11-03')).toBeNull();
    expect(valuesAt(spec, '2026-11-05').map((v) => [v.label, +v.v.toFixed(2)])).toEqual([['вес', 71.6], ['тренд', 71.6]]);
  });
  it('не тянет линию через большой пропуск', () => {
    const s = { label: 'ф', color: '#000', points: [{ d: '2026-11-01', v: 1 }, { d: '2026-11-20', v: 2 }] };
    expect(seriesAt(s, '2026-11-10')).toBeNull();
  });
});
