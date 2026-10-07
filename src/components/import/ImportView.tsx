"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, FileUp, TriangleAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { toast } from "@/components/Toaster";
import PeopleStep from "@/components/import/PeopleStep";
import NamesStep from "@/components/import/NamesStep";
import ReviewStep from "@/components/import/ReviewStep";
import ImportHistory from "@/components/import/ImportHistory";
import ImportTools from "@/components/import/ImportTools";
import { useImportData } from "@/components/import/useImportData";
import type { Viewer } from "@/components/tracker/TimeTracker";
import { readTimeExport, type ParseResult } from "@/lib/importParse";
import { useCatalog } from "@/lib/useCatalog";
import { formatHoursShort, shortDate, parseKey } from "@/lib/time";

type Step = "people" | "names" | "review" | "done";
const STEPS: { id: Step | "file" | "review"; label: string }[] = [
  { id: "file", label: "File" },
  { id: "people", label: "People" },
  { id: "names", label: "Projects & tasks" },
  { id: "review", label: "Review & import" },
];

const longDate = (k: string) => `${shortDate(k)}, ${parseKey(k).y}`;

/**
 * Import Clockify or Jibble history. Stage 3a: read the file, match people
 * and project names (saved for next time). Stage 3b adds review and import.
 */
export default function ImportView({ viewer }: { viewer: Viewer }) {
  const catalog = useCatalog(viewer.id);
  const data = useImportData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ParseResult & { fileName: string }) | null>(null);
  const [step, setStep] = useState<Step>("people");
  const [reading, setReading] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const onFile = async (file: File) => {
    setReading(true);
    try {
      const res = await readTimeExport(file);
      if (!res) return toast("That isn't a Clockify detailed report or a Jibble raw time entries export.");
      if (!res.entries.length) return toast("No time entries in that file.");
      setParsed({ ...res, fileName: file.name });
      setStep("people");
      setShowProblems(false);
    } catch {
      toast("That file couldn't be read. Use the CSV (or Excel) export.");
    } finally {
      setReading(false);
    }
  };

  const ready = catalog.loaded && data.loaded;
  const current = parsed ? step : "file";
  const stepIndex = current === "done" ? STEPS.length : STEPS.findIndex((s) => s.id === current);

  const summary =
    parsed &&
    (() => {
      const dates = parsed.entries.map((e) => e.date).sort();
      const people = new Set(parsed.entries.map((e) => e.personKey)).size;
      const hours = parsed.entries.reduce((s, e) => s + e.seconds, 0);
      const noTime = parsed.entries.filter((e) => !e.start).length;
      return { from: dates[0], to: dates[dates.length - 1], people, hours, noTime };
    })();

  return (
    <>
      <Link
        href="/team"
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline"
      >
        <ChevronLeft size={16} /> Team Overview
      </Link>
      <PageHeader title="Import time">
        <button
          type="button"
          disabled={reading || !ready}
          onClick={() => fileRef.current?.click()}
          className="flex h-9 items-center gap-1.5 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy hover:brightness-95 disabled:opacity-60"
        >
          <FileUp size={15} /> {reading ? "Reading…" : parsed ? "Choose another file" : "Choose a file"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
      </PageHeader>

      <ol className="mb-5 flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full font-display text-xs font-semibold ${
                i < stepIndex
                  ? "bg-teal text-navy"
                  : i === stepIndex
                    ? "bg-navy text-white"
                    : "bg-lightest text-charcoal/60"
              }`}
            >
              {i < stepIndex ? <Check size={13} /> : i + 1}
            </span>
            <span className={i === stepIndex ? "font-semibold text-navy" : "text-charcoal/70"}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-light" />}
          </li>
        ))}
      </ol>

      {!parsed ? (
        <div className="rounded-lg border border-light bg-white px-6 py-10 text-center">
          <p className="font-display text-base font-semibold text-navy">Choose a Clockify or Jibble export</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-charcoal">
            Clockify: Reports → Detailed → Export → CSV. Jibble: the Raw Time Entries export. Clockify times are read as
            Central time (Chicago); Jibble uses each row&apos;s own time zone. Nothing is imported until the last step.
            Before the first real import, delete the practice entries (Settings and clean-up, below).
          </p>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-lg border border-light bg-white px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-base font-semibold text-navy">
                {parsed.source === "clockify" ? "Clockify" : "Jibble"} · {parsed.fileName}
              </p>
              {summary && (
                <p className="text-sm text-charcoal">
                  {parsed.entries.length.toLocaleString("en-US")} entries · {formatHoursShort(summary.hours)} ·{" "}
                  {summary.people} {summary.people === 1 ? "person" : "people"} · {longDate(summary.from)} to{" "}
                  {longDate(summary.to)}
                </p>
              )}
            </div>
            {summary && summary.noTime > 0 && (
              <p className="mt-1 text-xs text-charcoal/70">
                {summary.noTime} entries have hours but no start time (Jibble &ldquo;Hours&rdquo;). They&apos;ll start
                at 9:00 AM, one after another, when imported.
              </p>
            )}
            {parsed.problems.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowProblems((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#8A5D00]"
                >
                  <TriangleAlert size={13} /> {parsed.problems.length} {parsed.problems.length === 1 ? "row" : "rows"}{" "}
                  couldn&apos;t be read {showProblems ? "(hide)" : "(show)"}
                </button>
                {showProblems && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-charcoal/80">
                    {parsed.problems.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-light bg-white">
            {!ready ? (
              <p className="px-4 py-10 text-center text-sm text-charcoal/60">Loading…</p>
            ) : step === "people" ? (
              <PeopleStep
                key={parsed.fileName + parsed.entries.length}
                parsed={parsed}
                data={data}
                onDone={() => setStep("names")}
              />
            ) : step === "names" ? (
              <NamesStep
                key={parsed.fileName + parsed.entries.length}
                parsed={parsed}
                catalog={catalog}
                data={data}
                onDone={() => setStep("review")}
              />
            ) : step === "review" ? (
              <ReviewStep
                key={parsed.fileName + parsed.entries.length}
                parsed={parsed}
                catalog={catalog}
                data={data}
                viewerTz={viewer.timezone}
                onBackToMatching={() => setStep("people")}
                onImported={() => {
                  setStep("done");
                  setHistoryKey((k) => k + 1);
                }}
              />
            ) : (
              <div className="px-6 py-10 text-center">
                <Check size={24} className="mx-auto text-teal" />
                <p className="mt-2 font-display text-base font-semibold text-navy">Import finished</p>
                <p className="mx-auto mt-1 max-w-lg text-sm text-charcoal">
                  The entries are in Fathom Time. It&apos;s listed in the import history below, where you can undo it.
                  Import another file (for example the next Jibble month) whenever you like.
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("review")}
                    className="h-9 rounded-md border border-light bg-white px-3 text-sm font-medium text-navy hover:bg-lightest"
                  >
                    Check this file again
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy"
                  >
                    Import another file
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {ready && (
        <>
          <ImportTools role={viewer.role} tz={viewer.timezone} onChanged={() => setHistoryKey((k) => k + 1)} />
          <ImportHistory
            people={data.people}
            tz={viewer.timezone}
            refreshKey={historyKey}
            onChanged={() => setHistoryKey((k) => k + 1)}
          />
        </>
      )}
    </>
  );
}
