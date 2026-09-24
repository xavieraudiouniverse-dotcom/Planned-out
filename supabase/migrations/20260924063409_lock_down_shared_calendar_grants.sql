revoke all privileges on public.xp_shared_calendars from authenticated;
revoke all privileges on public.xp_calendar_invites from authenticated;
revoke all privileges on public.xp_calendar_members from authenticated;
revoke all privileges on public.xp_shared_calendar_events from authenticated;

grant select, insert, update, delete on public.xp_shared_calendars to authenticated;
grant select, insert, delete on public.xp_calendar_invites to authenticated;
grant select, insert, delete on public.xp_calendar_members to authenticated;
grant update(role) on public.xp_calendar_members to authenticated;
grant select, insert, delete on public.xp_shared_calendar_events to authenticated;
grant update(title, starts_at, ends_at, all_day, location, notes, updated_at)
  on public.xp_shared_calendar_events to authenticated;
