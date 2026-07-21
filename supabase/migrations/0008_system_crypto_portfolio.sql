-- One system crypto portfolio per user, including existing and future users.
drop index if exists public.accounts_one_active_crypto_portfolio_per_user;
alter table public.crypto_holdings add column if not exists note text;

with ranked as (
  select id, user_id, first_value(id) over (partition by user_id order by is_archived asc, created_at asc, id asc) as keep_id
  from public.accounts where type = 'crypto_portfolio'
), moved as (
  update public.crypto_holdings h
  set account_id = r.keep_id
  from ranked r
  where h.account_id = r.id and r.id <> r.keep_id
    and not exists (
      select 1 from public.crypto_holdings existing
      where existing.account_id = r.keep_id
        and existing.provider = h.provider
        and existing.provider_asset_id = h.provider_asset_id
    )
  returning h.id
)
delete from public.accounts a using ranked r
where a.id = r.id and r.id <> r.keep_id;

create unique index accounts_one_crypto_portfolio_per_user
on public.accounts(user_id) where type = 'crypto_portfolio';

insert into public.accounts (user_id, name, type, balance, currency, icon, color, is_archived, include_in_total)
select u.id, 'Криптопортфель', 'crypto_portfolio', 0, 'USD', 'Bitcoin', '#525252', false, true
from auth.users u
where not exists (
  select 1 from public.accounts a where a.user_id = u.id and a.type = 'crypto_portfolio'
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(nullif(split_part(coalesce(new.email, 'user'), '@', 1), ''), 'user'))
  on conflict (id) do update set email = excluded.email, display_name = excluded.display_name, updated_at = now();

  insert into public.accounts (user_id, name, type, balance, currency, icon, color, is_archived, include_in_total)
  values (new.id, 'Криптопортфель', 'crypto_portfolio', 0, 'USD', 'Bitcoin', '#525252', false, true)
  on conflict (user_id) where type = 'crypto_portfolio' do nothing;
  return new;
end;
$$;

create or replace function public.protect_system_crypto_portfolio()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.type = 'crypto_portfolio' then
    if tg_op = 'DELETE' then
      raise exception 'SYSTEM_CRYPTO_PORTFOLIO_CANNOT_BE_DELETED';
    end if;
    if new.type <> 'crypto_portfolio' then
      raise exception 'SYSTEM_CRYPTO_PORTFOLIO_TYPE_CANNOT_CHANGE';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_system_crypto_portfolio on public.accounts;
create trigger protect_system_crypto_portfolio before update or delete on public.accounts
for each row execute procedure public.protect_system_crypto_portfolio();
