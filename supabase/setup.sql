-- Activity Balance: вся схема базы одним файлом. Собрано командой `npm run db:setup` из supabase/migrations.
-- Выполняется один раз в новом проекте Supabase: SQL Editor → New query → вставить всё → Run.
-- Не править руками: меняйте миграции и пересоберите.

-- ======== 0001_init.sql ========

-- Activity Balance: схема базы (PostgreSQL / Supabase). Данные о здоровье — особая категория:
-- доступ только через правила на уровне строк (RLS). Каждый видит только своё;
-- куратор видит клиента, только пока клиент держит связь активной, и только разрешённые поля.

create extension if not exists pgcrypto;

-- Профиль пользователя (пол, рост, цель, настройки) и дни, возвращённые в расчёт вручную.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  anomaly_keep jsonb not null default '{}'::jsonb,
  sex text check (sex in ('male','female')),
  market text not null default 'ru' check (market in ('ru','eu','intl')), -- контур данных
  updated_at timestamptz not null default now()
);

-- Запись дня: вес, шаги, КБЖУ, тренировка, замеры, комментарий, отметка «необычный день».
-- jsonb, чтобы пустое поле = «нет данных», а не 0.
create table public.day_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);
create index day_entries_user_date on public.day_entries (user_id, date desc);

-- Согласия (152-ФЗ, GDPR): здоровье, фото для ИИ, показ фото куратору.
create table public.consents (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('health','photo_ai','photo_to_curator')),
  given_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Куратор и код приглашения.
create table public.curators (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  invite_code text not null unique,
  plan text not null default 'start' check (plan in ('start','pro')),
  max_clients int not null default 10
);

-- Связь куратор — клиент. Клиент сам решает, что видит куратор.
create table public.curator_links (
  curator_id uuid not null references public.curators(id) on delete cascade,
  client_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  share jsonb not null default '{"food":true,"workouts":true,"measurements":true,"comments":true,"photos":false}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (curator_id, client_id)
);

-- Комментарии куратора к дню клиента.
create table public.day_comments (
  id bigserial primary key,
  client_id uuid not null references auth.users(id) on delete cascade,
  curator_id uuid not null default auth.uid() references public.curators(id) on delete cascade,
  date date not null,
  text text not null check (length(text) between 1 and 2000),
  created_at timestamptz not null default now()
);

-- Подтверждённые оценки по фото (без самих снимков: снимки удаляются после подтверждения).
create table public.photo_estimates (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null,
  provider text not null,          -- id провайдера, не модель: модель выбирает сервер
  draft jsonb not null,            -- компоненты, граммы, ккал, диапазон
  real_grams numeric,              -- если взвесили — для ошибки в %
  created_at timestamptz not null default now()
);

-- Учёт автоматических оценок для лимитов тарифа.
create table public.photo_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  used_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.day_entries enable row level security;
alter table public.consents enable row level security;
alter table public.curators enable row level security;
alter table public.curator_links enable row level security;
alter table public.day_comments enable row level security;
alter table public.photo_estimates enable row level security;
alter table public.photo_usage enable row level security;

create policy own_profile on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy own_days on public.day_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_consents on public.consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_estimates on public.photo_estimates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_usage_read on public.photo_usage for select using (user_id = auth.uid());
-- photo_usage пишет только сервер оценки (service role), чтобы лимит нельзя было обойти.

create policy curator_self on public.curators for all using (id = auth.uid()) with check (id = auth.uid());
create policy link_parties on public.curator_links for select using (client_id = auth.uid() or curator_id = auth.uid());
-- клиент может отозвать доступ и менять, что видно куратору
create policy link_client_update on public.curator_links for update using (client_id = auth.uid()) with check (client_id = auth.uid());
create policy link_client_delete on public.curator_links for delete using (client_id = auth.uid());

