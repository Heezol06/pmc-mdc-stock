-- PMC Medicine Stock Register — Supabase setup
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → Run)

create table if not exists app_state (
  id int primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_state (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table app_state enable row level security;

drop policy if exists "anon can read app_state" on app_state;
create policy "anon can read app_state"
  on app_state for select
  to anon
  using (true);

drop policy if exists "anon can update app_state" on app_state;
create policy "anon can update app_state"
  on app_state for update
  to anon
  using (true)
  with check (true);
