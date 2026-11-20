// Функция «notify» одним файлом. Собрано командой `npm run fn:bundle` из supabase/functions/notify/.
// Supabase → Edge Functions → Deploy a new function → Via Editor → имя «notify» → вставить весь файл.

// ======== core.gen.ts ========
// СОБРАНО АВТОМАТИЧЕСКИ из src/core командой `npm run fn:bundle`. Не править руками.
// Типы, которые серверу не нужны, заменены заглушками.
type GoalSetting = any;
type NotifyPrefs = any;

// ======== src/core/dates.ts ========
// Даты только по местному времени. Никогда не использовать toISOString() для строки даты:
// в Москве (UTC+3) она откатывает дату на сутки (урок прототипа).

type ISODate = string; // 'ГГГГ-ММ-ДД'

const pad = (n: number) => String(n).padStart(2, '0');

function toLocalISO(d: Date): ISODate {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayISO(now: Date = new Date()): ISODate {
  return toLocalISO(now);
}

function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Полдень местного времени — устойчиво к переходам на летнее время. */
function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function shiftDate(iso: ISODate, delta: number): ISODate {
  const d = parseISO(iso);
  d.setDate(d.getDate() + delta);
  return toLocalISO(d);
}

function dayDiff(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 864e5);
}

/** Тот же день следующего месяца; если такого дня нет — последний день месяца. */
function addMonthsClamped(iso: ISODate, months: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1, 12);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate();
  target.setDate(Math.min(d, last));
  return toLocalISO(target);
}

function ageAt(birthDate: ISODate | undefined, iso: ISODate): number | null {
  if (!birthDate || !isISODate(birthDate)) return null;
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = iso.split('-').map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age >= 0 ? age : null;
}

function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const n = dayDiff(from, to);
  for (let i = 0; i <= n; i++) out.push(shiftDate(from, i));
  return out;
}

