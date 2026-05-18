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

  if not public.is_household_owner(target_household_id) then
    raise exception 'only the owner can delete this account';
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

grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.delete_household(uuid) to authenticated;

notify pgrst, 'reload schema';
