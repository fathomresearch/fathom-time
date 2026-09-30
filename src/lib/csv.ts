// Time entries as a CSV file. Dates and times are in the viewer's zone.

import type { Entry } from "@/lib/data";
import type { Catalog } from "@/lib/useCatalog";
import { displayName } from "@/lib/people";
import { entrySeconds } from "@/lib/report";
import { dayKey, daysBetween, wallParts } from "@/lib/time";

const HEADER = [
  "Date", "User", "Client", "Project", "Project type", "Task/Stage",
  "Description", "Tags", "Billable", "Start", "End", "Hours",
];

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date, tz: string) => {
  const p = wallParts(d, tz);
  return `${pad(p.h)}:${pad(p.mi)}`;
};

function cell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function entriesToCsv(entries: Entry[], catalog: Catalog, tz: string): string {
  const rows = entries.map((e) => {
    const start = new Date(e.start_at);
    const end = new Date(e.end_at!);
    const date = dayKey(start, tz);
    const extraDays = daysBetween(date, dayKey(end, tz));
    const project = e.project_id ? catalog.projectById.get(e.project_id) : undefined;
    const client = project?.client_id ? catalog.clientById.get(project.client_id) : undefined;
    const task = e.task_id ? catalog.taskById.get(e.task_id) : undefined;
    const tags = e.tag_ids.map((id) => catalog.tagById.get(id)?.name).filter(Boolean).join(", ");
    return {
      sort: [date, displayName(catalog.personById.get(e.user_id)).toLowerCase(), e.start_at],
      values: [
        date,
        displayName(catalog.personById.get(e.user_id)),
        client?.name ?? "",
        project?.name ?? "",
        project ? (project.type === "client" ? "Client" : "Internal") : "",
        task?.name ?? "",
        e.description,
        tags,
        e.billable ? "Yes" : "No",
        clock(start, tz),
        clock(end, tz) + (extraDays > 0 ? ` (+${extraDays})` : ""),
        (entrySeconds(e) / 3600).toFixed(2),
      ],
    };
  });
  rows.sort((a, b) => a.sort.join("\u0000").localeCompare(b.sort.join("\u0000")));
  const lines = [HEADER, ...rows.map((r) => r.values)].map((r) => r.map(cell).join(","));
  // The BOM makes Excel read names in any language (e.g. Chinese) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function downloadFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
