export type Role = "director" | "manager" | "analyst";

/** Director or manager: Team Overview, everyone's time, budgets, imports. */
export const isLead = (role: Role) => role === "director" || role === "manager";

export const ROLE_LABELS: Record<Role, string> = { director: "Director", manager: "Manager", analyst: "Analyst" };

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  timezone: string;
  role_initialized: boolean;
  /** false: a former member created by an import (can't sign in). */
  has_login: boolean;
  /** Set when a former member was linked to this real account's id. */
  merged_into: string | null;
  created_at: string;
};
