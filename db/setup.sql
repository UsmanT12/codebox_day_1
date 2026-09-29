-- Run once in your new Supabase project's SQL Editor.
-- This table contains only the bootcamp's sample users.
create table if not exists public.codebox_users (
  id integer primary key,
  name text not null
);

alter table public.codebox_users enable row level security;
revoke all on public.codebox_users from anon, authenticated;
grant select on public.codebox_users to service_role;

insert into public.codebox_users (id, name)
values (1, 'Alex'), (2, 'Sam')
on conflict (id) do nothing;
