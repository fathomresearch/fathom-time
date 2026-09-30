import ProjectsView from "@/components/projects/ProjectsView";
import { requireProfile } from "@/lib/auth";

export default async function ProjectsPage() {
  const profile = await requireProfile();

  return (
    <ProjectsView viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }} />
  );
}
