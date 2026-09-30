"use client";

import { useMemo, useState } from "react";
import { ChevronDown, CirclePlus, Plus, Search, Star } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import type { Catalog } from "@/lib/useCatalog";
import type { Project } from "@/lib/data";

type Props = {
  catalog: Catalog;
  projectId: string | null;
  taskId: string | null;
  onChange: (projectId: string | null, taskId: string | null, project: Project | null) => void;
  variant?: "bar" | "row";
};

export function ProjectLabel({
  catalog,
  projectId,
  taskId,
  compact = false,
}: {
  catalog: Catalog;
  projectId: string | null;
  taskId: string | null;
  compact?: boolean;
}) {
  const project = projectId ? catalog.projectById.get(projectId) : undefined;
  if (!project) {
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap font-medium text-blue">
        <CirclePlus size={16} /> Project
      </span>
    );
  }
  const task = taskId ? catalog.taskById.get(taskId) : undefined;
  const client = project.client_id ? catalog.clientById.get(project.client_id) : undefined;
  const full = `${project.name}${task ? ": " + task.name : ""}${client ? " · " + client.name : ""}`;
  return (
    <span title={full} className={`flex min-w-0 items-center gap-1.5 ${compact ? "max-w-[270px]" : "max-w-[340px]"}`}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: project.color }} />
      <span className="truncate text-left">
        <span className="font-medium text-navy">{project.name}</span>
        {task && <span className="text-charcoal">: {task.name}</span>}
        {client && <span className="text-charcoal/60"> · {client.name}</span>}
      </span>
    </span>
  );
}

