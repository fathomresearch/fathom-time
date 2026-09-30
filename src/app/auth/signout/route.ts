import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const supabase = await createClient();
  await supabase.auth.signOut();
  const target = new URL("/login", url.origin);
  if (error) target.searchParams.set("error", error);
  return NextResponse.redirect(target, { status: 303 });
}

// POST: the sign-out button. GET: the app sends people here when their
// account is deactivated or missing.
export const POST = signOut;
export const GET = signOut;
