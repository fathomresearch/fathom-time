"use client";

import Sidebar from "@/components/Sidebar";
import Toaster from "@/components/Toaster";
import { SessionProvider, useSession } from "@/lib/session";
import { initials } from "@/lib/people";
import { isLead } from "@/lib/types";

function Shell({ children }: { children: React.ReactNode }) {
  const { profile } = useSession();
  return (
    <div className="min-h-full">
      <Sidebar
        isLead={isLead(profile.role)}
        user={{
          name: profile.name || profile.email,
          email: profile.email,
          role: profile.role,
          initials: initials(profile.name, profile.email),
        }}
      />
      <main className="ml-60 min-h-full px-10 py-8 print:m-0 print:p-0">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-charcoal/60">Loading…</div>
      }
    >
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}
