"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, LiveStatus } from "@/components/team/bits";
import type { TeamPerson } from "@/components/team/useTeamWeek";
import type { Catalog } from "@/lib/useCatalog";
import type { Entry } from "@/lib/data";
import type { PersonWeek } from "@/lib/report";
import { displayName } from "@/lib/people";
import { addDays, formatHoursShort, shortDate, weekday } from "@/lib/time";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hoursOrDash = (secs: number) => (secs > 0 ? formatHoursShort(secs) : "–");

export default function ByPerson({
  people,
  byPerson,
  running,
  catalog,
  weekKey,
  todayKey,
}: {
  people: TeamPerson[];
  byPerson: Map<string, PersonWeek>;
  running: Map<string, Entry>;
  catalog: Catalog;
  weekKey: string;
  todayKey: string;
}) {
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
  // Active people always; deactivated people only if they have time this week.
  const rows = people
    .filter((p) => p.active || byPerson.has(p.id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  const dayTotals = days.map((_, i) => rows.reduce((s, p) => s + (byPerson.get(p.id)?.days[i] ?? 0), 0));
  const total = rows.reduce((s, p) => s + (byPerson.get(p.id)?.total ?? 0), 0);
  const billable = rows.reduce((s, p) => s + (byPerson.get(p.id)?.billable ?? 0), 0);

  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <colgroup>
        <col />
        {days.map((d) => (
          <col key={d} className="w-[64px]" />
        ))}
        <col className="w-[76px]" />
        <col className="w-[84px]" />
      </colgroup>
      <thead>
        <tr className="border-b border-light">
          <th className="px-4 py-2.5 text-left font-display text-xs font-semibold text-charcoal/70">Person</th>
          {days.map((d) => {
            const weekend = weekday(d) === 0 || weekday(d) === 6;
            const today = d === todayKey;
            return (
              <th key={d} className={`px-1 py-2 text-center font-normal ${weekend ? "bg-canvas" : ""} ${today ? "text-blue" : "text-charcoal/70"}`}>
                <span className={`block font-display text-xs font-semibold ${today ? "" : "text-navy"}`}>{DAY_NAMES[weekday(d)]}</span>
                <span className="block text-xs">{shortDate(d)}</span>
              </th>
            );
          })}
          <th className="px-2 py-2.5 text-right font-display text-xs font-semibold text-charcoal/70">Total</th>
          <th className="px-4 py-2.5 text-right font-display text-xs font-semibold text-charcoal/70">Billable</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={10} className="px-4 py-10 text-center text-charcoal/70">
              No one has signed in yet.
            </td>
          </tr>
        )}
        {rows.map((p) => {
          const week = byPerson.get(p.id);
          const run = running.get(p.id);
          return (
            <tr
              key={p.id}
              onClick={() => router.push(`/team/${p.id}`)}
              className="cursor-pointer border-b border-light hover:bg-canvas/60"
            >
              <td className="px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={p.name} email={p.email} running={!!run} />
                  <div className="min-w-0">
                    <Link
                      href={`/team/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-medium text-navy hover:underline"
                    >
                      {displayName(p)}
                      {!p.active && (
                        <span className="ml-1.5 text-xs font-normal text-charcoal/60">
                          {p.has_login ? "(deactivated)" : "(former member)"}
                        </span>
                      )}
                    </Link>
                    <div className="text-xs">
                      <LiveStatus running={run} catalog={catalog} />
                    </div>
                  </div>
                </div>
              </td>
              {days.map((d, i) => (
                <td key={d} className={`tabular px-1 py-2.5 text-center ${i === 0 || i === 6 ? "bg-canvas" : ""} ${week?.days[i] ? "text-navy" : "text-medium"}`}>
                  {hoursOrDash(week?.days[i] ?? 0)}
                </td>
              ))}
              <td className="tabular px-2 py-2.5 text-right font-semibold text-navy">{hoursOrDash(week?.total ?? 0)}</td>
              <td className="tabular px-4 py-2.5 text-right text-charcoal">{hoursOrDash(week?.billable ?? 0)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="[&>td]:bg-lightest/60">
          <td className="rounded-bl-lg px-4 py-2.5 font-display text-xs font-semibold text-navy">Total</td>
          {dayTotals.map((t, i) => (
            <td key={days[i]} className="tabular px-1 py-2.5 text-center font-semibold text-navy">
              {hoursOrDash(t)}
            </td>
          ))}
          <td className="tabular px-2 py-2.5 text-right font-semibold text-navy">{formatHoursShort(total)}</td>
          <td className="tabular rounded-br-lg px-4 py-2.5 text-right font-semibold text-navy">{formatHoursShort(billable)}</td>
        </tr>
      </tfoot>
    </table>
  );
}
