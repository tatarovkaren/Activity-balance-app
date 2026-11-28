-- REVIEW ONLY. Not a migration. Do not execute in Production.
-- Existing whole-day writers must also adopt concurrency protection before release.
begin;
create or replace function public.fatsecret_import_atomic(changes jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
 uid uuid := auth.uid();
 item jsonb;
 d date;
 expected jsonb;
 nutrition jsonb;
 n integer;
begin
 if uid is null or coalesce(auth.jwt()->>'is_anonymous','false') <> 'false' then
  raise exception 'unauthorized';
 end if;
 if jsonb_typeof(changes) is distinct from 'array' then raise exception 'invalid_changes'; end if;
 if jsonb_array_length(changes)>366 then raise exception 'too_many_days'; end if;
 if (select count(distinct x->>'date') from jsonb_array_elements(changes) x) <> jsonb_array_length(changes) then raise exception 'duplicate_dates'; end if;
 begin
  for item in select x from jsonb_array_elements(changes) x order by x->>'date' loop
   if coalesce(item->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not (item ? 'expected') then raise exception 'invalid_change'; end if;
   d := (item->>'date')::date;
   if d > current_date then raise exception 'future_date'; end if;
   expected := item->'expected';
   nutrition := item->'nutrition';
   if jsonb_typeof(nutrition) is distinct from 'object' then raise exception 'invalid_nutrition'; end if;
   if exists(select 1 from unnest(array['kcal','protein','fat','carbs']) k where jsonb_typeof(nutrition->k) is distinct from 'number') then raise exception 'invalid_nutrition'; end if;
   if exists(select 1 from unnest(array['kcal','protein','fat','carbs']) k where (nutrition->>k)::numeric not between 0 and 100000) then raise exception 'invalid_nutrition'; end if;
   nutrition := jsonb_build_object('kcal',nutrition->'kcal','protein',nutrition->'protein','fat',nutrition->'fat','carbs',nutrition->'carbs','kcalManual',true,'updatedAt',floor(extract(epoch from clock_timestamp())*1000));
   if expected = 'null'::jsonb then
    insert into public.day_entries(user_id,date,data) values(uid,d,nutrition) on conflict(user_id,date) do nothing;
   else
    update public.day_entries e set data=e.data||nutrition,updated_at=clock_timestamp()
     where e.user_id=uid and e.date=d and e.data=expected
     and not (e.data ?| array['kcal','protein','fat','carbs'])
     and (not (e.data ? 'photoMeals') or e.data->'photoMeals'='[]'::jsonb);
   end if;
   get diagnostics n = row_count;
   if n<>1 then raise sqlstate 'AB065' using message='stale_import'; end if;
  end loop;
 exception when sqlstate 'AB065' then return false;
 end;
 return true;
end $$;
revoke all on function public.fatsecret_import_atomic(jsonb) from public, anon, authenticated;
-- Grant only after isolated RLS and concurrency tests and #51 review.
commit;
