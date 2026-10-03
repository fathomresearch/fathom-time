"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, ChevronRight, Plus, Star, Trash2, X } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import InlineInput from "@/components/tracker/InlineInput";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import type { Catalog } from "@/lib/useCatalog";
import type { Hours } from "@/components/projects/useProjectHours";
import { PROJECT_COLORS, type Project, type Task } from "@/lib/data";
import { formatHoursShort } from "@/lib/time";

const iconButton = "rounded p-1.5 text-charcoal/60 hover:bg-lightest hover:text-navy";

const typeClass = (type: Project["type"]) =>
  `rounded-full px-2.5 py-0.5 font-display text-xs font-semibold ${
    type === "client" ? "bg-teal-soft text-[#00866F]" : "bg-lightest text-charcoal/80"
  }`;

/**
 * One project; everyone can edit, archive and delete. `allHours` (director
 * or manager) means `hours` includes everyone's time, so a project or task
 * with 0 hours truly has none; otherwise the database is the one that
 * blocks deleting something with time.
 */
export default function ProjectRow({
  project,
  catalog,
  hours,
  allHours,
  expanded,
  onToggle,
}: {
  project: Project;
  catalog: Catalog;
  hours: Hours | null;
  allHours: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newClient, setNewClient] = useState<string | null>(null);

  const tasks = catalog.tasks.filter((t) => t.project_id === project.id);
  const activeTasks = tasks.filter((t) => !t.archived);
  const seconds = hours?.byProject.get(project.id) ?? 0;
  const fav = catalog.favorites.has(project.id);
  const clientOptions = catalog.clients.filter((c) => !c.archived || c.id === project.client_id);

  const update = catalog.updateProject.bind(null, project.id);

  const askDelete = () => {
    if (allHours && seconds > 0) return toast("This project has time. Archive it instead.");
    setConfirmDelete(true);
  };

  return (
    <>
      <tr className={`border-b border-light ${expanded ? "bg-canvas/60" : ""}`}>
        <td className="w-10 pl-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? `Hide details for ${project.name}` : `Show details for ${project.name}`}
            className={iconButton}
          >
            <ChevronRight size={16} className={expanded ? "rotate-90" : ""} />
          </button>
        </td>

        <td className="py-1.5 pr-2">
          <div className="flex min-w-0 items-center gap-1">
            <Popover
              open={colorOpen}
              onOpenChange={setColorOpen}
              label={`Color for ${project.name}`}
              width={208}
              triggerClassName="flex rounded p-1.5 hover:bg-lightest"
              trigger={<span className="h-3 w-3 rounded-full" style={{ background: project.color }} />}
            >
              <div className="grid grid-cols-5 gap-2 p-3">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={c.toLowerCase() === project.color.toLowerCase()}
                    onClick={() => {
                      setColorOpen(false);
                      update({ color: c });
                    }}
                    className={`h-7 w-7 rounded-full ${
                      c.toLowerCase() === project.color.toLowerCase() ? "ring-2 ring-navy ring-offset-2" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </Popover>
            <InlineInput
              ariaLabel="Project name"
              value={project.name}
              onCommit={(name) => {
                if (!name.trim()) return toast("A project needs a name.");
                update({ name });
              }}
              className="min-w-0 flex-1 font-medium text-navy"
            />
          </div>
        </td>

        <td className="py-1.5 pr-2">
          {newClient !== null ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const created = await catalog.createClient(newClient);
                setNewClient(null);
                if (created) update({ client_id: created.id });
              }}
            >
              <input
                autoFocus
                value={newClient}
                onChange={(e) => setNewClient(e.target.value)}
                onBlur={() => !newClient.trim() && setNewClient(null)}
                onKeyDown={(e) => e.key === "Escape" && setNewClient(null)}
                placeholder="New client name, then Enter"
                aria-label="New client name"
                className="h-8 w-full rounded-md border border-blue bg-white px-2 text-sm focus:outline-none"
              />
            </form>
          ) : (
            <select
              value={project.client_id ?? ""}
              onChange={(e) => {
                if (e.target.value === "__new") setNewClient("");
                else update({ client_id: e.target.value || null });
              }}
              aria-label={`Client for ${project.name}`}
              className="h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm text-charcoal hover:border-light focus:border-blue focus:outline-none"
            >
              <option value="">No client</option>
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__new">+ New client…</option>
            </select>
          )}
        </td>

        <td className="py-1.5 pr-2">
          <button
            type="button"
            onClick={() => update({ type: project.type === "client" ? "internal" : "client" })}
            title="Click to switch between Client and Internal"
            className={typeClass(project.type)}
          >
            {project.type === "client" ? "Client" : "Internal"}
          </button>
        </td>

        <td className="tabular py-1.5 pr-4 text-right text-charcoal">{activeTasks.length}</td>
        <td className="tabular py-1.5 pr-4 text-right font-medium text-navy">
          {hours ? formatHoursShort(seconds) : "…"}
        </td>

        <td className="py-1.5 pr-2 text-right">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => catalog.toggleFavorite(project.id)}
              aria-pressed={fav}
              aria-label={fav ? `Remove ${project.name} from favorites` : `Add ${project.name} to favorites`}
              className={`rounded p-1.5 hover:bg-lightest ${fav ? "text-[#E0A526]" : "text-medium hover:text-charcoal"}`}
            >
              <Star size={16} fill={fav ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              onClick={() => update({ archived: !project.archived })}
              aria-label={project.archived ? `Restore ${project.name}` : `Archive ${project.name}`}
              title={project.archived ? "Restore" : "Archive"}
              className={iconButton}
            >
              {project.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            </button>
            <button
              type="button"
              onClick={askDelete}
              aria-label={`Delete ${project.name}`}
              title="Delete"
              className="rounded p-1.5 text-charcoal/60 hover:bg-lightest hover:text-danger"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-light bg-canvas/60">
          <td />
          <td colSpan={6} className="pb-4 pr-4 pt-1">
            <Details project={project} tasks={tasks} catalog={catalog} hours={hours} allHours={allHours} />
          </td>
        </tr>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${project.name}?`}
        body={
          (tasks.length ? `Its ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"} will be deleted too. ` : "") +
          "This can't be undone. If it has any time, it won't be deleted."
        }
        onConfirm={() => {
          setConfirmDelete(false);
          catalog.deleteProject(project.id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function Details({
  project,
  tasks,
  catalog,
  hours,
  allHours,
}: {
  project: Project;
  tasks: Task[];
  catalog: Catalog;
  hours: Hours | null;
  allHours: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const creator = project.created_by ? catalog.personById.get(project.created_by) : undefined;
  const sorted = [...tasks].sort(
    (a, b) => Number(a.archived) - Number(b.archived) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
  );

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setAdding(false);
    const existing = tasks.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (existing) {
      toast(
        existing.archived
          ? `"${existing.name}" is archived. Restore it instead.`
          : `"${existing.name}" is already a task.`
      );
      return;
    }
    const task = await catalog.createTask(project.id, clean);
    if (task) setName("");
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {sorted.map((t) => (
          <TaskChip
            key={t.id}
            task={t}
            catalog={catalog}
            seconds={hours?.byTask.get(t.id) ?? 0}
            hoursLoaded={!!hours}
            allHours={allHours}
          />
        ))}
        {adding ? (
          <form onSubmit={addTask} className="flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !name.trim() && setAdding(false)}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              placeholder="Task name"
              aria-label="New task name"
              className="h-8 w-44 rounded-full border border-light bg-white px-3 text-sm focus:border-blue focus:outline-none"
            />
            <button
              type="submit"
              className="h-8 rounded-full bg-teal px-3 font-display text-xs font-semibold text-navy"
            >
              Add
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-blue hover:bg-white"
          >
            <Plus size={14} /> Add task
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-charcoal/80">
        <span>Created by {creator ? creator.name || creator.email : "unknown"}</span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={project.billable_default}
            onChange={(e) => catalog.updateProject(project.id, { billable_default: e.target.checked })}
            className="h-4 w-4 accent-[#00D6B3]"
          />
          New entries are billable by default
        </label>
      </div>
    </div>
  );
}

function TaskChip({
  task,
  catalog,
  seconds,
  hoursLoaded,
  allHours,
}: {
  task: Task;
  catalog: Catalog;
  seconds: number;
  hoursLoaded: boolean;
  allHours: boolean;
}) {
  const small = "rounded-full p-1 text-charcoal/60 hover:bg-lightest";
  const archiveButton = (
    <button
      type="button"
      onClick={() => catalog.updateTask(task.id, { archived: true })}
      aria-label={`Archive ${task.name}`}
      title="Archive"
      className={`${small} hover:text-navy`}
    >
      <Archive size={13} />
    </button>
  );
  const deleteButton = (
    <button
      type="button"
      onClick={() => catalog.deleteTask(task.id)}
      aria-label={`Delete ${task.name}`}
      title="Delete (only if it has no time)"
      className={`${small} hover:text-danger`}
    >
      <X size={13} />
    </button>
  );

  return (
    <span
      className={`inline-flex h-8 items-center gap-1 rounded-full border border-light pl-1 pr-1.5 text-sm ${
        task.archived ? "bg-lightest text-charcoal/60" : "bg-white"
      }`}
    >
      <InlineInput
        ariaLabel="Task name"
        value={task.name}
        onCommit={(name) => {
          if (!name.trim()) return toast("A task needs a name.");
          catalog.updateTask(task.id, { name });
        }}
        className={`rounded-full px-2 py-0.5 [field-sizing:content] ${task.archived ? "line-through" : "text-navy"}`}
      />
      {seconds > 0 && <span className="tabular text-xs text-charcoal/60">{formatHoursShort(seconds)}</span>}
      {task.archived ? (
        <button
          type="button"
          onClick={() => catalog.updateTask(task.id, { archived: false })}
          aria-label={`Restore ${task.name}`}
          title="Restore"
          className={`${small} hover:text-navy`}
        >
          <ArchiveRestore size={13} />
        </button>
      ) : allHours ? (
        // The boss sees everyone's hours, so offer only what will work.
        hoursLoaded && seconds === 0 ? (
          deleteButton
        ) : (
          archiveButton
        )
      ) : (
        <>
          {archiveButton}
          {deleteButton}
        </>
      )}
    </span>
  );
}
