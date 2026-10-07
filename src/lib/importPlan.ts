// Stage 3b: turn a parsed file into entries and sort each one into a group
// for review. Pure functions (no database), so they can be tested alone.

import type { ImportSource, RawEntry } from "@/lib/importParse";
import { mapKey } from "@/lib/importMatch";
import { addDays, atMinutes, dayKey } from "@/lib/time";

export type ExistingEntry = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  description: string;
  start_at: string;
  end_at: string;
  source: ImportSource | null; // null: typed into Fathom Time
  source_key: string | null;
};

/** A file row with its Fathom Time person / project / task and real start and end. */
export type Incoming = RawEntry & {
  key: string; // sourceKey, unique within the file
  userId: string;
  projectId: string | null;
  taskId: string | null;
  startAt: string;
  endAt: string;
};

export type Resolver = {
  person: (e: RawEntry) => string | null;
  /** undefined = not matched yet; null = "no project" / "no task". */
  project: (key: string) => string | null | undefined;
  task: (key: string) => string | null | undefined;
  taskProject: (taskId: string) => string | undefined;
};

export const LONG_SECONDS = 12 * 3600;
export const HEAVY_DAY_SECONDS = 16 * 3600;
/** Overlaps where one side has this much more time get a warning. */
export const BIG_DIFFERENCE_SECONDS = 4 * 3600;
export const DUPLICATE_TOLERANCE_SECONDS = 5 * 60;
const NINE_AM = 9 * 60;

/** Who wins by default when the same hours exist twice: Fathom Time, then Clockify, then Jibble. */
const rank = (s: ImportSource | null) => (s === null ? 0 : s === "clockify" ? 1 : 2);

const seconds = (start: string, end: string) => (new Date(end).getTime() - new Date(start).getTime()) / 1000;

/**
 * Matches each row to a person, project and task, and gives Jibble
 * "Hours" rows (no time) a start: 9:00 AM in their zone, one after
 * another per person and day. Rows that aren't matched yet come back in
 * `unmatched`.
 */
export function resolveEntries(entries: RawEntry[], r: Resolver) {
  const out: Incoming[] = [];
  const unmatched = { people: new Set<string>(), projects: new Set<string>(), tasks: new Set<string>() };
  const nextStart = new Map<string, number>(); // person|date -> ms of the next free start

  for (const e of entries) {
    const userId = r.person(e);
    const pk = mapKey.project(e.client, e.project);
    const tk = mapKey.task(e.client, e.project, e.task);
    let projectId = r.project(pk);
    let taskId = e.task.trim() ? r.task(tk) : null;
    if (!e.project.trim()) projectId = projectId === undefined ? null : projectId;
    if (!userId) unmatched.people.add(e.personName);
    if (projectId === undefined) unmatched.projects.add(`${e.client || "No client"} · ${e.project || "No project"}`);
    if (taskId === undefined && projectId !== undefined) unmatched.tasks.add(`${e.project} · ${e.task}`);
    if (!userId || projectId === undefined || taskId === undefined) continue;
    // A task must belong to the entry's project.
    if (taskId && (!projectId || r.taskProject(taskId) !== projectId)) taskId = null;

    let startAt = e.start;
    let endAt = e.end;
    if (!startAt || !endAt) {
      const slot = `${userId}|${e.date}`;
      const from = nextStart.get(slot) ?? atMinutes(e.date, NINE_AM, e.tz).getTime();
      startAt = new Date(from).toISOString();
      endAt = new Date(from + e.seconds * 1000).toISOString();
      nextStart.set(slot, from + e.seconds * 1000);
    }
    out.push({ ...e, key: e.sourceKey, userId, projectId: projectId ?? null, taskId, startAt, endAt });
  }
  return { incoming: out, unmatched };
}

export type Choice = "existing" | "new" | "both";

