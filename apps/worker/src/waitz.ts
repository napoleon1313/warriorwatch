/**
 * Library occupancy from Waitz (Occuspace sensors), the feed behind waitz.io/waterloo and the
 * Libraries' own "how busy" widget. One public JSON document covers every library and zone.
 *
 * Polled every WAITZ_EVERY_MINUTES (the sensors update every few minutes, so a 1-minute poll would
 * only re-read the same numbers). Stored change-only like the gyms, but a change must be at least
 * 1% of capacity: the sensor estimate jitters by a person or two, and D1 meters rows written.
 */
import { LIBRARY_FACILITY_ORDER, SOURCE, WAITZ_ID_PREFIX } from "@warriorwatch/contract";
import type { FacilityId, Reading, Snapshot } from "@warriorwatch/contract";
import { insertReadingsStatement, latestReadings, readSource, upsertSourceStatement } from "./db";
import type { ReadingRow, SourceRow } from "./db";
import type { Deps, Env, FetchLike } from "./env";
import { notify, planReadings } from "./ingest";

export const WAITZ_EVERY_MINUTES = 5;
const FETCH_TIMEOUT_MS = 20_000;
const ALERT_AFTER_FAILURES = 3;
const KNOWN = new Set<FacilityId>(LIBRARY_FACILITY_ORDER);

/** The parts of a Waitz location we read. `subLocs` is `false` (not `[]`) when a location has no zones. */
export interface WaitzLocation {
  id: number;
  name: string;
  people: number | null;
  capacity: number | null;
  isOpen: boolean;
  subLocs?: WaitzLocation[] | false;
}

export async function fetchWaitz(fetchImpl: FetchLike): Promise<WaitzLocation[]> {
  const res = await fetchImpl(SOURCE.waitzLiveUrl, {
    headers: { "User-Agent": SOURCE.userAgent, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${SOURCE.waitzLiveUrl}`);
  const body = (await res.json()) as { data?: unknown };
  if (!Array.isArray(body.data)) throw new Error("waitz: no data array in response");
  return body.data as WaitzLocation[];
}

/** Every location and zone in the document, flattened, parents before children. */
export function flattenWaitz(locations: WaitzLocation[]): WaitzLocation[] {
  const out: WaitzLocation[] = [];
  for (const loc of locations) {
    out.push(loc);
    if (Array.isArray(loc.subLocs)) out.push(...loc.subLocs);
  }
  return out;
}

export const waitzFacilityId = (locationId: number): FacilityId => `${WAITZ_ID_PREFIX}${locationId}`;

/**
 * Readings for every location with usable numbers. Unknown locations are included so the caller can
 * notice a new zone; it is the caller's job to store only the ones in the registry.
 */
export function parseWaitz(locations: WaitzLocation[], ts: string): Snapshot {
  const readings: Reading[] = [];
  for (const loc of flattenWaitz(locations)) {
    if (!Number.isInteger(loc.id)) continue;
    const count = loc.people;
    const max = loc.capacity;
    if (typeof count !== "number" || typeof max !== "number" || !Number.isFinite(count) || !Number.isFinite(max) || max <= 0) continue;
    readings.push({ facilityId: waitzFacilityId(loc.id), ts, count: Math.max(0, Math.round(count)), max: Math.round(max) });
  }
  return { ts, stale: false, readings };
}

/** A library reading is worth a row when it moved by at least 1% of capacity (and at least one person). */
export function significantLibraryChange(prev: ReadingRow, r: Reading): boolean {
  return prev.max !== r.max || Math.abs(prev.count - r.count) >= Math.max(1, Math.round(r.max * 0.01));
}

export interface WaitzResult {
  ok: boolean;
  locations: number;
  stored: number;
  unknown: FacilityId[];
  error: string | null;
}

export async function runWaitz(env: Env, deps: Deps): Promise<WaitzResult> {
  const now = deps.now();
  const ts = now.toISOString();
  const previous = await readSource(env.DB, "waitz");
  const result: WaitzResult = { ok: false, locations: 0, stored: 0, unknown: [], error: null };

  let snapshot: Snapshot | null = null;
  try {
    snapshot = parseWaitz(await fetchWaitz(deps.fetch), ts);
    if (snapshot.readings.length === 0) throw new Error("waitz: parsed 0 locations (feed layout changed?)");
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  const statements = [];
  if (snapshot) {
    result.ok = true;
    result.locations = snapshot.readings.length;
    result.unknown = snapshot.readings.map((r) => r.facilityId).filter((id) => !KNOWN.has(id));
    const known = { ...snapshot, readings: snapshot.readings.filter((r) => KNOWN.has(r.facilityId)) };
    const toStore = planReadings(known, await latestReadings(env.DB), significantLibraryChange);
    if (toStore.length > 0) statements.push(insertReadingsStatement(env.DB, toStore));
    result.stored = toStore.length;
  }
  const failures = result.ok ? 0 : (previous?.failures ?? 0) + 1;
  const status: SourceRow = {
    source: "waitz",
    last_attempt: ts,
    last_ok: result.ok ? ts : (previous?.last_ok ?? null),
    failures,
    error: result.error,
  };
  statements.push(upsertSourceStatement(env.DB, status));
  await env.DB.batch(statements);

  if (!result.ok) {
    const msg = `WarriorWatch: Waitz fetch failed ${failures} times in a row. Last error: ${result.error}`;
    if (failures >= ALERT_AFTER_FAILURES) console.error(msg);
    if (failures === ALERT_AFTER_FAILURES) await notify(env, deps, msg);
  }
  return result;
}
