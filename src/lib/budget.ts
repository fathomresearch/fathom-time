// Budgets: hours per task and level, compared with logged time.

import { ROLE_LABELS, type Role } from "@/lib/types";

/** Budget levels are the same as roles: director, manager, analyst. */
export type Level = Role;
export const LEVELS: Level[] = ["director", "manager", "analyst"];
export const LEVEL_LABELS = ROLE_LABELS;

export type LevelHours = Record<Level, number>;
export const emptyLevels = (): LevelHours => ({ director: 0, manager: 0, analyst: 0 });
export const sumLevels = (h: LevelHours) => h.director + h.manager + h.analyst;

/** Under 90% of budget, 90 to 100%, or over. No budget but time logged counts as over. */
export type BudgetStatus = "none" | "under" | "near" | "over";

export function budgetStatus(actualHours: number, budgetHours: number): BudgetStatus {
  if (budgetHours <= 0) return actualHours > 0.005 ? "over" : "none";
  const share = actualHours / budgetHours;
  if (share > 1.0001) return "over";
  return share >= 0.9 ? "near" : "under";
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
