"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import ProjectPicker from "@/components/tracker/ProjectPicker";
import TagPicker from "@/components/tracker/TagPicker";
import BillableToggle from "@/components/tracker/BillableToggle";
import DatePicker from "@/components/tracker/DatePicker";
import InlineInput from "@/components/tracker/InlineInput";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import type { Catalog } from "@/lib/useCatalog";
import type { Draft, Entry } from "@/lib/data";
import {
  formatClock,
  formatDuration,
  formatHoursMinutes,
  parseDateInput,
  parseDurationInput,
  parseTimeInput,
  weekdayDate,
} from "@/lib/time";

type Times = { dateKey: string; startMin: number; durMin: number };

export type EditorState = Times & {
  mode: "new" | "edit";
  /** The saved entry being edited (edit mode). */
  entry: Entry | null;
  /** Its times when the editor opened, so untouched times keep their seconds. */
  orig: Times | null;
  draft: Draft;
  focus: "description" | "date";
  /** Changes whenever the editor opens on something new, to place it again. */
  openId: number;
};

const W = 380;

/** The card that opens next to a calendar block: details, times, date, save. */
export default function BlockEditor({
  state,
  onChange,
  onClose,
  onSave,
  onDelete,
  anchor,
  catalog,
  todayKey,
  tz,
}: {
  state: EditorState;
  onChange: (patch: Partial<EditorState>) => void;
  onClose: () => void;
  onSave: (state: EditorState) => Promise<boolean>;
  onDelete: (entry: Entry) => void;
  /** The calendar grid; the block being edited inside it is marked `data-editing`. */
  anchor: React.RefObject<HTMLDivElement | null>;
  catalog: Catalog;
  todayKey: string;
  tz: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const { draft } = state;

  // Place the card beside the block (right side if it fits, else left).
  useLayoutEffect(() => {
    const block = anchor.current?.querySelector("[data-editing]")?.getBoundingClientRect();
    const h = ref.current?.offsetHeight ?? 320;
    if (!block) {
      setPos({ left: (window.innerWidth - W) / 2, top: Math.max(12, (window.innerHeight - h) / 2) });
      return;
    }
    const left = block.right + 8 + W <= window.innerWidth - 12 ? block.right + 8 : Math.max(12, block.left - 8 - W);
    const top = Math.min(Math.max(12, block.top), window.innerHeight - h - 12);
    setPos({ left, top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.openId]);

  useEffect(() => {
    const field = state.focus === "date" ? "Date" : "Description";
    ref.current?.querySelector<HTMLInputElement>(`input[aria-label="${field}"]`)?.focus();
  }, [state.openId, state.focus]);

  // Close on a click outside, or Esc (unless a picker inside is open or a field is being typed in).
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (confirmDelete) return;
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || confirmDelete) return;
      if (ref.current?.querySelector('[aria-expanded="true"]')) return;
      if ((document.activeElement as HTMLElement | null)?.closest("[data-keep-esc]")) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, confirmDelete]);

  const setDraft = (patch: Partial<Draft>) => onChange({ draft: { ...draft, ...patch } });

  const endMin = (state.startMin + state.durMin) % 1440;
  const extraDays = Math.floor((state.startMin + state.durMin - (endMin === 0 ? 1 : 0)) / 1440);

  const onStart = (text: string) => {
    const m = parseTimeInput(text);
    if (m === null) return toast("Try a time like 9, 930, 9:30 or 2p.");
    // Keep the end where it is.
    const end = state.startMin + state.durMin;
    let dur = end - m;
    if (dur <= 0) dur = (endMin - m + 1440) % 1440 || 60;
    onChange({ startMin: m, durMin: dur });
  };

  const onEnd = (text: string) => {
    const m = parseTimeInput(text);
    if (m === null) return toast("Try a time like 5, 530, 5:30 or 5p.");
    const dur = (m - state.startMin + 1440) % 1440;
    if (dur === 0) return toast("The end has to be after the start.");
    onChange({ durMin: dur });
  };

  const onDuration = (text: string) => {
    const secs = parseDurationInput(text);
    if (secs === null || secs < 60) return toast("Try a length like 1:30, 1.5, 90m, 2h or 200.");
    onChange({ durMin: Math.min(Math.round(secs / 60), 1440 * 2) });
  };

  const onDate = (text: string) => {
    const key = parseDateInput(text, state.dateKey);
    if (!key) return toast("Try a date like Oct 24, 10/24 or 2026-10-24.");
    onChange({ dateKey: key });
  };

  const save = async () => {
    if (state.durMin <= 0) return toast("The end has to be after the start.");
    setSaving(true);
    await onSave({ ...state, draft });
    setSaving(false);
  };

  const duplicate = () =>
    onChange({ mode: "new", entry: null, orig: null, focus: "date", openId: Date.now() });

  const field = "rounded-md border border-light focus-within:border-blue";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={state.mode === "new" ? "New time block" : "Edit time block"}
      className="fixed z-40 rounded-lg border border-light bg-white p-4 shadow-xl"
      style={{ width: W, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold text-navy">
          {state.mode === "edit" ? "Edit time block" : state.focus === "date" ? "Copy of block" : "New time block"}
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-medium hover:bg-lightest hover:text-navy">
          <X size={16} />
        </button>
      </div>

      <input
        aria-label="Description"
        value={draft.description}
        onChange={(e) => setDraft({ description: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        placeholder="What did you work on?"
        className="h-10 w-full rounded-md border border-light px-3 text-sm text-navy placeholder:text-medium focus:border-blue focus:outline-none"
      />

      <div className="mt-2 flex items-center gap-1 rounded-md border border-light px-1 py-0.5">
        <div className="min-w-0 flex-1">
          <ProjectPicker
            variant="row"
            catalog={catalog}
            projectId={draft.project_id}
            taskId={draft.task_id}
            onChange={(project_id, task_id, project) =>
              setDraft({ project_id, task_id, ...(project ? { billable: project.billable_default } : {}) })
            }
          />
        </div>
        <TagPicker variant="row" catalog={catalog} value={draft.tag_ids} onChange={(tag_ids) => setDraft({ tag_ids })} />
        <BillableToggle value={draft.billable} onChange={(billable) => setDraft({ billable })} />
      </div>

      <div className="mt-3 flex items-center gap-2" data-keep-esc>
        <div className={`flex flex-1 items-center ${field}`}>
          <InlineInput
            ariaLabel="Date"
            value={weekdayDate(state.dateKey) + (state.dateKey.slice(0, 4) !== todayKey.slice(0, 4) ? `, ${state.dateKey.slice(0, 4)}` : "")}
            onCommit={onDate}
            className="min-w-0 flex-1 text-sm text-navy hover:border-transparent focus:border-transparent"
          />
          <DatePicker value={state.dateKey} todayKey={todayKey} onChange={(k) => onChange({ dateKey: k })} showLabel={false} />
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2" data-keep-esc>
        <div className={field}>
          <InlineInput
            ariaLabel="Start time"
            value={formatClock(state.startMin)}
            onCommit={onStart}
            className="tabular w-[88px] text-center text-sm hover:border-transparent focus:border-transparent"
          />
        </div>
        <span className="text-charcoal/60">–</span>
        <div className={`relative ${field}`}>
          <InlineInput
            ariaLabel="End time"
            value={formatClock(endMin)}
            onCommit={onEnd}
            className="tabular w-[88px] text-center text-sm hover:border-transparent focus:border-transparent"
          />
          {extraDays > 0 && (
            <sup className="absolute -right-1 top-1 text-[10px] font-semibold text-blue" title="Ends on a later day">
              +{extraDays}
            </sup>
          )}
        </div>
        <div className={`ml-auto ${field}`}>
          <InlineInput
            ariaLabel="Duration"
            value={formatHoursMinutes(state.durMin * 60)}
            onCommit={onDuration}
            className="tabular w-[72px] text-center text-sm font-semibold text-navy hover:border-transparent focus:border-transparent"
          />
        </div>
      </div>
      <p className="mt-1 text-[11px] text-charcoal/60">Times in {tz.replace(/_/g, " ")}.</p>

      <div className="mt-4 flex items-center gap-1">
        {state.mode === "edit" && state.entry && (
          <>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete"
              title="Delete"
              className="rounded-md p-2 text-medium hover:bg-lightest hover:text-danger"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              onClick={duplicate}
              title="Duplicate: makes a copy you can move to another date"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm text-charcoal hover:bg-lightest"
            >
              <Copy size={14} /> Duplicate
            </button>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-md px-4 text-sm text-charcoal hover:bg-lightest">
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy hover:brightness-95 disabled:opacity-60"
          >
            {state.mode === "new" ? "Add" : "Save"}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        body={`${draft.description || "No description"} · ${formatDuration(state.durMin * 60)}. This can't be undone.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          if (state.entry) onDelete(state.entry);
        }}
      />
    </div>
  );
}
