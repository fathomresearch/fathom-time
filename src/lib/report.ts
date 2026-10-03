// Totals for Team Overview, the person page and the CSV. All in seconds.
// Callers pass stopped entries only; running timers never count.

import type { Entry } from "@/lib/data";
import { addDays, dayKey } from "@/lib/time";

export const entrySeconds = (e: Pick<Entry, "start_at" | "end_at">) =>
  (new Date(e.end_at!).getTime() - new Date(e.start_at).getTime()) / 1000;

export type PersonWeek = { days: number[]; total: number; billable: number };

/** Per person: seconds per day (Sunday first), total and billable. */
export function weekByPerson(entries: Entry[], weekKey: string, tz: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
  const out = new Map<string, PersonWeek>();
  for (const e of entries) {
    // Counts on the day it starts, even past midnight.
    const i = days.indexOf(dayKey(new Date(e.start_at), tz));
    if (i < 0) continue;
    const secs = entrySeconds(e);
    const row = out.get(e.user_id) ?? { days: Array(7).fill(0), total: 0, billable: 0 };
    row.days[i] += secs;
    row.total += secs;
    if (e.billable) row.billable += secs;
    out.set(e.user_id, row);
  }
  return out;
}

export function totals(entries: Entry[]) {
  let total = 0, billable = 0;
  for (const e of entries) {
    const secs = entrySeconds(e);
    total += secs;
    if (e.billable) billable += secs;
  }
  return { total, billable, billableShare: total > 0 ? billable / total : 0 };
}

export type TreeNode = { id: string | null; seconds: number };
export type ProjectNode = TreeNode & {
  tasks: (TreeNode & { people: { userId: string; seconds: number }[] })[];
};

/** One total for a project + task + person (from time_report()). */
export type ReportItem = { project_id: string | null; task_id: string | null; user_id: string; seconds: number };

/** Project → task (stage) → person, each level biggest first. */
export function projectTree(items: ReportItem[]): ProjectNode[] {
  const projects = new Map<string, Map<string, Map<string, number>>>();
  for (const e of items) {
    const p = e.project_id ?? "";
    const t = e.task_id ?? "";
    const tasks = projects.get(p) ?? new Map<string, Map<string, number>>();
    const people = tasks.get(t) ?? new Map<string, number>();
    people.set(e.user_id, (people.get(e.user_id) ?? 0) + e.seconds);
    tasks.set(t, people);
    projects.set(p, tasks);
  }
  const bySize = (a: TreeNode, b: TreeNode) => b.seconds - a.seconds;
  return [...projects].map(([p, tasks]) => {
    const taskNodes = [...tasks].map(([t, people]) => {
      const list = [...people].map(([userId, seconds]) => ({ userId, seconds })).sort((a, b) => b.seconds - a.seconds);
      return { id: t || null, seconds: list.reduce((s, x) => s + x.seconds, 0), people: list };
    });
    taskNodes.sort(bySize);
    return { id: p || null, seconds: taskNodes.reduce((s, x) => s + x.seconds, 0), tasks: taskNodes };
  }).sort(bySize);
}

/** 0.4567 -> "46%" */
export const percent = (share: number) => `${Number.isFinite(share) ? Math.round(share * 100) : 0}%`;
