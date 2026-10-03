-- =====================================================================
-- Fathom Time: 003 Director / Manager / Analyst
-- Run in the Supabase SQL Editor, after 002_manager_role.sql.
--
-- Roles after this:
--   director  (was boss) everything. Fixed: can't be given, taken away
--             or deactivated in the app.
--   manager   Team Overview, everyone's time (see and edit), budgets,
--             imports. Can deactivate / reactivate analysts only.
--   analyst   (was employee) their own time.
-- Everyone can add, edit, archive and delete projects, tasks and clients.
-- Only the director moves people between manager and analyst.
-- =====================================================================

-- 1. Rename the roles.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'director' where role = 'boss';
update public.profiles set role = 'analyst'  where role = 'employee';
alter table public.profiles
  add constraint profiles_role_check check (role in ('director', 'manager', 'analyst'));
alter table public.profiles alter column role set default 'analyst';

-- 2. Helpers.
create or replace function public.is_director()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'director' and active
  );
$$;

-- Director or manager: sees and edits everyone's time.
create or replace function public.is_lead()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('director', 'manager') and active
  );
$$;

grant execute on function public.is_director() to authenticated;
grant execute on function public.is_lead() to authenticated;

-- 3. Who may change roles and access.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  actor_role text;
begin
  -- SQL Editor and the server's secret key are trusted.
  if auth.uid() is null then
    return new;
  end if;

  if new.id <> old.id or new.email <> old.email
     or new.created_at <> old.created_at
     or new.role_initialized <> old.role_initialized then
    raise exception 'These profile fields cannot be changed.';
  end if;

  select p.role into actor_role from public.profiles p where p.id = auth.uid() and p.active;

  if new.role <> old.role then
    if actor_role is distinct from 'director' then
      raise exception 'Only the Director can change roles.';
    end if;
    if old.role = 'director' or new.role = 'director' then
      raise exception 'The Director role can''t be given or taken away in the app.';
    end if;
  end if;

  if new.active <> old.active then
    if old.id = auth.uid() then
      raise exception 'You cannot deactivate yourself.';
    end if;
    if old.role = 'director' then
      raise exception 'The Director can''t be deactivated.';
    end if;
    if not (actor_role = 'director' or (actor_role = 'manager' and old.role = 'analyst')) then
      raise exception 'You can''t change this person''s access.';
    end if;
  end if;

  return new;
end;
$$;

-- 4. Directors and managers see and edit everyone's time.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_active_user() and (id = auth.uid() or public.is_lead()))
  with check (public.is_active_user() and (id = auth.uid() or public.is_lead()));

drop policy if exists entries_select on public.time_entries;
drop policy if exists entries_insert on public.time_entries;
drop policy if exists entries_update on public.time_entries;
drop policy if exists entries_delete on public.time_entries;
create policy entries_select on public.time_entries for select to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_lead()));
create policy entries_insert on public.time_entries for insert to authenticated
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_lead()));
create policy entries_update on public.time_entries for update to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_lead()))
  with check (public.is_active_user() and (user_id = auth.uid() or public.is_lead()));
create policy entries_delete on public.time_entries for delete to authenticated
  using (public.is_active_user() and (user_id = auth.uid() or public.is_lead()));

drop policy if exists entry_tags_all on public.time_entry_tags;
create policy entry_tags_all on public.time_entry_tags for all to authenticated
  using (exists (
    select 1 from public.time_entries e
    where e.id = entry_id
      and public.is_active_user()
      and (e.user_id = auth.uid() or public.is_lead())
  ))
  with check (exists (
    select 1 from public.time_entries e
    where e.id = entry_id
      and public.is_active_user()
      and (e.user_id = auth.uid() or public.is_lead())
  ));

-- 5. Everyone can add, edit, archive and delete clients, projects, tasks.
--    (Deleting one that has time is still blocked by the database.)
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_active_user());
create policy clients_update on public.clients for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy clients_delete on public.clients for delete to authenticated
  using (public.is_active_user());

drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_active_user());
create policy projects_update on public.projects for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_active_user());

drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_active_user());
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_active_user());

drop trigger if exists clients_guard_archive on public.clients;
drop trigger if exists projects_guard_archive on public.projects;
drop trigger if exists tasks_guard_archive on public.tasks;

-- 6. Project hours: directors and managers get everyone's totals.
create or replace function public.project_hours()
returns table (project_id uuid, task_id uuid, seconds double precision)
language sql stable security definer set search_path = ''
as $$
  select e.project_id, e.task_id, sum(extract(epoch from (e.end_at - e.start_at)))::double precision
  from public.time_entries e
  where e.end_at is not null
    and e.project_id is not null
    and public.is_active_user()
    and (public.is_lead() or e.user_id = auth.uid())
  group by e.project_id, e.task_id;
$$;

-- 7. Old helpers nothing uses any more.
drop function if exists public.guard_archive();
drop function if exists public.can_manage_projects();
drop function if exists public.is_boss();
