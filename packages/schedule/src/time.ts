/**
 * The portal serialises appointment times as naive local wall-clock strings
 * ("2026-10-28T09:30:00.000", no offset) and the dxScheduler runs with
 * `timeZone: ""`, i.e. it trusts the browser to be in America/Toronto.
 * Everything here converts between that wall clock and real UTC instants.
 */

export const TIMEZONE = "America/Toronto";

/** Wall-clock fields, month 1..12. */
export interface Local {
  y: number; mo: number; d: number; h: number; mi: number; s: number;
}

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/;
const COMPACT = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;

export function parseNaive(s: string): Local {
  const m = NAIVE.exec(s);
  if (!m) throw new Error(`unparseable portal date: ${s}`);
  return { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: +m[4]!, mi: +m[5]!, s: +(m[6] ?? 0) };
}

/** iCal compact form. With a trailing Z it is UTC (RRULE UNTIL); without, local (EXDATE). */
export function parseCompact(s: string): { local: Local; utc: boolean } {
  const m = COMPACT.exec(s.trim());
  if (!m) throw new Error(`unparseable iCal date: ${s}`);
  return {
    local: { y: +m[1]!, mo: +m[2]!, d: +m[3]!, h: +m[4]!, mi: +m[5]!, s: +m[6]! },
    utc: m[7] === "Z",
  };
}

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** UTC epoch ms → Toronto wall clock. */
export function toLocal(ms: number): Local {
  const p: Record<string, number> = {};
  for (const { type, value } of fmt.formatToParts(new Date(ms))) p[type] = +value;
  return { y: p.year!, mo: p.month!, d: p.day!, h: p.hour!, mi: p.minute!, s: p.second! };
}

/** Wall clock read as if it were UTC; useful for date arithmetic that ignores DST. */
export function wallMs(l: Local): number {
  return Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi, l.s);
}

/**
 * Toronto wall clock → UTC epoch ms. Two-pass offset lookup handles DST.
 * Nonexistent spring-forward times resolve forward; ambiguous fall-back
 * times resolve to the first (EDT) instant, matching browser behaviour.
 */
export function localToUtc(l: Local): number {
  const w = wallMs(l);
  let t = w - offsetAt(w);
  t = w - offsetAt(t);
  // fall-back: prefer the earlier of two valid instants
  const earlier = t - 3600_000;
  if (wallMs(toLocal(earlier)) === w) return earlier;
  return t;
}

function offsetAt(ms: number): number {
  return wallMs(toLocal(ms)) - ms;
}

/** Format a Date's Toronto wall clock as the portal's query format, e.g. 2026-10-25T00:00:00. */
export function formatPortalQuery(ms: number): string {
  const l = toLocal(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${l.y}-${p(l.mo)}-${p(l.d)}T${p(l.h)}:${p(l.mi)}:${p(l.s)}`;
}
