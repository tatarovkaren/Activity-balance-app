// Supabase Edge Function «notify»: веб-пуши и Telegram-бот.
//
// Что делает:
//   • каждые 5 минут (pg_cron, задание ставится само при первом вызове) рассылает напоминания:
//     взвеситься утром, дневник не заполнен, новый комментарий куратора, резервная копия;
//   • отдаёт приложению открытый ключ VAPID (ключи создаются сами и хранятся в базе);
//   • выдаёт ссылку привязки Telegram и отвечает боту (вебхук тоже ставится сам);
//   • бот принимает быстрый ввод: вес числом, шаги и самочувствие кнопками — и пишет их в дневник;
//   • по понедельникам присылает в Telegram сводку за прошлую неделю (по кнопке «📊 Неделя» — за 7 дней);
//   • присылает тестовое уведомление по кнопке в Профиле.
//
// Настройка (docs/notifications.md): развернуть функцию с выключенной проверкой JWT
// (вход проверяется внутри), для Telegram — секрет TELEGRAM_BOT_TOKEN. Больше ничего.
// Таблицы — миграция 0007_notifications.sql.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import {
  BOT_REPLIES,
  dueReminders,
  LINK_CODE_MIN,
  localParts,
  makeLinkCode,
  message,
  normPrefs,
  parseCommand,
  telegramPayload,
  tgLang,
  webhookSecret,
  type Message,
  type Prefs,
} from './logic.ts';
import { generateVapidKeys, sendWebPush, type VapidKeys } from './webpush.ts';
import {
  applyQuick,
  callbackDateOk,
  parseCallback,
  parseQuick,
  QUICK_REPLIES,
  replyKeyboard,
  weekSummary,
  weekSummaryText,
  wellbeingKeyboard,
  type BotField,
} from './bot.ts';
import { PARAMS, shiftDate, type DayMap, type ISODate } from './core.gen.ts';

declare const Deno: { env: { get(k: string): string | undefined }; serve(h: (r: Request) => Promise<Response>): void };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const FN_URL = SB_URL.replace(/\/$/, '') + '/functions/v1/notify';
const BOT = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:push@activity-balance.app';
const admin: SupabaseClient = createClient(SB_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

// ---- секреты в базе (таблица notify_secrets, доступна только серверу) ----

async function secret(key: string): Promise<string | null> {
  const { data } = await admin.from('notify_secrets').select('value').eq('key', key).maybeSingle();
  return (data?.value as string) || null;
}

let vapidCache: VapidKeys | null = null;
async function vapid(): Promise<VapidKeys> {
  if (vapidCache) return vapidCache;
  let v = await secret('vapid');
  if (!v) {
    // первый запуск: создать ключи; если параллельно создал другой экземпляр — взять его ключи
    await admin.from('notify_secrets').upsert({ key: 'vapid', value: JSON.stringify(await generateVapidKeys()) }, { onConflict: 'key', ignoreDuplicates: true });
    v = await secret('vapid');
  }
  vapidCache = JSON.parse(v!) as VapidKeys;
  return vapidCache;
}

// ---- одноразовая настройка: расписание и вебхук ----

let cronDone = false;
async function ensureCron() {
  if (cronDone) return;
  const { error } = await admin.rpc('ensure_notify_cron', { fn_url: FN_URL });
  if (error) console.warn('ensure_notify_cron:', error.message);
  else cronDone = true;
}

async function tg(method: string, body?: unknown): Promise<{ ok: boolean; status: number; result?: any }> {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, status: r.status, result: j.result };
}

let hookDone = false;
let botName = '';
async function ensureTelegram() {
  if (!BOT || hookDone) return;
  const me = await tg('getMe');
  if (me.ok) botName = me.result.username;
  const info = await tg('getWebhookInfo');
  const updates = ['message', 'callback_query'];
  const have: string[] = info.result?.allowed_updates || ['message'];
  if (!info.ok || info.result?.url !== FN_URL || updates.some((u) => !have.includes(u))) {
    const r = await tg('setWebhook', { url: FN_URL, secret_token: await webhookSecret(BOT), allowed_updates: updates });
    if (!r.ok) return console.warn('setWebhook failed', r.status);
  }
  hookDone = !!botName;
}

// ---- доставка ----

interface Channels {
  push: { endpoint: string; p256dh: string; auth: string }[];
  chat?: number;
}

