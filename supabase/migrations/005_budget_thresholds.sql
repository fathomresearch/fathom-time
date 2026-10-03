-- =====================================================================
-- Fathom Time: 005 Budget thresholds per project
-- Run in the Supabase SQL Editor, after 004.
--
-- warn_pct: actual hours at or above this % of budget show amber (default 90)
-- over_pct: actual hours above this % of budget show red and flagged (default 100)
-- =====================================================================

alter table public.project_budgets
  add column if not exists warn_pct numeric(5, 1) not null default 90,
  add column if not exists over_pct numeric(5, 1) not null default 100;

alter table public.project_budgets drop constraint if exists project_budgets_thresholds_check;
alter table public.project_budgets
  add constraint project_budgets_thresholds_check
  check (warn_pct > 0 and over_pct > 0 and warn_pct <= over_pct and over_pct <= 1000);
