// Supabase Edge Function «photo-estimate»: оценка приёма пищи по фото.
// Приложение шлёт снимки (сверху + сбоку) и размеры руки; функция проверяет вход и лимит тарифа,
// зовёт модель Claude (по умолчанию дешёвая Haiku 5.5) и возвращает продукты с размерами порций.
// Граммы, ккал, диапазон и скрытое масло считает приложение (src/core/photo/estimate.ts).
// Снимки нигде не сохраняются. Ключ модели — только здесь, в секретах функции.
//
// Развёртывание (docs/photo-provider.md):
//   supabase secrets set ANTHROPIC_API_KEY=... [PHOTO_MODEL=claude-haiku-5-5]
//   supabase functions deploy photo-estimate
//
// Важно: Anthropic API недоступен из РФ, а фото еды — персональные данные. Эта функция — для контура вне РФ
// и для тестов. Для РФ-контура — та же логика с российской моделью (YandexGPT / GigaChat), решение — после юриста.

import Anthropic from 'npm:@anthropic-ai/sdk@1.6.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { DEFAULT_MODEL, imageBlock, quotaCheck, RESPONSE_SCHEMA, SYSTEM_PROMPT, toAppResponse, userText, type EstimateRequest, type ServerPlan, LIMITS } from './logic.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const anthropic = new Anthropic(); // ANTHROPIC_API_KEY из секретов функции
const MODEL = Deno.env.get('PHOTO_MODEL') || DEFAULT_MODEL;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });

  // 1. Кто спрашивает: токен пользователя Supabase
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json(401, { error: 'auth' });
  const userId = u.user.id;

  // 2. Согласие на обработку фото (журнал consents, миграция 0002)
  const { data: consent } = await admin.from('consents').select('id').eq('user_id', userId).eq('kind', 'photo_ai').is('revoked_at', null).limit(1);
  if (!consent?.length) return json(403, { error: 'consent' });

  // 3. Лимит: тариф — из subscriptions (пишет только биллинг), не из профиля, который правит сам пользователь
  const { data: sub } = await admin.from('subscriptions').select('plan, until').eq('user_id', userId).maybeSingle();
  const plan: ServerPlan = sub?.plan === 'premium' && (!sub.until || new Date(sub.until) > new Date()) ? 'premium' : 'free';
  const since = new Date(Date.now() - LIMITS[plan].windowHours * 3600_000).toISOString();
  const { count } = await admin.from('photo_usage').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('used_at', since);
  const q = quotaCheck(plan, count || 0);
  if (!q.ok) return json(429, { error: 'limit', limit: q.limit, per: q.per, plan });

  // 4. Вход
  let body: EstimateRequest;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'body' });
  }
  const top = imageBlock(body?.photos?.top);
  const side = body?.photos?.side ? imageBlock(body.photos.side) : null;
  if (!top || !body.hand) return json(400, { error: 'photos' });

  // 5. Модель: один запрос, ответ строго по схеме
  let msg: Anthropic.Message;
  try {
    msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: RESPONSE_SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: 'user', content: [top, ...(side ? [side] : []), { type: 'text', text: userText(body) }] }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: 'busy' });
    if (e instanceof Anthropic.APIError) return json(502, { error: 'model', status: e.status });
    return json(502, { error: 'model' });
  }
  if (msg.stop_reason === 'refusal') return json(422, { error: 'refusal' });
  const text = msg.content.find((b) => b.type === 'text');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text && text.type === 'text' ? text.text : '');
  } catch {
    return json(502, { error: 'parse' });
  }

  // 6. Учёт оценки (одна оценка = один приём пищи) и ответ. Снимки не сохраняем.
  await admin.from('photo_usage').insert({ user_id: userId });
  return json(200, toAppResponse(parsed));
});
