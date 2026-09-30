import PageHeader from "@/components/PageHeader";
import TimeTracker from "@/components/tracker/TimeTracker";
import { requireProfile } from "@/lib/auth";

export default async function TrackerPage() {
  const profile = await requireProfile();

  return (
    <>
      <PageHeader title="Time Tracker" />
      <TimeTracker
        ownerId={profile.id}
        viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }}
      />
    </>
  );
}
