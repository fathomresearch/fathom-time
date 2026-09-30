"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, weekLabel, weekStart } from "@/lib/time";

/** ‹ This week › with a "Back to this week" link when you're elsewhere. */
export default function WeekNav({
  weekKey,
  todayKey,
  onChange,
}: {
  weekKey: string;
  todayKey: string;
  onChange: (weekKey: string) => void;
}) {
  const thisWeek = weekStart(todayKey);
  return (
    <div className="flex items-center gap-3">
      {weekKey !== thisWeek && (
        <button type="button" onClick={() => onChange(thisWeek)} className="text-sm text-blue hover:underline">
          Back to this week
        </button>
      )}
      <div className="flex h-9 items-center rounded-md border border-light bg-white">
        <button
          type="button"
          onClick={() => onChange(addDays(weekKey, -7))}
          aria-label="Previous week"
          className="flex h-full items-center rounded-l-md px-2 text-charcoal hover:bg-lightest"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="flex h-full min-w-[150px] items-center justify-center border-x border-light px-3 font-display text-sm font-semibold text-navy">
          {weekLabel(weekKey, todayKey)}
        </span>
        <button
          type="button"
          onClick={() => onChange(addDays(weekKey, 7))}
          aria-label="Next week"
          className="flex h-full items-center rounded-r-md px-2 text-charcoal hover:bg-lightest"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
