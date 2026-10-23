"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import BlockEditor, { type EditorState } from "@/components/tracker/BlockEditor";
import type { Catalog } from "@/lib/useCatalog";
import type { EntriesApi } from "@/components/tracker/useEntries";
import { EMPTY_DRAFT, type Draft, type Entry } from "@/lib/data";
import { useNow } from "@/lib/useNow";
import {
  addDays,
  atMinutes,
  dayKey,
  formatClock,
  formatHoursMinutes,
  formatTime,
  minutesOfDay,
  parseKey,
  secondsBetween,
  startOfDay,
  weekdayShort,
  weekStart,
} from "@/lib/time";

const HOUR = 48; // pixels per hour
const SNAP = 15; // minutes
const DAY = 1440;
const px = (min: number) => (min * HOUR) / 60;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Something drawn on the grid: a saved entry, the running timer, or a block being made. */
type Item = {
  key: string;
  entry: Entry | null;
  draft: Draft;
  start: Date;
  end: Date;
  running?: boolean;
  ghost?: boolean;
  editing?: boolean;
};

/** One day's slice of an item, placed side by side with anything it overlaps. */
type Seg = { item: Item; day: number; top: number; bottom: number; col: number; cols: number; last: boolean };

type Drag =
  | { kind: "create"; day: number; anchor: number; cur: number; moved: boolean; x0: number; y0: number }
  | { kind: "move"; entry: Entry; day0: number; min0: number; day: number; min: number; copy: boolean; moved: boolean; x0: number; y0: number }
  | { kind: "resize"; entry: Entry; day: number; top: number; cur: number };

const toDraft = (e: Entry): Draft => ({
  description: e.description,
  project_id: e.project_id,
  task_id: e.task_id,
  tag_ids: e.tag_ids,
  billable: e.billable,
});

/**
 * Google Calendar style week: click an empty slot for a 1-hour block or drag
 * for any length (15-minute steps); drag a block to move it (Option/Alt to
 * copy), drag its bottom edge to change the end, click it to edit.
 */
