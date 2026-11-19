// Напоминание о резервной копии: пока нет сервера с синхронизацией, данные живут только на устройстве.
// Показываем на экране «День», если копии не было BACKUP_REMIND_DAYS дней (или ни разу, а записи
// ведутся уже столько же). Выключается в Профиле (profile.backupReminder = false).

import { dayDiff, todayISO, toLocalISO, type ISODate } from './dates';

export const BACKUP_REMIND_DAYS = 7;

/** Сколько дней нет копии, если пора напомнить; иначе null. never — копии не было ни разу. */
export function backupDue(
  lastBackupAt: number | undefined,
  dayKeys: ISODate[],
  enabled: boolean | undefined,
  now: Date = new Date(),
): { days: number; never: boolean } | null {
  if (enabled === false || !dayKeys.length) return null;
  const today = todayISO(now);
  if (lastBackupAt) {
    const n = dayDiff(toLocalISO(new Date(lastBackupAt)), today);
    return n >= BACKUP_REMIND_DAYS ? { days: n, never: false } : null;
  }
  const first = dayKeys.reduce((a, b) => (b < a ? b : a));
  const n = dayDiff(first, today);
  return n >= BACKUP_REMIND_DAYS ? { days: n, never: true } : null;
}
