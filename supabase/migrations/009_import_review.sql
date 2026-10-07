-- =====================================================================
-- Fathom Time: 009 Import review, undo and clean-up tools
-- Run in the Supabase SQL Editor, after 008.
--
--   import_batches.deleted_entries  entries an import removed (e.g. gone
--                                    from a Jibble re-export), kept so
--                                    Undo can put them back
--   jibble cut-over date            in app_settings; Jibble rows on or after
--                                    it are refused
--   undo_import(), get_jibble_cutover(), set_jibble_cutover()
--   count / delete practice entries, remove unused demo projects (Director)
-- =====================================================================

alter table public.import_batches
  add column if not exists deleted_entries jsonb not null default '[]',
  add column if not exists summary jsonb not null default '{}';

-- 1. Jibble cut-over date (null = not set yet).
create or replace function public.get_jibble_cutover()
returns date
language sql stable security definer set search_path = ''
as $$
  select case when public.is_lead()
    then nullif((select value from public.app_settings where key = 'jibble_cutover'), '')::date
  end;
$$;

create or replace function public.set_jibble_cutover(p_date date)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_lead() then
    raise exception 'Only the Director and Managers can change the cut-over date.';
  end if;
  insert into public.app_settings (key, value) values ('jibble_cutover', coalesce(p_date::text, ''))
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- 2. Undo an import: remove what it added, put back what it removed.
create or replace function public.undo_import(p_batch uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  b public.import_batches;
  removed int;
begin
  if not public.is_lead() then
    raise exception 'Only the Director and Managers can undo an import.';
  end if;
  select * into b from public.import_batches where id = p_batch;
  if b.id is null then
    raise exception 'That import wasn''t found.';
  end if;
  if b.undone_at is not null then
    raise exception 'That import was already undone.';
  end if;

  with d as (delete from public.time_entries where import_batch = p_batch returning 1)
  select count(*) into removed from d;

  insert into public.time_entries
    (id, user_id, description, project_id, task_id, billable, start_at, end_at, tz,
     created_by, updated_by, created_at, updated_at, source, source_key, import_batch)
  select (e ->> 'id')::uuid, (e ->> 'user_id')::uuid, coalesce(e ->> 'description', ''),
         nullif(e ->> 'project_id', '')::uuid, nullif(e ->> 'task_id', '')::uuid,
         coalesce((e ->> 'billable')::boolean, false),
         (e ->> 'start_at')::timestamptz, nullif(e ->> 'end_at', '')::timestamptz, e ->> 'tz',
         nullif(e ->> 'created_by', '')::uuid, nullif(e ->> 'updated_by', '')::uuid,
         coalesce((e ->> 'created_at')::timestamptz, now()), coalesce((e ->> 'updated_at')::timestamptz, now()),
         e ->> 'source', e ->> 'source_key', nullif(e ->> 'import_batch', '')::uuid
  from jsonb_array_elements(b.deleted_entries) e
  where not exists (select 1 from public.time_entries t where t.id = (e ->> 'id')::uuid)
    and exists (select 1 from public.profiles p where p.id = (e ->> 'user_id')::uuid);

  update public.import_batches set undone_at = now() where id = p_batch;
  return removed;
end;
$$;

-- 3. Clean-up tools (Director only).
--    Practice entries: typed straight into Fathom Time (not imported), starting before a date.
create or replace function public.count_practice_entries(p_before timestamptz)
returns int
language sql stable security definer set search_path = ''
as $$
  select case when public.is_director()
    then (select count(*)::int from public.time_entries where source is null and start_at < p_before)
  end;
$$;

create or replace function public.delete_practice_entries(p_before timestamptz)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  n int;
begin
  if not public.is_director() then
    raise exception 'Only the Director can delete practice entries.';
  end if;
  with d as (delete from public.time_entries where source is null and start_at < p_before returning 1)
  select count(*) into n from d;
  return n;
end;
$$;

-- Demo projects (ids starting d0000000) with no time left on them.
create or replace function public.remove_unused_demo_projects()
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  n int;
begin
  if not public.is_director() then
    raise exception 'Only the Director can remove demo projects.';
  end if;
  perform set_config('fathom.trusted', 'on', true);
  delete from public.task_budgets b using public.tasks t
  where b.task_id = t.id and t.project_id::text like 'd0000000-%'
    and not exists (select 1 from public.time_entries e where e.project_id = t.project_id);
  with d as (
    delete from public.projects p
    where p.id::text like 'd0000000-%'
      and not exists (select 1 from public.time_entries e where e.project_id = p.id)
    returning 1
  ) select count(*) into n from d;
  delete from public.clients c
  where c.id::text like 'd0000000-%'
    and not exists (select 1 from public.projects p where p.client_id = c.id);
  delete from public.tags g
  where g.id::text like 'd0000000-%'
    and not exists (select 1 from public.time_entry_tags x where x.tag_id = g.id);
  perform set_config('fathom.trusted', '', true);
  return n;
end;
$$;

revoke execute on function public.get_jibble_cutover() from public, anon;
revoke execute on function public.set_jibble_cutover(date) from public, anon;
revoke execute on function public.undo_import(uuid) from public, anon;
revoke execute on function public.count_practice_entries(timestamptz) from public, anon;
revoke execute on function public.delete_practice_entries(timestamptz) from public, anon;
revoke execute on function public.remove_unused_demo_projects() from public, anon;
grant execute on function public.get_jibble_cutover() to authenticated;
grant execute on function public.set_jibble_cutover(date) to authenticated;
grant execute on function public.undo_import(uuid) to authenticated;
grant execute on function public.count_practice_entries(timestamptz) to authenticated;
grant execute on function public.delete_practice_entries(timestamptz) to authenticated;
grant execute on function public.remove_unused_demo_projects() to authenticated;
