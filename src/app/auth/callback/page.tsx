"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { sb } from "@/lib/supabase/browser";

/**
 * Google sends people here after they pick an account. The Supabase client
 * finishes the sign-in in the browser; finish_sign_in() then does the
 * first-sign-in setup (role, time zone) and links any former-member record
 * with the same email.
 */
function Callback() {
  const params = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const toLogin = (error: string) => window.location.replace(`/login/?error=${error}`);
    (async () => {
      const authError = `${params.get("error_code") ?? ""} ${params.get("error_description") ?? ""}`;
      if (params.get("error")) return toLogin(/banned/i.test(authError) ? "deactivated" : "cancelled");

      const db = sb();
      // The client signs in from the ?code= in the address by itself; if it
      // hasn't, finish it here.
      let { data } = await db.auth.getSession();
      const code = params.get("code");
      if (!data.session && code) {
        const { error } = await db.auth.exchangeCodeForSession(code);
        if (error) return toLogin("failed");
        data = (await db.auth.getSession()).data;
      }
      if (!data.session) return toLogin(code ? "failed" : "cancelled");

      const { data: rows, error } = await db.rpc("finish_sign_in", { p_tz: params.get("tz") });
      const me = (rows as { active: boolean; role: string }[] | null)?.[0];
      if (error || !me) {
        await db.auth.signOut();
        return toLogin("no_profile");
      }
      if (!me.active) {
        await db.auth.signOut();
        return toLogin("deactivated");
      }
      window.location.replace("/tracker/");
    })();
  }, [params]);

  return <p className="flex min-h-screen items-center justify-center text-sm text-charcoal/60">Signing you in…</p>;
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
