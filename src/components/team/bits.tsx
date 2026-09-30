"use client";

import type { Catalog } from "@/lib/useCatalog";
import type { Entry } from "@/lib/data";
import { initials } from "@/lib/people";
import { useNow } from "@/lib/useNow";
import { formatDuration, secondsBetween } from "@/lib/time";

export function Avatar({
  name,
  email,
  running = false,
  size = "sm",
}: {
  name: string;
  email: string;
  running?: boolean;
  size?: "sm" | "lg";
}) {
  const box = size === "lg" ? "h-12 w-12 text-sm" : "h-8 w-8 text-xs";
  return (
    <span className="relative inline-flex shrink-0">
      <span className={`flex items-center justify-center rounded-full bg-purple font-display font-semibold text-white ${box}`}>
        {initials(name, email)}
      </span>
      {running && (
        <span
          title="Timer running"
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-teal"
        />
      )}
    </span>
  );
}

/** "Working now · Project: Task · 01:23:05" or "Not clocked in". */
export function LiveStatus({ running, catalog }: { running: Entry | undefined | null; catalog: Catalog }) {
  const now = useNow(1000);
  if (!running) return <span className="text-charcoal/60">Not clocked in</span>;
  const project = running.project_id ? catalog.projectById.get(running.project_id) : undefined;
  const task = running.task_id ? catalog.taskById.get(running.task_id) : undefined;
  const what = project ? `${project.name}${task ? ": " + task.name : ""}` : running.description || "No project";
  return (
    <span className="flex min-w-0 items-center gap-1 text-[#00866F]">
      <span className="shrink-0 font-medium">Working now</span>
      <span className="shrink-0">·</span>
      <span className="truncate" title={what}>{what}</span>
      <span className="shrink-0">·</span>
      <span className="tabular shrink-0">{formatDuration(secondsBetween(running.start_at, new Date(now)))}</span>
    </span>
  );
}

export function Tile({
  label,
  value,
  sub,
  pulse = false,
}: {
  label: string;
  value: string;
  sub?: string;
  pulse?: boolean;
}) {
  return (
    <div className="rounded-lg border border-light bg-white px-5 py-4">
      <p className="text-xs font-medium text-charcoal/70">{label}</p>
      <p className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold text-navy">
        <span className="tabular">{value}</span>
        {pulse && (
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal" />
          </span>
        )}
      </p>
      {sub && <p className="mt-0.5 text-xs text-charcoal/70">{sub}</p>}
    </div>
  );
}

/** A horizontal teal bar; `share` is 0 to 1 of the track. */
export function Bar({ share }: { share: number }) {
  const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  return (
    <span className="block h-2 w-full rounded-full bg-lightest">
      <span
        className="block h-2 rounded-full bg-teal"
        style={{ width: `${s > 0 ? Math.max(2, s * 100) : 0}%` }}
      />
    </span>
  );
}
