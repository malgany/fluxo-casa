create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email citext,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, user_id)
);

create table if not exists public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email citext not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (household_id, email)
);

create table if not exists public.entries (
  id text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  title text not null,
  icon_id text,
  amount numeric(14, 2) not null,
  date date not null,
  recurrence_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists public.recurrences (
  id text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('in', 'out')),
  title text not null,
  icon_id text,
  amount numeric(14, 2) not null,
  day_of_month integer not null check (day_of_month between 1 and 31),
  starts_on date not null,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create table if not exists public.household_settings (
  id text primary key,
  household_id uuid not null references public.households(id) on delete cascade unique,
  opening_balance numeric(14, 2) not null default 0,
  opening_date date not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create index if not exists idx_entries_household_updated_at on public.entries(household_id, updated_at);
create index if not exists idx_entries_household_date on public.entries(household_id, date);
create index if not exists idx_recurrences_household_updated_at on public.recurrences(household_id, updated_at);
create index if not exists idx_settings_household_updated_at on public.household_settings(household_id, updated_at);
create index if not exists idx_members_household on public.household_members(household_id);
create index if not exists idx_invitations_email_status on public.household_invitations(email, status);

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.entries enable row level security;
alter table public.recurrences enable row level security;
alter table public.household_settings enable row level security;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and deleted_at is null
  );
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and deleted_at is null
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = target_household_id
      and user_id = auth.uid()
      and role = 'owner'
      and deleted_at is null
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household_id uuid;
  clean_name text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  clean_name := nullif(trim(household_name), '');
  insert into public.households (name, owner_id)
  values (coalesce(clean_name, 'Minha casa'), auth.uid())
  returning id into new_household_id;

  insert into public.household_members (household_id, user_id, email, role)
  values (new_household_id, auth.uid(), auth.email(), 'owner');

  insert into public.household_settings (id, household_id, opening_balance, opening_date, created_at, updated_at)
  values ('settings_' || new_household_id::text, new_household_id, 0, date_trunc('month', now())::date, now(), now());

  return new_household_id;
end;
$$;

create or replace function public.accept_pending_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  accepted_count integer;
begin
  if auth.uid() is null or auth.email() is null then
    return 0;
  end if;

  insert into public.household_members (household_id, user_id, email, role)
  select invitation.household_id, auth.uid(), auth.email(), invitation.role
  from public.household_invitations invitation
  where invitation.email = auth.email()::citext
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
  where email = auth.email()::citext
    and status = 'pending'
    and deleted_at is null;

  get diagnostics accepted_count = row_count;
  return accepted_count;
end;
$$;

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
as $$
  select household.id, household.name, member.role, household.owner_id, household.created_at, household.updated_at
  from public.households household
  join public.household_members member on member.household_id = household.id
  where member.user_id = auth.uid()
    and member.deleted_at is null
    and household.deleted_at is null
  order by household.created_at asc;
$$;

drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
for select using (auth.uid() = id);

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
for insert with check (auth.uid() = id);

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
for select using (public.is_household_admin(household_id) or email = auth.email()::citext);

drop policy if exists invitations_admin_manage on public.household_invitations;
create policy invitations_admin_manage on public.household_invitations
for all using (public.is_household_admin(household_id)) with check (public.is_household_admin(household_id));

drop policy if exists entries_member_manage on public.entries;
create policy entries_member_manage on public.entries
for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists recurrences_member_manage on public.recurrences;
create policy recurrences_member_manage on public.recurrences
for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists settings_member_manage on public.household_settings;
create policy settings_member_manage on public.household_settings
for all using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;
grant execute on function public.get_my_households() to authenticated;

notify pgrst, 'reload schema';
