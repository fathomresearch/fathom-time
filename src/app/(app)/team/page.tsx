import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";
import NoAccess from "@/components/NoAccess";
import { requireProfile } from "@/lib/auth";

export default async function TeamPage() {
  const profile = await requireProfile();
  if (profile.role !== "boss") return <NoAccess />;

  return (
    <>
      <PageHeader title="Team Overview" />
      <Placeholder phase={7}>
        Weekly hours by person and by project, who is working right now, team
        management and CSV export.
      </Placeholder>
    </>
  );
}
