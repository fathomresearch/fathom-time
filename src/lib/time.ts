// Time helpers. All stored times are UTC; everything shown uses the
// viewer's time zone. No date library needed.

// ---------- Time zone math ----------

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export type WallParts = { y: number; m: number; d: number; h: number; mi: number; s: number };

export function wallParts(date: Date, tz: string): WallParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { y: out.year, m: out.month, d: out.day, h: out.hour % 24, mi: out.minute, s: out.second };
}

function offsetMs(date: Date, tz: string): number {
  const p = wallParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** A wall-clock time in a zone, as a real moment. */
export function zonedToDate(
  y: number, m: number, d: number, h: number, mi: number, tz: string, s = 0
): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = offsetMs(new Date(guess), tz);
  let t = guess - off1;
  const off2 = offsetMs(new Date(t), tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

// ---------- Day keys ("YYYY-MM-DD" in a zone) ----------

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function dayKey(date: Date, tz: string): string {
  const p = wallParts(date, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function parseKey(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseKey(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 0 = Sunday */
export function weekday(key: string): number {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Weeks start on Sunday. */
export function weekStart(key: string): string {
  return addDays(key, -weekday(key));
}

export function startOfDay(key: string, tz: string): Date {
  const { y, m, d } = parseKey(key);
  return zonedToDate(y, m, d, 0, 0, tz);
}

/** Minutes since midnight of a moment, in a zone. */
export function minutesOfDay(date: Date, tz: string): number {
  const p = wallParts(date, tz);
  return p.h * 60 + p.mi;
}

/** A day key plus minutes since midnight, as a real moment. */
export function atMinutes(key: string, minutes: number, tz: string): Date {
  const { y, m, d } = parseKey(key);
  const extraDays = Math.floor(minutes / 1440);
  const mins = minutes - extraDays * 1440;
  const k = extraDays ? addDays(key, extraDays) : key;
  const p = extraDays ? parseKey(k) : { y, m, d };
  return zonedToDate(p.y, p.m, p.d, Math.floor(mins / 60), mins % 60, tz);
}

export function daysBetween(a: string, b: string): number {
  const pa = parseKey(a), pb = parseKey(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000
  );
}

// ---------- Formatting ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function shortDate(key: string): string {
  const { m, d } = parseKey(key);
  return `${MONTHS[m - 1]} ${d}`;
}

export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "Today";
  if (key === addDays(todayKey, -1)) return "Yesterday";
  return `${DAYS[weekday(key)]}, ${shortDate(key)}`;
}

export function weekLabel(startKey: string, todayKey: string): string {
  if (startKey === weekStart(todayKey)) return "This week";
  return `${shortDate(startKey)} – ${shortDate(addDays(startKey, 6))}`;
}

export function dateLabel(key: string, todayKey: string): string {
  return key === todayKey ? "Today" : shortDate(key);
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const mi = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mi)} ${h < 12 ? "AM" : "PM"}`;
}

export function formatTime(date: Date, tz: string): string {
  return formatClock(minutesOfDay(date, tz));
}

export function formatDateTime(date: Date, tz: string): string {
  const key = dayKey(date, tz);
  const { y } = parseKey(key);
  return `${shortDate(key)}, ${y} at ${formatTime(date, tz)}`;
}

/** 5400 -> "01:30:00" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** 5400 -> "1:30". Drops leftover seconds, like the Tracker's HH:MM part. */
export function formatHoursMinutes(totalSeconds: number): string {
  const mins = Math.floor(Math.max(0, totalSeconds) / 60);
  return `${Math.floor(mins / 60)}:${pad(mins % 60)}`;
}

/** 27000 -> "7.5h", 0 -> "0h". One decimal place. */
export function formatHoursShort(totalSeconds: number): string {
  const h = Math.round(Math.max(0, totalSeconds) / 360) / 10;
  return `${h.toLocaleString("en-US")}h`;
}

export function secondsBetween(start: string | Date, end: string | Date): number {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 1000);
}

// ---------- Parsing what people type ----------

/**
 * Loose time input -> minutes since midnight, or null.
 * Accepts 9, 930, 0930, 9:30, 9.30, 2p, 2pm, 2:30 pm, 14:15, 12a.
 */
export function parseTimeInput(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  const m = s.match(/^(\d{1,2})(?:[:.]?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const mi = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (mi > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith("p") && h !== 12) h += 12;
    if (ap.startsWith("a") && h === 12) h = 0;
  } else if (h > 23) {
    return null;
  }
  return h * 60 + mi;
}

/**
 * Loose duration input -> seconds, or null. Follows Clockify's rules:
 *   1:30, 1:30:00      hours:minutes(:seconds)
 *   1.5, .5            decimals are hours
 *   2h, 90m, 1h30m     units
 *   1 to 99            whole numbers are minutes (99 = 1h 39m)
 *   100 and up         the last two digits are minutes (200 = 2:00, 130 = 1:30)
 * With plainNumbers: "hours", a whole number is hours instead (used by the
 * Timesheet, where "8" should mean 8 hours).
 */
export function parseDurationInput(
  raw: string,
  plainNumbers: "clockify" | "hours" = "clockify"
): number | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  let m = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (m) {
    const mi = Number(m[2]), se = m[3] ? Number(m[3]) : 0;
    if (mi > 59 || se > 59) return null;
    return Number(m[1]) * 3600 + mi * 60 + se;
  }

  m = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?$/);
  if (m && (m[1] || m[2])) {
    return Math.round((m[1] ? Number(m[1]) * 3600 : 0) + (m[2] ? Number(m[2]) * 60 : 0));
  }

  m = s.match(/^(\d*\.\d+)$/);
  if (m) return Math.round(Number(m[1]) * 3600);

  m = s.match(/^(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    if (plainNumbers === "hours") return n * 3600;
    if (n < 100) return n * 60;
    return Math.floor(n / 100) * 3600 + (n % 100) * 60;
  }
  return null;
}