export type Plan = {
  source: ImportSource;
  fresh: Incoming[]; // nothing like it in Fathom Time yet
  alreadyImported: number;
  /** Skipped in an earlier import of this source; not asked again. */
  alreadyReviewed: number;
  afterCutover: number;
  /** Person-days in this file over 16 hours in total (shown as a warning). */
  heavyDays: { userId: string; date: string; seconds: number }[];
  long: { id: string; entry: Incoming; take: boolean }[]; // default: skip
  duplicates: { id: string; incoming: Incoming; existing: ExistingEntry; choice: Choice }[];
  overlaps: {
    id: string;
    userId: string;
    date: string;
    incoming: Incoming[];
    existing: ExistingEntry[];
    choice: Choice;
  }[];
  changed: { id: string; old: ExistingEntry; incoming: Incoming; apply: boolean }[];
  removed: { id: string; entry: ExistingEntry; remove: boolean }[];
};

/**
 * Sorts incoming entries against what's already in Fathom Time (all
 * sources, for the same people around the same dates).
 */
export function buildPlan(
  source: ImportSource,
  incomingAll: Incoming[],
  existing: ExistingEntry[],
  opts: { cutover: string | null; tzOf: (e: Incoming) => string; decidedKeys?: Set<string> }
): Plan {
  const plan: Plan = {
    source,
    fresh: [],
    alreadyImported: 0,
    alreadyReviewed: 0,
    afterCutover: 0,
    heavyDays: [],
    long: [],
    duplicates: [],
    overlaps: [],
    changed: [],
    removed: [],
  };

  // Jibble rows on or after the cut-over date are refused.
  let incoming = incomingAll;
  if (source === "jibble" && opts.cutover) {
    incoming = incomingAll.filter((e) => e.date < opts.cutover!);
    plan.afterCutover = incomingAll.length - incoming.length;
  }

  // Already imported from this source (same key).
  const sameSourceKeys = new Set(existing.filter((x) => x.source === source).map((x) => x.source_key ?? ""));
  const fileKeys = new Set(incoming.map((e) => e.key));
  const notYet = incoming.filter((e) => {
    if (sameSourceKeys.has(e.key)) {
      plan.alreadyImported++;
      return false;
    }
    if (opts.decidedKeys?.has(e.key)) {
      plan.alreadyReviewed++;
      return false;
    }
    return true;
  });

  // Unusually long days in the file (e.g. several days logged under one date).
  const dayTotals = new Map<string, number>();
  for (const e of incoming)
    dayTotals.set(`${e.userId}|${e.date}`, (dayTotals.get(`${e.userId}|${e.date}`) ?? 0) + e.seconds);
  for (const [k, sec] of dayTotals) {
    if (sec > HEAVY_DAY_SECONDS) {
      const [userId, date] = k.split("|");
      plan.heavyDays.push({ userId, date, seconds: sec });
    }
  }

  // Gone from the source since it was last imported (same people, same date range).
  const people = new Set(incoming.map((e) => e.userId));
  const dates = incoming.map((e) => e.date).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const tzFor = new Map(incoming.map((e) => [e.userId, opts.tzOf(e)]));
  const dateOf = (x: ExistingEntry) => dayKey(new Date(x.start_at), tzFor.get(x.user_id) ?? "America/Chicago");
  const gone = existing.filter(
    (x) =>
      x.source === source &&
      people.has(x.user_id) &&
      first !== undefined &&
      dateOf(x) >= first &&
      dateOf(x) <= last &&
      !fileKeys.has(x.source_key ?? "")
  );

  // A removed entry and a new one for the same person, day, project and task: "changed".
  const usedNew = new Set<string>();
  const stillGone: ExistingEntry[] = [];
  for (const old of gone) {
    const match = notYet.find(
      (n) =>
        !usedNew.has(n.key) &&
        n.userId === old.user_id &&
        n.date === dateOf(old) &&
        n.projectId === old.project_id &&
        n.taskId === old.task_id
    );
    if (match) {
      usedNew.add(match.key);
      plan.changed.push({ id: `c:${old.id}`, old, incoming: match, apply: true });
    } else {
      stillGone.push(old);
    }
  }
  plan.removed = stillGone.map((entry) => ({ id: `r:${entry.id}`, entry, remove: true }));

  const remaining = notYet.filter((n) => !usedNew.has(n.key));

  // Over 12 hours: always reviewed, skipped by default.
  const normal: Incoming[] = [];
  for (const n of remaining) {
    if (n.seconds > LONG_SECONDS) plan.long.push({ id: `l:${n.key}`, entry: n, take: false });
    else normal.push(n);
  }

  // Same person and day from another source (or typed into Fathom Time).
  const others = existing.filter((x) => x.source !== source);
  const othersByDay = new Map<string, ExistingEntry[]>();
  for (const x of others) {
    const k = `${x.user_id}|${dateOf(x)}`;
    othersByDay.set(k, [...(othersByDay.get(k) ?? []), x]);
  }
  const usedExisting = new Set<string>();
  const leftByDay = new Map<string, Incoming[]>();
  for (const n of normal) {
    const dayList = othersByDay.get(`${n.userId}|${n.date}`) ?? [];
    const twin = dayList.find(
      (x) =>
        !usedExisting.has(x.id) && Math.abs(seconds(x.start_at, x.end_at) - n.seconds) <= DUPLICATE_TOLERANCE_SECONDS
    );
    if (twin) {
      usedExisting.add(twin.id);
      plan.duplicates.push({
        id: `d:${n.key}`,
        incoming: n,
        existing: twin,
        choice: rank(twin.source) <= rank(source) ? "existing" : "new",
      });
      continue;
    }
    if (dayList.length) {
      const k = `${n.userId}|${n.date}`;
      leftByDay.set(k, [...(leftByDay.get(k) ?? []), n]);
      continue;
    }
    plan.fresh.push(n);
  }
  for (const [k, list] of leftByDay) {
    const theirs = (othersByDay.get(k) ?? []).filter((x) => !usedExisting.has(x.id));
    if (!theirs.length) {
      plan.fresh.push(...list);
      continue;
    }
    const best = Math.min(...theirs.map((x) => rank(x.source)));
    const [userId, date] = k.split("|");
    plan.overlaps.push({
      id: `o:${k}`,
      userId,
      date,
      incoming: list,
      existing: theirs,
      choice: best <= rank(source) ? "existing" : "new",
    });
  }
  return plan;
}

