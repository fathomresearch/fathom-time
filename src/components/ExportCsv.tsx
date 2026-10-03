"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import { toast } from "@/components/Toaster";
import { sb } from "@/lib/supabase/browser";
import { fetchAll } from "@/lib/fetchAll";
import { downloadFile, entriesToCsv } from "@/lib/csv";
import { ENTRY_SELECT, toEntry } from "@/lib/data";
import type { Catalog } from "@/lib/useCatalog";
import { addDays, dayKey, startOfDay } from "@/lib/time";
import DateRangePicker from "@/components/DateRangePicker";

/**
 * Export CSV with a From / To range, starting on the week being viewed.
 * `userId` limits it to one person; without it, row-level security decides
 * (directors and managers get everyone, an analyst only themselves).
 */
export default function ExportCsv({
  catalog,
  tz,
  weekKey,
  userId,
  note,
}: {
  catalog: Catalog;
  tz: string;
  weekKey: string;
  userId?: string;
  /** Whose time is in the file, e.g. "Your time only." */
  note: string;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(weekKey);
  const [to, setTo] = useState<string | null>(addDays(weekKey, 6));
  const [busy, setBusy] = useState(false);

  const openChange = (o: boolean) => {
    if (o) {
      setFrom(weekKey);
      setTo(addDays(weekKey, 6));
    }
    setOpen(o);
  };

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const rows = await fetchAll((a, b) => {
      let q = sb().from("time_entries").select(ENTRY_SELECT).not("end_at", "is", null);
      if (from) q = q.gte("start_at", startOfDay(from, tz).toISOString());
      if (to) q = q.lt("start_at", startOfDay(addDays(to, 1), tz).toISOString());
      if (userId) q = q.eq("user_id", userId);
      return q.order("start_at").order("id").range(a, b);
    });
    setBusy(false);
    if (!rows) return toast("Couldn't export. Check your connection.");
    if (!rows.length) return toast("No time in that range.", "info");
    const range = from || to ? `${from ?? "start"}_to_${to ?? "now"}` : "all-time";
    downloadFile(`fathom-time_${range}.csv`, entriesToCsv(rows.map(toEntry), catalog, tz));
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      label="Export CSV"
      align="right"
      width={300}
      triggerClassName="flex h-9 items-center gap-1.5 rounded-md border border-light bg-white px-3 text-sm font-medium text-navy hover:bg-lightest"
      trigger={
        <>
          <Download size={15} /> Export CSV
        </>
      }
    >
      <form onSubmit={run} className="grid gap-3 p-4">
        <p className="font-display text-sm font-semibold text-navy">Export CSV</p>
        <DateRangePicker
          from={from}
          to={to}
          todayKey={dayKey(new Date(), tz)}
          align="right"
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
        />
        <p className="text-xs text-charcoal/70">
          {note} Running timers are left out.
        </p>
        <button
          type="submit"
          disabled={busy || !catalog.loaded}
          className="h-9 rounded-md bg-teal font-display text-sm font-semibold text-navy disabled:opacity-60"
        >
          {busy ? "Exporting…" : "Download"}
        </button>
      </form>
    </Popover>
  );
}
