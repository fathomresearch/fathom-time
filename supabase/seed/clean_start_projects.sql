-- =====================================================================
-- Fresh start for client / project / task names (after undoing imports).
-- Run in the Supabase SQL Editor in two steps.
--
-- Deletes:  clients, projects and tasks with no time on them, and the
--           remembered import matches for clients, projects and tasks
--           (so the final import asks about every name again).
-- Keeps:    every project with time on it (e.g. what the team logs now)
--           and all its tasks; projects with a budget; clients still
--           used by a kept project; all people and their name matches;
--           tags; all time entries.
--
-- STEP 1: select from "STEP 1" down to "END STEP 1" and click Run.
--         Nothing is changed. It lists what would be deleted or kept,
--         plus the entries typed into Fathom Time before today.
-- STEP 2: select from "STEP 2" to the end and click Run.
-- =====================================================================

-- STEP 1 (preview) ----------------------------------------------------
with
used as (
  select distinct project_id from public.time_entries where project_id is not null
),
budgeted as (
  select t.project_id from public.task_budgets b join public.tasks t on t.id = b.task_id
  union
  select project_id from public.project_budgets
),
doomed as (
  select p.* from public.projects p
  where p.id not in (select project_id from used)
    and p.id not in (select project_id from budgeted)
),
kept as (
  select p.* from public.projects p where p.id not in (select id from doomed)
)
select '1 delete project' as what, d.name as name,
       coalesce(c.name, 'No client') as detail
from doomed d left join public.clients c on c.id = d.client_id
union all
select '2 keep project', k.name,
       coalesce(c.name, 'No client') || case when k.id in (select project_id from used)
         then ' · has time' else ' · has a budget' end
from kept k left join public.clients c on c.id = k.client_id
union all
select '3 delete client', c.name, ''
from public.clients c
where not exists (select 1 from kept k where k.client_id = c.id)
union all
select '4 remembered import matches to clear', kind, count(*)::text
from public.import_mappings group by kind
union all
select '5 typed-in entry before today', coalesce(nullif(pr.name, ''), pr.email) || ' · ' || to_char(e.start_at, 'Mon DD, YYYY'),
       coalesce(pj.name, 'No project') || ' · '
         || round(extract(epoch from (coalesce(e.end_at, now()) - e.start_at)) / 3600, 2) || 'h'
from public.time_entries e
left join public.profiles pr on pr.id = e.user_id
left join public.projects pj on pj.id = e.project_id
where e.source is null and e.start_at < current_date
order by 1, 2;
-- END STEP 1 ------------------------------------------------------------


-- STEP 2 (delete) -------------------------------------------------------
begin;

create temporary table doomed_projects on commit drop as
select p.id from public.projects p
where not exists (select 1 from public.time_entries e where e.project_id = p.id)
  and not exists (select 1 from public.task_budgets b join public.tasks t on t.id = b.task_id where t.project_id = p.id)
  and not exists (select 1 from public.project_budgets pb where pb.project_id = p.id);

-- Tasks, favorites and levels go with their project (on delete cascade).
delete from public.projects where id in (select id from doomed_projects);

delete from public.clients c
where not exists (select 1 from public.projects p where p.client_id = c.id);

delete from public.import_mappings;

commit;

select
  (select count(*) from public.projects) as projects_left,
  (select count(*) from public.tasks)    as tasks_left,
  (select count(*) from public.clients)  as clients_left,
  (select count(*) from public.import_mappings) as import_matches_left,
  (select count(*) from public.time_entries) as time_entries_untouched,
  (select count(*) from public.profiles) as people_untouched;
