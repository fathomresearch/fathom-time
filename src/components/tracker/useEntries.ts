"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { ENTRY_SELECT, toEntry, type Draft, type Entry } from "@/lib/data";
import { addDays, dayKey, startOfDay, weekStart } from "@/lib/time";

type EntryPatch = Partial<
  Pick<Entry, "description" | "project_id" | "task_id" | "billable" | "start_at" | "end_at">
>;

const REFRESH_MS = 20_000;

/**
 * One person's entries: loading, live refresh, and every change.
 * `ownerId` is whose time it is; `viewerId` is who is signed in
 * (directors and managers can act on someone else's entries).
 */
export function useEntries(ownerId: string, viewerId: string, tz: string) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState<Entry | null>(null);
  const [weeks, setWeeks] = useState(3);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const today = dayKey(new Date(), tz);
    const from = startOfDay(addDays(weekStart(today), -7 * (weeks - 1)), tz).toISOString();
    const db = sb();

    const [list, run, older] = await Promise.all([
      db.from("time_entries").select(ENTRY_SELECT)
        .eq("user_id", ownerId).not("end_at", "is", null).gte("start_at", from)
        .order("start_at", { ascending: false }),
      db.from("time_entries").select(ENTRY_SELECT)
        .eq("user_id", ownerId).is("end_at", null).maybeSingle(),
      db.from("time_entries").select("id")
        .eq("user_id", ownerId).lt("start_at", from).limit(1),
    ]);

    if (seq !== loadSeq.current) return; // a newer load already finished
    if (list.error || run.error) {
      toast("Couldn't load time entries. Check your connection.");
      return;
    }
    setEntries((list.data ?? []).map(toEntry));
    setRunning(run.data ? toEntry(run.data) : null);
    setHasMore((older.data ?? []).length > 0);
    setLoaded(true);
  }, [ownerId, tz, weeks]);

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

  // ---- helpers ----

  const patchLocal = (id: string, patch: Partial<Entry>) => {
    const stamp = { ...patch, updated_by: viewerId, updated_at: new Date().toISOString() };
    setEntries((cur) => cur.map((e) => (e.id === id ? { ...e, ...stamp } : e)));
    setRunning((cur) => (cur && cur.id === id ? { ...cur, ...stamp } : cur));
  };

  const failed = (msg: string) => {
    toast(msg);
    load();
  };

  const setTags = async (entryId: string, next: string[], prev: string[]) => {
    const db = sb();
    const add = next.filter((t) => !prev.includes(t));
    const remove = prev.filter((t) => !next.includes(t));
    if (remove.length) {
      const { error } = await db.from("time_entry_tags").delete().eq("entry_id", entryId).in("tag_id", remove);
      if (error) return false;
    }
    if (add.length) {
      const { error } = await db.from("time_entry_tags").insert(add.map((tag_id) => ({ entry_id: entryId, tag_id })));
      if (error) return false;
    }
    if (!add.length && !remove.length) return true;
    // Touch the entry so "Edited by" reflects a tag change too.
    await db.from("time_entries").update({ updated_at: new Date().toISOString() }).eq("id", entryId);
    return true;
  };

  const insertEntry = async (
    draft: Draft,
    start: Date,
    end: Date | null
  ): Promise<Entry | null> => {
    const db = sb();
    const { data, error } = await db
      .from("time_entries")
      .insert({
        user_id: ownerId,
        description: draft.description.trim(),
        project_id: draft.project_id,
        task_id: draft.task_id,
        billable: draft.billable,
        start_at: start.toISOString(),
        end_at: end ? end.toISOString() : null,
      })
      .select(ENTRY_SELECT)
      .single();
    if (error || !data) return null;
    const entry = toEntry(data);
    if (draft.tag_ids.length) {
      const { error: tagError } = await db
        .from("time_entry_tags")
        .insert(draft.tag_ids.map((tag_id) => ({ entry_id: entry.id, tag_id })));
      if (tagError) toast("Entry saved, but its tags couldn't be added.");
      else entry.tag_ids = [...draft.tag_ids];
    }
    return entry;
  };

  // ---- actions ----

  const updateEntry = useCallback(
    async (entry: Entry, patch: EntryPatch, tagIds?: string[]) => {
      if (patch.start_at && (patch.end_at ?? entry.end_at)) {
        const end = patch.end_at ?? entry.end_at!;
        if (new Date(end) < new Date(patch.start_at)) {
          toast("The end time can't be before the start time.");
          return;
        }
      }
      patchLocal(entry.id, tagIds ? { ...patch, tag_ids: tagIds } : patch);
      if (Object.keys(patch).length) {
        const { error } = await sb().from("time_entries").update(patch).eq("id", entry.id);
        if (error) return failed("Couldn't save that change.");
      }
      if (tagIds) {
        const ok = await setTags(entry.id, tagIds, entry.tag_ids);
        if (!ok) return failed("Couldn't save the tags.");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewerId]
  );

  const startTimer = useCallback(
    async (draft: Draft, startAt = new Date()) => {
      const previous = running;
      const optimistic: Entry = {
        id: "pending",
        user_id: ownerId,
        ...draft,
        start_at: startAt.toISOString(),
        end_at: null,
        updated_by: viewerId,
        updated_at: new Date().toISOString(),
      };
      setRunning(optimistic);
      const created = await insertEntry(draft, startAt, null);
      if (!created) {
        setRunning(previous);
        return failed("Couldn't start the timer.");
      }
      setRunning(created);
      if (previous) load(); // the old timer was stopped by the database
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [running, ownerId, viewerId, load]
  );

  const stopTimer = useCallback(async () => {
    if (!running || running.id === "pending") return;
    const end = new Date();
    const stopped = { ...running, end_at: end.toISOString() };
    setRunning(null);
    setEntries((cur) => [stopped, ...cur]);
    const { error } = await sb().from("time_entries").update({ end_at: stopped.end_at }).eq("id", running.id);
    if (error) failed("Couldn't stop the timer.");
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const addManual = useCallback(
    async (draft: Draft, start: Date, end: Date) => {
      const created = await insertEntry(draft, start, end);
      if (!created) {
        failed("Couldn't add that entry.");
        return false;
      }
      setEntries((cur) =>
        [created, ...cur].sort((a, b) => b.start_at.localeCompare(a.start_at))
      );
      return true;
    },
    [ownerId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const duplicateEntry = useCallback(
    async (entry: Entry) => {
      const created = await insertEntry(entry, new Date(entry.start_at), new Date(entry.end_at!));
      if (!created) return failed("Couldn't duplicate that entry.");
      setEntries((cur) => [created, ...cur].sort((a, b) => b.start_at.localeCompare(a.start_at)));
    },
    [ownerId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deleteEntry = useCallback(async (entry: Entry) => {
    setEntries((cur) => cur.filter((e) => e.id !== entry.id));
    const { error } = await sb().from("time_entries").delete().eq("id", entry.id);
    if (error) failed("Couldn't delete that entry.");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    loaded,
    entries,
    running,
    hasMore,
    loadMore: () => setWeeks((w) => w + 3),
    weeks,
    reload: load,
    updateEntry,
    startTimer,
    stopTimer,
    addManual,
    duplicateEntry,
    deleteEntry,
  };
}

export type EntriesApi = ReturnType<typeof useEntries>;
