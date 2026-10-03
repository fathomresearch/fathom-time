// Suggestions for matching names in an import file to Fathom Time records.
// Only exact matches (or ones chosen before) are "confident"; anything else
// is a suggestion the person confirms.

import type { ImportSource } from "@/lib/importParse";

export type Suggestion = { id: string; reason: string; confident: boolean };

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const words = (s: string) => norm(s).split(" ").filter(Boolean);

export type MatchPerson = { id: string; name: string; email: string; has_login: boolean; merged_into: string | null };
export type Alias = { user_id: string; source: ImportSource; kind: "name" | "email"; alias: string };

/** Who in Fathom Time a person in the file is, best guess first. */
export function suggestPerson(
  file: { name: string; email: string | null },
  source: ImportSource,
  people: MatchPerson[],
  aliases: Alias[]
): Suggestion | null {
  const live = people.filter((p) => !p.merged_into);
  const byId = new Map(live.map((p) => [p.id, p]));
  const email = file.email?.toLowerCase() ?? null;
  const name = file.name.trim().toLowerCase();

  // Chosen before for this source, or the same email anywhere.
  const before = aliases.find(
    (a) => a.source === source && ((a.kind === "email" && a.alias === email) || (a.kind === "name" && a.alias === name))
  );
  if (before && byId.has(before.user_id)) return { id: before.user_id, reason: "Matched before", confident: true };
  if (email) {
    const sameEmail = aliases.find((a) => a.kind === "email" && a.alias === email && byId.has(a.user_id));
    if (sameEmail) return { id: sameEmail.user_id, reason: "Same email in another import", confident: true };
    const profile = live.find((p) => p.email.toLowerCase() === email);
    if (profile) return { id: profile.id, reason: "Same email", confident: true };
  }

  const fileWords = words(file.name);
  const exact = live.filter((p) => norm(p.name) === norm(file.name));
  if (exact.length === 1) return { id: exact[0].id, reason: "Same name", confident: true };

  // Weaker clues: first + last initial ("Tom C"), first name only, or the
  // surname inside an email ("pganesh6344" ~ "Ganesh").
  const scored = live
    .map((p) => {
      const pw = words(p.name);
      if (!pw.length || !fileWords.length) return { p, score: 0 };
      let score = 0;
      const sameFirst = fileWords[0] === pw[0];
      if (fileWords.length === 1) {
        // One word: a first name ("Preeti") or a username ("pganesh6344").
        if (sameFirst) score += 2;
        const local = (email?.split("@")[0] ?? fileWords[0]).replace(/[^a-z]/g, "");
        const surname = pw.length > 1 ? pw[pw.length - 1] : "";
        if (surname.length >= 4 && local.includes(surname)) score += 2;
      } else if (sameFirst) {
        // First and last: the first names must agree; then the surname or its initial.
        score += 2;
        const fl = fileWords[fileWords.length - 1];
        const pl = pw[pw.length - 1];
        if (fl === pl) score += 2;
        else if (fl.length === 1 && pl.startsWith(fl)) score += 1;
      }
      return { p, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (scored.length && (scored.length === 1 || scored[0].score > scored[1].score)) {
    return { id: scored[0].p.id, reason: "Similar name", confident: false };
  }
  return null;
}

/** Best existing record for a client / project / task name, among `options`. */
export function suggestName(name: string, options: { id: string; name: string }[]): Suggestion | null {
  const n = norm(name);
  if (!n) return null;
  const exact = options.filter((o) => norm(o.name) === n);
  if (exact.length) return { id: exact[0].id, reason: "Same name", confident: true };
  const fw = new Set(words(name));
  let best: { id: string; score: number } | null = null;
  for (const o of options) {
    const on = norm(o.name);
    const ow = new Set(words(o.name));
    const shared = [...fw].filter((w) => ow.has(w)).length;
    const score = Math.max(
      shared / Math.max(1, new Set([...fw, ...ow]).size),
      on.includes(n) || n.includes(on) ? 0.6 : 0
    );
    if (score >= 0.5 && (!best || score > best.score)) best = { id: o.id, score };
  }
  return best ? { id: best.id, reason: "Similar name", confident: false } : null;
}

/** Keys for remembered matches (import_mappings.source_key). */
export const mapKey = {
  client: (client: string) => norm(client),
  project: (client: string, project: string) => `${norm(client)}|${norm(project)}`,
  task: (client: string, project: string, task: string) => `${norm(client)}|${norm(project)}|${norm(task)}`,
};
