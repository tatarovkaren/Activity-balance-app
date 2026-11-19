// Сохранение резервной копии — общее для Профиля («Экспорт данных») и напоминания на «Дне».

import { todayISO } from '../core/dates';
import { makeBackup } from '../core/importers';
import { useStore } from '../data/store';
import { useI18n } from '../i18n';
import { downloadText } from './files';

/** Возвращает функцию: сохраняет файл копии, запоминает время и отдаёт число дней в копии. */
export function useBackupExport(): () => number {
  const { data, session, markBackup } = useStore();
  const { tx } = useI18n();
  return () => {
    const b = makeBackup(session.userId, { profile: data.profile, days: data.days, keep: data.keep, hand: data.hand, refs: data.refs, photoEdits: data.photoEdits });
    downloadText(`${tx.profile.backupFile}-${todayISO()}.json`, JSON.stringify(b, null, 1));
    markBackup();
    return Object.keys(data.days).length;
  };
}
