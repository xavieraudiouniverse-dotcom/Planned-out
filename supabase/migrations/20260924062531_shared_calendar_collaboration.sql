create table if not exists public.xp_shared_calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null default 'Shared Calendar' check (length(name) between 1 and 120),
  description text not null default '',
  color text not null default '#8b7cff',
  timezone text not null default 'Australia/Brisbane',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_calendar_invites (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.xp_shared_calendars(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null check (position('@' in invitee_email) > 1),
  role text not null default 'viewer' check (role in ('viewer','editor')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists public.xp_calendar_members (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.xp_shared_calendars(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','editor')),
  joined_at timestamptz not null default now(),
  unique (calendar_id, user_id)
);

create table if not exists public.xp_shared_calendar_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.xp_shared_calendars(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 220),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create unique index if not exists xp_calendar_invites_calendar_email_uq
  on public.xp_calendar_invites (calendar_id, lower(invitee_email));
create index if not exists xp_shared_calendars_owner_idx on public.xp_shared_calendars(owner_id);
create index if not exists xp_calendar_members_user_idx on public.xp_calendar_members(user_id);
create index if not exists xp_calendar_members_owner_idx on public.xp_calendar_members(owner_id);
create index if not exists xp_calendar_members_calendar_idx on public.xp_calendar_members(calendar_id);
create index if not exists xp_calendar_invites_owner_idx on public.xp_calendar_invites(owner_id);
create index if not exists xp_calendar_invites_email_idx on public.xp_calendar_invites(lower(invitee_email));
create index if not exists xp_shared_calendar_events_calendar_start_idx on public.xp_shared_calendar_events(calendar_id, starts_at);
create index if not exists xp_shared_calendar_events_creator_idx on public.xp_shared_calendar_events(created_by);

alter table public.xp_shared_calendars enable row level security;
alter table public.xp_calendar_invites enable row level security;
alter table public.xp_calendar_members enable row level security;
alter table public.xp_shared_calendar_events enable row level security;

grant select, insert, update, delete on public.xp_shared_calendars to authenticated;
grant select, insert, delete on public.xp_calendar_invites to authenticated;
grant select, insert, update, delete on public.xp_calendar_members to authenticated;
grant select, insert, update, delete on public.xp_shared_calendar_events to authenticated;
revoke all on public.xp_shared_calendars from anon;
revoke all on public.xp_calendar_invites from anon;
revoke all on public.xp_calendar_members from anon;
revoke all on public.xp_shared_calendar_events from anon;

drop policy if exists "shared_calendars_select" on public.xp_shared_calendars;
create policy "shared_calendars_select"
on public.xp_shared_calendars for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.xp_calendar_members m
    where m.calendar_id = xp_shared_calendars.id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists "shared_calendars_insert" on public.xp_shared_calendars;
create policy "shared_calendars_insert"
on public.xp_shared_calendars for insert to authenticated
with check (owner_id = (select auth.uid()));

drop policy if exists "shared_calendars_update" on public.xp_shared_calendars;
create policy "shared_calendars_update"
on public.xp_shared_calendars for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "shared_calendars_delete" on public.xp_shared_calendars;
create policy "shared_calendars_delete"
on public.xp_shared_calendars for delete to authenticated
using (owner_id = (select auth.uid()));

drop policy if exists "calendar_invites_select" on public.xp_calendar_invites;
create policy "calendar_invites_select"
on public.xp_calendar_invites for select to authenticated
using (
  owner_id = (select auth.uid())
  or lower(invitee_email) = lower(coalesce((select auth.jwt()->>'email'), ''))
);

drop policy if exists "calendar_invites_insert" on public.xp_calendar_invites;
create policy "calendar_invites_insert"
on public.xp_calendar_invites for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.xp_shared_calendars c
    where c.id = calendar_id and c.owner_id = (select auth.uid())
  )
);

drop policy if exists "calendar_invites_delete" on public.xp_calendar_invites;
create policy "calendar_invites_delete"
on public.xp_calendar_invites for delete to authenticated
using (
  owner_id = (select auth.uid())
  or lower(invitee_email) = lower(coalesce((select auth.jwt()->>'email'), ''))
);

drop policy if exists "calendar_members_select" on public.xp_calendar_members;
create policy "calendar_members_select"
on public.xp_calendar_members for select to authenticated
using (
  owner_id = (select auth.uid())
  or user_id = (select auth.uid())
);

drop policy if exists "calendar_members_insert" on public.xp_calendar_members;
create policy "calendar_members_insert"
on public.xp_calendar_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.xp_calendar_invites i
    where i.calendar_id = xp_calendar_members.calendar_id
      and i.owner_id = xp_calendar_members.owner_id
      and i.role = xp_calendar_members.role
      and i.expires_at > now()
      and lower(i.invitee_email) = lower(coalesce((select auth.jwt()->>'email'), ''))
  )
);

drop policy if exists "calendar_members_update" on public.xp_calendar_members;
create policy "calendar_members_update"
on public.xp_calendar_members for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "calendar_members_delete" on public.xp_calendar_members;
create policy "calendar_members_delete"
on public.xp_calendar_members for delete to authenticated
using (
  owner_id = (select auth.uid())
  or user_id = (select auth.uid())
);

drop policy if exists "shared_calendar_events_select" on public.xp_shared_calendar_events;
create policy "shared_calendar_events_select"
on public.xp_shared_calendar_events for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.xp_calendar_members m
    where m.calendar_id = xp_shared_calendar_events.calendar_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists "shared_calendar_events_insert" on public.xp_shared_calendar_events;
create policy "shared_calendar_events_insert"
on public.xp_shared_calendar_events for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.xp_shared_calendars c
    where c.id = calendar_id
      and c.owner_id = owner_id
      and (
        c.owner_id = (select auth.uid())
        or exists (
          select 1 from public.xp_calendar_members m
          where m.calendar_id = c.id
            and m.user_id = (select auth.uid())
            and m.role = 'editor'
        )
      )
  )
);

drop policy if exists "shared_calendar_events_update" on public.xp_shared_calendar_events;
create policy "shared_calendar_events_update"
on public.xp_shared_calendar_events for update to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.xp_calendar_members m
    where m.calendar_id = xp_shared_calendar_events.calendar_id
      and m.user_id = (select auth.uid())
      and m.role = 'editor'
  )
)
with check (
  exists (
    select 1 from public.xp_shared_calendars c
    where c.id = calendar_id
      and c.owner_id = owner_id
      and (
        c.owner_id = (select auth.uid())
        or exists (
          select 1 from public.xp_calendar_members m
          where m.calendar_id = c.id
            and m.user_id = (select auth.uid())
            and m.role = 'editor'
        )
      )
  )
);

drop policy if exists "shared_calendar_events_delete" on public.xp_shared_calendar_events;
create policy "shared_calendar_events_delete"
on public.xp_shared_calendar_events for delete to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.xp_calendar_members m
    where m.calendar_id = xp_shared_calendar_events.calendar_id
      and m.user_id = (select auth.uid())
      and m.role = 'editor'
  )
);
