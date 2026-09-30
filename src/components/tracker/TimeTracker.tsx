"use client";

import EntryBar from "@/components/tracker/EntryBar";
import EntryList from "@/components/tracker/EntryList";
import { useEntries } from "@/components/tracker/useEntries";
import { useCatalog } from "@/lib/useCatalog";
import { useNow } from "@/lib/useNow";
import { dayKey } from "@/lib/time";

export type Viewer = { id: string; role: "boss" | "employee"; timezone: string };

/**
 * The entry bar and entry list for one person. On the Time Tracker the
 * person is you; on a team member's page (Phase 7) it's them, and the boss
 * edits their time.
 */
export default function TimeTracker({ ownerId, viewer }: { ownerId: string; viewer: Viewer }) {
  const tz = viewer.timezone;
  const catalog = useCatalog(viewer.id);
  const api = useEntries(ownerId, viewer.id, tz);
  const now = useNow(60_000);
  const todayKey = dayKey(new Date(now), tz);

  return (
    <>
      <EntryBar catalog={catalog} api={api} tz={tz} />
      <EntryList catalog={catalog} api={api} tz={tz} todayKey={todayKey} />
    </>
  );
}
