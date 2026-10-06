"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import NoAccess from "@/components/NoAccess";
import BudgetView from "@/components/budget/BudgetView";
import { useSession } from "@/lib/session";
import { isLead } from "@/lib/types";

/** A project's budget page: /team/project/?id=<project id>. */
function ProjectBudget() {
  const { viewer } = useSession();
  const id = useSearchParams().get("id") ?? "";
  if (!isLead(viewer.role)) return <NoAccess />;
  return <BudgetView key={id} projectId={id} viewer={viewer} />;
}

export default function ProjectBudgetPage() {
  return (
    <Suspense>
      <ProjectBudget />
    </Suspense>
  );
}
