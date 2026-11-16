import type { ISODate } from './dates';

export type Sex = 'male' | 'female';
export type ThemePref = 'system' | 'light' | 'dark';
export type MeasureFreq = 'week' | '2weeks' | 'month';
export type Plan = 'free' | 'premium';

/** Причины ручной отметки «Необычный день». «cycle» — только в женском режиме. */
export type AnomalyReason = 'trip' | 'feast' | 'illness' | 'incomplete' | 'cycle' | 'other';

export const ANOMALY_LABELS: Record<AnomalyReason, string> = {
  trip: 'поездка',
  feast: 'застолье',
  illness: 'болезнь',
  incomplete: 'неполный дневник',
  cycle: 'цикл',
  other: 'другое',
};

export interface Profile {
  name: string;
  sex: Sex;
  birthDate: ISODate;
  heightCm: number;
  goalWeightKg?: number;
  stepGoal: number;
  measureFreq: MeasureFreq;
  theme: ThemePref;
  /** Миффлин — Сан Жеор по умолчанию; «по сухой массе» (Кетч — МакАрдл) — если есть замер % жира. */
  bmrFormula: 'mifflin' | 'lean';
  /** Норма белка, г на кг общего веса (задаёт куратор). */
  proteinPerKg?: number;
  /** Как пользователь ведёт дневник: крупы сухими/мясо сырым или в готовом виде. */
  diaryWeights: 'raw' | 'cooked';
  plan: Plan;
}

export const DEFAULT_PROFILE: Profile = {
  name: '',
  sex: 'male',
  birthDate: '1990-01-01',
  heightCm: 175,
  goalWeightKg: undefined,
  stepGoal: 10000,
  measureFreq: 'month',
  theme: 'system',
  bmrFormula: 'mifflin',
  proteinPerKg: undefined,
  diaryWeights: 'raw',
  plan: 'free',
};

/**
 * Запись дня. Отсутствующее поле (undefined) = «нет данных», а не ноль (урок FatSecret).
 * Пустое значение никогда не затирает заполненное при импорте и синхронизации.
 */
export interface DayEntry {
  weight?: number;
  steps?: number;
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  /** true — ккал введены руками; иначе считаются как Б×4 + Ж×9 + У×4. */
  kcalManual?: boolean;
  workoutType?: string;
  workoutMin?: number;
  hrAvg?: number;
  hrMax?: number;
  /** Шаги на тренировке из трекера (только кардио на ногах). */
  workoutSteps?: number;
  neck?: number;
  waist?: number;
  hips?: number;
  comment?: string;
  wellbeing?: number;
  anomaly?: AnomalyReason;
  /** Отчёт дня отправлен куратору (время, мс). */
  reportSentAt?: number;
  updatedAt?: number;
}

export type DayMap = Record<ISODate, DayEntry>;

/** Автоматически найденные необычные дни, которые пользователь вернул в расчёт. */
export type KeepMap = Record<ISODate, true>;
