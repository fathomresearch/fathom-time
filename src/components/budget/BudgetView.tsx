"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, Flag, Plus, X } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import InlineInput from "@/components/tracker/InlineInput";
import { toast } from "@/components/Toaster";
import BudgetImport from "@/components/budget/BudgetImport";
import { Tile } from "@/components/team/bits";
import { useProjectBudget } from "@/components/budget/useProjectBudget";
import { useCatalog } from "@/lib/useCatalog";
import {
  LEVELS,
  LEVEL_LABELS,
  LEVEL_STYLE,
  STATUS_CLASS,
  budgetStatus,
  type Thresholds,
  emptyLevels,
  hoursCell,
  sumLevels,
  type Level,
  type LevelHours,
} from "@/lib/budget";
import { downloadSheet } from "@/lib/budgetSheet";
import { displayName } from "@/lib/people";
import { percent } from "@/lib/report";
import { formatDateTime, parseDurationInput } from "@/lib/time";
import type { Viewer } from "@/components/tracker/TimeTracker";

type Line = {
  id: string | null; // null = time logged without a task
  name: string;
  archived: boolean;
  budget: LevelHours;
  actual: LevelHours;
  byPerson: Map<string, number>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Budget vs actual for one project: budgeted hours by level, actual hours by
 * level (colored against the budget) and by person, each colored by level.
 */
export default function BudgetView({ projectId, viewer }: { projectId: string; viewer: Viewer }) {
  const router = useRouter();
  const catalog = useCatalog(viewer.id);
  const budget = useProjectBudget(projectId);
  const [showNames, setShowNames] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [newTask, setNewTask] = useState<string | null>(null);

  const project = catalog.projectById.get(projectId);
  const client = project?.client_id ? catalog.clientById.get(project.client_id) : undefined;

  const levelOf = (userId: string): Level => budget.levels.get(userId) ?? "analyst";

  const { lines, people, totals } = useMemo(() => {
    const projectTasks = catalog.tasks
      .filter((t) => t.project_id === projectId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const byTask = new Map<string | null, Map<string, number>>();
    const peopleSet = new Set<string>();
    for (const r of budget.rows) {
      const m = byTask.get(r.task_id) ?? new Map<string, number>();
      m.set(r.user_id, (m.get(r.user_id) ?? 0) + r.seconds / 3600);
      byTask.set(r.task_id, m);
      peopleSet.add(r.user_id);
    }
    const makeLine = (id: string | null, name: string, archived: boolean): Line => {
      const byPerson = byTask.get(id) ?? new Map<string, number>();
      const actual = emptyLevels();
      for (const [u, h] of byPerson) actual[levelOf(u)] += h;
      return { id, name, archived, budget: (id && budget.budgets.get(id)) || emptyLevels(), actual, byPerson };
    };
    const list = projectTasks
      .map((t) => makeLine(t.id, t.name, t.archived))
      .filter((l) => !l.archived || sumLevels(l.budget) > 0 || l.byPerson.size > 0);
    if (byTask.has(null)) list.push(makeLine(null, "No task", false));

    const order = (u: string) => LEVELS.indexOf(levelOf(u));
    const ppl = [...peopleSet].sort(
      (a, b) =>
        order(a) - order(b) ||
        displayName(catalog.personById.get(a)).localeCompare(displayName(catalog.personById.get(b)))
    );
    const t = { budget: emptyLevels(), actual: emptyLevels(), byPerson: new Map<string, number>() };
    for (const l of list) {
      for (const lv of LEVELS) {
        t.budget[lv] += l.budget[lv];
        t.actual[lv] += l.actual[lv];
      }
      for (const [u, h] of l.byPerson) t.byPerson.set(u, (t.byPerson.get(u) ?? 0) + h);
    }
    return { lines: list, people: ppl, totals: t };
    // levelOf reads budget.levels, listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.tasks, catalog.personById, budget.rows, budget.budgets, budget.levels, projectId]);

  const budgetTotal = sumLevels(totals.budget);
  const actualTotal = sumLevels(totals.actual);
  const overCount = lines.filter(
    (l) => budgetStatus(sumLevels(l.actual), sumLevels(l.budget), budget.thresholds) === "over"
  ).length;
  const editor = budget.meta?.updated_by ? catalog.personById.get(budget.meta.updated_by) : undefined;
  const nameOf = (u: string) => displayName(catalog.personById.get(u));

  const setBudget = (taskId: string, level: Level, text: string) => {
    const clean = text.trim();
    const secs = clean ? parseDurationInput(clean, "hours") : 0;
    if (secs === null) return toast("Type hours, like 8, 1.5 or 1:30.");
    budget.setCell(taskId, level, round2(secs / 3600));
  };

  const addTask = async () => {
    const name = (newTask ?? "").trim();
    if (!name) return setNewTask(null);
    if (lines.some((l) => l.name.toLowerCase() === name.toLowerCase()))
      return toast(`"${name}" is already a task on this project.`);
    const maxOrder = Math.max(0, ...catalog.tasks.filter((t) => t.project_id === projectId).map((t) => t.sort_order));
    if (await catalog.createTask(projectId, name, maxOrder + 1)) setNewTask("");
  };

  const exportExcel = async () => {
    setExportOpen(false);
    const head1: (string | null)[] = [
      "Task",
      "Budgeted hours (by level)",
      null,
      null,
      null,
      "Actual hours (by level)",
      null,
      null,
      null,
    ];
    const head2: (string | null)[] = [
      null,
      ...LEVELS.map((l) => LEVEL_LABELS[l]),
      "Total",
      ...LEVELS.map((l) => LEVEL_LABELS[l]),
      "Total",
    ];
    if (showNames && people.length) {
      head1.push("Actual hours (by person)", ...people.slice(1).map(() => null));
      head2.push(...people.map(nameOf));
    }
    const row = (name: string, b: LevelHours, a: LevelHours, byPerson: Map<string, number>) => [
      name,
      ...LEVELS.map((l) => round2(b[l]) || null),
      round2(sumLevels(b)) || null,
      ...LEVELS.map((l) => round2(a[l]) || null),
      round2(sumLevels(a)) || null,
      ...(showNames ? people.map((u) => round2(byPerson.get(u) ?? 0) || null) : []),
    ];
    await downloadSheet(
      `${project?.name ?? "Project"} budget.xlsx`.replace(/[\\/:*?"<>|]/g, "-"),
      "Budget vs actual",
      [
        [project?.name ?? ""],
        ["Client", client?.name ?? ""],
        ["Exported", new Date().toLocaleDateString("en-US")],
        [],
        head1,
        head2,
        ...lines.map((l) => row(l.name, l.budget, l.actual, l.byPerson)),
        row("Total", totals.budget, totals.actual, totals.byPerson),
      ],
      [44, ...Array(8).fill(11), ...(showNames ? people.map(() => 11) : [])]
    );
  };

  if (!catalog.loaded || !budget.loaded) {
    return <p className="py-10 text-center text-sm text-charcoal/60">Loading…</p>;
  }
  if (!project) {
    return <p className="py-10 text-center text-sm text-charcoal/70">This project doesn&apos;t exist anymore.</p>;
  }

  const hasBudget = budgetTotal > 0;
  const personCls = showNames ? "" : "print:hidden";
  const cols = [...LEVELS, "total" as const];
  const groupStart = "border-l border-light";

  const levelHead = (l: Level | "total", key: string, first: boolean) => (
    <th key={key} className={`min-w-[76px] px-2 pb-2 pt-1 font-normal ${first ? groupStart : ""}`}>
      {l === "total" ? (
        <span className="font-display text-xs font-semibold text-charcoal/70">Total</span>
      ) : (
        <span className={`inline-flex items-center gap-1.5 font-display text-xs font-semibold text-navy`}>
          <span className={`h-2 w-2 rounded-full ${LEVEL_STYLE[l].dot}`} />
          {LEVEL_LABELS[l]}
        </span>
      )}
    </th>
  );

  const budgetCells = (id: string | null, name: string, b: LevelHours, total = false) =>
    cols.map((l, i) => {
      if (l === "total")
        return (
          <td key={l} className="tabular px-2 py-2 text-center font-semibold text-navy">
            {hoursCell(sumLevels(b))}
          </td>
        );
      return (
        <td key={l} className={`px-1 py-1 text-center ${i === 0 ? groupStart : ""} ${LEVEL_STYLE[l].faint}`}>
          {id && !total ? (
            <InlineInput
              focusClass="focus:border-medium"
              ariaLabel={`${LEVEL_LABELS[l]} budget for ${name}`}
              value={hoursCell(b[l])}
              placeholder="–"
              onCommit={(text) => setBudget(id, l, text)}
              className="tabular w-full text-center text-blue placeholder:text-medium"
            />
          ) : (
            <span className={`tabular block py-1 ${total ? "font-semibold text-navy" : "text-charcoal"}`}>
              {hoursCell(b[l])}
            </span>
          )}
        </td>
      );
    });

  const actualCells = (a: LevelHours, b: LevelHours) =>
    cols.map((l, i) => {
      const act = l === "total" ? sumLevels(a) : a[l];
      const bud = l === "total" ? sumLevels(b) : b[l];
      const status = budgetStatus(act, bud, budget.thresholds);
      return (
        <td
          key={l}
          className={`tabular px-2 py-2 text-center ${i === 0 ? groupStart : ""} ${l === "total" ? "font-semibold" : ""}`}
        >
          {status !== "none" ? (
            <span className={`inline-block min-w-[46px] rounded-full px-2 py-0.5 ${STATUS_CLASS[status]}`}>
              {hoursCell(act) || "0.0"}
            </span>
          ) : (
            // No budget for this cell: show the hours plainly, without a color.
            <span className="inline-block min-w-[46px] px-2 py-0.5 text-charcoal">{hoursCell(act)}</span>
          )}
        </td>
      );
    });

  const personCells = (byPerson: Map<string, number>, bold = false) =>
    people.map((u, i) => (
      <td
        key={u}
        className={`tabular px-2 py-2 text-center ${i === 0 ? groupStart : ""} ${LEVEL_STYLE[levelOf(u)].faint} ${bold ? "font-semibold text-navy" : "text-charcoal"} ${personCls}`}
      >
        {hoursCell(byPerson.get(u) ?? 0)}
      </td>
    ));

  return (
    <>
      <Link
        href="/team?tab=project"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline print:hidden"
      >
        <ChevronLeft size={16} /> By project
      </Link>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 font-display text-2xl font-semibold text-navy">
            <span className="h-3 w-3 shrink-0 rounded-full print:hidden" style={{ background: project.color }} />
            <span className="truncate">{project.name}</span>
          </h1>
          <p className="mt-1 text-sm text-charcoal">
            {client?.name ?? "No client"}
            {budget.meta && (
              <span className="text-charcoal/60 print:hidden">
                {" "}
                · Budget last changed {formatDateTime(new Date(budget.meta.updated_at), viewer.timezone)}
                {editor ? ` by ${displayName(editor)}` : ""}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 print:hidden">
          <BudgetImport
            catalog={catalog}
            projectId={projectId}
            onImported={(id) => (id === projectId ? budget.reload() : router.push(`/team/projects/${id}`))}
          />
          <Popover
            open={exportOpen}
            onOpenChange={setExportOpen}
            label="Export"
            align="right"
            width={250}
            triggerClassName="flex h-9 items-center gap-1.5 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy hover:brightness-95"
            trigger={<>Export</>}
          >
            <div className="grid gap-0.5 p-2">
              <label className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={showNames}
                  onChange={(e) => setShowNames(e.target.checked)}
                  className="h-4 w-4 accent-[#00D6B3]"
                />
                Show names
              </label>
              <div className="my-1 border-t border-light" />
              <button
                type="button"
                onClick={exportExcel}
                className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-navy hover:bg-lightest"
              >
                <Download size={15} /> Excel (.xlsx)
              </button>
            </div>
          </Popover>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Tile label="Budget" value={hasBudget ? `${hoursCell(budgetTotal)}h` : "None yet"} />
        <Tile label="Actual" value={`${hoursCell(actualTotal) || "0.0"}h`} sub="All time" />
        <Tile
          label="Budget used"
          value={hasBudget ? percent(actualTotal / budgetTotal) : "–"}
          sub={
            hasBudget
              ? { under: "On track", near: "Close to budget", over: "Over budget", none: "" }[
                  budgetStatus(actualTotal, budgetTotal, budget.thresholds)
                ]
              : undefined
          }
        />
        <Tile label="Tasks over budget" value={String(overCount)} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-charcoal/80">
        <ThresholdLegend value={budget.thresholds} onChange={budget.setThresholds} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-light bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="font-display text-[11px] font-semibold uppercase tracking-wide text-charcoal/60">
              <th className="px-4 pb-1 pt-3 text-left">Task</th>
              <th colSpan={4} className={`px-2 pb-1 pt-3 ${groupStart}`}>
                Budgeted hours
              </th>
              <th colSpan={4} className={`px-2 pb-1 pt-3 ${groupStart}`}>
                Actual hours
              </th>
              {people.length > 0 && (
                <th colSpan={people.length} className={`px-2 pb-1 pt-3 ${groupStart} ${personCls}`}>
                  By person
                </th>
              )}
              <th className="print:hidden" aria-label="Actions" />
            </tr>
            <tr className="border-b border-light">
              <th />
              {cols.map((l, i) => levelHead(l, `b${l}`, i === 0))}
              {cols.map((l, i) => levelHead(l, `a${l}`, i === 0))}
              {people.map((u, i) => {
                const lv = levelOf(u);
                return (
                  <th
                    key={u}
                    title={`${nameOf(u)} · ${LEVEL_LABELS[lv]} on this project`}
                    className={`min-w-[76px] px-2 pb-2 pt-1 font-normal ${i === 0 ? groupStart : ""} ${personCls}`}
                  >
                    <span className={`inline-flex items-center gap-1.5 font-display text-xs font-semibold text-navy`}>
                      <span className={`h-2 w-2 shrink-0 rounded-full ${LEVEL_STYLE[lv].dot}`} />
                      <span className="truncate">{nameOf(u).split(" ")[0]}</span>
                    </span>
                  </th>
                );
              })}
              <th className="print:hidden" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={10 + people.length} className="px-4 py-10 text-center text-charcoal/70">
                  No tasks yet. Add one below, or use Import budget.
                </td>
              </tr>
            )}
            {lines.map((l) => {
              const over = sumLevels(l.actual) - sumLevels(l.budget);
              const flagged = budgetStatus(sumLevels(l.actual), sumLevels(l.budget), budget.thresholds) === "over";
              return (
                <tr key={l.id ?? "none"} className="border-b border-light last:border-0">
                  <td className="py-1 pl-2 pr-2">
                    <div className="flex min-w-[220px] items-center gap-1.5">
                      {l.id ? (
                        <InlineInput
                          focusClass="focus:border-medium"
                          ariaLabel="Task name"
                          value={l.name}
                          onCommit={(name) => {
                            if (!name.trim()) return toast("A task needs a name.");
                            catalog.updateTask(l.id!, { name });
                          }}
                          className={`min-w-0 flex-1 ${l.archived ? "text-charcoal/60 line-through" : "text-navy"}`}
                        />
                      ) : (
                        <span
                          className={`min-w-0 flex-1 px-2 py-1.5 ${
                            l.id
                              ? l.archived
                                ? "text-charcoal/60 line-through"
                                : "text-navy"
                              : "italic text-charcoal/70"
                          }`}
                        >
                          {l.name}
                        </span>
                      )}
                      {flagged && (
                        <span
                          title={`Over budget by ${over.toFixed(1)}h`}
                          className="flex shrink-0 items-center gap-1 rounded-full bg-[#FDE8E8] px-2 py-0.5 text-xs font-semibold text-danger"
                        >
                          <Flag size={11} fill="currentColor" /> +{over.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </td>
                  {budgetCells(l.id, l.name, l.budget)}
                  {actualCells(l.actual, l.budget)}
                  {personCells(l.byPerson)}
                  <td className="px-1 text-center print:hidden">
                    {l.id && l.byPerson.size === 0 && (
                      <button
                        type="button"
                        onClick={() => catalog.deleteTask(l.id!)}
                        aria-label={`Delete ${l.name}`}
                        title="Delete task (no time logged)"
                        className="rounded p-1 text-medium hover:bg-lightest hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-light print:hidden">
              <td colSpan={10 + people.length} className="px-3 py-2">
                {newTask === null ? (
                  <button
                    type="button"
                    onClick={() => setNewTask("")}
                    className="flex items-center gap-1 text-sm font-semibold text-teal hover:underline"
                  >
                    <Plus size={14} /> Add task
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      addTask();
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      autoFocus
                      value={newTask}
                      onChange={(e) => setNewTask(e.target.value)}
                      onBlur={() => !newTask.trim() && setNewTask(null)}
                      onKeyDown={(e) => e.key === "Escape" && setNewTask(null)}
                      placeholder="Task name"
                      aria-label="New task name"
                      className="h-8 w-72 rounded-md border border-light px-2.5 text-sm focus:border-medium focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="h-8 rounded-md bg-teal px-3 font-display text-xs font-semibold text-navy"
                    >
                      Add
                    </button>
                  </form>
                )}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-light">
              <td className="px-4 py-2.5 font-display text-xs font-semibold uppercase tracking-wide text-navy">
                Total
              </td>
              {budgetCells(null, "Total", totals.budget, true)}
              {actualCells(totals.actual, totals.budget)}
              {personCells(totals.byPerson, true)}
              <td className="print:hidden" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-charcoal/70 print:hidden">
        Changes save as you type. Click a budget number to change it (8, 1.5 or 1:30; clear it to remove). Actual hours
        are all-time and leave out running timers. Each person counts at the level they had when they first logged time
        on this project.
      </p>
    </>
  );
}

/** Status colors with editable lines: "Under 90% · 90 to 100% · Over 100%". */
function ThresholdLegend({ value, onChange }: { value: Thresholds; onChange: (t: Thresholds) => void }) {
  const commit = (key: "warn" | "over", text: string) => {
    const n = Math.round(Number(text.replace("%", "").trim()) * 10) / 10;
    if (!Number.isFinite(n) || n <= 0 || n > 1000) return toast("Type a percentage, like 90.");
    const next = { ...value, [key]: n };
    if (next.warn > next.over) return toast("The yellow line can't be above the red line.");
    onChange(next);
  };
  const pctInput = (key: "warn" | "over") => (
    <InlineInput
      focusClass="focus:border-medium"
      ariaLabel={key === "warn" ? "Yellow from (% of budget)" : "Red above (% of budget)"}
      value={`${value[key]}`}
      onCommit={(t) => commit(key, t)}
      className="tabular w-12 bg-white px-1 py-0 text-center text-xs ring-1 ring-inset ring-light/50 focus:ring-0"
    />
  );
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2 py-px ${STATUS_CLASS.under}`}>Under {value.warn}%</span>
      <span className={`rounded-full px-2 py-px ${STATUS_CLASS.near}`}>
        {value.warn} to {value.over}%
      </span>
      <span className={`rounded-full px-2 py-px ${STATUS_CLASS.over}`}>Over {value.over}%</span>
      <span className="ml-2 inline-flex items-center gap-1 text-charcoal/70 print:hidden">
        Yellow from {pctInput("warn")}% · red above {pctInput("over")}%
      </span>
    </span>
  );
}
