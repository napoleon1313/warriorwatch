/**
 * Facility calendar ingest, per the adapter note in packages/schedule/README.md:
 * 3 facilities per 1-minute tick, round-robin over facilities.json, so all 44 refresh every 15 minutes.
 *
 * D1 meters rows written, so a facility's window is rewritten only when the fetched bookings differ
 * from what is stored. Most ticks read ~40 rows and write nothing.
 */
import { localDateKey, localDayBounds } from "@warriorwatch/analytics";
import type { FacilityEvent, FacilityId } from "@warriorwatch/contract";
import { fetchFacilityEvents } from "@warriorwatch/schedule";
import type { D1Database } from "@cloudflare/workers-types";
import { SEED_FACILITIES, eventsBetween } from "./db";
import type { Deps, Env } from "./env";
import { DAY } from "./time";

export const EVENTS_PER_TICK = 3;
export const EVENTS_CYCLE_TICKS = Math.ceil(SEED_FACILITIES.length / EVENTS_PER_TICK); // 15
const GAP_MS = 500;
const WINDOW_DAYS = 8;

/** The facilities whose calendars refresh on this tick (`tick` = minutes since the epoch). */
export function eventsSlice(tick: number): FacilityId[] {
  const start = (tick % EVENTS_CYCLE_TICKS) * EVENTS_PER_TICK;
  return SEED_FACILITIES.slice(start, start + EVENTS_PER_TICK).map((f) => f.id);
}

/** Start of today in America/Toronto, through 8 days later. */
export function eventsWindow(now: Date): { from: Date; to: Date } {
  const from = localDayBounds(localDateKey(now)).start;
  return { from, to: new Date(from.getTime() + WINDOW_DAYS * DAY) };
}

/**
 * The stored form of a list of events: one row per (start, title), last one wins, order-independent.
 * Mirrors the table's primary key and the insert's ON CONFLICT clause, so a fetched list and the
 * rows it would produce canonicalise to the same string.
 */
export function canonicalEvents(events: readonly FacilityEvent[]): string {
  const rows = new Map<string, string>();
  for (const e of events) rows.set(`${e.start}\t${e.title}`, `${e.start}\t${e.title}\t${e.end}\t${e.kind ?? ""}`);
  return [...rows.values()].sort().join("\n");
}

/**
 * Make the facility's stored events overlapping [from, to) equal `events`, so rescheduled or cancelled
 * events do not linger. Rows before `from` stay as history. Returns whether anything was written:
 * when the fetched list matches what is stored, the table is left untouched.
 */
export async function replaceEventsWindow(db: D1Database, facilityId: FacilityId, from: Date, to: Date, events: FacilityEvent[]): Promise<boolean> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const inWindow = events.filter((e) => e.start < toIso && e.end > fromIso);
  const stored = await eventsBetween(db, facilityId, fromIso, toIso);
  if (canonicalEvents(stored) === canonicalEvents(inWindow)) return false;

  const del = db.prepare('DELETE FROM events WHERE facility_id = ?1 AND start < ?3 AND "end" > ?2').bind(facilityId, fromIso, toIso);
  if (inWindow.length === 0) {
    await db.batch([del]);
    return true;
  }
  const ins = db
    .prepare(
      `INSERT INTO events (facility_id, start, "end", title, kind)
       SELECT json_extract(value, '$.facilityId'), json_extract(value, '$.start'), json_extract(value, '$.end'),
              json_extract(value, '$.title'), json_extract(value, '$.kind')
       FROM json_each(?1) WHERE true
       ON CONFLICT (facility_id, start, title) DO UPDATE SET "end" = excluded."end", kind = excluded.kind`,
    )
    .bind(JSON.stringify(inWindow));
  await db.batch([del, ins]);
  return true;
}

export interface EventsTickResult {
  updated: { facilityId: FacilityId; events: number; changed: boolean }[];
  failed: FacilityId[];
}

/** Refresh this tick's facilities sequentially, 500 ms apart. A failed fetch leaves that facility's rows untouched. */
export async function runEventsTick(env: Env, deps: Deps, tick: number): Promise<EventsTickResult> {
  const now = deps.now();
  const { from, to } = eventsWindow(now);
  const result: EventsTickResult = { updated: [], failed: [] };
  for (const facilityId of eventsSlice(tick)) {
    await deps.sleep(GAP_MS); // also spaces the first request from the occupancy fetch
    let events: FacilityEvent[];
    try {
      events = await fetchFacilityEvents(facilityId, from, to, { fetch: deps.fetch as typeof fetch });
    } catch (err) {
      result.failed.push(facilityId);
      console.warn(`schedule ${facilityId}: ${String(err)}`);
      continue;
    }
    const changed = await replaceEventsWindow(env.DB, facilityId, from, to, events);
    result.updated.push({ facilityId, events: events.length, changed });
  }
  return result;
}
