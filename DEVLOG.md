# Fathom Time: development log

A plain-English record of what was built, when, and why. Newest first.
Each entry says what changed, the decisions made, any database change to run,
and whether it is live. Code-level detail lives in `CLAUDE.md` and the git history.

## Current status (updated 2026-10-06)

- **Live:** https://fathom-time.netlify.app (moving to https://time.fathomresearch.ai). Running Stage 2 plus review fixes (`20ba36d`).
- **Database:** migrations 001 to 007 run. Security test (`supabase/tests/rls_check.sql`): 35 checks.
- **Built, not live yet:** Stage 3a (import matching). Netlify deploys are paused until credits reset on **2026-10-10**. Test on localhost (`npm run dev`) meanwhile.
- **Next:** Stage 3b (review and import Clockify / Jibble entries), then push 3a + 3b together.

---

## 2026-10-06: Custom domain

- Moving the site to **time.fathomresearch.ai** (DNS at GoDaddy, CNAME `time` → `fathom-time.netlify.app`).
- Supabase Site URL / Redirect URLs and Google OAuth origins get the new address. The netlify.app address keeps working.
- No code change needed: sign-in returns to whatever address it started from.

## 2026-10-02: Netlify credits ran out

- Free plan: 300 credits per month, 15 per production deploy (about 20 deploys a month). Many small pushes used them up.
- Billing period Sep 10 to Oct 9; credits reset **Oct 10**. The site stays online meanwhile.
- **Decision:** push once per finished stage, not after every tweak. Test on localhost first.

## 2026-10-02: Stage 3a, import setup and matching

- New page **Team Overview → Import time** (Directors and Managers): read a Clockify detailed CSV or Jibble raw time entries CSV, match **people**, then **clients, projects and tasks**. Choices are remembered, so each name is confirmed once.
- **Former members:** people in old files who never sign in get a record with no sign-in (deactivated, hours still count). Linked to a real account automatically when someone signs in with the same email, otherwise by the Director in Manage team (with Undo).
- Checked against the real exports: Clockify 1,401 entries (Mar 17 2025 to Aug 19 2026), per-project totals match Clockify's own; Jibble 194 entries (Jul 15 to Sep 29 2026), 153 of them hours-only.
- **Decisions:** Clockify times read as Central (Chicago); Jibble uses each row's zone. Projects created by an import are active (not archived) by default. Similar names are only suggestions; first names must agree.
- **Database:** `007_import_setup.sql` (run).
- **Live:** no (waiting for credits).

## 2026-10-02: Code review fixes

- A reviewer checked Stages 1 and 2. Fixed: only Directors/Managers can delete a project or task that has a budget; only you or the Director can change your name or time zone; totals load in pages past 1,000 rows; clean-up script used the old role name.
- **Database:** `006_protect_budgets_and_profiles.sql` (run).
- **Live:** yes.

## 2026-10-02: Stage 2, budgets and all-time By project

- **By project** tab: all time by default (optional date range), grouped client → project → task → person, every active project listed, budget-use badge, Add budget / Edit budget.
- **Budget page** per project: budgeted hours by level (Director / Manager / Analyst), actual hours by level and by person, always editable, autosaves. Status colors: green under the yellow line, yellow, red with a flag above the red line (defaults 90% / 100%, changeable per project). No budget = no color. Level colors are a soft navy scale.
- **Import Project/Budget** (Excel): template download ("Fathom Time Budgeted Hours Template"), editable preview, create a new project or update an existing one, duplicate names blocked. Export to Excel (PDF dropped: too wide).
- One rounded date-range picker used everywhere (By project, Export CSV).
- **Database:** `004_budgets.sql`, `005_budget_thresholds.sql` (run).
- **Live:** yes.

## 2026-10-02: Stage 1, roles renamed

- Roles are now **Director** (was boss), **Manager**, **Analyst** (was employee). Everyone can edit projects; Directors and Managers share Team Overview. Only the Director changes roles; the Director role is fixed. Managers can deactivate Analysts.
- Roles double as budget levels; a person's level per project is saved when they first log time there.
- Security test rewritten to create its own temporary test people.
- **Database:** `003_director_manager_analyst.sql` (run).
- **Live:** yes.

## 2026-10-01 to 2026-10-02: Team feedback round

- Team asked for: importing Clockify + Jibble history without duplicates, an all-time project view, removing test accounts, and budgets per case.
- Demo people removed; real team: Danni Bayn (Director), Tom Colville (Manager), Ellaine Tsai, Kelvin Wong, Marcel Iam (Analysts).

## 2026-09-30: Phases 5 to 8 and first deploy

- **Phase 5** Timesheet (weekly grid; plain numbers are hours). **Phase 6** Projects and Clients. **Phase 7** Team Overview, person page, CSV export. **Phase 8** error pages, 10-hour timer warning, nightly database backup (GitHub Actions, 90 days).
- Deployed to **Netlify** from the private GitHub repo `fathomresearch/fathom-time`; Google sign-in set up for the live address.
- **Database:** `002_manager_role.sql` (later replaced by 003).

## 2026-09-28 to 2026-09-29: Phases 1 to 4 (built in a claude.ai chat)

- Sign-in with Google, database schema with row-level security, app shell, Settings, Time Tracker.
- **Database:** `001_schema.sql`.

---

## How to add an entry

Add new entries at the top (under "Current status"), and update "Current status".

```
## YYYY-MM-DD: Short title

- What changed, in plain words (what someone would notice).
- **Decisions:** anything chosen that someone might later ask "why?" about.
- **Database:** migration file(s) to run, and whether they've been run.
- **Live:** yes / no (and why not).
```
