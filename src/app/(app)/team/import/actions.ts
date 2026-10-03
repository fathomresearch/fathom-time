"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { isLead } from "@/lib/types";

export type FormerMemberInput = {
  name: string;
  aliases: { source: "clockify" | "jibble"; kind: "name" | "email"; alias: string }[];
};

/**
 * Creates people who appear in an import but never sign in (former members).
 * Each gets a sign-in record with a placeholder address nobody can use, so
 * the database's usual rules apply; the profile is marked has_login = false
 * and deactivated, so they stay out of pickers and team lists.
 */
export async function createFormerMembers(
  people: FormerMemberInput[]
): Promise<{ ok: boolean; message: string; ids: string[] }> {
  const me = await requireProfile();
  if (!isLead(me.role)) return { ok: false, message: "Only the Director and Managers can import.", ids: [] };
  const admin = createAdminClient();
  if (!admin) return { ok: false, message: "The server's secret key is missing.", ids: [] };

  const ids: string[] = [];
  for (const person of people) {
    const name = person.name.trim().slice(0, 80);
    if (!name) continue;
    const { data, error } = await admin.auth.admin.createUser({
      email: `former+${randomUUID().slice(0, 12)}@noreply.fathomresearch.ai`,
      email_confirm: true,
      user_metadata: { full_name: name },
    });
    if (error || !data.user) return { ok: false, message: `Couldn't create ${name}.`, ids };
    const id = data.user.id;
    const { error: pErr } = await admin
      .from("profiles")
      .update({ name, role: "analyst", active: false, has_login: false, role_initialized: true })
      .eq("id", id);
    if (pErr) return { ok: false, message: `Couldn't set up ${name}.`, ids };
    if (person.aliases.length) {
      const { error: aErr } = await admin
        .from("person_aliases")
        .upsert(
          person.aliases.map((a) => ({ ...a, alias: a.alias.trim().toLowerCase(), user_id: id })),
          { onConflict: "source,kind,alias" }
        );
      if (aErr) return { ok: false, message: `Couldn't save the names used by ${name}.`, ids };
    }
    ids.push(id);
  }
  revalidatePath("/team");
  return { ok: true, message: `Added ${ids.length} former ${ids.length === 1 ? "member" : "members"}.`, ids };
}

/** Moves a former member's history to a real account (Director only). */
export async function linkPerson(fromId: string, toId: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireProfile();
  if (me.role !== "director") return { ok: false, message: "Only the Director can link people." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_person", { p_from: fromId, p_to: toId, p_auto: false });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Couldn't link them." };
  revalidatePath("/team");
  return { ok: true, message: "Linked. Their imported hours now belong to that account." };
}

export async function unlinkPerson(linkId: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireProfile();
  if (me.role !== "director") return { ok: false, message: "Only the Director can undo a link." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlink_person", { p_link: linkId });
  if (error) return { ok: false, message: error.code === "P0001" ? error.message : "Couldn't undo that link." };
  revalidatePath("/team");
  return { ok: true, message: "Link undone." };
}
