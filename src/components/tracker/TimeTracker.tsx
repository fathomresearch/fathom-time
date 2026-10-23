"use client";

import { useEffect, useState } from "react";
import { CalendarDays, List } from "lucide-react";
import EntryBar from "@/components/tracker/EntryBar";
import EntryList from "@/components/tracker/EntryList";
import WeekCalendar from "@/components/tracker/WeekCalendar";
import WeekNav from "@/components/WeekNav";
import { useEntries } from "@/components/tracker/useEntries";
import { useCatalog } from "@/lib/useCatalog";
import { useNow } from "@/lib/useNow";
import { dayKey, weekStart } from "@/lib/time";
import type { Role } from "@/lib/types";

export type Viewer = { id: string; role: Role; timezone: string };

const VIEW_KEY = "fathom-time:tracker-view";

/**
 * The entry bar and entries for one person, as a list or a week calendar.
 * On the Time Tracker the person is you; on a team member's page (Phase 7)
 * it's them, and a director or manager edits their time.
 */
export default function TimeTracker({
  ownerId,
  viewer,
  onChange,
}: {
  ownerId: string;
  viewer: Viewer;
  /** Called whenever the entries or the running timer change (the person page refreshes its totals). */
  onChange?: () => void;
}) {
  const tz = viewer.timezone;
  const catalog = useCatalog(viewer.id);
  const api = useEntries(ownerId, viewer.id, tz);
  const now = useNow(60_000);
  const todayKey = dayKey(new Date(now), tz);
  const [view, setViewState] = useState<"list" | "calendar">("list");
  const [weekKey, setWeekKey] = useState(() => weekStart(todayKey));
  const { showWeek } = api;

  // Remember list or calendar on this computer.
  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_KEY) === "calendar") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewState("calendar");
      }
    } catch {}
  }, []);
  const setView = (v: "list" | "calendar") => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };

  useEffect(() => {
    if (view === "calendar") showWeek(weekKey);
  }, [view, weekKey, showWeek]);

  useEffect(() => {
    onChange?.();
  }, [api.entries, api.running, onChange]);

  const tab = (v: "list" | "calendar", label: string, Icon: typeof List) => (
    <button
      type="button"
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`flex h-full items-center gap-1.5 px-3 font-display text-sm font-semibold ${
        view === v ? "bg-navy text-white" : "text-charcoal hover:bg-lightest"
      } ${v === "list" ? "rounded-l-md" : "rounded-r-md"}`}
    >
      <Icon size={15} /> {label}
    </button>
  );

  return (
    <>
      <EntryBar catalog={catalog} api={api} tz={tz} />
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-9 items-center rounded-md border border-light bg-white" role="group" aria-label="View">
          {tab("list", "List", List)}
          {tab("calendar", "Calendar", CalendarDays)}
        </div>
        {view === "calendar" && <WeekNav weekKey={weekKey} todayKey={todayKey} onChange={setWeekKey} />}
      </div>
      {view === "list" ? (
        <EntryList catalog={catalog} api={api} tz={tz} todayKey={todayKey} />
      ) : (
        <WeekCalendar catalog={catalog} api={api} tz={tz} todayKey={todayKey} weekKey={weekKey} onWeekChange={setWeekKey} />
      )}
    </>
  );
}
