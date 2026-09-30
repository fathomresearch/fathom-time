"use client";

import { memo, useState } from "react";
import { Copy, EllipsisVertical, Play, Trash2 } from "lucide-react";
import ProjectPicker from "@/components/tracker/ProjectPicker";
import TagPicker from "@/components/tracker/TagPicker";
import BillableToggle from "@/components/tracker/BillableToggle";
import DatePicker from "@/components/tracker/DatePicker";
import InlineInput from "@/components/tracker/InlineInput";
import Popover from "@/components/tracker/Popover";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import type { Catalog } from "@/lib/useCatalog";
import type { EntriesApi } from "@/components/tracker/useEntries";
import type { Entry } from "@/lib/data";
import {
  atMinutes,
  dayKey,
  daysBetween,
  formatDateTime,
  formatDuration,
  formatTime,
  minutesOfDay,
  parseDurationInput,
  parseTimeInput,
  secondsBetween,
} from "@/lib/time";

const Divider = () => <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-light" />;

function EntryRow({
  entry,
  catalog,
  api,
  tz,
  todayKey,
}: {
  entry: Entry;
  catalog: Catalog;
  api: EntriesApi;
  tz: string;
  todayKey: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const start = new Date(entry.start_at);
  const end = new Date(entry.end_at!);
  const startKey = dayKey(start, tz);
  const extraDays = daysBetween(startKey, dayKey(end, tz));
  const seconds = secondsBetween(start, end);

  const editor =
    entry.updated_by && entry.updated_by !== entry.user_id
      ? catalog.personById.get(entry.updated_by)
      : undefined;

  // Start or end typed: both are read as times on the entry's start day.
  // An end earlier than the start means the next day.
  const setTimes = (startMin: number, endMin: number) => {
    const s = atMinutes(startKey, startMin, tz);
    let e = atMinutes(startKey, endMin, tz);
    if (e < s) e = atMinutes(startKey, endMin + 1440, tz);
    api.updateEntry(entry, { start_at: s.toISOString(), end_at: e.toISOString() });
  };

  const onStart = (text: string) => {
    const m = parseTimeInput(text);
    if (m === null) return toast("Try a time like 9, 930, 9:30 or 2p.");
    setTimes(m, minutesOfDay(end, tz));
  };

  const onEnd = (text: string) => {
    const m = parseTimeInput(text);
    if (m === null) return toast("Try a time like 5, 530, 5:30 or 5p.");
    setTimes(minutesOfDay(start, tz), m);
  };

  const onDuration = (text: string) => {
    const secs = parseDurationInput(text);
    if (secs === null) return toast("Try a length like 1:30, 1.5, 90m, 2h or 200.");
    api.updateEntry(entry, { end_at: new Date(start.getTime() + secs * 1000).toISOString() });
  };

  const onDate = (key: string) => {
    if (key === startKey) return;
    const s = atMinutes(key, minutesOfDay(start, tz), tz);
    const e = new Date(s.getTime() + seconds * 1000);
    api.updateEntry(entry, { start_at: s.toISOString(), end_at: e.toISOString() });
  };

  return (
    <div className="group flex items-center gap-1 border-t border-lightest py-1.5 pl-3 pr-2 first:border-t-0 hover:bg-[#FAFBFB]">
      <div className="flex min-w-[200px] flex-1 items-center gap-2">
        <InlineInput
          ariaLabel="Description"
          value={entry.description}
          placeholder="Add description"
          selectOnFocus={false}
          onCommit={(v) => api.updateEntry(entry, { description: v.trim() })}
          className="min-w-0 flex-1 text-sm text-navy placeholder:text-medium"
        />
        {editor && (
          <span className="group/pill relative shrink-0">
            <span className="cursor-default rounded-full bg-blue/10 px-2 py-0.5 text-[11px] font-medium text-blue">
              Edited by {editor.name.split(" ")[0] || editor.email}
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-navy px-2.5 py-1.5 text-xs text-white shadow group-hover/pill:block"
            >
              Edited by {editor.name || editor.email} on {formatDateTime(new Date(entry.updated_at), tz)}
            </span>
          </span>
        )}
      </div>

      <ProjectPicker
        variant="row"
        catalog={catalog}
        projectId={entry.project_id}
        taskId={entry.task_id}
        onChange={(project_id, task_id, project) =>
          api.updateEntry(entry, {
            project_id,
            task_id,
            ...(project ? { billable: project.billable_default } : {}),
          })
        }
      />
      <Divider />
      <TagPicker variant="row" catalog={catalog} value={entry.tag_ids} onChange={(ids) => api.updateEntry(entry, {}, ids)} />
      <Divider />
      <BillableToggle value={entry.billable} onChange={(billable) => api.updateEntry(entry, { billable })} />
      <Divider />

      <div className="flex items-center">
        <InlineInput
          ariaLabel="Start time"
          value={formatTime(start, tz)}
          onCommit={onStart}
          className="tabular w-[78px] text-center text-sm text-charcoal"
        />
        <span className="text-charcoal/50">–</span>
        <span className="relative">
          <InlineInput
            ariaLabel="End time"
            value={formatTime(end, tz)}
            onCommit={onEnd}
            className="tabular w-[78px] text-center text-sm text-charcoal"
          />
          {extraDays > 0 && (
            <sup className="absolute -right-0.5 top-0.5 text-[10px] font-semibold text-blue" title={`Ends ${extraDays} day${extraDays > 1 ? "s" : ""} later`}>
              +{extraDays}
            </sup>
          )}
        </span>
        <DatePicker value={startKey} todayKey={todayKey} onChange={onDate} showLabel={false} />
      </div>
      <Divider />

      <InlineInput
        ariaLabel="Duration"
        value={formatDuration(seconds)}
        onCommit={onDuration}
        className="tabular w-[86px] text-center text-sm font-semibold text-navy"
      />

      <button
        type="button"
        onClick={() =>
          api.startTimer({
            description: entry.description,
            project_id: entry.project_id,
            task_id: entry.task_id,
            tag_ids: entry.tag_ids,
            billable: entry.billable,
          })
        }
        aria-label="Continue this entry"
        title="Continue"
        className="rounded-md p-1.5 text-medium hover:bg-lightest hover:text-navy"
      >
        <Play size={16} />
      </button>

      <Popover
        open={menuOpen}
        onOpenChange={setMenuOpen}
        label="More actions"
        width={160}
        align="right"
        triggerClassName="rounded-md p-1.5 text-medium hover:bg-lightest hover:text-navy"
        trigger={<EllipsisVertical size={16} />}
      >
        <div className="p-1">
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              api.duplicateEntry(entry);
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-charcoal hover:bg-lightest"
          >
            <Copy size={14} /> Duplicate
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setConfirmDelete(true);
            }}
            className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-danger hover:bg-lightest"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </Popover>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this entry?"
        body={`${entry.description || "No description"} · ${formatDuration(seconds)}. This can't be undone.`}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          api.deleteEntry(entry);
        }}
      />
    </div>
  );
}

export default memo(EntryRow);
