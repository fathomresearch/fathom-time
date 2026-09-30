"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/types";

export type ActionResult = { ok: boolean; message: string };

// Long enough to mean "until reactivated".
const BAN_FOREVER = "876000h"; // about 100 years

async function bossOrNull() {
  const me = await requireProfile();
  return me.role === "boss" ? me : null;
}

export async function setRole(userId: string, role: Role): Promise<ActionResult> {
  const me = await bossOrNull();
  if (!me) return { ok: false, message: "Only the boss can change roles." };
  if (userId === me.id) return { ok: false, message: "You can't change your own role." };
  if (!(role in ROLE_LABELS)) return { ok: false, message: "Unknown role." };

  const supabase = await createClient();
  // role_initialized so a first sign-in later can't overwrite this choice.
  const { error } = await supabase
    .from("profiles")
    .update({ role, role_initialized: true })
    .eq("id", userId);
  if (error) return { ok: false, message: "Couldn't change the role." };

  revalidatePath("/team");
  return { ok: true, message: `Role changed to ${ROLE_LABELS[role]}.` };
}

/**
 * Deactivate: stop their running timer, mark them inactive, and ban them in
 * Supabase Auth so they can't sign in at all. Reactivate undoes the last two.
 */
export async function setActive(userId: string, active: boolean): Promise<ActionResult> {
  const me = await bossOrNull();
  if (!me) return { ok: false, message: "Only the boss can do that." };
  if (userId === me.id) return { ok: false, message: "You can't deactivate yourself." };

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
