"use client";

import { Bar } from "@/components/team/bits";
import type { Catalog } from "@/lib/useCatalog";
import type { ProjectNode } from "@/lib/report";
import { percent } from "@/lib/report";
import { formatHoursShort } from "@/lib/time";

/**
 * Project → stage (task) → person. Bars at each level are scaled to the
 * biggest item among their siblings.
 */
export default function ByProject({
  tree,
  catalog,
  nameOf,
}: {
  tree: ProjectNode[];
  catalog: Catalog;
  nameOf: (userId: string) => string;
}) {
  if (!tree.length) {
    return <p className="px-4 py-10 text-center text-sm text-charcoal/70">No time logged this week.</p>;
  }
  const maxProject = tree[0].seconds;

  return (
    <div className="divide-y divide-light">
      {tree.map((p) => {
        const project = p.id ? catalog.projectById.get(p.id) : undefined;
        const client = project?.client_id ? catalog.clientById.get(project.client_id) : undefined;
        const maxTask = p.tasks[0]?.seconds ?? 0;
        return (
          <section key={p.id ?? "none"} className="px-5 py-4">
            <Line
              label={
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project?.color ?? "#BBBCC0" }} />
                  <span className="truncate font-display font-semibold text-navy">{project?.name ?? "No project"}</span>
                  {client && <span className="truncate text-charcoal/60">· {client.name}</span>}
                </span>
              }
              share={p.seconds / maxProject}
              value={formatHoursShort(p.seconds)}
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
                          extra={percent(x.seconds / t.seconds)}
                          small
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="px-5 py-3 text-xs text-charcoal/70">
        Share of each person within a stage is the starting point for contribution-based pay (貢獻度) later.
      </p>
    </div>
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
  extra?: string;
  small?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[minmax(0,260px)_1fr_64px_48px] items-center gap-3 ${small ? "text-xs" : "text-sm"}`}>
      <span className="flex min-w-0">{label}</span>
      <Bar share={share} />
      <span className="tabular text-right font-medium text-navy">{value}</span>
      <span className="tabular text-right text-charcoal/70">{extra ?? ""}</span>
    </div>
  );
}
