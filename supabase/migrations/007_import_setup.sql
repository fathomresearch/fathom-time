-- =====================================================================
-- Fathom Time: 007 Import setup (Clockify / Jibble history)
-- Run in the Supabase SQL Editor, after 006.
--
--   profiles.has_login     false = former member created by an import
--   profiles.merged_into   set when a former member is linked to a real
--                          account (the record stays so the link can be undone)
--   person_aliases         names / emails a person used in Clockify or Jibble
--   import_mappings        Clockify / Jibble client, project and task names
--                          matched to Fathom Time ones
--   import_batches         each import (for undo, in stage 3b)
--   time_entries.source / source_key / import_batch   where an entry came from
--   person_links           each link of a former member to a real account
--   link_person() / unlink_person()
-- All new tables are for directors and managers only.
-- =====================================================================

-- 1. People.
alter table public.profiles
  add column if not exists has_login boolean not null default true,
  add column if not exists merged_into uuid references public.profiles (id) on delete set null;

create table if not exists public.person_aliases (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source  text not null check (source in ('clockify', 'jibble')),
  kind    text not null check (kind in ('name', 'email')),
  alias   text not null check (alias = lower(trim(alias)) and length(alias) > 0),
  unique (source, kind, alias)
);
create index if not exists person_aliases_user on public.person_aliases (user_id);
-- Email aliases are also matched across sources when someone signs in.
create index if not exists person_aliases_email on public.person_aliases (alias) where kind = 'email';

-- 2. Name matching for clients, projects, tasks.
--    source_key: client "Client", project "Client|Project", task "Client|Project|Task" (lowercased).
create table if not exists public.import_mappings (
  source     text not null check (source in ('clockify', 'jibble')),
  kind       text not null check (kind in ('client', 'project', 'task')),
  source_key text not null,
  target_id  uuid,               -- null = "no client" / "no task"
  primary key (source, kind, source_key)
);

-- 3. Imports and where entries came from.
create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('clockify', 'jibble')),
  file_name   text not null default '',
  entry_count int not null default 0,
  created_by  uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  undone_at   timestamptz
);

alter table public.time_entries
  add column if not exists source text check (source is null or source in ('clockify', 'jibble')),
  add column if not exists source_key text,
  add column if not exists import_batch uuid references public.import_batches (id) on delete set null;
create index if not exists time_entries_source_key on public.time_entries (source, source_key) where source is not null;

-- 4. Links of former members to real accounts.
create table if not exists public.person_links (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  entry_ids  uuid[] not null default '{}',
  alias_ids  uuid[] not null default '{}',
  automatic  boolean not null default false,
  linked_by  uuid references public.profiles (id) on delete set null,
  linked_at  timestamptz not null default now(),
  undone_at  timestamptz
);

-- 5. Row-level security: directors and managers only.
alter table public.person_aliases  enable row level security;
alter table public.import_mappings enable row level security;
alter table public.import_batches  enable row level security;
alter table public.person_links    enable row level security;

drop policy if exists person_aliases_all on public.person_aliases;
drop policy if exists import_mappings_all on public.import_mappings;
drop policy if exists import_batches_all on public.import_batches;
drop policy if exists person_links_select on public.person_links;
create policy person_aliases_all on public.person_aliases for all to authenticated
  using (public.is_lead()) with check (public.is_lead());
create policy import_mappings_all on public.import_mappings for all to authenticated
  using (public.is_lead()) with check (public.is_lead());
create policy import_batches_all on public.import_batches for all to authenticated
  using (public.is_lead()) with check (public.is_lead());
-- Links are written only through link_person() / unlink_person().
create policy person_links_select on public.person_links for select to authenticated
  using (public.is_lead());

grant select, insert, update, delete on public.person_aliases, public.import_mappings, public.import_batches
  to authenticated;
grant select on public.person_links to authenticated;
grant all on public.person_aliases, public.import_mappings, public.import_batches, public.person_links
  to service_role;

-- 6. Link a former member (no sign-in) to a real account: their entries,
--    project levels and aliases move over; the record stays, hidden, so the
--    link can be undone. Allowed for the Director, or the server at sign-in
--    (automatic link on an exact email match).
create or replace function public.link_person(p_from uuid, p_to uuid, p_auto boolean default false)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  link_id uuid;
  moved uuid[];
  aliases uuid[];
begin
  if auth.uid() is not null and not public.is_director() then
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

  -- A running timer can't move onto someone who may have their own.
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
  values (p_from, p_to, moved, aliases, p_auto, auth.uid())
  returning id into link_id;
  return link_id;
end;
$$;

create or replace function public.unlink_person(p_link uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  l public.person_links;
begin
  if not public.is_director() then
    raise exception 'Only the Director can undo a link.';
  end if;
  select * into l from public.person_links where id = p_link and undone_at is null;
  if l.id is null then
    raise exception 'That link was already undone.';
  end if;
  update public.time_entries set user_id = l.from_user
  where id = any (l.entry_ids) and user_id = l.to_user;
  update public.person_aliases set user_id = l.from_user
  where id = any (l.alias_ids) and user_id = l.to_user;
  update public.profiles set merged_into = null where id = l.from_user;
  update public.person_links set undone_at = now() where id = l.id;
end;
$$;

revoke execute on function public.link_person(uuid, uuid, boolean) from public, anon;
revoke execute on function public.unlink_person(uuid) from public, anon;
grant execute on function public.link_person(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.unlink_person(uuid) to authenticated;