create policy comments_read on public.day_comments for select using (client_id = auth.uid() or curator_id = auth.uid());
create policy comments_write on public.day_comments for insert with check (
  curator_id = auth.uid() and exists (
    select 1 from public.curator_links l
    where l.curator_id = auth.uid() and l.client_id = day_comments.client_id and l.status = 'active'
  )
);

-- Клиент подключает куратора по коду. Возвращает имя куратора.
create or replace function public.link_curator_by_code(invite_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.curators;
declare n int;
begin
  select * into c from public.curators where curators.invite_code = link_curator_by_code.invite_code;
  if c.id is null then raise exception 'Код не найден'; end if;
  select count(*) into n from public.curator_links where curator_id = c.id and status = 'active';
  if n >= c.max_clients then raise exception 'У куратора заполнен тариф'; end if;
  insert into public.curator_links (curator_id, client_id) values (c.id, auth.uid())
    on conflict (curator_id, client_id) do update set status = 'active';
  insert into public.consents (user_id, kind) values (auth.uid(), 'health');
  return c.name;
end $$;

-- Снимок данных клиентов для кабинета куратора: только активные связи и только разрешённые поля.
create or replace function public.curator_clients_snapshot(since date)
returns table (client_id uuid, name text, profile jsonb, days jsonb)
language sql security definer set search_path = public stable as $$
  select l.client_id,
         coalesce(p.data->>'name', 'Клиент') as name,
         p.data as profile,
         coalesce((
           select jsonb_object_agg(d.date::text,
             (d.data
               - case when (l.share->>'food')::boolean then '{}'::text[] else array['kcal','protein','fat','carbs','kcalManual'] end
               - case when (l.share->>'workouts')::boolean then '{}'::text[] else array['steps','workoutType','workoutMin','hrAvg','hrMax','workoutSteps'] end
               - case when (l.share->>'measurements')::boolean then '{}'::text[] else array['weight','neck','waist','hips'] end
               - case when (l.share->>'comments')::boolean then '{}'::text[] else array['comment','wellbeing'] end))
           from public.day_entries d
           where d.user_id = l.client_id and d.date >= since
         ), '{}'::jsonb) as days
  from public.curator_links l
  join public.profiles p on p.id = l.client_id
  where l.curator_id = auth.uid() and l.status = 'active';
$$;

revoke all on function public.curator_clients_snapshot(date) from public;
grant execute on function public.curator_clients_snapshot(date) to authenticated;
grant execute on function public.link_curator_by_code(text) to authenticated;

-- ======== 0002_legal_consents.sql ========

-- Галочки на экране входа: условия, политика, согласие на обработку ПДн (включая здоровье), рассылки.
-- В журнал согласий добавляются новые виды и версия документов, которую принял пользователь.

alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('health','photo_ai','photo_to_curator','terms','privacy','marketing'));

alter table public.consents add column if not exists doc_version text;
alter table public.consents alter column user_id set default auth.uid();

-- снять согласие (рассылки) может сам пользователь; политика own_consents из 0001 это уже разрешает
create index if not exists consents_user_kind on public.consents (user_id, kind) where revoked_at is null;

-- ======== 0003_goal_proposals.sql ========

-- Режим и цели по калориям и БЖУ (ТЗ v36, раздел 8).
-- Сам режим и его история хранятся в профиле клиента (profiles.data → goals), куратор видит их
-- через curator_clients_snapshot. Изменить режим куратор не может — только предложить:
-- предложение применяется на устройстве клиента после его подтверждения.

