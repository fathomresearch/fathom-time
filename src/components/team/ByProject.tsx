"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Bar } from "@/components/team/bits";
import DateRangePicker from "@/components/DateRangePicker";
import BudgetImport from "@/components/budget/BudgetImport";
import { useTimeReport } from "@/components/team/useTimeReport";
import type { Catalog } from "@/lib/useCatalog";
import { percent, projectTree, type ProjectNode } from "@/lib/report";
import { STATUS_CLASS, budgetStatus, hoursCell, type Thresholds } from "@/lib/budget";
import { formatHoursShort } from "@/lib/time";

/**
 * All-time (or From / To) hours: client → project → stage (task) → person.
 * Bars at each level are scaled to the biggest item among their siblings.
 * Each project links to its budget page.
 */
export default function ByProject({
  catalog,
  nameOf,
  tz,
  todayKey,
}: {
  catalog: Catalog;
  nameOf: (userId: string) => string;
  tz: string;
  todayKey: string;
}) {
  const router = useRouter();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const report = useTimeReport(from, to, tz);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const clientName = (p: ProjectNode) => {
      const project = p.id ? catalog.projectById.get(p.id) : undefined;
      return project?.client_id ? (catalog.clientById.get(project.client_id)?.name ?? "") : "";
    };
    const tree = projectTree(report.rows).filter((p) => {
      if (!q) return true;
      const name = p.id ? (catalog.projectById.get(p.id)?.name ?? "") : "no project";
      return name.toLowerCase().includes(q) || clientName(p).toLowerCase().includes(q);
    });
    const byClient = new Map<string, ProjectNode[]>();
    for (const p of tree) byClient.set(clientName(p), [...(byClient.get(clientName(p)) ?? []), p]);
    return [...byClient]
      .map(([name, projects]) => ({ name, projects }))
      .sort((a, b) => (!a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name)));
  }, [report.rows, catalog.projectById, catalog.clientById, query]);

  const maxProject = Math.max(0, ...groups.flatMap((g) => g.projects.map((p) => p.seconds)));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-light px-5 py-3">
        <label className="flex h-9 w-64 items-center gap-2 rounded-full border border-light bg-white px-3 focus-within:border-blue">
          <Search size={15} className="text-medium" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project or client"
            aria-label="Search projects"
            className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none focus-visible:outline-none"
          />
        </label>
        <DateRangePicker
          from={from}
          to={to}
          todayKey={todayKey}
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
        />
        <div className="ml-auto">
          <BudgetImport catalog={catalog} onImported={(id) => router.push(`/team/projects/${id}`)} />
        </div>
      </div>

      {!report.loaded ? (
        <p className="px-4 py-10 text-center text-sm text-charcoal/60">Loading…</p>
      ) : groups.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-charcoal/70">
          {query ? <>Nothing matches &ldquo;{query}&rdquo;.</> : "No time logged in this range."}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.name || "none"} className="border-b border-light last:border-0">
            <p className="bg-canvas/70 px-5 py-2 font-display text-xs font-semibold uppercase tracking-wide text-charcoal/70">
              {g.name || "No client"}
            </p>
            <div className="divide-y divide-light">
              {g.projects.map((p) => (
                <ProjectBlock
                  key={p.id ?? "none"}
                  node={p}
                  catalog={catalog}
                  nameOf={nameOf}
                  maxProject={maxProject}
                  budgetHours={p.id ? (report.budgetByProject.get(p.id) ?? 0) : 0}
                  allTimeSeconds={p.id ? (report.allTimeByProject.get(p.id) ?? 0) : 0}
                  thresholds={p.id ? report.thresholdsByProject.get(p.id) : undefined}
                />
              ))}
            </div>
          </section>
        ))
      )}
      <p className="border-t border-light px-5 py-3 text-xs text-charcoal/70">
        Share of each person within a stage is the starting point for contribution-based pay later. Budget use always
        compares all-time hours with the project&apos;s budget, whatever range is shown.
      </p>
    </div>
  );
}

function ProjectBlock({
  node: p,
  catalog,
  nameOf,
  maxProject,
  budgetHours,
  allTimeSeconds,
  thresholds,
}: {
  node: ProjectNode;
  catalog: Catalog;
  nameOf: (userId: string) => string;
  maxProject: number;
  budgetHours: number;
  allTimeSeconds: number;
  thresholds?: Thresholds;
}) {
  const project = p.id ? catalog.projectById.get(p.id) : undefined;
  const maxTask = p.tasks[0]?.seconds ?? 0;
  return (
    <div className="px-5 py-4">
      <Line
        label={
          <span className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project?.color ?? "#BBBCC0" }} />
            {project ? (
              <Link
                href={`/team/projects/${project.id}`}
                className="truncate font-display font-semibold text-navy hover:underline"
              >
                {project.name}
              </Link>
            ) : (
              <span className="truncate font-display font-semibold text-navy">No project</span>
            )}
          </span>
        }
        share={p.seconds / maxProject}
        value={formatHoursShort(p.seconds)}
        extra={
          project ? (
            <BudgetBadge
              projectId={project.id}
              budgetHours={budgetHours}
              actualHours={allTimeSeconds / 3600}
              thresholds={thresholds}
            />
          ) : null
        }
      />
      <div className="mt-2 grid gap-2.5 pl-5">
        {p.tasks.map((t) => {
          const task = t.id ? catalog.taskById.get(t.id) : undefined;
          const maxPerson = t.people[0]?.seconds ?? 0;
          return (
            <div key={t.id ?? "none"}>
              <Line
                label={<span className="truncate font-medium text-charcoal">{task?.name ?? "No task"}</span>}
                share={t.seconds / maxTask}
                value={formatHoursShort(t.seconds)}
              />
              <div className="mt-1 grid gap-1 pl-5">
                {t.people.map((x) => (
                  <Line
                    key={x.userId}
                    label={<span className="truncate text-charcoal/80">{nameOf(x.userId)}</span>}
                    share={x.seconds / maxPerson}
                    value={formatHoursShort(x.seconds)}
                    extra={<span className="text-charcoal/70">{percent(x.seconds / t.seconds)}</span>}
                    small
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** "62% of 70.0h" colored by the project's thresholds, then Add budget / Edit budget. */
function BudgetBadge({
  projectId,
  budgetHours,
  actualHours,
  thresholds,
}: {
  projectId: string;
  budgetHours: number;
  actualHours: number;
  thresholds?: Thresholds;
}) {
  const has = budgetHours > 0;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      {has && (
        <span
          title="All-time hours compared with the budget"
          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[budgetStatus(actualHours, budgetHours, thresholds)]}`}
        >
          {percent(actualHours / budgetHours)} of {hoursCell(budgetHours)}h
        </span>
      )}
      <Link
        href={`/team/projects/${projectId}`}
        className="whitespace-nowrap rounded-full border border-light bg-white px-2.5 py-0.5 font-display text-xs font-semibold text-navy hover:bg-lightest"
      >
        {has ? "Edit budget" : "Add budget"}
      </Link>
    </span>
  );
}

function Line({
  label,
  share,
  value,
  extra,
  small = false,
}: {
  label: React.ReactNode;
  share: number;
  value: string;
  extra?: React.ReactNode;
  small?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,280px)_1fr_64px_230px] items-center gap-3 ${small ? "text-xs" : "text-sm"}`}
    >
      <span className="flex min-w-0">{label}</span>
      <Bar share={share} />
      <span className="tabular text-right font-medium text-navy">{value}</span>
      <span className="tabular text-right">{extra ?? ""}</span>
    </div>
  );
}
