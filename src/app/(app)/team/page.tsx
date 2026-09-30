import NoAccess from "@/components/NoAccess";
import TeamOverview from "@/components/team/TeamOverview";
import { requireProfile } from "@/lib/auth";

export default async function TeamPage() {
  const profile = await requireProfile();
  if (profile.role !== "boss") return <NoAccess />;

  return (
    <TeamOverview viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }} />
  );
}
