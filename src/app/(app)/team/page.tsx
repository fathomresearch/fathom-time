import NoAccess from "@/components/NoAccess";
import TeamOverview from "@/components/team/TeamOverview";
import { requireProfile } from "@/lib/auth";
import { isLead } from "@/lib/types";

export default async function TeamPage() {
  const profile = await requireProfile();
  if (!isLead(profile.role)) return <NoAccess />;

  return (
    <TeamOverview viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }} />
  );
}
