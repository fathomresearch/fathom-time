@AGENTS.md

# Fathom Time: handoff notes for Claude Code

Internal Clockify replacement for Fathom Research & Strategy. Phases 1 to 4 were built in a claude.ai chat; Phases 5 to 8 in Claude Code. All phases are built and the app is live. Read this whole file before changing anything.

## The person you're working with

- Not a full-time developer. Uses a Mac, Terminal, and Chrome.
- Wants complete, working changes, exact commands, and click-by-click steps for any dashboard (Supabase, Google Cloud, Netlify, GitHub).
- Work one phase at a time. At the end of each phase say: which files changed, what to run, and what they should see when it works. Then wait for "next".
- Before large work, restate the plan briefly and ask about anything ambiguous.
- Writing style: concise, direct, no filler, no flattery. Tell them when they're wrong. No em dashes. Use "I" and "you". Minimal formatting.
- Don't present guesses as fact. Label unconfirmed claims [Unverified] or [Inference]. Cite a source with a link when referencing one.

## Stack

- Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind v4 (CSS-based config in `src/app/globals.css`, no tailwind.config). Middleware is called **proxy** in Next 16: `src/proxy.ts`.
- Supabase: Postgres, Auth (Google), Row-Level Security. `@supabase/ssr` for cookies.
- `lucide-react` for icons. No other UI libraries. SheetJS (`xlsx`, installed from cdn.sheetjs.com, loaded only when reading or writing a sheet) is approved for budget import/export. No date library: `src/lib/time.ts` does time zone math with `Intl`.
- Hosting: **Netlify free**, not Vercel (Vercel Hobby forbids commercial use). Live at https://fathom-time.netlify.app, deployed automatically on every push to `main` of the private repo https://github.com/fathomresearch/fathom-time. Env vars are set in Netlify; `netlify.toml` sets Node 22 and `SECRETS_SCAN_OMIT_KEYS` (the public values that would otherwise fail Netlify's secret scan).
- Supabase Site URL and Redirect URLs, and Google OAuth JavaScript origins, include both the Netlify URL and http://localhost:3000.
- The user pushes to GitHub from their own Terminal (a personal access token is saved in the macOS keychain; it expires Oct 30, 2026).
- Project lives at `~/Documents/Fathom/fathom-time`. Run with `npm run dev` on http://localhost:3000.

## Decisions already made (don't reopen without asking)

- **Sign-up is open.** Anyone with a Google account can sign in and becomes an employee. `ALLOWED_EMAIL_DOMAIN` is blank. Most people use Gmail. Deactivate in Manage team is the off switch.
- **Director** (formerly "boss") = emails in `BOSS_EMAILS`, applied only on a person's first sign-in (`profiles.role_initialized`). After that the database role is the source of truth. Currently `admin@fathomresearch.ai` for testing; will switch to the real boss later.
- **Time zones:** each person picks one in Settings (default from browser on first sign-in, fallback America/Chicago). Everything is shown in the **viewer's** zone, like Clockify's "Viewer time zone". Entries also store `tz` (owner's zone when recorded).
- **Week starts Sunday.**
- **Entries crossing midnight** count on the day they start; the end time shows "+1".
- **Running timers are excluded** from totals, Timesheet and CSV. "Working now" shows them live.
- **Roles (migration 003):** Director (was boss), Manager, Analyst (was employee). Everyone can add, edit, archive and delete projects, tasks and clients. Director and Manager both get Team Overview, see and edit everyone's time, CSV, budgets and imports. Only the Director moves people between Manager and Analyst; the Director role is fixed (can't be given, removed or deactivated in the app; change it only in SQL). Director can deactivate anyone else; a Manager only Analysts. Roles double as budget levels; a person's level on a project is saved when they first log time on it (promotions only affect new projects). `isLead(role)` in `src/lib/types.ts`; `is_lead()` / `is_director()` in SQL. `BOSS_EMAILS` still names the first-sign-in Director.
- **Budgets (migration 004):** hours per task per level (`task_budgets`), replaced by import or edited cell by cell; `project_budgets` records who changed it last; `project_levels` stores each person's level per project (set by trigger on their first entry). Status colors: green under the warn line, yellow from warn to over, red + flag above over; no budget = no color or flag (hours shown plain). Thresholds are per project (`project_budgets.warn_pct` / `over_pct`, migration 005; defaults 90 / 100), editable on the budget page. Level colors are one soft navy scale with transparency (Director darkest, Analyst lightest), `LEVEL_STYLE` in `src/lib/budget.ts`. The budget page is always editable and saves as you type; By project shows "Add budget" / "Edit budget". Budget page `/team/projects/[projectId]` (leads only): budget by level, actual by level, actual by person (ordered Director → Manager → Analyst); Excel export only (PDF was dropped: the table is too wide to print); "Show names" off by default. Template and import in `src/lib/budgetSheet.ts` (finds the Director/Manager/Analyst header row). By project tab is all-time with optional From/To (all active projects listed at All time, even with 0h); budget use always compares all-time hours. Team Overview header on the By project tab: "Import Project/Budget" (hover menu: Import opens the file picker, Template serves `public/templates/fathom-time-budgeted-hours-template.xlsx` as "Fathom Time Budgeted Hours Template.xlsx"), Export CSV. Import modes: "Create as a new project" / "Update an existing project" (replaces its budget). Ticked tasks must have a name (not "No task").
- **Tags:** everyone can create, rename and delete.
- **No locking.** Past entries are always editable.
- **Duration input follows Clockify:** `1`-`99` = minutes, `100`+ = last two digits are minutes (`200` = 2:00), decimals = hours, `1:30`, `2h`, `90m`. The **Timesheet uses `parseDurationInput(text, "hours")`** so a plain `8` means 8 hours.
- **Timer vs manual mode** is remembered per browser in localStorage (`fathom-time:entry-mode`). Default is timer.
- **Desktop only** for now.
- Colors follow fathomresearch.ai: navy is `#0A1628` (brand guide said `#071A2B`). Tokens in `globals.css`.

