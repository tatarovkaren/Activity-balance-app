// Чистая логика серверной оценки по фото: промпт, схема ответа модели, разбор ответа, лимиты.
// Без Deno и сетевых вызовов — поэтому проверяется тестами приложения (src/core/photo/server.test.ts).
// Контракт с приложением — docs/photo-provider.md (PhotoEstimateRequest → PhotoEstimateResponse).

/** Модель по умолчанию — дешёвая (≈0,1 ₽ за оценку из двух снимков). Сильная — по переменной PHOTO_MODEL. */
export const DEFAULT_MODEL = 'claude-haiku-5-5';

/** Лимиты — решение 18.11.2026: считается приём пищи (одна оценка), а не снимок. */
export const LIMITS = {
  free: { count: 2, windowHours: 24 },
  premium: { count: 30, windowHours: 24 }, // «без лимита», защита от злоупотреблений
} as const;
export type ServerPlan = keyof typeof LIMITS;

export function quotaCheck(plan: ServerPlan, usedInWindow: number) {
  const lim = LIMITS[plan] || LIMITS.free;
  return { ok: usedInWindow < lim.count, limit: lim.count, used: usedInWindow, per: 'day' as const };
}

/** id справочника приложения (src/core/photo/foods.ts). Синхронность проверяет тест. */
export const FOOD_IDS = [
  'buckwheat', 'rice', 'pasta', 'oats', 'potato_boiled', 'potato_mash', 'potato_fried', 'chicken_breast',
  'chicken_cutlet', 'beef_cutlet', 'beef', 'pork', 'fish_white', 'salmon', 'egg', 'omelet', 'cottage', 'cheese',
  'veg_fresh', 'veg_salad_oil', 'veg_stew', 'bread', 'apple', 'banana', 'soup', 'borscht', 'plov', 'pelmeni',
  'pizza', 'nuts', 'oil', 'butter', 'sauce_mayo', 'chocolate', 'pancakes', 'cake',
] as const;

export interface HandIn {
  palmWidth: number;
  palmLength: number;
  fistWidth: number;
  fistHeight: number;
  thumbLength: number;
}

export interface EstimateRequest {
  photos: { top: string; side?: string };
  hand: HandIn;
  note?: string;
  locale: string;
}

/** Системный промпт: метод Карена (docs/hand-portion-method.md), сжатый под ответ JSON. Стабилен — кэшируется. */
export const SYSTEM_PROMPT = `Ты оцениваешь порции еды по фото для дневника питания. Масштаб — рука пользователя рядом с едой (размеры руки даны в запросе); банковская карта 85,6×54 мм, если есть в кадре, — проверка масштаба.

Метод: размер по фото → объём → вес через плотность → ккал. Ты называешь продукты и размер порции; граммы и ккал по размеру считает приложение.

Правила:
1. Снимок сверху — площадь, снимок сбоку под 30–45° — высота горки и толщина кусков. Без снимка сбоку объём грубее: quality = "topOnly".
2. Рука должна лежать на одном уровне с едой. Если рука ближе к камере, над тарелкой, снимок под острым углом, еда за стеклом или в глубокой миске без вида сбоку — quality = "poor" и в retake напиши, как переснять.
3. Супы и еда в глубокой посуде: пользователь ставит кулак на ребро рядом с тарелкой (высота кулака известна) и снимает сбоку. Оцени диаметр посуды и уровень жидкости по руке и верни объём в мл (amount.kind = "volume").
4. Мясо, рыба, омлет, лепёшки — удобно в ладонях (ладонь толщиной ~1,5 см) или размерами в см (kind = "dims", форма slab). Крупы, паста, картофель, салат горкой — в кулаках (kind = "hand", unit = "fist") или dims с формой mound. Сыр, масло, соус, орехи — в больших пальцах (unit = "thumb").
5. Каждый продукт — отдельная строка, даже если на столе несколько блюд: всё на снимках — один приём пищи.
6. Всегда давай per100 — ккал и Б/Ж/У на 100 г продукта В ТОМ ВИДЕ, В КАКОМ ОН НА ТАРЕЛКЕ (готовый), и плотность г/мл. Если продукт совпадает с id из списка справочника — укажи foodId, иначе foodId = null.
7. Жареное и ресторанное: oilyGuess = true (приложение добавит скрытое масло +50–100 ккал). Видимый соус или масло на дне — отдельной строкой.
8. Начинку (бургер, ролл, пирог) без разреза не угадывай уверенно: confidence ниже и совет в retake снять в разрезе.
9. Не изображай точность: confidence 0–1 честно. comment — одна строка о главном источнике погрешности (масло, соус, скрытая начинка).
10. Свободный текст (name, retake, comment) — на языке locale из запроса. Код "addSide" в retake означает «добавьте снимок сбоку».

Справочник foodId: ${FOOD_IDS.join(', ')}.`;

