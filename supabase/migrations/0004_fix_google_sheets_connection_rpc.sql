-- Fix for:
-- Could not find the function public.get_my_google_sheets_connection without parameters in the schema cache
--
-- This migration is idempotent and safe to apply multiple times.
-- It recreates the zero-argument RPC with a stable public signature,
-- removes any stale overloads that could confuse PostgREST, and then
-- asks PostgREST to reload its schema cache.

drop function if exists public.get_my_google_sheets_connection();
drop function if exists public.get_my_google_sheets_connection(uuid);
drop function if exists public.get_my_google_sheets_connection(text);
drop function if exists public.get_my_google_sheets_connection(integer);
drop function if exists public.get_my_google_sheets_connection(bigint);

create or replace function public.get_my_google_sheets_connection()
returns table (
  google_email text,
  spreadsheet_url text,
  connection_status text,
  sync_status text,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(connection.google_email, null) as google_email,
    coalesce(connection.spreadsheet_url, null) as spreadsheet_url,
    coalesce(connection.connection_status, 'not_connected') as connection_status,
    coalesce(connection.sync_status, 'idle') as sync_status,
    connection.last_synced_at,
    connection.last_sync_error,
    connection.created_at,
    connection.updated_at
  from (
    select
      c.google_email,
      c.spreadsheet_url,
      c.connection_status,
      c.sync_status,
      c.last_synced_at,
      c.last_sync_error,
      c.created_at,
      c.updated_at
    from public.google_sheets_connections as c
    where c.user_id = auth.uid()
    limit 1
  ) as connection
  union all
  select
    null::text,
    null::text,
    'not_connected'::text,
    'idle'::text,
    null::timestamptz,
    null::text,
    null::timestamptz,
    null::timestamptz
  where not exists (
    select 1
    from public.google_sheets_connections as c
    where c.user_id = auth.uid()
  )
  limit 1;
$$;

revoke all on function public.get_my_google_sheets_connection() from public;
revoke all on function public.get_my_google_sheets_connection() from anon;
grant execute on function public.get_my_google_sheets_connection() to authenticated;

notify pgrst, 'reload schema';
