"use client";

import { useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import { addDays, dateLabel, parseKey, weekday } from "@/lib/time";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function DatePicker({
  value,
  todayKey,
  onChange,
  showLabel = true,
  align = "right",
}: {
  value: string;
  todayKey: string;
  onChange: (key: string) => void;
  showLabel?: boolean;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value.slice(0, 7) + "-01");

  const { y, m } = parseKey(month);
  const first = weekday(month);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array(first).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(month, i)),
  ];

  const shiftMonth = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setMonth(value.slice(0, 7) + "-01");
      }}
      label={`Date: ${dateLabel(value, todayKey)}. Change date`}
      width={264}
      align={align}
      triggerClassName="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-charcoal hover:bg-lightest"
      trigger={
        <>
          <Calendar size={16} className="text-medium" />
          {showLabel && <span className="whitespace-nowrap">{dateLabel(value, todayKey)}</span>}
        </>
      }
    >
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => shiftMonth(-1)} className="rounded p-1 hover:bg-lightest" aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <span className="font-display text-sm font-semibold text-navy">
            {MONTHS[m - 1]} {y}
          </span>
          <button type="button" onClick={() => shiftMonth(1)} className="rounded p-1 hover:bg-lightest" aria-label="Next month">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="py-1 text-charcoal/60">
              {d}
            </span>
          ))}
          {cells.map((key, i) =>
            key ? (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                className={`tabular rounded py-1.5 ${
                  key === value
                    ? "bg-navy text-white"
                    : key === todayKey
                      ? "font-semibold text-blue hover:bg-lightest"
                      : "text-charcoal hover:bg-lightest"
                }`}
              >
                {parseKey(key).d}
              </button>
            ) : (
              <span key={"e" + i} />
            )
          )}
        </div>
      </div>
    </Popover>
  );
}
