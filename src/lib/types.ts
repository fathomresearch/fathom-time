export type Role = "boss" | "manager" | "employee";

/** Boss and managers add and edit projects, tasks and clients. */
export const canManageProjects = (role: Role) => role === "boss" || role === "manager";

export const ROLE_LABELS: Record<Role, string> = { boss: "Boss", manager: "Manager", employee: "Employee" };

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
