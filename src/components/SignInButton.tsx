"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SignInButton() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setBusy(true);
    setFailed(false);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback/?tz=${encodeURIComponent(tz)}`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="mt-8 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-light bg-white font-display text-sm font-semibold text-navy transition-colors hover:border-medium hover:bg-lightest disabled:cursor-wait disabled:opacity-70"
      >
        {busy && <LoaderCircle size={16} className="animate-spin" />}
        {busy ? "Opening Google…" : "Sign in with Google"}
      </button>
      {failed && (
        <p className="mt-3 text-sm text-danger">
          Google sign-in is not turned on in Supabase yet. Check the Google
          provider settings.
        </p>
      )}
    </>
  );
}
