alter table public.xp_calendar_invites
  add column if not exists calendar_name text not null default 'Shared calendar';
