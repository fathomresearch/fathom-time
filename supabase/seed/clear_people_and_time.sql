-- =====================================================================
-- Fresh start before real use: deletes EVERY time entry and EVERY
-- account except admin@fathomresearch.ai, which stays boss.
-- Keeps clients, projects, tasks and tags (credited to admin).
-- Anyone else can sign in again and starts as a new employee.
-- Can't be undone. Run in the Supabase SQL Editor.
-- =====================================================================

do $$
declare admin_id uuid;
begin
  select id into admin_id from public.profiles where lower(email) = 'admin@fathomresearch.ai';
  if admin_id is null then
    raise exception 'admin@fathomresearch.ai not found. Nothing was deleted.';
  end if;

  -- All time (tags on entries go with them).
  delete from public.time_entries;

  -- Everyone else's sign-in account; their profile and favorites go with it.
  delete from auth.users where id <> admin_id;

  -- Projects, clients and tags made by removed people now say admin made them.
  update public.projects set created_by = admin_id where created_by is null;
  update public.clients  set created_by = admin_id where created_by is null;
  update public.tags     set created_by = admin_id where created_by is null;

  -- Make sure admin is an active boss.
  update public.profiles set role = 'boss', active = true, role_initialized = true where id = admin_id;
end $$;

select
  (select count(*) from public.profiles)     as people_left,     -- expect 1
  (select string_agg(email || ' (' || role || ')', ', ') from public.profiles) as who,
  (select count(*) from public.time_entries) as entries_left,    -- expect 0
  (select count(*) from public.projects)     as projects_kept,
  (select count(*) from public.tasks)        as tasks_kept;
