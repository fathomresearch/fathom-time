"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import EntryEditor from "@/components/EntryEditor";
import ReviewAll from "@/components/import/ReviewAll";
import type { useImportData } from "@/components/import/useImportData";
import { fetchAll } from "@/lib/fetchAll";
import type { ParseResult, RawEntry } from "@/lib/importParse";
import {
  BIG_DIFFERENCE_SECONDS,
  applyPlan,
  buildPlan,
  compareRange,
  hasChanges,
  preferCorrected,
  resolveEntries,
  skippedKeys,
  withEdit,
  type Choice,
  type Edits,
  type EntryEdit,
  type ExistingEntry,
  type Incoming,
  type Plan,
} from "@/lib/importPlan";
import type { Catalog } from "@/lib/useCatalog";
import { displayName } from "@/lib/people";
import { dayKey, formatHoursShort, formatTime, parseKey, shortDate, startOfDay } from "@/lib/time";

type Tab = "all" | "duplicates" | "overlaps" | "long" | "changed" | "removed";
const SOURCE_LABEL = { clockify: "Clockify", jibble: "Jibble" } as const;
const CHUNK = 500;

const secondsOf = (x: { start_at: string; end_at: string }) =>
  (new Date(x.end_at).getTime() - new Date(x.start_at).getTime()) / 1000;
const longDate = (k: string) => `${shortDate(k)}, ${parseKey(k).y}`;

/**
 * Step 4: what this file would change, grouped for review, then the import
 * itself (with a progress bar). Defaults follow the agreed rules; every
 * row can be changed, and "Accept all suggestions" puts them back.
 */
