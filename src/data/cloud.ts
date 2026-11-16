// Облако (Supabase / PostgreSQL). Включается, если заданы EXPO_PUBLIC_SUPABASE_URL и
// EXPO_PUBLIC_SUPABASE_ANON_KEY. Без них приложение работает локально (данные в браузере).
// Схема и права доступа — supabase/migrations/0001_init.sql.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { ISODate } from '../core/dates';
import { AppError } from '../core/errors';
import type { DayEntry, DayMap, KeepMap, Profile } from '../core/types';

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
    async pushDays(changes) {
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

export async function addCuratorComment(clientId: string, date: ISODate, text: string) {
  const sb = supabase();
  if (!sb) throw new AppError('serverNotConnected');
  const { error } = await sb.from('day_comments').insert({ client_id: clientId, date, text });
  if (error) throw error;
}
