"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { sb } from "@/lib/supabase/browser";
import type { Profile } from "@/lib/types";
import type { Viewer } from "@/components/tracker/TimeTracker";

type Session = {
  profile: Profile;
  viewer: Viewer;
  reloadProfile: () => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

/** Signs out and goes to the login page (optionally with a message key). */
export async function signOut(error?: string) {
  await sb().auth.signOut();
  window.location.replace(`/login/${error ? `?error=${error}` : ""}`);
}

/**
 * The signed-in person, for every page inside the app. Replaces the server
 * check: no session → login page; deactivated → signed out with a message.
 * The data itself is protected by the database's row-level security.
 */
export function SessionProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const db = sb();
    const { data } = await db.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      router.replace("/login/");
      return;
    }
    const { data: row } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!row) return signOut("no_profile");
    if (!row.active) return signOut("deactivated");
    setProfile(row as Profile);
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const { data } = sb().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") router.replace("/login/");
    });
    return () => data.subscription.unsubscribe();
  }, [load, router]);

  if (!profile) return <>{fallback}</>;
  const viewer: Viewer = { id: profile.id, role: profile.role, timezone: profile.timezone };
  return (
    <SessionContext.Provider value={{ profile, viewer, reloadProfile: load }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}
