import Sidebar from "@/components/Sidebar";
import Toaster from "@/components/Toaster";
import { requireProfile } from "@/lib/auth";
import { initials } from "@/lib/people";
import { isLead } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

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
      <main className="ml-60 min-h-full px-10 py-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