export default function ProjectPicker({ catalog, projectId, taskId, onChange, variant = "bar" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingTaskFor, setCreatingTaskFor] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [mode, setMode] = useState<"list" | "create">("list");

  const setOpenAndReset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setQuery("");
      setMode("list");
      setCreatingTaskFor(null);
    }
  };

  const choose = (p: Project | null, tId: string | null) => {
    onChange(p?.id ?? null, tId, p);
    setOpenAndReset(false);
  };

  const q = query.trim().toLowerCase();

  // What to show, given the search.
  const view = useMemo(() => {
    const active = catalog.projects.filter((p) => !p.archived);
    const rows: { project: Project; matchingTasks: string[] | null }[] = [];
    for (const p of active) {
      const client = p.client_id ? catalog.clientById.get(p.client_id) : undefined;
      const tasks = catalog.tasksByProject.get(p.id) ?? [];
      if (!q) {
        rows.push({ project: p, matchingTasks: null });
        continue;
      }
      const projectHit =
        p.name.toLowerCase().includes(q) || (client?.name.toLowerCase().includes(q) ?? false);
      const taskHits = tasks.filter((t) => t.name.toLowerCase().includes(q)).map((t) => t.id);
      if (projectHit || taskHits.length) rows.push({ project: p, matchingTasks: taskHits });
    }
    const favorites = rows.filter((r) => catalog.favorites.has(r.project.id));
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.project.client_id ?? "";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const ordered = [...groups.entries()]
      .map(([clientId, list]) => ({
        clientId,
        name: clientId ? catalog.clientById.get(clientId)?.name ?? "Unknown client" : "No client",
        list,
      }))
      .sort((a, b) => {
        if (!a.clientId) return 1;
        if (!b.clientId) return -1;
        return a.name.localeCompare(b.name);
      });
    return { favorites, groups: ordered, empty: rows.length === 0 };
  }, [catalog, q]);

  const toggleExpand = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitTask = async (project: Project) => {
    const task = await catalog.createTask(project.id, taskName);
    setTaskName("");
    setCreatingTaskFor(null);
    if (task) choose(project, task.id);
  };

  const renderProject = (row: { project: Project; matchingTasks: string[] | null }, keyPrefix: string) => {
    const p = row.project;
    const allTasks = catalog.tasksByProject.get(p.id) ?? [];
    const isOpen = expanded.has(p.id) || (row.matchingTasks !== null && row.matchingTasks.length > 0);
    const shownTasks = expanded.has(p.id) || !row.matchingTasks
      ? allTasks
      : allTasks.filter((t) => row.matchingTasks!.includes(t.id));
    const fav = catalog.favorites.has(p.id);

    return (
      <div key={keyPrefix + p.id}>
        <div
          className={`group flex items-center gap-1 rounded-md pr-1 hover:bg-lightest ${
            p.id === projectId && !taskId ? "bg-lightest" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => choose(p, null)}
            className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left text-sm"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="truncate text-navy">{p.name}</span>
            {p.type === "internal" && (
              <span className="shrink-0 rounded bg-lightest px-1.5 py-px text-[10px] font-semibold tracking-wide text-charcoal/70 group-hover:bg-white">
                INTERNAL
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => toggleExpand(p.id)}
            className="flex shrink-0 items-center gap-0.5 rounded px-1.5 py-1 text-xs text-charcoal/70 hover:text-navy"
            aria-expanded={isOpen}
          >
            {allTasks.length} {allTasks.length === 1 ? "task" : "tasks"}
            <ChevronDown size={13} className={isOpen ? "rotate-180" : ""} />
          </button>
          <button
            type="button"
            onClick={() => catalog.toggleFavorite(p.id)}
            aria-label={fav ? `Remove ${p.name} from favorites` : `Add ${p.name} to favorites`}
            className={`shrink-0 rounded p-1 ${fav ? "text-[#E0A526]" : "text-medium opacity-0 group-hover:opacity-100 focus:opacity-100"}`}
          >
            <Star size={14} fill={fav ? "currentColor" : "none"} />
          </button>
        </div>

        {isOpen && (
          <div className="mb-1 ml-7 border-l border-light pl-2">
            {shownTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => choose(p, t.id)}
                className={`block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-charcoal hover:bg-lightest ${
                  t.id === taskId ? "bg-lightest font-medium text-navy" : ""
                }`}
              >
                {t.name}
              </button>
            ))}
            {creatingTaskFor === p.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitTask(p);
                }}
                className="flex items-center gap-1.5 px-1 py-1"
              >
                <input
                  autoFocus
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="Task name"
                  className="h-8 min-w-0 flex-1 rounded border border-light px-2 text-sm focus:border-blue focus:outline-none"
                />
                <button type="submit" className="h-8 rounded bg-teal px-3 font-display text-xs font-semibold text-navy">
                  Add
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCreatingTaskFor(p.id);
                  setTaskName("");
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-blue hover:underline"
              >
                <Plus size={14} /> Create task
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpenAndReset}
      label="Choose project"
      width={440}
      align="left"
      wrapperClassName={variant === "row" ? "min-w-0 shrink" : "min-w-0 shrink"}
      triggerClassName={`flex w-full min-w-0 items-center rounded-md px-2 py-1.5 text-sm hover:bg-lightest ${
        variant === "row" ? "max-w-[290px]" : ""
      }`}
      trigger={<ProjectLabel catalog={catalog} projectId={projectId} taskId={taskId} compact={variant === "row"} />}
    >
      {mode === "create" ? (
        <CreateProjectForm
          catalog={catalog}
          initialName={query}
          onCancel={() => setMode("list")}
          onCreated={(p) => choose(p, null)}
        />
      ) : (
        <>
          <div className="border-b border-light p-2">
            <label className="flex items-center gap-2 rounded-md border border-light px-2.5 focus-within:border-blue">
              <Search size={15} className="text-medium" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search project, task or client"
                className="h-9 min-w-0 flex-1 bg-transparent text-sm focus:outline-none focus-visible:outline-none"
              />
            </label>
          </div>

          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {!q && (
              <button
                type="button"
                onClick={() => choose(null, null)}
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-charcoal/80 hover:bg-lightest"
              >
                No project
              </button>
            )}

            {view.favorites.length > 0 && (
              <section>
                <p className="px-2.5 pb-1 pt-2.5 text-xs font-medium text-charcoal/60">Favorites</p>
                {view.favorites.map((r) => renderProject(r, "fav-"))}
              </section>
            )}

            {view.groups.map((g) => (
              <section key={g.clientId || "none"}>
                <p className="px-2.5 pb-1 pt-2.5 text-xs font-medium text-charcoal/60">{g.name}</p>
                {g.list.map((r) => renderProject(r, ""))}
              </section>
            ))}

            {view.empty && (
              <p className="px-2.5 py-6 text-center text-sm text-charcoal/70">
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>

          <div className="border-t border-light p-1.5">
            <button
              type="button"
              onClick={() => setMode("create")}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium text-blue hover:bg-lightest"
            >
              <CirclePlus size={16} /> Create new project
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}

export function CreateProjectForm({
  catalog,
  initialName = "",
  onCancel,
  onCreated,
}: {
  catalog: Catalog;
  initialName?: string;
  onCancel: () => void;
  onCreated: (p: Project) => void;
}) {
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<"client" | "internal">("client");
  const [clientId, setClientId] = useState<string>("");
  const [newClient, setNewClient] = useState("");
  const [addStages, setAddStages] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeClients = catalog.clients.filter((c) => !c.archived);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the project a name.");
    if (type === "client" && clientId === "__new" && !newClient.trim())
      return setError("Type the new client's name.");
    setBusy(true);
    const project = await catalog.createProject({
      name,
      type,
      clientId: type === "client" && clientId && clientId !== "__new" ? clientId : null,
      newClientName: type === "client" && clientId === "__new" ? newClient : null,
      addStages,
    });
    setBusy(false);
    if (project) onCreated(project);
  };

  return (
    <form onSubmit={submit} className="grid gap-3 p-4">
      <p className="font-display text-sm font-semibold text-navy">New project</p>
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError("");
        }}
        placeholder="Project name"
        className="h-9 rounded-md border border-light px-3 text-sm focus:border-blue focus:outline-none"
      />

      <div className="grid grid-cols-2 rounded-md border border-light p-0.5 text-sm" role="radiogroup">
        {(["client", "internal"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            onClick={() => setType(t)}
            className={`rounded px-3 py-1.5 font-medium ${type === t ? "bg-navy text-white" : "text-charcoal hover:bg-lightest"}`}
          >
            {t === "client" ? "Client work" : "Internal work"}
          </button>
        ))}
      </div>

      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="h-9 rounded-md border border-light bg-white px-2 text-sm focus:border-blue focus:outline-none"
        aria-label="Client"
      >
        <option value="">No client</option>
        {activeClients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
        <option value="__new">+ New client…</option>
      </select>

      {clientId === "__new" && (
        <input
          value={newClient}
          onChange={(e) => setNewClient(e.target.value)}
          placeholder="New client name"
          className="h-9 rounded-md border border-light px-3 text-sm focus:border-blue focus:outline-none"
        />
      )}

      {type === "client" && (
        <label className="flex items-center gap-2 text-sm text-charcoal">
          <input
            type="checkbox"
            checked={addStages}
            onChange={(e) => setAddStages(e.target.checked)}
            className="h-4 w-4 accent-[#00D6B3]"
          />
          Add standard stages as tasks
        </label>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="h-9 rounded-md px-3 text-sm text-charcoal hover:bg-lightest">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy disabled:opacity-60"
        >
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}
