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
