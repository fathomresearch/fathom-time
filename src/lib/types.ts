export type Role = "boss" | "employee";

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
