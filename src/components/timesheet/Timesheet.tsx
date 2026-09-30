"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CirclePlus, Copy, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import Popover from "@/components/tracker/Popover";
import ProjectPicker, { ProjectLabel } from "@/components/tracker/ProjectPicker";
import InlineInput from "@/components/tracker/InlineInput";
import { toast } from "@/components/Toaster";
import type { Viewer } from "@/components/tracker/TimeTracker";
import { buildGrid, planCell, rowKey, splitKey, useWeek } from "@/components/timesheet/useWeek";
import { useCatalog, type Catalog } from "@/lib/useCatalog";
import { useNow } from "@/lib/useNow";
import type { Entry } from "@/lib/data";
import {
  addDays,
  dayKey,
  formatHoursMinutes,
  parseDurationInput,
  shortDate,
  weekLabel,
  weekStart,
  weekday,
} from "@/lib/time";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 24 * 3600 * 1000;
const rowsStorageKey = (ownerId: string, week: string) => `fathom-time:timesheet-rows:${ownerId}:${week}`;

/**
 * Rows you added (or edited) this week, kept on this computer so an empty
 * row survives a reload until you remove it.
 */
function useKeptRows(ownerId: string, weekKey: string) {
  const [kept, setKept] = useState<{ week: string; keys: string[] }>({ week: "", keys: [] });

  useEffect(() => {
    let keys: string[] = [];
    try {
      keys = JSON.parse(localStorage.getItem(rowsStorageKey(ownerId, weekKey)) ?? "[]");
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKept({ week: weekKey, keys: Array.isArray(keys) ? keys : [] });
  }, [ownerId, weekKey]);

  const update = (fn: (keys: string[]) => string[]) => {
    const keys = fn(kept.week === weekKey ? kept.keys : []);
    setKept({ week: weekKey, keys });
    try {
      if (keys.length) localStorage.setItem(rowsStorageKey(ownerId, weekKey), JSON.stringify(keys));
      else localStorage.removeItem(rowsStorageKey(ownerId, weekKey));
    } catch {}
  };

  return {
    keys: kept.week === weekKey ? kept.keys : [],
    add: (more: string[]) => update((cur) => [...cur, ...more.filter((k) => !cur.includes(k))]),
    remove: (key: string) => update((cur) => cur.filter((k) => k !== key)),
  };
}

/** Projects by name, no-task row first, then tasks in stage order. "No project" last. */
function compareRows(catalog: Catalog) {
  const parts = (key: string) => {
    const { project_id, task_id } = splitKey(key);
    const p = project_id ? catalog.projectById.get(project_id) : undefined;
    const t = task_id ? catalog.taskById.get(task_id) : undefined;
    return { hasProject: project_id ? 0 : 1, name: p?.name.toLowerCase() ?? "", hasTask: task_id ? 1 : 0, order: t?.sort_order ?? 0, task: t?.name.toLowerCase() ?? "" };
  };
  return (a: string, b: string) => {
    const x = parts(a), y = parts(b);
    return (
      x.hasProject - y.hasProject ||
      x.name.localeCompare(y.name) ||
      x.hasTask - y.hasTask ||
      x.order - y.order ||
      x.task.localeCompare(y.task) ||
      a.localeCompare(b)
    );
  };
}

export default function Timesheet({ ownerId, viewer }: { ownerId: string; viewer: Viewer }) {
  // The owner's time zone. On your own timesheet that's also yours.
  const tz = viewer.timezone;
  const now = useNow(60_000);
  const todayKey = dayKey(new Date(now), tz);
  const thisWeek = weekStart(todayKey);
  const [weekKey, setWeekKey] = useState(() => weekStart(dayKey(new Date(), tz)));

  const catalog = useCatalog(viewer.id);
  const week = useWeek(ownerId, tz, weekKey, catalog);
  const kept = useKeptRows(ownerId, weekKey);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [confirm, setConfirm] = useState<{ body: string; resolve: (ok: boolean) => void } | null>(null);
  const focusRow = useRef<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekKey, i)), [weekKey]);
  const grid = useMemo(() => buildGrid(week.entries, weekKey, tz), [week.entries, weekKey, tz]);

  const rows = useMemo(() => {
    const keys = new Set([...grid.keys(), ...kept.keys]);
    return [...keys].sort(compareRows(catalog));
  }, [grid, kept.keys, catalog]);

  const dayTotals = days.map((_, i) => rows.reduce((s, k) => s + (grid.get(k)?.[i] ?? 0), 0));
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);
  const ready = week.loaded && catalog.loaded;
  const runningThisWeek = week.running && days.includes(dayKey(new Date(week.running.start_at), tz));

  // After adding a row, put the cursor in it (today's cell if today is shown).
  useEffect(() => {
    const key = focusRow.current;
    if (!key) return;
    focusRow.current = null;
    const col = days.includes(todayKey) ? todayKey : days[0];
    document
      .querySelector<HTMLInputElement>(`[data-row="${CSS.escape(key)}"] [data-day="${col}"] input`)
      ?.focus();
  }, [rows, days, todayKey]);

  const askToDelete = (deleted: Entry[]) =>
    new Promise<boolean>((resolve) => {
      const named = deleted.filter((e) => e.description || e.tag_ids.length);
      const first = named.find((e) => e.description)?.description;
      const n = deleted.length;
      setConfirm({
        body:
          `This deletes ${n === 1 ? "an entry" : `${n} entries`}` +
          (first ? `, including "${first}"` : "") +
          `. ${n === 1 ? "Its description and tags" : "Their descriptions and tags"} will be lost.`,
        resolve,
      });
    });

  const closeConfirm = (ok: boolean) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };

  const commitCell = async (key: string, day: string, text: string) => {
    const clean = text.trim();
    const secs = clean ? parseDurationInput(clean, "hours") : 0;
    if (secs === null) return toast("Try 8, 1:30, 1.5 or 90m.");
    if (secs * 1000 > DAY_MS) return toast("A day can't have more than 24 hours.");

    const { project_id, task_id } = splitKey(key);
    const cell = week.entries.filter(
      (e) => rowKey(e.project_id, e.task_id) === key && dayKey(new Date(e.start_at), tz) === day
    );
    const plan = planCell(cell, secs * 1000, day, tz);
    if (!plan.update && !plan.insert && !plan.deletes.length) return;
    if (plan.deletes.some((e) => e.description || e.tag_ids.length)) {
      if (!(await askToDelete(plan.deletes))) return;
    }
    // Keep the row on screen even if its time drops to zero.
    kept.add([rowKey(project_id, task_id)]);
    await week.applyPlan(key, plan);
  };

  const addRow = (projectId: string | null, taskId: string | null) => {
    const key = rowKey(projectId, taskId);
    if (rows.includes(key)) return toast("That row is already on the timesheet.", "info");
    focusRow.current = key;
    kept.add([key]);
  };

  const copyLastWeek = async (withTime: boolean) => {
    setCopyOpen(false);
    setCopying(true);
    const result = await week.copyLastWeek(withTime);
    setCopying(false);
    if (!result) return;
    if (!result.rows.length) return toast("Last week has no time to copy.", "info");
    const newRows = result.rows.filter((k) => !rows.includes(k));
    kept.add(result.rows);
    if (!newRows.length && !result.copiedMs) return toast("Last week's rows and time are already here.", "info");
    const rowText = `${newRows.length} ${newRows.length === 1 ? "row" : "rows"}`;
    toast(
      withTime
        ? `Copied ${rowText} and ${formatHoursMinutes(result.copiedMs / 1000)} of time.`
        : `Copied ${rowText}.`,
      "info"
    );
  };

  const rowLabel = (key: string) => {
    const { project_id, task_id } = splitKey(key);
    if (!project_id) return <span className="font-medium text-charcoal/70">No project</span>;
    const project = catalog.projectById.get(project_id);
    return (
      <span className="flex min-w-0 items-center gap-2">
        <ProjectLabel catalog={catalog} projectId={project_id} taskId={task_id} />
        {project?.archived && (
          <span className="shrink-0 rounded bg-lightest px-1.5 py-px text-[10px] font-semibold tracking-wide text-charcoal/70">
            ARCHIVED
          </span>
        )}
      </span>
    );
  };

  return (
    <>
      <PageHeader title="Timesheet">
        <Popover
          open={copyOpen}
          onOpenChange={setCopyOpen}
          label="Copy last week"
          align="right"
          width={260}
          triggerClassName="flex h-9 items-center gap-1.5 rounded-md border border-light bg-white px-3 text-sm font-medium text-navy hover:bg-lightest disabled:opacity-60"
          trigger={
            <>
              <Copy size={15} /> {copying ? "Copying…" : "Copy last week"}
            </>
          }
        >
          <div className="p-1.5">
            <button
              type="button"
              disabled={!ready || copying}
              onClick={() => copyLastWeek(false)}
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-lightest"
            >
              <span className="font-medium text-navy">Rows only</span>
              <span className="block text-xs text-charcoal/70">Same projects and tasks, no time</span>
            </button>
            <button
              type="button"
              disabled={!ready || copying}
              onClick={() => copyLastWeek(true)}
              className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-lightest"
            >
              <span className="font-medium text-navy">Rows with time</span>
              <span className="block text-xs text-charcoal/70">Fills only this week&apos;s empty cells</span>
            </button>
          </div>
        </Popover>

        <div className="flex h-9 items-center rounded-md border border-light bg-white">
          <button
            type="button"
            onClick={() => setWeekKey((k) => addDays(k, -7))}
            aria-label="Previous week"
            className="flex h-full items-center px-2 text-charcoal hover:bg-lightest"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setWeekKey(thisWeek)}
            title={weekKey === thisWeek ? undefined : "Back to this week"}
            className="h-full min-w-[150px] border-x border-light px-3 font-display text-sm font-semibold text-navy hover:bg-lightest"
          >
            {weekLabel(weekKey, todayKey)}
          </button>
          <button
            type="button"
            onClick={() => setWeekKey((k) => addDays(k, 7))}
            aria-label="Next week"
            className="flex h-full items-center px-2 text-charcoal hover:bg-lightest"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </PageHeader>

      <div className="rounded-lg border border-light bg-white">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col />
            {days.map((d) => (
              <col key={d} className="w-[88px]" />
            ))}
            <col className="w-[88px]" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="border-b border-light">
              <th className="px-4 py-2.5 text-left font-display text-xs font-semibold text-charcoal/70">
                Project and task
              </th>
              {days.map((d) => {
                const weekend = weekday(d) === 0 || weekday(d) === 6;
                const today = d === todayKey;
                return (
                  <th
                    key={d}
                    className={`px-1 py-2 text-center font-normal ${weekend ? "bg-canvas" : ""} ${
                      today ? "text-blue" : "text-charcoal/70"
                    }`}
                  >
                    <span className={`block font-display text-xs font-semibold ${today ? "" : "text-navy"}`}>
                      {DAY_NAMES[weekday(d)]}
                    </span>
                    <span className="block text-xs">{shortDate(d)}</span>
                  </th>
                );
              })}
              <th className="px-2 py-2.5 text-right font-display text-xs font-semibold text-charcoal/70">Total</th>
              <th aria-label="Remove row" />
            </tr>
          </thead>

          <tbody>
            {!ready ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-charcoal/60">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-charcoal/70">
                  No time this week. Add a row, or copy last week.
                </td>
              </tr>
            ) : (
              rows.map((key) => {
                const cells = grid.get(key) ?? Array(7).fill(0);
                const total = cells.reduce((a: number, b: number) => a + b, 0);
                const removable = !grid.has(key);
                return (
                  <tr key={key} data-row={key} className="group border-b border-light">
                    <td className="px-2 py-1.5">
                      <div className="flex min-w-0 px-2">{rowLabel(key)}</div>
                    </td>
                    {days.map((d, i) => {
                      const weekend = i === 0 || i === 6;
                      return (
                        <td key={d} data-day={d} className={`px-1 py-1.5 ${weekend ? "bg-canvas" : ""}`}>
                          <div className="rounded-md bg-white">
                            <InlineInput
                              ariaLabel={`${DAY_NAMES[i]} ${shortDate(d)}`}
                              value={cells[i] > 0 ? formatHoursMinutes(cells[i] / 1000) : ""}
                              onCommit={(text) => commitCell(key, d, text)}
                              className="tabular h-9 w-full text-center text-sm text-navy ring-1 ring-inset ring-light focus:ring-0"
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td className="tabular px-2 py-1.5 text-right font-semibold text-navy">
                      {formatHoursMinutes(total / 1000)}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      {removable && (
                        <button
                          type="button"
                          onClick={() => kept.remove(key)}
                          aria-label="Remove row"
                          title="Remove row"
                          className="rounded p-1 text-medium hover:bg-lightest hover:text-charcoal"
                        >
                          <X size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}

            <tr className="border-b border-light">
              <td colSpan={10} className="px-2 py-1.5">
                <ProjectPicker
                  catalog={catalog}
                  projectId={null}
                  taskId={null}
                  onChange={(p, t) => addRow(p, t)}
                  triggerClassName="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-blue hover:bg-lightest"
                  trigger={
                    <>
                      <CirclePlus size={16} /> Add new row
                    </>
                  }
                />
              </td>
            </tr>
          </tbody>

          <tfoot>
            {/* No overflow-hidden on the card (it would clip the project picker),
                so the footer rounds its own bottom corners. */}
            <tr className="[&>td]:bg-lightest/60">
              <td className="rounded-bl-lg px-4 py-2.5 font-display text-xs font-semibold text-navy">Total</td>
              {dayTotals.map((t, i) => (
                <td key={days[i]} className="tabular px-1 py-2.5 text-center font-semibold text-navy">
                  {formatHoursMinutes(t / 1000)}
                </td>
              ))}
              <td className="tabular px-2 py-2.5 text-right font-semibold text-navy">
                {formatHoursMinutes(weekTotal / 1000)}
              </td>
              <td className="rounded-br-lg" />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs text-charcoal/70">
        Type 8, 1:30, 1.5 or 90m. New time starts at 9:00 AM.
        {runningThisWeek && " Your running timer isn't counted until you stop it."}
      </p>

      <ConfirmDialog
        open={!!confirm}
        title="Delete time entries?"
        body={confirm?.body}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
    </>
  );
}