create table public.goal_proposals (
  id bigserial primary key,
  client_id uuid not null references auth.users(id) on delete cascade,
  curator_id uuid not null default auth.uid() references public.curators(id) on delete cascade,
  setting jsonb not null,          -- { mode, pacePct?, targetDate?, proteinPerLean? }
  note text check (note is null or length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create index goal_proposals_client on public.goal_proposals (client_id, status);

alter table public.goal_proposals enable row level security;

create policy goal_proposals_read on public.goal_proposals for select
  using (client_id = auth.uid() or curator_id = auth.uid());

-- предложить может только куратор с активной связью
create policy goal_proposals_write on public.goal_proposals for insert with check (
  curator_id = auth.uid() and status = 'pending' and exists (
    select 1 from public.curator_links l
    where l.curator_id = auth.uid() and l.client_id = goal_proposals.client_id and l.status = 'active'
  )
);

-- ответить (принять / отклонить) может только клиент
create policy goal_proposals_answer on public.goal_proposals for update
  using (client_id = auth.uid() and status = 'pending')
  with check (client_id = auth.uid() and status in ('accepted','declined'));

-- Ждущие предложения текущего пользователя с именем куратора (таблица curators клиенту не видна).
create or replace function public.my_goal_proposals()
returns table (id bigint, curator_name text, created_at timestamptz, setting jsonb, note text)
language sql security definer set search_path = public stable as $$
  select g.id, c.name, g.created_at, g.setting, g.note
  from public.goal_proposals g
  join public.curators c on c.id = g.curator_id
  join public.curator_links l on l.curator_id = g.curator_id and l.client_id = g.client_id and l.status = 'active'
  where g.client_id = auth.uid() and g.status = 'pending'
  order by g.created_at;
$$;

revoke all on function public.my_goal_proposals() from public;
grant execute on function public.my_goal_proposals() to authenticated;

-- ======== 0004_curator_promo_codes.sql ========

-- Промокоды кураторов (схема от 18.11.2026).
-- Код = фамилия куратора латиницей + сквозной номер по всей системе (последовательность): IVANOV0001.
-- Клиент вводит код → связь «на ведении», Премиум бесплатно, место в тарифе куратора занято.
-- Код не работает, если свободных мест нет. Куратор видит, кто пришёл по коду, и может отвязать.
-- Ведение закончилось → клиенту предложение Премиума −30 % на 3 месяца (действует 30 дней),
-- куратору — месяц тарифа за каждые 3 оплаты. Скидка и бонус — гипотезы; оплата пока не подключена,
-- поле paid_at заполнит обработчик платежей.

-- ---- Тарифы: пробный (2 места), «Старт» (10), «Про» (50) ----
alter table public.curators drop constraint if exists curators_plan_check;
alter table public.curators add constraint curators_plan_check check (plan in ('trial','start','pro'));
alter table public.curators add column if not exists surname text;
alter table public.curators add column if not exists code_no bigint;
alter table public.curators add column if not exists created_at timestamptz not null default now();

create sequence if not exists public.curator_code_seq start 1;

create or replace function public.curator_seats(plan text) returns int
language sql immutable as $$
  select case plan when 'trial' then 2 when 'pro' then 50 else 10 end;
$$;

-- ---- Связи: как пришёл клиент и чем закончилось ведение ----
alter table public.curator_links drop constraint if exists curator_links_status_check;
alter table public.curator_links add constraint curator_links_status_check
  check (status in ('active','revoked','ended','removed'));
alter table public.curator_links add column if not exists via text not null default 'code' check (via in ('code','manual'));
alter table public.curator_links add column if not exists ended_at timestamptz;

-- ---- Предложение со скидкой после ведения ----
create table if not exists public.referral_offers (
  id bigserial primary key,
  client_id uuid not null references auth.users(id) on delete cascade,
  curator_id uuid not null references public.curators(id) on delete cascade,
  discount_pct int not null default 30 check (discount_pct between 0 and 100),
  months int not null default 3 check (months between 1 and 24),
  created_at timestamptz not null default now(),
  valid_until date not null default (current_date + 30),
  paid_at timestamptz
);
create index if not exists referral_offers_client on public.referral_offers (client_id);
create index if not exists referral_offers_curator on public.referral_offers (curator_id) where paid_at is not null;

alter table public.referral_offers enable row level security;
-- читают обе стороны; пишут только функции ниже и обработчик платежей (service role)
create policy referral_offers_read on public.referral_offers for select
  using (client_id = auth.uid() or curator_id = auth.uid());

-- ---- Куратор: создать код ----
create or replace function public.create_curator_code(display_name text, surname_latin text) returns text
language plpgsql security definer set search_path = public as $$
declare s text := upper(regexp_replace(coalesce(surname_latin, ''), '[^A-Za-z]', '', 'g'));
declare n bigint;
declare code text;
declare existing text;
begin
  select invite_code into existing from public.curators where id = auth.uid();
  if existing is not null then return existing; end if; -- код постоянный, второй не выдаём
  s := left(s, 12);
  if length(s) < 2 then raise exception 'bad_format'; end if;
  n := nextval('public.curator_code_seq');
  code := s || lpad(n::text, 4, '0');
  insert into public.curators (id, name, invite_code, plan, max_clients, surname, code_no)
    values (auth.uid(), coalesce(nullif(trim(display_name), ''), initcap(s)), code, 'start', 10, s, n);
  return code;
end $$;

create or replace function public.my_curator_account()
returns table (display_name text, surname text, invite_code text, plan text)
language sql security definer set search_path = public stable as $$
  select c.name, c.surname, c.invite_code, c.plan from public.curators c where c.id = auth.uid();
$$;

-- ---- Клиент: привязка по коду (заменяет версию из 0001) ----
create or replace function public.link_curator_by_code(invite_code text) returns text
language plpgsql security definer set search_path = public as $$
declare c public.curators;
declare n int;
declare code text := upper(regexp_replace(coalesce(invite_code, ''), '[\s-]', '', 'g'));
begin
  if code !~ '^[A-Z]{2,12}[0-9]{4,7}$' then raise exception 'bad_format'; end if;
  select * into c from public.curators where curators.invite_code = code;
  if c.id is null then raise exception 'not_found'; end if;
  if c.id = auth.uid() then raise exception 'not_found'; end if; -- свой код не подходит
  select count(*) into n from public.curator_links where curator_id = c.id and status = 'active' and client_id <> auth.uid();
  if n >= public.curator_seats(c.plan) then raise exception 'no_seats'; end if;
  insert into public.curator_links (curator_id, client_id, via) values (c.id, auth.uid(), 'code')
    on conflict (curator_id, client_id) do update set status = 'active', via = 'code', ended_at = null, created_at = now();
  insert into public.consents (user_id, kind) values (auth.uid(), 'health');
  return c.name;
end $$;

-- ---- Конец ведения: куратор завершает / отвязывает, или клиент отключает сам ----
create or replace function public.end_link(cur uuid, cli uuid, how text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.curator_links set status = how, ended_at = now()
    where curator_id = cur and client_id = cli and status = 'active';
  if found and how = 'ended' then
    insert into public.referral_offers (client_id, curator_id) values (cli, cur);
  end if;
end $$;
revoke all on function public.end_link(uuid, uuid, text) from public;

create or replace function public.curator_end_link(client uuid, how text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if how not in ('ended','removed') then raise exception 'bad_status'; end if;
  perform public.end_link(auth.uid(), client, how);
end $$;

create or replace function public.client_end_link() returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in select curator_id from public.curator_links where client_id = auth.uid() and status = 'active' loop
    perform public.end_link(l.curator_id, auth.uid(), 'ended');
  end loop;
end $$;

-- ---- Кабинет: кто пришёл по коду ----
create or replace function public.curator_referrals()
returns table (client_id uuid, name text, linked_at timestamptz, status text, ended_at timestamptz, paid_at timestamptz)
language sql security definer set search_path = public stable as $$
  select l.client_id,
         coalesce(p.data->>'name', 'Клиент'),
         l.created_at,
         l.status,
         l.ended_at,
         (select max(o.paid_at) from public.referral_offers o where o.client_id = l.client_id and o.curator_id = l.curator_id)
  from public.curator_links l
  left join public.profiles p on p.id = l.client_id
  where l.curator_id = auth.uid() and l.via = 'code'
  order by l.created_at;
$$;

-- ---- Клиент: открытое предложение со скидкой ----
create or replace function public.my_referral_offer()
returns table (curator_name text, invite_code text, discount_pct int, months int, valid_until date)
language sql security definer set search_path = public stable as $$
  select c.name, c.invite_code, o.discount_pct, o.months, o.valid_until
  from public.referral_offers o
  join public.curators c on c.id = o.curator_id
  where o.client_id = auth.uid() and o.paid_at is null and o.valid_until >= current_date
  order by o.created_at desc
  limit 1;
$$;

revoke all on function public.create_curator_code(text, text) from public;
revoke all on function public.my_curator_account() from public;
revoke all on function public.curator_end_link(uuid, text) from public;
revoke all on function public.client_end_link() from public;
revoke all on function public.curator_referrals() from public;
revoke all on function public.my_referral_offer() from public;
grant execute on function public.create_curator_code(text, text) to authenticated;
grant execute on function public.my_curator_account() to authenticated;
grant execute on function public.curator_end_link(uuid, text) to authenticated;
grant execute on function public.client_end_link() to authenticated;
grant execute on function public.curator_referrals() to authenticated;
grant execute on function public.my_referral_offer() to authenticated;
grant execute on function public.link_curator_by_code(text) to authenticated;

-- Тариф куратора меняет только обработчик платежей; max_clients оставлен для совместимости.
update public.curators set max_clients = public.curator_seats(plan);

-- Куратор больше не правит свою строку напрямую (иначе мог бы сам поднять тариф и число мест):
-- код создаёт create_curator_code, тариф — обработчик платежей.
drop policy if exists curator_self on public.curators;
create policy curator_self_read on public.curators for select using (id = auth.uid());

-- ======== 0005_photo_meals.sql ========

-- Подсчёт по фото: тариф для лимитов и правки граммов для калибровки.
--
-- Тариф берётся из subscriptions, а не из profiles.data: профиль пользователь правит сам (RLS own_profile),
-- поэтому лимит по нему можно обойти. subscriptions пишет только сервер биллинга (service role).
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','basic','premium')),
  until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy own_subscription_read on public.subscriptions for select using (user_id = auth.uid());

-- Быстрый подсчёт оценок за последние 24 часа.
create index if not exists photo_usage_user_time on public.photo_usage (user_id, used_at desc);

-- photo_estimates.draft хранит подтверждённый приём (PhotoMeal): продукты, итоговые граммы
-- и граммы оценки ИИ до правки (items[].estGrams). По ним считается личная поправка оценки.
create index if not exists photo_estimates_user_date on public.photo_estimates (user_id, date desc);

-- Ошибки правок по продуктам: (оценка − итог) / итог, %. Для калибровки модели и личной поправки.
create or replace view public.photo_edit_errors with (security_invoker = true) as
select e.user_id, e.date, e.provider,
       it->>'name' as name, it->>'foodId' as food_id,
       (it->>'estGrams')::numeric as est_grams, (it->>'grams')::numeric as grams,
       round(((it->>'estGrams')::numeric - (it->>'grams')::numeric) / nullif((it->>'grams')::numeric, 0) * 100, 1) as error_pct
from public.photo_estimates e, jsonb_array_elements(e.draft->'items') it
where it ? 'estGrams';

-- ======== 0006_pilot_sync.sql ========

-- Пилот с куратором (19.11.2026): клиент и куратор на разных телефонах.
-- 1) Связь с куратором восстанавливается с сервера (новый телефон, другой браузер, куратор отвязал).
-- 2) «Что видит куратор» клиент меняет через функцию: напрямую строку связи править нельзя,
--    иначе клиент мог бы сам вернуть связь, которую куратор завершил, и занять место сверх тарифа.
-- 3) Комментарии куратора видны клиенту на «Дне», а куратору — после перезагрузки кабинета.
-- 4) Куратору не уходят приёмы по фото, если клиент закрыл питание; клиент без профиля тоже виден.

