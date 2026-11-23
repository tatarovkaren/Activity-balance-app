import { describe, expect, it } from 'vitest';
import { dayClosed, kcalCorridor, monthDates, monthSummary, scoreDay, scoreKcal, scoreProtein, scoreSteps } from './dayscore';
import { computeTargets, type Targets } from './targets';

// Планка из проверки ТЗ v36: 1870 ккал · Б 116 · Ж 57 · У 223.
const tg = (() => {
  const r = computeTargets({ E: 2268, weight: 71.8, weightSource: 'trend', bodyFatPct: 19.5, sex: 'male', age: 48, heightCm: 170, asOf: '2026-11-17', setting: { start: '2026-11-17', mode: 'deficit' } });
  if ('error' in r) throw new Error(r.error.code);
  return r;
})();
const asMode = (mode: Targets['mode']): Targets => ({ ...tg, mode });
const profile = { sex: 'male' as const, stepGoal: 10000 };
const at = (iso: string, h: number) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)), h, 30);

describe('итог дня: калории', () => {
  it('коридор ±5 % округлён до 10: 1870 → 1780–1960', () => {
    expect(kcalCorridor(1870)).toEqual({ lo: 1780, hi: 1960 });
  });
  it('в коридоре ✓, рядом (5–10 %) ≈ жёлтый', () => {
    expect(scoreKcal(1842, 1870, 'deficit', 'male', false)).toMatchObject({ status: 'ok', tone: 'ok' });
    expect(scoreKcal(2010, 1870, 'deficit', 'male', false)).toMatchObject({ status: 'near', tone: 'warn', diff: 140 });
    expect(scoreKcal(1720, 1870, 'deficit', 'male', false)).toMatchObject({ status: 'near', tone: 'warn', diff: -150 });
  });
  it('дефицит: перебор красный, недобор жёлтый, ниже минимума — красный', () => {
    expect(scoreKcal(2190, 1870, 'deficit', 'male', false)).toMatchObject({ status: 'over', tone: 'bad', diff: 320 });
    expect(scoreKcal(1600, 1870, 'deficit', 'male', false)).toMatchObject({ status: 'under', tone: 'warn' });
    expect(scoreKcal(1400, 1870, 'deficit', 'male', false)).toMatchObject({ status: 'under', tone: 'bad' });
    // у женщин минимум 1200
    expect(scoreKcal(1400, 1870, 'deficit', 'female', false)).toMatchObject({ status: 'under', tone: 'warn' });
  });
  it('профицит: недобор красный, перебор жёлтый; поддержание: оба красные', () => {
    expect(scoreKcal(1600, 1870, 'surplus', 'male', false).tone).toBe('bad');
    expect(scoreKcal(2190, 1870, 'surplus', 'male', false).tone).toBe('warn');
    expect(scoreKcal(1600, 1870, 'maintain', 'male', false).tone).toBe('bad');
    expect(scoreKcal(2190, 1870, 'maintain', 'male', false).tone).toBe('bad');
  });
  it('день идёт: недобор синий «ещё 660–840», перебор показываем сразу', () => {
    expect(scoreKcal(1120, 1870, 'deficit', 'male', true)).toMatchObject({ status: 'left', tone: 'progress', leftMin: 660, leftMax: 840 });
    expect(scoreKcal(2190, 1870, 'deficit', 'male', true)).toMatchObject({ status: 'over', tone: 'bad' });
  });
  it('без калорий — не оцениваем', () => {
    expect(scoreKcal(undefined, 1870, 'deficit', 'male', false).status).toBe('none');
  });
});

describe('итог дня: белок и шаги', () => {
  it('белок: от цели ✓, 90–100 % ≈, ниже ▼ красный, перебор не наказываем', () => {
    expect(scoreProtein(121, 116, false)).toMatchObject({ status: 'ok' });
    expect(scoreProtein(300, 116, false)).toMatchObject({ status: 'ok' });
    expect(scoreProtein(108, 116, false)).toMatchObject({ status: 'near', tone: 'warn' });
    expect(scoreProtein(98, 116, false)).toMatchObject({ status: 'under', tone: 'bad', diff: -18 });
    expect(scoreProtein(64, 116, true)).toMatchObject({ status: 'left', tone: 'progress', diff: 52 });
  });
  it('шаги: от цели ✓, 90–100 % ≈, ниже ▼ жёлтый, не внесены — не оцениваем', () => {
    expect(scoreSteps(11240, 10000, false).status).toBe('ok');
    expect(scoreSteps(9400, 10000, false)).toMatchObject({ status: 'near', tone: 'warn' });
    expect(scoreSteps(6300, 10000, false)).toMatchObject({ status: 'under', tone: 'warn' });
    expect(scoreSteps(undefined, 10000, false).status).toBe('none');
  });
});

