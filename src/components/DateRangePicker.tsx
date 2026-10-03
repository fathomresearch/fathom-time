"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import { addDays, parseKey, shortDate, weekStart, weekday } from "@/lib/time";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const monthStart = (key: string) => key.slice(0, 7) + "-01";
const shiftMonth = (key: string, n: number) => {
  const { y, m } = parseKey(key);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
};
const monthEnd = (key: string) => addDays(shiftMonth(key, 1), -1);

/** "Mar 1 – 31, 2026", "Mar 1 – Apr 2, 2026", "Dec 30, 2025 – Jan 2, 2026" */
export function rangeLabel(from: string | null, to: string | null) {
  if (!from && !to) return "All time";
  const year = (k: string) => parseKey(k).y;
  if (from && !to) return `From ${shortDate(from)}, ${year(from)}`;
  if (!from && to) return `Until ${shortDate(to)}, ${year(to)}`;
  if (from === to) return `${shortDate(from!)}, ${year(from!)}`;
  if (year(from!) !== year(to!)) return `${shortDate(from!)}, ${year(from!)} – ${shortDate(to!)}, ${year(to!)}`;
  const sameMonth = from!.slice(0, 7) === to!.slice(0, 7);
  return `${shortDate(from!)} – ${sameMonth ? parseKey(to!).d : shortDate(to!)}, ${year(to!)}`;
}

/**
 * One rounded button that opens a two-month calendar: click a start date,
 * then an end date (the range follows the mouse in between). Presets on the
 * left. `null` on both sides means all time.
 */
export default function DateRangePicker({
  from,
  to,
  todayKey,
  onChange,
  allowAllTime = true,
  align = "left",
}: {
  from: string | null;
  to: string | null;
  todayKey: string;
  onChange: (from: string | null, to: string | null) => void;
  allowAllTime?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => shiftMonth(monthStart(to ?? todayKey), -1));
  const [pending, setPending] = useState<string | null>(null); // start picked, waiting for end
  const [hover, setHover] = useState<string | null>(null);

  const openChange = (o: boolean) => {
    setOpen(o);
    setPending(null);
    setHover(null);
    if (o) setMonth(shiftMonth(monthStart(to ?? from ?? todayKey), to || from ? 0 : -1));
  };

  const choose = (a: string | null, b: string | null) => {
    onChange(a, b);
    openChange(false);
  };

  const pick = (key: string) => {
    if (!pending) {
      setPending(key);
      return;
    }
    choose(key < pending ? key : pending, key < pending ? pending : key);
  };

  // What to highlight: the range being picked, or the current value.
  const lo = pending ? (hover && hover < pending ? hover : pending) : from;
  const hi = pending ? (hover && hover > pending ? hover : pending) : to;

  const ws = weekStart(todayKey);
  const thisMonth = monthStart(todayKey);
  const presets: [string, string | null, string | null][] = [
    ...(allowAllTime ? ([["All time", null, null]] as [string, null, null][]) : []),
    ["This week", ws, addDays(ws, 6)],
    ["Last week", addDays(ws, -7), addDays(ws, -1)],
    ["This month", thisMonth, monthEnd(thisMonth)],
    ["Last month", shiftMonth(thisMonth, -1), addDays(thisMonth, -1)],
    ["Last 3 months", shiftMonth(thisMonth, -2), monthEnd(thisMonth)],
    ["This year", `${parseKey(todayKey).y}-01-01`, `${parseKey(todayKey).y}-12-31`],
    ["Last year", `${parseKey(todayKey).y - 1}-01-01`, `${parseKey(todayKey).y - 1}-12-31`],
  ];

  const renderMonth = (start: string) => {
    const { y, m } = parseKey(start);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const cells = [...Array(weekday(start)).fill(null), ...Array.from({ length: days }, (_, i) => addDays(start, i))];
    return (
      <div className="w-[238px]">
        <p className="mb-2 text-center font-display text-sm font-semibold text-navy">
          {MONTHS[m - 1]} {y}
        </p>
        <div className="grid grid-cols-7 text-center text-[11px] text-charcoal/50">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="pb-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
          {cells.map((key, i) => {
            if (!key) return <span key={"e" + i} />;
            const isStart = key === lo;
            const isEnd = key === hi;
            const inRange = !!(lo && hi && key > lo && key < hi);
            const band =
              lo && hi && lo !== hi && (inRange || isStart || isEnd)
                ? `bg-teal-soft ${isStart ? "rounded-l-full" : ""} ${isEnd ? "rounded-r-full" : ""}`
                : "";
            return (
              <div key={key} className={band}>
                <button
                  type="button"
                  onClick={() => pick(key)}
                  onMouseEnter={() => setHover(key)}
                  aria-label={`${shortDate(key)}, ${y}`}
                  aria-pressed={isStart || isEnd}
                  className={`tabular mx-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                    isStart || isEnd
                      ? "bg-navy font-semibold text-white"
                      : key === todayKey
                        ? "font-semibold text-blue hover:bg-lightest"
                        : "text-charcoal hover:bg-lightest"
                  }`}
                >
                  {parseKey(key).d}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-center gap-1">
      <Popover
        open={open}
        onOpenChange={openChange}
        label={`Date range: ${rangeLabel(from, to)}`}
        width={680}
        align={align}
        triggerClassName="flex h-9 items-center gap-2 rounded-full border border-light bg-white pl-3 pr-4 text-sm font-medium text-navy shadow-sm hover:bg-lightest"
        trigger={
          <>
            <Calendar size={15} className="text-blue" />
            <span className="tabular whitespace-nowrap">{rangeLabel(from, to)}</span>
          </>
        }
      >
        <div className="flex rounded-xl">
          <div className="flex w-[140px] shrink-0 flex-col gap-0.5 border-r border-light p-2">
            {presets.map(([label, a, b]) => {
              const active = a === from && b === to;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => choose(a, b)}
                  className={`rounded-lg px-3 py-1.5 text-left text-sm ${
                    active ? "bg-teal-soft font-semibold text-navy" : "text-charcoal hover:bg-lightest"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex-1 p-4" onMouseLeave={() => setHover(null)}>
            <div className="relative flex justify-between gap-6">
              <button
                type="button"
                onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
                aria-label="Previous month"
                className="absolute left-0 top-0 rounded-full p-1 text-charcoal hover:bg-lightest"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
                aria-label="Next month"
                className="absolute right-0 top-0 rounded-full p-1 text-charcoal hover:bg-lightest"
              >
                <ChevronRight size={16} />
              </button>
              {renderMonth(month)}
              {renderMonth(shiftMonth(month, 1))}
            </div>
            <p className="mt-3 text-center text-xs text-charcoal/60">
              {pending ? `Start: ${shortDate(pending)}. Now pick the end date.` : "Pick a start date, then an end date."}
            </p>
          </div>
        </div>
      </Popover>
      {allowAllTime && (from || to) && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          aria-label="Show all time"
          title="Show all time"
          className="rounded-full p-1.5 text-charcoal/50 hover:bg-lightest hover:text-navy"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
