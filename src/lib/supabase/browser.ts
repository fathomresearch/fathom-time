"use client";
import { createClient } from "@/lib/supabase/client";

let client: ReturnType<typeof createClient> | null = null;

// One shared browser client for the whole app.
export function sb() {
  if (!client) client = createClient();
  return client;
}
