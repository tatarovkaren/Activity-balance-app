// Текст из PDF (отчёт FatSecret) — только в вебе, через pdf.js.
// Библиотека подгружается отдельным куском при первом PDF, чтобы не утяжелять запуск приложения.
// Воркер исполняется в основном потоке («fake worker»): отчёт дневника небольшой, а отдельный файл
// воркера не нужен — так проще и в демо, собранном в один HTML.

import { Platform } from 'react-native';
import type { PdfLine } from '../core/importers';

export async function pdfLines(data: ArrayBuffer): Promise<PdfLine[]> {
  if (Platform.OS !== 'web') throw new Error('pdfNativeOnly');
  let doc;
  try {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist/legacy/build/pdf.min.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
    ]);
    (globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = worker;
    doc = await lib.getDocument({ data: new Uint8Array(data), isEvalSupported: false }).promise;
  } catch {
    throw new Error('pdfUnreadable');
  }
  const out: PdfLine[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const tc = await page.getTextContent();
    // строки — по вертикали (y), в пределах строки — слева направо
    const rows: { y: number; items: { x: number; w: number; str: string }[] }[] = [];
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number }[]) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, items: [] }));
      row.items.push({ x, w: it.width || 0, str: it.str.trim() });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) out.push({ page: n, items: r.items.sort((a, b) => a.x - b.x) });
  }
  if (!out.length) throw new Error('pdfNoText');
  return out;
}
