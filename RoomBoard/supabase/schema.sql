create extension if not exists pgcrypto;

create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  practice_id uuid not null references public.practices (id) on delete cascade,
  full_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  name text not null,
  initials text not null,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  title text not null,
  color_hex text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.practice_feedback_items (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  text text not null,
  is_done boolean not null default false,
  created_by_user_id uuid null references auth.users (id) on delete set null,
  created_by_name text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.room_sessions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid null references public.practices (id) on delete cascade,
  room_name text not null,
  doctor_name text null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_ms bigint null check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cleaning_sessions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid null references public.practices (id) on delete cascade,
  room_name text not null,
  started_at timestamptz not null,
  ended_at timestamptz null,
  duration_ms bigint null check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.room_board_entries (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices (id) on delete cascade,
  room_id uuid not null unique references public.rooms (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.practice_board_state (
  practice_id uuid primary key references public.practices (id) on delete cascade,
  board_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.practice_settings (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null unique references public.practices (id) on delete cascade,
  board_columns integer not null default 3 check (board_columns between 1 and 6),
  show_only_active boolean not null default false,
  board_view text not null default 'grid' check (board_view in ('grid', 'list')),
  highlight_doctor_id uuid null references public.doctors (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.practice_settings
  add column if not exists default_appointment_type_id uuid null references public.appointment_types (id) on delete set null;

insert into public.practice_settings (practice_id)
select p.id
from public.practices p
where not exists (
  select 1
  from public.practice_settings ps
  where ps.practice_id = p.id
)
on conflict (practice_id) do nothing;

create index if not exists profiles_practice_id_idx on public.profiles (practice_id);
create index if not exists rooms_practice_id_idx on public.rooms (practice_id, sort_order);
create index if not exists doctors_practice_id_idx on public.doctors (practice_id, name);
create index if not exists appointment_types_practice_id_idx on public.appointment_types (practice_id, sort_order);
create index if not exists quick_notes_practice_id_idx on public.quick_notes (practice_id, sort_order);
create index if not exists practice_feedback_items_practice_id_idx on public.practice_feedback_items (practice_id, created_at desc);
create index if not exists room_sessions_practice_id_idx on public.room_sessions (practice_id, started_at desc);
create index if not exists cleaning_sessions_practice_id_idx on public.cleaning_sessions (practice_id, started_at desc);
create index if not exists room_board_entries_practice_id_idx on public.room_board_entries (practice_id, room_id);
create index if not exists practice_settings_practice_id_idx on public.practice_settings (practice_id);
create index if not exists practice_board_state_updated_at_idx on public.practice_board_state (updated_at desc);

create unique index if not exists rooms_practice_name_idx
  on public.rooms (practice_id, lower(name));

create unique index if not exists doctors_practice_name_idx
  on public.doctors (practice_id, lower(name));

create unique index if not exists appointment_types_practice_title_idx
  on public.appointment_types (practice_id, lower(title));

create unique index if not exists quick_notes_practice_label_idx
  on public.quick_notes (practice_id, lower(label));

create or replace function public.get_my_practice_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select practice_id
  from public.profiles
  where user_id = auth.uid()
  limit 1;
$$;

create or replace function public.is_practice_admin(target_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
      and practice_id = target_practice_id
      and role = 'admin'
  );
$$;

create or replace function public.get_server_now_iso()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select timezone('utc', now())::text;
$$;

alter table public.practices
  add column if not exists invite_code text;

create or replace function public.create_unique_practice_invite_code(exclude_practice_id uuid default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 10));
    exit when not exists (
      select 1
      from public.practices
      where invite_code = candidate
        and (exclude_practice_id is null or id <> exclude_practice_id)
    );
  end loop;
  return candidate;
end;
$$;

update public.practices
set invite_code = public.create_unique_practice_invite_code(id)
where coalesce(trim(invite_code), '') = '';

alter table public.practices
  alter column invite_code set not null;

create unique index if not exists practices_invite_code_idx
  on public.practices (invite_code);

create or replace function public.get_my_practice_invite_details()
returns table (
  practice_id uuid,
  practice_name text,
  invite_code text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.invite_code
  from public.practices p
  join public.profiles pr on pr.practice_id = p.id
  where pr.user_id = auth.uid()
    and pr.role = 'admin'
  limit 1;
$$;

create or replace function public.rotate_my_practice_invite_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_practice_id uuid;
  next_code text;
begin
  select practice_id
  into target_practice_id
  from public.profiles
  where user_id = auth.uid()
    and role = 'admin'
  limit 1;

  if target_practice_id is null then
    raise exception 'Only clinic admins can rotate invite codes.';
  end if;

  next_code := public.create_unique_practice_invite_code(target_practice_id);

  update public.practices
  set invite_code = next_code
  where id = target_practice_id;

  return next_code;
end;
$$;

create or replace function public.join_practice_with_invite_code(
  invite_code text,
  member_full_name text
)
returns table (
  practice_id uuid,
  practice_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_code text;
  target_practice public.practices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to join a practice.';
  end if;

  if trim(coalesce(member_full_name, '')) = '' then
    raise exception 'Full name is required.';
  end if;

  if exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
  ) then
    raise exception 'This user already belongs to a practice.';
  end if;

  normalized_code := upper(regexp_replace(coalesce(invite_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if normalized_code = '' then
    raise exception 'Invite code is required.';
  end if;

  select *
  into target_practice
  from public.practices
  where invite_code = normalized_code
  limit 1;

  if target_practice.id is null then
    raise exception 'That invite code was not recognized.';
  end if;

  insert into public.profiles (user_id, practice_id, full_name, role)
  values (auth.uid(), target_practice.id, trim(member_full_name), 'member');

  return query
  select target_practice.id, target_practice.name;
end;
$$;

create or replace function public.create_practice_with_admin(
  practice_name text,
  admin_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_practice_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a practice.';
  end if;

  if trim(coalesce(practice_name, '')) = '' then
    raise exception 'Practice name is required.';
  end if;

  if trim(coalesce(admin_full_name, '')) = '' then
    raise exception 'Admin full name is required.';
  end if;

  if exists (
    select 1
    from public.profiles
    where user_id = auth.uid()
  ) then
    raise exception 'This user already belongs to a practice.';
  end if;

  insert into public.practices (name)
  values (trim(practice_name))
  returning id into new_practice_id;

  insert into public.profiles (user_id, practice_id, full_name, role)
  values (auth.uid(), new_practice_id, trim(admin_full_name), 'admin');

  insert into public.practice_settings (practice_id)
  values (new_practice_id);

  return new_practice_id;
end;
$$;

grant execute on function public.get_my_practice_id() to authenticated;
grant execute on function public.is_practice_admin(uuid) to authenticated;
grant execute on function public.get_server_now_iso() to authenticated;
grant execute on function public.create_unique_practice_invite_code(uuid) to authenticated;
grant execute on function public.get_my_practice_invite_details() to authenticated;
grant execute on function public.rotate_my_practice_invite_code() to authenticated;
grant execute on function public.join_practice_with_invite_code(text, text) to authenticated;
grant execute on function public.create_practice_with_admin(text, text) to authenticated;

alter table public.practices enable row level security;
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.doctors enable row level security;
alter table public.appointment_types enable row level security;
alter table public.quick_notes enable row level security;
alter table public.practice_feedback_items enable row level security;
alter table public.room_sessions enable row level security;
alter table public.cleaning_sessions enable row level security;
alter table public.room_board_entries enable row level security;
alter table public.practice_board_state enable row level security;
alter table public.practice_settings enable row level security;

drop policy if exists "Practice members can view their practice" on public.practices;
create policy "Practice members can view their practice"
  on public.practices
  for select
  to authenticated
  using (id = public.get_my_practice_id());

drop policy if exists "Practice admins can update their practice" on public.practices;
create policy "Practice admins can update their practice"
  on public.practices
  for update
  to authenticated
  using (public.is_practice_admin(id))
  with check (public.is_practice_admin(id));

drop policy if exists "Practice members can view profiles in their practice" on public.profiles;
create policy "Practice members can view profiles in their practice"
  on public.profiles
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can view rooms in their practice" on public.rooms;
create policy "Practice members can view rooms in their practice"
  on public.rooms
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can view feedback in their practice" on public.practice_feedback_items;
create policy "Practice members can view feedback in their practice"
  on public.practice_feedback_items
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can insert feedback in their practice" on public.practice_feedback_items;
create policy "Practice members can insert feedback in their practice"
  on public.practice_feedback_items
  for insert
  to authenticated
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can update feedback in their practice" on public.practice_feedback_items;
create policy "Practice members can update feedback in their practice"
  on public.practice_feedback_items
  for update
  to authenticated
  using (practice_id = public.get_my_practice_id())
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can delete feedback in their practice" on public.practice_feedback_items;
create policy "Practice members can delete feedback in their practice"
  on public.practice_feedback_items
  for delete
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can view room sessions in their practice" on public.room_sessions;
create policy "Practice members can view room sessions in their practice"
  on public.room_sessions
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can insert room sessions in their practice" on public.room_sessions;
create policy "Practice members can insert room sessions in their practice"
  on public.room_sessions
  for insert
  to authenticated
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can update room sessions in their practice" on public.room_sessions;
create policy "Practice members can update room sessions in their practice"
  on public.room_sessions
  for update
  to authenticated
  using (practice_id = public.get_my_practice_id())
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can view cleaning sessions in their practice" on public.cleaning_sessions;
create policy "Practice members can view cleaning sessions in their practice"
  on public.cleaning_sessions
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can insert cleaning sessions in their practice" on public.cleaning_sessions;
create policy "Practice members can insert cleaning sessions in their practice"
  on public.cleaning_sessions
  for insert
  to authenticated
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can update cleaning sessions in their practice" on public.cleaning_sessions;
create policy "Practice members can update cleaning sessions in their practice"
  on public.cleaning_sessions
  for update
  to authenticated
  using (practice_id = public.get_my_practice_id())
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice admins can insert rooms in their practice" on public.rooms;
create policy "Practice admins can insert rooms in their practice"
  on public.rooms
  for insert
  to authenticated
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can update rooms in their practice" on public.rooms;
create policy "Practice admins can update rooms in their practice"
  on public.rooms
  for update
  to authenticated
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can delete rooms in their practice" on public.rooms;
create policy "Practice admins can delete rooms in their practice"
  on public.rooms
  for delete
  to authenticated
  using (public.is_practice_admin(practice_id));

drop policy if exists "Practice members can view doctors in their practice" on public.doctors;
create policy "Practice members can view doctors in their practice"
  on public.doctors
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice admins can insert doctors in their practice" on public.doctors;
create policy "Practice admins can insert doctors in their practice"
  on public.doctors
  for insert
  to authenticated
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can update doctors in their practice" on public.doctors;
create policy "Practice admins can update doctors in their practice"
  on public.doctors
  for update
  to authenticated
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can delete doctors in their practice" on public.doctors;
create policy "Practice admins can delete doctors in their practice"
  on public.doctors
  for delete
  to authenticated
  using (public.is_practice_admin(practice_id));

drop policy if exists "Practice members can view appointment types in their practice" on public.appointment_types;
create policy "Practice members can view appointment types in their practice"
  on public.appointment_types
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice admins can insert appointment types in their practice" on public.appointment_types;
create policy "Practice admins can insert appointment types in their practice"
  on public.appointment_types
  for insert
  to authenticated
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can update appointment types in their practice" on public.appointment_types;
create policy "Practice admins can update appointment types in their practice"
  on public.appointment_types
  for update
  to authenticated
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can delete appointment types in their practice" on public.appointment_types;
create policy "Practice admins can delete appointment types in their practice"
  on public.appointment_types
  for delete
  to authenticated
  using (public.is_practice_admin(practice_id));

drop policy if exists "Practice members can view quick notes in their practice" on public.quick_notes;
create policy "Practice members can view quick notes in their practice"
  on public.quick_notes
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice admins can insert quick notes in their practice" on public.quick_notes;
create policy "Practice admins can insert quick notes in their practice"
  on public.quick_notes
  for insert
  to authenticated
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can update quick notes in their practice" on public.quick_notes;
create policy "Practice admins can update quick notes in their practice"
  on public.quick_notes
  for update
  to authenticated
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can delete quick notes in their practice" on public.quick_notes;
create policy "Practice admins can delete quick notes in their practice"
  on public.quick_notes
  for delete
  to authenticated
  using (public.is_practice_admin(practice_id));

drop policy if exists "Practice members can view room board entries in their practice" on public.room_board_entries;
create policy "Practice members can view room board entries in their practice"
  on public.room_board_entries
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice admins can insert room board entries in their practice" on public.room_board_entries;
create policy "Practice admins can insert room board entries in their practice"
  on public.room_board_entries
  for insert
  to authenticated
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can update room board entries in their practice" on public.room_board_entries;
create policy "Practice admins can update room board entries in their practice"
  on public.room_board_entries
  for update
  to authenticated
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can delete room board entries in their practice" on public.room_board_entries;
create policy "Practice admins can delete room board entries in their practice"
  on public.room_board_entries
  for delete
  to authenticated
  using (public.is_practice_admin(practice_id));

drop policy if exists "Practice members can view board state in their practice" on public.practice_board_state;
create policy "Practice members can view board state in their practice"
  on public.practice_board_state
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can insert board state in their practice" on public.practice_board_state;
create policy "Practice members can insert board state in their practice"
  on public.practice_board_state
  for insert
  to authenticated
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can update board state in their practice" on public.practice_board_state;
create policy "Practice members can update board state in their practice"
  on public.practice_board_state
  for update
  to authenticated
  using (practice_id = public.get_my_practice_id())
  with check (practice_id = public.get_my_practice_id());

drop policy if exists "Practice members can view settings in their practice" on public.practice_settings;
create policy "Practice members can view settings in their practice"
  on public.practice_settings
  for select
  to authenticated
  using (practice_id = public.get_my_practice_id());

drop policy if exists "Practice admins can insert settings in their practice" on public.practice_settings;
create policy "Practice admins can insert settings in their practice"
  on public.practice_settings
  for insert
  to authenticated
  with check (public.is_practice_admin(practice_id));

drop policy if exists "Practice admins can update settings in their practice" on public.practice_settings;
create policy "Practice admins can update settings in their practice"
  on public.practice_settings
  for update
  to authenticated
  using (public.is_practice_admin(practice_id))
  with check (public.is_practice_admin(practice_id));

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists practice_settings_set_updated_at on public.practice_settings;
create trigger practice_settings_set_updated_at
before update on public.practice_settings
for each row
execute function public.update_updated_at_column();

drop trigger if exists room_board_entries_set_updated_at on public.room_board_entries;
create trigger room_board_entries_set_updated_at
before update on public.room_board_entries
for each row
execute function public.update_updated_at_column();

drop trigger if exists practice_board_state_set_updated_at on public.practice_board_state;
create trigger practice_board_state_set_updated_at
before update on public.practice_board_state
for each row
execute function public.update_updated_at_column();

comment on function public.create_practice_with_admin(text, text) is
  'Creates one practice and the first admin profile for the authenticated user.';

comment on function public.join_practice_with_invite_code(text, text) is
  'Links the authenticated user to an existing practice as a member using that clinic''s invite code.';

comment on table public.rooms is
  'Future board rows should continue to scope by practice_id and never by client-side route params alone.';

comment on table public.doctors is
  'Doctor rows stay tied to a practice so multiple clinics can share the same app safely.';

comment on table public.appointment_types is
  'Appointment types and room color labels are shared per practice so each clinic can keep its own board categories.';

comment on table public.quick_notes is
  'Quick note options are shared per practice for consistent dropdown choices across that clinic.';

comment on table public.room_board_entries is
  'Live per-room board state for each practice, including patient, flags, timers, and cleaning status.';

comment on table public.practice_board_state is
  'Shared serialized board state for each practice, used by the board UI and Pulse sync flows.';

comment on table public.practice_settings is
  'One settings row per practice keeps board preferences isolated between different RoomBoard accounts.';
