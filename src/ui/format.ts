import { dm, dmy, type ISODate } from '../core/dates';
import { fmtSignedKg, type AdaptiveResult, type GoalForecast } from '../core/adaptive';

export const int = (v: number) => Math.round(v).toLocaleString('ru-RU').replace(/,/g, ' ');
export const kg = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export const RELIABILITY_LABEL = { high: 'высокая', medium: 'средняя', low: 'низкая' } as const;

export function factLine(r: AdaptiveResult): string {
  return r.slope != null
    ? `Факт по весу (тренд, ${r.nWts} взвеш., без необычных дней): ${fmtSignedKg(r.slope * 7)} кг/нед`
    : 'Факт по весу: нужно ≥8 взвешиваний в обычные дни (размах ≥15 дн.)';
}

export function calibLine(r: AdaptiveResult): { main: string; sub: string } {
  if (r.alpha > 0 && r.E != null) {
    const diff = r.formula ? (r.formula / r.E - 1) * 100 : 0;
    const cmp = Math.abs(diff) < 5 ? 'совпадает' : (diff > 0 ? 'завышает на ' : 'занижает на ') + Math.round(Math.abs(diff)) + '%';
    return { main: `${int(r.E)} ккал/день`, sub: `по факту · формула ${r.formula ? int(r.formula) : '—'}, ${cmp}` };
  }
  if (r.formula)
    return {
      main: `${int(r.formula)} ккал/день`,
      sub: `по формуле — данных пока мало: взвешиваний ${r.nW28} из 14, дней с калориями ${r.nK28} из 20`,
    };
  return { main: '—', sub: 'нужны вес и калории' };
}

export function reliabilityDetails(r: AdaptiveResult): string {
  const reasons = Object.keys(r.reasons)
    .map((k) => k + ' ' + r.reasons[k])
    .join(', ');
  return (
    `обычных дней ${r.normal28} из 28` +
    (r.excl28 ? `, исключено ${r.excl28}${reasons ? ' (' + reasons + ')' : ''}` : '') +
    (r.gap >= 3 ? ` · пропуск ${r.gap} дн. подряд` : '')
  );
}

export function goalText(g: GoalForecast): string {
  const gs = (v: number) => kg(v, 1) + ' кг';
  switch (g.kind) {
    case 'noGoal':
      return 'Прогноз цели: укажите цель в профиле';
    case 'noWeight':
      return `Прогноз цели ${gs(g.goal)}: нужен вес`;
    case 'reached':
      return `Цель ${gs(g.goal)}: достигнута по тренду веса`;
    case 'noTrend':
      return `Прогноз цели ${gs(g.goal)}: появится, когда будет тренд веса (≥8 взвешиваний в обычные дни за 15+ дней)`;
    case 'notApproaching':
      return `Цель ${gs(g.goal)}: при текущем темпе (${fmtSignedKg(g.paceKgWeek)} кг/нед) не приближается · по тренду сейчас ${kg(g.current)} кг`;
    case 'tooLong':
      return `Цель ${gs(g.goal)}: больше 2 лет при текущем темпе (${fmtSignedKg(g.paceKgWeek)} кг/нед)`;
    case 'date':
      return (
        `Цель ${gs(g.goal)}: ≈ ${dmy(g.date)} (через ${g.days < 14 ? g.days + ' дн.' : Math.round(g.days / 7) + ' нед.'}) · темп ${fmtSignedKg(g.paceKgWeek)} кг/нед по тренду, осталось ${kg(Math.abs(g.left), 2)} кг` +
        (g.rough ? ' · прогноз грубый, данных мало' : '')
      );
  }
}

export { dm, dmy };
export type { ISODate };
