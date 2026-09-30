"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, List } from "lucide-react";
import ProjectPicker from "@/components/tracker/ProjectPicker";
import TagPicker from "@/components/tracker/TagPicker";
import BillableToggle from "@/components/tracker/BillableToggle";
import DatePicker from "@/components/tracker/DatePicker";
import InlineInput from "@/components/tracker/InlineInput";
import { toast } from "@/components/Toaster";
import type { Catalog } from "@/lib/useCatalog";
import type { EntriesApi } from "@/components/tracker/useEntries";
import { EMPTY_DRAFT, type Draft, type Project } from "@/lib/data";
import { useNow } from "@/lib/useNow";
import {
  addDays,
  atMinutes,
  dayKey,
  formatClock,
  formatDuration,
  formatTime,
  LONG_TIMER_SECONDS,
  minutesOfDay,
  parseDurationInput,
  parseTimeInput,
  secondsBetween,
} from "@/lib/time";

const MODE_KEY = "fathom-time:entry-mode";

const Divider = () => <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-light" />;

export default function EntryBar({
  catalog,
  api,
  tz,
}: {
  catalog: Catalog;
  api: EntriesApi;
  tz: string;
}) {
  const now = useNow(1000);
  const running = api.running;
  const [mode, setModeState] = useState<"timer" | "manual">("timer");

  // Remember timer or manual mode on this computer, like Clockify does.
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === "manual") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setModeState("manual");
      }
    } catch {}
  }, []);
  const setMode = (m: "timer" | "manual") => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {}
  };
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  // Description typed into a running timer, saved after a short pause.
  const [runningDesc, setRunningDesc] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual mode: start (minutes after midnight), length in minutes, and date.
  const todayKey = dayKey(new Date(now), tz);
  const [manual, setManual] = useState(() => {
    const m = minutesOfDay(new Date(), tz);
    return { startMin: m, durMin: 0, dateKey: dayKey(new Date(), tz) };
  });

  useEffect(() => {
    // A different running entry (or none): drop any half-typed description.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRunningDesc(null);
  }, [running?.id]);

  const isRunning = mode === "timer" && !!running;
  const current: Draft = isRunning && running
    ? {
        description: runningDesc ?? running.description,
        project_id: running.project_id,
        task_id: running.task_id,
        tag_ids: running.tag_ids,
        billable: running.billable,
      }
    : draft;

  // ---- changes to the fields ----

  const saveRunning = (patch: Partial<Draft>) => {
    if (!running || running.id === "pending") return;
    const { tag_ids, ...fields } = patch;
    api.updateEntry(running, fields, tag_ids);
  };

  const change = (patch: Partial<Draft>) => {
    if (isRunning) saveRunning(patch);
    else setDraft((d) => ({ ...d, ...patch }));
  };

  const onDescription = (value: string) => {
    if (!isRunning) return setDraft((d) => ({ ...d, description: value }));
    setRunningDesc(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveRunning({ description: value.trim() }), 700);
  };

  const flushDescription = () => {
    if (!isRunning || runningDesc === null || !running) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (runningDesc.trim() !== running.description) saveRunning({ description: runningDesc.trim() });
  };

  const onProject = (projectId: string | null, taskId: string | null, project: Project | null) =>
    change({
      project_id: projectId,
      task_id: taskId,
      ...(project ? { billable: project.billable_default } : {}),
    });

  // ---- timer ----

  const start = () => {
    if (running && running.id === "pending") return;
    api.startTimer({ ...draft, description: draft.description.trim() });
    setDraft(EMPTY_DRAFT);
  };

  const stop = () => {
    flushDescription();
    api.stopTimer();
  };

  const changeStartTime = (text: string) => {
    if (!running) return;
    const mins = parseTimeInput(text);
    if (mins === null) return toast("Try a time like 9:15, 915 or 2p.");
    const key = dayKey(new Date(running.start_at), tz);
    let next = atMinutes(key, mins, tz);
    if (next.getTime() > Date.now()) next = atMinutes(addDays(key, -1), mins, tz);
    api.updateEntry(running, { start_at: next.toISOString() });
  };

  // ---- manual ----

  const endMin = (manual.startMin + manual.durMin) % 1440;
  const crossesMidnight = manual.startMin + manual.durMin >= 1440;

  const setManualStart = (text: string) => {
    const m = parseTimeInput(text);
    if (m === null) return toast("Try a time like 9, 930, 9:30 or 2p.");
    setManual((s) => ({ ...s, startMin: m, durMin: (((s.startMin + s.durMin) % 1440) - m + 1440) % 1440 }));
  };
  const setManualEnd = (text: string) => {
    const m = parseTimeInput(text);
    if (m === null) return toast("Try a time like 5, 530, 5:30 or 5p.");
    setManual((s) => ({ ...s, durMin: (m - s.startMin + 1440) % 1440 }));
  };
  const setManualDuration = (text: string) => {
    const secs = parseDurationInput(text);
    if (secs === null) return toast("Try a length like 1:30, 1.5, 90m, 2h or 200.");
    setManual((s) => ({ ...s, durMin: Math.min(Math.round(secs / 60), 1440 * 2) }));
  };

  const add = async () => {
    if (manual.durMin <= 0) return toast("Set an end time or a duration first.");
    const startAt = atMinutes(manual.dateKey, manual.startMin, tz);
    const endAt = atMinutes(manual.dateKey, manual.startMin + manual.durMin, tz);
    const ok = await api.addManual({ ...draft, description: draft.description.trim() }, startAt, endAt);
    if (ok) {
      setDraft(EMPTY_DRAFT);
      setManual({ startMin: endMin, durMin: 0, dateKey: dayKey(endAt, tz) });
    }
  };

  // ---- render ----

  const elapsed = running ? secondsBetween(running.start_at, new Date(now)) : 0;

  return (
    <div className="mb-8 flex items-center gap-1 rounded-lg border border-light bg-white py-2 pl-4 pr-2">
      <input
        value={current.description}
        onChange={(e) => onDescription(e.target.value)}
        onBlur={flushDescription}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          if (mode === "timer" && !running) start();
          else if (mode === "manual") add();
          else e.currentTarget.blur();
        }}
        placeholder="What have you worked on?"
        aria-label="Description"
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-navy placeholder:text-medium focus:outline-none focus-visible:outline-none"
      />

      <ProjectPicker catalog={catalog} projectId={current.project_id} taskId={current.task_id} onChange={onProject} />
      <Divider />
      <TagPicker catalog={catalog} value={current.tag_ids} onChange={(tag_ids) => change({ tag_ids })} />
      <Divider />
      <BillableToggle value={current.billable} onChange={(billable) => change({ billable })} />
      <Divider />

      {mode === "timer" ? (
        running ? (
          <div className="flex items-center gap-3 pl-1">
            <div className="flex flex-col items-end leading-tight">
              <span
                className={`tabular text-lg font-semibold ${elapsed > LONG_TIMER_SECONDS ? "text-danger" : "text-navy"}`}
                aria-live="off"
                title={elapsed > LONG_TIMER_SECONDS ? "Running over 10 hours. Did you forget to stop it?" : undefined}
              >
                {formatDuration(elapsed)}
              </span>
              {elapsed > LONG_TIMER_SECONDS && (
                <span className="text-xs font-medium text-danger">Over 10 hours. Forgot to stop?</span>
              )}
              <span className="flex items-center text-xs text-charcoal/70">
                started
                <InlineInput
                  ariaLabel="Start time"
                  value={formatTime(new Date(running.start_at), tz)}
                  onCommit={changeStartTime}
                  className="tabular w-[72px] px-1 py-0 text-xs text-charcoal"
                />
              </span>
            </div>
            <button
              type="button"
              onClick={stop}
              className="h-10 w-[92px] rounded-md bg-danger font-display text-sm font-semibold text-white hover:brightness-95"
            >
              STOP
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 pl-1">
            <span className="tabular w-[84px] text-center text-lg font-semibold text-navy">00:00:00</span>
            <button
              type="button"
              onClick={start}
              className="h-10 w-[92px] rounded-md bg-teal font-display text-sm font-semibold text-navy hover:brightness-95"
            >
              START
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center gap-0.5 pl-1">
          <InlineInput
            ariaLabel="Start time"
            value={formatClock(manual.startMin)}
            onCommit={setManualStart}
            className="tabular w-[84px] text-center text-sm"
          />
          <span className="text-charcoal/60">–</span>
          <span className="relative">
            <InlineInput
              ariaLabel="End time"
              value={formatClock(endMin)}
              onCommit={setManualEnd}
              className="tabular w-[84px] text-center text-sm"
            />
            {crossesMidnight && (
              <sup className="absolute -right-0.5 top-0.5 text-[10px] font-semibold text-blue" title="Ends the next day">
                +1
              </sup>
            )}
          </span>
          <DatePicker
            value={manual.dateKey}
            todayKey={todayKey}
            onChange={(k) => setManual((s) => ({ ...s, dateKey: k }))}
          />
          <Divider />
          <InlineInput
            ariaLabel="Duration"
            value={formatDuration(manual.durMin * 60)}
            onCommit={setManualDuration}
            className="tabular w-[92px] text-center text-base font-semibold text-navy"
          />
          <button
            type="button"
            onClick={add}
            className="ml-1 h-10 w-[76px] rounded-md bg-teal font-display text-sm font-semibold text-navy hover:brightness-95"
          >
            ADD
          </button>
        </div>
      )}

      <div className="ml-1 flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => setMode("timer")}
          aria-pressed={mode === "timer"}
          aria-label="Timer mode"
          title="Timer mode: start and stop a clock"
          className={`rounded p-1 ${mode === "timer" ? "text-navy" : "text-medium hover:text-charcoal"}`}
        >
          <Clock size={15} />
        </button>
        <button
          type="button"
          onClick={() => setMode("manual")}
          aria-pressed={mode === "manual"}
          aria-label="Manual mode"
          title="Manual mode: type start and end times"
          className={`rounded p-1 ${mode === "manual" ? "text-navy" : "text-medium hover:text-charcoal"}`}
        >
          <List size={15} />
        </button>
      </div>
    </div>
  );
}
