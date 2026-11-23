// Облако (Supabase / PostgreSQL). Включается, если заданы EXPO_PUBLIC_SUPABASE_URL и
// EXPO_PUBLIC_SUPABASE_ANON_KEY. Без них приложение работает локально (данные в браузере).
// Схема и права доступа — supabase/migrations/0001_init.sql.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { ISODate } from '../core/dates';
import { AppError } from '../core/errors';
import { keepBotWrites } from '../core/merge';
import type { DayEntry, DayMap, KeepMap, PhotoMeal, Profile } from '../core/types';
import type { GoalProposal } from '../core/targets';
import { latinSurname, type CuratorPlan, type Referral, type ReferralOffer } from '../core/promo';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;
export function supabase(): SupabaseClient | null {
  if (!URL || !KEY) return null;
  if (!client) client = createClient(URL, KEY, { auth: { persistSession: true, detectSessionInUrl: Platform.OS === 'web' } });
  return client;
}

export const cloudConfigured = () => !!(URL && KEY);

export type OAuthProvider = 'google' | 'apple' | 'yandex' | 'vk';

/** Поддержано Supabase из коробки: Google, Apple. Яндекс ID и VK ID — через свой OIDC-шлюз (этап 2). */
export const NATIVE_OAUTH: OAuthProvider[] = ['google', 'apple'];

export async function signInOAuth(p: OAuthProvider) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  if (!NATIVE_OAUTH.includes(p)) throw new AppError('gatewayMissing');
  const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin + window.location.pathname : undefined;
  const { error } = await sb.auth.signInWithOAuth({ provider: p as 'google' | 'apple', options: { redirectTo } });
  if (error) throw error;
}

export async function sendEmailCode(email: string) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyEmailCode(email: string, token: string) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function currentUser(): Promise<{ id: string; email?: string } | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null;
}

export async function signOut() {
  await supabase()?.auth.signOut();
}

// ---- Репозиторий данных пользователя ----

export interface CloudSnapshot {
  profile?: Profile;
  keep?: KeepMap;
  days: DayMap;
}

export interface CloudRepo {
  pull(): Promise<CloudSnapshot>;
  pushDays(days: Record<ISODate, DayEntry | null>): Promise<void>;
  pushProfile(p: Profile, keep: KeepMap): Promise<void>;
}

export function supabaseRepo(userId: string): CloudRepo {
  const sb = supabase()!;
  return {
    async pull() {
      const [prof, days] = await Promise.all([
        sb.from('profiles').select('data, anomaly_keep').eq('id', userId).maybeSingle(),
        sb.from('day_entries').select('date, data').eq('user_id', userId),
      ]);
      if (prof.error) throw prof.error;
      if (days.error) throw days.error;
      const map: DayMap = {};
      for (const r of days.data || []) map[r.date as string] = r.data as DayEntry;
      return { profile: (prof.data?.data as Profile) || undefined, keep: (prof.data?.anomaly_keep as KeepMap) || undefined, days: map };
    },
    async pushDays(input) {
      // записанное Telegram-ботом, пока это устройство было открыто, не затираем старой копией дня
      const changes = { ...input };
      const dates = Object.keys(changes);
      for (let i = 0; i < dates.length; i += 200) {
        const { data: srv, error } = await sb.from('day_entries').select('date, data').eq('user_id', userId).in('date', dates.slice(i, i + 200));
        if (error) throw error;
        for (const r of srv || []) changes[r.date as string] = keepBotWrites(changes[r.date as string], r.data as DayEntry);
      }
      const up = Object.entries(changes)
        .filter(([, e]) => e)
        .map(([date, e]) => ({ user_id: userId, date, data: e }));
      const del = Object.entries(changes)
        .filter(([, e]) => !e)
        .map(([d]) => d);
      if (up.length) {
        const { error } = await sb.from('day_entries').upsert(up, { onConflict: 'user_id,date' });
        if (error) throw error;
      }
      if (del.length) {
        const { error } = await sb.from('day_entries').delete().eq('user_id', userId).in('date', del);
        if (error) throw error;
      }
    },
    async pushProfile(p, keep) {
      const { error } = await sb.from('profiles').upsert({ id: userId, data: p, anomaly_keep: keep, sex: p.sex });
      if (error) throw error;
    },
  };
}