## Environment (`.env.local`, never commit)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # publishable key, sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=          # secret key, sb_secret_..., server only
BOSS_EMAILS=admin@fathomresearch.ai
ALLOWED_EMAIL_DOMAIN=               # blank = anyone with Google
DEFAULT_TIMEZONE=America/Chicago
```

## Database (`supabase/`)

- `migrations/001_schema.sql` was run in the Supabase SQL Editor. Tables: `profiles`, `clients`, `projects`, `tasks` (tasks = stages; has `budget_hours`, `sort_order`, `archived`), `tags`, `time_entries` (`end_at` null = running; `tz`; `created_by`, `updated_by`, `updated_at`), `time_entry_tags`, `favorites`.
- `migrations/002_manager_role.sql`: manager role, `can_manage_projects()`, project/task/client write policies for boss + manager, `project_hours()` (boss: everyone; others: own).
- `migrations/003_director_manager_analyst.sql`: role rename, `is_director()`, `is_lead()`, new profile guard, projects open to everyone, `project_hours()` for leads. Drops `is_boss()`, `can_manage_projects()`, `guard_archive()`.
- Helpers `is_director()`, `is_lead()`, `is_active_user()`. RLS on every table; analysts only touch their own entries; directors and managers touch everyone's.
- Triggers: profile created on sign-up; guards on role/active changes (boss can't demote or deactivate self); (the archive guard was removed in 003; anyone can archive); `created_by` / `updated_by` stamped from `auth.uid()` so "Edited by" can't be faked; a task must belong to the entry's project; inserting a running entry stops the person's other running entry.
- FK `on delete restrict` from `time_entries` to projects and tasks: deleting a project or task with time fails. Show "Archive it instead."
- Demo data: `seed/seed_demo.sql` (all demo IDs start with `d0000000`), removal scripts in `seed/`. `tests/rls_check.sql` creates its own temporary test people (IDs `e0000000…`), removes them at the end, and must return 22 rows with pass = true. It doesn't need the demo data.
- Schema changes: write a new numbered migration file (`002_...sql`) and tell the user to run it in the SQL Editor. Don't edit 001.

## Code map

- `src/lib/budget.ts` (levels, status colors), `src/lib/budgetSheet.ts` (xlsx read/write), `src/components/budget/` (BudgetView, BudgetImport, useProjectBudget), `src/components/team/useTimeReport.ts` (all-time report via `time_report()`).
- `src/lib/time.ts`: zone math, day keys (`YYYY-MM-DD` in a zone), `weekStart` (Sunday), formatting, `parseTimeInput`, `parseDurationInput`.
- `src/lib/data.ts`: row types, `ENTRY_SELECT`, `STANDARD_STAGES`, `PROJECT_COLORS` (10 colors).
- `src/lib/useCatalog.ts`: projects, clients, tasks, tags, favorites, people, plus create/rename/delete helpers.
- `src/lib/auth.ts`: `getProfile`, `requireProfile` (server). `src/lib/config.ts`: env helpers.
- `src/lib/supabase/`: `client.ts` (browser), `browser.ts` (shared `sb()`), `server.ts`, `admin.ts` (secret key), `proxy.ts` (session refresh + redirect to /login).
- `src/components/tracker/`: `TimeTracker` (takes `ownerId` + `viewer`, reusable for the Phase 7 person page), `useEntries` (load, 20 s refresh, all mutations), `EntryBar`, `EntryList`, `EntryRow`, `ProjectPicker` (+ `CreateProjectForm`), `TagPicker`, `DatePicker`, `Popover`, `InlineInput`, `BillableToggle`.
- `src/components/Toaster.tsx` (`toast("...")`), `ConfirmDialog.tsx`, `NoAccess.tsx`, `PageHeader.tsx`, `Sidebar.tsx`.
- Pages: `src/app/(app)/{tracker,timesheet,projects,team,team/[userId],settings}`, `src/app/login`, `src/app/auth/{callback,signout}`.

## Brand

Teal `#00D6B3` accent (primary buttons use navy text on teal for contrast), Navy `#0A1628` (sidebar, headings), Blue `#2274F8` (links and interactive states only), Deep Purple `#3A3556` (avatars), grays `#F1F1F1` `#DADCDD` `#BBBCC0`, Charcoal `#2C3E50` body text, canvas `#F4F6F7`. Montserrat for headings, nav and buttons (`font-display`); IBM Plex Sans for body; `.tabular` class for times. White cards, 1px light-gray borders, no heavy shadows. Calm and professional.

