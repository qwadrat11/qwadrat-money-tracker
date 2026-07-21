do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'categories_user_name_type_key'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_user_name_type_key unique (user_id, name, type);
  end if;
end
$$;
