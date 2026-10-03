import NoAccess from "@/components/NoAccess";
import BudgetView from "@/components/budget/BudgetView";
import { requireProfile } from "@/lib/auth";
import { isLead } from "@/lib/types";

export default async function ProjectBudgetPage({ params }: PageProps<"/team/projects/[projectId]">) {
  const profile = await requireProfile();
  if (!isLead(profile.role)) return <NoAccess />;
  const { projectId } = await params;

  return (
    <BudgetView
      projectId={projectId}
      viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }}
    />
  );
}
