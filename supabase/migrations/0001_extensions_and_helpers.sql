-- Marketo v1.0: PostgreSQL capabilities and non-exposed helper schema.
-- Apply to a clean Supabase development/branch database before every later file.

begin;

create schema if not exists extensions;
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

commit;
