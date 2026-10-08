"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import BulkActions from "@/components/BulkActions";
import ConfirmDialog from "@/components/ConfirmDialog";
import DateRangePicker from "@/components/DateRangePicker";
import EntryEditor, { type EntryValues } from "@/components/EntryEditor";
import { toast } from "@/components/Toaster";
import { ProjectLabel } from "@/components/tracker/ProjectPicker";
import type { Viewer } from "@/components/tracker/TimeTracker";
import { fetchAll } from "@/lib/fetchAll";
import { displayName } from "@/lib/people";
import { sb } from "@/lib/supabase/browser";
import { useCatalog } from "@/lib/useCatalog";
import { addDays, dayKey, formatHoursShort, formatTime, parseKey, shortDate, startOfDay } from "@/lib/time";

type Row = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  description: string;
  billable: boolean;
  start_at: string;
  end_at: string;
  tz: string;
  source: "clockify" | "jibble" | null;
};
type Source = "" | "clockify" | "jibble" | "native";

const PAGE = 200;
const CHUNK = 500;
const SOURCE_LABEL = { clockify: "Clockify", jibble: "Jibble", native: "Fathom Time" } as const;
const secondsOf = (r: Row) => (new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 1000;
const longDate = (k: string) => `${shortDate(k)}, ${parseKey(k).y}`;

/**
 * Directors and Managers: find entries across everyone (imported or typed
 * in), tick them, and move them to another project/task, change billable,
 * or delete them. Single entries can also be corrected here.
 */
export default function EntriesView({ viewer }: { viewer: Viewer }) {
  const tz = viewer.timezone;
  const todayKey = dayKey(new Date(), tz);
  const catalog = useCatalog(viewer.id);
  const [from, setFrom] = useState<string | null>(todayKey.slice(0, 8) + "01");
  const [to, setTo] = useState<string | null>(todayKey);
  const [person, setPerson] = useState("");
  const [source, setSource] = useState<Source>("");
  const [client, setClient] = useState(""); // "" all, "none" no client, else id
  const [project, setProject] = useState(""); // "" all, "none" no project, else id
  const [noTask, setNoTask] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Date range, person and source are filtered in the database; the rest here.
  const load = useCallback(async () => {
    setRows(null);
    const db = sb();
    const data = await fetchAll<Row>((a, b) => {
      let q = db
        .from("time_entries")
        .select("id,user_id,project_id,task_id,description,billable,start_at,end_at,tz,source")
        .not("end_at", "is", null);
      if (from) q = q.gte("start_at", startOfDay(from, tz).toISOString());
      if (to) q = q.lt("start_at", startOfDay(addDays(to, 1), tz).toISOString());
      if (person) q = q.eq("user_id", person);
      if (source === "native") q = q.is("source", null);
      else if (source) q = q.eq("source", source);
      return q.order("start_at").order("id").range(a, b);
    });
    if (!data) toast("Couldn't load entries.");
    setRows(data ?? []);
    setSelected(new Set());
    setShown(PAGE);
  }, [from, to, person, source, tz]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const people = useMemo(
    () =>
      [...catalog.people]
        .map((p) => ({ id: p.id, name: displayName(p) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.people]
  );
  const nameOf = useCallback((id: string) => displayName(catalog.personById.get(id)), [catalog.personById]);
  const projectName = (id: string) => {
    const p = catalog.projectById.get(id);
    const c = p?.client_id ? catalog.clientById.get(p.client_id) : undefined;
    return p ? `${p.name}${c ? ` · ${c.name}` : ""}${p.archived ? " (archived)" : ""}` : "Unknown project";
  };

  // Clients and projects that appear in what's loaded.
  const options = useMemo(() => {
    const projectIds = new Set((rows ?? []).map((r) => r.project_id).filter((x): x is string => !!x));
    const clientIds = new Set(
      [...projectIds].map((id) => catalog.projectById.get(id)?.client_id).filter((x): x is string => !!x)
    );
    return {
      projects: [...projectIds].sort((a, b) => projectName(a).localeCompare(projectName(b))),
      clients: [...clientIds]
        .map((id) => ({ id, name: catalog.clientById.get(id)?.name ?? "Unknown client" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, catalog.projectById, catalog.clientById]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      const p = r.project_id ? catalog.projectById.get(r.project_id) : undefined;
      if (project === "none" ? r.project_id : project && r.project_id !== project) return false;
      if (client === "none" ? p?.client_id : client && p?.client_id !== client) return false;
      if (noTask && (!r.project_id || r.task_id)) return false;
      if (!q) return true;
      const c = p?.client_id ? catalog.clientById.get(p.client_id)?.name : "";
      const t = r.task_id ? catalog.taskById.get(r.task_id)?.name : "";
      return [nameOf(r.user_id), r.description, p?.name, c, t].join(" ").toLowerCase().includes(q);
    });
  }, [rows, query, project, client, noTask, catalog, nameOf]);

  const ids = filtered.map((r) => r.id);
  const allTicked = ids.length > 0 && ids.every((id) => selected.has(id));
  const total = filtered.reduce((s, r) => s + secondsOf(r), 0);
  const sel = [...selected];

  /** Same change to many entries, 500 at a time. */
  const updateMany = async (list: string[], patch: Partial<Row>, done: string) => {
    if (!list.length) return;
    setBusy("Saving…");
    let saved = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      setBusy(`Saving ${Math.min(i + CHUNK, list.length)} of ${list.length}…`);
      const { data, error } = await sb()
        .from("time_entries")
        .update(patch)
        .in("id", list.slice(i, i + CHUNK))
        .select("id");
      if (error) {
        toast(error.code === "P0001" ? error.message : `Saved ${saved} of ${list.length}. The rest didn't save.`);
        break;
      }
      saved += data?.length ?? 0;
    }
    setBusy(null);
    if (saved === list.length) toast(done, "info");
    else if (saved) toast(`Only ${saved} of ${list.length} entries could be changed.`);
    const changed = new Set(list);
    setRows((rs) => (rs ? rs.map((r) => (changed.has(r.id) ? { ...r, ...patch } : r)) : rs));
    if (saved !== list.length) load();
  };

  const deleteMany = async (list: string[]) => {
    setBusy("Deleting…");
    let gone = 0;
    for (let i = 0; i < list.length; i += CHUNK) {
      setBusy(`Deleting ${Math.min(i + CHUNK, list.length)} of ${list.length}…`);
      const { data, error } = await sb()
        .from("time_entries")
        .delete()
        .in("id", list.slice(i, i + CHUNK))
        .select("id");
      if (error) break;
      gone += data?.length ?? 0;
    }
    setBusy(null);
    toast(
      gone === list.length ? `Deleted ${gone} ${gone === 1 ? "entry" : "entries"}.` : `Deleted ${gone} of ${list.length}.`,
      gone === list.length ? "info" : "error"
    );
    load();
  };

  const saveOne = (r: Row, c: Partial<EntryValues>) => {
    const patch: Partial<Row> = {};
    if (c.seconds !== undefined)
      patch.end_at = new Date(new Date(r.start_at).getTime() + c.seconds * 1000).toISOString();
    if (c.projectId !== undefined) {
      patch.project_id = c.projectId;
      patch.task_id = c.taskId ?? null;
    }
    if (c.description !== undefined) patch.description = c.description;
    if (c.billable !== undefined) patch.billable = c.billable;
    updateMany([r.id], patch, "Entry saved.");
  };

  const input =
    "h-8 rounded-md border border-light bg-white px-2 text-sm text-charcoal focus:border-medium focus:outline-none";
  const grid = "grid grid-cols-[28px_160px_minmax(0,1fr)_minmax(0,1.2fr)_90px_60px_minmax(0,120px)] items-center gap-3";

  return (
    <>
      <Link href="/team" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-navy hover:underline">
        <ChevronLeft size={16} /> Team Overview
      </Link>
      <PageHeader title="Edit entries">
        <DateRangePicker
          from={from}
          to={to}
          todayKey={todayKey}
          align="right"
          onChange={(a, b) => {
            setFrom(a);
            setTo(b);
          }}
        />
      </PageHeader>
      <p className="-mt-2 mb-4 text-sm text-charcoal">
        Find entries for anyone, tick them, then move them to another project or task, change billable, or delete them.
        Use the pencil to fix one entry&apos;s hours or note. Running timers aren&apos;t listed.
      </p>

      <div className="rounded-lg border border-light bg-white">
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
          <select value={client} onChange={(e) => setClient(e.target.value)} className={`${input} max-w-48`} aria-label="Client">
            <option value="">All clients</option>
            <option value="none">No client</option>
            {options.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={project} onChange={(e) => setProject(e.target.value)} className={`${input} max-w-60`} aria-label="Project">
            <option value="">All projects</option>
            <option value="none">No project</option>
            {options.projects.map((id) => (
              <option key={id} value={id}>
                {projectName(id)}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value as Source)} className={input} aria-label="Source">
            <option value="">All sources</option>
            <option value="clockify">Clockify</option>
            <option value="jibble">Jibble</option>
            <option value="native">Fathom Time</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-charcoal">
            <input type="checkbox" checked={noTask} onChange={(e) => setNoTask(e.target.checked)} />
            Project but no task
          </label>
          <span className="tabular ml-auto text-xs text-charcoal/70">
            {rows
              ? `${filtered.length.toLocaleString("en-US")} ${filtered.length === 1 ? "entry" : "entries"} · ${formatHoursShort(total)}`
              : "Loading…"}
          </span>
        </div>

        <BulkActions
          count={selected.size}
          catalog={catalog}
          onMove={(p, t) =>
            updateMany(
              sel,
              {
                project_id: p,
                task_id: t,
                billable: p ? (catalog.projectById.get(p)?.billable_default ?? false) : false,
              },
              `Moved ${sel.length} ${sel.length === 1 ? "entry" : "entries"} to ${p ? projectName(p) : "no project"}.`
            )
          }
          onBillable={(b) =>
            updateMany(sel, { billable: b }, `${sel.length} ${sel.length === 1 ? "entry" : "entries"} set to ${b ? "billable" : "not billable"}.`)
          }
          onClear={() => setSelected(new Set())}
        >
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-light bg-white px-3 text-sm text-danger hover:bg-lightest"
          >
            <Trash2 size={14} /> Delete
          </button>
          {busy && <span className="text-xs text-charcoal/70">{busy}</span>}
        </BulkActions>

        <div className={`${grid} border-b border-light px-5 py-2 text-[11px] uppercase tracking-wide text-charcoal/50`}>
          <input
            type="checkbox"
            aria-label="Select all shown by the filters"
            checked={allTicked}
            onChange={(e) => setSelected(e.target.checked ? new Set(ids) : new Set())}
          />
          <span>Person</span>
          <span>Description</span>
          <span>Project and task</span>
          <span>Source</span>
          <span className="text-right">Hours</span>
          <span />
        </div>

        {rows === null ? (
          <p className="py-10 text-center text-sm text-charcoal/60">Loading…</p>
        ) : !filtered.length ? (
          <p className="py-10 text-center text-sm text-charcoal/60">No entries match. Try a wider date range.</p>
        ) : (
          filtered.slice(0, shown).map((r) => {
            const k = dayKey(new Date(r.start_at), tz);
            return (
              <div
                key={r.id}
                className={`${grid} border-b border-light px-5 py-2 text-sm last:border-0 ${
                  selected.has(r.id) ? "bg-[#F4FBF9]" : ""
                }`}
              >
                <input
                  type="checkbox"
                  aria-label="Select"
                  checked={selected.has(r.id)}
                  onChange={(e) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(r.id);
                      else n.delete(r.id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-navy">{nameOf(r.user_id)}</span>
                  <span className="text-xs text-charcoal/70">
                    {longDate(k)} · {formatTime(new Date(r.start_at), tz)}
                  </span>
                </span>
                <span className="truncate text-xs text-charcoal" title={r.description}>
                  {r.description || <span className="text-charcoal/40">No description</span>}
                </span>
                <span className="min-w-0 text-xs">
                  <ProjectLabel catalog={catalog} projectId={r.project_id} taskId={r.task_id} compact />
                </span>
                <span className="text-xs text-charcoal/70">{SOURCE_LABEL[r.source ?? "native"]}</span>
                <span className="tabular text-right font-semibold text-navy">
                  {formatHoursShort(secondsOf(r))}
                  {r.billable && <span className="block text-[11px] font-normal text-[#00A98D]">billable</span>}
                </span>
                <span className="flex justify-end">
                  <EntryEditor
                    catalog={catalog}
                    value={{
                      seconds: secondsOf(r),
                      projectId: r.project_id,
                      taskId: r.task_id,
                      description: r.description,
                      billable: r.billable,
                    }}
                    onSave={(c) => saveOne(r, c)}
                  />
                </span>
              </div>
            );
          })
        )}
        {filtered.length > shown && (
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="w-full py-3 text-center text-sm font-semibold text-teal hover:underline"
          >
            Show {Math.min(PAGE, filtered.length - shown)} more of {(filtered.length - shown).toLocaleString("en-US")}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${sel.length} ${sel.length === 1 ? "entry" : "entries"}?`}
        body={`${formatHoursShort(
          (rows ?? []).filter((r) => selected.has(r.id)).reduce((s, r) => s + secondsOf(r), 0)
        )} of time, for everyone selected. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={() => {
          setConfirmDelete(false);
          deleteMany(sel);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