export default function ReviewStep({
  parsed,
  catalog,
  data,
  viewerTz,
  onBackToMatching,
  onImported,
}: {
  parsed: ParseResult & { fileName: string };
  catalog: Catalog;
  data: ReturnType<typeof useImportData>;
  viewerTz: string;
  onBackToMatching: () => void;
  onImported: () => void;
}) {
  const src = parsed.source;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [defaults, setDefaults] = useState<Plan | null>(null);
  const [unmatched, setUnmatched] = useState<{ people: string[]; projects: string[]; tasks: string[] } | null>(null);
  const [tab, setTab] = useState<Tab>("duplicates");
  const [progress, setProgress] = useState<string | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [openOverlaps, setOpenOverlaps] = useState<Set<string>>(new Set());

  const nameOf = (id: string) => displayName(data.people.find((p) => p.id === id));
  const projectLabel = (projectId: string | null, taskId: string | null) => {
    const p = projectId ? catalog.projectById.get(projectId)?.name : null;
    const t = taskId ? catalog.taskById.get(taskId)?.name : null;
    return p ? `${p}${t ? `: ${t}` : ""}` : "No project";
  };

  // Build the plan: match rows, then compare with what's already in Fathom Time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const aliasMap = new Map(data.aliases.map((a) => [`${a.source}|${a.kind}|${a.alias}`, a.user_id]));
      const mapping = new Map(
        data.mappings.filter((m) => m.source === src).map((m) => [`${m.kind}:${m.source_key}`, m.target_id])
      );
      const live = (id: string | undefined) => {
        if (!id) return null;
        const p = data.people.find((x) => x.id === id);
        return p?.merged_into ?? id;
      };
      const person = (e: RawEntry) =>
        live(
          (e.personEmail ? aliasMap.get(`${src}|email|${e.personEmail}`) : undefined) ??
            aliasMap.get(`${src}|name|${e.personName.trim().toLowerCase()}`)
        );
      const { incoming, unmatched: um } = resolveEntries(parsed.entries, {
        person,
        project: (k) => (mapping.has(`project:${k}`) ? (mapping.get(`project:${k}`) ?? null) : undefined),
        task: (k) => (mapping.has(`task:${k}`) ? (mapping.get(`task:${k}`) ?? null) : undefined),
        taskProject: (id) => catalog.taskById.get(id)?.project_id,
      });
      if (um.people.size || um.projects.size || um.tasks.size) {
        if (!cancelled) setUnmatched({ people: [...um.people], projects: [...um.projects], tasks: [...um.tasks] });
        return;
      }
      if (!incoming.length) return;

      const db = sb();
      const range = compareRange(incoming);
      const users = [...new Set(incoming.map((e) => e.userId))];
      const [existing, cut, batches] = await Promise.all([
        fetchAll<ExistingEntry>((a, b) =>
          db
            .from("time_entries")
            .select("id,user_id,project_id,task_id,description,start_at,end_at,source,source_key")
            .in("user_id", users)
            .not("end_at", "is", null)
            .gte("start_at", startOfDay(range.from, "UTC").toISOString())
            .lt("start_at", startOfDay(range.to, "UTC").toISOString())
            .order("id")
            .range(a, b)
        ),
        db.rpc("get_jibble_cutover"),
        db.from("import_batches").select("summary").eq("source", src).is("undone_at", null),
      ]);
      if (cancelled) return;
      if (!existing || cut.error || batches.error) {
        toast("Couldn't compare with what's already in Fathom Time. Has migration 009 been run?");
        return;
      }
      const decided = new Set<string>(
        (batches.data ?? []).flatMap(
          (b) => ((b.summary as { skipped_keys?: string[] })?.skipped_keys ?? []) as string[]
        )
      );
      const built = buildPlan(src, incoming, existing, {
        cutover: (cut.data as string | null) ?? null,
        tzOf: (e: Incoming) => e.tz,
        decidedKeys: decided,
      });
      setPlan(built);
      setDefaults(structuredClone(built));
      const firstTab = (["duplicates", "overlaps", "long", "changed", "removed"] as const).find(
        (t) => (built[t] as unknown[]).length
      );
      setTab(firstTab ?? "all");
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed, src, data.aliases, data.mappings, data.people, catalog.taskById]);

  const result = useMemo(() => (plan ? applyPlan(plan, edits) : null), [plan, edits]);

  if (unmatched) {
    return (
      <div className="px-6 py-8">
        <p className="font-display text-base font-semibold text-navy">A few names aren&apos;t matched yet</p>
        <p className="mt-1 text-sm text-charcoal">Go back and match these first:</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-charcoal">
          {unmatched.people.map((x) => (
            <li key={`p${x}`}>Person: {x}</li>
          ))}
          {unmatched.projects.map((x) => (
            <li key={`r${x}`}>Project: {x}</li>
          ))}
          {unmatched.tasks.map((x) => (
            <li key={`t${x}`}>Task: {x}</li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onBackToMatching}
          className="mt-4 h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy"
        >
          Back to matching
        </button>
      </div>
    );
  }
  if (!plan || !result) return <p className="px-4 py-10 text-center text-sm text-charcoal/60">Comparing…</p>;

  const billableOf = (projectId: string | null, billable: boolean | null) =>
    billable ?? (projectId ? (catalog.projectById.get(projectId)?.billable_default ?? false) : false);

  /** Corrections, kept until the import. A hand-corrected entry is chosen in its group. */
  const edit = (keys: string[], patch: EntryEdit, single = false) => {
    setEdits((all) => {
      const next = { ...all };
      for (const k of keys) next[k] = { ...next[k], ...patch };
      return next;
    });
    if (single && !("skip" in patch)) setPlan((p) => (p ? preferCorrected(p, new Set(keys)) : p));
  };
  const resetEdit = (key: string) =>
    setEdits((all) => {
      const next = { ...all };
      delete next[key];
      return next;
    });
  const now = (e: Incoming) => withEdit(e, edits[e.key]);
  const isEdited = (e: Incoming) => hasChanges(edits[e.key]);
  const editorFor = (e: Incoming) => {
    const cur = now(e);
    return (
      <EntryEditor
        catalog={catalog}
        label={isEdited(e) ? "Edited" : "Edit"}
        value={{
          seconds: cur.seconds,
          projectId: cur.projectId,
          taskId: cur.taskId,
          description: cur.description,
          billable: billableOf(cur.projectId, cur.billable),
        }}
        onSave={(c) => edit([e.key], c, true)}
        onReset={edits[e.key] ? () => resetEdit(e.key) : undefined}
      />
    );
  };
  const fileLabel = `${SOURCE_LABEL[src]} (this file)`;
  const incomingLabel = (e: Incoming) => (isEdited(e) ? `${SOURCE_LABEL[src]}, corrected` : fileLabel);

  const set = <K extends Exclude<Tab, "all">>(key: K, id: string, patch: Partial<Plan[K][number]>) =>
    setPlan((p) =>
      p ? { ...p, [key]: (p[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) } : p
    );

  const run = async () => {
    const { add, remove } = result;
    if (!add.length && !remove.length) return toast("Nothing to change.", "info");
    const db = sb();
    try {
      setProgress("Starting…");
      const { data: batch, error } = await db
        .from("import_batches")
        .insert({
          source: src,
          file_name: parsed.fileName,
          entry_count: add.length,
          summary: {
            added: add.length,
            removed: remove.length,
            edited: add.filter((e) => hasChanges(edits[e.key])).length,
            skipped_keys: skippedKeys(plan, edits),
          },
        })
        .select("id")
        .single();
      if (error || !batch) throw new Error("Couldn't start the import.");

      if (remove.length) {
        setProgress(`Saving a copy of ${remove.length} entries to remove (for Undo)…`);
        const snapshot: unknown[] = [];
        for (let i = 0; i < remove.length; i += CHUNK) {
          const { data: rows, error: e } = await db
            .from("time_entries")
            .select("*")
            .in("id", remove.slice(i, i + CHUNK));
          if (e) throw new Error("Couldn't copy the entries to remove.");
          snapshot.push(...(rows ?? []));
        }
        const { error: e2 } = await db.from("import_batches").update({ deleted_entries: snapshot }).eq("id", batch.id);
        if (e2) throw new Error("Couldn't save the copy for Undo.");
        for (let i = 0; i < remove.length; i += CHUNK) {
          setProgress(`Removing ${Math.min(i + CHUNK, remove.length)} of ${remove.length}…`);
          const { error: e3 } = await db
            .from("time_entries")
            .delete()
            .in("id", remove.slice(i, i + CHUNK));
          if (e3) throw new Error("Couldn't remove some entries. Undo this import from the history below.");
        }
      }

      for (let i = 0; i < add.length; i += CHUNK) {
        setProgress(`Importing ${Math.min(i + CHUNK, add.length)} of ${add.length}…`);
        const rows = add.slice(i, i + CHUNK).map((e) => ({
          user_id: e.userId,
          project_id: e.projectId,
          task_id: e.taskId,
          description: e.description,
          billable: billableOf(e.projectId, e.billable),
          start_at: e.startAt,
          end_at: e.endAt,
          tz: e.tz,
          source: src,
          source_key: e.key,
          import_batch: batch.id,
        }));
        const { error: e4 } = await db.from("time_entries").insert(rows);
        if (e4) throw new Error("Couldn't import some entries. Undo this import from the history below and try again.");
      }
      setProgress(null);
      toast(`Imported ${add.length} entries${remove.length ? ` and removed ${remove.length}` : ""}.`, "info");
      onImported();
    } catch (err) {
      setProgress(null);
      toast(err instanceof Error ? err.message : "The import didn't finish.");
      onImported();
    }
  };

  const reviewCount = plan.fresh.length + plan.duplicates.length + plan.long.length + plan.changed.length +
    plan.overlaps.reduce((s, o) => s + o.incoming.length, 0);
  const editedCount = Object.values(edits).filter((x) => hasChanges(x)).length;
  const skippedCount = Object.values(edits).filter((x) => x.skip).length;
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "duplicates", label: "Likely duplicates", count: plan.duplicates.length },
    { id: "overlaps", label: "Overlaps", count: plan.overlaps.length },
    { id: "long", label: "Over 12 hours", count: plan.long.length },
    { id: "changed", label: `Changed in ${SOURCE_LABEL[src]}`, count: plan.changed.length },
    { id: "removed", label: `Removed in ${SOURCE_LABEL[src]}`, count: plan.removed.length },
  ];
  const toReview = tabs.reduce((s, t) => s + t.count, 0);
  tabs.push({ id: "all", label: "All entries", count: reviewCount });
  const existingLabel = (s: string | null) => (s ? `${SOURCE_LABEL[s as "clockify"]} (imported)` : "Fathom Time");
  const when = (e: { startAt?: string; start_at?: string; tz?: string }) =>
    formatTime(new Date((e.startAt ?? e.start_at)!), e.tz ?? viewerTz);

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 border-b border-light px-5 py-4 text-sm">
        {[
          ["New, ready to import", plan.fresh.length],
          ["Already imported", plan.alreadyImported],
          ["Reviewed before", plan.alreadyReviewed],
          ["After the cut-over date", plan.afterCutover],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-md bg-canvas px-3 py-2">
            <p className="text-xs text-charcoal/70">{label}</p>
            <p className="tabular font-display text-lg font-semibold text-navy">{n}</p>
          </div>
        ))}
      </div>

      {plan.heavyDays.length > 0 && (
        <div className="mx-5 mt-4 rounded-md border border-[#F2D27A] bg-[#FFF8E5] px-4 py-3 text-sm text-[#7A5600]">
          <p className="flex items-center gap-1.5 font-semibold">
            <TriangleAlert size={14} /> Unusually long days in this file
          </p>
          <p className="mt-0.5 text-xs">
            Probably several days logged under one date. You can fix them in {SOURCE_LABEL[src]} and import again, or
            edit them in Fathom Time afterwards.
          </p>
          <ul className="mt-1 text-xs">
            {plan.heavyDays.map((h) => (
              <li key={h.userId + h.date}>
                {nameOf(h.userId)}, {longDate(h.date)}: {formatHoursShort(h.seconds)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-3 py-1 text-sm ${
                tab === t.id ? "bg-navy font-semibold text-white" : "bg-lightest text-charcoal hover:bg-light"
              }`}
            >
              {t.label} <span className="tabular opacity-80">{t.count}</span>
            </button>
          ))}
        </div>
        {toReview > 0 && (
          <button
            type="button"
            onClick={() =>
              defaults &&
              setPlan(
                preferCorrected(
                  structuredClone(defaults),
                  new Set(Object.keys(edits).filter((k) => hasChanges(edits[k])))
                )
              )
            }
            title="Your corrections are kept"
            className="shrink-0 text-sm font-semibold text-teal hover:underline"
          >
            Accept all suggestions
          </button>
        )}
      </div>

      <div className="px-5 py-3">
        {tab === "all" && (
          <ReviewAll
            plan={plan}
            edits={edits}
            catalog={catalog}
            nameOf={nameOf}
            billableOf={billableOf}
            onEdit={edit}
            onReset={resetEdit}
          />
        )}

        {tab === "duplicates" &&
          (plan.duplicates.length ? (
            plan.duplicates.map((d) => (
              <Row key={d.id} who={nameOf(d.incoming.userId)} date={d.incoming.date}>
                <Side
                  label={incomingLabel(d.incoming)}
                  hours={now(d.incoming).seconds}
                  was={isEdited(d.incoming) ? d.incoming.seconds : undefined}
                  detail={`${projectLabel(now(d.incoming).projectId, now(d.incoming).taskId)}${d.incoming.start ? ` · ${when(d.incoming)}` : ""}`}
                  action={editorFor(d.incoming)}
                />
                <Side
                  label={existingLabel(d.existing.source)}
                  hours={secondsOf(d.existing)}
                  detail={`${projectLabel(d.existing.project_id, d.existing.task_id)} · ${when(d.existing)}`}
                />
                <Choices
                  value={d.choice}
                  options={[
                    ["existing", `Keep ${existingLabel(d.existing.source).replace(" (imported)", "")}`],
                    ["new", isEdited(d.incoming) ? "Use corrected" : `Use ${SOURCE_LABEL[src]}`],
                    ["both", "Keep both"],
                  ]}
                  onChange={(v) => set("duplicates", d.id, { choice: v as Choice })}
                />
              </Row>
            ))
          ) : (
            <Empty>No likely duplicates.</Empty>
          ))}

        {tab === "overlaps" &&
          (plan.overlaps.length ? (
            plan.overlaps.map((o) => {
              const mine = o.incoming.reduce((s, x) => s + (edits[x.key]?.skip ? 0 : now(x).seconds), 0);
              const corrected = o.incoming.some((x) => edits[x.key]);
              const expanded = openOverlaps.has(o.id);
              const theirs = o.existing.reduce((s, x) => s + secondsOf(x), 0);
              const big = Math.abs(mine - theirs) >= BIG_DIFFERENCE_SECONDS;
              const label = existingLabel(o.existing[0]?.source ?? null);
              return (
                <div key={o.id} className="border-b border-light last:border-0">
                  <Row who={nameOf(o.userId)} date={o.date} bordered={false}>
                    <Side
                      label={corrected ? `${SOURCE_LABEL[src]}, corrected` : fileLabel}
                      hours={mine}
                      detail={`${o.incoming.length} ${o.incoming.length === 1 ? "entry" : "entries"}`}
                      action={
                        <button
                          type="button"
                          onClick={() =>
                            setOpenOverlaps((s) => {
                              const n = new Set(s);
                              if (n.has(o.id)) n.delete(o.id);
                              else n.add(o.id);
                              return n;
                            })
                          }
                          className="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs text-charcoal/70 hover:bg-lightest hover:text-navy"
                        >
                          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />} See and edit entries
                        </button>
                      }
                    />
                    <Side
                      label={label}
                      hours={theirs}
                      detail={`${o.existing.length} ${o.existing.length === 1 ? "entry" : "entries"}`}
                    />
                    <div className="grid gap-1">
                      {big && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-[#8A5D00]">
                          <TriangleAlert size={12} /> Very different totals: check before choosing
                        </span>
                      )}
                      <Choices
                        value={o.choice}
                        options={[
                          ["existing", `Keep ${label.replace(" (imported)", "")}`],
                          ["new", corrected ? "Use corrected" : `Use ${SOURCE_LABEL[src]}`],
                          ["both", "Keep both"],
                        ]}
                        onChange={(v) => set("overlaps", o.id, { choice: v as Choice })}
                      />
                    </div>
                  </Row>
                  {expanded && (
                    <div className="mb-2.5 ml-[182px] grid grid-cols-2 gap-x-6 rounded-md bg-canvas px-3 py-2 text-xs">
                      <ul className="grid gap-1">
                        {o.incoming.map((x) => {
                          const cur = now(x);
                          const skipped = !!edits[x.key]?.skip;
                          return (
                            <li key={x.key} className={`flex items-center justify-between gap-2 ${skipped ? "opacity-50" : ""}`}>
                              <span className="min-w-0 truncate">
                                <span className="tabular font-semibold text-navy">{formatHoursShort(cur.seconds)}</span>{" "}
                                {x.start ? `${when(x)} · ` : ""}
                                {projectLabel(cur.projectId, cur.taskId)}
                                {cur.description ? ` · ${cur.description}` : ""}
                              </span>
                              <span className="flex shrink-0 items-center">
                                {editorFor(x)}
                                <button
                                  type="button"
                                  onClick={() => edit([x.key], { skip: !skipped })}
                                  className="rounded-md px-1.5 py-1 text-xs text-charcoal/70 hover:bg-white hover:text-navy"
                                >
                                  {skipped ? "Include" : "Skip"}
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <ul className="grid content-start gap-1">
                        {o.existing.map((x) => (
                          <li key={x.id} className="truncate py-1">
                            <span className="tabular font-semibold text-navy">{formatHoursShort(secondsOf(x))}</span>{" "}
                            {when(x)} · {projectLabel(x.project_id, x.task_id)}
                            {x.description ? ` · ${x.description}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <Empty>No overlaps.</Empty>
          ))}

        {tab === "long" &&
          (plan.long.length ? (
            plan.long.map((l) => (
              <Row key={l.id} who={nameOf(l.entry.userId)} date={l.entry.date}>
                <Side
                  label={incomingLabel(l.entry)}
                  hours={now(l.entry).seconds}
                  was={isEdited(l.entry) ? l.entry.seconds : undefined}
                  detail={projectLabel(now(l.entry).projectId, now(l.entry).taskId)}
                  action={editorFor(l.entry)}
                />
                <span />
                <Choices
                  value={l.take ? "take" : "skip"}
                  options={[
                    ["skip", "Skip"],
                    ["take", isEdited(l.entry) ? "Import corrected" : "Import anyway"],
                  ]}
                  onChange={(v) => set("long", l.id, { take: v === "take" })}
                />
              </Row>
            ))
          ) : (
            <Empty>No entries over 12 hours.</Empty>
          ))}

        {tab === "changed" &&
          (plan.changed.length ? (
            plan.changed.map((c) => (
              <Row key={c.id} who={nameOf(c.incoming.userId)} date={c.incoming.date}>
                <Side label="Before" hours={secondsOf(c.old)} detail={projectLabel(c.old.project_id, c.old.task_id)} />
                <Side
                  label={isEdited(c.incoming) ? `Now in ${SOURCE_LABEL[src]}, corrected` : `Now in ${SOURCE_LABEL[src]}`}
                  hours={now(c.incoming).seconds}
                  was={isEdited(c.incoming) ? c.incoming.seconds : undefined}
                  detail={projectLabel(now(c.incoming).projectId, now(c.incoming).taskId)}
                  action={editorFor(c.incoming)}
                />
                <Choices
                  value={c.apply ? "apply" : "keep"}
                  options={[
                    ["apply", "Update"],
                    ["keep", "Keep the old one"],
                  ]}
                  onChange={(v) => set("changed", c.id, { apply: v === "apply" })}
                />
              </Row>
            ))
          ) : (
            <Empty>Nothing changed since the last import.</Empty>
          ))}

        {tab === "removed" &&
          (plan.removed.length ? (
            plan.removed.map((r) => (
              <Row key={r.id} who={nameOf(r.entry.user_id)} date={dayKey(new Date(r.entry.start_at), viewerTz)}>
                <Side
                  label="Imported before"
                  hours={secondsOf(r.entry)}
                  detail={projectLabel(r.entry.project_id, r.entry.task_id)}
                />
                <span className="text-xs text-charcoal/70">No longer in the {SOURCE_LABEL[src]} export</span>
                <Choices
                  value={r.remove ? "remove" : "keep"}
                  options={[
                    ["remove", "Delete"],
                    ["keep", "Keep"],
                  ]}
                  onChange={(v) => set("removed", r.id, { remove: v === "remove" })}
                />
              </Row>
            ))
          ) : (
            <Empty>Nothing removed since the last import.</Empty>
          ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-light px-5 py-3">
        <p className="text-sm text-charcoal">
          This will <strong>add {result.add.length}</strong> {result.add.length === 1 ? "entry" : "entries"}
          {result.remove.length > 0 && (
            <>
              {" "}
              and <strong>delete {result.remove.length}</strong>
            </>
          )}
          {editedCount > 0 && <> ({editedCount} corrected by you)</>}
          {skippedCount > 0 && <>, skipping {skippedCount} you chose to skip</>}
          . You can undo it from the import history.
        </p>
        <button
          type="button"
          disabled={!!progress || (!result.add.length && !result.remove.length)}
          onClick={run}
          className="h-9 shrink-0 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy disabled:opacity-60"
        >
          {progress ?? "Import"}
        </button>
      </div>
    </div>
  );
}

function Row({
  who,
  date,
  children,
  bordered = true,
}: {
  who: string;
  date: string;
  children: React.ReactNode;
  bordered?: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,280px)] items-center gap-3 py-2.5 text-sm ${
        bordered ? "border-b border-light last:border-0" : ""
      }`}
    >
      <span>
        <span className="block truncate font-medium text-navy">{who}</span>
        <span className="text-xs text-charcoal/70">{longDate(date)}</span>
      </span>
      {children}
    </div>
  );
}

function Side({
  label,
  hours,
  detail,
  was,
  action,
}: {
  label: string;
  hours: number;
  detail: string;
  /** Hours in the file before a correction. */
  was?: number;
  action?: React.ReactNode;
}) {
  return (
    <span className="min-w-0">
      <span className="block text-[11px] uppercase tracking-wide text-charcoal/50">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="tabular font-semibold text-navy">{formatHoursShort(hours)}</span>
        {was !== undefined && was !== hours && (
          <span className="tabular text-xs text-charcoal/50 line-through">{formatHoursShort(was)}</span>
        )}
        {action}
      </span>
      <span className="block truncate text-xs text-charcoal/70" title={detail}>
        {detail}
      </span>
    </span>
  );
}

function Choices({
  value,
  options,
  onChange,
}: {
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <span className="inline-flex flex-wrap gap-1 justify-self-end" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            value === v
              ? "border-navy bg-navy font-semibold text-white"
              : "border-light bg-white text-charcoal hover:bg-lightest"
          }`}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-charcoal/60">{children}</p>;
}
