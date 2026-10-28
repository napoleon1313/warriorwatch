/**
 * D1 access. Bulk writes go through `json_each(?)` so a whole batch of rows is ONE query:
 * D1 counts queries per invocation, and the free plan allows 50.
 */
import type { D1Database } from "@cloudflare/workers-types";
import type { Facility, FacilityEvent, Reading, TermBucket, TypicalResponse, TypicalSlot } from "@warriorwatch/contract";
import facilitiesJson from "@warriorwatch/contract/facilities.json";

export interface ReadingRow {
  facility_id: string;
  ts: string;
  count: number;
  max: number;
}

export interface ScrapeRow {
  ts: string;
  ok: number;
  stale: number;
  cards: number;
  ms: number | null;
  error: string | null;
}

interface FacilityRow {
  id: string;
  name: string;
  building: string | null;
  path_json: string;
  type: string | null;
  area: string | null;
  max_occupancy: number | null;
  live_occupancy: number;
  hours_json: string;
  updated_at: string;
}

export const SEED_FACILITIES = facilitiesJson as Facility[];

// ---------- facilities ----------

function toFacility(r: FacilityRow): Facility {
  return {
    id: r.id,
    name: r.name,
    building: r.building,
    path: JSON.parse(r.path_json) as string[],
    type: r.type,
    area: r.area,
    maxOccupancy: r.max_occupancy,
    liveOccupancy: r.live_occupancy === 1,
    hours: JSON.parse(r.hours_json) as Facility["hours"],
  };
}

export async function upsertFacilities(db: D1Database, facilities: Facility[], updatedAt: string): Promise<void> {
  if (facilities.length === 0) return;
  const rows = facilities.map((f) => ({
    id: f.id,
    name: f.name,
    building: f.building,
    path: JSON.stringify(f.path),
    type: f.type,
    area: f.area,
    max: f.maxOccupancy,
    live: f.liveOccupancy ? 1 : 0,
    hours: JSON.stringify(f.hours),
  }));
  await db
    .prepare(
      `INSERT INTO facilities (id, name, building, path_json, type, area, max_occupancy, live_occupancy, hours_json, updated_at)
       SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), json_extract(value, '$.building'),
              json_extract(value, '$.path'), json_extract(value, '$.type'), json_extract(value, '$.area'),
              json_extract(value, '$.max'), json_extract(value, '$.live'), json_extract(value, '$.hours'), ?2
       FROM json_each(?1) WHERE true
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, building = excluded.building, path_json = excluded.path_json,
         type = excluded.type, area = excluded.area, max_occupancy = excluded.max_occupancy,
         live_occupancy = excluded.live_occupancy, hours_json = excluded.hours_json, updated_at = excluded.updated_at`,
    )
    .bind(JSON.stringify(rows), updatedAt)
    .run();
}

let seeded: Promise<void> | null = null;

/** Seed `facilities` from the contract's recon snapshot if the table is empty. At most one check per isolate. */
export function ensureSeeded(db: D1Database, now: Date): Promise<void> {
  seeded ??= (async () => {
    const row = await db.prepare("SELECT COUNT(*) AS n FROM facilities").first<{ n: number }>();
    if ((row?.n ?? 0) === 0) {
      await upsertFacilities(db, SEED_FACILITIES, now.toISOString());
      console.log(`seeded facilities table with ${SEED_FACILITIES.length} rows from facilities.json`);
    }
  })().catch((err: unknown) => {
    seeded = null;
    throw err;
  });
  return seeded;
}

/** For tests: forget that this isolate already checked the seed. */
export function resetSeedCheck(): void {
  seeded = null;
}

export async function listFacilities(db: D1Database): Promise<{ facilities: Facility[]; updatedAt: string | null }> {
  const { results } = await db.prepare("SELECT * FROM facilities ORDER BY building, name").all<FacilityRow>();
  const updatedAt = results.reduce<string | null>((acc, r) => (acc === null || r.updated_at > acc ? r.updated_at : acc), null);
  return { facilities: results.map(toFacility), updatedAt };
}

export async function getFacility(db: D1Database, id: string): Promise<Facility | null> {
  const row = await db.prepare("SELECT * FROM facilities WHERE id = ?").bind(id).first<FacilityRow>();
  return row ? toFacility(row) : null;
}

// ---------- readings & scrapes ----------

/** Latest stored row per facility. */
export async function latestReadings(db: D1Database): Promise<Map<string, ReadingRow>> {
  const { results } = await db
    .prepare(
      `SELECT r.facility_id, r.ts, r.count, r.max FROM readings r
       JOIN (SELECT facility_id, MAX(ts) AS ts FROM readings GROUP BY facility_id) m
         ON r.facility_id = m.facility_id AND r.ts = m.ts`,
    )
    .all<ReadingRow>();
  return new Map(results.map((r) => [r.facility_id, r]));
}

export function insertReadingsStatement(db: D1Database, readings: Reading[]) {
  return db
    .prepare(
      `INSERT OR IGNORE INTO readings (facility_id, ts, count, max)
       SELECT json_extract(value, '$.facilityId'), json_extract(value, '$.ts'),
              json_extract(value, '$.count'), json_extract(value, '$.max')
       FROM json_each(?1)`,
    )
    .bind(JSON.stringify(readings));
}