// ---- Кабинет куратора (облако) ----

export interface CuratorClientRow {
  client_id: string;
  name: string;
  profile: Profile;
  days: DayMap;
}

export async function curatorClients(sinceISO: ISODate): Promise<CuratorClientRow[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('curator_clients_snapshot', { since: sinceISO });
  if (error) throw error;
  return (data || []) as CuratorClientRow[];
}

export async function linkCurator(code: string): Promise<string> {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { data, error } = await sb.rpc('link_curator_by_code', { invite_code: code.trim().toUpperCase() });
  if (error) throw error;
  return data as string;
}

// ---- Промокоды кураторов (миграция 0004) ----

export interface CloudCuratorAccount {
  display_name: string;
  surname: string;
  invite_code: string;
  plan: CuratorPlan;
}

/** Кабинет куратора текущего пользователя или null, если код ещё не создан. */
export async function myCuratorAccount(): Promise<CloudCuratorAccount | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('my_curator_account');
  if (error) throw error;
  const rows = (data || []) as CloudCuratorAccount[];
  return rows[0] || null;
}

/** Создать код куратора: фамилия латиницей + сквозной номер из последовательности на сервере. */
export async function createCuratorCode(displayName: string, surname: string): Promise<string> {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { data, error } = await sb.rpc('create_curator_code', { display_name: displayName, surname_latin: latinSurname(surname) });
  if (error) throw error;
  return data as string;
}

/** Кто пришёл по коду: на ведении, завершили, отвязаны; оплатили ли Премиум со скидкой. */
export async function curatorReferrals(): Promise<Referral[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('curator_referrals');
  if (error) throw error;
  return ((data || []) as { client_id: string; name: string; linked_at: string; status: string; ended_at: string | null; paid_at: string | null }[]).map((r) => ({
    id: r.client_id,
    name: r.name,
    linkedAt: r.linked_at.slice(0, 10),
    status: r.status === 'active' ? 'active' : r.status === 'ended' ? 'ended' : 'removed',
    endedAt: r.ended_at?.slice(0, 10),
    paidAt: r.paid_at?.slice(0, 10),
  }));
}

/** Куратор завершает ведение (клиенту — предложение со скидкой) или отвязывает клиента. */
export async function endCuratorLink(clientId: string, how: 'ended' | 'removed') {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.rpc('curator_end_link', { client: clientId, how });
  if (error) throw error;
}

/** Клиент сам отключает куратора: ведение закончено, сервер создаёт предложение со скидкой. */
export async function clientEndLink() {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.rpc('client_end_link');
  if (error) throw error;
}

/** Открытое предложение Премиума со скидкой после ведения. */
export async function myReferralOffer(): Promise<ReferralOffer | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('my_referral_offer');
  if (error) throw error;
  const r = ((data || []) as { curator_name: string; invite_code: string; discount_pct: number; months: number; valid_until: string }[])[0];
  return r ? { curatorName: r.curator_name, code: r.invite_code, discountPct: r.discount_pct, months: r.months, until: r.valid_until.slice(0, 10) } : null;
}

export async function addCuratorComment(clientId: string, date: ISODate, text: string) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.from('day_comments').insert({ client_id: clientId, date, text });
  if (error) throw error;
}

// ---- Предложения куратора по режиму цели (миграция 0003) ----

/** Куратор предлагает клиенту новый режим цели; применяется только после подтверждения клиента. */
export async function proposeGoal(clientId: string, setting: GoalProposal['setting'], note?: string) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.from('goal_proposals').insert({ client_id: clientId, setting, note: note || null });
  if (error) throw error;
}

