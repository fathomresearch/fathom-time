-- =====================================================================
-- Fathom Time: 004 Budgets and all-time project report
-- Run in the Supabase SQL Editor, after 003.
--
--   task_budgets     budgeted hours per task and level
--   project_budgets  who last changed a project's budget, and when
--   project_levels   each person's level on a project, saved the first
--                    time they log time on it (promotions only affect
--                    new projects)
--   time_report()    totals by project, task and person, optional range
-- All of these are for directors and managers only.
-- =====================================================================

-- 1. Tables.
create table if not exists public.task_budgets (
  task_id uuid not null references public.tasks (id) on delete cascade,
  level   text not null check (level in ('director', 'manager', 'analyst')),
  hours   numeric(8, 2) not null check (hours >= 0),
  primary key (task_id, level)
);

create table if not exists public.project_budgets (
  project_id uuid primary key references public.projects (id) on delete cascade,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid()
);

create table if not exists public.project_levels (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  level      text not null check (level in ('director', 'manager', 'analyst')),
  primary key (project_id, user_id)
);

alter table public.task_budgets    enable row level security;
alter table public.project_budgets enable row level security;
alter table public.project_levels  enable row level security;

drop policy if exists task_budgets_all on public.task_budgets;
drop policy if exists project_budgets_all on public.project_budgets;
drop policy if exists project_levels_all on public.project_levels;
create policy task_budgets_all on public.task_budgets for all to authenticated
  using (public.is_lead()) with check (public.is_lead());
create policy project_budgets_all on public.project_budgets for all to authenticated
  using (public.is_lead()) with check (public.is_lead());
create policy project_levels_all on public.project_levels for all to authenticated
  using (public.is_lead()) with check (public.is_lead());

grant select, insert, update, delete on
  public.task_budgets, public.project_budgets, public.project_levels to authenticated;
grant all on public.task_budgets, public.project_budgets, public.project_levels to service_role;

-- 2. Remember a person's level the first time they log time on a project.
--    Runs as the owner so it works whoever logs the time.
create or replace function public.remember_project_level()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.project_id is not null then
    insert into public.project_levels (project_id, user_id, level)
    select new.project_id, new.user_id, p.role from public.profiles p where p.id = new.user_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists time_entries_remember_level on public.time_entries;
create trigger time_entries_remember_level
  after insert or update of project_id on public.time_entries
  for each row execute function public.remember_project_level();

-- Existing time: use each person's current role.
insert into public.project_levels (project_id, user_id, level)
select distinct e.project_id, e.user_id, p.role
from public.time_entries e join public.profiles p on p.id = e.user_id
where e.project_id is not null
on conflict do nothing;

-- 3. Replace a project's whole budget in one step.
--    rows: [{"task_id": "...", "director": 1.5, "manager": 2, "analyst": 0}, ...]
create or replace function public.replace_project_budget(p_project uuid, p_rows jsonb)
returns void
language plpgsql set search_path = ''
as $$
begin
  if not public.is_lead() then
    raise exception 'Only the Director and Managers can change budgets.';
  end if;
  delete from public.task_budgets b
  using public.tasks t
  where b.task_id = t.id and t.project_id = p_project;

  insert into public.task_budgets (task_id, level, hours)
  select (r ->> 'task_id')::uuid, l.level, (r ->> l.level)::numeric
  from jsonb_array_elements(p_rows) r
  cross join (values ('director'), ('manager'), ('analyst')) as l(level)
  join public.tasks t on t.id = (r ->> 'task_id')::uuid and t.project_id = p_project
  where coalesce((r ->> l.level)::numeric, 0) > 0;

  insert into public.project_budgets (project_id, updated_at, updated_by)
  values (p_project, now(), auth.uid())
  on conflict (project_id) do update set updated_at = now(), updated_by = auth.uid();
end;
$$;

-- One cell: set (or clear, with 0) the hours for a task and level.
create or replace function public.set_task_budget(p_task uuid, p_level text, p_hours numeric)
returns void
language plpgsql set search_path = ''
as $$
declare
  proj uuid;
begin
  if not public.is_lead() then
    raise exception 'Only the Director and Managers can change budgets.';
  end if;
  select t.project_id into proj from public.tasks t where t.id = p_task;
  if coalesce(p_hours, 0) <= 0 then
    delete from public.task_budgets where task_id = p_task and level = p_level;
  else
    insert into public.task_budgets (task_id, level, hours) values (p_task, p_level, p_hours)
    on conflict (task_id, level) do update set hours = excluded.hours;
  end if;
  insert into public.project_budgets (project_id, updated_at, updated_by)
  values (proj, now(), auth.uid())
  on conflict (project_id) do update set updated_at = now(), updated_by = auth.uid();
end;
$$;

revoke execute on function public.replace_project_budget(uuid, jsonb) from public, anon;
revoke execute on function public.set_task_budget(uuid, text, numeric) from public, anon;
revoke execute on function public.remember_project_level() from public, anon;
grant execute on function public.replace_project_budget(uuid, jsonb) to authenticated;
grant execute on function public.set_task_budget(uuid, text, numeric) to authenticated;

-- 4. Totals by project, task and person. Optional range and project.
--    Running timers are left out. Directors and managers only.
create or replace function public.time_report(
  from_ts timestamptz default null,
  to_ts timestamptz default null,
  only_project uuid default null
)
returns table (project_id uuid, task_id uuid, user_id uuid, seconds double precision)
language sql stable security definer set search_path = ''
as $$
  select e.project_id, e.task_id, e.user_id,
         sum(extract(epoch from (e.end_at - e.start_at)))::double precision
  from public.time_entries e
  where e.end_at is not null
    and public.is_lead()
    and (from_ts is null or e.start_at >= from_ts)
    and (to_ts is null or e.start_at < to_ts)
    and (only_project is null or e.project_id = only_project)
  group by e.project_id, e.task_id, e.user_id;
$$;
revoke execute on function public.time_report(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.time_report(timestamptz, timestamptz, uuid) to authenticated;
