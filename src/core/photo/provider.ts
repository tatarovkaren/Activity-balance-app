// Провайдер оценки фото — точка подключения любой модели (Claude, YandexGPT, GigaChat и др.).
// Приложение не знает, какая модель стоит за провайдером: оно отдаёт снимки и размеры руки,
// получает список продуктов с размерами и само считает граммы, ккал и диапазон (estimate.ts).

import { shiftDate, type ISODate } from '../dates';
import type { Lang, Plan } from '../types';
import { FOOD_BY_ID } from './foods';
import { componentsFromName, oilyHint } from './match';
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
  /** Язык интерфейса: на нём сервер возвращает свободный текст (retake). */
  locale: Lang;
}

export interface PhotoEstimateResponse {
  components: ComponentInput[];
  quality: PhotoQuality;
  /** Ресторанная или жареная еда — приложение добавит скрытое масло. */
  oilyGuess: boolean;
  /**
   * Если ракурс плохой — что переснять. Известные коды переводит приложение (RETAKE_CODES),
   * любой другой текст сервер присылает уже на языке locale.
   */
  retake?: string[];
  /** Одна строка о главном источнике погрешности (масло, соус, начинка) — на языке locale. */
  comment?: string;
}

/** Коды подсказок «переснять», которые приложение переводит само. */
export const RETAKE_CODES = ['addSide'] as const;

/** Ошибка сервиса оценки: статус HTTP или неожиданный ответ. Текст — в словарях (errors.*). */
export class PhotoServiceError extends Error {
  constructor(
    public code: 'photoServiceStatus' | 'photoServiceBadResponse',
    public status?: number,
  ) {
    super(code);
  }
}

export interface FoodPhotoProvider {
  /** Название для интерфейса берётся из словаря по id (photo.providers.*), без имени модели. */
  id: string;
  /** true — оценивает по снимкам автоматически; false — пользователь вводит порции сам. */
  automatic: boolean;
  estimate(req: PhotoEstimateRequest): Promise<PhotoEstimateResponse>;
}

/** Без ИИ: пустой черновик, пользователь описывает порции в «ладонях/кулаках» или граммах. */
export const manualProvider: FoodPhotoProvider = {
  id: 'manual',
  automatic: false,
  async estimate(req) {
    return {
      components: [],
      quality: req.photos.side ? 'good' : 'topOnly',
      oilyGuess: false,
    };
  },
};

/** Пример черновика демо-оценки, когда название блюда не введено. */
export const DEMO_EXAMPLE: ComponentInput[] = [
  { foodId: 'buckwheat', amount: { kind: 'hand', unit: 'fist', count: 0.7 }, confidence: 0.7 },
  { foodId: 'chicken_cutlet', amount: { kind: 'hand', unit: 'palm', count: 0.8 }, confidence: 0.6 },
  { foodId: 'veg_fresh', amount: { kind: 'hand', unit: 'fist', count: 0.6 }, confidence: 0.8 },
];

/**
 * Демо-провайдер: имитирует ответ модели, чтобы показать весь путь
 * (черновик → правка → подтверждение) до подключения настоящей модели. Не смотрит на снимок.
 * Если введено название блюда — черновик из него: продукты справочника с типичной порцией,
 * иначе одна строка с этим названием и пометкой «проверьте». Без названия — пример (DEMO_EXAMPLE).
 */
export const demoProvider: FoodPhotoProvider = {
  id: 'demo',
  automatic: true,
  async estimate(req) {
    await new Promise((r) => setTimeout(r, 700));
    const note = (req.note || '').trim();
    const fromName = note ? componentsFromName(note) : [];
    const components = fromName.length ? fromName : DEMO_EXAMPLE;
    const oilyGuess = fromName.length
      ? oilyHint(note) || fromName.some((c) => !!c.foodId && !!FOOD_BY_ID[c.foodId]?.oily)
      : true;
    return {
      components,
      quality: req.photos.side ? 'good' : 'topOnly',
      oilyGuess,
      retake: req.photos.side ? undefined : ['addSide'],
    };
  },
};

/**
 * Серверный провайдер: POST {endpoint} с телом PhotoEstimateRequest → PhotoEstimateResponse.
 * Модель выбирается на сервере (по контуру рынка: РФ — российская модель, вне РФ — любая),
 * ключи API на клиент не попадают. Контракт описан в docs/photo-provider.md.
 */
/** Сервер ответил 429: лимит тарифа исчерпан. */
export class PhotoLimitError extends Error {
  constructor(public limit: number, public per: 'week' | 'day') {
    super('photoLimit');
  }
}

export function httpProvider(endpoint: string, getToken?: () => Promise<string | undefined>): FoodPhotoProvider {
  return {
    id: 'http',
    automatic: true,
    async estimate(req) {
      const token = getToken ? await getToken() : undefined;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(req),
      });
      if (res.status === 429) {
        const j = (await res.json().catch(() => ({}))) as { limit?: number; per?: 'week' | 'day' };
        throw new PhotoLimitError(j.limit ?? 0, j.per === 'day' ? 'day' : 'week');
      }
      if (!res.ok) throw new PhotoServiceError('photoServiceStatus', res.status);
      const j = (await res.json()) as PhotoEstimateResponse;
      if (!j || !Array.isArray(j.components)) throw new PhotoServiceError('photoServiceBadResponse');
      return j;
    },
  };
}

// ---- Лимиты фото по тарифу (решение Карена 18.11.2026) ----
// Считается приём пищи, а не снимок: все блюда на столе + снимок сбоку = одна оценка.
// Бесплатно — 2 приёма в день; Премиум — без лимита, защита от злоупотреблений 30 оценок в день.
// Пока только счётчик: приложение показывает остаток и не блокирует. Блокирует сервер (supabase/functions/photo-estimate).

export const PHOTO_LIMITS: Record<Plan, { count: number; per: 'week' | 'day'; fairUse?: boolean }> = {
  free: { count: 2, per: 'day' },
  premium: { count: 30, per: 'day', fairUse: true },
};

/** usage: даты (ГГГГ-ММ-ДД) каждой автоматической оценки. Неделя — скользящие 7 дней. */
export function photoQuota(plan: Plan, usage: ISODate[], today: ISODate) {
  const lim = PHOTO_LIMITS[plan];
  const from = lim.per === 'day' ? today : shiftDate(today, -6);
  const used = usage.filter((d) => d >= from && d <= today).length;
  return { used, limit: lim.count, per: lim.per, fairUse: !!lim.fairUse, left: Math.max(0, lim.count - used) };
}
