import NoAccess from "@/components/NoAccess";
import ImportView from "@/components/import/ImportView";
import { requireProfile } from "@/lib/auth";
import { isLead } from "@/lib/types";

export default async function ImportPage() {
  const profile = await requireProfile();
  if (!isLead(profile.role)) return <NoAccess />;
  return <ImportView viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }} />;
}
