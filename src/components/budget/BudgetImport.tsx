"use client";

import { useRef, useState } from "react";
import { ChevronDown, Download, FileUp, Plus, X } from "lucide-react";
import { toast } from "@/components/Toaster";
import { saveProjectBudget, type BudgetRow } from "@/components/budget/useProjectBudget";
import { LEVELS, LEVEL_LABELS, LEVEL_STYLE, type LevelHours } from "@/lib/budget";
import { downloadTemplate, parseBudgetRows, readWorkbook } from "@/lib/budgetSheet";
import type { Catalog } from "@/lib/useCatalog";

type DraftTask = { key: number; include: boolean; name: string } & LevelHours;
type Draft = {
  fileName: string;
  sheetNames: string[];
  sheet: string;
  mode: "new" | "existing";
  projectName: string;
  clientId: string; // "" = no client, "__new" = create
  newClientName: string;
  projectId: string;
  tasks: DraftTask[];
};

let nextKey = 1;

/**
 * "Import Project/Budget": read a sheet, let the person fix anything, then create or
 * pick the project, create missing tasks, and replace its budget.
 * `projectId` attaches to that project by default (from its budget page).
 */
export default function BudgetImport({
  catalog,
  projectId,
  onImported,
  className = "",
}: {
  catalog: Catalog;
  projectId?: string;
  onImported: (projectId: string) => void;
  className?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const workbook = useRef<Awaited<ReturnType<typeof readWorkbook>> | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Ticked tasks without a usable name, shown in light red after Import.
  const [nameErrors, setNameErrors] = useState<Map<number, string>>(new Map());

  const fromSheet = (
    sheet: string,
    base: Omit<Draft, "sheet" | "tasks" | "projectName" | "clientId" | "newClientName" | "mode" | "projectId">
  ) => {
    const parsed = parseBudgetRows(workbook.current!.rowsOf(sheet));
    if (!parsed) return null;
    const sameName = catalog.projects.find(
      (p) => parsed.projectName && p.name.toLowerCase() === parsed.projectName.toLowerCase()
    );
    const target = projectId ?? sameName?.id ?? "";
    const client = catalog.clients.find(
      (c) => parsed.clientName && c.name.toLowerCase() === parsed.clientName.toLowerCase()
    );
    return {
      ...base,
      sheet,
      // From a budget page: update that project. From Team Overview: create new.
      mode: projectId ? "existing" : "new",
      projectId: target,
      projectName: parsed.projectName,
      clientId: client ? client.id : parsed.clientName ? "__new" : "",
      newClientName: client ? "" : parsed.clientName,
      tasks: parsed.tasks.map((t) => ({
        ...t,
        key: nextKey++,
        include: t.director + t.manager + t.analyst > 0,
      })),
    } satisfies Draft;
  };

  const onFile = async (file: File) => {
    try {
      workbook.current = await readWorkbook(file);
    } catch {
      return toast("That file couldn't be read. Use an Excel (.xlsx) file.");
    }
    const { sheetNames } = workbook.current;
    const base = { fileName: file.name, sheetNames };
    for (const sheet of sheetNames) {
      const d = fromSheet(sheet, base);
      if (d && d.tasks.length) return setDraft(d);
    }
    toast("No budget table found. It needs a row with Director, Manager and Analyst headings.");
  };

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchTask = (key: number, p: Partial<DraftTask>) =>
    setDraft((d) => (d ? { ...d, tasks: d.tasks.map((t) => (t.key === key ? { ...t, ...p } : t)) } : d));

  const apply = async () => {
    if (!draft) return;
    const included = draft.tasks.filter((t) => t.include);
    if (!included.length) return toast("Tick at least one task.");
    const errors = new Map<number, string>();
    for (const t of included) {
      const name = t.name.trim().toLowerCase();
      if (!name) errors.set(t.key, "Give this task a name.");
      else if (name === "no task") errors.set(t.key, '"No task" can\'t be used as a name.');
    }
    setNameErrors(errors);
    if (errors.size) return toast("Every ticked task needs a name.");
    const names = included.map((t) => t.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return toast("Two tasks have the same name. Rename or remove one.");
    if (draft.mode === "new" && !draft.projectName.trim()) return toast("Give the project a name.");
    if (draft.mode === "existing" && !draft.projectId) return toast("Pick the project to update.");
    if (draft.mode === "new" && draft.clientId === "__new" && !draft.newClientName.trim())
      return toast("Type the new client's name.");

    setSaving(true);
    try {
      const project =
        draft.mode === "new"
          ? await catalog.createProject({
              name: draft.projectName,
              type: "client",
              clientId: draft.clientId && draft.clientId !== "__new" ? draft.clientId : null,
              newClientName: draft.clientId === "__new" ? draft.newClientName : null,
              addStages: false,
            })
          : (catalog.projectById.get(draft.projectId) ?? null);
      if (!project) return;

      const existing = catalog.tasks.filter((t) => t.project_id === project.id);
      const rows: BudgetRow[] = [];
      for (const [i, t] of included.entries()) {
        let task = existing.find((x) => x.name.toLowerCase() === t.name.trim().toLowerCase()) ?? null;
        if (task?.archived) await catalog.updateTask(task.id, { archived: false });
        if (!task) task = await catalog.createTask(project.id, t.name.trim(), i + 1);
        if (!task) return;
        rows.push({ task_id: task.id, director: t.director, manager: t.manager, analyst: t.analyst });
      }
      if (!(await saveProjectBudget(project.id, rows))) return;
      toast(`Budget imported for ${project.name}.`, "info");
      setDraft(null);
      onImported(project.id);
    } finally {
      setSaving(false);
    }
  };

  // text-charcoal: typed text reads like the task names, not the faded labels.
  const fieldBase = "h-9 rounded-md border px-2.5 text-sm text-charcoal focus:outline-none";
  const field = `${fieldBase} border-light bg-white focus:border-medium`;
  const fieldError = `${fieldBase} border-danger/40 bg-[#FFF6F6] focus:border-danger/60`;
  const activeProjects = catalog.projects.filter((p) => !p.archived);
  const sameNameProject =
    draft?.mode === "new" && draft.projectName.trim()
      ? catalog.projects.find((p) => p.name.toLowerCase() === draft.projectName.trim().toLowerCase())
      : undefined;

  return (
    <>
      {/* Hover (or click / keyboard focus) shows: Import, Template. */}
      <div
        className={`group relative ${className}`}
        onMouseLeave={() => setMenuOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-9 items-center gap-1.5 rounded-md border border-light bg-white px-3 text-sm font-medium text-navy hover:bg-lightest"
        >
          <FileUp size={15} /> Import Project/Budget <ChevronDown size={14} className="text-charcoal/60" />
        </button>
        <div
          role="menu"
          className={`absolute right-0 top-full z-30 pt-1 ${menuOpen ? "block" : "hidden"} group-hover:block group-focus-within:block`}
        >
          <div className="w-44 rounded-lg border border-light bg-white p-1 shadow-xl">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                fileRef.current?.click();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-navy hover:bg-lightest"
            >
              <FileUp size={14} /> Import
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                downloadTemplate();
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-navy hover:bg-lightest"
            >
              <Download size={14} /> Template
            </button>
          </div>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />

      {draft && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/40 p-6">
          <div
            role="dialog"
            aria-label="Import Project/Budget"
            className="w-full max-w-3xl rounded-lg bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-light px-6 py-4">
              <div>
                <h2 className="font-display text-base font-semibold text-navy">Import Project/Budget</h2>
                <p className="text-xs text-charcoal/70">
                  {draft.fileName}. Check everything below; nothing is saved until you click Import.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                aria-label="Close"
                className="rounded p-1.5 text-charcoal/60 hover:bg-lightest"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-5 px-6 py-5">
              {draft.sheetNames.length > 1 && (
                <label className="grid gap-1 text-xs text-charcoal/70">
                  Sheet
                  <select
                    value={draft.sheet}
                    onChange={(e) => {
                      const d = fromSheet(e.target.value, { fileName: draft.fileName, sheetNames: draft.sheetNames });
                      if (!d) return toast("No budget table found on that sheet.");
                      setDraft(d);
                    }}
                    className={`${field} w-72`}
                  >
                    {draft.sheetNames.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="grid gap-3">
                <div className="flex gap-1 rounded-md border border-light p-0.5 text-sm" role="radiogroup">
                  {(["new", "existing"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={draft.mode === m}
                      onClick={() => patch({ mode: m })}
                      className={`flex-1 rounded px-3 py-1.5 font-medium ${draft.mode === m ? "bg-navy text-white" : "text-charcoal hover:bg-lightest"}`}
                    >
                      {m === "new" ? "Create as a new project" : "Update an existing project"}
                    </button>
                  ))}
                </div>

                {draft.mode === "new" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-xs text-charcoal/70">
                      Project name
                      <input
                        value={draft.projectName}
                        onChange={(e) => patch({ projectName: e.target.value })}
                        className={field}
                      />
                      {sameNameProject && (
                        <span className="text-[11px] text-charcoal/70">
                          A project called &ldquo;{sameNameProject.name}&rdquo; already exists. To change its budget,
                          choose Update an existing project.
                        </span>
                      )}
                    </label>
                    <label className="grid gap-1 text-xs text-charcoal/70">
                      Client
                      <select
                        value={draft.clientId}
                        onChange={(e) => patch({ clientId: e.target.value })}
                        className={field}
                      >
                        <option value="">No client</option>
                        {catalog.clients
                          .filter((c) => !c.archived)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        <option value="__new">+ New client…</option>
                      </select>
                    </label>
                    {draft.clientId === "__new" && (
                      <label className="col-start-2 grid gap-1 text-xs text-charcoal/70">
                        New client name
                        <input
                          value={draft.newClientName}
                          onChange={(e) => patch({ newClientName: e.target.value })}
                          className={field}
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <label className="grid gap-1 text-xs text-charcoal/70">
                    Project
                    <select
                      value={draft.projectId}
                      onChange={(e) => patch({ projectId: e.target.value })}
                      className={field}
                    >
                      <option value="">Choose a project…</option>
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <span className="text-charcoal/60">
                      Tasks are matched by name and missing ones are created. This replaces the project&apos;s current
                      budget.
                    </span>
                  </label>
                )}
              </div>

              <table className="w-full table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-10" />
                  <col />
                  {LEVELS.map((l) => (
                    <col key={l} className="w-[90px]" />
                  ))}
                  <col className="w-10" />
                </colgroup>
                <thead>
                  <tr className="border-b border-light text-left font-display text-xs font-semibold text-charcoal/70">
                    <th className="py-2" aria-label="Include" />
                    <th className="py-2">Task</th>
                    {LEVELS.map((l) => (
                      <th key={l} className="py-2 text-center">
                        <span className={`inline-flex items-center gap-1.5 text-navy`}>
                          <span className={`h-2 w-2 rounded-full ${LEVEL_STYLE[l].dot}`} />
                          {LEVEL_LABELS[l]}
                        </span>
                      </th>
                    ))}
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {draft.tasks.map((t) => (
                    <tr key={t.key} className={`border-b border-light ${t.include ? "" : "opacity-50"}`}>
                      <td className="py-1.5 text-center align-top">
                        <input
                          type="checkbox"
                          checked={t.include}
                          onChange={(e) => patchTask(t.key, { include: e.target.checked })}
                          aria-label={`Include ${t.name}`}
                          className="mt-2.5 h-4 w-4 accent-[#00D6B3]"
                        />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <input
                          value={t.name}
                          onFocus={() => !t.include && patchTask(t.key, { include: true })}
                          onChange={(e) => {
                            patchTask(t.key, { name: e.target.value });
                            if (nameErrors.has(t.key)) {
                              const next = new Map(nameErrors);
                              next.delete(t.key);
                              setNameErrors(next);
                            }
                          }}
                          placeholder="Task name"
                          aria-label="Task name"
                          aria-invalid={nameErrors.has(t.key)}
                          className={`${nameErrors.has(t.key) ? fieldError : field} w-full`}
                        />
                        {nameErrors.has(t.key) && (
                          <p className="mt-0.5 text-[11px] text-danger">{nameErrors.get(t.key)}</p>
                        )}
                      </td>
                      {LEVELS.map((l) => (
                        <td key={l} className="px-1 py-1.5 align-top">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={t[l] || ""}
                            onFocus={() => !t.include && patchTask(t.key, { include: true })}
                            onChange={(e) => patchTask(t.key, { [l]: Math.max(0, Number(e.target.value) || 0) })}
                            aria-label={`${LEVEL_LABELS[l]} hours for ${t.name}`}
                            className={`${field} tabular w-full text-center`}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 text-center align-top">
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((d) => (d ? { ...d, tasks: d.tasks.filter((x) => x.key !== t.key) } : d))
                          }
                          aria-label={`Remove ${t.name}`}
                          className="mt-1.5 rounded p-1 text-medium hover:bg-lightest hover:text-danger"
                        >
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          tasks: [
                            ...d.tasks,
                            { key: nextKey++, include: true, name: "", director: 0, manager: 0, analyst: 0 },
                          ],
                        }
                      : d
                  )
                }
                className="flex w-fit items-center gap-1 text-sm font-semibold text-teal hover:underline"
              >
                <Plus size={14} /> Add task
              </button>
              <p className="text-xs text-charcoal/60">Unticked rows (e.g. tasks with no hours) are skipped.</p>
            </div>

            <div className="flex justify-end gap-2 border-t border-light px-6 py-4">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="h-9 rounded-md px-4 text-sm text-charcoal hover:bg-lightest"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={apply}
                className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy disabled:opacity-60"
              >
                {saving ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
