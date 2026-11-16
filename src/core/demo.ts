// Демо-данные: синтетический дневник с поездкой и пропусками — для показа продукта и кабинета куратора.
// Все имена и цифры вымышленные.

import { shiftDate, type ISODate } from './dates';
import type { DayEntry, DayMap, Profile, Sex } from './types';
import { DEFAULT_PROFILE } from './types';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface DemoSpec {
  seed: number;
  sex: Sex;
  startWeight: number;
  trueTdee: number;
  intake: number;
  days: number;
  /** День (от начала) поездки длиной 3 дня с отметкой и водой +1,2–1,6 кг. */
  tripAt?: number;
  /** Пропуск взвешиваний: [начало, длина]. */
  gap?: [number, number];
  /** Не взвешивался последние N дней. */
  noWeighTail?: number;
  noReportToday?: boolean;
}

export function generateDemo(spec: DemoSpec, today: ISODate): DayMap {
  const r = rng(spec.seed);
  const out: DayMap = {};
  let fat = spec.startWeight;
  let water = 0;
  const start = shiftDate(today, -(spec.days - 1));
  for (let i = 0; i < spec.days; i++) {
    const d = shiftDate(start, i);
    const dow = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)).getDay();
    const trip = spec.tripAt != null && i >= spec.tripAt && i < spec.tripAt + 3;
    const intake = Math.round(trip ? spec.intake + 900 + r() * 500 : spec.intake + (r() - 0.5) * 380);
    fat += (intake - spec.trueTdee) / 7700;
    if (trip) water = 1.2 + r() * 0.4;
    else water *= 0.45;
    const noise = (r() - 0.5) * 0.6;
    const e: DayEntry = {};
    const inGap = spec.gap && i >= spec.gap[0] && i < spec.gap[0] + spec.gap[1];
    const inTail = spec.noWeighTail && i >= spec.days - spec.noWeighTail;
    if (!inGap && !inTail && r() > 0.12) e.weight = Math.round((fat + water + noise) * 10) / 10;
    const isToday = i === spec.days - 1;
    if (!(isToday && spec.noReportToday)) {
      const p = Math.round(intake * 0.3 / 4);
      const f = Math.round(intake * 0.28 / 9);
      const c = Math.round((intake - p * 4 - f * 9) / 4);
      e.kcal = intake;
      e.protein = p;
      e.fat = f;
      e.carbs = c;
      e.kcalManual = true;
      e.steps = Math.round(8000 + r() * 7000);
      if (dow === 1 || dow === 3 || dow === 5) {
        e.workoutType = 'Силовая';
        e.workoutMin = 60;
        e.hrAvg = 118;
      } else if (dow === 2 || dow === 6) {
        e.workoutType = 'Орбитрек';
        e.workoutMin = 30 + Math.round(r() * 12);
        e.hrAvg = 125 + Math.round(r() * 15);
        if (r() > 0.4) e.workoutSteps = Math.round(e.workoutMin * (85 + r() * 10));
      }
      e.wellbeing = 6 + Math.round(r() * 3);
    }
    if (trip) e.anomaly = 'trip';
    if (i % 30 === 3) {
      e.neck = spec.sex === 'male' ? 40 : 33;
      e.waist = Math.round((spec.sex === 'male' ? 92 : 80) - i * 0.06);
      if (spec.sex === 'female') e.hips = Math.round(104 - i * 0.04);
    }
    if (Object.keys(e).length) out[d] = e;
  }
  return out;
}

export function demoProfile(): Profile {
  return {
    ...DEFAULT_PROFILE,
    name: 'Демо',
    sex: 'male',
    birthDate: '1980-03-14',
    heightCm: 176,
    goalWeightKg: 74,
    stepGoal: 12000,
  };
}

export interface DemoClient {
  id: string;
  name: string;
  profile: Profile;
  days: DayMap;
}

/** Клиенты для демо кабинета куратора. */
export function demoClients(today: ISODate): DemoClient[] {
  const mk = (
    id: string,
    name: string,
    sex: Sex,
    h: number,
    birth: string,
    goal: number,
    spec: Omit<DemoSpec, 'sex'>,
  ): DemoClient => ({
    id,
    name,
    profile: { ...DEFAULT_PROFILE, name, sex, heightCm: h, birthDate: birth, goalWeightKg: goal, stepGoal: 10000 },
    days: generateDemo({ ...spec, sex }, today),
  });
  return [
    mk('c1', 'Анна К.', 'female', 165, '1991-05-02', 60, { seed: 11, startWeight: 66.5, trueTdee: 2050, intake: 1600, days: 63 }),
    mk('c2', 'Дмитрий С.', 'male', 182, '1985-09-20', 85, { seed: 22, startWeight: 94, trueTdee: 2900, intake: 2300, days: 70 }),
    mk('c3', 'Ольга П.', 'female', 170, '1988-01-11', 65, { seed: 33, startWeight: 73.5, trueTdee: 2150, intake: 1900, days: 50, noWeighTail: 3 }),
    mk('c4', 'Сергей В.', 'male', 178, '1979-12-03', 80, { seed: 44, startWeight: 86, trueTdee: 2600, intake: 2150, days: 60 }),
    mk('c5', 'Мария Л.', 'female', 160, '1995-07-30', 55, { seed: 55, startWeight: 60, trueTdee: 1950, intake: 1600, days: 45, tripAt: 42 }),
    mk('c6', 'Алексей Н.', 'male', 185, '1990-04-17', 84, { seed: 66, startWeight: 77, trueTdee: 2750, intake: 3050, days: 56, noReportToday: true }),
    mk('c7', 'Елена Р.', 'female', 168, '1983-10-09', 62, { seed: 77, startWeight: 69, trueTdee: 2000, intake: 1650, days: 5 }),
  ];
}

/** Демо-дневник самого пользователя: 70 дней, поездка, пропуск 4 дня. */
export function demoDays(today: ISODate): DayMap {
  return generateDemo(
    { seed: 7, sex: 'male', startWeight: 81.5, trueTdee: 2480, intake: 1850, days: 70, tripAt: 40, gap: [52, 4] },
    today,
  );
}
