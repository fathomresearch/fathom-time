"use client";

import { useMemo } from "react";
import EntryRow from "@/components/tracker/EntryRow";
import type { Catalog } from "@/lib/useCatalog";
import type { EntriesApi } from "@/components/tracker/useEntries";
import type { Entry } from "@/lib/data";
import { dayKey, dayLabel, formatDuration, secondsBetween, weekLabel, weekStart } from "@/lib/time";

type Day = { key: string; entries: Entry[]; seconds: number };
type Week = { key: string; days: Day[]; seconds: number };

export default function EntryList({
  catalog,
  api,
  tz,
  todayKey,
}: {
  catalog: Catalog;
  api: EntriesApi;
  tz: string;
  todayKey: string;
}) {
  const weeks = useMemo(() => {
    const byWeek = new Map<string, Map<string, Entry[]>>();
    for (const e of api.entries) {
      if (!e.end_at) continue;
      const d = dayKey(new Date(e.start_at), tz);
      const w = weekStart(d);
      if (!byWeek.has(w)) byWeek.set(w, new Map());
      const days = byWeek.get(w)!;
      days.set(d, [...(days.get(d) ?? []), e]);
    }
    const out: Week[] = [];
    for (const [wKey, days] of [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
      const dayList: Day[] = [...days.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, list]) => {
          const sorted = [...list].sort((a, b) => b.start_at.localeCompare(a.start_at));
          return {
            key,
            entries: sorted,
            seconds: sorted.reduce((s, e) => s + secondsBetween(e.start_at, e.end_at!), 0),
          };
        });
      out.push({ key: wKey, days: dayList, seconds: dayList.reduce((s, d) => s + d.seconds, 0) });
    }
    return out;
  }, [api.entries, tz]);

  if (!api.loaded) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading entries">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg border border-light bg-white" />
        ))}
      </div>
    );
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-medium bg-white/60 px-6 py-12 text-center">
        <p className="font-display text-base font-semibold text-navy">No time logged yet</p>
        <p className="mt-1 text-sm text-charcoal">
          Type what you&apos;re working on and press START, or switch to manual mode to add past time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {weeks.map((w) => (
        <section key={w.key} aria-label={weekLabel(w.key, todayKey)}>
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="font-display text-sm font-semibold text-navy">{weekLabel(w.key, todayKey)}</h2>
            <p className="text-sm text-charcoal">
              Week total: <span className="tabular font-semibold text-navy">{formatDuration(w.seconds)}</span>
            </p>
          </div>
          <div className="space-y-3">
            {w.days.map((d) => (
              <div key={d.key} className="rounded-lg border border-light bg-white">
                <div className="flex items-center justify-between rounded-t-lg border-b border-light bg-lightest px-4 py-2">
                  <h3 className="text-sm font-medium text-charcoal">{dayLabel(d.key, todayKey)}</h3>
                  <p className="text-sm text-charcoal">
                    Total: <span className="tabular font-semibold text-navy">{formatDuration(d.seconds)}</span>
                  </p>
                </div>
                {d.entries.map((e) => (
                  <EntryRow key={e.id} entry={e} catalog={catalog} api={api} tz={tz} todayKey={todayKey} />
                ))}
              </div>
            ))}
          </div>
        </section>
      ))}

      {api.hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={api.loadMore}
            className="h-10 rounded-md border border-light bg-white px-5 font-display text-sm font-semibold text-navy hover:border-medium"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