export default function WeekCalendar({
  catalog,
  api,
  tz,
  todayKey,
  weekKey,
  onWeekChange,
}: {
  catalog: Catalog;
  api: EntriesApi;
  tz: string;
  todayKey: string;
  weekKey: string;
  onWeekChange: (weekKey: string) => void;
}) {
  const now = useNow(60_000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekKey, i)), [weekKey]);

  // Open at 7 AM.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = px(7 * 60);
  }, []);

  // ---- what to draw ----

  const items = useMemo(() => {
    const from = startOfDay(weekKey, tz).getTime();
    const to = startOfDay(addDays(weekKey, 7), tz).getTime();
    const out: Item[] = [];
    const editingId = editor?.mode === "edit" ? editor.entry?.id : null;

    for (const e of api.entries) {
      if (!e.end_at) continue;
      let start = new Date(e.start_at);
      let end = new Date(e.end_at);
      let draft = toDraft(e);
      let editing = false;
      if (drag?.kind === "move" && drag.entry.id === e.id && drag.moved && !drag.copy) {
        [start, end] = shifted(e, drag);
      } else if (drag?.kind === "resize" && drag.entry.id === e.id) {
        end = resizedEnd(drag);
      } else if (editor && e.id === editingId) {
        [start, end] = editorTimes(editor, e);
        draft = editor.draft;
        editing = true;
      }
      if (start.getTime() < to && Math.max(end.getTime(), start.getTime() + 1) > from) {
        out.push({ key: e.id, entry: e, draft, start, end, editing });
      }
    }

    if (api.running && api.running.id !== "pending") {
      const r = api.running;
      out.push({ key: r.id, entry: r, draft: toDraft(r), start: new Date(r.start_at), end: new Date(Math.max(now, Date.now())), running: true });
    }

    if (drag?.kind === "move" && drag.copy && drag.moved) {
      const [start, end] = shifted(drag.entry, drag);
      out.push({ key: "copy", entry: null, draft: toDraft(drag.entry), start, end, ghost: true });
    }
    if (drag?.kind === "create" && drag.moved) {
      const [a, b] = createRange(drag);
      out.push({ key: "new", entry: null, draft: EMPTY_DRAFT, start: atMinutes(days[drag.day], a, tz), end: atMinutes(days[drag.day], b, tz), ghost: true });
    }
    if (editor?.mode === "new") {
      const [start, end] = editorTimes(editor, null);
      out.push({ key: "new", entry: null, draft: editor.draft, start, end, ghost: true, editing: true });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.entries, api.running, drag, editor, weekKey, tz, now, days]);

  const segs = useMemo(() => layout(items, days, tz), [items, days, tz]);

  const totals = useMemo(() => {
    const t = new Map<string, number>();
    for (const e of api.entries) {
      if (!e.end_at) continue;
      const k = dayKey(new Date(e.start_at), tz);
      t.set(k, (t.get(k) ?? 0) + secondsBetween(e.start_at, e.end_at));
    }
    return t;
  }, [api.entries, tz]);

  // ---- helpers that read the drag and the editor ----

  function shifted(e: Entry, d: Extract<Drag, { kind: "move" }>): [Date, Date] {
    const start = new Date(e.start_at);
    const length = new Date(e.end_at!).getTime() - start.getTime();
    const delta = Math.round((d.min - d.min0) / SNAP) * SNAP;
    const s = atMinutes(addDays(dayKey(start, tz), d.day - d.day0), minutesOfDay(start, tz) + delta, tz);
    return [s, new Date(s.getTime() + length)];
  }

  function resizedEnd(d: Extract<Drag, { kind: "resize" }>): Date {
    const end = Math.max(Math.round(d.cur / SNAP) * SNAP, d.top + SNAP);
    return atMinutes(days[d.day], end, tz);
  }

  function editorTimes(ed: EditorState, e: Entry | null): [Date, Date] {
    if (e && ed.orig && ed.dateKey === ed.orig.dateKey && ed.startMin === ed.orig.startMin && ed.durMin === ed.orig.durMin) {
      return [new Date(e.start_at), new Date(e.end_at!)];
    }
    return [atMinutes(ed.dateKey, ed.startMin, tz), atMinutes(ed.dateKey, ed.startMin + ed.durMin, tz)];
  }

  function createRange(d: Extract<Drag, { kind: "create" }>): [number, number] {
    if (!d.moved) {
      const a = Math.min(Math.floor(d.anchor / SNAP) * SNAP, DAY - 60);
      return [a, a + 60];
    }
    const a = Math.floor(Math.min(d.anchor, d.cur) / SNAP) * SNAP;
    const b = Math.max(Math.ceil(Math.max(d.anchor, d.cur) / SNAP) * SNAP, a + SNAP);
    return [a, Math.min(b, DAY)];
  }

  // ---- pointer ----

  const point = (e: React.PointerEvent) => {
    const r = colsRef.current!.getBoundingClientRect();
    return {
      day: clamp(Math.floor(((e.clientX - r.left) / r.width) * 7), 0, 6),
      min: clamp(((e.clientY - r.top) / HOUR) * 60, 0, DAY),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // A click on the grid while the editor is open just closes it.
    if (editor) return setEditor(null);
    const { day, min } = point(e);
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-entry]");
    const entry = el ? api.entries.find((x) => x.id === el.dataset.entry) : undefined;
    if (el && !entry) return; // the running timer: edit it in the bar
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    if (entry && (e.target as HTMLElement).closest("[data-resize]")) {
      setDrag({ kind: "resize", entry, day: Number(el!.dataset.day), top: Number(el!.dataset.top), cur: min });
    } else if (entry) {
      setDrag({ kind: "move", entry, day0: day, min0: min, day, min, copy: e.altKey, moved: false, x0: e.clientX, y0: e.clientY });
    } else {
      setDrag({ kind: "create", day, anchor: min, cur: min, moved: false, x0: e.clientX, y0: e.clientY });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { day, min } = point(e);
    const moved = (d: { moved: boolean; x0: number; y0: number }) =>
      d.moved || Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) > 4;
    if (drag.kind === "create") setDrag({ ...drag, cur: min, moved: moved(drag) });
    else if (drag.kind === "move") setDrag({ ...drag, day, min, copy: e.altKey, moved: moved(drag) });
    else setDrag({ ...drag, cur: min });
  };

  const onPointerUp = () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.kind === "create") {
      const [a, b] = createRange(d);
      setEditor({ mode: "new", entry: null, orig: null, draft: EMPTY_DRAFT, dateKey: days[d.day], startMin: a, durMin: b - a, focus: "description", openId: Date.now() });
    } else if (d.kind === "move") {
      if (!d.moved) return openEntry(d.entry);
      const [s, end] = shifted(d.entry, d);
      if (d.copy) api.duplicateEntry(d.entry, s, end);
      else if (s.getTime() !== new Date(d.entry.start_at).getTime()) {
        api.updateEntry(d.entry, { start_at: s.toISOString(), end_at: end.toISOString() });
      }
    } else {
      const end = resizedEnd(d);
      if (end.getTime() !== new Date(d.entry.end_at!).getTime()) api.updateEntry(d.entry, { end_at: end.toISOString() });
    }
  };

  const openEntry = (entry: Entry) => {
    const start = new Date(entry.start_at);
    const orig = {
      dateKey: dayKey(start, tz),
      startMin: minutesOfDay(start, tz),
      durMin: Math.round(secondsBetween(entry.start_at, entry.end_at!) / 60),
    };
    setEditor({ mode: "edit", entry, orig, draft: toDraft(entry), ...orig, focus: "description", openId: Date.now() });
  };

  // ---- editor actions ----

  const save = async (ed: EditorState) => {
    if (ed.durMin <= 0) return false;
    const start = atMinutes(ed.dateKey, ed.startMin, tz);
    const end = atMinutes(ed.dateKey, ed.startMin + ed.durMin, tz);
    const draft = { ...ed.draft, description: ed.draft.description.trim() };
    if (ed.mode === "new") {
      if (!(await api.addManual(draft, start, end))) return false;
    } else if (ed.entry) {
      const e = ed.entry;
      const timesChanged = ed.dateKey !== ed.orig!.dateKey || ed.startMin !== ed.orig!.startMin || ed.durMin !== ed.orig!.durMin;
      const patch = {
        ...(draft.description !== e.description ? { description: draft.description } : {}),
        ...(draft.project_id !== e.project_id || draft.task_id !== e.task_id
          ? { project_id: draft.project_id, task_id: draft.task_id }
          : {}),
        ...(draft.billable !== e.billable ? { billable: draft.billable } : {}),
        ...(timesChanged ? { start_at: start.toISOString(), end_at: end.toISOString() } : {}),
      };
      const tagsChanged = draft.tag_ids.length !== e.tag_ids.length || draft.tag_ids.some((t) => !e.tag_ids.includes(t));
      if (Object.keys(patch).length || tagsChanged) api.updateEntry(e, patch, tagsChanged ? draft.tag_ids : undefined);
    }
    setEditor(null);
    if (!days.includes(ed.dateKey)) onWeekChange(weekStart(ed.dateKey));
    return true;
  };

  // ---- render ----

  const nowMin = minutesOfDay(new Date(now), tz);
  const todayIndex = days.indexOf(todayKey);
  const cursor =
    drag?.kind === "move" && drag.moved ? (drag.copy ? "cursor-copy" : "cursor-grabbing") : drag?.kind === "resize" ? "cursor-ns-resize" : "";

  return (
    <div className="rounded-lg border border-light bg-white">
      <div ref={scrollRef} className="relative overflow-y-auto rounded-lg" style={{ height: "calc(100vh - 250px)", minHeight: 420 }}>
        <div className="sticky top-0 z-20 flex border-b border-light bg-white">
          <div className="w-14 shrink-0" />
          {days.map((k, i) => {
            const isToday = k === todayKey;
            const secs = totals.get(k) ?? 0;
            return (
              <div key={k} className={`flex-1 border-l border-lightest py-2 text-center ${i === 0 || i === 6 ? "bg-canvas/60" : ""}`}>
                <div className={`font-display text-[11px] font-semibold tracking-wide ${isToday ? "text-blue" : "text-charcoal/70"}`}>
                  {weekdayShort(k).toUpperCase()}
                </div>
                <div
                  className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-semibold ${
                    isToday ? "bg-blue text-white" : "text-navy"
                  }`}
                >
                  {parseKey(k).d}
                </div>
                <div className="tabular mt-0.5 text-[11px] text-charcoal/70">{secs ? formatHoursMinutes(secs) : "–"}</div>
              </div>
            );
          })}
        </div>

        <div className="flex">
          <div className="relative w-14 shrink-0" style={{ height: px(DAY) }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <span key={h} className="tabular absolute right-2 -translate-y-1/2 text-[11px] text-charcoal/60" style={{ top: px(h * 60) }}>
                {formatClock(h * 60).replace(":00", "")}
              </span>
            ))}
          </div>

          <div
            ref={colsRef}
            className={`relative flex-1 touch-none select-none ${cursor}`}
            style={{ height: px(DAY) }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
          >
            {days.map((k, i) => (
              <div
                key={k}
                className={`absolute inset-y-0 border-l border-lightest ${i === 0 || i === 6 ? "bg-canvas/60" : ""}`}
                style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }}
              />
            ))}
            {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
              <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-lightest" style={{ top: px(h * 60) }} />
            ))}

            {segs.map((s) => (
              <Block key={`${s.item.key}-${s.day}`} seg={s} catalog={catalog} tz={tz} onOpen={openEntry} />
            ))}

            {todayIndex >= 0 && (
              <div
                className="pointer-events-none absolute z-10 h-0.5 bg-danger"
                style={{ top: px(nowMin), left: `${(todayIndex / 7) * 100}%`, width: `${100 / 7}%` }}
              >
                <span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-danger" />
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="border-t border-light px-4 py-2 text-xs text-charcoal/70">
        Click an empty slot for a 1-hour block, or drag down for any length. Drag a block to move it to another time or day; hold
        Option while dragging to copy it. Drag a block&apos;s bottom edge to change its end. Click a block to edit.
      </p>

      {editor && (
        <BlockEditor
          state={editor}
          onChange={(patch) => setEditor((cur) => (cur ? { ...cur, ...patch } : cur))}
          onClose={() => setEditor(null)}
          onSave={save}
          onDelete={(e) => {
            setEditor(null);
            api.deleteEntry(e);
          }}
          anchor={colsRef}
          catalog={catalog}
          todayKey={todayKey}
          tz={tz}
        />
      )}
    </div>
  );
}

/** Split items into per-day slices and put overlapping slices side by side. */
function layout(items: Item[], days: string[], tz: string): Seg[] {
  const out: Seg[] = [];
  for (let d = 0; d < 7; d++) {
    const key = days[d];
    const raw: Seg[] = [];
    for (const item of items) {
      const sKey = dayKey(item.start, tz);
      const eKey = dayKey(item.end, tz);
      if (key < sKey || key > eKey) continue;
      const top = key === sKey ? minutesOfDay(item.start, tz) : 0;
      const endMin = minutesOfDay(item.end, tz);
      if (key === eKey && key !== sKey && endMin === 0) continue; // ends exactly at midnight
      const bottom = key === eKey ? endMin : DAY;
      raw.push({ item, day: d, top, bottom, col: 0, cols: 1, last: key === eKey || (endMin === 0 && key === addDays(eKey, -1)) });
    }
    raw.sort((a, b) => a.top - b.top || b.bottom - a.bottom);
    let cluster: Seg[] = [];
    let colEnds: number[] = [];
    let clusterEnd = -1;
    const finish = () => {
      for (const s of cluster) s.cols = colEnds.length;
      out.push(...cluster);
      cluster = [];
      colEnds = [];
    };
    for (const s of raw) {
      const visualBottom = Math.max(s.bottom, s.top + SNAP);
      if (s.top >= clusterEnd) finish();
      let col = colEnds.findIndex((end) => end <= s.top);
      if (col < 0) col = colEnds.push(0) - 1;
      colEnds[col] = visualBottom;
      s.col = col;
      cluster.push(s);
      clusterEnd = Math.max(clusterEnd, visualBottom);
    }
    finish();
  }
  return out;
}

function Block({ seg, catalog, tz, onOpen }: { seg: Seg; catalog: Catalog; tz: string; onOpen: (e: Entry) => void }) {
  const { item } = seg;
  const project = item.draft.project_id ? catalog.projectById.get(item.draft.project_id) : undefined;
  const task = item.draft.task_id ? catalog.taskById.get(item.draft.task_id) : undefined;
  const color = project?.color ?? "#BBBCC0";
  const height = Math.max(px(seg.bottom - seg.top), px(SNAP)) - 2;
  const times = `${formatTime(item.start, tz)} – ${formatTime(item.end, tz)}`;
  // Project, task, description, then time; empty ones are skipped.
  const lines = [project?.name, task?.name, item.draft.description].filter(Boolean) as string[];
  const canDrag = !!item.entry && !item.running && !item.ghost;

  return (
    <div
      data-entry={item.entry && !item.running ? item.entry.id : item.running ? "running" : undefined}
      data-day={seg.day}
      data-top={seg.top}
      data-editing={item.editing ? "" : undefined}
      role={canDrag ? "button" : undefined}
      tabIndex={canDrag ? 0 : undefined}
      onKeyDown={(e) => {
        if (canDrag && e.key === "Enter") onOpen(item.entry!);
      }}
      title={item.running ? "Timer running. Stop or edit it in the bar above." : [...lines, times].join("\n")}
      className={`absolute overflow-hidden rounded-md border px-1.5 text-xs leading-tight ${
        item.ghost || item.editing ? "z-10 shadow-md" : ""
      } ${item.running ? "animate-pulse" : ""} ${canDrag ? "cursor-grab" : ""}`}
      style={{
        top: px(seg.top) + 1,
        height,
        left: `calc(${(seg.day + seg.col / seg.cols) / 7} * 100% + 2px)`,
        width: `calc(${1 / (7 * seg.cols)} * 100% - 4px)`,
        background: item.ghost ? `${color}55` : `${color}26`,
        borderColor: item.editing ? color : `${color}66`,
        borderLeft: `3px solid ${color}`,
        borderStyle: item.ghost && !item.editing ? "dashed" : "solid",
      }}
    >
      {height < 30 ? (
        <div className="truncate pt-px text-navy">
          {lines[0] && <span className="font-medium">{lines[0]}, </span>}
          <span className="text-charcoal/70">{formatTime(item.start, tz)}</span>
        </div>
      ) : (
        <div className="pt-0.5">
          {lines.map((line, i) => (
            <div key={i} className={`truncate ${i === 0 ? "font-medium text-navy" : "text-charcoal"}`}>
              {line}
            </div>
          ))}
          <div className="tabular truncate text-charcoal/70">{times}</div>
        </div>
      )}
      {canDrag && seg.last && <div data-resize className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />}
    </div>
  );
}
