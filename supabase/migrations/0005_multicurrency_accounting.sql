alter table public.transactions
  add column if not exists currency text,
  add column if not exists base_currency text,
  add column if not exists exchange_rate numeric,
  add column if not exists converted_amount numeric,
  add column if not exists exchange_rate_date date,
  add column if not exists exchange_rate_source text,
  add column if not exists account_amount numeric,
  add column if not exists account_currency text,
  add column if not exists destination_amount numeric,
  add column if not exists destination_currency text;

alter table public.transactions
  drop constraint if exists transactions_amount_nonnegative,
  add constraint transactions_amount_nonnegative check (amount >= 0),
  drop constraint if exists transactions_exchange_rate_positive,
  add constraint transactions_exchange_rate_positive check (exchange_rate is null or exchange_rate > 0),
  drop constraint if exists transactions_converted_amount_nonnegative,
  add constraint transactions_converted_amount_nonnegative check (converted_amount is null or converted_amount >= 0),
  drop constraint if exists transactions_destination_amount_nonnegative,
  add constraint transactions_destination_amount_nonnegative check (destination_amount is null or destination_amount >= 0),
  drop constraint if exists transactions_account_amount_nonnegative,
  add constraint transactions_account_amount_nonnegative check (account_amount is null or account_amount >= 0),
  drop constraint if exists transactions_currency_uppercase,
  add constraint transactions_currency_uppercase check (currency is null or currency = upper(currency)),
  drop constraint if exists transactions_base_currency_uppercase,
  add constraint transactions_base_currency_uppercase check (base_currency is null or base_currency = upper(base_currency)),
  drop constraint if exists transactions_destination_currency_uppercase,
  add constraint transactions_destination_currency_uppercase check (destination_currency is null or destination_currency = upper(destination_currency)),
  drop constraint if exists transactions_account_currency_uppercase,
  add constraint transactions_account_currency_uppercase check (account_currency is null or account_currency = upper(account_currency));

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  base_currency text not null check (base_currency = upper(base_currency)),
  quote_currency text not null check (quote_currency = upper(quote_currency)),
  rate numeric not null check (rate > 0),
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_date, base_currency, quote_currency, source)
);

drop trigger if exists set_exchange_rates_updated_at on public.exchange_rates;
create trigger set_exchange_rates_updated_at
before update on public.exchange_rates
for each row execute procedure public.set_updated_at();

alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon, authenticated;

create or replace function public.protect_transaction_fx_snapshot()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.base_currency := null;
    new.exchange_rate := null;
    new.converted_amount := null;
    new.exchange_rate_date := null;
    new.exchange_rate_source := null;
    new.account_amount := null;
    new.account_currency := null;
    new.destination_amount := null;
    new.destination_currency := null;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_transaction_fx_snapshot on public.transactions;
create trigger protect_transaction_fx_snapshot
before insert or update on public.transactions
for each row execute procedure public.protect_transaction_fx_snapshot();

comment on column public.transactions.amount is 'Original amount in transactions.currency; never rewritten by FX conversion.';
comment on column public.transactions.converted_amount is 'Historical P&L snapshot converted to transactions.base_currency.';
comment on column public.transactions.exchange_rate is 'Multiplier: converted_amount = amount * exchange_rate.';
comment on table public.exchange_rates is 'Server-managed NBU rates where base_currency unit is quoted in UAH.';
