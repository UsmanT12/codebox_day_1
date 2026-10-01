-- Run in your existing Supabase project's SQL Editor. No existing tables change.
begin;
create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null,
  fdc_id bigint not null check (fdc_id > 0),
  food_name text not null,
  data_type text not null,
  amount double precision not null check (amount > 0 and amount <= 10000),
  unit text not null check (unit in ('g', 'serving')),
  grams double precision not null check (grams > 0 and grams <= 10000),
  portion_label text,
  nutrients jsonb not null check (jsonb_typeof(nutrients) = 'object'),
  nutrients_per_100g jsonb not null check (jsonb_typeof(nutrients_per_100g) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists nutrition_logs_date_idx on public.nutrition_logs (log_date);
alter table public.nutrition_logs enable row level security;
revoke all on public.nutrition_logs from anon, authenticated;
grant select, insert, delete on public.nutrition_logs to service_role;
commit;
