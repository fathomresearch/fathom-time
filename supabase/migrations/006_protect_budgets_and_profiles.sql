-- =====================================================================
-- Fathom Time: 006 Protect budgets and other people's profiles
-- Run in the Supabase SQL Editor, after 005.
--
-- 1. A project or task that has a budget can only be deleted by the
--    Director or a Manager (deleting it would delete the budget too).
--    Anyone can still delete projects and tasks without a budget.
-- 2. Name and time zone: you can change your own; the Director can change
--    anyone's. Managers can only deactivate / reactivate analysts.
-- =====================================================================

-- 1. Budgets survive deletes by analysts.
create or replace function public.guard_budget_delete()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_lead() then
    return old;
  end if;
  if tg_table_name = 'tasks' then
    if exists (select 1 from public.task_budgets b where b.task_id = old.id) then
      raise exception 'This task has a budget. Ask the Director or a Manager to delete it.';
    end if;
  else
    if exists (
      select 1 from public.task_budgets b join public.tasks t on t.id = b.task_id
      where t.project_id = old.id
    ) then
      raise exception 'This project has a budget. Ask the Director or a Manager to delete it.';
    end if;
  end if;
  return old;
end;
$$;

-- The check reads budget tables, which analysts can't see, so it runs as the owner.
alter function public.guard_budget_delete() security definer;
revoke execute on function public.guard_budget_delete() from public, anon;

drop trigger if exists tasks_guard_budget_delete on public.tasks;
create trigger tasks_guard_budget_delete before delete on public.tasks
  for each row execute function public.guard_budget_delete();
drop trigger if exists projects_guard_budget_delete on public.projects;
create trigger projects_guard_budget_delete before delete on public.projects
  for each row execute function public.guard_budget_delete();

-- 2. Profile changes: same rules as 003, plus name and time zone.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  actor_role text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id <> old.id or new.email <> old.email
     or new.created_at <> old.created_at
     or new.role_initialized <> old.role_initialized then
    raise exception 'These profile fields cannot be changed.';
  end if;

  select p.role into actor_role from public.profiles p where p.id = auth.uid() and p.active;

  if (new.name is distinct from old.name or new.timezone is distinct from old.timezone)
     and old.id <> auth.uid() and actor_role is distinct from 'director' then
    raise exception 'Only the Director can change someone else''s name or time zone.';
  end if;

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
