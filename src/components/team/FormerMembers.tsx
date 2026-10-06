"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Undo2, X } from "lucide-react";
import { sb } from "@/lib/supabase/browser";
import { toast } from "@/components/Toaster";
import { Avatar } from "@/components/team/bits";
import type { TeamPerson } from "@/components/team/useTeamWeek";
import { linkPerson, unlinkPerson } from "@/lib/teamActions";
import { fetchAll } from "@/lib/fetchAll";
import { suggestPerson, type Alias } from "@/lib/importMatch";
import { displayName } from "@/lib/people";
import { formatDateTime, formatHoursShort } from "@/lib/time";
import type { Role } from "@/lib/types";

type LinkRow = {
  id: string;
  from_user: string;
  to_user: string;
  entry_ids: string[];
  automatic: boolean;
  linked_at: string;
};

/**
 * People created by imports who can't sign in, with the names and emails
 * they used. The Director links one to a real account (their hours move
 * over) and can undo a link. Links on an exact email match happen at sign-in.
 */
export default function FormerMembers({
  people,
  viewerRole,
  tz,
  onChanged,
}: {
  people: TeamPerson[];
  viewerRole: Role;
  tz: string;
  onChanged: () => void;
}) {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [linking, setLinking] = useState<TeamPerson | null>(null);
  const isDirector = viewerRole === "director";

  const load = useCallback(async () => {
    const db = sb();
    const [a, l] = await Promise.all([
      db.from("person_aliases").select("user_id,source,kind,alias"),
      db
        .from("person_links")
        .select("id,from_user,to_user,entry_ids,automatic,linked_at")
        .is("undone_at", null)
        .order("linked_at", { ascending: false })
        .limit(20),
    ]);
    if (a.error || l.error) return; // migration 007 not run yet: show nothing extra
    setAliases(a.data as Alias[]);
    setLinks(l.data as LinkRow[]);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const former = people.filter((p) => !p.has_login && !p.merged_into);
  const signIn = people.filter((p) => p.has_login && !p.merged_into);
  const byId = new Map(people.map((p) => [p.id, p]));

  const suggestions = useMemo(() => {
    const m = new Map<string, string>();
    const candidates = signIn.map((p) => ({ ...p, has_login: true, merged_into: null }));
    for (const f of former) {
      const email = aliases.find((a) => a.user_id === f.id && a.kind === "email")?.alias ?? null;
      const s = suggestPerson({ name: f.name, email }, "clockify", candidates, []);
      if (s) m.set(f.id, s.id);
    }
    return m;
  }, [former, signIn, aliases]);

  if (!former.length && !links.length) return null;

  return (
    <div className="border-t-4 border-canvas">
      {former.length > 0 && (
        <>
          <p className="px-4 pb-1 pt-4 font-display text-sm font-semibold text-navy">Former members (no sign-in)</p>
          <p className="px-4 pb-2 text-xs text-charcoal/70">
            Created by imports. Their hours count everywhere, but they can&apos;t sign in. If one of them signs in, link
            them so their history moves to the new account. This happens automatically when they sign in with an email
            they used in Clockify or Jibble.
          </p>
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[240px]" />
              <col />
              <col className="w-[220px]" />
            </colgroup>
            <tbody>
              {former.map((f) => {
                const used = aliases.filter((a) => a.user_id === f.id).map((a) => a.alias);
                const hint = suggestions.get(f.id);
                return (
                  <tr key={f.id} className="border-t border-light">
                    <td className="px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={f.name} email={f.email} />
                        <span className="truncate font-medium text-charcoal">{displayName(f)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-charcoal/70">
                      <span className="block truncate" title={used.join(", ")}>
                        {used.length ? `Used: ${[...new Set(used)].join(", ")}` : "–"}
                      </span>
                      {hint && (
                        <span className="mt-0.5 inline-block rounded-full bg-[#FFF4DB] px-2 py-0.5 text-[11px] text-[#8A5D00]">
                          Possible match: {displayName(byId.get(hint))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {isDirector ? (
                        <button
                          type="button"
                          onClick={() => setLinking(f)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-light px-3 text-sm font-medium text-navy hover:bg-lightest"
                        >
                          <Link2 size={14} /> Link to account…
                        </button>
                      ) : (
                        <span className="text-xs text-charcoal/60">The Director can link</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {links.length > 0 && (
        <>
          <p className="px-4 pb-2 pt-4 font-display text-sm font-semibold text-navy">Recent links</p>
          <ul className="pb-2">
            {links.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 border-t border-light px-4 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-charcoal">
                  <strong className="font-medium">{displayName(byId.get(l.from_user))}</strong> →{" "}
                  <strong className="font-medium">{displayName(byId.get(l.to_user))}</strong>
                  <span className="text-charcoal/60">
                    {" "}
                    · {l.entry_ids.length} entries · {l.automatic ? "automatic (same email)" : "by the Director"} ·{" "}
                    {formatDateTime(new Date(l.linked_at), tz)}
                  </span>
                </span>
                {isDirector && (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await unlinkPerson(l.id);
                      toast(res.message, res.ok ? "info" : "error");
                      load();
                      onChanged();
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm text-charcoal/70 hover:bg-lightest hover:text-navy"
                  >
                    <Undo2 size={14} /> Undo link
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {linking && (
        <LinkDialog
          from={linking}
          signIn={signIn}
          suggested={suggestions.get(linking.id) ?? ""}
          onClose={() => setLinking(null)}
          onLinked={() => {
            setLinking(null);
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function LinkDialog({
  from,
  signIn,
  suggested,
  onClose,
  onLinked,
}: {
  from: TeamPerson;
  signIn: TeamPerson[];
  suggested: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [to, setTo] = useState(suggested);
  const [stats, setStats] = useState<{ count: number; seconds: number; first: string; last: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await fetchAll<{ start_at: string; end_at: string | null }>((a, b) =>
        sb().from("time_entries").select("start_at,end_at").eq("user_id", from.id).order("start_at").range(a, b)
      );
      if (!rows) return;
      const seconds = rows.reduce(
        (s, r) => s + (r.end_at ? (new Date(r.end_at).getTime() - new Date(r.start_at).getTime()) / 1000 : 0),
        0
      );
      setStats({
        count: rows.length,
        seconds,
        first: rows[0]?.start_at ?? "",
        last: rows[rows.length - 1]?.start_at ?? "",
      });
    })();
  }, [from.id]);

  const target = signIn.find((p) => p.id === to);
  const date = (iso: string) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Link to account"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <h2 className="font-display text-base font-semibold text-navy">Link {displayName(from)} to an account</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-charcoal/60 hover:bg-lightest"
          >
            <X size={16} />
          </button>
        </div>
        <label className="mt-4 grid gap-1 text-xs text-charcoal/70">
          Account (someone who signs in)
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-md border border-light bg-white px-2 text-sm text-charcoal focus:border-medium focus:outline-none"
          >
            <option value="">Choose a person…</option>
            {signIn.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)} ({p.email})
              </option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-sm text-charcoal">
          {stats === null
            ? "Counting their entries…"
            : stats.count === 0
              ? "They have no entries yet."
              : `${stats.count} entries · ${date(stats.first)} to ${date(stats.last)} · ${formatHoursShort(stats.seconds)}`}
          {target && stats && stats.count > 0 && (
            <>
              {" "}
              will move to <strong>{displayName(target)}</strong>.
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-charcoal/60">You can undo this from Recent links.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md px-4 text-sm text-charcoal hover:bg-lightest"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!to || busy}
            onClick={async () => {
              setBusy(true);
              const res = await linkPerson(from.id, to);
              setBusy(false);
              toast(res.message, res.ok ? "info" : "error");
              if (res.ok) onLinked();
            }}
            className="h-9 rounded-md bg-teal px-4 font-display text-sm font-semibold text-navy disabled:opacity-60"
          >
            {busy ? "Linking…" : "Link"}
          </button>
        </div>
      </div>
    </div>
  );
}
