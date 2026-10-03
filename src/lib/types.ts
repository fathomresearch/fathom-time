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
  created_at: string;
};
