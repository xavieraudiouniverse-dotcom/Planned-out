revoke update on public.xp_shared_calendar_events from authenticated;
grant update(title, starts_at, ends_at, all_day, location, notes, updated_at)
  on public.xp_shared_calendar_events to authenticated;