async function channelsOf(userIds: string[]): Promise<Map<string, Channels>> {
  const m = new Map<string, Channels>();
  const get = (u: string) => m.get(u) || (m.set(u, { push: [] }), m.get(u)!);
  let q1 = admin.from('push_subscriptions').select('user_id, endpoint, p256dh, auth');
  let q2 = admin.from('telegram_links').select('user_id, chat_id');
  if (userIds.length) {
    q1 = q1.in('user_id', userIds);
    q2 = q2.in('user_id', userIds);
  }
  const [a, b] = await Promise.all([q1, BOT ? q2 : Promise.resolve({ data: [] as any[] })]);
  for (const r of a.data || []) get(r.user_id).push.push(r);
  for (const r of b.data || []) get(r.user_id).chat = Number(r.chat_id);
  return m;
}

async function deliver(userId: string, ch: Channels, msg: Message, lang: Prefs['lang']) {
  let push = 0;
  let telegram = false;
  const keys = ch.push.length ? await vapid() : null;
  for (const s of ch.push) {
    const r = await sendWebPush(s, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }, keys!, SUBJECT).catch(() => 'error' as const);
    if (r === 'ok') push++;
    if (r === 'gone') await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
  }
  if (ch.chat && BOT) {
    const r = await tg('sendMessage', telegramPayload(ch.chat, msg, lang));
    telegram = r.ok;
    // пользователь заблокировал бота — отвязать
    if (r.status === 403) await admin.from('telegram_links').delete().eq('user_id', userId);
  }
  return { push, telegram };
}

async function profiles(ids: string[]): Promise<Map<string, Prefs>> {
  const m = new Map<string, Prefs>();
  if (!ids.length) return m;
  const { data } = await admin.from('profiles').select('id, data').in('id', ids);
  for (const r of data || []) m.set(r.id, normPrefs(r.data?.notify, r.data?.lang));
  for (const id of ids) if (!m.has(id)) m.set(id, normPrefs(null));
  return m;
}

// ---- по расписанию ----

async function tick() {
  const now = new Date();
  const ch = await channelsOf([]);
  const users = [...ch.keys()];
  const prefs = await profiles(users);

  // 1. Напоминания по времени
  const localDate = new Map(users.map((u) => [u, localParts(now, prefs.get(u)!.tz).date]));
  const dates = [...new Set(localDate.values())];
  const days = new Map<string, any>();
  if (users.length) {
    const { data } = await admin.from('day_entries').select('user_id, date, data').in('user_id', users).in('date', dates);
    for (const r of data || []) if (r.date === localDate.get(r.user_id)) days.set(r.user_id, r.data);
  }
  // сводка за неделю — только в Telegram (длинная и с цифрами дневника, пушу не подходит)
  const due = users.flatMap((u) =>
    dueReminders(prefs.get(u)!, now, days.get(u))
      .filter((d) => d.kind !== 'weekly' || (BOT && ch.get(u)!.chat))
      .map((d) => ({ user_id: u, ...d })),
  );
  let sent = 0;
  if (due.length) {
    // журнал: ушедшее не уходит ещё раз, даже если функцию вызвали дважды
    const { data: fresh } = await admin
      .from('notify_log')
      .upsert(due.map((d) => ({ user_id: d.user_id, ref: d.ref })), { onConflict: 'user_id,ref', ignoreDuplicates: true })
      .select('user_id, ref');
    const ok = new Set((fresh || []).map((r) => r.user_id + '|' + r.ref));
    for (const d of due) {
      if (!ok.has(d.user_id + '|' + d.ref)) continue;
      const p = prefs.get(d.user_id)!;
      if (d.kind === 'weekly') {
        // прошлая неделя: пн–вс, воскресенье — вчера по местному времени
        const to = shiftDate(localDate.get(d.user_id)!, -1);
        await sendSummary(d.user_id, ch.get(d.user_id)!.chat!, p, to, 'weekly').catch((e) => console.warn('weekly', e));
      } else await deliver(d.user_id, ch.get(d.user_id)!, message(d.kind, p), p.lang);
      sent++;
    }
  }

  // 2. Новые комментарии куратора (за последние сутки, ещё не отмеченные)
  const { data: cs } = await admin
    .from('day_comments')
    .select('id, client_id, curator_id, date')
    .is('notified_at', null)
    .gte('created_at', new Date(now.getTime() - 86400_000).toISOString())
    .order('created_at')
    .limit(500);
  if (cs?.length) {
    await admin.from('day_comments').update({ notified_at: now.toISOString() }).in('id', cs.map((c) => c.id));
    const names = new Map<string, string>();
    const { data: cur } = await admin.from('curators').select('id, name').in('id', [...new Set(cs.map((c) => c.curator_id))]);
    for (const c of cur || []) names.set(c.id, c.name);
    // несколько комментариев одному клиенту за раз — одно сообщение
    const seen = new Set<string>();
    for (const c of cs) {
      const key = c.client_id + '|' + c.date;
      if (seen.has(key) || !ch.has(c.client_id)) continue;
      seen.add(key);
      const p = prefs.get(c.client_id)!;
      if (!p.comment.on) continue;
      await deliver(c.client_id, ch.get(c.client_id)!, message('comment', p, { curator: names.get(c.curator_id), date: c.date }), p.lang);
      sent++;
    }
  }

  // 3. Уборка
  await admin.from('notify_log').delete().lt('sent_at', new Date(now.getTime() - 90 * 86400_000).toISOString());
  await admin.from('telegram_link_codes').delete().lt('expires_at', now.toISOString());
  return { users: users.length, sent };
}

