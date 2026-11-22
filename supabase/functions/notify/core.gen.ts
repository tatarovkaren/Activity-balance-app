// СОБРАНО АВТОМАТИЧЕСКИ из src/core командой `npm run fn:bundle`. Не править руками.
// Типы, которые серверу не нужны, заменены заглушками.
type GoalSetting = any;
type NotifyPrefs = any;

// ======== src/core/dates.ts ========
// Даты только по местному времени. Никогда не использовать toISOString() для строки даты:
// в Москве (UTC+3) она откатывает дату на сутки (урок прототипа).

export type ISODate = string; // 'ГГГГ-ММ-ДД'

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalISO(d: Date): ISODate {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function todayISO(now: Date = new Date()): ISODate {
  return toLocalISO(now);
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Полдень местного времени — устойчиво к переходам на летнее время. */
export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function shiftDate(iso: ISODate, delta: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + delta);
  return toLocalISO(d);
}

export function dayDiff(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

/** Тот же день следующего месяца; если такого дня нет — последний день месяца. */
export function addMonthsClamped(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(d, last));
  return toLocalISO(target);
}

export function ageAt(birthDate: ISODate | undefined, iso: ISODate): number | null {
  if (!birthDate || !isISODate(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age >= 0 ? age : null;
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = dayDiff(from, to);
  for (let i = 0; i <= n; i++) out.push(shiftDate(from, i));
  return out;
}

/** Ячейки месяца: null — пустые клетки до первого числа. weekStart: 1 — с понедельника, 0 — с воскресенья. */
export function monthCells(year: number, month0: number, weekStart: 0 | 1): (ISODate | null)[] {
  const first = new Date(year, month0, 1, 12);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const n = new Date(year, month0 + 1, 0, 12).getDate();
  const out: (ISODate | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= n; d++) out.push(toLocalISO(new Date(year, month0, d, 12)));
  while (out.length % 7) out.push(null);
  return out;
}

// Форматирование дат для интерфейса (по языку) — в src/i18n/format.ts.

// ======== src/core/types.ts ========
export type Sex = 'male' | 'female';
export type ThemePref = 'system' | 'light' | 'dark';
/** Размер шрифта: обычный или крупный (для слабого зрения). */
export type TextSize = 'normal' | 'large';
export const TEXT_SIZES: TextSize[] = ['normal', 'large'];
/** Языки интерфейса. Новый язык: добавить код сюда и словарь в src/i18n (см. docs/i18n.md). */
export type Lang = 'ru' | 'en';
export type LangPref = 'system' | Lang;
export type MeasureFreq = 'week' | '2weeks' | 'month';
export type Plan = 'free' | 'premium';
/** Режим интерфейса: «базовый» прячет сложные показатели, расчёт одинаковый. */
export type UiMode = 'basic' | 'advanced';
export const UI_MODES: UiMode[] = ['basic', 'advanced'];

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
  /** Размер шрифта. Нет поля — обычный. */
  textSize?: TextSize;
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
  /** Базовый — для неподготовленного клиента (по умолчанию), продвинутый — все показатели. */
  uiMode: UiMode;
  /** Анкета первого входа пройдена (пол, дата рождения, рост, вес). Нет — показываем анкету. */
  onboarded?: boolean;
  /** Напоминать на «Дне», если резервной копии не было 7 дней. Нет поля — да. */
  backupReminder?: boolean;
  /** Уведомления: что и во сколько присылать (пуши, Telegram). Нет поля — по умолчанию (core/notify.ts). */
  notify?: Partial<NotifyPrefs>;
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
  uiMode: 'basic',
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
  /** Бёдра — по ягодицам в самом широком месте. У женщин входит в формулу % жира, у мужчин — по желанию. */
  hips?: number;
  /** Необязательные замеры, в формулу не входят: грудь (по соскам) и бицепс (напряжённый, в самом широком месте). */
  chest?: number;
  biceps?: number;
  comment?: string;
  wellbeing?: number;
  anomaly?: AnomalyReason;
  /**
   * Приёмы пищи, посчитанные по фото (пометка «по фото»). Их КБЖУ уже входит в kcal/protein/fat/carbs дня:
   * запись по фото прибавляется к записанному, импорт FatSecret — к сумме этих приёмов (см. core/photo/meals.ts).
   */
  photoMeals?: PhotoMeal[];
  /** Отчёт дня отправлен куратору (время, мс). */
  reportSentAt?: number;
  updatedAt?: number;
  /**
   * Когда поле записал Telegram-бот (мс). Приложение не затирает такое поле своей старой копией дня,
   * пока не увидит эту запись с сервера (keepBotWrites в core/merge.ts).
   */
  botAt?: Partial<Record<'weight' | 'steps' | 'wellbeing', number>>;
}

/** Приём пищи в дневнике. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Продукт в приёме по фото: итоговые граммы и что предложил ИИ (для калибровки). */
export interface PhotoMealItem {
  name: string;
  foodId?: string;
  grams: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
  /** Граммы в оценке ИИ до правки пользователя; нет поля — продукт добавлен вручную. */
  estGrams?: number;
  /** Вес «сухим/сырым» для тех, кто так ведёт дневник. */
  diaryGrams?: number;
}

/** Подтверждённый приём пищи по фото. Снимки не хранятся. */
export interface PhotoMeal {
  id: string;
  meal: MealSlot;
  /** Время подтверждения, мс. */
  at: number;
  /** id провайдера (manual / demo / http), не модель. */
  provider: string;
  kcal: number;
  p: number;
  f: number;
  c: number;
  kcalMin: number;
  kcalMax: number;
  rangePct: number;
  /** Скрытое масло, ккал (входит в kcal). */
  oilKcal?: number;
  items: PhotoMealItem[];
}

export type DayMap = Record<ISODate, DayEntry>;

/** Автоматически найденные необычные дни, которые пользователь вернул в расчёт. */
export type KeepMap = Record<ISODate, true>;

// ======== src/core/body.ts ========
// % жира по ВМС США, нормы по возрасту и график замеров.


export function navyBodyFat(
  sex: Sex,
  m: { neck?: number; waist?: number; hips?: number },
  heightCm: number,
): number | null {
  const { neck, waist, hips } = m;
  if (!(neck && waist && heightCm)) return null;
  if (sex === 'male') {
    if (waist - neck <= 0) return null;
    const v = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
    return Number.isFinite(v) && v > 0 && v < 70 ? v : null;
  }
  if (!hips || waist + hips - neck <= 0) return null;
  const v = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450;
  return Number.isFinite(v) && v > 0 && v < 70 ? v : null;
}

/**
 * Норма % жира по возрасту. Мужские — из ТЗ прототипа; женские — ориентир,
 * перед запуском сверить с источником (как сказано в плане).
 */
export function bodyFatNorm(sex: Sex, age: number): [number, number] {
  const male: [number, [number, number]][] = [
    [30, [7, 17]],
    [40, [12, 21]],
    [50, [14, 23]],
    [60, [16, 24]],
    [999, [17, 25]],
  ];
  const female: [number, [number, number]][] = [
    [30, [16, 24]],
    [40, [17, 25]],
    [50, [19, 28]],
    [60, [22, 31]],
    [999, [22, 33]],
  ];
  const t = sex === 'male' ? male : female;
  for (const [lim, r] of t) if (age < lim) return r;
  return t[t.length - 1][1];
}

/** Варианты частоты замеров. Подписи — в словарях src/i18n. */
export const MEASURE_FREQS: MeasureFreq[] = ['week', '2weeks', 'month'];

export function hasMeasurement(e: { neck?: number; waist?: number; hips?: number } | undefined): boolean {
  return !!(e && (e.neck || e.waist || e.hips));
}

/** Необязательные замеры, которые не входят в формулу % жира. */
export type ExtraMeasureKey = 'chest' | 'biceps' | 'hips';

/** Какие замеры необязательные для этого пола: грудь и бицепс всем, бёдра — мужчинам (у женщин они в формуле). */
export function extraMeasureKeys(sex: Sex): ExtraMeasureKey[] {
  return sex === 'male' ? ['chest', 'biceps', 'hips'] : ['chest', 'biceps'];
}

/** Введены ли за день необязательные замеры (грудь, бицепс). */
export function hasExtraMeasurement(e: { chest?: number; biceps?: number } | undefined): boolean {
  return !!(e && (e.chest || e.biceps));
}

/** Любой замер тела за день — для подсказок последних значений и графика объёмов. */
export function hasAnyMeasurement(e: { neck?: number; waist?: number; hips?: number; chest?: number; biceps?: number } | undefined): boolean {
  return hasMeasurement(e) || hasExtraMeasurement(e);
}

export function nextMeasureDate(last: ISODate, freq: MeasureFreq): ISODate {
  if (freq === 'week') return shiftDate(last, 7);
  if (freq === '2weeks') return shiftDate(last, 14);
  return addMonthsClamped(last, 1);
}

export type MeasureHint =
  | { kind: 'none' }
  | { kind: 'first' }
  | { kind: 'next'; date: ISODate; inDays: number }
  | { kind: 'due'; last: ISODate; agoDays: number };

export function measureHint(days: DayMap, sel: ISODate, freq: MeasureFreq): MeasureHint {
  if (hasMeasurement(days[sel])) return { kind: 'none' };
  const last = Object.keys(days)
    .filter((d) => d <= sel && hasMeasurement(days[d]))
    .sort()
    .pop();
  if (!last) return { kind: 'first' };
  const next = nextMeasureDate(last, freq);
  if (next > sel) return { kind: 'next', date: next, inDays: dayDiff(sel, next) };
  return { kind: 'due', last, agoDays: dayDiff(last, sel) };
}

/** Последний % жира на дату (для БМР по сухой массе и графиков). */
export function lastBodyFat(days: DayMap, sel: ISODate, sex: Sex, heightCm: number): number | undefined {
  const ds = Object.keys(days)
    .filter((d) => d <= sel && hasMeasurement(days[d]))
    .sort()
    .reverse();
  for (const d of ds) {
    const v = navyBodyFat(sex, days[d], heightCm);
    if (v != null) return v;
  }
  return undefined;
}

/**
 * Последние замеры до даты (строго раньше sel) — чтобы показывать их серым,
 * пока за выбранный день не введены новые. В день ничего не записывается.
 * Каждое поле — своё последнее значение; % жира — последний день, где он считается.
 */
export type CarriedMeasure = {
  neck?: number;
  waist?: number;
  hips?: number;
  chest?: number;
  biceps?: number;
  /** % жира по ВМС США и дата замера, по которому он посчитан */
  bf?: { v: number; date: ISODate };
};

export function carriedMeasure(days: DayMap, sel: ISODate, sex: Sex, heightCm: number): CarriedMeasure | null {
  const ds = Object.keys(days)
    .filter((d) => d < sel && hasAnyMeasurement(days[d]))
    .sort()
    .reverse();
  if (!ds.length) return null;
  const out: CarriedMeasure = {};
  for (const d of ds) {
    const e = days[d];
    if (out.neck == null && e.neck) out.neck = e.neck;
    if (out.waist == null && e.waist) out.waist = e.waist;
    if (out.hips == null && e.hips) out.hips = e.hips;
    if (out.chest == null && e.chest) out.chest = e.chest;
    if (out.biceps == null && e.biceps) out.biceps = e.biceps;
    if (!out.bf) {
      const v = navyBodyFat(sex, e, heightCm);
      if (v != null) out.bf = { v, date: d };
    }
    if (out.neck != null && out.waist != null && out.hips != null && out.chest != null && out.biceps != null && out.bf) break;
  }
  return out;
}

// ======== src/core/energy.ts ========
// Формулы расхода энергии (ТЗ v35, раздел 5) с режимом мужчина / женщина.
// Итог = БМР + шаги + тренировка + переваривание. Всё, кроме БМР, — «сверх покоя».


export const KCAL_PER_KG = 7700;
export const DEFAULT_PACE = 130; // шаг/мин, пока нет своих тренировок с шагами
export const PACE_MIN = 40;
export const PACE_MAX = 200;

export type WorkoutKind = 'none' | 'strength' | 'cardioNoSteps' | 'cardioLegs';

// Тип тренировки — свободный текст на любом языке интерфейса (русские и английские слова).
const STRENGTH_RE =
  /сил|зал|желез|отжим|присед|подтяг|выпад|планк|пресс|собствен|турник|брус|гантел|штанг|гири|гиря|strength|gym|weight|lift|push-?up|squat|pull-?up|chin-?up|lunge|plank|\babs\b|calisthenic|dumbbell|barbell|kettlebell|resistance/;
const NO_STEP_RE = /вело|плав|бассейн|гребл|байдар|bike|cycl|swim|pool|\brow|kayak|canoe/;

export function classifyWorkout(type: string | undefined, minutes: number | undefined, choice?: 'cardio' | 'strength'): WorkoutKind {
  if (!(minutes && minutes > 0)) return 'none';
  const t = String(type || '').toLowerCase();
  // вид выбран явно: «силовая» — по нагрузке; «кардио» — по пульсу, а шаги вычитаются,
  // только если по названию это не вело/плавание/гребля
  if (choice === 'strength') return 'strength';
  if (choice === 'cardio') return NO_STEP_RE.test(t) ? 'cardioNoSteps' : 'cardioLegs';
  if (/^\s*(нет|none|no)\s*$/.test(t)) return 'none';
  if (STRENGTH_RE.test(t)) return 'strength';
  if (NO_STEP_RE.test(t)) return 'cardioNoSteps';
  return 'cardioLegs';
}

export function mifflin(sex: Sex, w: number, h: number, age: number): number {
  return 10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161);
}

/** БМР по сухой массе (Кетч — МакАрдл): 370 + 21,6 × сухая масса. */
export function leanMassBmr(w: number, bodyFatPct: number): number {
  return 370 + 21.6 * w * (1 - bodyFatPct / 100);
}

/** Формула Кейтеля, валовые ккал/мин по среднему пульсу. */
export function keytelGross(sex: Sex, hr: number, w: number, age: number): number {
  return sex === 'male'
    ? (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184
    : (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184;
}

export function macroKcal(p?: number, f?: number, c?: number): number | undefined {
  if (p == null && f == null && c == null) return undefined;
  return (p || 0) * 4 + (f || 0) * 9 + (c || 0) * 4;
}

/** Ккал дня: введённые вручную или посчитанные по БЖУ. */
export function dayKcal(e: DayEntry | undefined): number | undefined {
  if (!e) return undefined;
  if (e.kcal != null && e.kcal > 0) return e.kcal;
  const m = macroKcal(e.protein, e.fat, e.carbs);
  return m && m > 0 ? m : undefined;
}

/** Вес из записи дня, а если его нет — ближайший за предыдущие 3 дня. */
export function weightNear(days: DayMap, iso: ISODate): number | undefined {
  for (let i = 0; i < 4; i++) {
    const w = days[shiftDate(iso, -i)]?.weight;
    if (w && w > 0) return w;
  }
  return undefined;
}

/**
 * Личный темп шагов на кардио на ногах = Σ введённых шагов / Σ минут по прошлым дням,
 * ограничение 40–200 шаг/мин; без своих данных — 130.
 */
export class PaceIndex {
  private dates: ISODate[] = [];
  private cumSteps: number[] = [];
  private cumMin: number[] = [];

  constructor(days: DayMap) {
    const list = Object.keys(days)
      .filter((d) => {
        const e = days[d];
        return (
          classifyWorkout(e.workoutType, e.workoutMin, e.workoutKind) === 'cardioLegs' &&
          e.workoutSteps != null &&
          e.workoutSteps > 0
        );
      })
      .sort();
    let s = 0;
    let m = 0;
    for (const d of list) {
      s += days[d].workoutSteps!;
      m += days[d].workoutMin!;
      this.dates.push(d);
      this.cumSteps.push(s);
      this.cumMin.push(m);
    }
  }

  /** Темп по тренировкам строго до даты iso. */
  paceBefore(iso: ISODate): { pace: number; personal: boolean } {
    let lo = 0;
    let hi = this.dates.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.dates[mid] < iso) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return { pace: DEFAULT_PACE, personal: false };
    const p = this.cumSteps[lo - 1] / this.cumMin[lo - 1];
    return { pace: Math.min(PACE_MAX, Math.max(PACE_MIN, p)), personal: true };
  }
}

export interface EnergyResult {
  bmr: number;
  neat: number;
  train: number;
  tef: number;
  total: number;
  intake: number | undefined;
  weight: number;
  age: number;
  kind: WorkoutKind;
  /** Сколько шагов вычтено из дневных как уже учтённые в тренировке. */
  workoutStepsDeducted: number;
  workoutStepsSource: 'tracker' | 'estimate' | 'none';
  pace: number;
  pacePersonal: boolean;
}

export interface EnergyCtx {
  profile: Pick<Profile, 'sex' | 'birthDate' | 'heightCm' | 'bmrFormula'>;
  /** Вес на случай, если в записи дня его нет. */
  fallbackWeight?: number;
  pace?: { pace: number; personal: boolean };
  /** Последний известный % жира (для БМР по сухой массе). */
  bodyFatPct?: number;
}

export function energyModel(e: DayEntry, iso: ISODate, ctx: EnergyCtx): EnergyResult | null {
  const { sex, heightCm: h, birthDate, bmrFormula } = ctx.profile;
  const age = ageAt(birthDate, iso);
  const w = e.weight && e.weight > 0 ? e.weight : ctx.fallbackWeight;
  if (!(w && w > 0 && h > 0 && age != null)) return null;

  const bmr =
    bmrFormula === 'lean' && ctx.bodyFatPct && ctx.bodyFatPct > 0
      ? leanMassBmr(w, ctx.bodyFatPct)
      : mifflin(sex, w, h, age);

  const min = e.workoutMin || 0;
  const hr = e.hrAvg || 0;
  const kind = classifyWorkout(e.workoutType, min, e.workoutKind);
  const steps = e.steps || 0;
  const pace = ctx.pace || { pace: DEFAULT_PACE, personal: false };

  // Трекер считает шаги и на орбитреке — их расход уже входит в тренировку, не задваиваем.
  let deducted = 0;
  let source: EnergyResult['workoutStepsSource'] = 'none';
  if (kind === 'cardioLegs') {
    if (e.workoutSteps != null && e.workoutSteps >= 0) {
      deducted = Math.min(steps, e.workoutSteps);
      source = 'tracker';
    } else {
      deducted = Math.min(steps, Math.round(min * pace.pace));
      source = 'estimate';
    }
  }
  const neat = (steps - deducted) * 0.00042 * w; // ≈0,55 ккал/кг/км при шаге ~0,75 м

  let train = 0;
  if (kind === 'strength') {
    train = (3.5 * w * min) / 60; // силовая по нагрузке, не по пульсу
  } else if (kind !== 'none') {
    if (hr > 0) train = Math.max(0, keytelGross(sex, hr, w, age) - bmr / 1440) * min;
    else train = (4 * w * min) / 60;
  }

  const intake = dayKcal(e);
  const P = e.protein || 0;
  const F = e.fat || 0;
  const C = e.carbs || 0;
  const tef = P || F || C ? 0.25 * P * 4 + 0.07 * C * 4 + 0.02 * F * 9 : 0.1 * (intake || 0);

  return {
    bmr,
    neat,
    train,
    tef,
    total: bmr + neat + train + tef,
    intake,
    weight: w,
    age,
    kind,
    workoutStepsDeducted: deducted,
    workoutStepsSource: source,
    pace: pace.pace,
    pacePersonal: pace.personal,
  };
}

/** Средние за окно дней (для блока «7 дней»). */
export function windowStats(
  days: DayMap,
  sel: ISODate,
  n: number,
  model: (e: DayEntry, d: ISODate) => EnergyResult | null,
): { intake: number; total: number; n: number } | null {
  let si = 0;
  let st = 0;
  let k = 0;
  for (let i = 0; i < n; i++) {
    const d = shiftDate(sel, -i);
    const e = days[d];
    if (!e) continue;
    const m = model(e, d);
    if (!m || !(m.intake && m.intake > 0)) continue;
    si += m.intake;
    st += m.total;
    k++;
  }
  return k ? { intake: si / k, total: st / k, n: k } : null;
}

// ======== src/core/adaptive.ts ========
// «Расход по факту» — адаптивная оценка без необычных дней (ТЗ v35, раздел «Баланс энергии»).
// Ключевая функция продукта: честность важнее скорости реакции.


export const PARAMS = {
  MIN_W: 14, // взвешиваний за 28 дней для полного доверия
  MIN_K: 20, // дней с калориями за 28 дней для полного доверия
  GAP_WARN: 3,
  HALF_LIFE: 14,
  WIN: 56,
  STEP: 50, // максимальный сдвиг показателя за день, ккал
  MAX_DAYS: 400,
  EXCL_SHARE: 0.2,
};

export interface WLSFit {
  slope: number;
  at: (x: number) => number;
}

/** Взвешенный МНК: pts = [x, y, w]. */
export function wls(pts: [number, number, number][]): WLSFit | null {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sw += p[2];
    sx += p[2] * p[0];
    sy += p[2] * p[1];
  }
  if (!sw) return null;
  const mx = sx / sw;
  const my = sy / sw;
  let nu = 0;
  let de = 0;
  for (const p of pts) {
    nu += p[2] * (p[0] - mx) * (p[1] - my);
    de += p[2] * (p[0] - mx) * (p[0] - mx);
  }
  if (!de) return null;
  const b = nu / de;
  return { slope: b, at: (x) => my + b * (x - mx) };
}

/**
 * Причина исключения дня: ручная отметка или автонаходка.
 * Автонаходка «мало калорий» считается как «неполный дневник» (incomplete), скачок веса — weightJump.
 * Текст подписей — в словарях src/i18n, ядро отдаёт только коды и числа.
 */
export type ExclReason = AnomalyReason | 'weightJump';

/** Пояснение автонаходки: отклонение веса от тренда (кг) или калории дня против обычных. */
export type AutoDetail = { kind: 'weightJump'; dv: number } | { kind: 'lowKcal'; kcal: number; usual: number };

export interface AutoItem {
  d: ISODate;
  detail: AutoDetail;
}

export interface ExclItem {
  d: ISODate;
  why: ExclReason;
  auto: boolean;
  /** Пояснение автонаходки (только для auto). */
  detail?: AutoDetail;
}

export interface SeriesPoint {
  d: ISODate;
  E: number | null;
  formula: number | null;
  excl: boolean;
}

export type Reliability = 'high' | 'medium' | 'low';

export interface AdaptiveResult {
  E: number | null;
  formula: number | null;
  fact: number | null;
  /** Наклон тренда, кг/день. */
  slope: number | null;
  trendW: number | null;
  alpha: number;
  nW28: number;
  nK28: number;
  nWts: number;
  excl28: number;
  normal28: number;
  exclShare: number;
  reasons: Partial<Record<ExclReason, number>>;
  gap: number;
  reliability: Reliability;
  autoList: AutoItem[];
  exclList: ExclItem[];
  kept: AutoItem[];
  recList: ISODate[];
  series: SeriesPoint[];
}

export function reliabilityOf(r: Pick<AdaptiveResult, 'alpha' | 'exclShare' | 'gap'>): Reliability {
  if (r.alpha >= 1 && r.exclShare <= PARAMS.EXCL_SHARE && r.gap < PARAMS.GAP_WARN) return 'high';
  if (r.alpha < 0.5 || r.gap >= PARAMS.GAP_WARN) return 'low';
  return 'medium';
}

export interface ModelCtx {
  profile: Profile;
  days: DayMap;
}

/** Модель расхода для дня с учётом темпа шагов, веса за прошлые дни и % жира. */
export function makeDayModel(ctx: ModelCtx) {
  const pace = new PaceIndex(ctx.days);
  return (e: DayEntry, d: ISODate, fallbackWeight?: number): EnergyResult | null =>
    energyModel(e, d, {
      profile: ctx.profile,
      fallbackWeight: fallbackWeight ?? weightNear(ctx.days, d),
      pace: pace.paceBefore(d),
      bodyFatPct:
        ctx.profile.bmrFormula === 'lean'
          ? lastBodyFat(ctx.days, d, ctx.profile.sex, ctx.profile.heightCm)
          : undefined,
    });
}

export function adaptiveTDEE(sel: ISODate, ctx: ModelCtx, keep: KeepMap): AdaptiveResult | null {
  const { days: all } = ctx;
  const P = PARAMS;
  const model = makeDayModel(ctx);
  const has = (d: ISODate) => {
    const e = all[d];
    return !!e && ((e.weight || 0) > 0 || (dayKcal(e) || 0) > 0);
  };
  const known = Object.keys(all)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= sel && has(d))
    .sort();
  if (!known.length) return null;
  let start = known[0];
  const lim = shiftDate(sel, -P.MAX_DAYS);
  if (start < lim) start = lim;
  const n = dayDiff(start, sel) + 1;
  const days: ISODate[] = [];
  for (let i = 0; i < n; i++) days.push(shiftDate(start, i));

  const W: Record<string, number> = {};
  const K: Record<string, number> = {};
  const man: Record<string, AnomalyReason | undefined> = {};
  const F: Record<string, number> = {};
  let lastW = 0;
  for (const d of days) {
    const e = all[d] || {};
    const wv = e.weight || 0;
    W[d] = wv > 0 ? wv : 0;
    if (wv > 0) lastW = wv;
    const k = dayKcal(e) || 0;
    K[d] = k > 0 ? k : 0;
    man[d] = e.anomaly;
    const m = all[d] && K[d] > 0 ? model(e, d, lastW || undefined) : null;
    F[d] = m ? m.total : 0;
  }

  // Проход 1: необычные дни (ручные главнее авто), дни восстановления для тренда.
  const excl: Record<string, boolean> = {};
  const why: Record<string, ExclReason> = {};
  const auto: Record<string, boolean> = {};
  const rec: Record<string, boolean> = {};
  const autoList: AutoItem[] = [];
  const kept: AutoItem[] = [];
  let wRun = 0;
  let exRun = 0;
  let lastExEnd = -99;
  let lastExRun = 0;
  days.forEach((d, i) => {
    const manual = man[d];
    if (manual) {
      excl[d] = true;
      why[d] = manual;
    } else {
      let a: { r: ExclReason; detail: AutoDetail } | null = null;
      if (W[d] > 0 && wRun < 3) {
        const pts: [number, number, number][] = [];
        for (let j = Math.max(0, i - 21); j < i; j++) {
          const dj = days[j];
          if (W[dj] > 0 && !excl[dj] && !rec[dj]) pts.push([j, W[dj], 1]);
        }
        if (pts.length >= 5) {
          const f = wls(pts);
          if (f) {
            const pred = f.at(i);
            const dv = W[d] - pred;
            if (Math.abs(dv) > Math.max(1.0, 0.015 * pred))
              a = { r: 'weightJump', detail: { kind: 'weightJump', dv: Math.round(dv * 10) / 10 } };
          }
        }
      }
      if (!a && K[d] > 0) {
        const ks: number[] = [];
        for (let j = Math.max(0, i - 14); j < i; j++) {
          const dj = days[j];
          if (K[dj] > 0 && !excl[dj]) ks.push(K[dj]);
        }
        if (ks.length >= 5) {
          ks.sort((x, y) => x - y);
          const med = ks[Math.floor(ks.length / 2)];
          if (K[d] < 0.5 * med)
            a = { r: 'incomplete', detail: { kind: 'lowKcal', kcal: Math.round(K[d]), usual: Math.round(med) } };
        }
      }
      if (a && !keep[d]) {
        excl[d] = true;
        why[d] = a.r;
        auto[d] = true;
        autoList.push({ d, detail: a.detail });
      } else if (a && keep[d]) kept.push({ d, detail: a.detail });
      wRun = a && a.r === 'weightJump' ? wRun + 1 : 0;
    }
    if (excl[d]) {
      exRun++;
      lastExEnd = i;
      lastExRun = exRun;
    } else {
      exRun = 0;
      if (i - lastExEnd <= (lastExRun >= 2 ? 3 : 2)) rec[d] = true;
    }
  });

  // Проход 2: оценка день за днём.
  let E: number | null = null;
  let out: AdaptiveResult | null = null;
  const series: SeriesPoint[] = [];
  days.forEach((t, i) => {
    const wp: [number, number, number][] = [];
    const kp: [number, number][] = [];
    let nW28 = 0;
    let nK28 = 0;
    let excl28 = 0;
    let normal28 = 0;
    const reasons: Partial<Record<ExclReason, number>> = {};
    for (let j = Math.max(0, i - P.WIN + 1); j <= i; j++) {
      const d = days[j];
      const age = i - j;
      const w = Math.pow(0.5, age / P.HALF_LIFE);
      if (!excl[d] && !rec[d] && W[d] > 0) wp.push([j, W[d], w]);
      if (!excl[d] && K[d] > 0) kp.push([K[d], w]);
      if (age < 28) {
        if (excl[d]) {
          excl28++;
          reasons[why[d]] = (reasons[why[d]] || 0) + 1;
        } else {
          if (W[d] > 0 && !rec[d]) nW28++;
          if (K[d] > 0) nK28++;
          if (W[d] > 0 || K[d] > 0) normal28++;
        }
      }
    }
    let slope: number | null = null;
    let trendW: number | null = null;
    if (wp.length >= 8 && wp[wp.length - 1][0] - wp[0][0] >= 15) {
      const f = wls(wp);
      if (f) {
        slope = f.slope;
        trendW = f.at(i);
      }
    }
    let fact: number | null = null;
    if (slope != null && kp.length) {
      let sw = 0;
      let sk = 0;
      for (const p of kp) {
        sw += p[1];
        sk += p[1] * p[0];
      }
      fact = sk / sw - slope * KCAL_PER_KG;
    }
    const fs: number[] = [];
    for (let j = i; j >= 0 && fs.length < 7 && i - j < 28; j--) {
      const d = days[j];
      if (!excl[d] && F[d] > 0) fs.push(F[d]);
    }
    const formula = fs.length ? fs.reduce((a, b) => a + b, 0) / fs.length : null;
    const exclShare = excl28 / 28;
    let alpha = fact == null ? 0 : Math.min(1, nW28 / P.MIN_W, nK28 / P.MIN_K);
    if (exclShare > P.EXCL_SHARE) alpha *= 0.5;
    if (formula != null) {
      const T = (1 - alpha) * formula + alpha * (fact != null ? fact : formula);
      E = E == null ? formula : E + Math.max(-P.STEP, Math.min(P.STEP, T - E));
    }
    if (n - 1 - i < P.WIN) series.push({ d: t, E, formula, excl: !!excl[t] });
    if (i === n - 1) {
      let gapW = 0;
      let runW = 0;
      let gapK = 0;
      let runK = 0;
      for (let j = Math.max(0, i - 27); j <= i; j++) {
        const d = days[j];
        if (W[d] > 0) runW = 0;
        else {
          runW++;
          gapW = Math.max(gapW, runW);
        }
        if (K[d] > 0) runK = 0;
        else {
          runK++;
          gapK = Math.max(gapK, runK);
        }
      }
      const first28 = Math.max(0, i - 27);
      const gapLimit = i - first28 + 1;
      const base = {
        E,
        formula,
        fact,
        slope,
        alpha,
        nW28,
        nK28,
        nWts: wp.length,
        excl28,
        normal28,
        exclShare,
        reasons,
        gap: Math.min(Math.max(gapW, gapK), gapLimit),
        trendW,
      };
      out = {
        ...base,
        reliability: reliabilityOf(base),
        autoList: autoList.filter((a) => dayDiff(a.d, sel) < 28),
        exclList: days
          .filter((d) => excl[d] && dayDiff(d, sel) < 28)
          .map((d) => ({
            d,
            why: why[d],
            auto: !!auto[d],
            detail: autoList.find((a) => a.d === d)?.detail,
          })),
        kept: kept.filter((a) => dayDiff(a.d, sel) < 28),
        recList: days.filter((d) => rec[d] && dayDiff(d, sel) < 28),
        series,
      };
    }
  });
  return out;
}

