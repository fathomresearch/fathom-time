"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/Toaster";
import { mapKey, suggestName, type Suggestion } from "@/lib/importMatch";
import type { ParseResult } from "@/lib/importParse";
import type { Catalog } from "@/lib/useCatalog";
import type { Mapping, useImportData } from "@/components/import/useImportData";
import { PROJECT_COLORS } from "@/lib/data";
import { formatHoursShort } from "@/lib/time";

const NEW = "__new";
const NONE = "__none";

type Group = { key: string; name: string; entries: number; seconds: number; lastDate: string };
type ProjectGroup = Group & { client: string; tasks: (Group & { project: string; client: string })[] };
type ClientGroup = Group & { projects: ProjectGroup[] };

/**
 * Step 3: which client, project and task each name in the file is. Rows
 * start on a remembered match, the same name, a similar name to check, or
 * "Create new". New projects are created active unless "Create as archived"
 * is ticked. Choices are remembered, so each name is confirmed only once.
 */
export default function NamesStep({
  parsed,
  catalog,
  data,
  onDone,
}: {
  parsed: ParseResult;
  catalog: Catalog;
  data: ReturnType<typeof useImportData>;
  onDone: () => void;
}) {
  const src = parsed.source;

  const groups = useMemo(() => {
    const clients = new Map<string, ClientGroup>();
    const bump = (g: Group, sec: number, date: string) => {
      g.entries += 1;
      g.seconds += sec;
      if (date > g.lastDate) g.lastDate = date;
    };
    for (const e of parsed.entries) {
      const ck = mapKey.client(e.client);
      const c = clients.get(ck) ?? { key: ck, name: e.client, entries: 0, seconds: 0, lastDate: "", projects: [] };
      bump(c, e.seconds, e.date);
      clients.set(ck, c);
      const pk = mapKey.project(e.client, e.project);
      let p = c.projects.find((x) => x.key === pk);
      if (!p) {
        p = { key: pk, name: e.project, client: e.client, entries: 0, seconds: 0, lastDate: "", tasks: [] };
        c.projects.push(p);
      }
      bump(p, e.seconds, e.date);
      const tk = mapKey.task(e.client, e.project, e.task);
      let t = p.tasks.find((x) => x.key === tk);
      if (!t) {
        t = { key: tk, name: e.task, project: e.project, client: e.client, entries: 0, seconds: 0, lastDate: "" };
        p.tasks.push(t);
      }
      bump(t, e.seconds, e.date);
    }
    const byName = (a: Group, b: Group) => (!a.name ? 1 : !b.name ? -1 : a.name.localeCompare(b.name));
    const list = [...clients.values()].sort(byName);
    for (const c of list) {
      c.projects.sort(byName);
      for (const p of c.projects) p.tasks.sort(byName);
    }
    return list;
  }, [parsed]);

  const remembered = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const x of data.mappings) if (x.source === src) m.set(`${x.kind}:${x.source_key}`, x.target_id);
    return m;
  }, [data.mappings, src]);

  // Starting choices and why (for the colored labels).
  const initial = useMemo(() => {
    const choice = new Map<string, string>();
    const why = new Map<string, Suggestion | "remembered">();
    const exists = (kind: "client" | "project" | "task", id: string) =>
      kind === "client"
        ? catalog.clientById.has(id)
        : kind === "project"
          ? catalog.projectById.has(id)
          : catalog.taskById.has(id);
    const pick = (
      kind: "client" | "project" | "task",
      key: string,
      name: string,
      options: { id: string; name: string }[]
    ) => {
      const k = `${kind}:${key}`;
      if (remembered.has(k)) {
        const id = remembered.get(k);
        if (id === null) return choice.set(k, NONE);
        if (id && exists(kind, id)) {
          why.set(k, "remembered");
          return choice.set(k, id);
        }
      }
      if (!name.trim()) return choice.set(k, NONE);
      const s = suggestName(name, options);
      if (s) {
        why.set(k, s);
        return choice.set(k, s.id);
      }
      choice.set(k, NEW);
    };
    for (const c of groups) {
      pick("client", c.key, c.name, catalog.clients);
      const clientId = choice.get(`client:${c.key}`);
      for (const p of c.projects) {
        const sameClient = catalog.projects.filter((x) =>
          clientId && clientId !== NEW && clientId !== NONE ? x.client_id === clientId : true
        );
        pick("project", p.key, p.name, sameClient.length ? sameClient : catalog.projects);
        const projectId = choice.get(`project:${p.key}`);
        for (const t of p.tasks) {
          const k = `task:${t.key}`;
          if (projectId === NONE) {
            choice.set(k, NONE); // a task needs a project
            continue;
          }
          const tasks = projectId && projectId !== NEW ? catalog.tasks.filter((x) => x.project_id === projectId) : [];
          pick("task", t.key, t.name, tasks);
          if (choice.get(k) !== NONE && (!projectId || projectId === NEW) && choice.get(k) !== NEW) choice.set(k, NEW);
        }
      }
    }
    return { choice, why };
  }, [
    groups,
    remembered,
    catalog.clients,
    catalog.projects,
    catalog.tasks,
    catalog.clientById,
    catalog.projectById,
    catalog.taskById,
  ]);

  const [choice, setChoice] = useState(initial.choice);
  // New projects are active unless "Create as archived" is ticked.
  const [archived, setArchived] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setChoice((m) => new Map(m).set(k, v));

  const save = async () => {
    setSaving(true);
    try {
      const rows: Mapping[] = [];
      const clientIds = new Map<string, string | null>();
      for (const c of groups) {
        const v = choice.get(`client:${c.key}`) ?? NONE;
        let id: string | null = v === NONE ? null : v;
        if (v === NEW) {
          const created = await catalog.createClient(c.name);
          if (!created) return;
          id = created.id;
        }
        clientIds.set(c.key, id);
        rows.push({ source: src, kind: "client", source_key: c.key, target_id: id });
      }
      let colorIndex = catalog.projects.length;
      for (const c of groups) {
        for (const p of c.projects) {
          const v = choice.get(`project:${p.key}`) ?? NONE;
          let projectId: string | null = v === NONE ? null : v;
          if (v === NEW) {
            const clientId = clientIds.get(c.key) ?? null;
            const created = await catalog.createProject({
              name: p.name,
              type: clientId ? "client" : "internal",
              clientId,
              newClientName: null,
              addStages: false,
              color: PROJECT_COLORS[colorIndex++ % PROJECT_COLORS.length],
            });
            if (!created) return;
            projectId = created.id;
            if (archived.get(p.key)) await catalog.updateProject(created.id, { archived: true });
          }
          rows.push({ source: src, kind: "project", source_key: p.key, target_id: projectId });
          for (const t of p.tasks) {
            let tv = choice.get(`task:${t.key}`) ?? NONE;
            // A task chosen under a different project (the project was changed): create it here by name.
            if (tv !== NEW && tv !== NONE && catalog.taskById.get(tv)?.project_id !== projectId) tv = NEW;
            let taskId: string | null = tv === NONE || !projectId ? null : tv;
            if (tv === NEW && projectId) {
              const created = await catalog.createTask(projectId, t.name);
              if (!created) return;
              taskId = created.id;
            }
            rows.push({ source: src, kind: "task", source_key: t.key, target_id: taskId });
          }
        }
      }
      if (!(await data.saveMappings(rows))) return;
      await Promise.all([data.reload(), catalog.reload()]);
      toast("Projects and tasks matched.", "info");
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const label = (k: string) => {
    const v = choice.get(k);
    const w = initial.why.get(k);
    if (v === NEW) return <span className="text-xs text-charcoal/60">Will be created</span>;
    if (v === NONE) return null;
    if (w === "remembered" && initial.choice.get(k) === v)
      return <span className="rounded-full bg-[#E3F7EE] px-2 py-0.5 text-xs text-[#1B7F52]">Matched before</span>;
    if (w && w !== "remembered" && w.id === v)
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            w.confident ? "bg-[#E3F7EE] text-[#1B7F52]" : "bg-[#FFF4DB] text-[#8A5D00]"
          }`}
        >
          {w.confident ? w.reason : `${w.reason}: check`}
        </span>
      );
    return <span className="text-xs text-charcoal/60">Chosen by you</span>;
  };

  const select =
    "h-8 w-full rounded-md border border-light bg-white px-2 text-sm text-charcoal focus:border-medium focus:outline-none";
  const stats = (g: Group) => (
    <span className="tabular whitespace-nowrap text-xs text-charcoal/60">
      {formatHoursShort(g.seconds)} · {g.entries}
    </span>
  );

  return (
    <div>
      <p className="border-b border-light px-5 py-3 text-sm text-charcoal">
        Which client, project and task is each name in the file? Green matches are certain; check the yellow ones.
        &ldquo;Create new&rdquo; adds it to Fathom Time (tick &ldquo;Create as archived&rdquo; for old projects you
        don&apos;t want in the pickers). Your choices are remembered, so each name only needs confirming once.
      </p>
      <div className="divide-y divide-light">
        {groups.map((c) => {
          const ck = `client:${c.key}`;
          return (
            <section key={c.key} className="px-5 py-3">
              <Row
                label={<span className="font-display font-semibold text-navy">{c.name || "No client"}</span>}
                kind="Client"
                stats={stats(c)}
                control={
                  c.name ? (
                    <select value={choice.get(ck)} onChange={(e) => set(ck, e.target.value)} className={select}>
                      <option value={NEW}>Create new client</option>
                      <option value={NONE}>No client</option>
                      {catalog.clients.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                          {x.archived ? " (archived)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-sm text-charcoal/60">No client</span>
                  )
                }
                note={c.name ? label(ck) : null}
              />
              <div className="mt-1 grid gap-1 pl-5">
                {c.projects.map((p) => {
                  const pk = `project:${p.key}`;
                  const pv = choice.get(pk);
                  return (
                    <div key={p.key}>
                      <Row
                        label={<span className="font-medium text-navy">{p.name || "No project"}</span>}
                        kind="Project"
                        stats={stats(p)}
                        control={
                          p.name ? (
                            <select value={pv} onChange={(e) => set(pk, e.target.value)} className={select}>
                              <option value={NEW}>Create new project</option>
                              {catalog.projects.map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                  {x.client_id ? ` · ${catalog.clientById.get(x.client_id)?.name ?? ""}` : ""}
                                  {x.archived ? " (archived)" : ""}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-sm text-charcoal/60">No project</span>
                          )
                        }
                        note={
                          pv === NEW ? (
                            <label className="flex items-center gap-1.5 text-xs text-charcoal/80">
                              <input
                                type="checkbox"
                                checked={archived.get(p.key) ?? false}
                                onChange={(e) => setArchived((m) => new Map(m).set(p.key, e.target.checked))}
                                className="h-3.5 w-3.5 accent-[#00D6B3]"
                              />
                              Create as archived
                            </label>
                          ) : p.name ? (
                            label(pk)
                          ) : null
                        }
                      />
                      <div className="mt-1 grid gap-1 pl-5">
                        {p.tasks.map((t) => {
                          const tk = `task:${t.key}`;
                          const tv = choice.get(tk);
                          const projectTasks =
                            pv && pv !== NEW && pv !== NONE ? catalog.tasks.filter((x) => x.project_id === pv) : [];
                          return (
                            <Row
                              key={t.key}
                              label={<span className="text-charcoal">{t.name || "No task"}</span>}
                              kind="Task"
                              stats={stats(t)}
                              control={
                                t.name && p.name ? (
                                  <select value={tv} onChange={(e) => set(tk, e.target.value)} className={select}>
                                    <option value={NEW}>Create new task</option>
                                    <option value={NONE}>No task</option>
                                    {projectTasks.map((x) => (
                                      <option key={x.id} value={x.id}>
                                        {x.name}
                                        {x.archived ? " (archived)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-sm text-charcoal/60">No task</span>
                                )
                              }
                              note={t.name && p.name ? label(tk) : null}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <div className="flex justify-end border-t border-light px-5 py-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save matches"}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  kind,
  stats,
  control,
  note,
}: {
  label: React.ReactNode;
  kind: string;
  stats: React.ReactNode;
  control: React.ReactNode;
  note: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_90px_300px_170px] items-center gap-3 py-0.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className="w-12 shrink-0 text-[11px] uppercase tracking-wide text-charcoal/50">{kind}</span>
        <span className="truncate">{label}</span>
      </span>
      <span className="text-right">{stats}</span>
      <span>{control}</span>
      <span>{note}</span>
    </div>
  );
}
