-- =====================================================================
-- Removes ALL demo data: the demo people and their entries, plus the
-- demo clients, projects, tasks and tags.
--
-- If real people have already logged time on a demo project or used a
-- demo tag, that project or tag is kept so no real time is lost.
-- =====================================================================

delete from public.time_entries
where user_id::text like 'd0000000-0000-4000-a000-%';

delete from auth.users
where id::text like 'd0000000-0000-4000-a000-%';

delete from public.projects p
where p.id::text like 'd0000000-0000-4000-a200-%'
  and not exists (select 1 from public.time_entries e where e.project_id = p.id);

delete from public.clients c
where c.id::text like 'd0000000-0000-4000-a100-%'
  and not exists (select 1 from public.projects p where p.client_id = c.id);

delete from public.tags t
where t.id::text like 'd0000000-0000-4000-a300-%'
  and not exists (select 1 from public.time_entry_tags x where x.tag_id = t.id);

select
  (select count(*) from public.profiles where id::text like 'd0000000%') as demo_people_left,
  (select count(*) from public.projects where id::text like 'd0000000%') as demo_projects_kept,
  (select count(*) from public.clients  where id::text like 'd0000000%') as demo_clients_kept,
  (select count(*) from public.tags     where id::text like 'd0000000%') as demo_tags_kept;
