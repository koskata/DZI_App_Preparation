-- Матура по БЕЛ: таблици за синхронизация между устройства.
-- Пусни целия файл веднъж в Supabase → SQL Editor → New query → Run.

create table if not exists public.entries (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  d bigint not null,
  t text not null,
  title text,
  score numeric,
  max numeric,
  grade text,
  data jsonb not null,
  primary key (user_id, id)
);
create index if not exists entries_user_d on public.entries (user_id, d);

create table if not exists public.kv (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.entries enable row level security;
alter table public.kv enable row level security;

-- Всеки потребител вижда и променя само своите записи.
drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own kv" on public.kv;
create policy "own kv" on public.kv
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
