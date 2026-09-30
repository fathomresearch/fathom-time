import "server-only";

export const DEFAULT_TIMEZONE =
  process.env.DEFAULT_TIMEZONE || "America/Chicago";

export function bossEmails(): string[] {
  return (process.env.BOSS_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Blank means anyone with a Google account can sign in.
export function allowedDomain(): string {
  return (process.env.ALLOWED_EMAIL_DOMAIN || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "");
}

export function isAllowedEmail(email: string): boolean {
  const domain = allowedDomain();
  if (!domain) return true;
  return email.toLowerCase().endsWith("@" + domain);
}

export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
