/**
 * Timezone-aware date helpers for relative language (明天 / 后天 / 周五…).
 */

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** YYYY-MM-DD in user timezone */
  dateKey: string;
};

export function getLocalParts(timezone: string, at = new Date()): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const bag: Record<string, string> = {};
  for (const p of fmt.formatToParts(at)) {
    if (p.type !== "literal") bag[p.type] = p.value;
  }
  // hour12:false can yield "24" for midnight in some engines
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  const year = Number(bag.year);
  const month = Number(bag.month);
  const day = Number(bag.day);
  const minute = Number(bag.minute);
  const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { year, month, day, hour, minute, dateKey };
}

/** Add calendar days to a dateKey in a timezone-safe way (noon UTC pivot). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const y2 = utc.getUTCFullYear();
  const m2 = utc.getUTCMonth() + 1;
  const d2 = utc.getUTCDate();
  return `${y2}-${String(m2).padStart(2, "0")}-${String(d2).padStart(2, "0")}`;
}

/**
 * Build ISO bounds for a local calendar day (or daytime window) in timezone.
 * daytime: 09:00–18:00 local; full: 00:00–23:59:59.999 local.
 */
export function localDayWindow(
  timezone: string,
  dateKey: string,
  mode: "full" | "daytime" = "full"
): { start: string; end: string } {
  const startLocal =
    mode === "daytime" ? `${dateKey}T09:00:00` : `${dateKey}T00:00:00`;
  const endLocal =
    mode === "daytime" ? `${dateKey}T18:00:00` : `${dateKey}T23:59:59.999`;
  return {
    start: zonedLocalToIso(startLocal, timezone),
    end: zonedLocalToIso(endLocal, timezone),
  };
}

/**
 * Interpret a wall-clock local time in `timezone` as UTC ISO.
 * localWall: YYYY-MM-DDTHH:mm:ss(.sss)?
 */
export function zonedLocalToIso(localWall: string, timezone: string): string {
  const m = localWall.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/
  );
  if (!m) return new Date(localWall).toISOString();
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  const msPart = m[7] ? Number(m[7].padEnd(3, "0").slice(0, 3)) : 0;

  // Treat desired wall time as if UTC, then correct by timezone offset at that instant.
  const utcAsWall = Date.UTC(y, mo - 1, d, h, mi, s, msPart);
  const probe = new Date(utcAsWall);
  const inTz = probe.toLocaleString("en-US", { timeZone: timezone });
  const inUtc = probe.toLocaleString("en-US", { timeZone: "UTC" });
  const offset = new Date(inUtc).getTime() - new Date(inTz).getTime();
  return new Date(utcAsWall + offset).toISOString();
}

/** Early morning ambiguous window: [00:00, 05:00) local. */
export function isEarlyMorningAmbiguousHour(hour: number): boolean {
  return hour >= 0 && hour < 5;
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function nextFriday(from = new Date()): Date {
  const d = startOfDay(from);
  const day = d.getDay();
  let add = (5 - day + 7) % 7;
  if (add === 0 && from.getHours() >= 18) add = 7;
  d.setDate(d.getDate() + (add === 0 ? 0 : add));
  d.setHours(23, 59, 59, 0);
  return d;
}

export function nextWeekWindow(from = new Date()): { start: Date; end: Date } {
  const start = startOfDay(from);
  start.setDate(start.getDate() + 1);
  const end = endOfDay(new Date(start));
  end.setDate(start.getDate() + 6);
  return { start, end };
}

export function nextMonthWindow(from = new Date()): { start: Date; end: Date } {
  const start = startOfDay(from);
  start.setMonth(start.getMonth() + 1);
  start.setDate(1);
  const end = endOfDay(new Date(start.getFullYear(), start.getMonth() + 1, 0));
  return { start, end };
}
