import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bossEmails, isAllowedEmail, isValidTimezone } from "@/lib/config";

// Google sends people here after they pick an account.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const browserTz = url.searchParams.get("tz");
  const toLogin = (error: string) =>
    NextResponse.redirect(new URL(`/login?error=${error}`, url.origin));

  // Deactivated people are also banned in Supabase Auth, which sends them
  // back here with an error instead of a code.
  const authError = `${url.searchParams.get("error_code") ?? ""} ${url.searchParams.get("error_description") ?? ""}`;
  if (/banned/i.test(authError)) return toLogin("deactivated");
  if (!code) return toLogin("cancelled");

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError?.code === "user_banned") return toLogin("deactivated");
  if (exchangeError) return toLogin("failed");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return toLogin("failed");

  const admin = createAdminClient();
  if (!admin) {
    await supabase.auth.signOut();
    return toLogin("config");
  }

  const email = user.email.toLowerCase();

  // Only used if ALLOWED_EMAIL_DOMAIN is set in .env.local.
  if (!isAllowedEmail(email)) {
    await supabase.auth.signOut();
    const { data: existing } = await admin
      .from("profiles")
      .select("role_initialized")
      .eq("id", user.id)
      .maybeSingle();
    if (!existing?.role_initialized) {
      await admin.auth.admin.deleteUser(user.id);
    }
    return toLogin("domain");
  }

  // The database normally creates the profile on sign-up.
  // This covers accounts that existed before the database was set up.
  let { data: profile } = await admin
    .from("profiles")
    .select("id, active, role_initialized, timezone")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const meta = user.user_metadata ?? {};
    const { data: created } = await admin
      .from("profiles")
      .insert({
        id: user.id,
        email,
        name: meta.full_name || meta.name || email.split("@")[0],
      })
      .select("id, active, role_initialized, timezone")
      .single();
    profile = created;
  }

  if (!profile) {
    await supabase.auth.signOut();
    return toLogin("failed");
  }

  if (!profile.active) {
    await supabase.auth.signOut();
    return toLogin("deactivated");
  }

  // First sign-in: decide boss or employee, and use the browser's time zone.
  if (!profile.role_initialized) {
    await admin
      .from("profiles")
      .update({
        role: bossEmails().includes(email) ? "director" : "analyst",
        role_initialized: true,
        timezone: isValidTimezone(browserTz) ? browserTz : profile.timezone,
      })
      .eq("id", user.id);
  }

  return NextResponse.redirect(new URL("/tracker", url.origin));
}
