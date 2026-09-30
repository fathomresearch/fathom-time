import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader title="Projects" />
      <Placeholder phase={6}>
        Active and archived projects with client, type, tasks, hours and
        favorites.
      </Placeholder>
    </>
  );
}
