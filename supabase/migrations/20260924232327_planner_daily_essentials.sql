-- Records that previously lived only in each browser now sync per account.
create table public.xp_app_records (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index xp_app_records_user_updated_idx on public.xp_app_records (user_id, updated_at desc);
alter table public.xp_app_records enable row level security;
create policy "read own records" on public.xp_app_records for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own records" on public.xp_app_records for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own records" on public.xp_app_records for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own records" on public.xp_app_records for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.xp_app_records to authenticated;
revoke all on public.xp_app_records from anon;

alter table public.xp_shared_calendar_events
  add column recurrence text not null default 'none'
  check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly'));

alter table public.xp_calendar_invites add column email_sent_at timestamptz;
grant update(email_sent_at) on public.xp_calendar_invites to authenticated;
create policy "calendar owner tracks invitation email" on public.xp_calendar_invites
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Private read-only Google/Outlook iCal subscriptions.
create table public.xp_calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  created_at timestamptz not null default now()
);
create index xp_calendar_feeds_user_idx on public.xp_calendar_feeds(user_id);
alter table public.xp_calendar_feeds enable row level security;
create policy "read own feeds" on public.xp_calendar_feeds for select to authenticated using (user_id = (select auth.uid()));
create policy "add own feeds" on public.xp_calendar_feeds for insert to authenticated with check (user_id = (select auth.uid()));
create policy "remove own feeds" on public.xp_calendar_feeds for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.xp_calendar_feeds to authenticated;
revoke all on public.xp_calendar_feeds from anon;

create table public.xp_calendar_messages (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.xp_shared_calendars(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index xp_calendar_messages_recent_idx on public.xp_calendar_messages(calendar_id, created_at desc);
alter table public.xp_calendar_messages enable row level security;
create policy "members see calendar chat" on public.xp_calendar_messages for select to authenticated using (
  exists (select 1 from public.xp_shared_calendars c where c.id = calendar_id and c.owner_id = (select auth.uid()))
  or exists (select 1 from public.xp_calendar_members m where m.calendar_id = xp_calendar_messages.calendar_id and m.user_id = (select auth.uid()))
);
create policy "members post calendar chat" on public.xp_calendar_messages for insert to authenticated with check (
  user_id = (select auth.uid()) and (
    exists (select 1 from public.xp_shared_calendars c where c.id = calendar_id and c.owner_id = (select auth.uid()))
    or exists (select 1 from public.xp_calendar_members m where m.calendar_id = xp_calendar_messages.calendar_id and m.user_id = (select auth.uid()))
  )
);
grant select, insert on public.xp_calendar_messages to authenticated;
revoke all on public.xp_calendar_messages from anon;

alter publication supabase_realtime add table
  public.xp_shared_calendars,
  public.xp_calendar_members,
  public.xp_calendar_invites,
  public.xp_shared_calendar_events,
  public.xp_calendar_messages;
