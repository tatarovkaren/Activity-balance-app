import { describe, expect, it } from 'vitest';
import { applyReport, mapTrainType, parseReportBackup } from './import-report';
import { DEFAULT_PROFILE } from './types';

// Синтетика в формате резервной копии прототипа «Ежедневный отчёт» (значения — JSON-строки, префикс владельца).
const entries = {
  '2026-11-10': { weightToday: '71,6', weightYesterday: '', steps: '14289', protein: '115.4', fat: '59.4', carbs: '198.7', kcalOut: '1752', trainType: 'Силовая ', trainMin: '60', trainSteps: '', hrAvg: '90', hrMax: '111', comment: 'Норм', wellbeing: 9, anomalyType: '' },
  '2026-11-11': { weightToday: '71.5', weightYesterday: '71.6', steps: '19109', protein: '', fat: '', carbs: '', kcalOut: '', trainType: 'Кардио/эллипс ', trainMin: '30', trainSteps: '2700', hrAvg: '104', hrMax: '113', comment: '', wellbeing: null, anomalyType: 'trip' },
  '2026-11-12': { weightToday: '', weightYesterday: '71.5', steps: '', protein: '', fat: '', carbs: '', kcalOut: '', trainType: 'Отдых, досыпал ', trainMin: '', hrAvg: '', hrMax: '', comment: '', wellbeing: null },
  '2026-11-13': { weightToday: '', steps: '', trainType: '', trainMin: '', comment: '', wellbeing: null },
};
const file = JSON.stringify({
  app: 'daily-report',
  owner: 'karen',
  version: 1,
  exportedAt: '2026-11-19',
  data: {
    karen_daily_entries_v1: JSON.stringify(entries),
    karen_weight_history_v1: JSON.stringify({ '2026-11-01': '72.4', '2026-11-10': '99' }),
    karen_steps_history_v1: JSON.stringify({ '2026-11-02': '15157' }),
    karen_bodyfat_history_v1: JSON.stringify({ '2026-11-08': { bf: 19.7, neck: 36.4, waist: 85.9 } }),
    karen_anomaly_keep_v1: JSON.stringify({ '2026-11-05': true }),
    karen_daily_report_v2: JSON.stringify({ date: '2026-11-14', weightToday: '71', weightYesterday: '71.3', steps: '16000', trainType: 'Кардио Эллипс ', trainMin: '30', weightGoal: '68', stepsGoal: '14000' }),
  },
});

describe('импорт «Ежедневного отчёта»', () => {
  it('тип тренировки → вид и название', () => {
    expect(mapTrainType('Силовая ')).toEqual({ workoutKind: 'strength', workoutType: 'Силовая' });
    expect(mapTrainType('Кардио/орбитрек')).toEqual({ workoutKind: 'cardio', workoutType: 'Кардио/орбитрек' });
    expect(mapTrainType('эллипс ')).toEqual({ workoutKind: 'cardio', workoutType: 'эллипс' });
    expect(mapTrainType('Отдых')).toEqual({});
    expect(mapTrainType('')).toEqual({});
  });

  it('разбирает дни, истории, цели; запятая в числах; пустое = нет данных', () => {
    const r = parseReportBackup(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const d = r.report.days;
    expect(d['2026-11-10']).toEqual({ weight: 71.6, steps: 14289, protein: 115.4, fat: 59.4, carbs: 198.7, kcal: 1752, kcalManual: true, workoutKind: 'strength', workoutType: 'Силовая', workoutMin: 60, hrAvg: 90, hrMax: 111, comment: 'Норм', wellbeing: 9 });
    expect(d['2026-11-11']).toMatchObject({ weight: 71.5, workoutKind: 'cardio', workoutType: 'Кардио/эллипс', workoutMin: 30, workoutSteps: 2700, anomaly: 'trip' });
    expect(d['2026-11-11'].kcal).toBeUndefined();
    // «Отдых, досыпал» — не тренировка, остаток в комментарий
    expect(d['2026-11-12']).toEqual({ comment: 'досыпал' });
    expect(d['2026-11-01']).toEqual({ weight: 72.4 });
    expect(d['2026-11-02']).toEqual({ steps: 15157 });
    expect(d['2026-11-08']).toEqual({ neck: 36.4, waist: 85.9 });
    // вес из истории не перебивает вес дня; «вес вчера» дописывает только пустой вчерашний день
    expect(d['2026-11-10'].weight).toBe(71.6);
    expect(d['2026-11-13']).toEqual({ weight: 71.3 });
    // черновик экрана — свой день; «вес вчера» 71,3 → 13.11
    expect(d['2026-11-14']).toMatchObject({ weight: 71, steps: 16000, workoutKind: 'cardio', workoutMin: 30 });
    expect(r.report.keep).toEqual({ '2026-11-05': true });
    expect(r.report.goalWeightKg).toBe(68);
    expect(r.report.stepGoal).toBe(14000);
  });

  it('перенос дополняет и не затирает заполненное', () => {
    const r = parseReportBackup(file);
    if (!r.ok) throw new Error();
    const cur = { '2026-11-10': { weight: 71.2, comment: '' as unknown as string }, '2026-11-14': { weight: 70.9, steps: 16000 } };
    const a = applyReport(cur, { '2026-11-06': true }, { ...DEFAULT_PROFILE, goalWeightKg: 67 }, r.report, DEFAULT_PROFILE.stepGoal);
    expect(a.days['2026-11-10'].weight).toBe(71.2);
    expect(a.days['2026-11-10'].kcal).toBe(1752);
    expect(a.days['2026-11-10'].comment).toBe('Норм');
    expect(a.days['2026-11-14'].weight).toBe(70.9);
    expect(a.keep).toEqual({ '2026-11-05': true, '2026-11-06': true });
    expect(a.profile).toEqual({ stepGoal: 14000 }); // цель по весу уже задана в приложении
    expect(a.filled).toBe(2);
    expect(a.added).toBe(a.total - 2);
  });

  it('чужой файл не принимается', () => {
    expect(parseReportBackup('{"app":"balans","data":{"days":{}}}')).toEqual({ ok: false, error: 'backupNotOurs' });
    expect(parseReportBackup('не json')).toEqual({ ok: false, error: 'backupUnreadable' });
  });
});
