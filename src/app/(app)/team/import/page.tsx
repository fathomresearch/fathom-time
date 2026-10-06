"use client";

import NoAccess from "@/components/NoAccess";
import ImportView from "@/components/import/ImportView";
import { useSession } from "@/lib/session";
import { isLead } from "@/lib/types";

export default function ImportPage() {
  const { viewer } = useSession();
  if (!isLead(viewer.role)) return <NoAccess />;
  return <ImportView viewer={viewer} />;
}
