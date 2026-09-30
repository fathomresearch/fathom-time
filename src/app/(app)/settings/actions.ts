"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { isValidTimezone } from "@/lib/config";

export type ProfileFormState = { ok: boolean; message: string } | null;

export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const profile = await requireProfile();
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "");

  if (!name) return { ok: false, message: "Enter your name." };
  if (name.length > 80) return { ok: false, message: "Keep your name under 80 characters." };
  if (!isValidTimezone(timezone)) return { ok: false, message: "Pick a time zone from the list." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ name, timezone })
    .eq("id", profile.id);

  if (error) return { ok: false, message: "Couldn't save. Try again." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
