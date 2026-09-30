"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import InlineInput from "@/components/tracker/InlineInput";
import ConfirmDialog from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import type { Catalog } from "@/lib/useCatalog";
import type { Client } from "@/lib/data";

const iconButton = "rounded p-1.5 text-charcoal/60 hover:bg-lightest hover:text-navy";

/** Everyone can add and rename clients; the boss archives and deletes them. */
export default function ClientsTable({
  catalog,
  canManage,
  query,
}: {
  catalog: Catalog;
  canManage: boolean;
  query: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [deleting, setDeleting] = useState<Client | null>(null);

  const q = query.trim().toLowerCase();
  const projectCount = (id: string) => catalog.projects.filter((p) => p.client_id === id).length;
  const shown = catalog.clients
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return setAdding(false);
    if (catalog.clients.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      return toast(`A client called "${clean}" already exists.`);
    }
    if (await catalog.createClient(clean)) {
      setName("");
      setAdding(false);
    }
  };

  const deleteCount = deleting ? projectCount(deleting.id) : 0;

  return (
    <div className="rounded-lg border border-light bg-white">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col className="w-[120px]" />
          <col className={canManage ? "w-[96px]" : "w-4"} />
        </colgroup>
        <thead>
          <tr className="border-b border-light text-left font-display text-xs font-semibold text-charcoal/70">
            <th className="py-2.5 pl-6">Client</th>
            <th className="py-2.5 pr-4 text-right">Projects</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-10 text-center text-charcoal/70">
                {q ? <>Nothing matches &ldquo;{query}&rdquo;.</> : "No clients yet."}
              </td>
            </tr>
          )}
          {shown.map((c) => (
            <tr key={c.id} className="border-b border-light">
              <td className="py-1.5 pl-4 pr-2">
                <div className="flex min-w-0 items-center gap-2">
                  <InlineInput
                    ariaLabel="Client name"
                    value={c.name}
                    onCommit={(next) => {
                      if (!next.trim()) return toast("A client needs a name.");
                      catalog.updateClient(c.id, { name: next });
                    }}
                    className={`min-w-0 flex-1 font-medium ${c.archived ? "text-charcoal/60" : "text-navy"}`}
                  />
                  {c.archived && (
                    <span className="shrink-0 rounded bg-lightest px-1.5 py-px text-[10px] font-semibold tracking-wide text-charcoal/70">
                      ARCHIVED
                    </span>
                  )}
                </div>
              </td>
              <td className="tabular py-1.5 pr-4 text-right text-charcoal">{projectCount(c.id)}</td>
              <td className="py-1.5 pr-2">
                {canManage && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => catalog.updateClient(c.id, { archived: !c.archived })}
                      aria-label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}
                      title={c.archived ? "Restore" : "Archive (hides it from client lists)"}
                      className={iconButton}
                    >
                      {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(c)}
                      aria-label={`Delete ${c.name}`}
                      title="Delete"
                      className="rounded p-1.5 text-charcoal/60 hover:bg-lightest hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} className="px-2 py-1.5">
              {adding ? (
                <form onSubmit={add} className="flex items-center gap-1.5 px-2">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => !name.trim() && setAdding(false)}
                    onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
                    placeholder="Client name"
                    aria-label="New client name"
                    className="h-8 w-64 rounded-md border border-light px-2.5 text-sm focus:border-blue focus:outline-none"
                  />
                  <button type="submit" className="h-8 rounded-md bg-teal px-3 font-display text-xs font-semibold text-navy">
                    Add
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-blue hover:bg-lightest"
                >
                  <Plus size={16} /> New client
                </button>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? "client"}?`}
        body={
          deleteCount
            ? `Its ${deleteCount} ${deleteCount === 1 ? "project stays but will have" : "projects stay but will have"} no client. This can't be undone.`
            : "This can't be undone."
        }
        onConfirm={() => {
          if (deleting) catalog.deleteClient(deleting.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
