alter table public.xp_calendar_members
  add column if not exists member_email text not null default '';

revoke update on public.xp_calendar_members from authenticated;
grant update(role) on public.xp_calendar_members to authenticated;

drop policy if exists "calendar_members_insert" on public.xp_calendar_members;
create policy "calendar_members_insert"
on public.xp_calendar_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and lower(member_email) = lower(coalesce(((select auth.jwt())->>'email'), ''))
  and exists (
    select 1 from public.xp_calendar_invites i
    where i.calendar_id = xp_calendar_members.calendar_id
      and i.owner_id = xp_calendar_members.owner_id
      and i.role = xp_calendar_members.role
      and i.expires_at > now()
      and lower(i.invitee_email) = lower(coalesce(((select auth.jwt())->>'email'), ''))
  )
);
