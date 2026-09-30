"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { ENTRY_SELECT, toEntry, type Entry } from "@/lib/data";
import type { Catalog } from "@/lib/useCatalog";
import { addDays, atMinutes, dayKey, startOfDay } from "@/lib/time";

const REFRESH_MS = 20_000;
const NINE_AM = 9 * 60;

/** A timesheet row is a project + task pair. Either can be empty. */
export const rowKey = (projectId: string | null, taskId: string | null) =>
  `${projectId ?? ""}|${taskId ?? ""}`;

export function splitKey(key: string) {
  const [p, t] = key.split("|");
  return { project_id: p || null, task_id: t || null };
}

const ms = (e: Entry) => new Date(e.end_at!).getTime() - new Date(e.start_at).getTime();

/** Stopped entries per row, per day of the week (0 = Sunday), in milliseconds. */
export function buildGrid(entries: Entry[], weekKey: string, tz: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
  const grid = new Map<string, number[]>();
  for (const e of entries) {
    // An entry counts on the day it starts, even if it runs past midnight.
    const i = days.indexOf(dayKey(new Date(e.start_at), tz));
    if (i < 0) continue;
    const key = rowKey(e.project_id, e.task_id);
    const cells = grid.get(key) ?? Array(7).fill(0);
    cells[i] += ms(e);
    grid.set(key, cells);
  }
  return grid;
}

export type CellPlan = {
  update: { entry: Entry; end: Date } | null;
  deletes: Entry[];
  insert: { start: Date; end: Date } | null;
};

/**
 * How to make one cell (one row, one day) add up to `targetMs`:
 * nothing there → a new entry starting 9:00 AM; more → extend the latest
 * entry; less → trim the latest, deleting whole entries from the end first.
 */
export function planCell(cell: Entry[], targetMs: number, day: string, tz: string): CellPlan {
  const plan: CellPlan = { update: null, deletes: [], insert: null };
  const sorted = [...cell].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const current = sorted.reduce((s, e) => s + ms(e), 0);
  if (targetMs === current) return plan;

  if (!sorted.length) {
    const start = atMinutes(day, NINE_AM, tz);
    plan.insert = { start, end: new Date(start.getTime() + targetMs) };
    return plan;
  }

  const latest = sorted[sorted.length - 1];
  if (targetMs > current) {
    plan.update = { entry: latest, end: new Date(new Date(latest.end_at!).getTime() + targetMs - current) };
    return plan;
  }

  let cut = current - targetMs;
  for (let i = sorted.length - 1; i >= 0 && cut > 0; i--) {
    const e = sorted[i];
    const len = ms(e);
    if (len > cut) {
      plan.update = { entry: e, end: new Date(new Date(e.end_at!).getTime() - cut) };
      cut = 0;
    } else {
      plan.deletes.push(e);
      cut -= len;
    }
  }
  return plan;
}

/**
 * One person's stopped entries for one week (Sunday to Saturday in `tz`),
 * refreshed every 20 seconds, plus the changes the Timesheet makes.
 * Running timers are left out; `running` is only for a notice.
 */
