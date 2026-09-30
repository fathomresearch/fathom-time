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
import { addDays, startOfDay } from "@/lib/time";

/**
 * Export CSV with a From / To range, starting on the week being viewed.
 * `userId` limits it to one person; without it, row-level security decides
 * (the boss gets everyone, an employee only themselves).
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
  const [from, setFrom] = useState(weekKey);
  const [to, setTo] = useState(addDays(weekKey, 6));
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
    if (!from || !to) return toast("Pick both dates.");
    if (to < from) return toast("The end date is before the start date.");
    setBusy(true);
    const rows = await fetchAll((a, b) => {
      let q = sb()
        .from("time_entries")
        .select(ENTRY_SELECT)
        .not("end_at", "is", null)
        .gte("start_at", startOfDay(from, tz).toISOString())
        .lt("start_at", startOfDay(addDays(to, 1), tz).toISOString());
      if (userId) q = q.eq("user_id", userId);
      return q.order("start_at").order("id").range(a, b);
    });
    setBusy(false);
    if (!rows) return toast("Couldn't export. Check your connection.");
    if (!rows.length) return toast("No time in that range.", "info");
    downloadFile(`fathom-time_${from}_to_${to}.csv`, entriesToCsv(rows.map(toEntry), catalog, tz));
    setOpen(false);
  };

  const dateInput = "h-9 rounded-md border border-light px-2 text-sm focus:border-blue focus:outline-none";

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
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs text-charcoal/70">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
          </label>
          <label className="grid gap-1 text-xs text-charcoal/70">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} />
          </label>
        </div>
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
