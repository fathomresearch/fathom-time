// Reading and writing budget spreadsheets (.xlsx) with SheetJS.
// SheetJS is loaded only when a sheet is actually read or written.

import { LEVELS, TEMPLATE_TASKS, type Level, type LevelHours } from "@/lib/budget";

export type SheetTask = { name: string } & LevelHours;
export type ParsedBudget = { projectName: string; clientName: string; tasks: SheetTask[] };

const loadXlsx = () => import("xlsx");

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(text(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};

/** Sheet names in a workbook file, so the person can pick one. */
export async function readWorkbook(file: File) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rowsOf = (sheet: string) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, blankrows: true, defval: null });
  return { sheetNames: wb.SheetNames, rowsOf };
}

/** The value next to a label like "Project" or "Client:" anywhere near the top. */
function labelled(rows: unknown[][], labels: string[]) {
  for (const row of rows.slice(0, 15)) {
    for (let c = 0; c < row.length; c++) {
      const t = text(row[c]).toLowerCase().replace(/:$/, "");
      if (labels.includes(t)) {
        const value = row.slice(c + 1).map(text).find(Boolean);
        if (value) return value;
      }
    }
  }
  return "";
}

/**
 * Finds the row with Director / Manager / Analyst columns and reads the task
 * names to their left. Works for Fathom Time's template and for the budget
 * sheet layout ("Task" heading one row above the level names).
 */
export function parseBudgetRows(rows: unknown[][]): ParsedBudget | null {
  const levelCol: Partial<Record<Level, number>> = {};
  let headerRow = -1;
  for (let r = 0; r < Math.min(rows.length, 40) && headerRow < 0; r++) {
    const cells = rows[r].map((v) => text(v).toLowerCase());
    const found: Partial<Record<Level, number>> = {};
    cells.forEach((t, c) => {
      for (const level of LEVELS) if (found[level] === undefined && t === level) found[level] = c;
    });
    if (LEVELS.every((l) => found[l] !== undefined)) {
      headerRow = r;
      Object.assign(levelCol, found);
    }
  }
  if (headerRow < 0) return null;

  // Task column: a "Task" heading in this row or the two above, else column 0.
  const firstLevel = Math.min(...LEVELS.map((l) => levelCol[l]!));
  let taskCol = -1;
  for (let r = headerRow; r >= Math.max(0, headerRow - 2) && taskCol < 0; r--) {
    const c = rows[r].findIndex((v, i) => i < firstLevel && /^tasks?$/i.test(text(v)));
    if (c >= 0) taskCol = c;
  }
  if (taskCol < 0) taskCol = 0;

  const tasks: SheetTask[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const name = text(row[taskCol]);
    if (!name) {
      if (tasks.length) break; // first empty row after the list ends it
      continue;
    }
    if (/^(sub)?total\b/i.test(name)) break;
    tasks.push({
      name,
      director: num(row[levelCol.director!]),
      manager: num(row[levelCol.manager!]),
      analyst: num(row[levelCol.analyst!]),
    });
  }

  return {
    projectName: labelled(rows, ["project", "project name", "case", "case name"]),
    clientName: labelled(rows, ["client", "client name"]),
    tasks,
  };
}

/** An empty Fathom Time budget template. */
export async function downloadTemplate() {
  const XLSX = await loadXlsx();
  const rows: (string | number | null)[][] = [
    ["Project", ""],
    ["Client", ""],
    [],
    ["Budgeted hours by level. Change, add or remove tasks as needed."],
    ["Task", "Director", "Manager", "Analyst"],
    ...TEMPLATE_TASKS.map((t) => [t, null, null, null]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 46 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Budget");
  XLSX.writeFile(wb, "Fathom Time budget template.xlsx");
}

/** Writes any table of rows as a one-sheet .xlsx download. */
export async function downloadSheet(fileName: string, sheetName: string, rows: (string | number | null)[][], widths: number[]) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}