export function insertScrapeStatement(db: D1Database, s: ScrapeRow) {
  return db
    .prepare("INSERT OR REPLACE INTO scrapes (ts, ok, stale, cards, ms, error) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(s.ts, s.ok, s.stale, s.cards, s.ms, s.error);
}

export async function recentScrapes(db: D1Database, limit: number): Promise<ScrapeRow[]> {
  const { results } = await db.prepare("SELECT * FROM scrapes ORDER BY ts DESC LIMIT ?").bind(limit).all<ScrapeRow>();
  return results;
}

export async function lastOkScrape(db: D1Database): Promise<ScrapeRow | null> {
  return db.prepare("SELECT * FROM scrapes WHERE ok = 1 ORDER BY ts DESC LIMIT 1").first<ScrapeRow>();
}

/**
 * Rows with ts in [from, to] for the given facilities, plus each facility's last row before `from`
 * (so a change-only series can be forward-filled from the window start). Sorted by facility, ts.
 */
export async function readingsWithCarry(db: D1Database, facilityIds: string[], from: string, to: string): Promise<ReadingRow[]> {
  const ids = JSON.stringify(facilityIds);
  const { results } = await db
    .prepare(
      `SELECT facility_id, ts, count, max FROM readings
         WHERE facility_id IN (SELECT value FROM json_each(?1)) AND ts >= ?2 AND ts <= ?3
       UNION ALL
       SELECT r.facility_id, r.ts, r.count, r.max FROM readings r
         JOIN (SELECT facility_id, MAX(ts) AS ts FROM readings
                 WHERE facility_id IN (SELECT value FROM json_each(?1)) AND ts < ?2 GROUP BY facility_id) m
           ON r.facility_id = m.facility_id AND r.ts = m.ts
       ORDER BY facility_id, ts`,
    )
    .bind(ids, from, to)
    .all<ReadingRow>();
  return results;
}

/** Last time each facility's count or max differed from its previous stored row, looking back from `since`. */
export async function lastChanges(db: D1Database, since: string): Promise<Map<string, string>> {
  const { results } = await db
    .prepare(
      `WITH x AS (
         SELECT facility_id, ts, count, max,
                LAG(count) OVER (PARTITION BY facility_id ORDER BY ts) AS pc,
                LAG(max) OVER (PARTITION BY facility_id ORDER BY ts) AS pm
         FROM readings WHERE ts >= ?1)
       SELECT facility_id, MAX(ts) AS ts FROM x WHERE pc IS NULL OR pc <> count OR pm <> max GROUP BY facility_id`,
    )
    .bind(since)
    .all<{ facility_id: string; ts: string }>();
  return new Map(results.map((r) => [r.facility_id, r.ts]));
}

export async function daysOfData(db: D1Database, facilityId: string): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(DISTINCT substr(ts, 1, 10)) AS n FROM readings WHERE facility_id = ?")
    .bind(facilityId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function readingsSince(db: D1Database, facilityId: string, since: string): Promise<Reading[]> {
  const { results } = await db
    .prepare("SELECT facility_id, ts, count, max FROM readings WHERE facility_id = ? AND ts >= ? ORDER BY ts")
    .bind(facilityId, since)
    .all<ReadingRow>();
  return results.map((r) => ({ facilityId: r.facility_id, ts: r.ts, count: r.count, max: r.max }));
}

// ---------- typical ----------

export async function upsertTypical(db: D1Database, groups: TypicalResponse[]): Promise<void> {
  const rows = groups.flatMap((g) =>
    g.slots.map((s) => ({ f: g.facilityId, t: g.term, w: g.weekday, m: s.minute, md: s.median, lo: s.p25, hi: s.p75, n: s.n })),
  );
  if (rows.length === 0) return;
  await db
    .prepare(
      `INSERT OR REPLACE INTO typical (facility_id, term, weekday, minute, median, p25, p75, n)
       SELECT json_extract(value, '$.f'), json_extract(value, '$.t'), json_extract(value, '$.w'), json_extract(value, '$.m'),
              json_extract(value, '$.md'), json_extract(value, '$.lo'), json_extract(value, '$.hi'), json_extract(value, '$.n')
       FROM json_each(?1)`,
    )
    .bind(JSON.stringify(rows))
    .run();
}

export async function typicalSlots(db: D1Database, facilityId: string, term: TermBucket, weekday: number): Promise<TypicalSlot[]> {
  const { results } = await db
    .prepare("SELECT minute, median, p25, p75, n FROM typical WHERE facility_id = ? AND term = ? AND weekday = ? ORDER BY minute")
    .bind(facilityId, term, weekday)
    .all<TypicalSlot>();
  return results;
}

export async function typicalAt(db: D1Database, term: TermBucket, weekday: number, minute: number): Promise<Map<string, TypicalSlot>> {
  const { results } = await db
    .prepare("SELECT facility_id, minute, median, p25, p75, n FROM typical WHERE term = ? AND weekday = ? AND minute = ?")
    .bind(term, weekday, minute)
    .all<TypicalSlot & { facility_id: string }>();
  return new Map(results.map(({ facility_id, ...slot }) => [facility_id, slot]));
}

// ---------- events ----------

export async function eventsBetween(db: D1Database, facilityId: string, from: string, to: string): Promise<FacilityEvent[]> {
  const { results } = await db
    .prepare('SELECT facility_id, title, start, "end", kind FROM events WHERE facility_id = ? AND start < ? AND "end" > ? ORDER BY start')
    .bind(facilityId, to, from)
    .all<{ facility_id: string; title: string; start: string; end: string; kind: string | null }>();
  return results.map((e) => ({ facilityId: e.facility_id, title: e.title, start: e.start, end: e.end, kind: e.kind }));
}
