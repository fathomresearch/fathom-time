"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { bossNav, footerNav, mainNav, type NavItem } from "@/lib/nav";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-md px-3 py-2 font-display text-[13.5px] font-medium transition-colors ${
        active
          ? "bg-navy-raised text-white"
          : "text-medium hover:bg-navy-raised/60 hover:text-white"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-teal"
        />
      )}
      <Icon size={17} strokeWidth={2} className={active ? "text-teal" : ""} />
      {item.label}
    </Link>
  );
}

type SidebarUser = {
  name: string;
  email: string;
  role: "boss" | "employee";
  initials: string;
};

export default function Sidebar({
  isBoss,
  user,
}: {
  isBoss: boolean;
  user: SidebarUser;
}) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-60 flex-col bg-navy px-3 py-5">
      <Link href="/tracker" className="mb-8 flex items-center gap-2.5 px-3">
        <Image
          src="/Fathom_Icon_Teal.png"
          alt=""
          width={30}
          height={24}
          priority
        />
        <span className="font-display text-[17px] font-semibold tracking-tight text-white">
          Fathom <span className="text-teal">Time</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1" aria-label="Main">
        {mainNav.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {isBoss && (
          <>
            <p className="mt-6 mb-1 px-3 text-xs text-medium/70">Manage</p>
            {bossNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isActive(item.href)}
              />
            ))}
          </>
        )}

        <div className="mt-auto flex flex-col gap-1">
          {footerNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isActive(item.href)}
            />
          ))}
        </div>
      </nav>

      <div className="mt-4 flex items-center gap-3 border-t border-white/10 px-3 pt-4">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple font-display text-xs font-semibold text-white"
        >
          {user.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white" title={user.email}>
            {user.name}
          </p>
          <p className="text-xs text-medium">
            {user.role === "boss" ? "Boss" : "Employee"}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-medium hover:text-white"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={17} />
          </button>
        </form>
      </div>
    </aside>
  );
}
