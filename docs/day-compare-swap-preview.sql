-- Preview only; legacy writers are not yet migrated.
create or replace function public.day_compare_swap(p_date date,p_expected jsonb,p_next jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); n integer;
begin
 if uid is null or coalesce(auth.jwt()->>'is_anonymous','false')<>'false' then raise exception 'unauthorized'; end if;
 if p_date is null or (p_expected is not null and jsonb_typeof(p_expected)<>'object') or (p_next is not null and jsonb_typeof(p_next)<>'object') then raise exception 'invalid_day'; end if;
 if p_expected is null then
  if p_next is null then return not exists(select 1 from public.day_entries where user_id=uid and date=p_date); end if;
  insert into public.day_entries(user_id,date,data) values(uid,p_date,p_next) on conflict(user_id,date) do nothing;
 elsif p_next is null then
  delete from public.day_entries where user_id=uid and date=p_date and data=p_expected;
 else
  update public.day_entries set data=p_next,updated_at=clock_timestamp() where user_id=uid and date=p_date and data=p_expected;
 end if;
 get diagnostics n=row_count;
 return n=1;
end $$;
revoke all on function public.day_compare_swap(date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.day_compare_swap(date,jsonb,jsonb) to authenticated;
