// Логика функции «notify» без обращений к сети и базе: настройки, местное время, что пора отправить,
// тексты сообщений, разбор команд Telegram. Проверяется тестами src/core/notify.test.ts.
// Настройки пишет приложение в profiles.data.notify (тип NotifyPrefs в src/core/notify.ts — те же поля).

import type { Lang } from './core.gen.ts';

export type Kind = 'weigh' | 'diary' | 'comment' | 'backup' | 'weekly' | 'test';

export interface Prefs {
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

export const DEFAULT_TZ = 'Europe/Moscow';

/** Время «ЧЧ:ММ» → минуты от полуночи; неверное — null. */
export function parseTime(s: unknown): number | null {
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
export function normPrefs(raw: unknown, profileLang?: unknown): Prefs {
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
export function localParts(now: Date, tz: string): { date: string; minutes: number; weekday: number } {
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
export function weekKey(date: string, weekday: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (weekday - 1));
  return d.toISOString().slice(0, 10);
}

/** Напоминание приходит в выбранное время или позже, но не позже чем через 3 часа (если сервер спал — не будим ночью). */
export const WINDOW_MIN = 180;
/** Напоминание о копии — в полдень, раз в неделю, если копии не было 7 дней. */
export const BACKUP_TIME = 12 * 60;
/** Сводка за прошлую неделю (пн–вс) — в понедельник в 10:00 по местному времени, только в Telegram. */
export const WEEKLY_TIME = 10 * 60;

export interface DayFacts {
  weight?: unknown;
  kcal?: unknown;
  photoMeals?: unknown[];
  anomaly?: unknown;
}

export interface Due {
  kind: Kind;
  /** Ключ в журнале notify_log: одно и то же сообщение не уходит дважды. */
  ref: string;
}

/** Какие напоминания пора отправить пользователю сейчас. Проверка журнала — снаружи (по ref). */
export function dueReminders(p: Prefs, now: Date, today: DayFacts | undefined): Due[] {
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

export interface Message {
  kind: Kind;
  title: string;
  body: string;
  /** Куда открыть приложение по нажатию. */
  url?: string;
  /** Одинаковый tag заменяет старое уведомление тем же видом. */
  tag: string;
}

/** В сообщениях нет цифр дневника и текста комментария: только повод открыть приложение. */
export function message(kind: Kind, p: Pick<Prefs, 'lang' | 'appUrl'>, x: { curator?: string; date?: string } = {}): Message {
  const t = TEXTS[p.lang][kind](x);
  return { kind, ...t, url: p.appUrl, tag: 'ab-' + kind };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Сообщение Telegram (parse_mode HTML) с кнопкой «Открыть приложение». html — готовый текст вместо заголовка и текста. */
export function telegramPayload(chatId: number | string, m: Message, lang: Lang, html?: string) {
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
export const LINK_CODE_MIN = 30;
const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeLinkCode(rnd: Uint8Array = crypto.getRandomValues(new Uint8Array(10))): string {
  return Array.from(rnd, (b) => ABC[b % ABC.length]).join('');
}

export type BotCommand = { cmd: 'start'; code?: string } | { cmd: 'stop' } | { cmd: 'other' };

/** «/start КОД» (переход по ссылке из приложения), «/stop», остальное — подсказка. */
export function parseCommand(text: unknown): BotCommand {
  const s = typeof text === 'string' ? text.trim() : '';
  const m = /^\/start(?:@\w+)?(?:\s+([A-Za-z0-9_-]{1,64}))?$/.exec(s);
  if (m) return { cmd: 'start', code: m[1]?.toUpperCase() };
  if (/^\/stop(?:@\w+)?$/.test(s)) return { cmd: 'stop' };
  return { cmd: 'other' };
}

export const BOT_REPLIES: Record<Lang, Record<'linked' | 'badCode' | 'noCode' | 'stopped' | 'help', string>> = {
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
export const tgLang = (code: unknown): Lang => (typeof code === 'string' && !code.toLowerCase().startsWith('ru') ? 'en' : 'ru');

/** Секрет вебхука Telegram — производный от токена бота, отдельный секрет заводить не нужно. */
export async function webhookSecret(botToken: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ab-webhook:' + botToken)));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}
