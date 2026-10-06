"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import NoAccess from "@/components/NoAccess";
import PersonView, { type PersonInfo } from "@/components/team/PersonView";
import { sb } from "@/lib/supabase/browser";
import { useSession } from "@/lib/session";
import { isLead } from "@/lib/types";

/** One person's week: /team/person/?id=<their id>. */
function Person() {
  const { viewer } = useSession();
  const id = useSearchParams().get("id") ?? "";
  const [person, setPerson] = useState<PersonInfo | null | undefined>(undefined);

  useEffect(() => {
    if (!id) return;
    sb()
      .from("profiles")
      .select("id,name,email,active")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => setPerson((data as PersonInfo | null) ?? null));
  }, [id]);

  if (!isLead(viewer.role)) return <NoAccess />;
  if (!id || person === null) {
    return (
      <div className="rounded-lg border border-light bg-white px-6 py-12 text-center">
        <h1 className="font-display text-lg font-semibold text-navy">Not found</h1>
        <p className="mt-1 text-sm text-charcoal">That person doesn&apos;t exist.</p>
        <Link href="/team/" className="mt-5 inline-block text-sm font-medium text-blue hover:underline">
          Back to Team Overview
        </Link>
      </div>
    );
  }
  if (person === undefined) return <p className="py-10 text-center text-sm text-charcoal/60">Loading…</p>;
  return <PersonView key={person.id} person={person} viewer={viewer} />;
}

export default function PersonPage() {
  return (
    <Suspense>
      <Person />
    </Suspense>
  );
}
