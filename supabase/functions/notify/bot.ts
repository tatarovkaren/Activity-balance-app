// Telegram-бот без обращений к сети и базе: быстрый ввод (вес, шаги, самочувствие) и сводка за неделю.
// Проверяется тестами src/core/notify-bot.test.ts.
//
// Расчёт тренда, «расхода по факту» и прогноза цели — тот же код, что в приложении (core.gen.ts собран из src/core),
// поэтому цифры в сводке совпадают с экраном «Расход по факту».

import {
  adaptiveTDEE,
  dayKcal,
  DEFAULT_PROFILE,
  goalForecast,
  shiftDate,
  weightNear,
  type DayEntry,
  type DayMap,
  type ISODate,
  type KeepMap,
  type Lang,
  type Profile,
} from './core.gen.ts';

// ---- быстрый ввод ----

/** Поля дня, которые бот умеет записывать. */
export type BotField = 'weight' | 'steps' | 'wellbeing';

export const WEIGHT_MIN = 25;
export const WEIGHT_MAX = 350;
/** Голое целое без «кг» считаем весом только до 250: 251–499 — скорее опечатка. */
export const WEIGHT_BARE_MAX = 250;
export const STEPS_MIN = 500;
export const STEPS_MAX = 100_000;

export type Quick =
  | { kind: 'set'; field: BotField; value: number; day: 'today' | 'yesterday' }
  | { kind: 'askSteps' }
  | { kind: 'askWellbeing' }
  | { kind: 'week' }
  | { kind: 'bad'; reason: 'range' | 'small' | 'wellbeing' };

/** Надписи кнопок под полем ввода. Принимаем надписи обоих языков: язык мог смениться после привязки. */
export const BUTTONS: Record<Lang, { steps: string; wellbeing: string; week: string }> = {
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
export function parseQuick(text: unknown, replyTo?: unknown): Quick | null {
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
export function applyQuick(entry: DayEntry | undefined, field: BotField, value: number, nowMs: number): { entry: DayEntry; prev?: number } {
  const cur = entry || {};
  const prev = typeof cur[field] === 'number' ? (cur[field] as number) : undefined;
  return {
    entry: { ...cur, [field]: value, updatedAt: nowMs, botAt: { ...cur.botAt, [field]: nowMs } },
    prev,
  };
}

/** Кнопка самочувствия: «wb:<1–10>:<ГГГГ-ММ-ДД>». */
export function parseCallback(data: unknown): { field: 'wellbeing'; value: number; date: ISODate } | null {
  const m = typeof data === 'string' ? /^wb:(10|[1-9]):(\d{4}-\d{2}-\d{2})$/.exec(data) : null;
  return m ? { field: 'wellbeing', value: Number(m[1]), date: m[2] } : null;
}

/** Дата из кнопки годится, если это сегодня или одна из 7 прошлых дат (кнопки старых сообщений). */
export function callbackDateOk(date: ISODate, today: ISODate): boolean {
  for (let i = 0; i <= 7; i++) if (shiftDate(today, -i) === date) return true;
  return false;
}

// ---- форматирование ----

const nf = (lang: Lang, digits = 0) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Число: «71,3» / «71.3», тысячи через пробел / запятую. */
export const fmt = (x: number, lang: Lang, digits = 0) => nf(lang, digits).format(x).replace(/ /g, ' ');
const signed = (x: number, lang: Lang, digits = 1) => (x > 0 ? '+' : x < 0 ? '−' : '±') + fmt(Math.abs(x), lang, digits);
const dmy = (iso: ISODate, lang: Lang, year = false) => {
  const [y, m, d] = iso.split('-');
  if (lang === 'en') return year ? `${y}-${m}-${d}` : `${m}/${d}`;
  return year ? `${d}.${m}.${y}` : `${d}.${m}`;
};
const kg = (x: number, lang: Lang) => fmt(x, lang, Number.isInteger(round2(x)) ? 0 : x * 10 === Math.round(x * 10) ? 1 : 2);
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---- ответы бота ----

export const QUICK_REPLIES = {
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
export function replyKeyboard(lang: Lang) {
  const b = BUTTONS[lang];
  return { keyboard: [[{ text: b.steps }, { text: b.wellbeing }, { text: b.week }]], resize_keyboard: true, is_persistent: true };
}

/** Кнопки 1–10 для самочувствия на дату. */
export function wellbeingKeyboard(date: ISODate) {
  const row = (from: number) => Array.from({ length: 5 }, (_, i) => ({ text: String(from + i), callback_data: `wb:${from + i}:${date}` }));
  return { inline_keyboard: [row(1), row(6)] };
}

// ---- сводка за неделю ----

export interface WeekSummary {
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
export function weekSummary(profileRaw: Partial<Profile> | null | undefined, days: DayMap, keep: KeepMap | null | undefined, to: ISODate): WeekSummary {
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
export function weekSummaryText(s: WeekSummary, lang: Lang, title: 'weekly' | 'last7'): string {
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