/** Ждущие ответа предложения для текущего пользователя (с именем куратора). */
export async function myGoalProposals(): Promise<GoalProposal[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('my_goal_proposals');
  if (error) throw error;
  return ((data || []) as { id: number; curator_name: string; created_at: string; setting: GoalProposal['setting']; note: string | null }[]).map((r) => ({
    id: String(r.id),
    curatorName: r.curator_name,
    createdAt: r.created_at.slice(0, 10),
    setting: r.setting,
    note: r.note || undefined,
  }));
}

export async function respondGoalProposal(id: string, accept: boolean) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb
    .from('goal_proposals')
    .update({ status: accept ? 'accepted' : 'declined', responded_at: new Date().toISOString() })
    .eq('id', Number(id));
  if (error) throw error;
}

/** Виды согласий в таблице consents (миграция 0002). */
export type ConsentKind = 'terms' | 'privacy' | 'health' | 'marketing' | 'photo_ai';

/**
 * Журнал согласий на сервере: для каждого данного согласия — строка с датой и версией документов,
 * снятое (рассылки) — отметка revoked_at. Повторный вызов с теми же данными ничего не добавляет.
 */
export async function recordConsents(given: Partial<Record<ConsentKind, string>>, version: string) {
  const sb = supabase();
  if (!sb) return;
  const { data, error } = await sb.from('consents').select('id, kind, doc_version').is('revoked_at', null);
  if (error) throw error;
  const active = (data || []) as { id: number; kind: ConsentKind; doc_version: string | null }[];
  const add = (Object.keys(given) as ConsentKind[])
    .filter((k) => given[k] && !active.some((a) => a.kind === k && (a.doc_version === version || k === 'photo_ai')))
    .map((k) => ({ kind: k, doc_version: version, given_at: given[k] }));
  if (add.length) {
    const r = await sb.from('consents').insert(add);
    if (r.error) throw r.error;
  }
  const revoke = active.filter((a) => a.kind === 'marketing' && !given.marketing).map((a) => a.id);
  if (revoke.length) {
    const r = await sb.from('consents').update({ revoked_at: new Date().toISOString() }).in('id', revoke);
    if (r.error) throw r.error;
  }
}

// ---- Подсчёт по фото ----

/** Адрес серверной оценки: свой EXPO_PUBLIC_PHOTO_ENDPOINT или функция photo-estimate в Supabase. */
export function photoEndpoint(): string | undefined {
  const own = process.env.EXPO_PUBLIC_PHOTO_ENDPOINT;
  if (own) return own;
  return URL && KEY ? URL.replace(/\/$/, '') + '/functions/v1/photo-estimate' : undefined;
}

/** Токен пользователя для сервера оценки (ключ модели живёт только на сервере). */
export async function accessToken(): Promise<string | undefined> {
  const { data } = (await supabase()?.auth.getSession()) || { data: { session: null } };
  return data.session?.access_token;
}

/**
 * Подтверждённый приём по фото — в photo_estimates (без снимков): продукты, итоговые граммы и граммы ИИ до правки.
 * По этой таблице сервер потом считает поправку оценки для пользователя.
 */
export async function savePhotoEstimate(date: ISODate, meal: PhotoMeal) {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.from('photo_estimates').insert({ date, provider: meal.provider, draft: meal });
  if (error) throw error;
}

// ---- Пилот: связь, доступ и комментарии на сервере (миграция 0006) ----

export interface CloudCuratorLink {
  name: string;
  code: string;
  linkedAt: ISODate;
  share: { food: boolean; workouts: boolean; measurements: boolean; comments: boolean; photos: boolean };
}

/** Активный куратор текущего клиента по данным сервера; null — связи нет (или куратор её завершил). */
export async function myCuratorLink(): Promise<CloudCuratorLink | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('my_curator_link');
  if (error) throw error;
  const r = ((data || []) as { curator_name: string; invite_code: string; linked_at: string; share: CloudCuratorLink['share'] }[])[0];
  return r ? { name: r.curator_name, code: r.invite_code, linkedAt: r.linked_at.slice(0, 10), share: r.share } : null;
}