export function useWeek(ownerId: string, tz: string, weekKey: string, catalog: Catalog) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState<Entry | null>(null);
  const [loadedWeek, setLoadedWeek] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const saving = useRef(0);

  const fetchWeek = useCallback(
    (key: string) =>
      sb()
        .from("time_entries")
        .select(ENTRY_SELECT)
        .eq("user_id", ownerId)
        .not("end_at", "is", null)
        .gte("start_at", startOfDay(key, tz).toISOString())
        .lt("start_at", startOfDay(addDays(key, 7), tz).toISOString())
        .order("start_at"),
    [ownerId, tz]
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const [list, run] = await Promise.all([
      fetchWeek(weekKey),
      sb().from("time_entries").select(ENTRY_SELECT).eq("user_id", ownerId).is("end_at", null).maybeSingle(),
    ]);
    // A newer load, or a save in progress, wins over this result.
    if (seq !== loadSeq.current || saving.current > 0) return;
    if (list.error || run.error) {
      toast("Couldn't load the timesheet. Check your connection.");
      return;
    }
    setEntries((list.data ?? []).map(toEntry));
    setRunning(run.data ? toEntry(run.data) : null);
    setLoadedWeek(weekKey);
  }, [fetchWeek, ownerId, weekKey]);

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

  /** Run database changes without a background refresh undoing the screen. */
  const save = async (work: () => Promise<boolean>, failMsg: string) => {
    saving.current++;
    loadSeq.current++;
    let ok = false;
    try {
      ok = await work();
    } finally {
      saving.current--;
    }
    if (!ok) toast(failMsg);
    load();
    return ok;
  };

  const newEntry = (projectId: string | null, taskId: string | null, start: Date, end: Date) => ({
    user_id: ownerId,
    description: "",
    project_id: projectId,
    task_id: taskId,
    billable: projectId ? catalog.projectById.get(projectId)?.billable_default ?? false : false,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  });

  /** Apply a plan from `planCell` for one row. */
  const applyPlan = (key: string, plan: CellPlan) => {
    const { project_id, task_id } = splitKey(key);
    const deleteIds = plan.deletes.map((e) => e.id);
    const now = new Date().toISOString();

    setEntries((cur) => {
      let next = cur.filter((e) => !deleteIds.includes(e.id));
      if (plan.update) {
        const { entry, end } = plan.update;
        next = next.map((e) => (e.id === entry.id ? { ...e, end_at: end.toISOString() } : e));
      }
      if (plan.insert) {
        next = [
          ...next,
          {
            id: `pending-${now}`,
            ...newEntry(project_id, task_id, plan.insert.start, plan.insert.end),
            updated_by: null,
            updated_at: now,
            tag_ids: [],
          },
        ];
      }
      return next;
    });

    return save(async () => {
      const results = await Promise.all([
        plan.update
          ? sb().from("time_entries").update({ end_at: plan.update.end.toISOString() }).eq("id", plan.update.entry.id)
          : null,
        deleteIds.length ? sb().from("time_entries").delete().in("id", deleteIds) : null,
        plan.insert
          ? sb().from("time_entries").insert(newEntry(project_id, task_id, plan.insert.start, plan.insert.end))
          : null,
      ]);
      return results.every((r) => !r?.error);
    }, "Couldn't save that. The timesheet has been reloaded.");
  };

  /**
   * Last week's rows, and optionally its time copied into this week's empty
   * cells. Archived projects and tasks are skipped.
   */
  const copyLastWeek = async (withTime: boolean) => {
    const prevKey = addDays(weekKey, -7);
    const prev = await fetchWeek(prevKey);
    if (prev.error) {
      toast("Couldn't load last week.");
      return null;
    }
    const prevGrid = buildGrid((prev.data ?? []).map(toEntry), prevKey, tz);
    const thisGrid = buildGrid(entries, weekKey, tz);

    const rows: string[] = [];
    const inserts: ReturnType<typeof newEntry>[] = [];
    let copiedMs = 0;
    for (const [key, cells] of prevGrid) {
      const { project_id, task_id } = splitKey(key);
      const project = project_id ? catalog.projectById.get(project_id) : null;
      const task = task_id ? catalog.taskById.get(task_id) : null;
      if (project === undefined || project?.archived || task === undefined || task?.archived) continue;
      rows.push(key);
      if (!withTime) continue;
      cells.forEach((len, i) => {
        if (len <= 0 || (thisGrid.get(key)?.[i] ?? 0) > 0) return;
        const start = atMinutes(addDays(weekKey, i), NINE_AM, tz);
        inserts.push(newEntry(project_id, task_id, start, new Date(start.getTime() + len)));
        copiedMs += len;
      });
    }

    if (inserts.length) {
      const ok = await save(async () => {
        const { error } = await sb().from("time_entries").insert(inserts);
        return !error;
      }, "Couldn't copy last week's time.");
      if (!ok) return null;
    }
    return { rows, copiedMs };
  };

  return {
    loaded: loadedWeek === weekKey,
    entries: loadedWeek === weekKey ? entries : [],
    running,
    applyPlan,
    copyLastWeek,
    reload: load,
  };
}
