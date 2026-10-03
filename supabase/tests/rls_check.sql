-- =====================================================================
-- Fathom Time: security check (run after migrations 003 to 005)
-- Creates temporary test people (IDs start with e0000000), signs in as
-- each behind the scenes, and tries things they should and should not be
-- able to do. Removes everything it created at the end; real data is
-- never changed. Every row in the result should say pass = true.
-- =====================================================================

create temp table rls_results (n serial, check_name text, pass boolean, detail text);
grant all on rls_results to authenticated, anon;
grant usage on sequence rls_results_n_seq to authenticated, anon;

-- ---------------------------------------------------------------------
-- Setup (as the database owner)
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated',
       u.email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
from (values
  ('e0000000-0000-4000-a000-000000000001', 'test.director@example.com', 'Test Director'),
  ('e0000000-0000-4000-a000-000000000002', 'test.manager@example.com',  'Test Manager'),
  ('e0000000-0000-4000-a000-000000000003', 'test.analyst@example.com',  'Test Analyst'),
  ('e0000000-0000-4000-a000-000000000004', 'test.analyst2@example.com', 'Test Analyst 2'),
  ('e0000000-0000-4000-a000-000000000005', 'test.off@example.com',      'Test Deactivated')
) as u(id, email, name);

update public.profiles set role = 'director', role_initialized = true where id = 'e0000000-0000-4000-a000-000000000001';
update public.profiles set role = 'manager',  role_initialized = true where id = 'e0000000-0000-4000-a000-000000000002';
update public.profiles set role = 'analyst',  role_initialized = true where id in
  ('e0000000-0000-4000-a000-000000000003', 'e0000000-0000-4000-a000-000000000004');
update public.profiles set role = 'analyst', active = false, role_initialized = true
  where id = 'e0000000-0000-4000-a000-000000000005';

insert into public.projects (id, name, type, created_by)
values ('e0000000-0000-4000-a200-000000000001', 'RLS test project', 'internal', 'e0000000-0000-4000-a000-000000000001');

insert into public.tasks (id, project_id, name)
values ('e0000000-0000-4000-a300-000000000001', 'e0000000-0000-4000-a200-000000000001', 'RLS test task');

insert into public.time_entries (user_id, project_id, description, start_at, end_at)
select u::uuid, 'e0000000-0000-4000-a200-000000000001', 'rls test', now() - interval '3 hours', now() - interval '2 hours'
from unnest(array['e0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000002',
                  'e0000000-0000-4000-a000-000000000003', 'e0000000-0000-4000-a000-000000000004',
                  'e0000000-0000-4000-a000-000000000005']) as u;
-- Analyst 2 has a running timer.
insert into public.time_entries (user_id, description, start_at)
values ('e0000000-0000-4000-a000-000000000004', 'rls test running', now() - interval '30 minutes');

-- ---------------------------------------------------------------------
-- As the Analyst
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Analyst sees only their own entries',
       count(distinct user_id) = 1 and bool_and(user_id = auth.uid()),
       count(*) || ' entries from ' || count(distinct user_id) || ' person(s)'
from public.time_entries;

insert into rls_results (check_name, pass, detail)
select 'Analyst can read projects and names',
       (select count(*) from public.projects) >= 1 and (select count(*) from public.profiles) >= 5,
       'projects and profiles visible';

do $$
declare n int;
begin
  update public.time_entries set description = 'hacked' where user_id = 'e0000000-0000-4000-a000-000000000004';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot edit someone else''s entry', n = 0, n || ' rows changed');
end $$;

do $$
declare n int;
begin
  delete from public.time_entries where user_id = 'e0000000-0000-4000-a000-000000000004';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot delete someone else''s entry', n = 0, n || ' rows deleted');
end $$;

