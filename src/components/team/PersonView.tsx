"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import WeekNav from "@/components/WeekNav";
import TimeTracker, { type Viewer } from "@/components/tracker/TimeTracker";
import { Avatar, Bar, LiveStatus, Tile } from "@/components/team/bits";
import { useWeek } from "@/components/timesheet/useWeek";
import { useCatalog } from "@/lib/useCatalog";
import { useNow } from "@/lib/useNow";
import { displayName } from "@/lib/people";
import { entrySeconds, percent, totals } from "@/lib/report";
import { dayKey, formatHoursShort, weekStart } from "@/lib/time";

export type PersonInfo = { id: string; name: string; email: string; active: boolean };

/** One person's week for the boss: status, totals, and their editable entries. */
export default function PersonView({ person, viewer }: { person: PersonInfo; viewer: Viewer }) {
  const tz = viewer.timezone;
  const now = useNow(60_000);
  const todayKey = dayKey(new Date(now), tz);
  const [weekKey, setWeekKey] = useState(() => weekStart(dayKey(new Date(), tz)));

  const catalog = useCatalog(viewer.id);
  const week = useWeek(person.id, tz, weekKey, catalog);
  const sum = useMemo(() => totals(week.entries), [week.entries]);

  const projects = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of week.entries) {
      const key = e.project_id ?? "";
      map.set(key, (map.get(key) ?? 0) + entrySeconds(e));
    }
    return [...map].map(([id, seconds]) => ({ id: id || null, seconds })).sort((a, b) => b.seconds - a.seconds);
  }, [week.entries]);
  const maxProject = projects[0]?.seconds ?? 0;
  const ready = week.loaded && catalog.loaded;

  return (
    <>
      <Link href="/team" className="mb-3 inline-flex items-center gap-1 text-sm text-blue hover:underline">
        <ChevronLeft size={16} /> Team Overview
      </Link>

      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={person.name} email={person.email} running={!!week.running} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl font-semibold text-navy">
              {displayName(person)}
              {!person.active && <span className="ml-2 text-sm font-normal text-charcoal/60">(deactivated)</span>}
            </h1>
            <div className="text-sm">
              <LiveStatus running={week.running} catalog={catalog} />
            </div>
          </div>
        </div>
        <WeekNav weekKey={weekKey} todayKey={todayKey} onChange={setWeekKey} />
      </header>

      <div className="mb-6 grid grid-cols-[1fr_1fr_2fr] gap-4">
        <Tile label="Hours" value={ready ? formatHoursShort(sum.total) : "…"} />
        <Tile
          label="Billable"
          value={ready ? formatHoursShort(sum.billable) : "…"}
          sub={ready ? `${percent(sum.billableShare)} of their time` : undefined}
        />
        <div className="rounded-lg border border-light bg-white px-5 py-4">
          <p className="mb-2 text-xs font-medium text-charcoal/70">Hours by project</p>
          {!ready ? (
            <p className="text-sm text-charcoal/60">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-charcoal/60">No time this week.</p>
          ) : (
            <div className="grid gap-1.5">
              {projects.map((p) => {
                const project = p.id ? catalog.projectById.get(p.id) : undefined;
                return (
                  <div key={p.id ?? "none"} className="grid grid-cols-[minmax(0,180px)_1fr_56px] items-center gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project?.color ?? "#BBBCC0" }} />
                      <span className="truncate text-navy">{project?.name ?? "No project"}</span>
                    </span>
                    <Bar share={p.seconds / maxProject} />
                    <span className="tabular text-right font-medium text-navy">{formatHoursShort(p.seconds)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <TimeTracker ownerId={person.id} viewer={viewer} onChange={week.reload} />
    </>
  );
}
