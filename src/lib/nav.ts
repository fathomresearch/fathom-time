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
  bossOnly?: boolean;
};

export const mainNav: NavItem[] = [
  { href: "/tracker", label: "Time Tracker", icon: Clock },
  { href: "/timesheet", label: "Timesheet", icon: CalendarRange },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

export const bossNav: NavItem[] = [
  { href: "/team", label: "Team Overview", icon: Users, bossOnly: true },
];

export const footerNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings },
];