/** Keys of entries left out of the import (remembered so a re-import doesn't ask again). */
export function skippedKeys(plan: Plan) {
  const keys: string[] = [];
  for (const l of plan.long) if (!l.take) keys.push(l.entry.key);
  for (const d of plan.duplicates) if (d.choice === "existing") keys.push(d.incoming.key);
  for (const o of plan.overlaps) if (o.choice === "existing") keys.push(...o.incoming.map((x) => x.key));
  for (const c of plan.changed) if (!c.apply) keys.push(c.incoming.key);
  return keys;
}

/** What to write: entries to add and existing entries to delete. */
export function applyPlan(plan: Plan) {
  const add: Incoming[] = [...plan.fresh];
  const remove = new Set<string>();
  for (const l of plan.long) if (l.take) add.push(l.entry);
  for (const d of plan.duplicates) {
    if (d.choice === "new") remove.add(d.existing.id);
    if (d.choice !== "existing") add.push(d.incoming);
  }
  for (const o of plan.overlaps) {
    if (o.choice === "new") o.existing.forEach((x) => remove.add(x.id));
    if (o.choice !== "existing") add.push(...o.incoming);
  }
  for (const c of plan.changed) {
    if (c.apply) {
      remove.add(c.old.id);
      add.push(c.incoming);
    }
  }
  for (const r of plan.removed) if (r.remove) remove.add(r.entry.id);
  return { add, remove: [...remove] };
}

/** Wider than the file's dates, so entries near midnight and in other zones are compared too. */
export function compareRange(entries: Incoming[]) {
  const dates = entries.map((e) => e.date).sort();
  return { from: addDays(dates[0], -1), to: addDays(dates[dates.length - 1], 2) };
}