// ---- Прогноз даты цели ----

export type GoalForecast =
  | { kind: 'noGoal' }
  | { kind: 'noWeight'; goal: number }
  | { kind: 'reached'; goal: number }
  | { kind: 'noTrend'; goal: number }
  | { kind: 'notApproaching'; goal: number; paceKgWeek: number; current: number }
  | { kind: 'tooLong'; goal: number; paceKgWeek: number }
  | {
      kind: 'date';
      goal: number;
      date: ISODate;
      days: number;
      paceKgWeek: number;
      left: number;
      rough: boolean;
    };

export function goalForecast(
  r: AdaptiveResult | null,
  sel: ISODate,
  goal: number | undefined,
  currentWeight: number | undefined,
): GoalForecast {
  if (!goal) return { kind: 'noGoal' };
  const cur = (r && r.trendW) || currentWeight;
  if (!cur) return { kind: 'noWeight', goal };
  const need = goal - cur;
  if (Math.abs(need) < 0.1) return { kind: 'reached', goal };
  if (!r || r.slope == null) return { kind: 'noTrend', goal };
  const wk = r.slope * 7;
  if (Math.sign(wk) !== Math.sign(need) || Math.abs(wk) < 0.05)
    return { kind: 'notApproaching', goal, paceKgWeek: wk, current: cur };
  const days = Math.round(need / r.slope);
  if (days > 730) return { kind: 'tooLong', goal, paceKgWeek: wk };
  return { kind: 'date', goal, date: shiftDate(sel, days), days, paceKgWeek: wk, left: need, rough: r.alpha < 1 };
}
