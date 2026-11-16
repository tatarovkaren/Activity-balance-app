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
