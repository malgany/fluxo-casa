create or replace function public.update_household_name(target_household_id uuid, household_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.is_household_admin(target_household_id) then
    raise exception 'not allowed';
  end if;

  clean_name := nullif(trim(household_name), '');
  if clean_name is null then
    raise exception 'household name is required';
  end if;

  update public.households
  set name = clean_name,
      updated_at = now()
  where id = target_household_id
    and deleted_at is null;

  if not found then
    raise exception 'household not found';
  end if;
end;
$$;

create or replace function public.remove_household_member(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.household_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select *
  into target_member
  from public.household_members
  where id = target_member_id
    and deleted_at is null;

  if target_member.id is null then
    raise exception 'member not found';
  end if;

  if not public.is_household_admin(target_member.household_id) then
    raise exception 'not allowed';
  end if;

  if target_member.role = 'owner' then
    raise exception 'owner cannot be removed';
  end if;

  if target_member.user_id = auth.uid() then
    raise exception 'cannot remove yourself';
  end if;

  update public.household_members
  set deleted_at = now(),
      updated_at = now()
  where id = target_member_id;
end;
$$;

grant execute on function public.update_household_name(uuid, text) to authenticated;
grant execute on function public.remove_household_member(uuid) to authenticated;

notify pgrst, 'reload schema';
