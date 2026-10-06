"use client";

import { useMemo, useState } from "react";
import { toast } from "@/components/Toaster";
import { createFormerMembers, type FormerMemberInput } from "@/lib/teamActions";
import { suggestPerson, type Alias, type Suggestion } from "@/lib/importMatch";
import type { ParseResult } from "@/lib/importParse";
import { formatHoursShort } from "@/lib/time";
import type { useImportData } from "@/components/import/useImportData";

const CREATE = "__create";

type FilePerson = { key: string; name: string; email: string | null; entries: number; seconds: number };

/**
 * Step 2: who each person in the file is. Each row starts on the best match:
 * a remembered or exact match (green), a suggestion to check (yellow), or
 * "Create as former member" when nothing fits.
 */
export default function PeopleStep({
  parsed,
  data,
  onDone,
}: {
  parsed: ParseResult;
  data: ReturnType<typeof useImportData>;
  onDone: () => void;
}) {
  const filePeople = useMemo(() => {
    const map = new Map<string, FilePerson>();
    for (const e of parsed.entries) {
      const p = map.get(e.personKey) ?? {
        key: e.personKey,
        name: e.personName,
        email: e.personEmail,
        entries: 0,
        seconds: 0,
      };
      p.entries += 1;
      p.seconds += e.seconds;
      map.set(e.personKey, p);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [parsed]);

  const suggestions = useMemo(() => {
    const m = new Map<string, Suggestion | null>();
    for (const p of filePeople) m.set(p.key, suggestPerson(p, parsed.source, data.people, data.aliases));
    return m;
  }, [filePeople, parsed.source, data.people, data.aliases]);

  const [choice, setChoice] = useState<Map<string, string>>(
    () => new Map(filePeople.map((p) => [p.key, suggestions.get(p.key)?.id ?? CREATE]))
  );
  const [saving, setSaving] = useState(false);

  const live = data.people.filter((p) => !p.merged_into);
  const signIn = live.filter((p) => p.has_login);
  const former = live.filter((p) => !p.has_login);

  const aliasesFor = (p: FilePerson): FormerMemberInput["aliases"] => [
    { source: parsed.source, kind: "name", alias: p.name.trim().toLowerCase() },
    ...(p.email ? [{ source: parsed.source, kind: "email" as const, alias: p.email.toLowerCase() }] : []),
  ];

  const save = async () => {
    setSaving(true);
    try {
      const toCreate = filePeople.filter((p) => choice.get(p.key) === CREATE);
      const existing: Alias[] = filePeople
        .filter((p) => choice.get(p.key) && choice.get(p.key) !== CREATE)
        .flatMap((p) => aliasesFor(p).map((a) => ({ ...a, user_id: choice.get(p.key)! })));
      if (!(await data.saveAliases(existing))) return;
      if (toCreate.length) {
        const res = await createFormerMembers(toCreate.map((p) => ({ name: p.name, aliases: aliasesFor(p) })));
        if (!res.ok) return toast(res.message);
      }
      await data.reload();
      toast("People matched.", "info");
      onDone();
    } finally {
      setSaving(false);
    }
  };

  const badge = (s: Suggestion | null | undefined, chosen: string) => {
    if (chosen === CREATE) return <span className="text-xs text-charcoal/60">New former member</span>;
    if (s && s.id === chosen)
      return (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            s.confident ? "bg-[#E3F7EE] text-[#1B7F52]" : "bg-[#FFF4DB] text-[#8A5D00]"
          }`}
        >
          {s.confident ? s.reason : `${s.reason}: check`}
        </span>
      );
    return <span className="text-xs text-charcoal/60">Chosen by you</span>;
  };

  return (
    <div>
      <p className="border-b border-light px-5 py-3 text-sm text-charcoal">
        Who is each person in the file? Each person is listed once, however many entries they have. Green matches are
        certain; check the yellow ones. Your choices are remembered, so future imports match them automatically. People
        with no match become
        <strong> former members</strong>: they can&apos;t sign in, but their hours count. If one of them signs in later,
        the Director can link them in Manage team.
      </p>
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col />
          <col className="w-[260px]" />
          <col className="w-[90px]" />
          <col className="w-[260px]" />
          <col className="w-[160px]" />
        </colgroup>
        <thead>
          <tr className="border-b border-light text-left font-display text-xs font-semibold text-charcoal/70">
            <th className="px-5 py-2.5">Name in file</th>
            <th className="py-2.5">Email in file</th>
            <th className="py-2.5 pr-4 text-right">Hours</th>
            <th className="py-2.5">Fathom Time person</th>
            <th className="py-2.5" />
          </tr>
        </thead>
        <tbody>
          {filePeople.map((p) => {
            const chosen = choice.get(p.key) ?? CREATE;
            return (
              <tr key={p.key} className="border-b border-light last:border-0">
                <td className="truncate px-5 py-2 font-medium text-navy">{p.name}</td>
                <td className="truncate py-2 pr-3 text-charcoal/80">{p.email ?? "–"}</td>
                <td className="tabular py-2 pr-4 text-right text-charcoal">
                  {formatHoursShort(p.seconds)}
                  <span className="block text-[11px] text-charcoal/60">{p.entries} entries</span>
                </td>
                <td className="py-2 pr-3">
                  <select
                    value={chosen}
                    onChange={(e) => setChoice((c) => new Map(c).set(p.key, e.target.value))}
                    aria-label={`Fathom Time person for ${p.name}`}
                    className="h-9 w-full rounded-md border border-light bg-white px-2 text-sm text-charcoal focus:border-medium focus:outline-none"
                  >
                    <option value={CREATE}>Create as former member (no sign-in)</option>
                    <optgroup label="People who sign in">
                      {signIn.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name || x.email}
                        </option>
                      ))}
                    </optgroup>
                    {former.length > 0 && (
                      <optgroup label="Former members">
                        {former.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </td>
                <td className="py-2 pr-5">{badge(suggestions.get(p.key), chosen)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex justify-end border-t border-light px-5 py-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save people and continue"}
        </button>
      </div>
    </div>
  );
}
