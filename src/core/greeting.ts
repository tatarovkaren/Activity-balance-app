/** Часть суток для приветствия на «Дне» по местному часу (0–23). */
export type DayPart = 'morning' | 'day' | 'evening' | 'night';

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'day';
  if (hour >= 17 && hour < 23) return 'evening';
  return 'night';
}

/** Имя для шапки: псевдоним из профиля без лишних пробелов; пусто — не показываем. */
export function greetName(name: string | undefined): string {
  return (name || '').replace(/\s+/g, ' ').trim();
}