-- ---- 1. Активная связь текущего клиента ----
create or replace function public.my_curator_link()
returns table (curator_name text, invite_code text, linked_at timestamptz, share jsonb)
language sql security definer set search_path = public stable as $$
  select c.name, c.invite_code, l.created_at, l.share
  from public.curator_links l
  join public.curators c on c.id = l.curator_id
  where l.client_id = auth.uid() and l.status = 'active'
  order by l.created_at desc
  limit 1;
$$;

-- ---- 2. Что видит куратор ----
drop policy if exists link_client_update on public.curator_links;
drop policy if exists link_client_delete on public.curator_links;

create or replace function public.set_curator_share(new_share jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare s jsonb := '{}'::jsonb;
declare k text;
begin
  foreach k in array array['food','workouts','measurements','comments','photos'] loop
    s := s || jsonb_build_object(k, coalesce((new_share->>k)::boolean, false));
  end loop;
  update public.curator_links set share = s where client_id = auth.uid() and status = 'active';
end $$;

-- ---- 3. Комментарии куратора ----
create index if not exists day_comments_client_date on public.day_comments (client_id, date desc);

-- Клиенту: комментарии к дням с даты since, с именем куратора (таблица curators клиенту не видна).
create or replace function public.my_day_comments(since date)
returns table (id bigint, date date, text text, curator_name text, created_at timestamptz)
language sql security definer set search_path = public stable as $$
  select m.id, m.date, m.text, c.name, m.created_at
  from public.day_comments m
  join public.curators c on c.id = m.curator_id
  where m.client_id = auth.uid() and m.date >= since
  order by m.date, m.created_at;
$$;

-- ---- 4. Снимок для кабинета куратора (заменяет версию из 0001) ----
create or replace function public.curator_clients_snapshot(since date)
returns table (client_id uuid, name text, profile jsonb, days jsonb)
language sql security definer set search_path = public stable as $$
  select l.client_id,
         coalesce(nullif(trim(p.data->>'name'), ''), 'Клиент') as name,
         coalesce(p.data, '{}'::jsonb) as profile,
         coalesce((
           select jsonb_object_agg(d.date::text,
             (d.data
               - case when coalesce((l.share->>'food')::boolean, false) then '{}'::text[] else array['kcal','protein','fat','carbs','kcalManual','photoMeals'] end
               - case when coalesce((l.share->>'workouts')::boolean, false) then '{}'::text[] else array['steps','workoutType','workoutKind','workoutMin','hrAvg','hrMax','workoutSteps'] end
               - case when coalesce((l.share->>'measurements')::boolean, false) then '{}'::text[] else array['weight','neck','waist','hips'] end
               - case when coalesce((l.share->>'comments')::boolean, false) then '{}'::text[] else array['comment','wellbeing'] end))
           from public.day_entries d
           where d.user_id = l.client_id and d.date >= since
         ), '{}'::jsonb) as days
  from public.curator_links l
  left join public.profiles p on p.id = l.client_id
  where l.curator_id = auth.uid() and l.status = 'active';
$$;

revoke all on function public.my_curator_link() from public;
revoke all on function public.set_curator_share(jsonb) from public;
revoke all on function public.my_day_comments(date) from public;
revoke all on function public.curator_clients_snapshot(date) from public;
grant execute on function public.my_curator_link() to authenticated;
grant execute on function public.set_curator_share(jsonb) to authenticated;
grant execute on function public.my_day_comments(date) to authenticated;
grant execute on function public.curator_clients_snapshot(date) to authenticated;

-- В Supabase функции по умолчанию доступны и роли anon (без входа). Все функции приложения — только после входа.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'link_curator_by_code','curator_clients_snapshot','create_curator_code','my_curator_account',
      'curator_end_link','client_end_link','curator_referrals','my_referral_offer','my_goal_proposals',
      'my_curator_link','set_curator_share','my_day_comments','end_link','curator_seats')
  loop
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', f.sig);
    end if;
  end loop;
end $$;

-- ======== 0007_notifications.sql ========

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
