create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $accept_pending_invitations$
declare
  accepted_count integer;
  user_email citext;
begin
  user_email := public.current_auth_email();

  if auth.uid() is null or user_email is null then
    return 0;
  end if;

  insert into public.household_members (household_id, user_id, email, role)
  select invitation.household_id, auth.uid(), user_email, invitation.role
  from public.household_invitations invitation
  where invitation.email = user_email
    and invitation.status = 'pending'
    and invitation.deleted_at is null
  on conflict (household_id, user_id) do update
    set deleted_at = null,
        email = excluded.email,
        role = case
          when public.household_members.role = 'owner' then public.household_members.role
          else excluded.role
        end,
        updated_at = now();

  update public.household_invitations
  set status = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where email = user_email
    and status = 'pending'
    and deleted_at is null;

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$accept_pending_invitations$;

grant execute on function public.accept_pending_invitations() to authenticated;

notify pgrst, 'reload schema';
