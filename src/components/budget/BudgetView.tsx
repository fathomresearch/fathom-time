"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Download, Flag, Plus, Printer, X } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import InlineInput from "@/components/tracker/InlineInput";
import { toast } from "@/components/Toaster";
import BudgetImport from "@/components/budget/BudgetImport";
import { useProjectBudget } from "@/components/budget/useProjectBudget";
import { useCatalog } from "@/lib/useCatalog";
import {
  LEVELS,
  LEVEL_LABELS,
  STATUS_CLASS,
  budgetStatus,
  emptyLevels,
  hoursCell,
  sumLevels,
  type Level,
  type LevelHours,
} from "@/lib/budget";
import { downloadSheet, downloadTemplate } from "@/lib/budgetSheet";
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

/** Budget vs actual for one project, laid out like the budget sheet. */
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
  const overCount = lines.filter((l) => budgetStatus(sumLevels(l.actual), sumLevels(l.budget)) === "over").length;
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
    const head1: (string | null)[] = ["Task", "Budgeted hours (by level)", null, null, null, "Actual hours (by level)", null, null, null];
    const head2: (string | null)[] = [null, ...LEVELS.map((l) => LEVEL_LABELS[l]), "Total", ...LEVELS.map((l) => LEVEL_LABELS[l]), "Total"];
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

  const levelCells = (h: LevelHours, cls = "") =>
    [...LEVELS, "total" as const].map((l, i) => (
      <td
        key={l}
        className={`tabular px-2 py-2 text-center ${i === 0 ? "border-l border-light" : ""} ${l === "total" ? "font-semibold" : ""} ${cls}`}
      >
        {hoursCell(l === "total" ? sumLevels(h) : h[l])}
      </td>
    ));

  const actualCells = (a: LevelHours, b: LevelHours) =>
    [...LEVELS, "total" as const].map((l, i) => {
      const act = l === "total" ? sumLevels(a) : a[l];
      const bud = l === "total" ? sumLevels(b) : b[l];
      const status = budgetStatus(act, bud);
      return (
        <td
          key={l}
          className={`tabular px-2 py-2 text-center ${i === 0 ? "border-l border-light" : ""} ${l === "total" ? "font-semibold" : ""}`}
        >
          {status !== "none" && (
            <span className={`inline-block min-w-[44px] rounded px-1.5 py-0.5 ${STATUS_CLASS[status]}`}>{hoursCell(act) || "0.0"}</span>
          )}
        </td>
      );
    });

  const personCls = showNames ? "" : "print:hidden";

  return (
    <>
      <Link href="/team?tab=project" className="mb-3 inline-flex items-center gap-1 text-sm text-blue hover:underline print:hidden">
        <ChevronLeft size={16} /> By project
      </Link>

      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-navy">
            <span className="h-3 w-3 shrink-0 rounded-full print:hidden" style={{ background: project.color }} />
            <span className="truncate">{project.name}</span>
          </h1>
          <p className="mt-0.5 text-sm text-charcoal/80">
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
          <BudgetImport catalog={catalog} projectId={projectId} onImported={(id) => (id === projectId ? budget.reload() : router.push(`/team/projects/${id}`))} />
          <button
            type="button"
            onClick={() => downloadTemplate()}
            className="flex h-9 items-center gap-1.5 rounded-md border border-light bg-white px-3 text-sm font-medium text-navy hover:bg-lightest"
          >
            <Download size={15} /> Template
          </button>
          <Popover
            open={exportOpen}
            onOpenChange={setExportOpen}
            label="Export"
            align="right"
            width={240}
            triggerClassName="flex h-9 items-center gap-1.5 rounded-md bg-teal px-3 font-display text-sm font-semibold text-navy hover:brightness-95"
            trigger={<>Export</>}
          >
            <div className="grid gap-1 p-2">
              <label className="flex items-center gap-2 px-2 py-1.5 text-sm text-charcoal">
                <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} className="h-4 w-4 accent-[#00D6B3]" />
                Show names
              </label>
              <button type="button" onClick={exportExcel} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-lightest">
                <Download size={15} /> Excel (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => {
                  setExportOpen(false);
                  setTimeout(() => window.print(), 50);
                }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-lightest"
              >
                <Printer size={15} /> PDF (print, then Save as PDF)
              </button>
            </div>
          </Popover>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-4 gap-4">
        {[
          ["Budget", budgetTotal ? `${hoursCell(budgetTotal)}h` : "None yet"],
          ["Actual", `${hoursCell(actualTotal) || "0.0"}h`],
          ["Budget used", budgetTotal ? percent(actualTotal / budgetTotal) : "–"],
          ["Tasks over budget", String(overCount)],
        ].map(([label, value], i) => (
          <div key={label} className="rounded-lg border border-light bg-white px-5 py-3">
            <p className="text-xs font-medium text-charcoal/70">{label}</p>
            <p
              className={`mt-0.5 font-display text-xl font-semibold ${
                (i === 2 && budgetTotal && STATUS_CLASS[budgetStatus(actualTotal, budgetTotal)].includes("danger")) || (i === 3 && overCount)
                  ? "text-danger"
                  : "text-navy"
              }`}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-light bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-light bg-navy text-white">
              <th className="px-3 py-2 text-left font-display text-xs font-semibold">Task</th>
              <th colSpan={4} className="border-l border-white/20 px-2 py-2 font-display text-xs font-semibold">
                BUDGETED HOURS (by level)
              </th>
              <th colSpan={4} className="border-l border-white/20 px-2 py-2 font-display text-xs font-semibold">
                ACTUAL HOURS (by level)
              </th>
              {people.length > 0 && (
                <th colSpan={people.length} className={`border-l border-white/20 px-2 py-2 font-display text-xs font-semibold ${personCls}`}>
                  ACTUAL HOURS (by person)
                </th>
              )}
              <th className="print:hidden" aria-label="Actions" />
            </tr>
            <tr className="border-b border-light bg-[#DCE6F2] text-xs font-semibold text-navy">
              <th />
              {[0, 1].map((g) =>
                [...LEVELS, "total" as const].map((l, i) => (
                  <th key={`${g}${l}`} className={`min-w-[64px] px-2 py-1.5 ${i === 0 ? "border-l border-light" : ""}`}>
                    {l === "total" ? "Total" : LEVEL_LABELS[l]}
                  </th>
                ))
              )}
              {people.map((u, i) => (
                <th key={u} className={`min-w-[72px] px-2 py-1.5 ${i === 0 ? "border-l border-light" : ""} ${personCls}`}>
                  <span className="block truncate">{nameOf(u).split(" ")[0]}</span>
                  <select
                    value={levelOf(u)}
                    onChange={(e) => budget.setLevel(u, e.target.value as Level)}
                    aria-label={`${nameOf(u)}'s level on this project`}
                    title="Level on this project"
                    className="mt-0.5 rounded border border-light bg-white px-1 text-[11px] font-normal text-charcoal print:hidden"
                  >
                    {LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {LEVEL_LABELS[l]}
                      </option>
                    ))}
                  </select>
                </th>
              ))}
              <th className="print:hidden" />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={10 + people.length} className="px-4 py-8 text-center text-charcoal/70">
                  No tasks yet. Import a budget, or add a task below.
                </td>
              </tr>
            )}
            {lines.map((l) => {
              const over = sumLevels(l.actual) - sumLevels(l.budget);
              const flagged = budgetStatus(sumLevels(l.actual), sumLevels(l.budget)) === "over";
              return (
                <tr key={l.id ?? "none"} className="border-b border-light">
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      {l.id ? (
                        <InlineInput
                          ariaLabel="Task name"
                          value={l.name}
                          onCommit={(name) => {
                            if (!name.trim()) return toast("A task needs a name.");
                            catalog.updateTask(l.id!, { name });
                          }}
                          className={`min-w-0 flex-1 ${l.archived ? "text-charcoal/60 line-through" : "text-navy"}`}
                        />
                      ) : (
                        <span className="px-2 py-1.5 italic text-charcoal/70">No task</span>
                      )}
                      {flagged && (
                        <span title={`Over budget by ${over.toFixed(1)}h`} className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-danger">
                          <Flag size={12} fill="currentColor" /> +{over.toFixed(1)}h
                        </span>
                      )}
                    </div>
                  </td>
                  {LEVELS.map((lv, i) => (
                    <td key={lv} className={`px-1 py-1 ${i === 0 ? "border-l border-light" : ""} bg-[#FFF9E6]`}>
                      {l.id ? (
                        <InlineInput
                          ariaLabel={`${LEVEL_LABELS[lv]} budget for ${l.name}`}
                          value={hoursCell(l.budget[lv])}
                          onCommit={(text) => setBudget(l.id!, lv, text)}
                          className="tabular w-full text-center text-blue"
                        />
                      ) : null}
                    </td>
                  ))}
                  <td className="tabular px-2 py-2 text-center font-semibold">{hoursCell(sumLevels(l.budget))}</td>
                  {actualCells(l.actual, l.budget)}
                  {people.map((u, i) => (
                    <td key={u} className={`tabular px-2 py-2 text-center text-charcoal ${i === 0 ? "border-l border-light" : ""} ${personCls}`}>
                      {hoursCell(l.byPerson.get(u) ?? 0)}
                    </td>
                  ))}
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
            <tr className="border-b border-light print:hidden">
              <td colSpan={10 + people.length} className="px-2 py-1.5">
                {newTask === null ? (
                  <button type="button" onClick={() => setNewTask("")} className="flex items-center gap-1 px-1 py-1 text-sm font-medium text-blue hover:underline">
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
                      className="h-8 w-72 rounded-md border border-light px-2.5 text-sm focus:border-blue focus:outline-none"
                    />
                    <button type="submit" className="h-8 rounded-md bg-teal px-3 font-display text-xs font-semibold text-navy">
                      Add
                    </button>
                  </form>
                )}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="bg-lightest/70 font-semibold text-navy">
              <td className="px-3 py-2 font-display text-xs">Total</td>
              {levelCells(totals.budget)}
              {actualCells(totals.actual, totals.budget)}
              {people.map((u, i) => (
                <td key={u} className={`tabular px-2 py-2 text-center ${i === 0 ? "border-l border-light" : ""} ${personCls}`}>
                  {hoursCell(totals.byPerson.get(u) ?? 0)}
                </td>
              ))}
              <td className="print:hidden" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-charcoal/70 print:hidden">
        Green: under 90% of budget · Amber: 90 to 100% · Red with a flag: over budget. Actual hours are all-time and
        leave out running timers. Each person&apos;s level on this project was set when they first logged time on it;
        change it with the dropdown under their name.
      </p>
    </>
  );
}

