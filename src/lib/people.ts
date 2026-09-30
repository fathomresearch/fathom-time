// Small helpers for showing people. Safe on the server and in the browser.

export function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function displayName(p: { name: string; email: string } | undefined): string {
  return p ? p.name.trim() || p.email : "Unknown";
}
