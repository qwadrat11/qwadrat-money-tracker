create extension if not exists "pgcrypto";

create table if not exists public.google_sheets_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_account_id text,
  google_email text,
  spreadsheet_id text,
  spreadsheet_url text,
  encrypted_refresh_token text,
  token_iv text,
  token_auth_tag text,
  connection_status text not null default 'not_connected',
  sync_status text not null default 'idle',
  last_synced_at timestamptz,
  sync_started_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sheets_connections_connection_status_check'
      and conrelid = 'public.google_sheets_connections'::regclass
  ) then
    alter table public.google_sheets_connections
      add constraint google_sheets_connections_connection_status_check
      check (connection_status in ('not_connected', 'connecting', 'connected', 'disconnected', 'error', 'reauthorization_required'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sheets_connections_sync_status_check'
      and conrelid = 'public.google_sheets_connections'::regclass
  ) then
    alter table public.google_sheets_connections
      add constraint google_sheets_connections_sync_status_check
      check (sync_status in ('idle', 'syncing', 'success', 'error'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sheets_connections_spreadsheet_id_key'
      and conrelid = 'public.google_sheets_connections'::regclass
  ) then
    alter table public.google_sheets_connections
      add constraint google_sheets_connections_spreadsheet_id_key unique (spreadsheet_id);
  end if;
end
$$;

drop trigger if exists set_google_sheets_connections_updated_at on public.google_sheets_connections;
create trigger set_google_sheets_connections_updated_at
before update on public.google_sheets_connections
for each row execute procedure public.set_updated_at();

alter table public.google_sheets_connections enable row level security;
alter table public.google_sheets_connections force row level security;

revoke all on table public.google_sheets_connections from anon, authenticated, public;

create index if not exists google_sheets_connections_connection_status_idx
  on public.google_sheets_connections (connection_status);

create index if not exists google_sheets_connections_sync_status_idx
  on public.google_sheets_connections (sync_status);

create table if not exists public.google_sheets_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  spreadsheet_id text,
  status text not null,
  trigger_type text not null default 'manual',
  rows_written integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sheets_sync_logs_status_check'
      and conrelid = 'public.google_sheets_sync_logs'::regclass
  ) then
    alter table public.google_sheets_sync_logs
      add constraint google_sheets_sync_logs_status_check
      check (status in ('started', 'success', 'error'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'google_sheets_sync_logs_trigger_type_check'
      and conrelid = 'public.google_sheets_sync_logs'::regclass
  ) then
    alter table public.google_sheets_sync_logs
      add constraint google_sheets_sync_logs_trigger_type_check
      check (trigger_type in ('manual', 'automatic', 'initial'));
  end if;
end
$$;

alter table public.google_sheets_sync_logs enable row level security;
alter table public.google_sheets_sync_logs force row level security;

revoke all on table public.google_sheets_sync_logs from anon, authenticated, public;

create index if not exists google_sheets_sync_logs_user_created_idx
  on public.google_sheets_sync_logs (user_id, created_at desc);

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
set search_path = public
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
    select *
    from public.google_sheets_connections
    where user_id = auth.uid()
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
    from public.google_sheets_connections
    where user_id = auth.uid()
  )
  limit 1;
$$;

revoke all on function public.get_my_google_sheets_connection() from public;
revoke all on function public.get_my_google_sheets_connection() from anon;
grant execute on function public.get_my_google_sheets_connection() to authenticated;

create or replace function public.get_my_google_sheets_sync_logs(p_limit integer default 10)
returns table (
  id uuid,
  status text,
  trigger_type text,
  rows_written integer,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    log.id,
    log.status,
    log.trigger_type,
    log.rows_written,
    log.error_code,
    log.error_message,
    log.started_at,
    log.finished_at,
    log.created_at
  from public.google_sheets_sync_logs as log
  where log.user_id = auth.uid()
  order by log.created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.get_my_google_sheets_sync_logs(integer) from public;
revoke all on function public.get_my_google_sheets_sync_logs(integer) from anon;
grant execute on function public.get_my_google_sheets_sync_logs(integer) to authenticated;