do $$
begin
  insert into public.time_entries (user_id, description, start_at, end_at)
  values ('e0000000-0000-4000-a000-000000000004', 'fake', now() - interval '1 hour', now());
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot add an entry for someone else', false, 'insert was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot add an entry for someone else', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare new_id uuid;
begin
  insert into public.time_entries (user_id, description, start_at, end_at, created_by, updated_by)
  values (auth.uid(), 'rls own', now() - interval '5 hours', now() - interval '4 hours',
          'e0000000-0000-4000-a000-000000000001', 'e0000000-0000-4000-a000-000000000001')
  returning id into new_id;
  insert into rls_results (check_name, pass, detail)
  select 'Analyst can add their own entry, and cannot fake who made it',
         created_by = auth.uid() and updated_by = auth.uid(), 'created_by and updated_by recorded as the analyst'
  from public.time_entries where id = new_id;
end $$;

do $$
declare n int;
begin
  update public.profiles set role = 'manager' where id = auth.uid();
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot make themself a manager', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot make themself a manager', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.projects set name = 'RLS test project (edited)', archived = true
  where id = 'e0000000-0000-4000-a200-000000000001';
  update public.projects set archived = false where id = 'e0000000-0000-4000-a200-000000000001';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Analyst can edit, archive and restore a project', n = 1, n || ' row restored');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Analyst can edit, archive and restore a project', false, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.profiles set active = false where id = 'e0000000-0000-4000-a000-000000000004';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot deactivate anyone', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot deactivate anyone', true, 'blocked: ' || sqlerrm);
end $$;

insert into rls_results (check_name, pass, detail)
select 'Analyst''s project hours are only their own',
       coalesce((select sum(seconds) from public.project_hours()), 0)
       = coalesce((select sum(extract(epoch from (end_at - start_at))) from public.time_entries
                   where end_at is not null and project_id is not null), 0),
       'totals match their own entries';

insert into rls_results (check_name, pass, detail)
select 'Analyst cannot see budgets or levels',
       (select count(*) from public.task_budgets) = 0
       and (select count(*) from public.project_budgets) = 0
       and (select count(*) from public.project_levels) = 0,
       'budget tables return nothing';

do $$
begin
  perform public.set_task_budget('e0000000-0000-4000-a300-000000000001', 'analyst', 5);
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot change a budget', false, 'change was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Analyst cannot change a budget', true, 'blocked: ' || sqlerrm);
end $$;

insert into rls_results (check_name, pass, detail)
select 'Analyst gets nothing from the team report', count(*) = 0, count(*) || ' rows'
from public.time_report();

-- ---------------------------------------------------------------------
-- As the Manager
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Manager sees everyone''s entries',
       count(distinct user_id) >= 5, count(distinct user_id) || ' people visible'
from public.time_entries;

with u as (
  update public.time_entries set description = description
  where user_id = 'e0000000-0000-4000-a000-000000000003' and description = 'rls test'
  returning updated_by
)
insert into rls_results (check_name, pass, detail)
select 'Manager can edit an analyst''s entry, recorded as "Edited by" manager',
       count(*) = 1 and bool_and(updated_by = auth.uid()), count(*) || ' row updated'
from u;

do $$
declare n int;
begin
  update public.profiles set active = false where id = 'e0000000-0000-4000-a000-000000000003';
  update public.profiles set active = true where id = 'e0000000-0000-4000-a000-000000000003';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Manager can deactivate and reactivate an analyst', n = 1, n || ' row reactivated');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Manager can deactivate and reactivate an analyst', false, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.profiles set active = false where id = 'e0000000-0000-4000-a000-000000000001';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Manager cannot deactivate the Director', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Manager cannot deactivate the Director', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.profiles set role = 'manager' where id = 'e0000000-0000-4000-a000-000000000003';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Manager cannot change anyone''s role', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Manager cannot change anyone''s role', true, 'blocked: ' || sqlerrm);
end $$;

insert into rls_results (check_name, pass, detail)
select 'Manager''s project hours include everyone''s time',
       (select sum(seconds) from public.project_hours())
       > coalesce((select sum(extract(epoch from (end_at - start_at))) from public.time_entries
                   where end_at is not null and project_id is not null and user_id = auth.uid()), 0),
       'totals include other people';

