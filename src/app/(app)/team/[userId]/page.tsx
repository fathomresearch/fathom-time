import { notFound } from "next/navigation";
import NoAccess from "@/components/NoAccess";
import PersonView from "@/components/team/PersonView";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PersonPage({
  params,
}: PageProps<"/team/[userId]">) {
  const profile = await requireProfile();
  if (profile.role !== "boss") return <NoAccess />;
  const { userId } = await params;

  const supabase = await createClient();
  const { data: person } = await supabase
    .from("profiles")
    .select("id,name,email,active")
    .eq("id", userId)
    .maybeSingle();
  if (!person) notFound();

  return (
    <PersonView
      person={person}
      viewer={{ id: profile.id, role: profile.role, timezone: profile.timezone }}
    />
  );
}
