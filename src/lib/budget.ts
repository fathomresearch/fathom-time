// Budgets: hours per task and level, compared with logged time.

import { ROLE_LABELS, type Role } from "@/lib/types";

/** Budget levels are the same as roles: director, manager, analyst. */
export type Level = Role;
export const LEVELS: Level[] = ["director", "manager", "analyst"];
export const LEVEL_LABELS = ROLE_LABELS;

/**
 * Level colors: one soft navy scale with transparency, Director darkest,
 * Manager middle, Analyst lightest. As light as the budget status colors.
 */
export const LEVEL_STYLE: Record<Level, { dot: string; faint: string }> = {
  director: { dot: "bg-[#1E3354]", faint: "bg-[#1E3354]/[0.10]" },
  manager: { dot: "bg-[#1E3354]/55", faint: "bg-[#1E3354]/[0.055]" },
  analyst: { dot: "bg-[#1E3354]/25", faint: "bg-[#1E3354]/[0.025]" },
};

export type LevelHours = Record<Level, number>;
export const emptyLevels = (): LevelHours => ({ director: 0, manager: 0, analyst: 0 });
export const sumLevels = (h: LevelHours) => h.director + h.manager + h.analyst;

/** Amber from `warn`% of budget, red above `over`%. Set per project; these are the defaults. */
export type Thresholds = { warn: number; over: number };
export const DEFAULT_THRESHOLDS: Thresholds = { warn: 90, over: 100 };

/** Under the warn line, between warn and over, or over. No budget but time logged counts as over. */
export type BudgetStatus = "none" | "under" | "near" | "over";

export function budgetStatus(
  actualHours: number,
  budgetHours: number,
  t: Thresholds = DEFAULT_THRESHOLDS
): BudgetStatus {
  if (budgetHours <= 0) return actualHours > 0.005 ? "over" : "none";
  const pct = (actualHours / budgetHours) * 100;
  if (pct > t.over + 0.01) return "over";
  return pct >= t.warn ? "near" : "under";
}

export const STATUS_CLASS: Record<BudgetStatus, string> = {
  none: "",
  under: "bg-[#E3F7EE] text-[#1B7F52]",
  near: "bg-[#FFF4DB] text-[#8A5D00]",
  over: "bg-[#FDE8E8] text-danger font-semibold",
};

/** 8 -> "8.0", 0 -> "". Budgets read like the spreadsheet. */
export const hoursCell = (h: number) => (h > 0.005 ? h.toFixed(1) : "");

/** Starting tasks for a new budget template (from Fathom's budget sheet). */
export const TEMPLATE_TASKS = [
  "Questionnaire / discussion guide development",
  "Survey programming",
  "Field management & QA",
  "Data processing & tabulation",
  "Analysis",
  "Reporting",
  "Client meetings & presentation",
  "Project management",
  "Other (describe)",
];
