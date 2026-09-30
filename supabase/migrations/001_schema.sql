-- =====================================================================
-- Fathom Time: database schema, security rules and triggers
-- Run once in Supabase > SQL Editor on an empty project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------

create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  name             text not null default '',
  role             text not null default 'employee' check (role in ('boss', 'employee')),
  active           boolean not null default true,
  timezone         text not null default 'America/Chicago',
  -- Set by the app on first sign-in after checking BOSS_EMAILS (Phase 3).
  role_initialized boolean not null default false,
  created_at       timestamptz not null default now()
);

create table public.clients (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  archived   boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index clients_name_unique on public.clients (lower(trim(name)));

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  client_id        uuid references public.clients (id) on delete set null,
  color            text not null default '#00D6B3',
  type             text not null default 'client' check (type in ('client', 'internal')),
  billable_default boolean not null default true,
  archived         boolean not null default false,
  created_by       uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index projects_client_idx on public.projects (client_id);

-- Tasks double as stages for client projects.
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  archived     boolean not null default false,
  -- For future stage-based pay: efficiency = budget_hours / actual hours.
  budget_hours numeric(8, 2) check (budget_hours is null or budget_hours >= 0),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);
create unique index tasks_name_unique on public.tasks (project_id, lower(trim(name)));

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index tags_name_unique on public.tags (lower(trim(name)));

create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete restrict,
  description text not null default '',
  -- "restrict": a project or task with logged time cannot be deleted.
  project_id  uuid references public.projects (id) on delete restrict,
  task_id     uuid references public.tasks (id) on delete restrict,
  billable    boolean not null default false,
  start_at    timestamptz not null,
  end_at      timestamptz,               -- null means the timer is running
  tz          text,                      -- owner's time zone when recorded
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint end_after_start check (end_at is null or end_at >= start_at)
);
-- One running timer per person.
create unique index time_entries_one_running on public.time_entries (user_id) where end_at is null;
create index time_entries_user_start on public.time_entries (user_id, start_at desc);
create index time_entries_start on public.time_entries (start_at);
create index time_entries_project on public.time_entries (project_id);
create index time_entries_task on public.time_entries (task_id);

