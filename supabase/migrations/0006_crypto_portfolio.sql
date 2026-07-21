create table if not exists public.crypto_assets (
  coingecko_id text primary key,
  symbol text not null,
  name text not null,
  image_url text,
  market_cap_rank integer,
  last_searched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crypto_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coingecko_id text not null references public.crypto_assets(coingecko_id),
  quantity numeric not null check (quantity > 0),
  purchase_price numeric not null check (purchase_price >= 0),
  purchase_currency text not null default 'USD' check (purchase_currency = upper(purchase_currency)),
  purchase_date date not null,
  fee numeric not null default 0 check (fee >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crypto_price_cache (
  coingecko_id text not null references public.crypto_assets(coingecko_id) on delete cascade,
  vs_currency text not null check (vs_currency = lower(vs_currency)),
  current_price numeric not null check (current_price >= 0),
  price_change_24h numeric,
  price_change_percentage_24h numeric,
  market_cap numeric,
  last_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key (coingecko_id, vs_currency)
);

create index if not exists crypto_positions_user_id_idx on public.crypto_positions(user_id);
create index if not exists crypto_assets_symbol_lower_idx on public.crypto_assets(lower(symbol));
create index if not exists crypto_assets_name_lower_idx on public.crypto_assets(lower(name));

drop trigger if exists set_crypto_positions_updated_at on public.crypto_positions;
create trigger set_crypto_positions_updated_at before update on public.crypto_positions
for each row execute procedure public.set_updated_at();

drop trigger if exists set_crypto_assets_updated_at on public.crypto_assets;
create trigger set_crypto_assets_updated_at before update on public.crypto_assets
for each row execute procedure public.set_updated_at();

alter table public.crypto_assets enable row level security;
alter table public.crypto_positions enable row level security;
alter table public.crypto_price_cache enable row level security;

drop policy if exists "crypto_assets_read_authenticated" on public.crypto_assets;
create policy "crypto_assets_read_authenticated" on public.crypto_assets for select to authenticated using (true);

drop policy if exists "crypto_positions_select_own" on public.crypto_positions;
create policy "crypto_positions_select_own" on public.crypto_positions for select using (user_id = auth.uid());
drop policy if exists "crypto_positions_insert_own" on public.crypto_positions;
create policy "crypto_positions_insert_own" on public.crypto_positions for insert with check (user_id = auth.uid());
drop policy if exists "crypto_positions_update_own" on public.crypto_positions;
create policy "crypto_positions_update_own" on public.crypto_positions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "crypto_positions_delete_own" on public.crypto_positions;
create policy "crypto_positions_delete_own" on public.crypto_positions for delete using (user_id = auth.uid());

revoke all on public.crypto_assets from anon;
revoke insert, update, delete on public.crypto_assets from authenticated;
revoke all on public.crypto_price_cache from anon, authenticated;
