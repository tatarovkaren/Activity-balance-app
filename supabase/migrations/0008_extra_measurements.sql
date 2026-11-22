-- Необязательные замеры (22.11.2026): грудь и бицепс (chest, biceps) в day_entries.data.
-- Отдельных колонок не нужно — день хранится JSON. Куратору они видны вместе с весом и замерами,
-- только если клиент разрешил «вес и замеры»; иначе вырезаются, как шея, живот и бёдра.

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
               - case when coalesce((l.share->>'measurements')::boolean, false) then '{}'::text[] else array['weight','neck','waist','hips','chest','biceps'] end
               - case when coalesce((l.share->>'comments')::boolean, false) then '{}'::text[] else array['comment','wellbeing'] end))
           from public.day_entries d
           where d.user_id = l.client_id and d.date >= since
         ), '{}'::jsonb) as days
  from public.curator_links l
  left join public.profiles p on p.id = l.client_id
  where l.curator_id = auth.uid() and l.status = 'active';
$$;

revoke all on function public.curator_clients_snapshot(date) from public;
grant execute on function public.curator_clients_snapshot(date) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.curator_clients_snapshot(date) from anon;
  end if;
end $$;
