import "server-only";
import { createClient } from "@supabase/supabase-js";

// Full-access client using the secret key. Server only.
// Used for sign-in bookkeeping (Director on first sign-in, deactivation bans).
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
