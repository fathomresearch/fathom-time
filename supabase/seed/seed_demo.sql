-- =====================================================================
-- Fathom Time: OPTIONAL demo data
--
-- Adds 5 demo people (1 director, 4 analysts), 2 clients, 6 projects with
-- tasks, 4 tags, about 4 weeks of weekday entries, and 2 running timers.
--
-- Demo people use @example.com addresses and cannot sign in.
-- Remove them before real use with remove_demo_people.sql.
-- Every demo ID starts with d0000000 so removal is exact.
-- =====================================================================

do $$
declare
  boss   uuid := 'd0000000-0000-4000-a000-000000000001';
  priya  uuid := 'd0000000-0000-4000-a000-000000000002';
  marcus uuid := 'd0000000-0000-4000-a000-000000000003';
  sofia  uuid := 'd0000000-0000-4000-a000-000000000004';
  ethan  uuid := 'd0000000-0000-4000-a000-000000000005';

  c_sf uuid := 'd0000000-0000-4000-a100-000000000001';
  c_jm uuid := 'd0000000-0000-4000-a100-000000000002';

  p_mahomes uuid := 'd0000000-0000-4000-a200-000000000001';
  p_sfri    uuid := 'd0000000-0000-4000-a200-000000000002';
  p_jm      uuid := 'd0000000-0000-4000-a200-000000000003';
  p_admin   uuid := 'd0000000-0000-4000-a200-000000000004';
  p_meet    uuid := 'd0000000-0000-4000-a200-000000000005';
  p_shadow  uuid := 'd0000000-0000-4000-a200-000000000006';

  t_call   uuid := 'd0000000-0000-4000-a300-000000000001';
  t_rev    uuid := 'd0000000-0000-4000-a300-000000000002';
  t_train  uuid := 'd0000000-0000-4000-a300-000000000003';
  t_urgent uuid := 'd0000000-0000-4000-a300-000000000004';

  stages text[] := array['Survey Programming', 'Fieldwork / Data', 'Analysis',
                         'Deck', 'Reporting', 'PM / Client Comms'];

  person record;
  d date;
  today date := (now() at time zone 'America/Chicago')::date;
  first_day date;
  cursor_ts timestamptz;
  target_min int;
  logged_min int;
  block_min int;
  lunch_done boolean;
  pick record;
  descr text;
  new_id uuid;
  running_start timestamptz;
