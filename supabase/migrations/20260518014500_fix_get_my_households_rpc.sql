create or replace function public.get_my_households()
returns table (
  id uuid,
  name text,
  role text,
  owner_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $get_my_households$
  select household.id,
         household.name,
         member.role,
         household.owner_id,
         household.created_at,
         household.updated_at
  from public.households household
  join public.household_members member on member.household_id = household.id
  where member.user_id = auth.uid()
    and member.deleted_at is null
    and household.deleted_at is null
  order by household.created_at asc;
$get_my_households$;

grant execute on function public.get_my_households() to authenticated;

notify pgrst, 'reload schema';
