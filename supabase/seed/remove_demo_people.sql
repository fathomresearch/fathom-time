-- =====================================================================
-- Removes the 5 demo people and all of their time entries.
-- Keeps the clients, projects, tasks and tags so you can use them.
-- Real people and their entries are not touched.
-- =====================================================================

delete from public.time_entries
where user_id::text like 'd0000000-0000-4000-a000-%';

delete from auth.users
where id::text like 'd0000000-0000-4000-a000-%';   -- also removes their profiles and favorites

select
  (select count(*) from public.profiles where id::text like 'd0000000%') as demo_people_left,
  (select count(*) from public.profiles) as people_now,
  (select count(*) from public.projects) as projects_kept;
