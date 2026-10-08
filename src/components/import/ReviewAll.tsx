"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import BulkActions from "@/components/BulkActions";
import EntryEditor from "@/components/EntryEditor";
import { ProjectLabel } from "@/components/tracker/ProjectPicker";
import { hasChanges, reviewEntries, withEdit, type Edits, type EntryEdit, type Group, type Plan } from "@/lib/importPlan";
import type { Catalog } from "@/lib/useCatalog";
import { formatHoursShort, parseKey, shortDate } from "@/lib/time";

const PAGE = 200;
const GROUP_LABEL: Record<Group, string> = {
  fresh: "New",
  duplicates: "Likely duplicate",
  overlaps: "Overlap",
  long: "Over 12 hours",
  changed: "Changed",
};
const longDate = (k: string) => `${shortDate(k)}, ${parseKey(k).y}`;

/**
 * Every entry in the file that's still to be decided, with filters, ticks
 * and bulk fixes (move to a project/task, billable, skip). Corrections are
 * kept in `edits` and used when importing; nothing is saved until then.
 */
export default function ReviewAll({
  plan,
  edits,
  catalog,
  nameOf,
  billableOf,
  onEdit,
  onReset,
}: {
  plan: Plan;
  edits: Edits;
  catalog: Catalog;
  nameOf: (id: string) => string;
  billableOf: (projectId: string | null, billable: boolean | null) => boolean;
  /** `single`: one entry corrected by hand (its group then prefers the corrected version). */
  onEdit: (keys: string[], patch: EntryEdit, single?: boolean) => void;
  onReset: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("");
  const [group, setGroup] = useState<Group | "">("");
  const [project, setProject] = useState(""); // "" all, "none" no project, else id
  const [onlyTouched, setOnlyTouched] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);

  const all = useMemo(() => reviewEntries(plan), [plan]);
  const people = useMemo(
    () => [...new Set(all.map((x) => x.entry.userId))].map((id) => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name)),
    [all, nameOf]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .map((x) => ({ ...x, now: withEdit(x.entry, edits[x.entry.key]), edit: edits[x.entry.key] }))
      .filter(({ entry, now, group: g, edit }) => {
        if (person && entry.userId !== person) return false;
        if (group && g !== group) return false;
        if (project === "none" ? now.projectId : project && now.projectId !== project) return false;
        if (onlyTouched && !edit) return false;
        if (!q) return true;
        const fathom = now.projectId ? catalog.projectById.get(now.projectId)?.name ?? "" : "";
        const task = now.taskId ? catalog.taskById.get(now.taskId)?.name ?? "" : "";
        return [nameOf(entry.userId), entry.client, entry.project, entry.task, now.description, fathom, task]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => (a.entry.date === b.entry.date ? a.entry.startAt.localeCompare(b.entry.startAt) : a.entry.date.localeCompare(b.entry.date)));
  }, [all, edits, query, person, group, project, onlyTouched, catalog, nameOf]);

  const fathomProjects = useMemo(() => {
    const ids = new Set(all.map((x) => withEdit(x.entry, edits[x.entry.key]).projectId).filter((x): x is string => !!x));
    return [...ids]
      .map((id) => ({ id, name: catalog.projectById.get(id)?.name ?? "Unknown project" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [all, edits, catalog]);

  const visible = rows.slice(0, shown);
  const keys = rows.map((r) => r.entry.key);
  const allTicked = keys.length > 0 && keys.every((k) => selected.has(k));
  const total = rows.reduce((s, r) => s + (r.edit?.skip ? 0 : r.now.seconds), 0);
  const tick = (k: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });
  const sel = [...selected];
  const input = "h-8 rounded-md border border-light bg-white px-2 text-sm text-charcoal focus:border-medium focus:outline-none";

  return (
    <div className="-mx-5 -my-3">
      <div className="flex flex-wrap items-center gap-2 border-b border-light px-5 py-2.5">
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-light bg-white px-2 focus-within:border-medium">
          <Search size={14} className="text-medium" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search names, projects, notes"
            className="w-56 text-sm focus:outline-none"
          />
        </label>
        <select value={person} onChange={(e) => setPerson(e.target.value)} className={input} aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} className={`${input} max-w-56`} aria-label="Project">
          <option value="">All projects</option>
          <option value="none">No project</option>
          {fathomProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value as Group | "")} className={input} aria-label="Group">
          <option value="">All groups</option>
          {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-charcoal">
          <input type="checkbox" checked={onlyTouched} onChange={(e) => setOnlyTouched(e.target.checked)} />
          Only edited or skipped
        </label>
        <span className="tabular ml-auto text-xs text-charcoal/70">
          {rows.length.toLocaleString("en-US")} {rows.length === 1 ? "entry" : "entries"} · {formatHoursShort(total)} to import
        </span>
      </div>

      <BulkActions
        count={selected.size}
        catalog={catalog}
        onMove={(p, t) => onEdit(sel, { projectId: p, taskId: t, billable: billableOf(p, null) })}
        onBillable={(b) => onEdit(sel, { billable: b })}
        onClear={() => setSelected(new Set())}
      >
        <button
          type="button"
          onClick={() => onEdit(sel, { skip: true })}
          className="h-8 rounded-md border border-light bg-white px-3 text-sm text-danger hover:bg-lightest"
        >
          Skip these
        </button>
        <button
          type="button"
          onClick={() => onEdit(sel, { skip: false })}
          className="h-8 rounded-md border border-light bg-white px-3 text-sm text-navy hover:bg-lightest"
        >
          Include these
        </button>
      </BulkActions>

      <div className="grid grid-cols-[28px_150px_minmax(0,1fr)_minmax(0,1fr)_60px_minmax(0,170px)] items-center gap-3 border-b border-light px-5 py-2 text-[11px] uppercase tracking-wide text-charcoal/50">
        <input
          type="checkbox"
          aria-label="Select all shown by the filters"
          checked={allTicked}
          onChange={(e) => setSelected(e.target.checked ? new Set(keys) : new Set())}
        />
        <span>Person</span>
        <span>In the file</span>
        <span>Goes to (Fathom Time)</span>
        <span className="text-right">Hours</span>
        <span />
      </div>
      {!rows.length && <p className="py-6 text-center text-sm text-charcoal/60">No entries match.</p>}
      {visible.map(({ entry, now, group: g, edit }) => {
        const skipped = !!edit?.skip;
        const changed = hasChanges(edit);
        return (
          <div
            key={entry.key}
            className={`grid grid-cols-[28px_150px_minmax(0,1fr)_minmax(0,1fr)_60px_minmax(0,170px)] items-center gap-3 border-b border-light px-5 py-2 text-sm last:border-0 ${
              skipped ? "opacity-50" : ""
            } ${selected.has(entry.key) ? "bg-[#F4FBF9]" : ""}`}
          >
            <input
              type="checkbox"
              aria-label="Select"
              checked={selected.has(entry.key)}
              onChange={(e) => tick(entry.key, e.target.checked)}
            />
            <span className="min-w-0">
              <span className="block truncate font-medium text-navy">{nameOf(entry.userId)}</span>
              <span className="text-xs text-charcoal/70">{longDate(entry.date)}</span>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs text-charcoal" title={`${entry.client} · ${entry.project} · ${entry.task}`}>
                {[entry.client, entry.project, entry.task].filter(Boolean).join(" · ") || "No project"}
              </span>
              {now.description && (
                <span className="block truncate text-xs text-charcoal/60" title={now.description}>
                  {now.description}
                </span>
              )}
            </span>
            <span className="min-w-0 text-xs">
              <ProjectLabel catalog={catalog} projectId={now.projectId} taskId={now.taskId} compact />
            </span>
            <span className="tabular text-right font-semibold text-navy">
              {formatHoursShort(now.seconds)}
              {edit?.seconds !== undefined && (
                <span className="block text-[11px] font-normal text-charcoal/50 line-through">
                  {formatHoursShort(entry.seconds)}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center justify-end gap-1">
              <span className="rounded-full bg-lightest px-2 py-0.5 text-[11px] text-charcoal/80">{GROUP_LABEL[g]}</span>
              {changed && <span className="rounded-full bg-[#E6F0FE] px-2 py-0.5 text-[11px] text-blue">Edited</span>}
              <EntryEditor
                catalog={catalog}
                value={{
                  seconds: now.seconds,
                  projectId: now.projectId,
                  taskId: now.taskId,
                  description: now.description,
                  billable: billableOf(now.projectId, now.billable),
                }}
                onSave={(c) => onEdit([entry.key], c, true)}
                onReset={edit ? () => onReset(entry.key) : undefined}
              />
              <button
                type="button"
                onClick={() => onEdit([entry.key], { skip: !skipped })}
                className="rounded-md px-1.5 py-1 text-xs text-charcoal/70 hover:bg-lightest hover:text-navy"
              >
                {skipped ? "Include" : "Skip"}
              </button>
            </span>
          </div>
        );
      })}
      {rows.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full py-3 text-center text-sm font-semibold text-teal hover:underline"
        >
          Show {Math.min(PAGE, rows.length - shown)} more of {(rows.length - shown).toLocaleString("en-US")}
        </button>
      )}
    </div>
  );
}
