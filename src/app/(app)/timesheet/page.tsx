import Timesheet from "@/components/timesheet/Timesheet";
import { requireProfile } from "@/lib/auth";

export default async function TimesheetPage() {
  const profile = await requireProfile();

  return (
    <Timesheet
      ownerId={profile.id}
      viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }}
    />
  );
}
