import { describe, expect, it } from 'vitest';
import { addMonthsClamped, ageAt, monthCells, shiftDate, toLocalISO } from './dates';
import { energyModel, PaceIndex } from './energy';
import { carriedMeasure, extraMeasureKeys, hasAnyMeasurement, measureHint, missingFatFields, navyBodyFat } from './body';
import { adaptiveTDEE, goalForecast, wls } from './adaptive';
import { applyFoodDays, applyWeights, parseBackup, parseFatSecret, parseWeightHistory } from './importers';
import { mergeEntry } from './merge';
import { backupDue } from './backup';
import { buildDraft, handFromCard, handUnitMl, REFERENCE_HAND } from './photo/estimate';
import { photoQuota } from './photo/provider';
import { demoDays, demoProfile } from './demo';
import { DEFAULT_PROFILE, type DayMap, type Profile } from './types';

const karen: Profile = { ...DEFAULT_PROFILE, sex: 'male', birthDate: '1978-06-20', heightCm: 170 };

describe('даты по местному времени', () => {
  it('toLocalISO не откатывает дату', () => {
    expect(toLocalISO(new Date(2026, 10, 12, 0, 30))).toBe('2026-11-12');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('возраст на дату', () => {
    expect(ageAt('1978-06-20', '2026-06-19')).toBe(47);
    expect(ageAt('1978-06-20', '2026-06-20')).toBe(48);
  });
});

describe('формулы расхода (контрольные примеры ТЗ)', () => {
  it('80,7 кг, 170, 48 лет, 14 000 шагов, силовая 60, Б170/Ж55/У130 ≈ 2608', () => {
    const m = energyModel(
      { weight: 80.7, steps: 14000, workoutType: 'силовая', workoutMin: 60, protein: 170, fat: 55, carbs: 130 },
      '2026-11-12',
      { profile: karen },
    )!;
    expect(Math.round(m.bmr)).toBe(1635); // 1634,5
    expect(Math.round(m.neat)).toBe(475);
    expect(Math.round(m.train)).toBe(282);
    expect(Math.round(m.tef)).toBe(216);
    expect(Math.round(m.total)).toBe(2608);
  });
  it('не задваивает шаги на кардио: орбитрек 30 мин, пульс 135', () => {
    const e = { weight: 80, steps: 14000, workoutType: 'орбитрек', workoutMin: 30, hrAvg: 135 };
    const m = energyModel(e, '2026-11-12', { profile: karen })!;
    expect(m.workoutStepsDeducted).toBe(3900);
    expect(Math.round(m.neat)).toBe(339);
    expect(Math.round(m.train)).toBe(365);
    const bike = energyModel({ ...e, workoutType: 'велотренажёр' }, '2026-11-12', { profile: karen })!;
    expect(Math.round(bike.neat)).toBe(470);
  });
  it('шаги на тренировке: оценка 130 → ввод 3 700 → личный темп ≈90', () => {
    const d1 = { weight: 72.5, steps: 12000, workoutType: 'Эллипс', workoutMin: 41, hrAvg: 112 };
    const m1 = energyModel(d1, '2026-11-10', { profile: karen })!;
    expect(m1.workoutStepsDeducted).toBe(5330);
    const m2 = energyModel({ ...d1, workoutSteps: 3700 }, '2026-11-10', { profile: karen })!;
    expect(m2.workoutStepsDeducted).toBe(3700);
    expect(m2.workoutStepsSource).toBe('tracker');
    const days: DayMap = { '2026-11-10': { ...d1, workoutSteps: 3700 } };
    const pace = new PaceIndex(days).paceBefore('2026-11-11');
    expect(Math.round(pace.pace)).toBe(90);
    const m3 = energyModel({ weight: 72.5, steps: 12000, workoutType: 'орбитрек', workoutMin: 30 }, '2026-11-11', { profile: karen, pace })!;
    expect(m3.workoutStepsDeducted).toBe(2707);
    const m4 = energyModel({ weight: 72.5, steps: 12000, workoutType: 'силовая', workoutMin: 30 }, '2026-11-11', { profile: karen, pace })!;
    expect(m4.workoutStepsDeducted).toBe(0);
  });
  it('женский режим: БМР −161 и своя формула Кейтеля', () => {
    const f: Profile = { ...karen, sex: 'female' };
    const m = energyModel({ weight: 60 }, '2026-11-12', { profile: f })!;
    expect(Math.round(m.bmr)).toBe(Math.round(600 + 1062.5 - 240 - 161));
  });
});

describe('% жира и замеры', () => {
  it('мужчины: талия 90, шея 40, рост 170 ≈ 20,1%', () => {
    expect(navyBodyFat('male', { neck: 40, waist: 90 }, 170)!.toFixed(1)).toBe('20.1');
  });
  it('женщины: нужны бёдра', () => {
    expect(navyBodyFat('female', { neck: 33, waist: 75 }, 165)).toBeNull();
    const v = navyBodyFat('female', { neck: 33, waist: 75, hips: 100 }, 165)!;
    expect(v).toBeGreaterThan(25);
    expect(v).toBeLessThan(35);
  });
  it('частота замеров', () => {
    const days: DayMap = { '2026-11-09': { neck: 40, waist: 90 } };
    expect(measureHint(days, '2026-11-12', 'month')).toEqual({ kind: 'next', date: '2026-12-09', inDays: 27 });
    expect(measureHint(days, '2026-12-12', 'month')).toEqual({ kind: 'due', last: '2026-11-09', agoDays: 33 });
    expect(measureHint(days, '2026-11-12', 'week')).toEqual({ kind: 'next', date: '2026-11-16', inDays: 4 });
    expect(addMonthsClamped('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(measureHint({}, '2026-11-12', 'month')).toEqual({ kind: 'first' });
  });
  it('последние замеры до даты — серым, в день не пишутся', () => {
    const days: DayMap = {
      '2026-11-02': { neck: 40, waist: 92 },
      '2026-11-09': { waist: 90 },
      '2026-11-12': { weight: 80 },
    };
    const c = carriedMeasure(days, '2026-11-12', 'male', 178)!;
    expect(c.neck).toBe(40);
    expect(c.waist).toBe(90);
    // % жира — по последнему полному замеру (02.11), неполный 09.11 не считается
    expect(c.bf!.date).toBe('2026-11-02');
    expect(c.bf!.v).toBeCloseTo(navyBodyFat('male', { neck: 40, waist: 92 }, 178)!, 6);
    expect(days['2026-11-12'].neck).toBeUndefined();
    // замер в сам день не считается перенесённым; до первого замера — ничего
    expect(carriedMeasure(days, '2026-11-02', 'male', 178)).toBeNull();
  });
  it('чего не хватает для % жира за день: подсказки остальных полей не пропадают', () => {
    expect(missingFatFields('male', { neck: 39 })).toEqual(['waist']);
    expect(missingFatFields('male', { neck: 39, waist: 90 })).toEqual([]);
    expect(missingFatFields('female', { waist: 80 })).toEqual(['neck', 'hips']);
    // ввели только шею — подсказки живота и % жира берутся из прошлых замеров, шея дня в них не мешает
    const days: DayMap = { '2026-11-02': { neck: 40, waist: 92 }, '2026-11-12': { neck: 39 } };
    const c = carriedMeasure(days, '2026-11-12', 'male', 178)!;
    expect(c.waist).toBe(92);
    expect(c.bf!.date).toBe('2026-11-02');
    expect(navyBodyFat('male', days['2026-11-12'], 178)).toBeNull();
  });
  it('необязательные замеры: грудь, бицепс, бёдра у мужчин — подсказками, в % жира не входят', () => {
    const days: DayMap = {
      '2026-11-02': { neck: 40, waist: 92, chest: 104, biceps: 36 },
      '2026-11-05': { hips: 100 },
      '2026-11-09': { biceps: 36.5 },
    };
    const c = carriedMeasure(days, '2026-11-12', 'male', 178)!;
    expect(c.chest).toBe(104);
    expect(c.biceps).toBe(36.5);
    expect(c.hips).toBe(100);
    expect(c.bf!.date).toBe('2026-11-02');
    // у мужчин бёдра и грудь не меняют % жира
    expect(navyBodyFat('male', days['2026-11-02'], 178)).toBeCloseTo(navyBodyFat('male', { neck: 40, waist: 92 }, 178)!, 6);
    expect(extraMeasureKeys('male')).toEqual(['chest', 'biceps', 'hips']);
    expect(extraMeasureKeys('female')).toEqual(['chest', 'biceps']);
    // день только с бицепсом — уже есть подсказки
    expect(hasAnyMeasurement({ biceps: 36 })).toBe(true);
    expect(carriedMeasure({ '2026-11-09': { biceps: 36 } }, '2026-11-10', 'male', 178)!.biceps).toBe(36);
  });
});

describe('расход по факту', () => {
  it('wls', () => {
    const f = wls([[0, 1, 1], [1, 3, 1], [2, 5, 1]])!;
    expect(f.slope).toBeCloseTo(2);
  });
  it('стартует с формулы, ручная отметка исключает день, шаг ≤50 ккал', () => {
    const today = '2026-11-16';
    const days = demoDays(today);
    const ctx = { profile: demoProfile(), days };
    const r = adaptiveTDEE(today, ctx, {})!;
    expect(r).not.toBeNull();
    expect(r.series[0].E).toBe(r.series[0].formula);
    for (let i = 1; i < r.series.length; i++) {
      const a = r.series[i - 1].E;
      const b = r.series[i].E;
      if (a != null && b != null) expect(Math.abs(b - a)).toBeLessThanOrEqual(50.0001);
    }
    // истинный расход в демо 2480 — оценка должна прийти близко
    expect(Math.abs(r.E! - 2480)).toBeLessThan(250);
    expect(r.slope! * 7).toBeLessThan(0);
  });
  it('поездка: без исключения тренд врёт сильнее', () => {
    const today = '2026-11-16';
    const days = demoDays(today);
    const noMarks: DayMap = Object.fromEntries(Object.entries(days).map(([d, e]) => [d, { ...e, anomaly: undefined }]));
    const ctx = { profile: demoProfile(), days };
    const a = adaptiveTDEE(shiftDate(today, -22), ctx, {})!;
    const b = adaptiveTDEE(shiftDate(today, -22), { ...ctx, days: noMarks }, {})!;
    expect(a.exclList.some((x) => !x.auto && x.why === 'trip')).toBe(true);
    expect(b.exclList.every((x) => x.why !== 'trip')).toBe(true);
  });
  it('вернуть в расчёт возвращает автонаходку', () => {
    const today = '2026-11-16';
    const days = demoDays(today);
    // искусственный скачок веса
    const spike = shiftDate(today, -5);
    days[spike] = { ...days[spike], weight: (days[shiftDate(today, -6)]?.weight || 78) + 2.5 };
    const ctx = { profile: demoProfile(), days };
    const r1 = adaptiveTDEE(today, ctx, {})!;
    expect(r1.exclList.some((x) => x.d === spike && x.auto)).toBe(true);
    const r2 = adaptiveTDEE(today, ctx, { [spike]: true })!;
    expect(r2.exclList.some((x) => x.d === spike)).toBe(false);
    expect(r2.kept.some((x) => x.d === spike)).toBe(true);
  });
  it('прогноз цели', () => {
    const r: any = { slope: -0.67 / 7, trendW: 70.71, alpha: 0.6 };
    const g = goalForecast(r, '2026-11-10', 66.6, 70.7);
    expect(g.kind).toBe('date');
    if (g.kind === 'date') {
      expect(g.date).toBe('2026-12-23');
      expect(g.rough).toBe(true);
    }
    expect(goalForecast({ ...r, slope: 0.01 }, '2026-11-10', 66.6, 70).kind).toBe('notApproaching');
    expect(goalForecast(r, '2026-11-10', undefined, 70).kind).toBe('noGoal');
  });
});

describe('импорт', () => {
  const fs = [
    'Дата,Кал ( ккал),Жир( г),Н/жир( г),Углев( г),Клетч( г),Сахар( г),Белк( г),Натрий( мг)',
    '"среда, сентября 30, 2026",1499,50,10,120,,,140,',
    ' Завтрак,500,10,,50,,,40,',
    '"четверг, октября 1, 2026",1820.4,61.25,,150,,,160.04,',
    '"пятница, октября 2, 2026",,,,,,,,',
    'Всего,3319,111,,270,,,300,',
  ].join('\n');
  it('многодневная выгрузка FatSecret, пустой день пропущен', () => {
    const r = parseFatSecret(fs);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.days.map((d) => d.date)).toEqual(['2026-09-30', '2026-10-01']);
    expect(r.skipped).toBe(1);
    expect(r.days[1]).toMatchObject({ kcal: 1820, fat: 61.3, carbs: 150, protein: 160 });
    const s = applyFoodDays({ '2026-10-01': { weight: 80, steps: 9000 } }, r.days, r.skipped);
    expect(s.days['2026-10-01']).toMatchObject({ weight: 80, steps: 9000, kcal: 1820 });
    expect(s.added).toBe(2); // у 01.10 был только вес — день питания новый
    expect(s.updated).toBe(0);
  });
  it('пустое не затирает заполненное', () => {
    expect(mergeEntry({ weight: 80, kcal: 1500 }, { weight: undefined, kcal: 1600, comment: '' })).toEqual({ weight: 80, kcal: 1600 });
  });
  it('история веса из CSV в разных форматах', () => {
    const r = parseWeightHistory('Дата;Вес, кг\n01.11.2026;80,5\n02.11.2026;80,2\n2026-11-03;79,9\n');
    expect(r.ok && r.points).toEqual([
      { date: '2026-11-01', weight: 80.5 },
      { date: '2026-11-02', weight: 80.2 },
      { date: '2026-11-03', weight: 79.9 },
    ]);
    const r2 = parseWeightHistory('2026-11-01 07:10,80.4\n2026-11-01 21:00,81.2\n');
    expect(r2.ok && r2.points).toEqual([{ date: '2026-11-01', weight: 80.4 }]);
    const a = applyWeights({ '2026-11-01': { weight: 80 } }, [{ date: '2026-11-01', weight: 81 }, { date: '2026-11-02', weight: 79 }]);
    expect(a.days['2026-11-01'].weight).toBe(80);
    expect(a.added).toBe(1);
  });
  it('чужая резервная копия отклоняется', () => {
    const t = JSON.stringify({ app: 'balans', version: 1, owner: 'u2', data: { days: {} } });
    expect(parseBackup(t, 'u1').ok).toBe(false);
    expect(parseBackup(t, 'u2').ok).toBe(true);
    expect(parseBackup('{"app":"x"}', 'u1').ok).toBe(false);
  });
});

describe('фото без ИИ', () => {
  it('кулак и ладонь по замерам руки', () => {
    expect(Math.round(handUnitMl('fist', REFERENCE_HAND))).toBe(254);
    expect(Math.round(handUnitMl('palm', REFERENCE_HAND))).toBe(134);
  });
  it('черновик: диапазон, скрытое масло, уварка', () => {
    const d = buildDraft(
      [
        { foodId: 'buckwheat', amount: { kind: 'grams', grams: 180 } },
        { foodId: 'chicken_cutlet', amount: { kind: 'grams', grams: 110 } },
      ],
      { hand: REFERENCE_HAND, quality: 'good', hiddenOil: true, diaryWeights: 'raw' },
    );
    expect(d.components[0].kcal).toBe(198);
    expect(d.components[1].kcal).toBe(237);
    expect(d.kcal).toBe(198 + 237 + 75);
    expect(d.kcalMin).toBe(Math.round(435 * 0.85 + 50));
    expect(d.kcalMax).toBe(Math.round(435 * 1.15 + 100));
    expect(d.components[0].diaryGrams).toBe(67);
  });
  it('замер по карте', () => {
    expect(handFromCard(428, 500)).toBe(10);
  });
  it('лимиты', () => {
    // приём пищи = одна оценка; бесплатно 2 в день, премиум без лимита (защита 30 в день)
    expect(photoQuota('free', ['2026-11-15', '2026-11-16'], '2026-11-16')).toMatchObject({ used: 1, left: 1, per: 'day' });
    expect(photoQuota('premium', ['2026-11-16', '2026-11-16'], '2026-11-16')).toMatchObject({ used: 2, left: 28, fairUse: true });
  });
});

describe('режим интерфейса', () => {
  it('новый клиент — базовый, демо — продвинутый', () => {
    expect(DEFAULT_PROFILE.uiMode).toBe('basic');
    expect(demoProfile().uiMode).toBe('advanced');
  });
});

describe('monthCells (календарь дневника)', () => {
  it('ноябрь 2026 с понедельника: 1-е — воскресенье, 6 пустых клеток', () => {
    const c = monthCells(2026, 10, 1);
    expect(c.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(c.filter(Boolean).length).toBe(30);
    expect(c.length % 7).toBe(0);
    expect(c.filter(Boolean).at(-1)).toBe('2026-11-30');
  });
  it('с воскресенья: 1 ноября 2026 в первой клетке; февраль високосного года', () => {
    expect(monthCells(2026, 10, 0)[0]).toBe('2026-11-01');
    expect(monthCells(2028, 1, 1).filter(Boolean).length).toBe(29);
  });
});

describe('backupDue (напоминание о резервной копии)', () => {
  const now = new Date(2026, 10, 19, 10);
  it('копия 7 дней назад — пора, 6 дней — рано', () => {
    expect(backupDue(new Date(2026, 10, 12, 23).getTime(), ['2026-11-01'], undefined, now)).toEqual({ days: 7, never: false });
    expect(backupDue(new Date(2026, 10, 13, 8).getTime(), ['2026-11-01'], true, now)).toBeNull();
  });
  it('копии не было: считаем от первой записи; без записей и при выключенном — нет', () => {
    expect(backupDue(undefined, ['2026-11-15', '2026-11-10'], undefined, now)).toEqual({ days: 9, never: true });
    expect(backupDue(undefined, ['2026-11-15'], undefined, now)).toBeNull();
    expect(backupDue(undefined, [], undefined, now)).toBeNull();
    expect(backupDue(undefined, ['2026-01-01'], false, now)).toBeNull();
  });
});
