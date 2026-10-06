"use client";

import ProjectsView from "@/components/projects/ProjectsView";
import { useSession } from "@/lib/session";

export default function ProjectsPage() {
  const { viewer } = useSession();
  return <ProjectsView viewer={viewer} />;
}