begin
  perform setseed(0.42);

  -- People --------------------------------------------------------------
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
         u.email, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', u.name), now(), now(), '', '', '', ''
  from (values
    (boss,   'dana.demo@example.com',   'Dana Whitaker'),
    (priya,  'priya.demo@example.com',  'Priya Raman'),
    (marcus, 'marcus.demo@example.com', 'Marcus Lee'),
    (sofia,  'sofia.demo@example.com',  'Sofia Alvarez'),
    (ethan,  'ethan.demo@example.com',  'Ethan Brooks')
  ) as u(id, email, name);

  update public.profiles set role = 'director', timezone = 'America/Chicago',     role_initialized = true where id = boss;
  update public.profiles set timezone = 'America/New_York',    role_initialized = true where id = priya;
  update public.profiles set timezone = 'America/Chicago',     role_initialized = true where id = marcus;
  update public.profiles set timezone = 'America/Los_Angeles', role_initialized = true where id = sofia;
  update public.profiles set timezone = 'America/Chicago',     role_initialized = true where id = ethan;

  -- Clients, projects, tasks, tags ---------------------------------------
  insert into public.clients (id, name, created_by) values
    (c_sf, 'State Farm', boss),
    (c_jm, 'Jersey Mike''s', boss);

  insert into public.projects (id, name, client_id, color, type, billable_default, created_by) values
    (p_mahomes, 'Mahomes Distinctiveness Study', c_sf, '#00D6B3', 'client',   true,  boss),
    (p_sfri,    'State Farm – Influencer RI',    c_sf, '#2274F8', 'client',   true,  boss),
    (p_jm,      'Jersey Mike''s CEP',            c_jm, '#D93F45', 'client',   true,  priya),
    (p_admin,   'Fathom – Admin',                null, '#3A3556', 'internal', false, boss),
    (p_meet,    'Team Meetings',                 null, '#E0A526', 'internal', false, boss),
    (p_shadow,  'Project Shadowing (Unpaid)',    null, '#5C7C99', 'internal', false, boss);

  insert into public.tasks (project_id, name, sort_order)
  select p.id, s.name, s.ord
  from unnest(array[p_mahomes, p_sfri, p_jm]) as p(id)
  cross join unnest(stages) with ordinality as s(name, ord);

  insert into public.tasks (project_id, name, sort_order) values
    (p_admin, 'Tool Development', 1), (p_admin, 'Website', 2),
    (p_admin, 'Recruiting', 3),       (p_admin, 'Finance & Ops', 4),
    (p_meet,  'Full team meetings', 1), (p_meet, 'Touchbases', 2);

  insert into public.tags (id, name, created_by) values
    (t_call, 'Client call', boss), (t_rev, 'Revision', boss),
    (t_train, 'Training', boss),   (t_urgent, 'Urgent', boss);

  insert into public.favorites (user_id, project_id) values
    (priya, p_mahomes), (marcus, p_jm), (boss, p_admin), (sofia, p_sfri);

  -- What each person works on: project, task name, weight ---------------
  create temp table demo_mix (user_id uuid, project_id uuid, task_name text, weight int) on commit drop;
  insert into demo_mix values
    (priya, p_mahomes, 'Analysis', 5), (priya, p_mahomes, 'Deck', 4),
    (priya, p_mahomes, 'Reporting', 2), (priya, p_mahomes, 'PM / Client Comms', 1),
    (priya, p_meet, 'Touchbases', 1), (priya, p_admin, 'Tool Development', 1),

    (marcus, p_jm, 'Survey Programming', 4), (marcus, p_jm, 'Fieldwork / Data', 5),
    (marcus, p_sfri, 'Fieldwork / Data', 2), (marcus, p_jm, 'Analysis', 2),
    (marcus, p_meet, 'Touchbases', 1),

    (sofia, p_sfri, 'Analysis', 5), (sofia, p_sfri, 'Deck', 4),
    (sofia, p_mahomes, 'Fieldwork / Data', 2), (sofia, p_sfri, 'PM / Client Comms', 1),
    (sofia, p_admin, 'Website', 1),

    (ethan, p_jm, 'Analysis', 4), (ethan, p_jm, 'Reporting', 3),
    (ethan, p_shadow, null, 2), (ethan, p_admin, 'Tool Development', 2),
    (ethan, p_mahomes, 'Deck', 1),

    (boss, p_mahomes, 'PM / Client Comms', 3), (boss, p_sfri, 'PM / Client Comms', 3),
    (boss, p_jm, 'PM / Client Comms', 2), (boss, p_admin, 'Finance & Ops', 3),
    (boss, p_admin, 'Recruiting', 2), (boss, p_meet, 'Touchbases', 2);

  create temp table demo_desc (task_name text, texts text[]) on commit drop;
  insert into demo_desc values
    ('Survey Programming', array['Programming screener logic', 'QA on survey links', 'Fixing skip logic after client review', 'Setting up quotas']),
    ('Fieldwork / Data',   array['Monitoring field progress', 'Cleaning open ends', 'Checking data quality flags', 'Pulling interim data']),
    ('Analysis',           array['Running crosstabs', 'Driver analysis', 'Coding open ends', 'Segment profiles']),
    ('Deck',               array['Building findings slides', 'Chart cleanup', 'Storyline draft', 'Exec summary slides']),
    ('Reporting',          array['Writing topline report', 'Reviewing report edits', 'Formatting appendix']),
    ('PM / Client Comms',  array['Client status call', 'Timeline update email', 'Kickoff prep', 'Scope check call with client']),
    ('Tool Development',   array['Fathom Time build', 'Survey platform fixes', 'Automation scripts']),
    ('Website',            array['Case study page edits', 'Site copy review']),
    ('Recruiting',         array['Interview: research analyst', 'Reviewing applications']),
    ('Finance & Ops',      array['Invoicing', 'Expense review', 'Vendor contracts']),
    ('Full team meetings', array['Weekly team sync']),
    ('Touchbases',         array['1:1 touchbase', 'Weekly check-in']),
    ('(none)',             array['Shadowing analysis session', 'Reviewing past decks']);

  -- Entries ----------------------------------------------------------------
  -- Starts on the Sunday three weeks before this week and runs through today.
  first_day := today - extract(dow from today)::int - 21;

  for person in
    select p.id, p.timezone from public.profiles p where p.id in (boss, priya, marcus, sofia, ethan)
  loop
    for d in select generate_series(first_day, today, interval '1 day')::date loop
      continue when extract(isodow from d) in (6, 7);

      cursor_ts := (d + time '08:30' + (floor(random() * 5) * interval '15 minutes'))
                   at time zone person.timezone;
      target_min := 360 + floor(random() * 9)::int * 15;   -- 6h to 8h
      logged_min := 0;
      lunch_done := false;

      -- Monday starts with the team meeting.
      if extract(isodow from d) = 1 then
        insert into public.time_entries (user_id, description, project_id, task_id, billable, start_at, end_at)
        select person.id, 'Weekly team sync', p_meet, t.id, false, cursor_ts, cursor_ts + interval '60 minutes'
        from public.tasks t where t.project_id = p_meet and t.name = 'Full team meetings';
        cursor_ts := cursor_ts + interval '65 minutes';
        logged_min := 60;
      end if;

      while logged_min < target_min loop
        -- Weighted random pick of what to work on.
        select m.project_id, m.task_name into pick
        from demo_mix m
        where m.user_id = person.id
        order by -ln(1 - random()) / m.weight
        limit 1;

        block_min := (array[30, 45, 60, 60, 90, 90, 120, 150])[1 + floor(random() * 8)::int];
        block_min := least(block_min, target_min - logged_min);
        if block_min < 15 then exit; end if;

        select texts[1 + floor(random() * array_length(texts, 1))::int] into descr
        from demo_desc where task_name = coalesce(pick.task_name, '(none)');

        insert into public.time_entries (user_id, description, project_id, task_id, billable, start_at, end_at)
        select person.id, descr, pick.project_id,
               (select t.id from public.tasks t where t.project_id = pick.project_id and t.name = pick.task_name),
               pr.billable_default, cursor_ts, cursor_ts + make_interval(mins => block_min)
        from public.projects pr where pr.id = pick.project_id
        returning id into new_id;

        -- Tags that match the work.
        if descr ilike '%call%' then
          insert into public.time_entry_tags values (new_id, t_call);
        end if;
        if descr ~* '(edits|review|fixing|cleanup)' then
          insert into public.time_entry_tags values (new_id, t_rev);
        end if;
        if pick.project_id = p_shadow then
          insert into public.time_entry_tags values (new_id, t_train);
        end if;
        if random() < 0.05 then
          insert into public.time_entry_tags values (new_id, t_urgent) on conflict do nothing;
        end if;

        logged_min := logged_min + block_min;
        cursor_ts := cursor_ts + make_interval(mins => block_min)
                     + (floor(random() * 3) * interval '5 minutes');

        if not lunch_done and logged_min >= 180 then
          cursor_ts := cursor_ts + interval '40 minutes';
          lunch_done := true;
        end if;
      end loop;
    end loop;
  end loop;

  -- Nothing in the future.
  delete from public.time_entries
  where user_id in (boss, priya, marcus, sofia, ethan) and end_at > now();

  -- Two running timers.
  running_start := now() - interval '1 hour 23 minutes';
  delete from public.time_entries where user_id = priya and end_at > running_start;
  insert into public.time_entries (user_id, description, project_id, task_id, billable, start_at, end_at)
  select priya, 'Running crosstabs', p_mahomes, t.id, true, running_start, null
  from public.tasks t where t.project_id = p_mahomes and t.name = 'Analysis';

  running_start := now() - interval '38 minutes';
  delete from public.time_entries where user_id = marcus and end_at > running_start;
  insert into public.time_entries (user_id, description, project_id, task_id, billable, start_at, end_at)
  select marcus, 'Monitoring field progress', p_jm, t.id, true, running_start, null
  from public.tasks t where t.project_id = p_jm and t.name = 'Fieldwork / Data';

  -- A few of Sofia's entries fixed by the boss, to show "Edited by".
  update public.time_entries
     set updated_by = boss, updated_at = end_at + interval '1 day'
   where id in (
     select id from public.time_entries
     where user_id = sofia and end_at is not null
     order by start_at desc
     offset 3 limit 3
   );
end $$;

-- Quick summary of what was added.
select p.name, p.role, p.timezone,
       count(e.id) as entries,
       round(sum(extract(epoch from (coalesce(e.end_at, now()) - e.start_at))) / 3600.0, 1) as hours,
       count(e.id) filter (where e.end_at is null) as running
from public.profiles p
left join public.time_entries e on e.user_id = p.id
where p.id::text like 'd0000000%'
group by p.name, p.role, p.timezone
order by p.role, p.name;
