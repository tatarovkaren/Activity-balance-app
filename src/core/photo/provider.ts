// Провайдер оценки фото — точка подключения любой модели (Claude, YandexGPT, GigaChat и др.).
// Приложение не знает, какая модель стоит за провайдером: оно отдаёт снимки и размеры руки,
// получает список продуктов с размерами и само считает граммы, ккал и диапазон (estimate.ts).

import { shiftDate, type ISODate } from '../dates';
import type { Plan } from '../types';
import { FOODS } from './foods';
import type { ComponentInput, HandProfile, PhotoQuality } from './estimate';

export interface PhotoInput {
  /** Снимок сверху (обязателен) и сбоку под 30–45° (желателен). data: URL или blob: URI. */
  top: string;
  side?: string;
}

export interface PhotoEstimateRequest {
  photos: PhotoInput;
  hand: HandProfile;
  /** Подсказка пользователя: «гречка с курицей», «ресторан». */
  note?: string;
  locale: 'ru' | 'en';
}

export interface PhotoEstimateResponse {
  components: ComponentInput[];
  quality: PhotoQuality;
  /** Ресторанная или жареная еда — приложение добавит скрытое масло. */
  oilyGuess: boolean;
  /** Если ракурс плохой — что переснять. */
  retake?: string[];
  /** Пояснение масштаба: «ладонь 10×10,5 см». */
  scaleNote?: string;
}

export interface FoodPhotoProvider {
  id: string;
  /** Название для интерфейса, без имени модели — пользователю не важно, кто считает. */
  label: string;
  /** true — оценивает по снимкам автоматически; false — пользователь вводит порции сам. */
  automatic: boolean;
  estimate(req: PhotoEstimateRequest): Promise<PhotoEstimateResponse>;
}

/** Без ИИ: пустой черновик, пользователь описывает порции в «ладонях/кулаках» или граммах. */
export const manualProvider: FoodPhotoProvider = {
  id: 'manual',
  label: 'Ручной ввод порций',
  automatic: false,
  async estimate(req) {
    return {
      components: [],
      quality: req.photos.side ? 'good' : 'topOnly',
      oilyGuess: false,
    };
  },
};

/**
 * Демо-провайдер: имитирует ответ модели на типовую тарелку, чтобы показать весь путь
 * (черновик → правка → подтверждение) до подключения настоящей модели. Не смотрит на снимок.
 */
export const demoProvider: FoodPhotoProvider = {
  id: 'demo',
  label: 'Демо-оценка (без ИИ)',
  automatic: true,
  async estimate(req) {
    await new Promise((r) => setTimeout(r, 700));
    const note = (req.note || '').toLowerCase();
    const pick = FOODS.filter((f) => note && f.name.toLowerCase().split(' ').some((w) => w.length > 3 && note.includes(w.slice(0, 5))));
    const components: ComponentInput[] = pick.length
      ? pick.slice(0, 3).map((f, i) => ({ foodId: f.id, amount: { kind: 'hand', unit: i === 0 ? 'fist' : 'palm', count: 1 }, confidence: 0.5 }))
      : [
          { foodId: 'buckwheat', amount: { kind: 'hand', unit: 'fist', count: 0.7 }, confidence: 0.7 },
          { foodId: 'chicken_cutlet', amount: { kind: 'hand', unit: 'palm', count: 0.8 }, confidence: 0.6 },
          { foodId: 'veg_fresh', amount: { kind: 'hand', unit: 'fist', count: 0.6 }, confidence: 0.8 },
        ];
    return {
      components,
      quality: req.photos.side ? 'good' : 'topOnly',
      oilyGuess: true,
      retake: req.photos.side ? undefined : ['Добавьте снимок сбоку под 30–45° — по нему видна высота порции.'],
      scaleNote: `ладонь ${req.hand.palmWidth}×${req.hand.palmLength} см`,
    };
  },
};

/**
 * Серверный провайдер: POST {endpoint} с телом PhotoEstimateRequest → PhotoEstimateResponse.
 * Модель выбирается на сервере (по контуру рынка: РФ — российская модель, вне РФ — любая),
 * ключи API на клиент не попадают. Контракт описан в docs/photo-provider.md.
 */
export function httpProvider(endpoint: string, getToken?: () => Promise<string | undefined>): FoodPhotoProvider {
  return {
    id: 'http',
    label: 'Оценка по фото (бета)',
    automatic: true,
    async estimate(req) {
      const token = getToken ? await getToken() : undefined;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`Сервис оценки ответил ${res.status}`);
      const j = (await res.json()) as PhotoEstimateResponse;
      if (!j || !Array.isArray(j.components)) throw new Error('Сервис оценки вернул неожиданный ответ');
      return j;
    },
  };
}

// ---- Лимиты фото по тарифу (гипотеза из плана: бесплатно 5/нед, премиум 5/день) ----


export const PHOTO_LIMITS: Record<Plan, { count: number; per: 'week' | 'day' }> = {
  free: { count: 5, per: 'week' },
  premium: { count: 5, per: 'day' },
};

/** usage: даты (ГГГГ-ММ-ДД) каждой автоматической оценки. Неделя — скользящие 7 дней. */
export function photoQuota(plan: Plan, usage: ISODate[], today: ISODate) {
  const lim = PHOTO_LIMITS[plan];
  const from = lim.per === 'day' ? today : shiftDate(today, -6);
  const used = usage.filter((d) => d >= from && d <= today).length;
  return { used, limit: lim.count, per: lim.per, left: Math.max(0, lim.count - used) };
}
