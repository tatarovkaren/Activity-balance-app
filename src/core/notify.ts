// Настройки уведомлений (Профиль → «Уведомления»). Хранятся в профиле и уходят на сервер вместе с ним
// (profiles.data.notify); там их читает функция supabase/functions/notify (normPrefs — те же значения по умолчанию).

import type { Lang } from './types';

export type NotifyKind = 'weigh' | 'diary' | 'comment' | 'backup';
export const NOTIFY_KINDS: NotifyKind[] = ['weigh', 'diary', 'comment', 'backup'];
/** У каких напоминаний пользователь выбирает время. */
export const TIMED: NotifyKind[] = ['weigh', 'diary'];

export interface NotifyPrefs {
  weigh: { on: boolean; time: string };
  diary: { on: boolean; time: string };
  comment: { on: boolean };
  backup: { on: boolean };
  /** Часовой пояс устройства (IANA, например Europe/Moscow): время напоминаний — местное. */
  tz?: string;
  /** Язык сообщений (выбранный язык интерфейса). */
  lang?: Lang;
  /** Адрес приложения для кнопки «Открыть» в Telegram и перехода из пуша. */
  appUrl?: string;
  /** Последняя резервная копия, мс (для напоминания о копии). */
  backupAt?: number;
}

export const DEFAULT_NOTIFY: NotifyPrefs = {
  weigh: { on: true, time: '08:00' },
  diary: { on: true, time: '21:00' },
  comment: { on: true },
  backup: { on: true },
};

export function withDefaults(p: Partial<NotifyPrefs> | undefined): NotifyPrefs {
  return {
    ...DEFAULT_NOTIFY,
    ...p,
    weigh: { ...DEFAULT_NOTIFY.weigh, ...p?.weigh },
    diary: { ...DEFAULT_NOTIFY.diary, ...p?.diary },
    comment: { ...DEFAULT_NOTIFY.comment, ...p?.comment },
    backup: { ...DEFAULT_NOTIFY.backup, ...p?.backup },
  };
}

/** «ЧЧ:ММ» → верно ли. */
export const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Маска ввода времени: только цифры, двоеточие ставится само («0830» → «08:30»). */
export function maskTime(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d;
}

/** Часовой пояс устройства; если браузер не говорит — Москва. */
export function deviceTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
  } catch {
    return 'Europe/Moscow';
  }
}

/** Только https-адрес (локальный http серверу не нужен: по нему не откроется с телефона). */
export function appUrlOf(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' ? u.origin + u.pathname : undefined;
  } catch {
    return undefined;
  }
}
