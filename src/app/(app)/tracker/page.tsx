"use client";

import PageHeader from "@/components/PageHeader";
import TimeTracker from "@/components/tracker/TimeTracker";
import { useSession } from "@/lib/session";

export default function TrackerPage() {
  const { viewer } = useSession();
  return (
    <>
      <PageHeader title="Time Tracker" />
      <TimeTracker ownerId={viewer.id} viewer={viewer} />
    </>
  );
}