/** Схема ответа модели (structured outputs). Плоская: необязательные поля — null. */
export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['components', 'quality', 'oilyGuess', 'retake', 'comment'],
  properties: {
    components: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'foodId', 'per100', 'amount', 'confidence'],
        properties: {
          name: { type: 'string' },
          foodId: { type: ['string', 'null'] },
          per100: {
            type: 'object',
            additionalProperties: false,
            required: ['kcal', 'p', 'f', 'c', 'density'],
            properties: { kcal: { type: 'number' }, p: { type: 'number' }, f: { type: 'number' }, c: { type: 'number' }, density: { type: 'number' } },
          },
          amount: {
            type: 'object',
            additionalProperties: false,
            required: ['kind', 'unit', 'count', 'ml', 'grams', 'lengthCm', 'widthCm', 'heightCm', 'shape'],
            properties: {
              kind: { type: 'string', enum: ['hand', 'dims', 'volume', 'grams'] },
              unit: { type: ['string', 'null'], description: 'palm | fist | cupped | thumb | fingertip (для kind = hand)' },
              count: { type: ['number', 'null'] },
              ml: { type: ['number', 'null'] },
              grams: { type: ['number', 'null'] },
              lengthCm: { type: ['number', 'null'] },
              widthCm: { type: ['number', 'null'] },
              heightCm: { type: ['number', 'null'] },
              shape: { type: ['string', 'null'], description: 'slab | mound | cylinder (для kind = dims)' },
            },
          },
          confidence: { type: 'number' },
        },
      },
    },
    quality: { type: 'string', enum: ['good', 'topOnly', 'poor'] },
    oilyGuess: { type: 'boolean' },
    retake: { type: 'array', items: { type: 'string' } },
    comment: { type: ['string', 'null'] },
  },
} as const;

export function userText(req: EstimateRequest): string {
  const h = req.hand;
  return [
    `locale: ${req.locale}`,
    `Рука пользователя, см: ладонь ${h.palmWidth}×${h.palmLength} (без пальцев), кулак ${h.fistWidth}×${h.fistHeight} (ширина × высота на ребре), большой палец ${h.thumbLength}.`,
    `Снимки: первый — сверху${req.photos.side ? ', второй — сбоку под 30–45°' : '; снимка сбоку нет'}.`,
    req.note ? `Подсказка пользователя: ${req.note.slice(0, 300)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** data:image/jpeg;base64,... → блок изображения для Messages API. */
export function imageBlock(dataUrl: string) {
  const m = /^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/s.exec(dataUrl || '');
  if (!m) return null;
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: m[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: m[3] } };
}

const pos = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Ответ модели → PhotoEstimateResponse приложения. Невалидные строки отбрасываются. */
export function toAppResponse(raw: unknown) {
  const r = (raw || {}) as Record<string, any>;
  const components: Record<string, unknown>[] = [];
  for (const c of Array.isArray(r.components) ? r.components : []) {
    const a = c?.amount || {};
    let amount: Record<string, unknown> | null = null;
    if (a.kind === 'hand' && ['palm', 'fist', 'cupped', 'thumb', 'fingertip'].includes(a.unit) && pos(a.count))
      amount = { kind: 'hand', unit: a.unit, count: clamp(a.count, 0.05, 20) };
    else if (a.kind === 'volume' && pos(a.ml)) amount = { kind: 'volume', ml: clamp(a.ml, 1, 5000) };
    else if (a.kind === 'grams' && pos(a.grams)) amount = { kind: 'grams', grams: clamp(a.grams, 1, 5000) };
    else if (a.kind === 'dims' && pos(a.lengthCm) && pos(a.widthCm) && pos(a.heightCm))
      amount = { kind: 'dims', lengthCm: a.lengthCm, widthCm: a.widthCm, heightCm: a.heightCm, shape: ['slab', 'mound', 'cylinder'].includes(a.shape) ? a.shape : 'mound' };
    if (!amount) continue;
    const p = c.per100 || {};
    const known = typeof c.foodId === 'string' && (FOOD_IDS as readonly string[]).includes(c.foodId);
    const per100 = pos(p.kcal) != null || p.kcal === 0
      ? { kcal: clamp(Number(p.kcal) || 0, 0, 900), p: clamp(Number(p.p) || 0, 0, 100), f: clamp(Number(p.f) || 0, 0, 100), c: clamp(Number(p.c) || 0, 0, 100), density: clamp(Number(p.density) || 1, 0.05, 1.5) }
      : undefined;
    if (!known && !per100) continue;
    components.push({
      ...(known ? { foodId: c.foodId } : {}),
      ...(typeof c.name === 'string' && c.name.trim() ? { name: c.name.trim().slice(0, 80) } : {}),
      ...(per100 && !known ? { per100 } : {}),
      amount,
      confidence: clamp(Number(c.confidence) || 0.5, 0, 1),
    });
  }
  const quality = ['good', 'topOnly', 'poor'].includes(r.quality) ? r.quality : 'poor';
  const retake = (Array.isArray(r.retake) ? r.retake : []).filter((x: unknown) => typeof x === 'string' && x.trim()).slice(0, 3);
  return {
    components,
    quality,
    oilyGuess: !!r.oilyGuess,
    ...(retake.length ? { retake } : {}),
    ...(typeof r.comment === 'string' && r.comment.trim() ? { comment: r.comment.trim().slice(0, 300) } : {}),
  };
}
