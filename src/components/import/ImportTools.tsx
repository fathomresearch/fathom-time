"use client";

import { useEffect, useState } from "react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import ConfirmDialog from "@/components/ConfirmDialog";
import DatePicker from "@/components/tracker/DatePicker";
import { dayKey, parseKey, shortDate, startOfDay } from "@/lib/time";
import type { Role } from "@/lib/types";

const longDate = (k: string) => `${shortDate(k)}, ${parseKey(k).y}`;

/**
 * Jibble cut-over date (Directors and Managers) and one-time clean-up tools
 * (Director): delete practice entries, remove unused demo projects.
 */
export default function ImportTools({ role, tz, onChanged }: { role: Role; tz: string; onChanged: () => void }) {
  const todayKey = dayKey(new Date(), tz);
  const [cutover, setCutover] = useState<string | null | undefined>(undefined);
  const [practiceBefore, setPracticeBefore] = useState(todayKey);
  const [practiceCount, setPracticeCount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"practice" | "demo" | null>(null);
  const isDirector = role === "director";

  useEffect(() => {
    sb()
      .rpc("get_jibble_cutover")
      .then(({ data, error }) => setCutover(error ? null : ((data as string | null) ?? null)));
  }, []);

  useEffect(() => {
    if (!isDirector) return;
    sb()
      .rpc("count_practice_entries", { p_before: startOfDay(practiceBefore, tz).toISOString() })
      .then(({ data }) => setPracticeCount((data as number | null) ?? null));
  }, [isDirector, practiceBefore, tz]);

  const saveCutover = async (k: string | null) => {
    const { error } = await sb().rpc("set_jibble_cutover", { p_date: k });
    if (error) return toast("Couldn't save the cut-over date.");
    setCutover(k);
    toast(k ? `Jibble cut-over set to ${longDate(k)}.` : "Cut-over date cleared.", "info");
  };

  return (
    <section className="mt-6 rounded-lg border border-light bg-white">
      <p className="border-b border-light px-5 py-3 font-display text-sm font-semibold text-navy">
        Settings and clean-up
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-light px-5 py-3 text-sm">
        <span>
          <span className="font-medium text-navy">Jibble cut-over date</span>
          <span className="block text-xs text-charcoal/70">
            From this day on, time lives only in Fathom Time: Jibble rows on or after it are refused.
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-charcoal">{cutover ? longDate(cutover) : cutover === null ? "Not set" : "…"}</span>
          <DatePicker
            value={cutover ?? todayKey}
            todayKey={todayKey}
            onChange={(k) => saveCutover(k)}
            showLabel={false}
          />
          {cutover && (
            <button
              type="button"
              onClick={() => saveCutover(null)}
              className="text-xs text-charcoal/60 hover:text-navy"
            >
              Clear
            </button>
          )}
        </span>
      </div>

      {isDirector && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-light px-5 py-3 text-sm">
            <span>
              <span className="font-medium text-navy">Delete practice entries</span>
              <span className="block text-xs text-charcoal/70">
                Entries typed straight into Fathom Time (not imported) that start before the date. Do this before the
                first real import, so old test entries don&apos;t look like overlaps.
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-charcoal">Before {longDate(practiceBefore)}</span>
              <DatePicker value={practiceBefore} todayKey={todayKey} onChange={setPracticeBefore} showLabel={false} />
              <button
                type="button"
                disabled={!practiceCount}
                onClick={() => setConfirm("practice")}
                className="h-8 rounded-md border border-light px-3 text-sm text-danger hover:bg-lightest disabled:opacity-50"
              >
                Delete {practiceCount ?? "…"}
              </button>
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
            <span>
              <span className="font-medium text-navy">Remove unused demo projects</span>
              <span className="block text-xs text-charcoal/70">
                The sample projects, clients and tags from setup that have no time on them.
              </span>
            </span>
            <button
              type="button"
              onClick={() => setConfirm("demo")}
              className="h-8 rounded-md border border-light px-3 text-sm text-danger hover:bg-lightest"
            >
              Remove
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "practice" ? `Delete ${practiceCount} practice entries?` : "Remove unused demo projects?"}
        body={
          confirm === "practice"
            ? `Every entry typed into Fathom Time (not imported) that starts before ${longDate(practiceBefore)}, for everyone. This can't be undone.`
            : "Demo projects, clients and tags with no time on them are deleted. Projects with time are kept."
        }
        confirmLabel={confirm === "practice" ? "Delete" : "Remove"}
        onConfirm={async () => {
          const what = confirm;
          setConfirm(null);
          const { data, error } =
            what === "practice"
              ? await sb().rpc("delete_practice_entries", { p_before: startOfDay(practiceBefore, tz).toISOString() })
              : await sb().rpc("remove_unused_demo_projects");
          if (error) return toast(error.code === "P0001" ? error.message : "That didn't work.");
          toast(what === "practice" ? `Deleted ${data} practice entries.` : `Removed ${data} demo projects.`, "info");
          if (what === "practice") setPracticeCount(0);
          onChanged();
        }}
        onCancel={() => setConfirm(null)}
      />
    </section>
  );
}