describe('итог дня целиком', () => {
  const past = '2026-11-22';
  const now = at('2026-11-23', 14);
  it('всё ✓ — день в цели', () => {
    const s = scoreDay({ kcal: 1842, kcalManual: true, protein: 121, steps: 11240 }, past, tg, profile, now);
    expect(s).toMatchObject({ verdict: 'ok', misses: 0, open: false, closedBy: 'past' });
  });
  it('перебор и недобор белка — «мимо: 2» и ▲ в календаре', () => {
    const s = scoreDay({ kcal: 2190, kcalManual: true, protein: 98 }, past, tg, profile, now);
    expect(s.verdict).toBe('over');
    expect(s.misses).toBe(2);
    expect(s.tone).toBe('bad');
  });
  it('шаги не внесены — не влияют; шаги ниже цели — ▼', () => {
    expect(scoreDay({ kcal: 1842, kcalManual: true, protein: 121 }, past, tg, profile, now).verdict).toBe('ok');
    const s = scoreDay({ kcal: 1842, kcalManual: true, protein: 121, steps: 6300 }, past, tg, profile, now);
    expect(s).toMatchObject({ verdict: 'under', misses: 1, tone: 'warn' });
  });
  it('только «рядом» — ≈', () => {
    expect(scoreDay({ kcal: 2010, kcalManual: true, protein: 120 }, past, tg, profile, now).verdict).toBe('near');
  });
  it('без калорий — мало данных, не «мимо»', () => {
    expect(scoreDay({ steps: 3000, weight: 71 }, past, tg, profile, now).verdict).toBe('noData');
  });
  it('режим влияет на цвет: недобор в профиците красный', () => {
    expect(scoreDay({ kcal: 1600, kcalManual: true, protein: 120 }, past, asMode('surplus'), profile, now).tone).toBe('bad');
    expect(scoreDay({ kcal: 1600, kcalManual: true, protein: 120 }, past, asMode('deficit'), profile, now).tone).toBe('warn');
  });
  it('сегодня день идёт до 21:00, потом закрывается сам', () => {
    const e = { kcal: 1120, kcalManual: true, protein: 64 };
    expect(scoreDay(e, '2026-11-23', tg, profile, at('2026-11-23', 14))).toMatchObject({ verdict: 'open', open: true });
    expect(scoreDay(e, '2026-11-23', tg, profile, at('2026-11-23', 21))).toMatchObject({ verdict: 'under', closedBy: 'time' });
  });
  it('кнопка «Закрыть день» и отчёт куратору закрывают день раньше', () => {
    const now14 = at('2026-11-23', 14);
    expect(dayClosed({ closedAt: 1 }, '2026-11-23', now14)).toBe('button');
    expect(dayClosed({ reportSentAt: 1 }, '2026-11-23', now14)).toBe('report');
    expect(dayClosed({}, '2026-11-23', now14)).toBeNull();
    expect(dayClosed({}, '2026-11-20', now14)).toBe('past');
  });
});

describe('календарь', () => {
  it('даты месяца и сводка «в цели N из M»', () => {
    expect(monthDates(2026, 1)).toHaveLength(28);
    expect(monthDates(2026, 10)[29]).toBe('2026-11-30');
    const now = at('2026-11-23', 14);
    const mk = (kcal: number) => scoreDay({ kcal, kcalManual: true, protein: 120 }, '2026-11-02', tg, profile, now);
    const sum = monthSummary({ a: mk(1850), b: mk(1860), c: mk(2300), d: mk(1500), e: null, f: scoreDay({}, '2026-11-02', tg, profile, now) });
    expect(sum).toEqual({ ok: 2, total: 4, over: 1, under: 1 });
  });
});
