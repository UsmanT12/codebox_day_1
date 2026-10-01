-- Run after db/nutrition.sql in your Supabase SQL Editor.
-- Existing shared entries are preserved with a NULL owner and hidden from accounts.
begin;
alter table public.nutrition_logs
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists nutrition_logs_owner_date_idx
  on public.nutrition_logs(user_id, log_date);
alter table public.nutrition_logs enable row level security;
revoke all on public.nutrition_logs from anon;
grant select, insert, delete on public.nutrition_logs to authenticated;
drop policy if exists "Read own food logs" on public.nutrition_logs;
create policy "Read own food logs" on public.nutrition_logs
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insert own food logs" on public.nutrition_logs;
create policy "Insert own food logs" on public.nutrition_logs
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Delete own food logs" on public.nutrition_logs;
create policy "Delete own food logs" on public.nutrition_logs
  for delete to authenticated using ((select auth.uid()) = user_id);
commit;
