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