create table public.time_entry_tags (
  entry_id uuid not null references public.time_entries (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  primary key (entry_id, tag_id)
);
create index time_entry_tags_tag on public.time_entry_tags (tag_id);

create table public.favorites (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

-- Future, not built yet: stage-based pay.
-- create table public.contributions (
--   project_id uuid references public.projects (id),
--   task_id    uuid references public.tasks (id),
--   user_id    uuid references public.profiles (id),
--   percent    numeric(5, 2) check (percent between 0 and 100),
--   primary key (task_id, user_id)
-- );

-- ---------------------------------------------------------------------
-- 2. Helper functions
-- ---------------------------------------------------------------------

create or replace function public.is_boss()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'boss' and active
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

-- ---------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------

-- 3a. Create a profile when someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3b. Guard profile changes.
-- Signed-in users (auth.uid() is set) follow these rules. The SQL Editor
-- and the server's secret key (auth.uid() is null) are trusted.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id <> old.id or new.email <> old.email
     or new.created_at <> old.created_at
     or new.role_initialized <> old.role_initialized then
    raise exception 'These profile fields cannot be changed.';
  end if;

  if new.role <> old.role or new.active <> old.active then
    if not public.is_boss() then
      raise exception 'Only the boss can change roles or deactivate people.';
    end if;
    if old.id = auth.uid() then
      raise exception 'You cannot change your own role or deactivate yourself.';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- 3c. Only the boss can archive or restore clients, projects and tasks.
create or replace function public.guard_archive()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.archived is distinct from old.archived
     and not public.is_boss() then
    raise exception 'Only the boss can archive or restore.';
  end if;
  return new;
end;
$$;

create trigger clients_guard_archive before update on public.clients
  for each row execute function public.guard_archive();
create trigger projects_guard_archive before update on public.projects
  for each row execute function public.guard_archive();
create trigger tasks_guard_archive before update on public.tasks
  for each row execute function public.guard_archive();

-- 3d. "Created by" always records the real person and never changes.
create or replace function public.stamp_created_by()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    else
      new.created_by := old.created_by;
    end if;
  end if;
  return new;
end;
$$;

create trigger clients_created_by before insert or update on public.clients
  for each row execute function public.stamp_created_by();
create trigger projects_created_by before insert or update on public.projects
  for each row execute function public.stamp_created_by();
create trigger tags_created_by before insert or update on public.tags
  for each row execute function public.stamp_created_by();

-- 3e. Time entry bookkeeping:
--   * stamps created_by / updated_by / updated_at from the signed-in user,
--     so "Edited by" cannot be faked from the browser
--   * fills tz from the owner's profile
--   * checks that a task belongs to the entry's project
--   * starting a new timer stops that person's running one
create or replace function public.time_entry_before_write()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  task_project uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.updated_by := auth.uid();
      new.created_at := now();
      new.updated_at := now();
    else
      new.created_by := coalesce(new.created_by, new.user_id);
      new.updated_by := coalesce(new.updated_by, new.created_by);
    end if;
    if new.tz is null then
      select p.timezone into new.tz from public.profiles p where p.id = new.user_id;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if auth.uid() is not null then
      new.updated_by := auth.uid();
      new.updated_at := now();
    end if;
  end if;

  if new.task_id is not null then
    select t.project_id into task_project from public.tasks t where t.id = new.task_id;
    if new.project_id is null then
      new.project_id := task_project;
    elsif new.project_id <> task_project then
      raise exception 'That task belongs to a different project.';
    end if;
  end if;

  -- A new running timer closes the old one for the same person.
  if new.end_at is null
     and (tg_op = 'INSERT' or old.end_at is not null) then
    update public.time_entries
       set end_at = greatest(start_at, least(now(), new.start_at))
     where user_id = new.user_id
       and end_at is null
       and id <> new.id;
  end if;

  return new;
end;
$$;

create trigger time_entries_before_write
  before insert or update on public.time_entries
  for each row execute function public.time_entry_before_write();

-- ---------------------------------------------------------------------
-- 4. Row-Level Security
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.clients         enable row level security;
alter table public.projects        enable row level security;
alter table public.tasks           enable row level security;
alter table public.tags            enable row level security;
alter table public.time_entries    enable row level security;
alter table public.time_entry_tags enable row level security;
alter table public.favorites       enable row level security;

-- Profiles: active people can see everyone's name. You can always see
-- your own row (so the app can tell a deactivated person why they're out).
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_active_user() and (id = auth.uid() or public.is_boss()))
  with check (public.is_active_user() and (id = auth.uid() or public.is_boss()));

-- Clients, projects, tasks: everyone reads, creates and edits; only the boss deletes.
create policy clients_select on public.clients for select to authenticated
  using (public.is_active_user());
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_active_user());
create policy clients_update on public.clients for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_boss());

create policy projects_select on public.projects for select to authenticated
  using (public.is_active_user());
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_active_user());
create policy projects_update on public.projects for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_boss());

create policy tasks_select on public.tasks for select to authenticated
  using (public.is_active_user());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_active_user());
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_boss());

-- Tags are shared company-wide; anyone can create, rename or delete.
create policy tags_all on public.tags for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- Time entries: your own, or anyone's if you're the boss.
create policy entries_select on public.time_entries for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_boss()));
create policy entries_insert on public.time_entries for insert to authenticated
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_boss()));
create policy entries_update on public.time_entries for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_boss()))
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_boss()));
create policy entries_delete on public.time_entries for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_boss()));

-- Entry tags follow the entry they belong to.
create policy entry_tags_all on public.time_entry_tags for all to authenticated
  using (exists (
    select 1 from public.time_entries e
    where e.id = entry_id
      and public.is_active_user()
      and (e.user_id = auth.uid() or public.is_boss())
  ))
  with check (exists (
    select 1 from public.time_entries e
    where e.id = entry_id
      and public.is_active_user()
      and (e.user_id = auth.uid() or public.is_boss())
  ));

-- Favorites are personal.
create policy favorites_all on public.favorites for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

-- ---------------------------------------------------------------------
-- 5. Permissions
-- Signed-out visitors get nothing. Signed-in users get table access,
-- limited row by row by the policies above.
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, public;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.clients, public.projects, public.tasks, public.tags,
  public.time_entries, public.time_entry_tags, public.favorites
  to authenticated;

grant execute on function public.is_boss() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------------
-- 6. Anyone who signed in before this script ran gets a profile too.
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, name)
select u.id,
       lower(coalesce(u.email, '')),
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''),
                nullif(u.raw_user_meta_data ->> 'name', ''),
                split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;
