// Файлы: выбор (CSV, JSON, фото) и сохранение (резервная копия, PNG графиков и отчёта).
// В вебе сохранение — через ссылку a[download]; в мобильной версии — через системное «Поделиться» (этап 3).

import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export async function pickTextFile(types: string[] = ['*/*']): Promise<{ name: string; text: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: types, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const file = (a as unknown as { file?: File }).file;
  const text = file ? await file.text() : await (await fetch(a.uri)).text();
  return { name: a.name, text };
}

export function downloadBlob(name: string, blob: Blob) {
  if (Platform.OS !== 'web') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(name: string, text: string, mime = 'application/json') {
  downloadBlob(name, new Blob([text], { type: mime + ';charset=utf-8' }));
}

/** SVG-разметка → PNG ×2 на белом фоне (графики и отчёт всегда в светлой теме). */
export async function svgToPng(svg: string, width: number, height: number, bg = '#FFFFFF'): Promise<Blob | null> {
  if (Platform.OS !== 'web') return null;
  const img = new Image();
  const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('svg'));
    img.src = src;
  });
  const c = document.createElement('canvas');
  c.width = width * 2;
  c.height = height * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.scale(2, 2);
  ctx.drawImage(img, 0, 0, width, height);
  return await new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}

/** «PDF»: открыть печать с одним графиком — пользователь сохраняет как PDF. */
export function printSvg(title: string, svg: string) {
  if (Platform.OS !== 'web') return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;margin:24px;background:#fff;color:#111}svg{width:100%;height:auto}</style></head><body><h3>${title}</h3>${svg}<script>setTimeout(()=>print(),300)</script></body></html>`,
  );
  w.document.close();
}
