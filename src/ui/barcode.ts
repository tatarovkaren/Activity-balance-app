// Штрихкод со снимка: в браузере — встроенный BarcodeDetector (Chrome и Edge на Android и компьютере,
// Samsung Internet). В Safari на iPhone его нет — тогда пользователь вписывает цифры руками.
// В мобильном приложении (после пилота) — сканер камеры expo-camera.

import { Platform } from 'react-native';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = { new (o?: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> };

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

function ctor(): DetectorCtor | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return ((window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector as DetectorCtor) || null;
}

/** Умеет ли это устройство читать штрихкод со снимка. */
export async function canDetectBarcode(): Promise<boolean> {
  const C = ctor();
  if (!C) return false;
  try {
    const f = C.getSupportedFormats ? await C.getSupportedFormats() : FORMATS;
    return FORMATS.some((x) => f.includes(x));
  } catch {
    return false;
  }
}

/** Цифры штрихкода со снимка (uri или data:URL); null — не прочитался. */
export async function detectBarcode(uri: string): Promise<string | null> {
  const C = ctor();
  if (!C) return null;
  const img = new Image();
  img.src = uri;
  await img.decode();
  const found = await new C({ formats: FORMATS }).detect(img);
  return found.find((x) => /^\d{8,14}$/.test(x.rawValue))?.rawValue || null;
}
