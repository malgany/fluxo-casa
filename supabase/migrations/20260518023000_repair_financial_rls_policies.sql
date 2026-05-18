create extension if not exists citext;

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

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.entries enable row level security;
alter table public.recurrences enable row level security;
alter table public.household_settings enable row level security;

grant usage on schema public to authenticated;
grant select on public.households to authenticated;
grant update on public.households to authenticated;
grant select on public.household_members to authenticated;
grant update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.household_invitations to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.recurrences to authenticated;
grant select, insert, update, delete on public.household_settings to authenticated;

drop policy if exists households_member_select on public.households;
create policy households_member_select on public.households
for select using (public.is_household_member(id));

drop policy if exists households_owner_update on public.households;
create policy households_owner_update on public.households
for update using (public.is_household_owner(id)) with check (public.is_household_owner(id));

drop policy if exists members_member_select on public.household_members;
create policy members_member_select on public.household_members
for select using (public.is_household_member(household_id));

drop policy if exists members_owner_update on public.household_members;
create policy members_owner_update on public.household_members
for update using (public.is_household_owner(household_id)) with check (public.is_household_owner(household_id));

drop policy if exists members_owner_delete on public.household_members;
create policy members_owner_delete on public.household_members
for delete using (public.is_household_owner(household_id));

drop policy if exists invitations_admin_select on public.household_invitations;
create policy invitations_admin_select on public.household_invitations
for select using (public.is_household_admin(household_id) or email = public.current_auth_email());

drop policy if exists invitations_admin_manage on public.household_invitations;
create policy invitations_admin_manage on public.household_invitations
for all using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));

drop policy if exists entries_member_manage on public.entries;
drop policy if exists entries_member_select on public.entries;
drop policy if exists entries_member_insert on public.entries;
drop policy if exists entries_member_update on public.entries;
drop policy if exists entries_member_delete on public.entries;
create policy entries_member_select on public.entries
for select using (public.is_household_member(household_id));
create policy entries_member_insert on public.entries
for insert with check (public.is_household_member(household_id));
create policy entries_member_update on public.entries
for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy entries_member_delete on public.entries
for delete using (public.is_household_member(household_id));

drop policy if exists recurrences_member_manage on public.recurrences;
drop policy if exists recurrences_member_select on public.recurrences;
drop policy if exists recurrences_member_insert on public.recurrences;
drop policy if exists recurrences_member_update on public.recurrences;
drop policy if exists recurrences_member_delete on public.recurrences;
create policy recurrences_member_select on public.recurrences
for select using (public.is_household_member(household_id));
create policy recurrences_member_insert on public.recurrences
for insert with check (public.is_household_member(household_id));
create policy recurrences_member_update on public.recurrences
for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy recurrences_member_delete on public.recurrences
for delete using (public.is_household_member(household_id));

drop policy if exists settings_member_manage on public.household_settings;
drop policy if exists settings_member_select on public.household_settings;
drop policy if exists settings_member_insert on public.household_settings;
drop policy if exists settings_member_update on public.household_settings;
drop policy if exists settings_member_delete on public.household_settings;
create policy settings_member_select on public.household_settings
for select using (public.is_household_member(household_id));
create policy settings_member_insert on public.household_settings
for insert with check (public.is_household_member(household_id));
create policy settings_member_update on public.household_settings
for update using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
create policy settings_member_delete on public.household_settings
for delete using (public.is_household_member(household_id));

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;
grant execute on function public.current_auth_email() to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;
grant execute on function public.get_my_households() to authenticated;

notify pgrst, 'reload schema';
