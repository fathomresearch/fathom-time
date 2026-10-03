"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Popover from "@/components/tracker/Popover";
import { CreateProjectForm } from "@/components/tracker/ProjectPicker";
import ProjectRow from "@/components/projects/ProjectRow";
import ClientsTable from "@/components/projects/ClientsTable";
import { useProjectHours } from "@/components/projects/useProjectHours";
import type { Viewer } from "@/components/tracker/TimeTracker";
import { isLead } from "@/lib/types";
import { useCatalog } from "@/lib/useCatalog";

export default function ProjectsView({ viewer }: { viewer: Viewer }) {
  const catalog = useCatalog(viewer.id);
  const { hours } = useProjectHours();
  // Only directors' and managers' hours include everyone's time.
  const allHours = isLead(viewer.role);

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"active" | "archived" | "clients">("active");
  const showArchived = view === "archived";
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      catalog.projects
        .filter((p) => p.archived === showArchived)
        .filter((p) => {
          if (!q) return true;
          const client = p.client_id ? (catalog.clientById.get(p.client_id)?.name ?? "") : "";
          return p.name.toLowerCase().includes(q) || client.toLowerCase().includes(q);
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.projects, catalog.clientById, showArchived, q]
  );

  return (
    <>
      <PageHeader title="Projects">
        <Popover
          open={creating}
          onOpenChange={setCreating}
          label="New project"
          align="right"
          width={360}
          triggerClassName="flex h-9 items-center gap-1.5 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy hover:brightness-95"
          trigger={
            <>
              <Plus size={16} /> New project
            </>
          }
        >
          <CreateProjectForm
            catalog={catalog}
            onCancel={() => setCreating(false)}
            onCreated={(p) => {
              setCreating(false);
              setView("active");
              setExpanded((cur) => new Set(cur).add(p.id));
            }}
          />
        </Popover>
      </PageHeader>

      <div className="mb-4 flex items-center gap-3">
        <label className="flex h-9 w-72 items-center gap-2 rounded-md border border-light bg-white px-2.5 focus-within:border-blue">
          <Search size={15} className="text-medium" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "clients" ? "Search clients" : "Search project or client"}
            aria-label="Search projects"
            className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none focus-visible:outline-none"
          />
        </label>
        <div
          className="flex h-9 rounded-md border border-light bg-white p-0.5 text-sm"
          role="radiogroup"
          aria-label="Show"
        >
          {(["active", "archived", "clients"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setView(v)}
              className={`rounded px-3 font-medium ${view === v ? "bg-navy text-white" : "text-charcoal hover:bg-lightest"}`}
            >
              {v === "active" ? "Active" : v === "archived" ? "Archived" : "Clients"}
            </button>
          ))}
        </div>
      </div>

      {view === "clients" ? (
        <ClientsTable catalog={catalog} query={query} />
      ) : (
        <div className="rounded-lg border border-light bg-white">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-10" />
              <col />
              <col className="w-[200px]" />
              <col className="w-[100px]" />
              <col className="w-[80px]" />
              <col className="w-[100px]" />
              <col className="w-[120px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-light text-left font-display text-xs font-semibold text-charcoal/70">
                <th />
                <th className="py-2.5 pl-9">Name</th>
                <th className="py-2.5 pl-2">Client</th>
                <th className="py-2.5">Type</th>
                <th className="py-2.5 pr-4 text-right">Tasks</th>
                <th
                  className="py-2.5 pr-4 text-right"
                  title={allHours ? "Everyone's time, all time" : "Your time, all time"}
                >
                  {allHours ? "Hours" : "Your hours"}
                </th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {!catalog.loaded ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-charcoal/60">
                    Loading…
                  </td>
                </tr>
              ) : shown.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-charcoal/70">
                    {q ? (
                      <>Nothing matches &ldquo;{query}&rdquo;.</>
                    ) : showArchived ? (
                      "No archived projects."
                    ) : (
                      "No projects yet. Click New project to add one."
                    )}
                  </td>
                </tr>
              ) : (
                shown.map((p) => (
                  <ProjectRow
                    key={p.id}
                    project={p}
                    catalog={catalog}
                    hours={hours}
                    allHours={allHours}
                    expanded={expanded.has(p.id)}
                    onToggle={() => toggle(p.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {view !== "clients" && (
        <p className="mt-3 text-xs text-charcoal/70">
          Hours are all-time and leave out running timers.
          {allHours ? " They include everyone's time." : " They include only your own time."}
        </p>
      )}
    </>
  );
}
