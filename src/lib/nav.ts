import {
  CalendarRange,
  Clock,
  FolderKanban,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const mainNav: NavItem[] = [
  { href: "/tracker", label: "Time Tracker", icon: Clock },
  { href: "/timesheet", label: "Timesheet", icon: CalendarRange },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

// Directors and managers only.
export const leadNav: NavItem[] = [
  { href: "/team", label: "Team Overview", icon: Users },
];

export const footerNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];
