import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Placeholder from "@/components/Placeholder";
import NoAccess from "@/components/NoAccess";
import { requireProfile } from "@/lib/auth";

export default async function PersonPage({
  params,
}: PageProps<"/team/[userId]">) {
  const profile = await requireProfile();
  if (profile.role !== "boss") return <NoAccess />;
  const { userId } = await params;

  return (
    <>
      <Link
        href="/team"
        className="mb-3 inline-flex items-center gap-1 text-sm text-blue hover:underline"
      >
        <ChevronLeft size={16} /> Team Overview
      </Link>
      <PageHeader title="Team member" />
      <Placeholder phase={7}>
        One person&apos;s week, hours by project, and their entries, which you
        can edit. User id{" "}
        <code className="tabular rounded bg-lightest px-1.5 py-0.5 text-xs">
          {userId}
        </code>
        .
      </Placeholder>
    </>
  );
}
