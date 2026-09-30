"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import WeekNav from "@/components/WeekNav";
import ExportCsv from "@/components/ExportCsv";
import ByPerson from "@/components/team/ByPerson";
import ByProject from "@/components/team/ByProject";
import ManageTeam from "@/components/team/ManageTeam";
import { Tile } from "@/components/team/bits";
import { useTeamWeek } from "@/components/team/useTeamWeek";
import type { Viewer } from "@/components/tracker/TimeTracker";
import { canManageProjects } from "@/lib/types";
import { useCatalog } from "@/lib/useCatalog";
import { useNow } from "@/lib/useNow";
import { displayName } from "@/lib/people";
import { percent, projectTree, totals, weekByPerson } from "@/lib/report";
import { dayKey, formatHoursShort, weekStart } from "@/lib/time";

type Tab = "person" | "project" | "manage";
const TABS: { id: Tab; label: string }[] = [
  { id: "person", label: "By person" },
  { id: "project", label: "By project" },
  { id: "manage", label: "Manage team" },
];

export default function TeamOverview({ viewer }: { viewer: Viewer }) {
  const tz = viewer.timezone;
  const now = useNow(60_000);
  const todayKey = dayKey(new Date(now), tz);
  const [weekKey, setWeekKey] = useState(() => weekStart(dayKey(new Date(), tz)));
  const [tab, setTab] = useState<Tab>("person");

  const catalog = useCatalog(viewer.id, canManageProjects(viewer.role));
  const team = useTeamWeek(tz, weekKey);

  const byPerson = useMemo(() => weekByPerson(team.entries, weekKey, tz), [team.entries, weekKey, tz]);
  const tree = useMemo(() => projectTree(team.entries), [team.entries]);
  const sum = useMemo(() => totals(team.entries), [team.entries]);
  const running = useMemo(() => new Map(team.running.map((e) => [e.user_id, e])), [team.running]);
  const nameOf = (id: string) => displayName(team.people.find((p) => p.id === id));
  const loggers = [...byPerson.values()].filter((p) => p.total > 0).length;
  const ready = team.loaded && catalog.loaded;

  return (
    <>
      <PageHeader title="Team Overview">
        <ExportCsv catalog={catalog} tz={tz} weekKey={weekKey} note="Everyone's time." />
        <WeekNav weekKey={weekKey} todayKey={todayKey} onChange={setWeekKey} />
      </PageHeader>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Tile label="Team hours" value={ready ? formatHoursShort(sum.total) : "…"} />
        <Tile
          label="Billable share"
          value={ready ? percent(sum.billableShare) : "…"}
          sub={ready ? `${formatHoursShort(sum.billable)} billable` : undefined}
        />
        <Tile label="People who logged time" value={ready ? String(loggers) : "…"} />
        <Tile label="Working right now" value={ready ? String(running.size) : "…"} pulse={running.size > 0} />
      </div>

      <div className="mb-3 flex gap-1 border-b border-light" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 font-display text-sm font-semibold ${
              tab === t.id ? "border-teal text-navy" : "border-transparent text-charcoal/60 hover:text-navy"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-light bg-white">
        {!ready ? (
          <p className="px-4 py-10 text-center text-sm text-charcoal/60">Loading…</p>
        ) : tab === "person" ? (
          <ByPerson
            people={team.people}
            byPerson={byPerson}
            running={running}
            catalog={catalog}
            weekKey={weekKey}
            todayKey={todayKey}
          />
        ) : tab === "project" ? (
          <ByProject tree={tree} catalog={catalog} nameOf={nameOf} />
        ) : (
          <ManageTeam people={team.people} viewerId={viewer.id} onChanged={team.reload} />
        )}
      </div>
    </>
  );
}
