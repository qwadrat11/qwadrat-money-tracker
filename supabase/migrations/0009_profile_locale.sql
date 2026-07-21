alter table public.profiles
  add column if not exists locale text not null default 'ru';

update public.profiles
set locale = 'ru'
where locale is null or locale not in ('ru', 'uk', 'en');

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check check (locale in ('ru', 'uk', 'en'));

comment on column public.profiles.locale is
  'Personal interface locale. ISO 639-1: ru, uk, en.';
