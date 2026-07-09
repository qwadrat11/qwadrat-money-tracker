-- Run this in Supabase SQL Editor if your existing database was created without this column.
alter table public.transactions
  add column if not exists to_account_id uuid references public.accounts(id) on delete set null;
