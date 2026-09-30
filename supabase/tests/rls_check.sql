-- =====================================================================
-- Fathom Time: security check
-- Run AFTER seed_demo.sql. It signs in as demo people behind the scenes
-- and tries things they should and should not be able to do.
-- Every row in the result should say pass = true.
-- It puts everything back the way it was when it finishes.
-- =====================================================================

create temp table rls_results (n serial, check_name text, pass boolean, detail text);
grant all on rls_results to authenticated, anon;
grant usage on sequence rls_results_n_seq to authenticated, anon;

-- ---------------------------------------------------------------------
-- As Priya (employee)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Employee sees only her own entries',
       count(distinct user_id) = 1 and bool_and(user_id = auth.uid()),
       count(*) || ' entries from ' || count(distinct user_id) || ' person(s)'
from public.time_entries;

insert into rls_results (check_name, pass, detail)
select 'Employee can read projects, clients, tags and names',
       (select count(*) from public.projects) = 6
       and (select count(*) from public.clients) = 2
       and (select count(*) from public.tags) = 4
       and (select count(*) from public.profiles) >= 5,
       'projects, clients, tags and profiles visible';

with u as (
  update public.time_entries set description = 'hacked'
  where user_id = 'd0000000-0000-4000-a000-000000000003'
  returning 1
)
insert into rls_results (check_name, pass, detail)
select 'Employee cannot edit someone else''s entry', count(*) = 0, count(*) || ' rows changed' from u;

with u as (
  delete from public.time_entries
  where user_id = 'd0000000-0000-4000-a000-000000000003'
  returning 1
)
insert into rls_results (check_name, pass, detail)
select 'Employee cannot delete someone else''s entry', count(*) = 0, count(*) || ' rows deleted' from u;

do $$
begin
  insert into public.time_entries (user_id, description, start_at, end_at)
  values ('d0000000-0000-4000-a000-000000000003', 'fake', now() - interval '1 hour', now());
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot add an entry for someone else', false, 'insert was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot add an entry for someone else', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare new_id uuid;
begin
  insert into public.time_entries (user_id, description, start_at, end_at, created_by, updated_by)
  values (auth.uid(), 'rls test', now() - interval '2 hours', now() - interval '1 hour',
          'd0000000-0000-4000-a000-000000000001', 'd0000000-0000-4000-a000-000000000001')
  returning id into new_id;
  insert into rls_results (check_name, pass, detail)
  select 'Employee can add her own entry, and cannot fake who made it',
         created_by = auth.uid() and updated_by = auth.uid(),
         'created_by and updated_by recorded as Priya'
  from public.time_entries where id = new_id;
  delete from public.time_entries where id = new_id;
end $$;

do $$
begin
  update public.profiles set role = 'boss' where id = auth.uid();
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot make herself boss', false, 'role change was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot make herself boss', true, 'blocked: ' || sqlerrm);
end $$;

-- Blocked either by an error or by changing 0 rows (row-level security).
do $$
declare n int;
begin
  update public.projects set archived = true
  where id = 'd0000000-0000-4000-a200-000000000001';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot archive a project', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot archive a project', true, 'blocked: ' || sqlerrm);
end $$;

with u as (
  delete from public.projects where id = 'd0000000-0000-4000-a200-000000000006' returning 1
)
insert into rls_results (check_name, pass, detail)
select 'Employee cannot delete a project', count(*) = 0, count(*) || ' rows deleted' from u;

with u as (
  update public.projects set color = color
  where id = 'd0000000-0000-4000-a200-000000000001' returning 1
)
insert into rls_results (check_name, pass, detail)
select 'Employee cannot edit a project''s details', count(*) = 0, count(*) || ' rows updated' from u;

do $$
begin
  insert into public.tasks (project_id, name)
  values ('d0000000-0000-4000-a200-000000000001', 'rls test task');
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot add a task', false, 'insert was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Employee cannot add a task', true, 'blocked: ' || sqlerrm);
end $$;

