// Режим интерфейса «базовый / продвинутый». Влияет только на то, что показано:
// данные, поля и расчёты одинаковые в обоих режимах.

import { useStore } from '../data/store';

/** true — продвинутый режим: показывать разбивки, надёжность, исключённые дни и тонкие настройки. */
export function useAdvanced(): boolean {
  const { data } = useStore();
  return data.profile.uiMode !== 'basic';
}
