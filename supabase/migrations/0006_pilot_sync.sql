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
