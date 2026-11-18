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
