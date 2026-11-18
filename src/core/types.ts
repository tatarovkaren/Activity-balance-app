import type { ISODate } from './dates';
import type { GoalSetting } from './targets';

export type Sex = 'male' | 'female';
export type ThemePref = 'system' | 'light' | 'dark';
/** Языки интерфейса. Новый язык: добавить код сюда и словарь в src/i18n (см. docs/i18n.md). */
export type Lang = 'ru' | 'en';
export type LangPref = 'system' | Lang;
export type MeasureFreq = 'week' | '2weeks' | 'month';
export type Plan = 'free' | 'premium';

/** Причины ручной отметки «Необычный день». «cycle» — только в женском режиме. */
export type AnomalyReason = 'trip' | 'feast' | 'illness' | 'incomplete' | 'cycle' | 'other';

/** Порядок причин в интерфейсе. Подписи — в словарях src/i18n. */
export const ANOMALY_REASONS: AnomalyReason[] = ['trip', 'feast', 'illness', 'incomplete', 'cycle', 'other'];

export interface Profile {
  name: string;
  sex: Sex;
  birthDate: ISODate;
  heightCm: number;
  goalWeightKg?: number;
  stepGoal: number;
  measureFreq: MeasureFreq;
  theme: ThemePref;
  /** Язык интерфейса: «как в системе» по умолчанию. */
  lang: LangPref;
  /** Миффлин — Сан Жеор по умолчанию; «по сухой массе» (Кетч — МакАрдл) — если есть замер % жира. */
  bmrFormula: 'mifflin' | 'lean';
  /** Старая норма белка, г на кг общего веса. Заменена коэффициентом в режиме цели (goals); не показывается. */
  proteinPerKg?: number;
  /** История режимов «дефицит / поддержание / профицит» с датой начала (ТЗ v36, раздел 8). */
  goals?: GoalSetting[];
  /** Даты ручного «пересчитать сейчас» (последние 60). */
  goalRecalc?: ISODate[];
  /** Как пользователь ведёт дневник: крупы сухими/мясо сырым или в готовом виде. */
  diaryWeights: 'raw' | 'cooked';
  plan: Plan;
  /** Анкета первого входа пройдена (пол, дата рождения, рост, вес). Нет — показываем анкету. */
  onboarded?: boolean;
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
  lang: 'system',
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
  /** Название тренировки — свободный текст для куратора («ноги + спина», «интервалы»). */
  workoutType?: string;
  /** Вид тренировки для расчёта: выбирается жёстко. Нет поля (старые записи) — определяется по названию. */
  workoutKind?: 'cardio' | 'strength';
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