// ---- Telegram: сводка и запись в дневник ----

async function sendSummary(userId: string, chatId: number, p: Prefs, to: ISODate, title: 'weekly' | 'last7') {
  const since = shiftDate(to, -PARAMS.MAX_DAYS);
  const [prof, rows] = await Promise.all([
    admin.from('profiles').select('data, anomaly_keep').eq('id', userId).maybeSingle(),
    admin.from('day_entries').select('date, data').eq('user_id', userId).gte('date', since).lte('date', to),
  ]);
  const days: DayMap = {};
  for (const r of rows.data || []) days[r.date as string] = r.data;
  const text = weekSummaryText(weekSummary(prof.data?.data, days, prof.data?.anomaly_keep, to), p.lang, title);
  return tg('sendMessage', telegramPayload(chatId, message('weekly', p), p.lang, text));
}

/** Записать поле дня. Остальные поля дня остаются как были (пустое не затирает заполненное). */
async function saveField(userId: string, date: ISODate, field: BotField, value: number) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await admin.from('day_entries').select('data').eq('user_id', userId).eq('date', date).maybeSingle();
    if (error) throw error;
    const r = applyQuick(row?.data || undefined, field, value, Date.now());
    const result = row
      ? await admin.from('day_entries').update({ data: r.entry, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('date', date).eq('data', JSON.stringify(row.data)).select('date')
      : await admin.from('day_entries').upsert({ user_id: userId, date, data: r.entry }, { onConflict: 'user_id,date', ignoreDuplicates: true }).select('date');
    if (result.error) throw result.error;
    if (result.data?.length === 1) return r.prev;
  }
  throw new Error('Concurrent diary update; retry required');
}

async function linkedUser(chatId: number): Promise<{ userId: string; p: Prefs } | null> {
  const { data } = await admin.from('telegram_links').select('user_id').eq('chat_id', chatId).maybeSingle();
  if (!data?.user_id) return null;
  return { userId: data.user_id, p: (await profiles([data.user_id])).get(data.user_id)! };
}

// ---- Telegram: входящие сообщения ----

