// Reading Clockify and Jibble exports into one shape. Pure functions; the
// rows come from SheetJS (each row an object keyed by the header text).

import { dayKey, zonedToDate } from "@/lib/time";

export type ImportSource = "clockify" | "jibble";

export type RawEntry = {
  source: ImportSource;
  /** Who, as the file names them. personKey is the email (Clockify) or the name (Jibble), lowercased. */
  personKey: string;
  personName: string;
  personEmail: string | null;
  client: string;
  project: string;
  task: string;
  description: string;
  /** null: use the project's default when importing. */
  billable: boolean | null;
  /** Day the entry counts on (in tz). */
  date: string;
  /** ISO times. null for Jibble "Hours" entries, which have only a length. */
  start: string | null;
  end: string | null;
  seconds: number;
  tz: string;
  /** Stable identity, so re-importing the same file finds the same entries. */
  sourceKey: string;
};

export type ParseResult = { source: ImportSource; entries: RawEntry[]; problems: string[] };

type Row = Record<string, unknown>;
const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Clockify detailed report or Jibble raw time entries, from the column names. */
export function detectSource(headers: string[]): ImportSource | null {
  const h = new Set(headers.map((x) => x.trim().toLowerCase()));
  if (h.has("start date") && h.has("start time") && h.has("end time") && h.has("user")) return "clockify";
  if (h.has("full name") && h.has("entrytype") && h.has("duration")) return "jibble";
  return null;
}

/** "12/23/2025" -> {y, m, d}; also accepts "2025-12-23". */
function parseDate(s: string) {
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { y: +m[3], m: +m[1], d: +m[2] };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  return null;
}

/** "02:40:27 PM", "2:40 PM", "14:40" -> {h, mi, s}. */
function parseClock(s: string) {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = +m[1];
  const ap = m[4]?.toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return { h, mi: +m[2], s: m[3] ? +m[3] : 0 };
}

function at(date: string, clock: string, tz: string): Date | null {
  const d = parseDate(date);
  const c = parseClock(clock);
  if (!d || !c) return null;
  return zonedToDate(d.y, d.m, d.d, c.h, c.mi, tz, c.s);
}

/** Makes repeated keys unique ("…#2") so identical rows stay separate entries. */
function uniqueKeys(entries: RawEntry[]) {
  const seen = new Map<string, number>();
  for (const e of entries) {
    const n = (seen.get(e.sourceKey) ?? 0) + 1;
    seen.set(e.sourceKey, n);
    if (n > 1) e.sourceKey += `#${n}`;
  }
}

/**
 * Clockify "Detailed report" CSV. Times are in the exporting account's time
 * zone, which the file doesn't say; Fathom reads them as `tz` (Chicago).
 */
export function parseClockify(rows: Row[], tz = "America/Chicago"): ParseResult {
  const entries: RawEntry[] = [];
  const problems: string[] = [];
  rows.forEach((r, i) => {
    const start = at(text(r["Start Date"]), text(r["Start Time"]), tz);
    const end = at(text(r["End Date"]), text(r["End Time"]), tz);
    const name = text(r["User"]);
    const email = text(r["Email"]).toLowerCase() || null;
    if (!start || !end || !name) {
      if (Object.values(r).some((v) => text(v))) problems.push(`Row ${i + 2}: missing a date, time or user, so it was skipped.`);
      return;
    }
    const seconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
    const personKey = email ?? name.toLowerCase();
    entries.push({
      source: "clockify",
      personKey,
      personName: name,
      personEmail: email,
      client: text(r["Client"]),
      project: text(r["Project"]),
      task: text(r["Task"]),
      description: text(r["Description"]),
      billable: /^yes$/i.test(text(r["Billable"])) ? true : /^no$/i.test(text(r["Billable"])) ? false : null,
      date: dayKey(start, tz),
      start: start.toISOString(),
      end: end.toISOString(),
      seconds,
      tz,
      sourceKey: `${personKey}|${start.toISOString()}|${end.toISOString()}`,
    });
  });
  uniqueKeys(entries);
  return { source: "clockify", entries, problems };
}

/** "9h 00m", "0h 30m", "24h 00m" -> seconds. */
function parseJibbleDuration(s: string) {
  const m = s.match(/(\d+)\s*h\s*(\d+)\s*m/i);
  return m ? +m[1] * 3600 + +m[2] * 60 : null;
}

