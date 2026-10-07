"use client";

import { useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import ConfirmDialog from "@/components/ConfirmDialog";
import { displayName } from "@/lib/people";
import { formatDateTime } from "@/lib/time";
import type { ImportPerson } from "@/components/import/useImportData";

type Batch = {
  id: string;
  source: "clockify" | "jibble";
  file_name: string;
  entry_count: number;
  created_by: string | null;
  created_at: string;
  undone_at: string | null;
  summary: { added?: number; removed?: number };
};

/** Past imports, newest first, each with Undo (removes what it added, restores what it removed). */
export default function ImportHistory({
  people,
  tz,
  refreshKey,
  onChanged,
}: {
  people: ImportPerson[];
  tz: string;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [undoing, setUndoing] = useState<Batch | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await sb()
      .from("import_batches")
      .select("id,source,file_name,entry_count,created_by,created_at,undone_at,summary")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) setBatches((data as Batch[]) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, refreshKey]);

  if (!batches.length) return null;

  return (
    <section className="mt-6 rounded-lg border border-light bg-white">
      <p className="border-b border-light px-5 py-3 font-display text-sm font-semibold text-navy">Import history</p>
      <ul>
        {batches.map((b) => (
          <li
            key={b.id}
            className="flex items-center justify-between gap-3 border-b border-light px-5 py-2.5 text-sm last:border-0"
          >
            <span className="min-w-0">
              <span
                className={`block truncate font-medium ${b.undone_at ? "text-charcoal/50 line-through" : "text-navy"}`}
              >
                {b.source === "clockify" ? "Clockify" : "Jibble"} · {b.file_name}
              </span>
              <span className="text-xs text-charcoal/70">
                {formatDateTime(new Date(b.created_at), tz)}
                {b.created_by ? ` · ${displayName(people.find((p) => p.id === b.created_by))}` : ""} · added{" "}
                {b.summary?.added ?? b.entry_count}
                {b.summary?.removed ? `, removed ${b.summary.removed}` : ""}
                {b.undone_at ? ` · undone ${formatDateTime(new Date(b.undone_at), tz)}` : ""}
              </span>
            </span>
            {!b.undone_at && (
              <button
                type="button"
                onClick={() => setUndoing(b)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-charcoal/70 hover:bg-lightest hover:text-navy"
              >
                <Undo2 size={14} /> Undo
              </button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!undoing}
        title="Undo this import?"
        body={
          undoing
            ? `The ${undoing.summary?.added ?? undoing.entry_count} entries it added are deleted${
                undoing.summary?.removed ? `, and the ${undoing.summary.removed} it removed come back` : ""
              }. Entries edited since the import are deleted too.`
            : ""
        }
        confirmLabel="Undo import"
        onConfirm={async () => {
          const b = undoing;
          setUndoing(null);
          if (!b) return;
          const { error } = await sb().rpc("undo_import", { p_batch: b.id });
          toast(
            error ? (error.code === "P0001" ? error.message : "Couldn't undo that import.") : "Import undone.",
            error ? "error" : "info"
          );
          load();
          onChanged();
        }}
        onCancel={() => setUndoing(null)}
      />
    </section>
  );
}