insert into rls_results (check_name, pass, detail)
select 'Employee''s project hours are only her own',
       coalesce((select sum(seconds) from public.project_hours()), 0)
       = coalesce((select sum(extract(epoch from (end_at - start_at))) from public.time_entries
                   where end_at is not null and project_id is not null), 0),
       'totals match her own entries';

-- ---------------------------------------------------------------------
-- As Dana (boss)
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Boss sees everyone''s entries', count(distinct user_id) >= 5,
       count(*) || ' entries from ' || count(distinct user_id) || ' people'
from public.time_entries;

with u as (
  update public.time_entries set description = description
  where id = (select id from public.time_entries
              where user_id = 'd0000000-0000-4000-a000-000000000005' and end_at is not null
              order by start_at desc limit 1)
  returning updated_by
)
insert into rls_results (check_name, pass, detail)
select 'Boss can edit an employee''s entry, recorded as "Edited by" boss',
       count(*) = 1 and bool_and(updated_by = auth.uid()), count(*) || ' row updated'
from u;

do $$
begin
  update public.profiles set role = 'employee' where id = auth.uid();
  insert into rls_results (check_name, pass, detail)
  values ('Boss cannot demote herself', false, 'self-demotion was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Boss cannot demote herself', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  -- Starting a timer for Priya stops her running one.
  insert into public.time_entries (user_id, description, start_at)
  values ('d0000000-0000-4000-a000-000000000002', 'rls test timer', now());
  select count(*) into n from public.time_entries
  where user_id = 'd0000000-0000-4000-a000-000000000002' and end_at is null;
  insert into rls_results (check_name, pass, detail)
  values ('Starting a new timer stops the old one', n = 1, n || ' running timer(s) for Priya');
  -- Put Priya's original timer back.
  delete from public.time_entries
  where user_id = 'd0000000-0000-4000-a000-000000000002' and description = 'rls test timer';
  update public.time_entries set end_at = null
  where id = (select id from public.time_entries
              where user_id = 'd0000000-0000-4000-a000-000000000002'
              order by start_at desc limit 1);
end $$;

update public.profiles set active = false where id = 'd0000000-0000-4000-a000-000000000005';
update public.profiles set role = 'manager' where id = 'd0000000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------
-- As the person just made manager (demo person 3)
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Manager still sees only their own entries',
       count(distinct user_id) = 1 and bool_and(user_id = auth.uid()),
       count(*) || ' entries from ' || count(distinct user_id) || ' person(s)'
from public.time_entries;

insert into rls_results (check_name, pass, detail)
select 'Manager''s project hours are only their own',
       coalesce((select sum(seconds) from public.project_hours()), 0)
       = coalesce((select sum(extract(epoch from (end_at - start_at))) from public.time_entries
                   where end_at is not null and project_id is not null), 0),
       'totals match their own entries';

do $$
declare n int;
begin
  update public.projects set archived = true where id = 'd0000000-0000-4000-a200-000000000001';
  update public.projects set archived = false where id = 'd0000000-0000-4000-a200-000000000001';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail)
  values ('Manager can edit, archive and restore a project', n = 1, n || ' row restored');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Manager can edit, archive and restore a project', false, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.profiles set role = 'boss' where id = 'd0000000-0000-4000-a000-000000000002';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail)
  values ('Manager cannot change anyone''s role', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Manager cannot change anyone''s role', true, 'blocked: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- As Ethan (just deactivated)
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"d0000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Deactivated person sees no data',
       (select count(*) from public.time_entries) = 0
       and (select count(*) from public.projects) = 0,
       'entries and projects hidden';

-- ---------------------------------------------------------------------
-- As a signed-out visitor
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;

do $$
begin
  perform 1 from public.time_entries limit 1;
  insert into rls_results (check_name, pass, detail)
  values ('Signed-out visitor cannot read entries', false, 'read was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail)
  values ('Signed-out visitor cannot read entries', true, 'blocked: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- Clean up and show results
-- ---------------------------------------------------------------------
reset role;
update public.profiles set active = true where id = 'd0000000-0000-4000-a000-000000000005';
update public.profiles set role = 'employee' where id = 'd0000000-0000-4000-a000-000000000003';

select n as "#", check_name, pass, detail from rls_results order by n;
