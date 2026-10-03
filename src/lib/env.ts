import "server-only";
import { allowedDomain, bossEmails, DEFAULT_TIMEZONE } from "@/lib/config";

export type SetupItem = {
  label: string;
  ok: boolean;
  detail: string;
  optional?: boolean;
};

export async function checkSetup(): Promise<SetupItem[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const items: SetupItem[] = [
    {
      label: "Supabase URL",
      ok: !!url && url.startsWith("https://"),
      detail: url ? url : "NEXT_PUBLIC_SUPABASE_URL is empty",
    },
    {
      label: "Supabase public key",
      ok: !!key,
      detail: key ? `${key.slice(0, 14)}…` : "NEXT_PUBLIC_SUPABASE_ANON_KEY is empty",
    },
  ];

  let connection: SetupItem = {
    label: "Supabase connection",
    ok: false,
    detail: "Skipped until the URL and key are set",
  };
  if (url && key) {
    try {
      const res = await fetch(`${url}/auth/v1/health`, {
        headers: { apikey: key },
        cache: "no-store",
      });
      connection = {
        label: "Supabase connection",
        ok: res.ok,
        detail: res.ok
          ? "Connected"
          : `Supabase answered ${res.status}. Check that the key belongs to this project.`,
      };
    } catch {
      connection = {
        label: "Supabase connection",
        ok: false,
        detail: "Could not reach the URL. Check for typos.",
      };
    }
  }
  items.push(connection);

  const bosses = bossEmails();
  const domain = allowedDomain();
  items.push(
    {
      label: "Secret key",
      ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      detail: process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "Set"
        : "SUPABASE_SERVICE_ROLE_KEY is empty. Sign-in needs it.",
    },
    {
      label: "Director emails (BOSS_EMAILS)",
      ok: bosses.length > 0,
      detail: bosses.length ? bosses.join(", ") : "BOSS_EMAILS is empty",
    },
    {
      label: "Who can sign in",
      ok: true,
      detail: domain
        ? `Only @${domain} accounts`
        : "Anyone with a Google account (ALLOWED_EMAIL_DOMAIN is blank)",
    },
    {
      label: "Default time zone",
      ok: true,
      detail: DEFAULT_TIMEZONE,
    }
  );
  return items;
}
