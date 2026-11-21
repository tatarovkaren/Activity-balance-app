// Версия и дата выпуска приложения. Источник — package.json и git (scripts/build-version.mjs),
// здесь только удобные функции для экранов.

import { APP_VERSION, BUILD, RELEASE_DATE } from './version.gen';
import type { ISODate } from '../core/dates';

export { APP_VERSION, BUILD };
export const RELEASE: ISODate = RELEASE_DATE as ISODate;