insert into rls_results (check_name, pass, detail)
select 'Logging time saves each person''s level on the project',
       count(*) = 5 and bool_or(user_id = 'e0000000-0000-4000-a000-000000000003' and level = 'analyst'),
       count(*) || ' levels saved'
from public.project_levels where project_id = 'e0000000-0000-4000-a200-000000000001';

do $$
declare n int;
begin
  perform public.set_task_budget('e0000000-0000-4000-a300-000000000001', 'analyst', 5);
  select count(*) into n from public.task_budgets
  where task_id = 'e0000000-0000-4000-a300-000000000001' and level = 'analyst' and hours = 5;
  insert into rls_results (check_name, pass, detail) values ('Manager can set a budget', n = 1, n || ' budget row');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Manager can set a budget', false, 'blocked: ' || sqlerrm);
end $$;

insert into rls_results (check_name, pass, detail)
select 'Manager sees the team report for a project', count(distinct user_id) >= 5, count(distinct user_id) || ' people'
from public.time_report(only_project => 'e0000000-0000-4000-a200-000000000001');

do $$
begin
  insert into public.project_budgets (project_id, warn_pct, over_pct)
  values ('e0000000-0000-4000-a200-000000000001', 120, 100)
  on conflict (project_id) do update set warn_pct = 120, over_pct = 100;
  insert into rls_results (check_name, pass, detail) values ('Yellow line can''t be above the red line', false, 'saved 120 / 100');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Yellow line can''t be above the red line', true, 'blocked: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- As the Director
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare n int;
begin
  update public.profiles set role = 'manager' where id = 'e0000000-0000-4000-a000-000000000004';
  update public.profiles set role = 'analyst' where id = 'e0000000-0000-4000-a000-000000000004';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Director can switch someone between Analyst and Manager', n = 1, n || ' row changed back');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Director can switch someone between Analyst and Manager', false, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.profiles set role = 'director' where id = 'e0000000-0000-4000-a000-000000000002';
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Nobody can be made Director in the app', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Nobody can be made Director in the app', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  update public.profiles set role = 'analyst' where id = auth.uid();
  get diagnostics n = row_count;
  insert into rls_results (check_name, pass, detail) values ('Director''s own role is fixed', n = 0, n || ' rows changed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Director''s own role is fixed', true, 'blocked: ' || sqlerrm);
end $$;

do $$
declare n int;
begin
  insert into public.time_entries (user_id, description, start_at)
  values ('e0000000-0000-4000-a000-000000000004', 'rls test new timer', now());
  select count(*) into n from public.time_entries
  where user_id = 'e0000000-0000-4000-a000-000000000004' and end_at is null;
  insert into rls_results (check_name, pass, detail) values ('Starting a new timer stops the old one', n = 1, n || ' running timer(s)');
end $$;

-- ---------------------------------------------------------------------
-- As the deactivated person
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims',
  '{"sub":"e0000000-0000-4000-a000-000000000005","role":"authenticated"}', true);
set local role authenticated;

insert into rls_results (check_name, pass, detail)
select 'Deactivated person sees no data',
       (select count(*) from public.time_entries) = 0 and (select count(*) from public.projects) = 0,
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
  insert into rls_results (check_name, pass, detail) values ('Signed-out visitor cannot read entries', false, 'read was allowed');
exception when others then
  insert into rls_results (check_name, pass, detail) values ('Signed-out visitor cannot read entries', true, 'blocked: ' || sqlerrm);
end $$;

-- ---------------------------------------------------------------------
-- Remove everything the test created (the project takes its task,
-- budgets and saved levels with it), then show results
-- ---------------------------------------------------------------------
reset role;
delete from public.time_entries where user_id::text like 'e0000000-0000-4000-a000-%';
delete from public.projects where id = 'e0000000-0000-4000-a200-000000000001';
delete from auth.users where id::text like 'e0000000-0000-4000-a000-%';

select n as "#", check_name, pass, detail from rls_results order by n;
