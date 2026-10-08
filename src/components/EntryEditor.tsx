"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import ProjectPicker from "@/components/tracker/ProjectPicker";
import BillableToggle from "@/components/tracker/BillableToggle";
import type { Catalog } from "@/lib/useCatalog";
import { formatHoursMinutes, parseDurationInput } from "@/lib/time";

export type EntryValues = {
  seconds: number;
  projectId: string | null;
  taskId: string | null;
  description: string;
  billable: boolean;
};

/**
 * An "Edit" button that opens a small form: hours (plain numbers are hours,
 * like the Timesheet), project and task, description, billable. `onSave`
 * gets only the fields that changed.
 */
export default function EntryEditor({
  catalog,
  value,
  onSave,
  onReset,
  label = "Edit",
}: {
  catalog: Catalog;
  value: EntryValues;
  onSave: (changed: Partial<EntryValues>) => void;
  /** Shown when the entry already has corrections: puts the original back. */
  onReset?: () => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [projectId, setProjectId] = useState(value.projectId);
  const [taskId, setTaskId] = useState(value.taskId);
  const [description, setDescription] = useState(value.description);
  const [billable, setBillable] = useState(value.billable);
  const [error, setError] = useState<string | null>(null);

  const openChange = (o: boolean) => {
    if (o) {
      setHours(formatHoursMinutes(value.seconds));
      setProjectId(value.projectId);
      setTaskId(value.taskId);
      setDescription(value.description);
      setBillable(value.billable);
      setError(null);
    }
    setOpen(o);
  };

  const save = () => {
    const seconds = parseDurationInput(hours, "hours");
    if (seconds === null || seconds <= 0) return setError("Type hours like 8, 1.5, 1:30 or 90m.");
    if (seconds > 24 * 3600) return setError("One entry can't be longer than 24 hours.");
    const changed: Partial<EntryValues> = {};
    if (Math.round(seconds / 60) !== Math.round(value.seconds / 60)) changed.seconds = seconds;
    if (projectId !== value.projectId || taskId !== value.taskId) {
      changed.projectId = projectId;
      changed.taskId = taskId;
    }
    if (description.trim() !== value.description.trim()) changed.description = description.trim();
    if (billable !== value.billable) changed.billable = billable;
    setOpen(false);
    if (Object.keys(changed).length) onSave(changed);
  };

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      label="Edit entry"
      width={400}
      align="right"
      triggerClassName="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-charcoal/70 hover:bg-lightest hover:text-navy"
      trigger={
        <>
          <Pencil size={12} /> {label}
        </>
      }
    >
      <form
        className="grid gap-3 p-4 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="grid gap-1">
          <span className="text-xs text-charcoal/70">Hours</span>
          <input
            autoFocus
            value={hours}
            onChange={(e) => {
              setHours(e.target.value);
              setError(null);
            }}
            className="tabular h-9 w-32 rounded-md border border-light px-2.5 focus:border-medium focus:outline-none"
          />
          <span className="text-[11px] text-charcoal/60">8 = 8 hours, 1.5 or 1:30 = an hour and a half, 90m.</span>
        </label>
        <div className="grid gap-1">
          <span className="text-xs text-charcoal/70">Project and task</span>
          <div className="rounded-md border border-light">
            <ProjectPicker
              catalog={catalog}
              projectId={projectId}
              taskId={taskId}
              variant="row"
              onChange={(p, t) => {
                setProjectId(p);
                setTaskId(t);
                if (p && p !== projectId) setBillable(catalog.projectById.get(p)?.billable_default ?? billable);
              }}
            />
          </div>
          {projectId && (
            <button
              type="button"
              onClick={() => {
                setProjectId(null);
                setTaskId(null);
              }}
              className="justify-self-start text-[11px] text-charcoal/60 hover:text-navy"
            >
              Remove the project
            </button>
          )}
        </div>
        <label className="grid gap-1">
          <span className="text-xs text-charcoal/70">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-9 rounded-md border border-light px-2.5 focus:border-medium focus:outline-none"
          />
        </label>
        <div className="flex items-center gap-1 text-xs text-charcoal/70">
          <BillableToggle value={billable} onChange={setBillable} /> {billable ? "Billable" : "Not billable"}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-2 border-t border-light pt-3">
          {onReset ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onReset();
              }}
              className="text-xs text-charcoal/70 hover:text-navy"
            >
              Undo my changes
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 rounded-md border border-light px-3 text-sm text-charcoal hover:bg-lightest"
            >
              Cancel
            </button>
            <button type="submit" className="h-8 rounded-md bg-teal px-3 font-display text-sm font-semibold text-navy">
              Save
            </button>
          </span>
        </div>
      </form>
    </Popover>
  );
}
