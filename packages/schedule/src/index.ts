/**
 * @warriorwatch/schedule — fetch and parse facility calendars from the
 * public, no-login JSON endpoint behind /Facility/GetSchedule.
 * See docs/schedule-recon.md for how it was found and how it behaves.
 */
import { SOURCE, type FacilityEvent, type FacilityId } from "@warriorwatch/contract";
import { occurrences, parseExceptions, parseRule } from "./recurrence.js";
import { formatPortalQuery, localToUtc, parseNaive, wallMs } from "./time.js";

export { TIMEZONE, localToUtc, toLocal, formatPortalQuery } from "./time.js";

export const APPOINTMENTS_URL =
  "https://warrior.uwaterloo.ca/Facility/GetScheduleCustomAppointmentsForDevExtremeScheduler";

/** One row of the endpoint's JSON array, exactly as the portal sends it. */
export interface RawAppointment {
  Id: string;
  Text: string;
  /** naive America/Toronto wall clock, e.g. "2026-10-28T09:30:00.000" */
  StartDate: string;
  EndDate: string;
  AllDay: boolean;
  Description: string;
  /** RFC 5545 RRULE body without the "RRULE:" prefix; StartDate is DTSTART */
  RecurrenceRule: string | null;
  /** comma-separated naive local EXDATEs, "20261025T120000,…" */
  RecurrenceException: string | null;
  BackgroundColor: string;
  TextColor: string;
}

/**
 * URL for one facility. `from`/`to` are UTC instants, sent as Toronto wall
 * clock like the browser does. The server only uses them as a loose lower
 * bound (see recon doc), so always clip with `expandAppointments`.
 * Never omit the facility: without it the server returns every facility's
 * events with no facility column (~570 KB per day).
 */
export function appointmentsUrl(facilityId: FacilityId, from: Date, to: Date): string {
  const q = new URLSearchParams({
    selectedFacilityId: facilityId,
    start: formatPortalQuery(from.getTime()),
    end: formatPortalQuery(to.getTime()),
  });
  return `${APPOINTMENTS_URL}?${q}`;
}

export interface FetchOptions {
  fetch?: typeof fetch;
  userAgent?: string;
  signal?: AbortSignal;
}

export async function fetchAppointments(
  facilityId: FacilityId, from: Date, to: Date, opts: FetchOptions = {},
): Promise<RawAppointment[]> {
  const f = opts.fetch ?? fetch;
  const res = await f(appointmentsUrl(facilityId, from, to), {
    headers: { "User-Agent": opts.userAgent ?? SOURCE.userAgent, Accept: "application/json" },
    signal: opts.signal,
  });
  if (!res.ok) throw new Error(`schedule ${facilityId}: HTTP ${res.status}`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) throw new Error(`schedule ${facilityId}: expected JSON array`);
  return body as RawAppointment[];
}

/**
 * Expand recurring series and clip to [from, to): returns every concrete
 * occurrence that overlaps the window, sorted by start, with UTC ISO times.
 */
export function expandAppointments(
  raw: RawAppointment[], facilityId: FacilityId, from: Date, to: Date,
): FacilityEvent[] {
  const lo = from.getTime();
  const hi = to.getTime();
  const out: FacilityEvent[] = [];
  const seen = new Set<string>();

  for (const a of raw) {
    const start = parseNaive(a.StartDate);
    // wall-clock duration, so a 00:30–06:00 closure stays 00:30–06:00 across DST
    const dur = wallMs(parseNaive(a.EndDate)) - wallMs(start);
    const title = a.Text.replace(/\s+/g, " ").trim();
    const kind = classifyKind(title);

    const starts = a.RecurrenceRule
      ? occurrences(start, parseRule(a.RecurrenceRule), hi)
      : [start];
    const ex = parseExceptions(a.RecurrenceException);

    for (const s of starts) {
      const sw = wallMs(s);
      if (ex.has(sw)) continue;
      const st = localToUtc(s);
      const e = new Date(sw + dur);
      const en = localToUtc({
        y: e.getUTCFullYear(), mo: e.getUTCMonth() + 1, d: e.getUTCDate(),
        h: e.getUTCHours(), mi: e.getUTCMinutes(), s: e.getUTCSeconds(),
      });
      if (st >= hi || en <= lo) continue;
      const ev: FacilityEvent = {
        facilityId, title, start: new Date(st).toISOString(), end: new Date(en).toISOString(), kind,
      };
      // the events table is keyed by (facility_id, start, title)
      const key = `${ev.start}|${ev.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ev);
    }
  }
  return out.sort((x, y) => x.start.localeCompare(y.start) || x.title.localeCompare(y.title));
}

/** Convenience: fetch + expand for one facility. */
export async function fetchFacilityEvents(
  facilityId: FacilityId, from: Date, to: Date, opts: FetchOptions = {},
): Promise<FacilityEvent[]> {
  return expandAppointments(await fetchAppointments(facilityId, from, to, opts), facilityId, from, to);
}

/**
 * Best-effort kind from the title. Titles follow loose staff conventions:
 * "Fall 2026 - Open Rec Basketball - …", "IU …" (interuniversity = varsity),
 * "IM …" / "Complete | A vs B" (intramurals), "vs Nipissing" (varsity game).
 */
export function classifyKind(title: string): string | null {
  const t = title.toLowerCase();
  if (/\b(building closed|closed|closure)\b/.test(t)) return "Closed";
  // prefixes on purpose: "Vacuuming", "sanitized", "Examinations"
  if (/\b(maintenance|repair|vacuum|sanitiz|cleaning|exam)/.test(t)) return "Closed";
  if (/\b(open rec|rec swim|fit(ness)? and rec|family rec|drop[- ]?ins?|lane swim|public skate|shinny|free skate|centre hours)\b/.test(t)) return "Open Rec";
  if (/\b(iu|varsity|game day|shoot times|spirit squad)\b/.test(t) || /^vs\b/.test(t)) return "Varsity";
  if (/^im\b|\bintramural|^complete \||\bvs\b/.test(t)) return "Intramural";
  if (t) return "Booking";
  return null;
}

