-- Галочки на экране входа: условия, политика, согласие на обработку ПДн (включая здоровье), рассылки.
-- В журнал согласий добавляются новые виды и версия документов, которую принял пользователь.

alter table public.consents drop constraint if exists consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('health','photo_ai','photo_to_curator','terms','privacy','marketing'));

alter table public.consents add column if not exists doc_version text;
alter table public.consents alter column user_id set default auth.uid();

-- снять согласие (рассылки) может сам пользователь; политика own_consents из 0001 это уже разрешает
create index if not exists consents_user_kind on public.consents (user_id, kind) where revoked_at is null;
