-- =====================================================================
-- Fathom Time: 002 Manager role
-- Run in the Supabase SQL Editor, after 001_schema.sql.
-- Safe to run again: it replaces what an earlier run created.
--
-- Roles after this:
--   boss      everything (unchanged)
--   manager   like an employee, plus: add, edit, archive and delete
--             projects, tasks and clients. Sees only their own time.
--   employee  only picks existing projects and tasks; can view the
--             project list
-- Tags stay open to everyone.
-- =====================================================================

-- 1. Allow the new role.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('boss', 'manager', 'employee'));

-- 2. Who may change projects, tasks and clients.
create or replace function public.can_manage_projects()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('boss', 'manager') and active
  );
$$;
grant execute on function public.can_manage_projects() to authenticated;

-- 3. Only boss and manager can add, edit or delete clients, projects, tasks.
drop policy if exists clients_insert on public.clients;
drop policy if exists clients_update on public.clients;
drop policy if exists clients_delete on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (public.can_manage_projects());
create policy clients_update on public.clients for update to authenticated
  using (public.can_manage_projects()) with check (public.can_manage_projects());
create policy clients_delete on public.clients for delete to authenticated
  using (public.can_manage_projects());

drop policy if exists projects_insert on public.projects;
drop policy if exists projects_update on public.projects;
drop policy if exists projects_delete on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (public.can_manage_projects());
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_projects()) with check (public.can_manage_projects());
create policy projects_delete on public.projects for delete to authenticated
  using (public.can_manage_projects());

drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_manage_projects());
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_manage_projects()) with check (public.can_manage_projects());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_manage_projects());

-- 4. Archiving follows the same rule (boss or manager).
create or replace function public.guard_archive()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.archived is distinct from old.archived
     and not public.can_manage_projects() then
    raise exception 'Only the boss or a manager can archive or restore.';
  end if;
  return new;
end;
$$;

-- 5. Hours per project and task, all time, running timers left out.
--    The boss gets everyone's totals; everyone else only their own.
create or replace function public.project_hours()
returns table (project_id uuid, task_id uuid, seconds double precision)
language sql stable security definer set search_path = ''
as $$
  select e.project_id, e.task_id, sum(extract(epoch from (e.end_at - e.start_at)))::double precision
  from public.time_entries e
  where e.end_at is not null
    and e.project_id is not null
    and public.is_active_user()
    and (public.is_boss() or e.user_id = auth.uid())
  group by e.project_id, e.task_id;
$$;
revoke execute on function public.project_hours() from public, anon;
grant execute on function public.project_hours() to authenticated;