async function onTelegram(update: any) {
  if (update?.callback_query) return onButton(update.callback_query);
  const msg = update?.message;
  if (!msg?.chat?.id || msg.chat.type !== 'private') return;
  const chatId = Number(msg.chat.id);
  let lang = tgLang(msg.from?.language_code);
  const reply = (text: string, extra: Record<string, unknown> = {}) => tg('sendMessage', { chat_id: chatId, text, ...extra });
  const c = parseCommand(msg.text);
  if (c.cmd === 'start' && c.code) {
    const { data: row } = await admin.from('telegram_link_codes').select('user_id, expires_at').eq('code', c.code).maybeSingle();
    if (!row || new Date(row.expires_at) < new Date()) return reply(BOT_REPLIES[lang].badCode);
    await admin.from('telegram_links').upsert({ user_id: row.user_id, chat_id: chatId, username: msg.from?.username || null, linked_at: new Date().toISOString() });
    await admin.from('telegram_link_codes').delete().eq('user_id', row.user_id);
    lang = (await profiles([row.user_id])).get(row.user_id)!.lang;
    return reply(BOT_REPLIES[lang].linked + '\n\n' + QUICK_REPLIES[lang].linkedHint, { reply_markup: replyKeyboard(lang) });
  }
  if (c.cmd === 'stop') {
    await admin.from('telegram_links').delete().eq('chat_id', chatId);
    return reply(BOT_REPLIES[lang].stopped, { reply_markup: { remove_keyboard: true } });
  }

  const me = await linkedUser(chatId);
  if (!me) return reply(c.cmd === 'start' ? BOT_REPLIES[lang].noCode : BOT_REPLIES[lang].help);
  const { userId, p } = me;
  lang = p.lang;
  const R = QUICK_REPLIES[lang];
  const kb = { reply_markup: replyKeyboard(lang) };
  const today = localParts(new Date(), p.tz).date;

  const q = c.cmd === 'start' ? null : parseQuick(msg.text, msg.reply_to_message?.from?.is_bot ? msg.reply_to_message?.text : undefined);
  if (!q) return reply(R.help, kb);
  switch (q.kind) {
    case 'set': {
      const date = q.day === 'today' ? today : shiftDate(today, -1);
      const prev = await saveField(userId, date, q.field, q.value);
      return reply(R.saved(q.field, q.value, date, q.day === 'today', prev), kb);
    }
    case 'askSteps':
      return reply(R.askSteps, { reply_markup: { force_reply: true, input_field_placeholder: '9500' } });
    case 'askWellbeing':
      return reply(R.askWellbeing(today), { reply_markup: wellbeingKeyboard(today) });
    case 'week':
      return sendSummary(userId, chatId, p, today, 'last7');
    case 'bad':
      return reply(R[q.reason], kb);
  }
}

/** Нажатие кнопки самочувствия 1–10. */
async function onButton(cb: any) {
  const chatId = Number(cb?.message?.chat?.id);
  const done = (text?: string) => tg('answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text } : {}) });
  const me = chatId ? await linkedUser(chatId) : null;
  const b = parseCallback(cb?.data);
  if (!me || !b) return done();
  const R = QUICK_REPLIES[me.p.lang];
  const today = localParts(new Date(), me.p.tz).date;
  if (!callbackDateOk(b.date, today)) return done(R.old);
  const prev = await saveField(me.userId, b.date, b.field, b.value);
  const text = R.saved(b.field, b.value, b.date, b.date === today, prev);
  await tg('editMessageText', { chat_id: chatId, message_id: cb.message.message_id, text });
  return done();
}

// ---- вход пользователя ----

async function userOf(req: Request): Promise<string | null> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  return data?.user?.id || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  ensureCron().catch(() => {});

  // Telegram присылает обновления с секретом в заголовке
  const hook = req.headers.get('x-telegram-bot-api-secret-token');
  if (hook != null) {
    if (!BOT || hook !== (await webhookSecret(BOT))) return new Response('forbidden', { status: 403 });
    await onTelegram(await req.json().catch(() => null)).catch((e) => console.warn('telegram', e));
    return new Response('ok');
  }

  // Приложение: открытый ключ для подписки на пуши и есть ли бот
  if (req.method === 'GET') {
    const v = await vapid();
    return json(200, { vapidKey: v.publicKey, telegram: !!BOT });
  }
  if (req.method !== 'POST') return json(405, { error: 'method' });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'tick') {
    const s = await secret('cron');
    if (!s || req.headers.get('x-cron-secret') !== s) return json(403, { error: 'forbidden' });
    await ensureTelegram().catch(() => {});
    return json(200, await tick());
  }

  const userId = await userOf(req);
  if (!userId) return json(401, { error: 'auth' });

  if (action === 'tg-link') {
    if (!BOT) return json(503, { error: 'telegram-off' });
    await ensureTelegram();
    if (!botName) return json(503, { error: 'telegram-off' });
    const code = makeLinkCode();
    await admin.from('telegram_link_codes').delete().eq('user_id', userId);
    const { error } = await admin.from('telegram_link_codes').insert({ code, user_id: userId, expires_at: new Date(Date.now() + LINK_CODE_MIN * 60_000).toISOString() });
    if (error) return json(500, { error: 'db' });
    return json(200, { url: `https://t.me/${botName}?start=${code}` });
  }

  if (action === 'test') {
    const p = (await profiles([userId])).get(userId)!;
    const ch = (await channelsOf([userId])).get(userId);
    if (!ch) return json(200, { push: 0, telegram: false });
    return json(200, await deliver(userId, ch, message('test', p), p.lang));
  }

  return json(400, { error: 'action' });
});
