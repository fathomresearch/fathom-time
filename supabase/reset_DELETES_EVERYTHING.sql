-- =====================================================================
-- DANGER: deletes every Fathom Time table and all data in them.
-- Only for starting over during setup. Never run this after real use.
-- Signed-in accounts (Authentication > Users) are not deleted.
-- =====================================================================

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists
  public.task_budgets, public.project_budgets, public.project_levels,
  public.favorites, public.time_entry_tags, public.time_entries,
  public.tags, public.tasks, public.projects, public.clients, public.profiles
  cascade;

drop function if exists
  public.handle_new_user(), public.guard_profile_update(), public.guard_archive(),
  public.stamp_created_by(), public.time_entry_before_write(),
  public.is_boss(), public.is_active_user(), public.is_director(), public.is_lead(),
  public.can_manage_projects(), public.project_hours(), public.remember_project_level(),
  public.guard_budget_delete(), public.replace_project_budget(uuid, jsonb),
  public.set_task_budget(uuid, text, numeric), public.time_report(timestamptz, timestamptz, uuid);

-- Demo people live in auth.users; remove them too.
delete from auth.users where id::text like 'd0000000-0000-4000-a000-%';
