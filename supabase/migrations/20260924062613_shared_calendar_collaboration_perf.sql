create index if not exists xp_shared_calendar_events_owner_idx
  on public.xp_shared_calendar_events(owner_id);

drop policy if exists "calendar_invites_select" on public.xp_calendar_invites;
create policy "calendar_invites_select"
on public.xp_calendar_invites for select to authenticated
using (
  owner_id = (select auth.uid())
  or lower(invitee_email) = lower(coalesce(((select auth.jwt())->>'email'), ''))
);

drop policy if exists "calendar_invites_delete" on public.xp_calendar_invites;
create policy "calendar_invites_delete"
on public.xp_calendar_invites for delete to authenticated
using (
  owner_id = (select auth.uid())
  or lower(invitee_email) = lower(coalesce(((select auth.jwt())->>'email'), ''))
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
      and lower(i.invitee_email) = lower(coalesce(((select auth.jwt())->>'email'), ''))
  )
);