/** Ячейки месяца: null — пустые клетки до первого числа. weekStart: 1 — с понедельника, 0 — с воскресенья. */
function monthCells(year: number, month0: number, weekStart: 0 | 1): (ISODate | null)[] {
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
type Sex = 'male' | 'female';
type ThemePref = 'system' | 'light' | 'dark';
/** Языки интерфейса. Новый язык: добавить код сюда и словарь в src/i18n (см. docs/i18n.md). */
type Lang = 'ru' | 'en';
type LangPref = 'system' | Lang;
type MeasureFreq = 'week' | '2weeks' | 'month';
type Plan = 'free' | 'premium';
/** Режим интерфейса: «базовый» прячет сложные показатели, расчёт одинаковый. */
type UiMode = 'basic' | 'advanced';
const UI_MODES: UiMode[] = ['basic', 'advanced'];

/** Причины ручной отметки «Необычный день». «cycle» — только в женском режиме. */
type AnomalyReason = 'trip' | 'feast' | 'illness' | 'incomplete' | 'cycle' | 'other';

/** Порядок причин в интерфейсе. Подписи — в словарях src/i18n. */
const ANOMALY_REASONS: AnomalyReason[] = ['trip', 'feast', 'illness', 'incomplete', 'cycle', 'other'];

interface Profile {
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
  /** Базовый — для неподготовленного клиента (по умолчанию), продвинутый — все показатели. */
  uiMode: UiMode;
  /** Анкета первого входа пройдена (пол, дата рождения, рост, вес). Нет — показываем анкету. */
  onboarded?: boolean;
  /** Напоминать на «Дне», если резервной копии не было 7 дней. Нет поля — да. */
  backupReminder?: boolean;
  /** Уведомления: что и во сколько присылать (пуши, Telegram). Нет поля — по умолчанию (core/notify.ts). */
  notify?: Partial<NotifyPrefs>;
}

const DEFAULT_PROFILE: Profile = {
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
interface DayEntry {
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
type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Продукт в приёме по фото: итоговые граммы и что предложил ИИ (для калибровки). */
interface PhotoMealItem {
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
interface PhotoMeal {
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

type DayMap = Record<ISODate, DayEntry>;

/** Автоматически найденные необычные дни, которые пользователь вернул в расчёт. */
type KeepMap = Record<ISODate, true>;

// ======== src/core/body.ts ========
// % жира по ВМС США, нормы по возрасту и график замеров.


function navyBodyFat(
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
function bodyFatNorm(sex: Sex, age: number): [number, number] {
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
const MEASURE_FREQS: MeasureFreq[] = ['week', '2weeks', 'month'];

function hasMeasurement(e: { neck?: number; waist?: number; hips?: number } | undefined): boolean {
  return !!(e && (e.neck || e.waist || e.hips));
}

function nextMeasureDate(last: ISODate, freq: MeasureFreq): ISODate {
  if (freq === 'week') return shiftDate(last, 7);
  if (freq === '2weeks') return shiftDate(last, 14);
  return addMonthsClamped(last, 1);
}

type MeasureHint =
  | { kind: 'none' }
  | { kind: 'first' }
  | { kind: 'next'; date: ISODate; inDays: number }
  | { kind: 'due'; last: ISODate; agoDays: number };

function measureHint(days: DayMap, sel: ISODate, freq: MeasureFreq): MeasureHint {
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
function lastBodyFat(days: DayMap, sel: ISODate, sex: Sex, heightCm: number): number | undefined {
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
type CarriedMeasure = {
  neck?: number;
  waist?: number;
  hips?: number;
  /** % жира по ВМС США и дата замера, по которому он посчитан */
  bf?: { v: number; date: ISODate };
};

function carriedMeasure(days: DayMap, sel: ISODate, sex: Sex, heightCm: number): CarriedMeasure | null {
  const ds = Object.keys(days)
    .filter((d) => d < sel && hasMeasurement(days[d]))
    .sort()
    .reverse();
  if (!ds.length) return null;
  const out: CarriedMeasure = {};
  for (const d of ds) {
    const e = days[d];
    if (out.neck == null && e.neck) out.neck = e.neck;
    if (out.waist == null && e.waist) out.waist = e.waist;
    if (out.hips == null && e.hips) out.hips = e.hips;
    if (!out.bf) {
      const v = navyBodyFat(sex, e, heightCm);
      if (v != null) out.bf = { v, date: d };
    }
    if (out.neck != null && out.waist != null && (sex === 'male' || out.hips != null) && out.bf) break;
  }
  return out;
}

// ======== src/core/energy.ts ========
// Формулы расхода энергии (ТЗ v35, раздел 5) с режимом мужчина / женщина.
// Итог = БМР + шаги + тренировка + переваривание. Всё, кроме БМР, — «сверх покоя».


const KCAL_PER_KG = 7700;
const DEFAULT_PACE = 130; // шаг/мин, пока нет своих тренировок с шагами
const PACE_MIN = 40;
const PACE_MAX = 200;

type WorkoutKind = 'none' | 'strength' | 'cardioNoSteps' | 'cardioLegs';

// Тип тренировки — свободный текст на любом языке интерфейса (русские и английские слова).
const STRENGTH_RE =
  /сил|зал|желез|отжим|присед|подтяг|выпад|планк|пресс|собствен|турник|брус|гантел|штанг|гири|гиря|strength|gym|weight|lift|push-?up|squat|pull-?up|chin-?up|lunge|plank|\babs\b|calisthenic|dumbbell|barbell|kettlebell|resistance/;
const NO_STEP_RE = /вело|плав|бассейн|гребл|байдар|bike|cycl|swim|pool|\brow|kayak|canoe/;

function classifyWorkout(type: string | undefined, minutes: number | undefined, choice?: 'cardio' | 'strength'): WorkoutKind {
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

function mifflin(sex: Sex, w: number, h: number, age: number): number {
  return 10 * w + 6.25 * h - 5 * age + (sex === 'male' ? 5 : -161);
}

/** БМР по сухой массе (Кетч — МакАрдл): 370 + 21,6 × сухая масса. */
function leanMassBmr(w: number, bodyFatPct: number): number {
  return 370 + 21.6 * w * (1 - bodyFatPct / 100);
}

/** Формула Кейтеля, валовые ккал/мин по среднему пульсу. */
function keytelGross(sex: Sex, hr: number, w: number, age: number): number {
  return sex === 'male'
    ? (-55.0969 + 0.6309 * hr + 0.1988 * w + 0.2017 * age) / 4.184
    : (-20.4022 + 0.4472 * hr - 0.1263 * w + 0.074 * age) / 4.184;
}

function macroKcal(p?: number, f?: number, c?: number): number | undefined {
  if (p == null && f == null && c == null) return undefined;
  return (p || 0) * 4 + (f || 0) * 9 + (c || 0) * 4;
}

/** Ккал дня: введённые вручную или посчитанные по БЖУ. */
function dayKcal(e: DayEntry | undefined): number | undefined {
  if (!e) return undefined;
  if (e.kcal != null && e.kcal > 0) return e.kcal;
  const m = macroKcal(e.protein, e.fat, e.carbs);
  return m && m > 0 ? m : undefined;
}

/** Вес из записи дня, а если его нет — ближайший за предыдущие 3 дня. */
function weightNear(days: DayMap, iso: ISODate): number | undefined {
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
class PaceIndex {
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

interface EnergyResult {
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

interface EnergyCtx {
  profile: Pick<Profile, 'sex' | 'birthDate' | 'heightCm' | 'bmrFormula'>;
  /** Вес на случай, если в записи дня его нет. */
  fallbackWeight?: number;
  pace?: { pace: number; personal: boolean };
  /** Последний известный % жира (для БМР по сухой массе). */
  bodyFatPct?: number;
}

function energyModel(e: DayEntry, iso: ISODate, ctx: EnergyCtx): EnergyResult | null {
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
function windowStats(
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


const PARAMS = {
  MIN_W: 14, // взвешиваний за 28 дней для полного доверия
  MIN_K: 20, // дней с калориями за 28 дней для полного доверия
  GAP_WARN: 3,
  HALF_LIFE: 14,
  WIN: 56,
  STEP: 50, // максимальный сдвиг показателя за день, ккал
  MAX_DAYS: 400,
  EXCL_SHARE: 0.2,
};

interface WLSFit {
  slope: number;
  at: (x: number) => number;
}

/** Взвешенный МНК: pts = [x, y, w]. */
function wls(pts: [number, number, number][]): WLSFit | null {
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
type ExclReason = AnomalyReason | 'weightJump';

/** Пояснение автонаходки: отклонение веса от тренда (кг) или калории дня против обычных. */
type AutoDetail = { kind: 'weightJump'; dv: number } | { kind: 'lowKcal'; kcal: number; usual: number };

interface AutoItem {
  d: ISODate;
  detail: AutoDetail;
}

interface ExclItem {
  d: ISODate;
  why: ExclReason;
  auto: boolean;
  /** Пояснение автонаходки (только для auto). */
  detail?: AutoDetail;
}

interface SeriesPoint {
  d: ISODate;
  E: number | null;
  formula: number | null;
  excl: boolean;
}

type Reliability = 'high' | 'medium' | 'low';

interface AdaptiveResult {
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

function reliabilityOf(r: Pick<AdaptiveResult, 'alpha' | 'exclShare' | 'gap'>): Reliability {
  if (r.alpha >= 1 && r.exclShare <= PARAMS.EXCL_SHARE && r.gap < PARAMS.GAP_WARN) return 'high';
  if (r.alpha < 0.5 || r.gap >= PARAMS.GAP_WARN) return 'low';
  return 'medium';
}

interface ModelCtx {
  profile: Profile;
  days: DayMap;
}

/** Модель расхода для дня с учётом темпа шагов, веса за прошлые дни и % жира. */
function makeDayModel(ctx: ModelCtx) {
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

function adaptiveTDEE(sel: ISODate, ctx: ModelCtx, keep: KeepMap): AdaptiveResult | null {
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

type GoalForecast =
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

function goalForecast(
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

// ======== webpush.ts ========
// Веб-пуш без сторонних библиотек: подпись VAPID (RFC 8292) и шифрование aes128gcm (RFC 8291 / 8188)
// на WebCrypto. Работает одинаково в Supabase Edge (Deno) и в Node 20+ (тесты src/core/notify.test.ts).

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const subtle = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array) => u as unknown as BufferSource;

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle().importKey('raw', buf(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle().sign('HMAC', k, buf(data)));
}

// ---- Ключи VAPID ----

/** Ключи сервера: закрытый в JWK (хранится в базе, таблица notify_secrets), открытый — 65 байт в base64url для приложения. */
interface VapidKeys {
  publicKey: string;
  privateJwk: JsonWebKey;
}

async function generateVapidKeys(): Promise<VapidKeys> {
  const kp = (await subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array(await subtle().exportKey('raw', kp.publicKey));
  const privateJwk = await subtle().exportKey('jwk', kp.privateKey);
  return { publicKey: b64url(raw), privateJwk };
}

/** Заголовок Authorization для службы пушей (Google, Mozilla, Apple). Подпись ES256, срок 12 часов. */
async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: subject })));
  const key = await subtle().importKey('jwk', { ...keys.privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, key, buf(enc.encode(head + '.' + body))));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${keys.publicKey}`;
}

// ---- Шифрование сообщения ----

interface PushSubscriptionKeys {
  endpoint: string;
  /** Открытый ключ браузера, base64url (65 байт). */
  p256dh: string;
  /** Секрет браузера, base64url (16 байт). */
  auth: string;
}

/** Тело запроса aes128gcm: соль, размер записи, открытый ключ сервера на один раз, шифротекст. */
async function encryptPayload(sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>, payload: Uint8Array, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Uint8Array> {
  const uaPublic = fromB64url(sub.p256dh);
  const authSecret = fromB64url(sub.auth);
  const ephemeral = (await subtle().generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await subtle().exportKey('raw', ephemeral.publicKey));
  const uaKey = await subtle().importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: uaKey } as EcdhKeyDeriveParams, ephemeral.privateKey, 256));
  const { cek, nonce } = await deriveKeys(shared, authSecret, uaPublic, asPublic, salt);
  const key = await subtle().importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  // одна запись: сообщение + разделитель 0x02 (последняя запись), без дополнения
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(concat(payload, new Uint8Array([2])))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/** Общая часть для шифрования и расшифровки (расшифровку делает браузер; в тестах — мы). */
async function deriveKeys(shared: Uint8Array, authSecret: Uint8Array, uaPublic: Uint8Array, asPublic: Uint8Array, salt: Uint8Array) {
  const prkKey = await hmac(authSecret, shared);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  return { cek, nonce };
}

type PushResult = 'ok' | 'gone' | 'error';

/** Отправить одно сообщение на одно устройство. gone — подписка больше не действует, её надо удалить. */
async function sendWebPush(sub: PushSubscriptionKeys, message: unknown, keys: VapidKeys, subject: string, ttlSec = 12 * 3600): Promise<PushResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(message)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, keys, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSec),
      Urgency: 'normal',
    },
    body: buf(body) as BodyInit,
  });
  if (res.status === 404 || res.status === 410) return 'gone';
  return res.ok ? 'ok' : 'error';
}

// ======== logic.ts ========
// Логика функции «notify» без обращений к сети и базе: настройки, местное время, что пора отправить,
// тексты сообщений, разбор команд Telegram. Проверяется тестами src/core/notify.test.ts.
// Настройки пишет приложение в profiles.data.notify (тип NotifyPrefs в src/core/notify.ts — те же поля).


type Kind = 'weigh' | 'diary' | 'comment' | 'backup' | 'weekly' | 'test';

interface Prefs {
  weigh: { on: boolean; time: string };
  diary: { on: boolean; time: string };
  comment: { on: boolean };
  backup: { on: boolean };
  /** Сводка за неделю в Telegram по понедельникам. */
  weekly: { on: boolean };
  tz: string;
  lang: Lang;
  /** Адрес приложения (https) — для кнопки «Открыть» в Telegram и перехода из пуша. */
  appUrl?: string;
  /** Последняя резервная копия, мс. */
  backupAt?: number;
}

const DEFAULT_TZ = 'Europe/Moscow';

/** Время «ЧЧ:ММ» → минуты от полуночи; неверное — null. */
function parseTime(s: unknown): number | null {
  const m = typeof s === 'string' ? /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim()) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function validTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Настройки из профиля с подстановкой значений по умолчанию (как в приложении). */
function normPrefs(raw: unknown, profileLang?: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const on = (x: any, d: boolean) => (typeof x?.on === 'boolean' ? x.on : d);
  const time = (x: any, d: string) => (parseTime(x?.time) != null ? String(x.time).trim().padStart(5, '0') : d);
  const lang: Lang = r.lang === 'en' || r.lang === 'ru' ? r.lang : profileLang === 'en' ? 'en' : 'ru';
  const appUrl = typeof r.appUrl === 'string' && /^https:\/\/[^\s]+$/.test(r.appUrl) ? r.appUrl : undefined;
  return {
    weigh: { on: on(r.weigh, true), time: time(r.weigh, '08:00') },
    diary: { on: on(r.diary, true), time: time(r.diary, '21:00') },
    comment: { on: on(r.comment, true) },
    backup: { on: on(r.backup, true) },
    weekly: { on: on(r.weekly, true) },
    tz: validTz(r.tz) ? r.tz : DEFAULT_TZ,
    lang,
    appUrl,
    backupAt: typeof r.backupAt === 'number' ? r.backupAt : undefined,
  };
}

/** Местная дата (ГГГГ-ММ-ДД), минуты от полуночи и день недели (1 = пн) в часовом поясе пользователя. */
function localParts(now: Date, tz: string): { date: string; minutes: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday')) + 1;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, minutes: Number(g('hour')) * 60 + Number(g('minute')), weekday: wd };
}

/** Понедельник недели, в которую попадает местная дата (ключ «раз в неделю»). */
function weekKey(date: string, weekday: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (weekday - 1));
  return d.toISOString().slice(0, 10);
}

/** Напоминание приходит в выбранное время или позже, но не позже чем через 3 часа (если сервер спал — не будим ночью). */
const WINDOW_MIN = 180;
/** Напоминание о копии — в полдень, раз в неделю, если копии не было 7 дней. */
const BACKUP_TIME = 12 * 60;
/** Сводка за прошлую неделю (пн–вс) — в понедельник в 10:00 по местному времени, только в Telegram. */
const WEEKLY_TIME = 10 * 60;

interface DayFacts {
  weight?: unknown;
  kcal?: unknown;
  photoMeals?: unknown[];
  anomaly?: unknown;
}

interface Due {
  kind: Kind;
  /** Ключ в журнале notify_log: одно и то же сообщение не уходит дважды. */
  ref: string;
}

/** Какие напоминания пора отправить пользователю сейчас. Проверка журнала — снаружи (по ref). */
function dueReminders(p: Prefs, now: Date, today: DayFacts | undefined): Due[] {
  const l = localParts(now, p.tz);
  const inWindow = (t: string) => {
    const m = parseTime(t)!;
    return l.minutes >= m && l.minutes < m + WINDOW_MIN;
  };
  const out: Due[] = [];
  const has = (v: unknown) => v != null && v !== '';
  if (p.weigh.on && inWindow(p.weigh.time) && !has(today?.weight)) out.push({ kind: 'weigh', ref: 'weigh:' + l.date });
  const ate = has(today?.kcal) || (today?.photoMeals?.length || 0) > 0;
  if (p.diary.on && inWindow(p.diary.time) && !ate && !has(today?.anomaly)) out.push({ kind: 'diary', ref: 'diary:' + l.date });
  const stale = !p.backupAt || now.getTime() - p.backupAt >= 7 * 86400_000;
  if (p.backup.on && stale && l.minutes >= BACKUP_TIME && l.minutes < BACKUP_TIME + WINDOW_MIN)
    out.push({ kind: 'backup', ref: 'backup:' + weekKey(l.date, l.weekday) });
  if (p.weekly.on && l.weekday === 1 && l.minutes >= WEEKLY_TIME && l.minutes < WEEKLY_TIME + WINDOW_MIN)
    out.push({ kind: 'weekly', ref: 'weekly:' + l.date });
  return out;
}

// ---- Тексты ----

const dm = (iso: string, lang: Lang) => {
  const [y, m, d] = iso.split('-');
  return lang === 'en' ? `${y}-${m}-${d}` : `${d}.${m}`;
};

const TEXTS: Record<Lang, Record<Kind, (x: { curator?: string; date?: string }) => { title: string; body: string }>> = {
  ru: {
    weigh: () => ({ title: 'Пора взвеситься', body: 'Утром натощак, после туалета. Впишите вес на экране «День».' }),
    diary: () => ({ title: 'Дневник за сегодня пустой', body: 'Добавьте калории и БЖУ, пока помните, что ели.' }),
    comment: (x) => ({ title: 'Комментарий куратора', body: `${x.curator || 'Куратор'}: новый комментарий к дню ${x.date ? dm(x.date, 'ru') : ''}. Откройте приложение, чтобы прочитать.` }),
    backup: () => ({ title: 'Сохраните резервную копию', body: 'Копии не было больше 7 дней. Профиль → «Экспорт данных».' }),
    // текст сводки собирает weekSummaryText (bot.ts); здесь — заголовок на случай, если сводку не посчитать
    weekly: () => ({ title: 'Сводка за неделю', body: 'Откройте приложение, чтобы посмотреть итоги недели.' }),
    test: () => ({ title: 'Проверка уведомлений', body: 'Если вы видите это сообщение, уведомления работают.' }),
  },
  en: {
    weigh: () => ({ title: 'Time to weigh in', body: 'In the morning, before breakfast. Enter your weight on the Day screen.' }),
    diary: () => ({ title: "Today's diary is empty", body: 'Add calories and macros while you still remember what you ate.' }),
    comment: (x) => ({ title: 'Coach comment', body: `${x.curator || 'Your coach'}: new comment on ${x.date ? dm(x.date, 'en') : 'a day'}. Open the app to read it.` }),
    backup: () => ({ title: 'Save a backup', body: 'No backup for more than 7 days. Profile → “Export data”.' }),
    weekly: () => ({ title: 'Weekly summary', body: 'Open the app to see how your week went.' }),
    test: () => ({ title: 'Notification test', body: 'If you can see this, notifications work.' }),
  },
};

interface Message {
  kind: Kind;
  title: string;
  body: string;
  /** Куда открыть приложение по нажатию. */
  url?: string;
  /** Одинаковый tag заменяет старое уведомление тем же видом. */
  tag: string;
}

/** В сообщениях нет цифр дневника и текста комментария: только повод открыть приложение. */
function message(kind: Kind, p: Pick<Prefs, 'lang' | 'appUrl'>, x: { curator?: string; date?: string } = {}): Message {
  const t = TEXTS[p.lang][kind](x);
  return { kind, ...t, url: p.appUrl, tag: 'ab-' + kind };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Сообщение Telegram (parse_mode HTML) с кнопкой «Открыть приложение». html — готовый текст вместо заголовка и текста. */
function telegramPayload(chatId: number | string, m: Message, lang: Lang, html?: string) {
  return {
    chat_id: chatId,
    text: html ?? `<b>${esc(m.title)}</b>\n${esc(m.body)}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(m.url ? { reply_markup: { inline_keyboard: [[{ text: lang === 'en' ? 'Open the app' : 'Открыть приложение', url: m.url }]] } } : {}),
  };
}

// ---- Telegram: привязка ----

/** Код привязки: 10 знаков без похожих букв, годен 30 минут. */
const LINK_CODE_MIN = 30;
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function makeLinkCode(rnd: Uint8Array = crypto.getRandomValues(new Uint8Array(10))): string {
  return Array.from(rnd, (b) => ABC[b % ABC.length]).join('');
}

type BotCommand = { cmd: 'start'; code?: string } | { cmd: 'stop' } | { cmd: 'other' };

/** «/start КОД» (переход по ссылке из приложения), «/stop», остальное — подсказка. */
function parseCommand(text: unknown): BotCommand {
  const s = typeof text === 'string' ? text.trim() : '';
  const m = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/.exec(s);
  if (m) return { cmd: 'start', code: m[1]?.toUpperCase() };
  if (/^\/stop(?:@\w+)?$/.test(s)) return { cmd: 'stop' };
  return { cmd: 'other' };
}

const BOT_REPLIES: Record<Lang, Record<'linked' | 'badCode' | 'noCode' | 'stopped' | 'help', string>> = {
  ru: {
    linked: 'Готово! Напоминания Activity Balance будут приходить сюда. Что именно присылать, настраивается в приложении: Профиль → «Уведомления». Отключить: команда /stop.',
    badCode: 'Ссылка устарела. Откройте приложение: Профиль → «Уведомления» → «Подключить Telegram» и нажмите кнопку ещё раз.',
    noCode: 'Чтобы получать напоминания, откройте приложение Activity Balance: Профиль → «Уведомления» → «Подключить Telegram».',
    stopped: 'Напоминания в Telegram отключены. Подключить снова можно в приложении: Профиль → «Уведомления».',
    help: 'Я присылаю напоминания Activity Balance и принимаю вес, шаги и самочувствие. Подключение — в приложении: Профиль → «Уведомления» → «Подключить Telegram».',
  },
  en: {
    linked: 'Done! Activity Balance reminders will arrive here. Choose what to receive in the app: Profile → “Notifications”. To turn off, send /stop.',
    badCode: 'This link has expired. Open the app: Profile → “Notifications” → “Connect Telegram” and tap the button again.',
    noCode: 'To get reminders, open the Activity Balance app: Profile → “Notifications” → “Connect Telegram”.',
    stopped: 'Telegram reminders are off. You can reconnect in the app: Profile → “Notifications”.',
    help: 'I send Activity Balance reminders and take your weight, steps and wellbeing. Connect in the app: Profile → “Notifications” → “Connect Telegram”.',
  },
};

/** Язык ответа бота по языку Telegram, пока мы не знаем пользователя. */
const tgLang = (code: unknown): Lang => (typeof code === 'string' && !code.toLowerCase().startsWith('ru') ? 'en' : 'ru');

/** Секрет вебхука Telegram — производный от токена бота, отдельный секрет заводить не нужно. */
async function webhookSecret(botToken: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ab-webhook:' + botToken)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ======== bot.ts ========
// Telegram-бот без обращений к сети и базе: быстрый ввод (вес, шаги, самочувствие) и сводка за неделю.
// Проверяется тестами src/core/notify-bot.test.ts.
//
// Расчёт тренда, «расхода по факту» и прогноза цели — тот же код, что в приложении (core.gen.ts собран из src/core),
// поэтому цифры в сводке совпадают с экраном «Расход по факту».


// ---- быстрый ввод ----

/** Поля дня, которые бот умеет записывать. */
type BotField = 'weight' | 'steps' | 'wellbeing';

const WEIGHT_MIN = 25;
const WEIGHT_MAX = 350;
/** Голое целое без «кг» считаем весом только до 250: 251–499 — скорее опечатка. */
const WEIGHT_BARE_MAX = 250;
const STEPS_MIN = 500;
const STEPS_MAX = 100_000;

type Quick =
  | { kind: 'set'; field: BotField; value: number; day: 'today' | 'yesterday' }
  | { kind: 'askSteps' }
  | { kind: 'askWellbeing' }
  | { kind: 'week' }
  | { kind: 'bad'; reason: 'range' | 'small' | 'wellbeing' };

/** Надписи кнопок под полем ввода. Принимаем надписи обоих языков: язык мог смениться после привязки. */
const BUTTONS: Record<Lang, { steps: string; wellbeing: string; week: string }> = {
  ru: { steps: '👣 Шаги', wellbeing: '🙂 Самочувствие', week: '📊 Неделя' },
  en: { steps: '👣 Steps', wellbeing: '🙂 Wellbeing', week: '📊 Week' },
};

/** Начало вопроса бота о шагах: ответ на него — шаги, даже если число маленькое. */
const ASK_STEPS_HEAD: Record<Lang, string> = { ru: 'Сколько шагов', en: 'How many steps' };

const norm = (s: string) => s.replace(/[\s ]+/g, ' ').trim().toLowerCase();
const strip = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, '').trim();

/** «71,3», «71.3», «12 000», «12,000», «12000» → число и было ли это «похоже на тысячи». */
function parseNumber(s: string): { value: number; grouped: boolean; decimal: boolean } | null {
  const t = s.replace(/\s+/g, ' ').trim();
  if (/^\d{1,3}(?:[ ']\d{3})+$/.test(t)) return { value: Number(t.replace(/[ ']/g, '')), grouped: true, decimal: false };
  const m = /^(\d{1,9})(?:[.,](\d{1,3}))?$/.exec(t);
  if (!m) return null;
  if (m[2] == null) return { value: Number(m[1]), grouped: false, decimal: false };
  return { value: Number(m[1] + '.' + m[2]), grouped: m[2].length === 3, decimal: true };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Разбор сообщения от привязанного пользователя.
 * replyTo — текст сообщения бота, на которое ответили (вопрос «Сколько шагов…»).
 * null — не похоже на ввод (бот покажет подсказку).
 */
function parseQuick(text: unknown, replyTo?: unknown): Quick | null {
  if (typeof text !== 'string') return null;
  const raw = norm(text);
  if (!raw) return null;
  for (const l of ['ru', 'en'] as Lang[]) {
    if (raw === norm(BUTTONS[l].steps) || raw === strip(norm(BUTTONS[l].steps))) return { kind: 'askSteps' };
    if (raw === norm(BUTTONS[l].wellbeing) || raw === strip(norm(BUTTONS[l].wellbeing))) return { kind: 'askWellbeing' };
    if (raw === norm(BUTTONS[l].week) || raw === strip(norm(BUTTONS[l].week))) return { kind: 'week' };
  }
  if (/^\/(?:week|неделя)(?:@\w+)?$/.test(raw)) return { kind: 'week' };
  if (/^\/(?:steps)(?:@\w+)?$/.test(raw)) return { kind: 'askSteps' };
  if (/^\/(?:wellbeing|mood)(?:@\w+)?$/.test(raw)) return { kind: 'askWellbeing' };

  let s = raw;
  let day: 'today' | 'yesterday' = 'today';
  // \b в JS не работает с кириллицей — границы слова через пробел / начало / конец
  const y = /^(?:вчера|yesterday)(?=[\s,:]|$)[\s,:]*|(?:^|[\s,]+)(?:вчера|yesterday)$/u;
  if (y.test(s)) {
    day = 'yesterday';
    s = s.replace(y, '').trim();
  }
  let field: BotField | null = null;
  const pre = /^(вес|weight|шаги|шагов|steps|самочувствие|wellbeing|mood)(?=[\s:=-]|\d|$)[\s:=-]*/u.exec(s);
  if (pre) {
    field = /^(вес|weight)$/.test(pre[1]) ? 'weight' : /^(шаги|шагов|steps)$/.test(pre[1]) ? 'steps' : 'wellbeing';
    s = s.slice(pre[0].length).trim();
  }
  s = s.replace(/\s*(?:кг|kg)\.?$/u, () => {
    field = field || 'weight';
    return '';
  });
  s = s.replace(/\s*(?:шагов|шага|шаг|steps)$/u, () => {
    field = field || 'steps';
    return '';
  });
  const n = parseNumber(s);
  if (!n) return null;

  const askedSteps = typeof replyTo === 'string' && (replyTo.startsWith(ASK_STEPS_HEAD.ru) || replyTo.startsWith(ASK_STEPS_HEAD.en));
  if (!field && askedSteps && !n.decimal) field = 'steps';

  const asSteps = (v: number): Quick =>
    Number.isInteger(v) && v >= 0 && v <= STEPS_MAX ? { kind: 'set', field: 'steps', value: v, day } : { kind: 'bad', reason: 'range' };
  const asWeight = (v: number): Quick =>
    v >= WEIGHT_MIN && v <= WEIGHT_MAX ? { kind: 'set', field: 'weight', value: round2(v), day } : { kind: 'bad', reason: 'range' };

  if (field === 'wellbeing')
    return Number.isInteger(n.value) && n.value >= 1 && n.value <= 10 && !n.decimal
      ? { kind: 'set', field: 'wellbeing', value: n.value, day }
      : { kind: 'bad', reason: 'wellbeing' };
  if (field === 'steps') return asSteps(n.grouped && n.decimal ? Math.round(n.value * 1000) : n.value);
  if (field === 'weight') return asWeight(n.value);

  // Голое число: вес — от 25 до 350 с дробью или целое до 250, шаги — целое от 500 (в т. ч. «12 000», «12.000»).
  if (n.decimal && n.value >= WEIGHT_MIN && n.value <= WEIGHT_MAX) return asWeight(n.value);
  if (n.decimal && n.grouped) {
    const k = Math.round(n.value * 1000);
    return k >= STEPS_MIN && k <= STEPS_MAX ? asSteps(k) : { kind: 'bad', reason: 'range' };
  }
  if (n.grouped) return n.value >= STEPS_MIN ? asSteps(n.value) : { kind: 'bad', reason: 'range' };
  if (!n.decimal && n.value >= WEIGHT_MIN && n.value <= WEIGHT_BARE_MAX) return asWeight(n.value);
  if (!n.decimal && n.value >= STEPS_MIN) return asSteps(n.value);
  if (!n.decimal && n.value >= 1 && n.value <= 10) return { kind: 'bad', reason: 'small' };
  return { kind: 'bad', reason: 'range' };
}

/**
 * Записать значение из бота в запись дня. Остальные поля не трогаем; botAt[поле] — время записи ботом:
 * по нему приложение узнаёт, что значение пришло с сервера и его нельзя затирать своей старой копией дня
 * (keepBotWrites в src/core/merge.ts).
 */
function applyQuick(entry: DayEntry | undefined, field: BotField, value: number, nowMs: number): { entry: DayEntry; prev?: number } {
  const cur = entry || {};
  const prev = typeof cur[field] === 'number' ? (cur[field] as number) : undefined;
  return {
    entry: { ...cur, [field]: value, updatedAt: nowMs, botAt: { ...cur.botAt, [field]: nowMs } },
    prev,
  };
}

/** Кнопка самочувствия: «wb:<1–10>:<ГГГГ-ММ-ДД>». */
function parseCallback(data: unknown): { field: 'wellbeing'; value: number; date: ISODate } | null {
  const m = typeof data === 'string' ? /^wb:(10|[1-9]):(\d{4}-\d{2}-\d{2})$/.exec(data) : null;
  return m ? { field: 'wellbeing', value: Number(m[1]), date: m[2] } : null;
}

/** Дата из кнопки годится, если это сегодня или одна из 7 прошлых дат (кнопки старых сообщений). */
function callbackDateOk(date: ISODate, today: ISODate): boolean {
  for (let i = 0; i <= 7; i++) if (shiftDate(today, -i) === date) return true;
  return false;
}

// ---- форматирование ----

const nf = (lang: Lang, digits = 0) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Число: «71,3» / «71.3», тысячи через пробел / запятую. */
const fmt = (x: number, lang: Lang, digits = 0) => nf(lang, digits).format(x).replace(/ /g, ' ');
const signed = (x: number, lang: Lang, digits = 1) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x), lang, digits);
const dmy = (iso: ISODate, lang: Lang, year = false) => {
  const [y, m, d] = iso.split('-');
  if (lang === 'en') return year ? `${y}-${m}-${d}` : `${m}/${d}`;
  return year ? `${d}.${m}.${y}` : `${d}.${m}`;
};
const kg = (x: number, lang: Lang) => fmt(x, lang, Number.isInteger(round2(x)) ? 0 : x * 10 === Math.round(x * 10) ? 1 : 2);
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- ответы бота ----

const QUICK_REPLIES = {
  ru: {
    saved: (f: BotField, v: number, date: ISODate, today: boolean, prev?: number) => {
      const when = today ? `за сегодня, ${dmy(date, 'ru')}` : `за ${dmy(date, 'ru')}`;
      const was = prev != null && prev !== v ? ` Было ${f === 'weight' ? kg(prev, 'ru') : fmt(prev, 'ru')}.` : '';
      if (f === 'weight') return `✅ Вес ${kg(v, 'ru')} кг записан ${when}.${was}`;
      if (f === 'steps') return `✅ Шаги ${fmt(v, 'ru')} записаны ${when}.${was}`;
      return `✅ Самочувствие ${v} из 10 записано ${when}.${was}`;
    },
    askSteps: 'Сколько шагов за сегодня? Пришлите число, например 9500. За вчера: «вчера 9500».',
    askWellbeing: (date: ISODate) => `Как самочувствие ${dmy(date, 'ru')}? 1 — очень плохо, 10 — отлично.`,
    range: 'Не понял число. Вес — от 25 до 350 кг, например 71,3. Шаги — целое число от 500, например 9500.',
    small: 'Похоже на самочувствие. Нажмите «🙂 Самочувствие» внизу или пришлите «самочувствие 7».',
    wellbeing: 'Самочувствие — целое число от 1 до 10, например «самочувствие 7».',
    help:
      'Что можно прислать:\n' +
      '• вес числом: 71,3 (за вчера: «вчера 71,3»);\n' +
      '• шаги: 9500 или кнопка «👣 Шаги»;\n' +
      '• самочувствие: кнопка «🙂 Самочувствие»;\n' +
      '• сводка за 7 дней: кнопка «📊 Неделя».\n' +
      'Записанное сразу попадает в дневник приложения. Напоминания и сводка по понедельникам настраиваются в приложении: Профиль → «Уведомления». Отключить бота: /stop.',
    linkedHint: 'Вес можно присылать сюда прямо числом, например 71,3. Шаги и самочувствие — кнопками внизу.',
    old: 'Эта кнопка устарела. Нажмите «🙂 Самочувствие» ещё раз.',
  },
  en: {
    saved: (f: BotField, v: number, date: ISODate, today: boolean, prev?: number) => {
      const when = today ? `for today, ${dmy(date, 'en')}` : `for ${dmy(date, 'en')}`;
      const was = prev != null && prev !== v ? ` It was ${f === 'weight' ? kg(prev, 'en') : fmt(prev, 'en')}.` : '';
      if (f === 'weight') return `✅ Weight ${kg(v, 'en')} kg saved ${when}.${was}`;
      if (f === 'steps') return `✅ Steps ${fmt(v, 'en')} saved ${when}.${was}`;
      return `✅ Wellbeing ${v} of 10 saved ${when}.${was}`;
    },
    askSteps: 'How many steps today? Send a number, for example 9500. For yesterday: “yesterday 9500”.',
    askWellbeing: (date: ISODate) => `How do you feel on ${dmy(date, 'en')}? 1 — very bad, 10 — great.`,
    range: "I didn't get the number. Weight is 25 to 350 kg, for example 71.3. Steps are a whole number from 500, for example 9500.",
    small: 'Looks like wellbeing. Tap “🙂 Wellbeing” below or send “wellbeing 7”.',
    wellbeing: 'Wellbeing is a whole number from 1 to 10, for example “wellbeing 7”.',
    help:
      'What you can send:\n' +
      '• weight as a number: 71.3 (for yesterday: “yesterday 71.3”);\n' +
      '• steps: 9500 or the “👣 Steps” button;\n' +
      '• wellbeing: the “🙂 Wellbeing” button;\n' +
      '• 7-day summary: the “📊 Week” button.\n' +
      'Entries go straight into the app diary. Reminders and the Monday summary are set in the app: Profile → “Notifications”. To turn the bot off, send /stop.',
    linkedHint: 'You can send your weight here as a plain number, for example 71.3. Steps and wellbeing: buttons below.',
    old: 'This button has expired. Tap “🙂 Wellbeing” again.',
  },
} satisfies Record<Lang, unknown>;

/** Постоянные кнопки под полем ввода. */
function replyKeyboard(lang: Lang) {
  const b = BUTTONS[lang];
  return { keyboard: [[{ text: b.steps }, { text: b.wellbeing }, { text: b.week }]], resize_keyboard: true, is_persistent: true };
}

/** Кнопки 1–10 для самочувствия на дату. */
function wellbeingKeyboard(date: ISODate) {
  const row = (from: number) => Array.from({ length: 5 }, (_, i) => ({ text: String(from + i), callback_data: `wb:${from + i}:${date}` }));
  return { inline_keyboard: [row(1), row(6)] };
}

// ---- сводка за неделю ----

interface WeekSummary {
  from: ISODate;
  to: ISODate;
  weight: { avg: number; n: number; prevAvg?: number } | null;
  trendKgWeek: number | null;
  food: { kcal: number; p?: number; f?: number; c?: number; n: number } | null;
  steps: { avg: number; n: number; goal: number; goalDays: number } | null;
  fact: { kcal: number; reliability: 'high' | 'medium' | 'low' } | null;
  goal: ReturnType<typeof goalForecast>;
  anomalies: number;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Сводка за 7 дней по to включительно. profileRaw — profiles.data, keep — profiles.anomaly_keep. */
function weekSummary(profileRaw: Partial<Profile> | null | undefined, days: DayMap, keep: KeepMap | null | undefined, to: ISODate): WeekSummary {
  const profile: Profile = { ...DEFAULT_PROFILE, ...(profileRaw || {}) };
  const from = shiftDate(to, -6);
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(from, i));
  const prevWeek = week.map((d) => shiftDate(d, -7));
  const pick = (ds: ISODate[], f: (e: DayEntry) => unknown) => ds.map((d) => days[d] && f(days[d])).filter(num);

  const ws = pick(week, (e) => e.weight);
  const wp = pick(prevWeek, (e) => e.weight);
  const kc = week.map((d) => (days[d] ? dayKcal(days[d]) : undefined)).filter((x): x is number => num(x) && x > 0);
  const fed = week.filter((d) => days[d] && num(dayKcal(days[d])) && (dayKcal(days[d]) as number) > 0);
  const macro = (k: 'protein' | 'fat' | 'carbs') => {
    const xs = pick(fed, (e) => e[k]);
    return xs.length ? avg(xs) : undefined;
  };
  const st = pick(week, (e) => e.steps);
  const r = adaptiveTDEE(to, { profile, days }, keep || {});
  const goal = goalForecast(r, to, profile.goalWeightKg, days[to]?.weight || weightNear(days, to));
  return {
    from,
    to,
    weight: ws.length ? { avg: avg(ws), n: ws.length, prevAvg: wp.length ? avg(wp) : undefined } : null,
    trendKgWeek: r && r.slope != null ? r.slope * 7 : null,
    food: kc.length ? { kcal: avg(kc), p: macro('protein'), f: macro('fat'), c: macro('carbs'), n: kc.length } : null,
    steps: st.length ? { avg: avg(st), n: st.length, goal: profile.stepGoal, goalDays: st.filter((x) => x >= profile.stepGoal).length } : null,
    fact: r && r.E != null ? { kcal: r.E, reliability: r.reliability } : null,
    goal,
    anomalies: week.filter((d) => days[d]?.anomaly).length,
  };
}

const REL = { ru: { high: 'высокая', medium: 'средняя', low: 'низкая' }, en: { high: 'high', medium: 'medium', low: 'low' } };

/** Текст сводки (parse_mode HTML). */
function weekSummaryText(s: WeekSummary, lang: Lang, title: 'weekly' | 'last7'): string {
  const ru = lang === 'ru';
  const L: string[] = [];
  const head = ru
    ? title === 'weekly'
      ? `📊 <b>Неделя ${dmy(s.from, 'ru')}–${dmy(s.to, 'ru')}</b>`
      : `📊 <b>Последние 7 дней, ${dmy(s.from, 'ru')}–${dmy(s.to, 'ru')}</b>`
    : title === 'weekly'
      ? `📊 <b>Week ${dmy(s.from, 'en')}–${dmy(s.to, 'en')}</b>`
      : `📊 <b>Last 7 days, ${dmy(s.from, 'en')}–${dmy(s.to, 'en')}</b>`;
  L.push(head, '');

  if (s.weight) {
    const d = s.weight.prevAvg != null ? s.weight.avg - s.weight.prevAvg : null;
    const delta = d != null ? (ru ? `, ${signed(d, lang)} к прошлой неделе` : `, ${signed(d, lang)} vs last week`) : '';
    L.push(
      ru
        ? `⚖️ Вес: в среднем ${fmt(s.weight.avg, lang, 1)} кг${delta} (взвешиваний: ${s.weight.n} из 7)`
        : `⚖️ Weight: average ${fmt(s.weight.avg, lang, 1)} kg${delta} (weigh-ins: ${s.weight.n} of 7)`,
    );
  } else L.push(ru ? '⚖️ Вес: за неделю нет взвешиваний' : '⚖️ Weight: no weigh-ins this week');
  if (s.trendKgWeek != null)
    L.push(ru ? `📉 Тренд: ${signed(s.trendKgWeek, lang, 2)} кг в неделю` : `📉 Trend: ${signed(s.trendKgWeek, lang, 2)} kg per week`);

  if (s.food) {
    const m = s.food.p != null && s.food.f != null && s.food.c != null
      ? ru
        ? ` · Б ${fmt(s.food.p, lang)} · Ж ${fmt(s.food.f, lang)} · У ${fmt(s.food.c, lang)} г`
        : ` · P ${fmt(s.food.p, lang)} · F ${fmt(s.food.f, lang)} · C ${fmt(s.food.c, lang)} g`
      : '';
    L.push(
      ru
        ? `🍽 Питание: в среднем ${fmt(s.food.kcal, lang)} ккал${m} (дней с дневником: ${s.food.n} из 7)`
        : `🍽 Food: average ${fmt(s.food.kcal, lang)} kcal${m} (diary days: ${s.food.n} of 7)`,
    );
  } else L.push(ru ? '🍽 Питание: дневник за неделю пустой' : '🍽 Food: the diary is empty this week');

  if (s.steps)
    L.push(
      ru
        ? `👣 Шаги: в среднем ${fmt(s.steps.avg, lang)} в день, цель ${fmt(s.steps.goal, lang)} — дней: ${s.steps.goalDays} из 7`
        : `👣 Steps: average ${fmt(s.steps.avg, lang)} a day, goal ${fmt(s.steps.goal, lang)} reached on ${s.steps.goalDays} of 7 days`,
    );
  else L.push(ru ? '👣 Шаги: нет данных' : '👣 Steps: no data');

  if (s.fact)
    L.push(
      ru
        ? `🔥 Расход по факту: ${fmt(s.fact.kcal, lang)} ккал в день (надёжность ${REL.ru[s.fact.reliability]})`
        : `🔥 Actual expenditure: ${fmt(s.fact.kcal, lang)} kcal a day (reliability: ${REL.en[s.fact.reliability]})`,
    );

  const g = s.goal;
  if (g.kind === 'date')
    L.push(
      ru
        ? `🎯 Цель ${kg(g.goal, lang)} кг: ${g.rough ? 'примерно ' : ''}к ${dmy(g.date, 'ru', true)}`
        : `🎯 Goal ${kg(g.goal, lang)} kg: ${g.rough ? 'roughly ' : ''}by ${dmy(g.date, 'en', true)}`,
    );
  else if (g.kind === 'reached') L.push(ru ? `🎯 Цель ${kg(g.goal, lang)} кг достигнута` : `🎯 Goal ${kg(g.goal, lang)} kg reached`);
  else if (g.kind === 'notApproaching')
    L.push(ru ? `🎯 Цель ${kg(g.goal, lang)} кг: по тренду вес пока не приближается к цели` : `🎯 Goal ${kg(g.goal, lang)} kg: the trend is not moving towards it yet`);
  else if (g.kind === 'tooLong') L.push(ru ? `🎯 Цель ${kg(g.goal, lang)} кг: при таком темпе — больше двух лет` : `🎯 Goal ${kg(g.goal, lang)} kg: more than two years at this pace`);
  else if (g.kind === 'noTrend' || g.kind === 'noWeight')
    L.push(ru ? `🎯 Цель ${kg(g.goal, lang)} кг: для прогноза нужно больше взвешиваний` : `🎯 Goal ${kg(g.goal, lang)} kg: more weigh-ins needed for a forecast`);

  if (s.anomalies)
    L.push(
      ru
        ? `ℹ️ Необычных дней: ${s.anomalies} — они не входят в расчёт тренда и расхода`
        : `ℹ️ Unusual days: ${s.anomalies} — not counted in the trend and expenditure`,
    );
  return L.map((x) => (x.startsWith('📊') ? x : escHtml(x))).join('\n');
}

// ======== index.ts ========
// Supabase Edge Function «notify»: веб-пуши и Telegram-бот.
//
// Что делает:
//   • каждые 5 минут (pg_cron, задание ставится само при первом вызове) рассылает напоминания:
//     взвеситься утром, дневник не заполнен, новый комментарий куратора, резервная копия;
//   • отдаёт приложению открытый ключ VAPID (ключи создаются сами и хранятся в базе);
//   • выдаёт ссылку привязки Telegram и отвечает боту (вебхук тоже ставится сам);
//   • бот принимает быстрый ввод: вес числом, шаги и самочувствие кнопками — и пишет их в дневник;
//   • по понедельникам присылает в Telegram сводку за прошлую неделю (по кнопке «📊 Неделя» — за 7 дней);
//   • присылает тестовое уведомление по кнопке в Профиле.
//
// Настройка (docs/notifications.md): развернуть функцию с выключенной проверкой JWT
// (вход проверяется внутри), для Telegram — секрет TELEGRAM_BOT_TOKEN. Больше ничего.
// Таблицы — миграция 0007_notifications.sql.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const FN_URL = SB_URL.replace(/\/$/, '') + '/functions/v1/notify';
const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:push@activity-balance.app';
const admin: SupabaseClient = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// ---- секреты в базе (таблица notify_secrets, доступна только серверу) ----

async function secret(key: string): Promise<string | null> {
  const { data } = await admin.from('notify_secrets').select('value').eq('key', key).maybeSingle();
  return (data?.value as string) || null;
}

let vapidCache: VapidKeys | null = null;
async function vapid(): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  let v = await secret('vapid');
  if (!v) {
    // первый запуск: создать ключи; если параллельно создал другой экземпляр — взять его ключи
    await admin.from('notify_secrets').upsert({ key: 'vapid', value: JSON.stringify(await generateVapidKeys()) }, { onConflict: 'key', ignoreDuplicates: true });
    v = await secret('vapid');
  }
  vapidCache = JSON.parse(v!) as VapidKeys;
  return vapidCache;
}

// ---- одноразовая настройка: расписание и вебхук ----

let cronDone = false;
async function ensureCron() {
  if (cronDone) return;
  const { error } = await admin.rpc('ensure_notify_cron', { fn_url: FN_URL });
  if (error) console.warn('ensure_notify_cron:', error.message);
  else cronDone = true;
}

async function tg(method: string, body?: unknown): Promise<{ ok: boolean; status: number; result?: any }> {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, status: r.status, result: j.result };
}

let hookDone = false;
let botName = '';
async function ensureTelegram() {
  if (!BOT || hookDone) return;
  const me = await tg('getMe');
  if (me.ok) botName = me.result.username;
  const info = await tg('getWebhookInfo');
  const updates = ['message', 'callback_query'];
  const have: string[] = info.result?.allowed_updates || ['message'];
  if (!info.ok || info.result?.url !== FN_URL || updates.some((u) => !have.includes(u))) {
    const r = await tg('setWebhook', { url: FN_URL, secret_token: await webhookSecret(BOT), allowed_updates: updates });
    if (!r.ok) return console.warn('setWebhook failed', r.status);
  }
  hookDone = !!botName;
}

// ---- доставка ----

interface Channels {
  push: { endpoint: string; p256dh: string; auth: string }[];
  chat?: number;
}

async function channelsOf(userIds: string[]): Promise<Map<string, Channels>> {
  const m = new Map<string, Channels>();
  const get = (u: string) => m.get(u) || (m.set(u, { push: [] }), m.get(u)!);
  let q1 = admin.from('push_subscriptions').select('user_id, endpoint, p256dh, auth');
  let q2 = admin.from('telegram_links').select('user_id, chat_id');
  if (userIds.length) {
    q1 = q1.in('user_id', userIds);
    q2 = q2.in('user_id', userIds);
  }
  const [a, b] = await Promise.all([q1, BOT ? q2 : Promise.resolve({ data: [] as any[] })]);
  for (const r of a.data || []) get(r.user_id).push.push(r);
  for (const r of b.data || []) get(r.user_id).chat = Number(r.chat_id);
  return m;
}

async function deliver(userId: string, ch: Channels, msg: Message, lang: Prefs['lang']) {
  let push = 0;
  let telegram = false;
  const keys = ch.push.length ? await vapid() : null;
  for (const s of ch.push) {
    const r = await sendWebPush(s, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }, keys!, SUBJECT).catch(() => 'error' as const);
    if (r === 'ok') push++;
    if (r === 'gone') await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
  }
  if (ch.chat && BOT) {
    const r = await tg('sendMessage', telegramPayload(ch.chat, msg, lang));
    telegram = r.ok;
    // пользователь заблокировал бота — отвязать
    if (r.status === 403) await admin.from('telegram_links').delete().eq('user_id', userId);
  }
  return { push, telegram };
}

async function profiles(ids: string[]): Promise<Map<string, Prefs>> {
  const m = new Map<string, Prefs>();
  if (!ids.length) return m;
  const { data } = await admin.from('profiles').select('id, data').in('id', ids);
  for (const r of data || []) m.set(r.id, normPrefs(r.data?.notify, r.data?.lang));
  for (const id of ids) if (!m.has(id)) m.set(id, normPrefs(null));
  return m;
}

// ---- по расписанию ----

async function tick() {
  const now = new Date();
  const ch = await channelsOf([]);
  const users = [...ch.keys()];
  const prefs = await profiles(users);

  // 1. Напоминания по времени
  const localDate = new Map(users.map((u) => [u, localParts(now, prefs.get(u)!.tz).date]));
  const dates = [...new Set(localDate.values())];
  const days = new Map<string, any>();
  if (users.length) {
    const { data } = await admin.from('day_entries').select('user_id, date, data').in('user_id', users).in('date', dates);
    for (const r of data || []) if (r.date === localDate.get(r.user_id)) days.set(r.user_id, r.data);
  }
  // сводка за неделю — только в Telegram (длинная и с цифрами дневника, пушу не подходит)
  const due = users.flatMap((u) =>
    dueReminders(prefs.get(u)!, now, days.get(u))
      .filter((d) => d.kind !== 'weekly' || (BOT && ch.get(u)!.chat))
      .map((d) => ({ user_id: u, ...d })),
  );
  let sent = 0;
  if (due.length) {
    // журнал: ушедшее не уходит ещё раз, даже если функцию вызвали дважды
    const { data: fresh } = await admin
      .from('notify_log')
      .upsert(due.map((d) => ({ user_id: d.user_id, ref: d.ref })), { onConflict: 'user_id,ref', ignoreDuplicates: true })
      .select('user_id, ref');
    const ok = new Set((fresh || []).map((r) => r.user_id + '|' + r.ref));
    for (const d of due) {
      if (!ok.has(d.user_id + '|' + d.ref)) continue;
      const p = prefs.get(d.user_id)!;
      if (d.kind === 'weekly') {
        // прошлая неделя: пн–вс, воскресенье — вчера по местному времени
        const to = shiftDate(localDate.get(d.user_id)!, -1);
        await sendSummary(d.user_id, ch.get(d.user_id)!.chat!, p, to, 'weekly').catch((e) => console.warn('weekly', e));
      } else await deliver(d.user_id, ch.get(d.user_id)!, message(d.kind, p), p.lang);
      sent++;
    }
  }

  // 2. Новые комментарии куратора (за последние сутки, ещё не отмеченные)
  const { data: cs } = await admin
    .from('day_comments')
    .select('id, client_id, curator_id, date')
    .is('notified_at', null)
    .gte('created_at', new Date(now.getTime() - 86400_000).toISOString())
    .order('created_at')
    .limit(500);
  if (cs?.length) {
    await admin.from('day_comments').update({ notified_at: now.toISOString() }).in('id', cs.map((c) => c.id));
    const names = new Map<string, string>();
    const { data: cur } = await admin.from('curators').select('id, name').in('id', [...new Set(cs.map((c) => c.curator_id))]);
    for (const c of cur || []) names.set(c.id, c.name);
    // несколько комментариев одному клиенту за раз — одно сообщение
    const seen = new Set<string>();
    for (const c of cs) {
      const key = c.client_id + '|' + c.date;
      if (seen.has(key) || !ch.has(c.client_id)) continue;
      seen.add(key);
      const p = prefs.get(c.client_id)!;
      if (!p.comment.on) continue;
      await deliver(c.client_id, ch.get(c.client_id)!, message('comment', p, { curator: names.get(c.curator_id), date: c.date }), p.lang);
      sent++;
    }
  }

  // 3. Уборка
  await admin.from('notify_log').delete().lt('sent_at', new Date(now.getTime() - 90 * 86400_000).toISOString());
  await admin.from('telegram_link_codes').delete().lt('expires_at', now.toISOString());
  return { users: users.length, sent };
}

// ---- Telegram: сводка и запись в дневник ----

async function sendSummary(userId: string, chatId: number, p: Prefs, to: ISODate, title: 'weekly' | 'last7') {
  const since = shiftDate(to, -PARAMS.MAX_DAYS);
  const [prof, rows] = await Promise.all([
    admin.from('profiles').select('data, anomaly_keep').eq('id', userId).maybeSingle(),
    admin.from('day_entries').select('date, data').eq('user_id', userId).gte('date', since).lte('date', to),
  ]);
  const days: DayMap = {};
  for (const r of rows.data || []) days[r.date as string] = r.data;
  const text = weekSummaryText(weekSummary(prof.data?.data, days, prof.data?.anomaly_keep, to), p.lang, title);
  return tg('sendMessage', telegramPayload(chatId, message('weekly', p), p.lang, text));
}

/** Записать поле дня. Остальные поля дня остаются как были (пустое не затирает заполненное). */
async function saveField(userId: string, date: ISODate, field: BotField, value: number) {
  const { data: row, error } = await admin.from('day_entries').select('data').eq('user_id', userId).eq('date', date).maybeSingle();
  if (error) throw error;
  const r = applyQuick(row?.data || undefined, field, value, Date.now());
  const up = await admin.from('day_entries').upsert({ user_id: userId, date, data: r.entry, updated_at: new Date().toISOString() }, { onConflict: 'user_id,date' });
  if (up.error) throw up.error;
  return r.prev;
}

async function linkedUser(chatId: number): Promise<{ userId: string; p: Prefs } | null> {
  const { data } = await admin.from('telegram_links').select('user_id').eq('chat_id', chatId).maybeSingle();
  if (!data?.user_id) return null;
  return { userId: data.user_id, p: (await profiles([data.user_id])).get(data.user_id)! };
}

// ---- Telegram: входящие сообщения ----

async function onTelegram(update: any) {
  if (update?.callback_query) return onButton(update.callback_query);
  const msg = update?.message;
  if (!msg?.chat?.id || msg.chat.type !== 'private') return;
  const chatId = Number(msg.chat.id);
  let lang = tgLang(msg.from?.language_code);
  const reply = (text: string, extra: Record<string, unknown> = {}) => tg('sendMessage', { chat_id: chatId, text, ...extra });
  const c = parseCommand(msg.text);
  if (c.cmd === 'start' && c.code) {
    const { data: row } = await admin.from('telegram_link_codes').select('user_id, expires_at').eq('code', c.code).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) return reply(BOT_REPLIES[lang].badCode);
    await admin.from('telegram_links').upsert({ user_id: row.user_id, chat_id: chatId, username: msg.from?.username || null, linked_at: new Date().toISOString() });
    await admin.from('telegram_link_codes').delete().eq('user_id', row.user_id);
    lang = (await profiles([row.user_id])).get(row.user_id)!.lang;
    return reply(BOT_REPLIES[lang].linked + '\n\n' + QUICK_REPLIES[lang].linkedHint, { reply_markup: replyKeyboard(lang) });
  }
  if (c.cmd === 'stop') {
    await admin.from('telegram_links').delete().eq('chat_id', chatId);
    return reply(BOT_REPLIES[lang].stopped, { reply_markup: { remove_keyboard: true } });
  }

  const me = await linkedUser(chatId);
  if (!me) return reply(c.cmd === 'start' ? BOT_REPLIES[lang].noCode : BOT_REPLIES[lang].help);
  const { userId, p } = me;
  lang = p.lang;
  const R = QUICK_REPLIES[lang];
  const kb = { reply_markup: replyKeyboard(lang) };
  const today = localParts(new Date(), p.tz).date;

  const q = c.cmd === 'start' ? null : parseQuick(msg.text, msg.reply_to_message?.from?.is_bot ? msg.reply_to_message?.text : undefined);
  if (!q) return reply(R.help, kb);
  switch (q.kind) {
    case 'set': {
      const date = q.day === 'today' ? today : shiftDate(today, -1);
      const prev = await saveField(userId, date, q.field, q.value);
      return reply(R.saved(q.field, q.value, date, q.day === 'today', prev), kb);
    }
    case 'askSteps':
      return reply(R.askSteps, { reply_markup: { force_reply: true, input_field_placeholder: '9500' } });
    case 'askWellbeing':
      return reply(R.askWellbeing(today), { reply_markup: wellbeingKeyboard(today) });
    case 'week':
      return sendSummary(userId, chatId, p, today, 'last7');
    case 'bad':
      return reply(R[q.reason], kb);
  }
}

/** Нажатие кнопки самочувствия 1–10. */
async function onButton(cb: any) {
  const chatId = Number(cb?.message?.chat?.id);
  const done = (text?: string) => tg('answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) });
  const me = chatId ? await linkedUser(chatId) : null;
  const b = parseCallback(cb?.data);
  if (!me || !b) return done();
  const R = QUICK_REPLIES[me.p.lang];
  const today = localParts(new Date(), me.p.tz).date;
  if (!callbackDateOk(b.date, today)) return done(R.old);
  const prev = await saveField(me.userId, b.date, b.field, b.value);
  const text = R.saved(b.field, b.value, b.date, b.date === today, prev);
  await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text });
  return done();
}

// ---- вход пользователя ----

async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  ensureCron().catch(() => {});

  // Telegram присылает обновления с секретом в заголовке
  const hook = req.headers.get('x-telegram-bot-api-secret-token');
  if (hook != null) {
    if (!BOT || hook !== (await webhookSecret(BOT))) return new Response('forbidden', { status: 403 });
    await onTelegram(await req.json().catch(() => null)).catch((e) => console.warn('telegram', e));
    return new Response('ok');
  }

  // Приложение: открытый ключ для подписки на пуши и есть ли бот
  if (req.method === 'GET') {
    const v = await vapid();
    return json(200, { vapidKey: v.publicKey, telegram: !!BOT });
  }
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'tick') {
    const s = await secret('cron');
    if (!s || req.headers.get('x-cron-secret') !== s) return json(403, { error: 'forbidden' });
    await ensureTelegram().catch(() => {});
    return json(200, await tick());
  }

  const userId = await userOf(req);
  if (!userId) return json(401, { error: 'auth' });

  if (action === 'tg-link') {
    if (!BOT) return json(503, { error: 'telegram-off' });
    await ensureTelegram();
    if (!botName) return json(503, { error: 'telegram-off' });
    const code = makeLinkCode();
    await admin.from('telegram_link_codes').delete().eq('user_id', userId);
    const { error } = await admin.from('telegram_link_codes').insert({ code, user_id: userId, expires_at: new Date(Date.now() + LINK_CODE_MIN * 60_000).toISOString() });
    if (error) return json(500, { error: 'db' });
    return json(200, { url: `https://t.me/${botName}?start=${code}` });
  }

  if (action === 'test') {
    const p = (await profiles([userId])).get(userId)!;
    const ch = (await channelsOf([userId])).get(userId);
    if (!ch) return json(200, { push: 0, telegram: false });
    return json(200, await deliver(userId, ch, message('test', p), p.lang));
  }

  return json(400, { error: 'action' });
});
