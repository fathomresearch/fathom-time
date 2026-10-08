"use client";

import { FolderInput } from "lucide-react";
import ProjectPicker from "@/components/tracker/ProjectPicker";
import type { Catalog } from "@/lib/useCatalog";

/** The bar shown when entries are ticked: move to a project/task, set billable, plus page-specific actions. */
export default function BulkActions({
  count,
  catalog,
  onMove,
  onBillable,
  onClear,
  children,
}: {
  count: number;
  catalog: Catalog;
  onMove: (projectId: string | null, taskId: string | null) => void;
  onBillable: (billable: boolean) => void;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  if (!count) return null;
  const btn = "h-8 rounded-md border border-light bg-white px-3 text-sm text-navy hover:bg-lightest";
  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-light bg-[#EAF8F5] px-5 py-2 text-sm">
      <span className="font-semibold text-navy">
        {count.toLocaleString("en-US")} selected
      </span>
      <ProjectPicker
        catalog={catalog}
        projectId={null}
        taskId={null}
        onChange={(p, t) => onMove(p, t)}
        triggerClassName={`${btn} inline-flex items-center gap-1.5`}
        trigger={
          <>
            <FolderInput size={14} /> Move to project/task…
          </>
        }
      />
      <button type="button" className={btn} onClick={() => onBillable(true)}>
        Set billable
      </button>
      <button type="button" className={btn} onClick={() => onBillable(false)}>
        Set not billable
      </button>
      {children}
      <button type="button" onClick={onClear} className="ml-auto text-xs text-charcoal/70 hover:text-navy">
        Clear selection
      </button>
    </div>
  );
}
