create or replace function public.current_auth_email()
returns citext
language sql
stable
set search_path = public
as $current_auth_email$
  select nullif(auth.jwt() ->> 'email', '')::citext;
$current_auth_email$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_household_member$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and deleted_at is null
  );
$is_household_member$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_household_admin$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and deleted_at is null
  );
$is_household_admin$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_household_owner$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
      and deleted_at is null
  );
$is_household_owner$;

create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_household$
declare
  new_household_id uuid;
  clean_name text;
  user_email citext;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  user_email := public.current_auth_email();
  clean_name := nullif(trim(household_name), '');

  insert into public.households (name, owner_id)
  values (coalesce(clean_name, 'Minha casa'), auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, email, role)
  values (new_household_id, auth.uid(), user_email, 'owner');

  insert into public.household_settings (id, household_id, opening_balance, opening_date, created_at, updated_at)
  values ('settings_' || new_household_id::text, new_household_id, 0, date_trunc('month', now())::date, now(), now());

  return new_household_id;
end;
$create_household$;

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

drop policy if exists invitations_admin_select on public.household_invitations;
create policy invitations_admin_select on public.household_invitations
for select using (public.is_household_admin(household_id) or email = public.current_auth_email());

grant execute on function public.current_auth_email() to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;

notify pgrst, 'reload schema';
