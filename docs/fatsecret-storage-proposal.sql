-- REVIEW ONLY. Not a migration. Do not execute against production.
-- Requires API licensing review and isolated database acceptance tests.
begin;
create schema if not exists fatsecret_private;
revoke all on schema fatsecret_private from public, anon, authenticated;
create table fatsecret_private.connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_pair text not null check (length(encrypted_pair) between 4 and 8192),
  connected_at timestamptz not null default now()
);
create table fatsecret_private.pending (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_token_hash text not null unique,
  encrypted_pair text not null check (length(encrypted_pair) between 4 and 8192),
  expires_at timestamptz not null
);
alter table fatsecret_private.connections enable row level security;
alter table fatsecret_private.pending enable row level security;
revoke all on all tables in schema fatsecret_private from public, anon, authenticated;
-- No client policies, no public RPC, no Data API exposure.
-- Server database access must use a separately provisioned restricted role.
-- Pending authorization must be consumed atomically before token exchange.
-- Never accept a user_id supplied by the client as proof of identity.
commit;
