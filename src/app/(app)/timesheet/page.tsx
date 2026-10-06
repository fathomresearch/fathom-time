"use client";

import Timesheet from "@/components/timesheet/Timesheet";
import { useSession } from "@/lib/session";

export default function TimesheetPage() {
  const { viewer } = useSession();
  return <Timesheet ownerId={viewer.id} viewer={viewer} />;
}
