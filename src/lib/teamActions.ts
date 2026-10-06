"use client";

// Changes to people (roles, access, former members, links). These used to
// be server actions; the database enforces the same rules either way.

import { sb } from "@/lib/supabase/browser";
import { ROLE_LABELS, type Role } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

/** A database rule's message (written for people), or a fallback. */
const reason = (error: { code?: string; message: string } | null, fallback: string) =>
  error?.code === "P0001" ? error.message : fallback;

/** Only the Director changes roles, and only between Manager and Analyst. */
export async function setRole(userId: string, role: Role): Promise<ActionResult> {
  if (role !== "manager" && role !== "analyst") return { ok: false, message: "Choose Manager or Analyst." };
  const { data, error } = await sb().from("profiles").update({ role }).eq("id", userId).select("id");
  if (error) return { ok: false, message: reason(error, "Couldn't change the role.") };
  if (!data?.length) return { ok: false, message: "Only the Director can change roles." };
  return { ok: true, message: `Role changed to ${ROLE_LABELS[role]}.` };
}

/**
 * The Director can deactivate anyone but themselves; a Manager only
 * Analysts. Deactivating stops their running timer; deactivated people are
 * signed out and see nothing.
 */
export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const { error } = await sb().rpc("set_person_active", { p_user: userId, p_active: active });
  if (error) return { ok: false, message: reason(error, active ? "Couldn't reactivate." : "Couldn't deactivate.") };
  return { ok: true, message: active ? "Reactivated." : "Deactivated." };
}

export type FormerMemberInput = {
  name: string;
  aliases: { source: "clockify" | "jibble"; kind: "name" | "email"; alias: string }[];
};

/** People in an import who never sign in (no sign-in record, deactivated). */
export async function createFormerMembers(
  people: FormerMemberInput[]
): Promise<ActionResult & { ids: string[] }> {
  const ids: string[] = [];
  for (const person of people) {
    const { data, error } = await sb().rpc("create_former_member", {
      p_name: person.name,
      p_aliases: person.aliases,
    });
    if (error) return { ok: false, message: reason(error, `Couldn't create ${person.name}.`), ids };
    ids.push(data as string);
  }
  return { ok: true, message: `Added ${ids.length} former ${ids.length === 1 ? "member" : "members"}.`, ids };
}

/** Moves a former member's history to a real account (Director only). */
export async function linkPerson(fromId: string, toId: string): Promise<ActionResult> {
  const { error } = await sb().rpc("link_person", { p_from: fromId, p_to: toId, p_auto: false });
  if (error) return { ok: false, message: reason(error, "Couldn't link them.") };
  return { ok: true, message: "Linked. Their imported hours now belong to that account." };
}

export async function unlinkPerson(linkId: string): Promise<ActionResult> {
  const { error } = await sb().rpc("unlink_person", { p_link: linkId });
  if (error) return { ok: false, message: reason(error, "Couldn't undo that link.") };
  return { ok: true, message: "Link undone." };
}