/**
 * Jibble "Raw Time Entries" CSV. Two kinds of rows:
 *   Hours   a date and a length, no start or end time
 *   In/Out  clock-in and clock-out events, paired here into entries
 *           (StartBreak ends a stretch; EndBreak starts the next one)
 * Each row carries its own time zone.
 */
export function parseJibble(rows: Row[]): ParseResult {
  const entries: RawEntry[] = [];
  const problems: string[] = [];
  type Ev = { row: Row; at: Date; type: string; tz: string; index: number };
  const events = new Map<string, Ev[]>();

  const base = (r: Row, tz: string) => {
    const name = text(r["Full Name"]);
    return {
      source: "jibble" as const,
      personKey: name.toLowerCase(),
      personName: name,
      personEmail: null,
      client: text(r["Client"]),
      project: text(r["Project"]),
      task: text(r["Activity"]),
      description: text(r["Notes"]),
      billable: null,
      tz,
    };
  };

  rows.forEach((r, i) => {
    const type = text(r["EntryType"]);
    const tz = text(r["Timezone"]) || "America/Chicago";
    const name = text(r["Full Name"]);
    if (!type && !name) return;
    if (type === "Hours") {
      const secs = parseJibbleDuration(text(r["Duration"]));
      const d = parseDate(text(r["Date"]));
      if (!secs || !d || !name) {
        problems.push(`Row ${i + 2}: an Hours entry without a date, name or length was skipped.`);
        return;
      }
      const date = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
      const b = base(r, tz);
      entries.push({
        ...b,
        date,
        start: null,
        end: null,
        seconds: secs,
        sourceKey: `${b.personKey}|${date}|hours|${secs}|${b.project}|${b.task}|${text(r["Created On"])}`.toLowerCase(),
      });
      return;
    }
    if (["In", "Out", "StartBreak", "EndBreak"].includes(type)) {
      const when = at(text(r["Date"]), text(r["Time"]), tz);
      if (!when || !name) {
        problems.push(`Row ${i + 2}: a clock ${type} without a time was skipped.`);
        return;
      }
      const list = events.get(name.toLowerCase()) ?? [];
      list.push({ row: r, at: when, type, tz, index: i });
      events.set(name.toLowerCase(), list);
    }
  });

  for (const list of events.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime() || a.index - b.index);
    let open: Ev | null = null; // the clock-in (or break end) being timed
    let lastIn: Ev | null = null; // what the person was working on
    for (const ev of list) {
      if (ev.type === "In" || ev.type === "EndBreak") {
        if (open) {
          problems.push(
            `${text(open.row["Full Name"])} clocked in at ${text(open.row["Time"])} on ${text(open.row["Date"])} with no clock-out, so that stretch was skipped.`
          );
        }
        open = ev;
        if (ev.type === "In") lastIn = ev;
        continue;
      }
      // Out or StartBreak closes the open stretch.
      if (!open) {
        problems.push(`${text(ev.row["Full Name"])} clocked out on ${text(ev.row["Date"])} with no clock-in; skipped.`);
        continue;
      }
      const from = open.type === "In" ? open : (lastIn ?? open);
      const b = base(from.row, open.tz);
      entries.push({
        ...b,
        date: dayKey(open.at, open.tz),
        start: open.at.toISOString(),
        end: ev.at.toISOString(),
        seconds: Math.max(0, (ev.at.getTime() - open.at.getTime()) / 1000),
        sourceKey: `${b.personKey}|${open.at.toISOString()}|${ev.at.toISOString()}`,
      });
      open = null;
    }
    if (open) {
      problems.push(
        `${text(open.row["Full Name"])} clocked in at ${text(open.row["Time"])} on ${text(open.row["Date"])} with no clock-out yet, so it was skipped.`
      );
    }
  }
  uniqueKeys(entries);
  return { source: "jibble", entries, problems };
}

/** Reads an export file (CSV or Excel) and parses it. */
export async function readTimeExport(file: File, clockifyTz = "America/Chicago"): Promise<ParseResult | null> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: "", raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const source = detectSource(headers);
  if (source === "clockify") return parseClockify(rows, clockifyTz);
  if (source === "jibble") return parseJibble(rows);
  return null;
}
