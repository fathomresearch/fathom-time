"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

// Long enough to mean "until reactivated".
const BAN_FOREVER = "876000h"; // about 100 years

async function targetRole(userId: string): Promise<Role | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data?.role as Role | undefined) ?? null;
}

/**
 * Only the Director changes roles, and only between Manager and Analyst.
 * The Director role itself is fixed. The database enforces the same rules.
 */
export async function setRole(userId: string, role: Role): Promise<ActionResult> {
  const me = await requireProfile();
  if (me.role !== "director") return { ok: false, message: "Only the Director can change roles." };
  if (userId === me.id) return { ok: false, message: "You can't change your own role." };
  if (role !== "manager" && role !== "analyst") return { ok: false, message: "Choose Manager or Analyst." };
  const current = await targetRole(userId);
  if (!current) return { ok: false, message: "That person wasn't found." };
  if (current === "director") return { ok: false, message: "The Director's role can't be changed." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, message: "Couldn't change the role." };

  revalidatePath("/team");
  return { ok: true, message: `Role changed to ${ROLE_LABELS[role]}.` };
}

/**
 * The Director can deactivate anyone but themselves; a Manager only Analysts.
 * Deactivating stops their running timer, marks them inactive and bans them
 * in Supabase Auth so they can't sign in. Reactivating undoes the last two.
 */
export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const me = await requireProfile();
  if (userId === me.id) return { ok: false, message: "You can't deactivate yourself." };
  const current = await targetRole(userId);
  if (!current) return { ok: false, message: "That person wasn't found." };
  if (current === "director") return { ok: false, message: "The Director can't be deactivated." };
  const allowed = me.role === "director" || (me.role === "manager" && current === "analyst");
  if (!allowed) return { ok: false, message: "You can't change this person's access." };

  const supabase = await createClient();
  if (!active) {
    const { error } = await supabase
      .from("time_entries")
      .update({ end_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("end_at", null);
    if (error) return { ok: false, message: "Couldn't stop their running timer, so nothing changed." };
  }

  const { error } = await supabase.from("profiles").update({ active }).eq("id", userId);
  if (error) return { ok: false, message: active ? "Couldn't reactivate." : "Couldn't deactivate." };
  revalidatePath("/team");

  const admin = createAdminClient();
  const ban = admin
    ? await admin.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : BAN_FOREVER })
    : null;
  if (!ban || ban.error) {
    return {
      ok: true,
      message: active
        ? "Reactivated, but their sign-in ban couldn't be lifted. Try again."
        : "Deactivated. Their sign-in couldn't be blocked in Supabase, but the app still keeps them out.",
    };
  }
  return { ok: true, message: active ? "Reactivated." : "Deactivated." };
}
