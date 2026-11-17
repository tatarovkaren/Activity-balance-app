// Импорт FatSecret из файла: CSV (сайт) или PDF-отчёт (приложение FatSecret отдаёт PDF).

import { parseFatSecret, parseFatSecretPdf, type FatSecretParse } from '../core/importers';
import { pickImportFile } from './files';
import { pdfLines } from './pdf';

export const FATSECRET_TYPES = ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', 'application/pdf', '*/*'];

/** null — пользователь закрыл выбор файла. */
export async function importFatSecretFile(): Promise<FatSecretParse | null> {
  const f = await pickImportFile(FATSECRET_TYPES);
  if (!f) return null;
  if (f.text != null) return parseFatSecret(f.text);
  let lines;
  try {
    lines = await pdfLines(f.pdf!);
  } catch (e) {
    const code = (e as Error).message;
    return { ok: false, error: code === 'pdfNoText' || code === 'pdfNativeOnly' ? code : 'pdfUnreadable' };
  }
  const r = parseFatSecretPdf(lines);
  // формат PDF не распознан — понятная подсказка вместо «нет строки Дата»
  return r.ok ? r : { ok: false, error: 'pdfUnreadable' };
}
