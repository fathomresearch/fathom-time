-- =====================================================================
-- Fathom Time: 008 Run without a server (GitHub Pages + Supabase)
-- Run in the Supabase SQL Editor, after 007.
--
-- The website is now plain files, so jobs the server did move here:
--   app_settings        settings only the SQL Editor can change
--                       (director_emails: who becomes Director on first sign-in)
--   finish_sign_in()    first-sign-in setup (role, time zone) and the
--                       automatic link of a former member with the same email
--   set_person_active() deactivate / reactivate (stops a running timer)
--   create_former_member()  former members no longer need a sign-in record
-- =====================================================================

-- 1. Settings (no access for signed-in users; read by the functions below).
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
insert into public.app_settings (key, value)
values ('director_emails', 'admin@fathomresearch.ai')
on conflict (key) do nothing;
-- To change later:  update public.app_settings set value = 'a@x.com, b@y.com' where key = 'director_emails';

-- 2. Trusted changes made by these functions skip the per-person rules.
--    (Set only inside functions; people can't run SQL themselves.)
create or replace function public.is_trusted_change()
returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(current_setting('fathom.trusted', true), '') = 'on';
$$;

create or replace function public.guard_profile_update()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  actor_role text;
begin
  if auth.uid() is null or public.is_trusted_change() then
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

-- link_person: also allowed from finish_sign_in (exact email match).
create or replace function public.link_person(p_from uuid, p_to uuid, p_auto boolean default false)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  link_id uuid;
  moved uuid[];
  aliases uuid[];
begin
  if auth.uid() is not null and not public.is_trusted_change() and not public.is_director() then
    raise exception 'Only the Director can link people.';
  end if;
  if p_from = p_to then
    raise exception 'Pick a different person.';
  end if;
  if not exists (select 1 from public.profiles where id = p_from and not has_login and merged_into is null) then
    raise exception 'Only a former member without sign-in can be linked.';
  end if;
  if not exists (select 1 from public.profiles where id = p_to and has_login and merged_into is null) then
    raise exception 'Link to a person who signs in.';
  end if;

  update public.time_entries set end_at = greatest(start_at, now())
  where user_id = p_from and end_at is null;

  with m as (
    update public.time_entries set user_id = p_to where user_id = p_from returning id
  ) select coalesce(array_agg(id), '{}') into moved from m;

  insert into public.project_levels (project_id, user_id, level)
  select project_id, p_to, level from public.project_levels where user_id = p_from
  on conflict do nothing;

  with a as (
    update public.person_aliases set user_id = p_to where user_id = p_from returning id
  ) select coalesce(array_agg(id), '{}') into aliases from a;

  update public.profiles set merged_into = p_to where id = p_from;

  insert into public.person_links (from_user, to_user, entry_ids, alias_ids, automatic, linked_by)
  values (p_from, p_to, moved, aliases, p_auto, case when p_auto then null else auth.uid() end)
  returning id into link_id;
  return link_id;
end;
$$;

-- 3. First-sign-in setup, called by the website right after Google sign-in.
create or replace function public.finish_sign_in(p_tz text default null)
returns table (active boolean, role text)
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  me public.profiles;
  u auth.users;
  directors text[];
  former uuid;
begin
  if uid is null then
    raise exception 'Not signed in.';
  end if;

  perform set_config('fathom.trusted', 'on', true);

  select * into me from public.profiles where id = uid;
  if me.id is null then
    -- Normally made by the sign-up trigger; this covers older accounts.
    select * into u from auth.users where id = uid;
    insert into public.profiles (id, email, name)
    values (
      uid,
      lower(coalesce(u.email, '')),
      coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''),
               split_part(coalesce(u.email, ''), '@', 1))
    );
    select * into me from public.profiles where id = uid;
  end if;

  if not me.role_initialized then
    select array_agg(lower(trim(x))) into directors
    from unnest(string_to_array((select value from public.app_settings where key = 'director_emails'), ',')) as x;
    update public.profiles set
      role = case when lower(me.email) = any (coalesce(directors, '{}')) then 'director' else 'analyst' end,
      timezone = case
        when p_tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz) then p_tz
        else timezone
      end,
      role_initialized = true
    where id = uid;
  end if;

  -- A former member who used this exact email in Clockify or Jibble.
  if me.active then
    for former in
      select distinct a.user_id
      from public.person_aliases a
      join public.profiles p on p.id = a.user_id
      where a.kind = 'email' and a.alias = lower(me.email)
        and not p.has_login and p.merged_into is null and p.id <> uid
    loop
      perform public.link_person(former, uid, true);
    end loop;
  end if;

  perform set_config('fathom.trusted', '', true);

  return query select p.active, p.role from public.profiles p where p.id = uid;
end;
$$;

-- 4. Deactivate / reactivate. The usual rules apply (profile guard); a
--    running timer stops when someone is deactivated.
create or replace function public.set_person_active(p_user uuid, p_active boolean)
returns void
language plpgsql set search_path = ''
as $$
begin
  if not p_active then
    update public.time_entries set end_at = greatest(start_at, now())
    where user_id = p_user and end_at is null;
  end if;
  update public.profiles set active = p_active where id = p_user;
  if not found then
    raise exception 'You can''t change this person''s access.';
  end if;
end;
$$;

-- 5. Former members (people in imports who never sign in) don't need a
--    sign-in record any more: profiles no longer require one.
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- Deleting a sign-in record still removes its profile, as before.
create or replace function public.delete_profile_for_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;
drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.delete_profile_for_user();

create or replace function public.create_former_member(p_name text, p_aliases jsonb default '[]')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid := gen_random_uuid();
  clean text := left(trim(p_name), 80);
begin
  if not public.is_lead() then
    raise exception 'Only the Director and Managers can import.';
  end if;
  if clean = '' then
    raise exception 'A former member needs a name.';
  end if;
  insert into public.profiles (id, email, name, role, active, has_login, role_initialized)
  values (new_id, 'former+' || left(replace(new_id::text, '-', ''), 12) || '@noreply.fathomresearch.ai',
          clean, 'analyst', false, false, true);
  insert into public.person_aliases (user_id, source, kind, alias)
  select new_id, a ->> 'source', a ->> 'kind', lower(trim(a ->> 'alias'))
  from jsonb_array_elements(coalesce(p_aliases, '[]')) a
  where trim(coalesce(a ->> 'alias', '')) <> ''
  on conflict (source, kind, alias) do update set user_id = excluded.user_id;
  return new_id;
end;
$$;

-- 6. Who can call what.
revoke execute on function public.finish_sign_in(text) from public, anon;
revoke execute on function public.set_person_active(uuid, boolean) from public, anon;
revoke execute on function public.create_former_member(text, jsonb) from public, anon;
revoke execute on function public.delete_profile_for_user() from public, anon, authenticated;
revoke execute on function public.is_trusted_change() from public, anon;
grant execute on function public.finish_sign_in(text) to authenticated;
grant execute on function public.set_person_active(uuid, boolean) to authenticated;
grant execute on function public.create_former_member(text, jsonb) to authenticated;
grant execute on function public.is_trusted_change() to authenticated;
