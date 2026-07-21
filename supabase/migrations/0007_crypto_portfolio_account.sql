create unique index if not exists accounts_one_active_crypto_portfolio_per_user
on public.accounts(user_id)
where type = 'crypto_portfolio' and is_archived = false;

create table if not exists public.crypto_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null default 'coingecko',
  provider_asset_id text not null,
  symbol text not null check (symbol = upper(symbol)),
  name text not null,
  image_url text,
  quantity numeric not null check (quantity >= 0),
  average_buy_price numeric check (average_buy_price is null or average_buy_price >= 0),
  average_buy_currency text check (average_buy_currency is null or average_buy_currency = upper(average_buy_currency)),
  include_in_portfolio boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, account_id, provider, provider_asset_id)
);

alter table public.crypto_price_cache drop constraint if exists crypto_price_cache_pkey;
alter table public.crypto_price_cache drop constraint if exists crypto_price_cache_vs_currency_check;
alter table public.crypto_price_cache rename column coingecko_id to provider_asset_id;
alter table public.crypto_price_cache rename column vs_currency to quote_currency;
alter table public.crypto_price_cache rename column current_price to price;
alter table public.crypto_price_cache rename column price_change_percentage_24h to change_24h;
alter table public.crypto_price_cache drop column if exists price_change_24h;
alter table public.crypto_price_cache rename column fetched_at to updated_at;
alter table public.crypto_price_cache add column if not exists provider text not null default 'coingecko';
alter table public.crypto_price_cache add column if not exists created_at timestamptz not null default now();
update public.crypto_price_cache set quote_currency = upper(quote_currency);
alter table public.crypto_price_cache add constraint crypto_price_cache_quote_currency_check check (quote_currency = upper(quote_currency));
alter table public.crypto_price_cache add constraint crypto_price_cache_pkey primary key(provider, provider_asset_id, quote_currency);

create index if not exists crypto_holdings_user_account_idx on public.crypto_holdings(user_id, account_id);

create or replace function public.validate_crypto_holding_account()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.accounts
    where id = new.account_id and user_id = new.user_id and type = 'crypto_portfolio'
  ) then
    raise exception 'CRYPTO_PORTFOLIO_ACCOUNT_INVALID';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_crypto_holding_account on public.crypto_holdings;
create trigger validate_crypto_holding_account before insert or update on public.crypto_holdings
for each row execute procedure public.validate_crypto_holding_account();

create or replace function public.protect_crypto_portfolio_balance()
returns trigger language plpgsql as $$
begin
  if new.type = 'crypto_portfolio' then
    new.balance := 0;
    new.currency := coalesce(new.currency, 'USD');
    new.icon := 'Bitcoin';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_crypto_portfolio_balance on public.accounts;
create trigger protect_crypto_portfolio_balance before insert or update on public.accounts
for each row execute procedure public.protect_crypto_portfolio_balance();

drop trigger if exists set_crypto_holdings_updated_at on public.crypto_holdings;
create trigger set_crypto_holdings_updated_at before update on public.crypto_holdings
for each row execute procedure public.set_updated_at();

drop trigger if exists set_crypto_price_cache_updated_at on public.crypto_price_cache;
create trigger set_crypto_price_cache_updated_at before update on public.crypto_price_cache
for each row execute procedure public.set_updated_at();

alter table public.crypto_holdings enable row level security;
alter table public.crypto_price_cache enable row level security;

drop policy if exists "crypto_holdings_select_own" on public.crypto_holdings;
create policy "crypto_holdings_select_own" on public.crypto_holdings for select
using (user_id = auth.uid() and exists(select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid() and a.type = 'crypto_portfolio'));
drop policy if exists "crypto_holdings_insert_own" on public.crypto_holdings;
create policy "crypto_holdings_insert_own" on public.crypto_holdings for insert
with check (user_id = auth.uid() and exists(select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid() and a.type = 'crypto_portfolio'));
drop policy if exists "crypto_holdings_update_own" on public.crypto_holdings;
create policy "crypto_holdings_update_own" on public.crypto_holdings for update
using (user_id = auth.uid()) with check (user_id = auth.uid() and exists(select 1 from public.accounts a where a.id = account_id and a.user_id = auth.uid() and a.type = 'crypto_portfolio'));
drop policy if exists "crypto_holdings_delete_own" on public.crypto_holdings;
create policy "crypto_holdings_delete_own" on public.crypto_holdings for delete using (user_id = auth.uid());

revoke all on public.crypto_price_cache from anon, authenticated;
