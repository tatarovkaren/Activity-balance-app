-- Уведомления (19.11.2026): веб-пуши в браузере и Telegram-бот.
-- Настройки (что и во сколько присылать, часовой пояс) лежат в профиле: profiles.data.notify.
-- Отправляет Edge Function «notify» (supabase/functions/notify), её каждые 5 минут вызывает pg_cron.

-- ---- Подписки браузеров на пуши ----
create table if not exists public.push_subscriptions (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own_read on public.push_subscriptions;
create policy push_own_read on public.push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_own_delete on public.push_subscriptions;
create policy push_own_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- Сохранить подписку этого браузера. Если раньше в нём входил другой пользователь — подписка переходит к текущему.
create or replace function public.save_push_subscription(sub_endpoint text, sub_p256dh text, sub_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'auth'; end if;
  if sub_endpoint !~ '^https://' or length(sub_endpoint) > 1000 then raise exception 'endpoint'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), sub_endpoint, sub_p256dh, sub_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end $$;

-- ---- Telegram ----
-- Привязка: приложение просит у функции ссылку t.me/<бот>?start=<код>, бот по коду записывает чат.
-- Писать сюда может только сервер; пользователь видит и удаляет свою строку.
create table if not exists public.telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null,
  username text,
  linked_at timestamptz not null default now()
);
alter table public.telegram_links enable row level security;
drop policy if exists tg_own_read on public.telegram_links;
create policy tg_own_read on public.telegram_links for select using (user_id = auth.uid());
drop policy if exists tg_own_delete on public.telegram_links;
create policy tg_own_delete on public.telegram_links for delete using (user_id = auth.uid());

create table if not exists public.telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.telegram_link_codes enable row level security;

-- ---- Журнал отправленного: одно напоминание не уходит дважды ----
create table if not exists public.notify_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  ref text not null,             -- вид + местная дата, например weigh:2026-11-19
  sent_at timestamptz not null default now(),
  primary key (user_id, ref)
);
alter table public.notify_log enable row level security;

-- Комментарий куратора: отметка, что клиенту уже сообщили.
alter table public.day_comments add column if not exists notified_at timestamptz;
create index if not exists day_comments_unnotified on public.day_comments (created_at) where notified_at is null;

-- ---- Секреты сервера: ключи VAPID (создаёт функция) и пароль для вызова по расписанию ----
create table if not exists public.notify_secrets (
  key text primary key,
  value text not null
);
alter table public.notify_secrets enable row level security;
insert into public.notify_secrets (key, value) values ('cron', encode(gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

-- Таблицы без правил доступа: читать и писать может только сервер (service_role).
revoke all on public.telegram_link_codes, public.notify_log, public.notify_secrets from anon, authenticated;

-- ---- Расписание: каждые 5 минут вызвать функцию notify ----
-- pg_cron и pg_net включаются здесь, если можно; если нет — включить в Database → Extensions.
do $$ begin create extension if not exists pg_cron; exception when others then raise notice 'pg_cron: %', sqlerrm; end $$;
do $$ begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pg_net: %', sqlerrm; end $$;

-- Функция сама вызывает это при первом запуске со своим адресом — вручную ничего вписывать не нужно.
create or replace function public.ensure_notify_cron(fn_url text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare cmd text;
begin
  if fn_url !~ '^https://[a-z0-9.-]+/functions/v1/notify$' then raise exception 'url'; end if;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') or not exists (select 1 from pg_extension where extname = 'pg_net') then
    return 'no-extensions';
  end if;
  cmd := format(
    $c$select net.http_post(url := %L, body := '{"action":"tick"}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.notify_secrets where key = 'cron')))$c$,
    fn_url);
  if exists (select 1 from cron.job where jobname = 'activity-balance-notify' and command = cmd) then return 'ok'; end if;
  perform cron.schedule('activity-balance-notify', '*/5 * * * *', cmd);
  return 'scheduled';
end $$;

revoke all on function public.save_push_subscription(text, text, text) from public;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
revoke all on function public.ensure_notify_cron(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.save_push_subscription(text, text, text) from anon';
    execute 'revoke execute on function public.ensure_notify_cron(text) from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.ensure_notify_cron(text) to service_role';
  end if;
end $$;
