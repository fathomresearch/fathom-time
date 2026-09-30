"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import Popover from "@/components/tracker/Popover";
import type { Catalog } from "@/lib/useCatalog";

export default function TagPicker({
  catalog,
  value,
  onChange,
  variant = "bar",
}: {
  catalog: Catalog;
  value: string[];
  onChange: (tagIds: string[]) => void;
  variant?: "bar" | "row";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = catalog.tags.filter((t) => t.name.toLowerCase().includes(q));
  const exact = catalog.tags.some((t) => t.name.toLowerCase() === q);
  // Tags that were deleted elsewhere drop out of the label.
  const selected = value.filter((id) => catalog.tagById.has(id));
  const selectedNames = selected.map((id) => catalog.tagById.get(id)!.name);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const create = async () => {
    const tag = await catalog.createTag(query);
    if (tag) {
      onChange([...selected.filter((x) => x !== tag.id), tag.id]);
      setQuery("");
    }
  };

  const saveRename = async () => {
    if (!editing) return;
    const ok = await catalog.renameTag(editing.id, editing.name);
    if (ok || !editing.name.trim()) setEditing(null);
  };

  const confirmDelete = async (id: string) => {
    setDeleting(null);
    const ok = await catalog.deleteTag(id);
    if (ok && selected.includes(id)) onChange(selected.filter((x) => x !== id));
  };

  const close = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setQuery("");
      setEditing(null);
      setDeleting(null);
    }
  };

  const trigger =
    variant === "row" && selectedNames.length ? (
      <span className="block w-[96px] truncate text-right text-sm text-blue" title={selectedNames.join(", ")}>
        {selectedNames.join(", ")}
      </span>
    ) : variant === "row" ? (
      <span className="flex w-[96px] justify-end text-medium">
        <TagIcon size={18} />
      </span>
    ) : (
      <span className={`flex items-center gap-1 ${selected.length ? "text-blue" : "text-medium"}`}>
        <TagIcon size={18} />
        {selected.length > 0 && <span className="text-xs font-medium">{selected.length}</span>}
      </span>
    );

  return (
    <Popover
      open={open}
      onOpenChange={close}
      label={selectedNames.length ? `Tags: ${selectedNames.join(", ")}` : "Add tags"}
      width={290}
      align="right"
      triggerClassName="flex items-center rounded-md px-2 py-1.5 hover:bg-lightest"
      trigger={trigger}
    >
      <div className="border-b border-light p-2">
        <label className="flex items-center gap-2 rounded-md border border-light px-2.5 focus-within:border-blue">
          <Search size={15} className="text-medium" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q && !exact) {
                e.preventDefault();
                create();
              }
            }}
            placeholder="Search or add a tag"
            className="h-9 min-w-0 flex-1 bg-transparent text-sm focus:outline-none focus-visible:outline-none"
          />
        </label>
      </div>

      <div className="max-h-72 overflow-y-auto p-1.5">
        {shown.map((t) => {
          const on = selected.includes(t.id);

          if (editing?.id === t.id) {
            return (
              <form
                key={t.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRename();
                }}
                className="flex items-center gap-1.5 px-1 py-1"
              >
                <input
                  autoFocus
                  aria-label="Tag name"
                  value={editing.name}
                  onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                  className="h-8 min-w-0 flex-1 rounded border border-blue px-2 text-sm focus:outline-none"
                />
                <button type="submit" className="h-8 rounded bg-teal px-3 font-display text-xs font-semibold text-navy">
                  Save
                </button>
              </form>
            );
          }

          if (deleting === t.id) {
            return (
              <div key={t.id} className="rounded-md bg-danger/5 px-2.5 py-2 text-sm">
                <p className="text-charcoal">
                  Delete &ldquo;{t.name}&rdquo;? It comes off every entry that uses it.
                </p>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDeleting(null)}
                    className="h-7 rounded px-2.5 text-xs text-charcoal hover:bg-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmDelete(t.id)}
                    className="h-7 rounded bg-danger px-2.5 font-display text-xs font-semibold text-white"
                  >
                    Delete tag
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div key={t.id} className="group flex items-center rounded-md hover:bg-lightest">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(t.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-1.5 text-left text-sm text-charcoal"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? "border-blue bg-blue text-white" : "border-medium"
                  }`}
                >
                  {on && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="truncate">{t.name}</span>
              </button>
              <button
                type="button"
                onClick={() => setEditing({ id: t.id, name: t.name })}
                aria-label={`Rename tag ${t.name}`}
                title="Rename"
                className="rounded p-1.5 text-medium hover:bg-white hover:text-navy"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => setDeleting(t.id)}
                aria-label={`Delete tag ${t.name}`}
                title="Delete"
                className="mr-1 rounded p-1.5 text-medium hover:bg-white hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}

        {shown.length === 0 && !q && (
          <p className="px-2.5 py-4 text-center text-sm text-charcoal/70">
            No tags yet. Type a name above to add one.
          </p>
        )}
        {q && !exact && (
          <button
            type="button"
            onClick={create}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-blue hover:bg-lightest"
          >
            <Plus size={14} /> Create tag &lsquo;{query.trim()}&rsquo;
          </button>
        )}
      </div>
    </Popover>
  );
}
