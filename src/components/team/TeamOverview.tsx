"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import BudgetImport from "@/components/budget/BudgetImport";
import PageHeader from "@/components/PageHeader";
import WeekNav from "@/components/WeekNav";
import ExportCsv from "@/components/ExportCsv";
import ByPerson from "@/components/team/ByPerson";
import ByProject from "@/components/team/ByProject";
import ManageTeam from "@/components/team/ManageTeam";
import { Tile } from "@/components/team/bits";
import { useTeamWeek } from "@/components/team/useTeamWeek";
import type { Viewer } from "@/components/tracker/TimeTracker";
import { useCatalog } from "@/lib/useCatalog";
import { useNow } from "@/lib/useNow";
import { displayName } from "@/lib/people";
import { percent, totals, weekByPerson } from "@/lib/report";
import { dayKey, formatHoursShort, weekStart } from "@/lib/time";

export type Tab = "person" | "project" | "manage";
const TABS: { id: Tab; label: string }[] = [
  { id: "person", label: "By person" },
  { id: "project", label: "By project" },
  { id: "manage", label: "Manage team" },
];

export default function TeamOverview({ viewer, initialTab = "person" }: { viewer: Viewer; initialTab?: Tab }) {
  const tz = viewer.timezone;
  const now = useNow(60_000);
  const todayKey = dayKey(new Date(now), tz);
  const [weekKey, setWeekKey] = useState(() => weekStart(dayKey(new Date(), tz)));
  const [tab, setTab] = useState<Tab>(initialTab);

  const router = useRouter();
  const catalog = useCatalog(viewer.id);
  const team = useTeamWeek(tz, weekKey);

  const byPerson = useMemo(() => weekByPerson(team.entries, weekKey, tz), [team.entries, weekKey, tz]);
  const sum = useMemo(() => totals(team.entries), [team.entries]);
  const running = useMemo(() => new Map(team.running.map((e) => [e.user_id, e])), [team.running]);
  const nameOf = (id: string) => displayName(team.people.find((p) => p.id === id));
  const loggers = [...byPerson.values()].filter((p) => p.total > 0).length;
  const ready = team.loaded && catalog.loaded;

  return (
    <>
      <PageHeader title="Team Overview">
        {tab === "project" && (
          <BudgetImport catalog={catalog} onImported={(id) => router.push(`/team/projects/${id}`)} />
        )}
        <ExportCsv catalog={catalog} tz={tz} weekKey={weekKey} note="Everyone's time." />
        {tab === "person" && <WeekNav weekKey={weekKey} todayKey={todayKey} onChange={setWeekKey} />}
      </PageHeader>

      {/* The tiles are for the week shown; By project has its own date range. */}
      {tab === "person" && (
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
      )}

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
          <ByProject catalog={catalog} nameOf={nameOf} tz={tz} todayKey={todayKey} />
        ) : (
          <ManageTeam people={team.people} viewerId={viewer.id} viewerRole={viewer.role} onChanged={team.reload} />
        )}
      </div>
    </>
  );
}