## Phase specs (all built; kept for reference)

### Phase 5: Timesheet (everyone)
- Weekly grid with week navigation (‹ This week ›). Rows = project + task, columns Sun to Sat, then row total. Footer row with daily totals and grand total. Weekends lightly shaded; today's column header blue.
- Rows appear automatically for any project + task with time that week.
- "⊕ Add new row" opens the project picker.
- "Copy last week": rows only, or rows with time (fills only empty cells).
- A cell accepts `8`, `1:30`, `1.5`, `90m` (plain numbers = hours here). Saving sets that day's total for that project + task: no entries → create one starting 9:00 AM (owner's zone); increasing → extend the latest entry; decreasing → trim or delete from the latest; skip running entries.
- An empty row with 0 total can be removed with ×.
- Timesheet and Tracker must always agree.

### Phase 6: Projects (everyone)
- Search, Active / Archived toggle.
- Table: color dot (click to pick from the 10 colors) + inline-editable name; client dropdown; type pill Client (teal) / Internal (gray), click to switch; task count; hours (boss sees everyone's, employees their own); favorite star; boss only: archive/restore and delete (blocked if any time; message "Archive it instead.").
- Expanding a row: task chips with "+ Add task" (boss can delete tasks with no time), who created the project, checkbox "New entries are billable by default".
- "+ New project" uses the same form as the picker.

### Phase 7: Team Overview (boss only) + person page + CSV
- Header: week navigation ("Back to this week" when elsewhere) and Export CSV for the range.
- Tiles: Team hours, Billable share %, People who logged time, Working right now (pulsing teal dot if > 0).
- Tab "By person": avatar initials, teal dot if running, name, "Working now · Project: Task · 01:23:05" or "Not clocked in", hours per day ("7.5h" or "–"), Total, Billable; footer totals; row opens the person page.
- Tab "By project": horizontal bars, project → stage/task → each person's hours and % share within the stage; single teal color scaled to the largest item at that level. Footnote: "Share of each person within a stage is the starting point for contribution-based pay later."
- Tab "Manage team": role dropdown (Employee/Boss), Deactivate/Reactivate. Boss can't demote or deactivate self. Deactivation should also ban the user in Supabase Auth via the admin client.
- Person page `/team/[userId]`: back link, avatar, name, live status, week navigation, tiles (hours, billable + %), "Hours by project" bars, and `<TimeTracker ownerId={userId} viewer={boss} />` so the boss can add, edit, delete, start or stop their time.
- CSV: boss exports everyone, employees only themselves, date range. Columns: Date, User, Client, Project, Project type, Task/Stage, Description, Tags, Billable, Start, End, Hours (decimal, 2 places). Totals must match Team Overview.

### Phase 8: Polish and deploy
- Empty and loading states, error toasts, keyboard behavior.
- Deploy to Netlify free from a private GitHub repo in the `fathomresearch` GitHub account. Add the Netlify URL to Supabase (Site URL + Redirect URLs) and Google OAuth (JavaScript origins).
- Optional: nightly backup (Supabase free has no backups), "Email me a sign-in link" for non-Google users, flag timers running over 10 hours.
- Built: error/not-found/loading pages, 10-hour timer warning, `.github/workflows/backup.yml` (nightly `supabase db dump`, saved as a 90-day artifact; needs the `SUPABASE_DB_URL` repo secret, session pooler URI). Email sign-in link skipped (decided not needed).

## Later (don't build now)
Stage-based (contribution-based) pay: `budget_hours` on tasks, a `contributions` table (project_id, task_id, user_id, percent), efficiency = budgeted hours / actual hours.

## Checks before handing back
- `npx eslint src` and `npx tsc --noEmit` pass.
- `npm run build` passes.
- Keep `.env.local` out of git.
