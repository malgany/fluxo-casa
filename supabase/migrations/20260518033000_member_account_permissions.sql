create or replace function public.delete_household(target_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $delete_household$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_household_admin(target_household_id) then
    raise exception 'only account managers can delete this account';
  end if;

  update public.households
  set deleted_at = now(),
      updated_at = now()
  where id = target_household_id
    and deleted_at is null;

  if not found then
    raise exception 'account not found';
  end if;

  update public.household_members
  set deleted_at = now(),
      updated_at = now()
  where household_id = target_household_id
    and deleted_at is null;

  update public.household_invitations
  set status = 'revoked',
      deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where household_id = target_household_id
    and deleted_at is null;

  update public.entries
  set deleted_at = now(),
      updated_at = now()
  where household_id = target_household_id
    and deleted_at is null;

  update public.recurrences
  set deleted_at = now(),
      updated_at = now()
  where household_id = target_household_id
    and deleted_at is null;

  update public.household_settings
  set deleted_at = now(),
      updated_at = now()
  where household_id = target_household_id
    and deleted_at is null;
end;
$delete_household$;

drop policy if exists households_owner_update on public.households;
drop policy if exists households_admin_update on public.households;
create policy households_admin_update on public.households
for update using (public.is_household_admin(id)) with check (public.is_household_admin(id));

drop policy if exists members_owner_update on public.household_members;
drop policy if exists members_admin_update on public.household_members;
create policy members_admin_update on public.household_members
for update using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));

drop policy if exists members_owner_delete on public.household_members;
drop policy if exists members_admin_delete on public.household_members;
create policy members_admin_delete on public.household_members
for delete using (public.is_household_admin(household_id));

drop policy if exists settings_member_manage on public.household_settings;
drop policy if exists settings_member_select on public.household_settings;
drop policy if exists settings_member_insert on public.household_settings;
drop policy if exists settings_member_update on public.household_settings;
drop policy if exists settings_member_delete on public.household_settings;
drop policy if exists settings_admin_insert on public.household_settings;
drop policy if exists settings_admin_update on public.household_settings;
drop policy if exists settings_admin_delete on public.household_settings;

create policy settings_member_select on public.household_settings
for select using (public.is_household_member(household_id));
create policy settings_admin_insert on public.household_settings
for insert with check (public.is_household_admin(household_id));
create policy settings_admin_update on public.household_settings
for update using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));
create policy settings_admin_delete on public.household_settings
for delete using (public.is_household_admin(household_id));

grant execute on function public.delete_household(uuid) to authenticated;

notify pgrst, 'reload schema';
