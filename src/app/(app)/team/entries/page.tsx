"use client";

import NoAccess from "@/components/NoAccess";
import EntriesView from "@/components/team/EntriesView";
import { useSession } from "@/lib/session";
import { isLead } from "@/lib/types";

export default function EntriesPage() {
  const { viewer } = useSession();
  if (!isLead(viewer.role)) return <NoAccess />;
  return <EntriesView viewer={viewer} />;
}
