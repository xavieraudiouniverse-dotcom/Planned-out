alter table public.xp_shared_calendar_events
  add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none','daily','weekly','monthly','yearly'));

create table if not exists public.xp_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  url text not null check (char_length(url) between 8 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url)
);

alter table public.xp_calendar_feeds enable row level security;

drop policy if exists calendar_feeds_select on public.xp_calendar_feeds;
create policy calendar_feeds_select on public.xp_calendar_feeds
for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists calendar_feeds_insert on public.xp_calendar_feeds;
create policy calendar_feeds_insert on public.xp_calendar_feeds
for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists calendar_feeds_update on public.xp_calendar_feeds;
create policy calendar_feeds_update on public.xp_calendar_feeds
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists calendar_feeds_delete on public.xp_calendar_feeds;
create policy calendar_feeds_delete on public.xp_calendar_feeds
for delete to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.xp_calendar_feeds to authenticated;
revoke all on public.xp_calendar_feeds from anon;

create index if not exists xp_calendar_feeds_user_idx
  on public.xp_calendar_feeds (user_id);

create table if not exists public.xp_calendar_export_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Primary calendar feed'
    check (char_length(label) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.xp_calendar_export_tokens enable row level security;
revoke all on public.xp_calendar_export_tokens from anon, authenticated;

create index if not exists xp_calendar_export_tokens_user_active_idx
  on public.xp_calendar_export_tokens (user_id, active);