/** Клиент меняет, что видит куратор. */
export async function setCuratorShare(share: CloudCuratorLink['share']) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.rpc('set_curator_share', { new_share: share });
  if (error) throw error;
}

export interface DayComment {
  id: string;
  date: ISODate;
  text: string;
  /** Имя куратора (для клиента); у куратора не заполнено. */
  curatorName?: string;
  createdAt: string;
}

/** Клиенту: комментарии куратора к дням начиная с since. */
export async function myDayComments(since: ISODate): Promise<DayComment[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb.rpc('my_day_comments', { since });
  if (error) throw error;
  return ((data || []) as { id: number; date: string; text: string; curator_name: string; created_at: string }[]).map((r) => ({
    id: String(r.id),
    date: r.date,
    text: r.text,
    curatorName: r.curator_name,
    createdAt: r.created_at,
  }));
}

/** Куратору: свои комментарии клиенту начиная с since. */
export async function curatorCommentsFor(clientId: string, since: ISODate): Promise<DayComment[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('day_comments')
    .select('id, date, text, created_at')
    .eq('client_id', clientId)
    .gte('date', since)
    .order('created_at');
  if (error) throw error;
  return ((data || []) as { id: number; date: string; text: string; created_at: string }[]).map((r) => ({
    id: String(r.id),
    date: r.date,
    text: r.text,
    createdAt: r.created_at,
  }));
}

// ---- Уведомления: веб-пуши и Telegram (миграция 0007, функция notify) ----

/** Адрес функции уведомлений или undefined без сервера. */
export function notifyEndpoint(): string | undefined {
  return URL && KEY ? URL.replace(/\/$/, '') + '/functions/v1/notify' : undefined;
}

export interface NotifyServerInfo {
  vapidKey: string;
  telegram: boolean;
}

/** Развёрнута ли функция уведомлений и подключён ли бот. null — функции нет (ещё не развёрнута). */
export async function notifyInfo(): Promise<NotifyServerInfo | null> {
  const url = notifyEndpoint();
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { apikey: KEY! } });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<NotifyServerInfo>;
    return typeof j.vapidKey === 'string' ? { vapidKey: j.vapidKey, telegram: !!j.telegram } : null;
  } catch {
    return null;
  }
}

async function notifyCall<T>(action: string): Promise<T> {
  const url = notifyEndpoint();
  const token = await accessToken();
  if (!url || !token) throw new AppError('serverNotConnected');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: KEY! },
    body: JSON.stringify({ action }),
  });
  if (!r.ok) throw new AppError(r.status === 503 ? 'telegramOff' : 'notifyServer');
  return (await r.json()) as T;
}

/** Ссылка t.me/<бот>?start=<код> для привязки Telegram (код годен 30 минут). */
export const telegramLinkUrl = () => notifyCall<{ url: string }>('tg-link').then((r) => r.url);

/** Тестовое уведомление на все подключённые каналы. */
export const sendTestNotification = () => notifyCall<{ push: number; telegram: boolean }>('test');

/** Привязан ли Telegram у текущего пользователя (видна только своя строка). */
export async function telegramStatus(): Promise<{ username?: string } | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data, error } = await sb.from('telegram_links').select('username').maybeSingle();
  if (error) throw error;
  return data ? { username: (data.username as string) || undefined } : null;
}

export async function telegramUnlink() {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { data: u } = await sb.auth.getUser();
  const { error } = await sb.from('telegram_links').delete().eq('user_id', u.user?.id || '');
  if (error) throw error;
}

export async function savePushSubscription(s: { endpoint: string; p256dh: string; auth: string }) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.rpc('save_push_subscription', { sub_endpoint: s.endpoint, sub_p256dh: s.p256dh, sub_auth: s.auth });
  if (error) throw error;
}

export async function deletePushSubscription(endpoint: string) {
  const sb = supabase();
  if (!sb) return;
  const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}
