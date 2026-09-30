"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { fetchAll } from "@/lib/fetchAll";
import { ENTRY_SELECT, toEntry, type Entry } from "@/lib/data";
import { addDays, startOfDay } from "@/lib/time";
import type { Profile } from "@/lib/types";

const REFRESH_MS = 20_000;

export type TeamPerson = Pick<Profile, "id" | "name" | "email" | "role" | "active">;

/**
 * Everyone's stopped entries for one week, everyone's running timers, and
 * the people list. Boss only: row-level security returns everything.
 */
export function useTeamWeek(tz: string, weekKey: string) {
  const [people, setPeople] = useState<TeamPerson[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState<Entry[]>([]);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const db = sb();
    const [p, list, run] = await Promise.all([
      db.from("profiles").select("id,name,email,role,active").order("name"),
      fetchAll((from, to) =>
        db
          .from("time_entries")
          .select(ENTRY_SELECT)
          .not("end_at", "is", null)
          .gte("start_at", startOfDay(weekKey, tz).toISOString())
          .lt("start_at", startOfDay(addDays(weekKey, 7), tz).toISOString())
          .order("start_at")
          .order("id")
          .range(from, to)
      ),
      db.from("time_entries").select(ENTRY_SELECT).is("end_at", null),
    ]);
    if (seq !== loadSeq.current) return;
    if (p.error || !list || run.error) {
      toast("Couldn't load the team. Check your connection.");
      return;
    }
    setPeople((p.data as TeamPerson[]) ?? []);
    setEntries(list.map(toEntry));
    setRunning((run.data ?? []).map(toEntry));
    setLoadedWeek(weekKey);
  }, [tz, weekKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  return {
    loaded: loadedWeek === weekKey,
    people,
    entries: loadedWeek === weekKey ? entries : [],
    running,
    reload: load,
  };
}
