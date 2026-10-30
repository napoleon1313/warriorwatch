/**
 * Daily refresh of facility metadata: the 44 portal facility pages (hours, max occupancy), sequential,
 * 500 ms apart; then the library names and capacities from the Waitz document (one request).
 */
import { LIBRARY_FACILITY_ORDER, LIBRARY_TOTAL_IDS, SOURCE, facilitySource } from "@warriorwatch/contract";
import type { Facility, FacilityId } from "@warriorwatch/contract";
import { ensureSeeded, listFacilities, upsertFacilities } from "./db";
import type { Deps, Env } from "./env";
import { fetchPage, notify } from "./ingest";
import { parseFacilityPage } from "./parse";
import { fetchWaitz, waitzFacilityId } from "./waitz";
import type { WaitzLocation } from "./waitz";

const GAP_MS = 500;

export interface RefreshResult {
  updated: number;
  failed: string[];
}

export async function refreshFacilities(env: Env, deps: Deps): Promise<RefreshResult> {
  await ensureSeeded(env.DB, deps.now());
  const facilities = (await listFacilities(env.DB)).facilities.filter((f) => facilitySource(f.id) === "portal");

  const updated: Facility[] = [];
  const failed: string[] = [];
  for (const [i, known] of facilities.entries()) {
    if (i > 0) await deps.sleep(GAP_MS);
    try {
      const parsed = parseFacilityPage(await fetchPage(deps.fetch, SOURCE.facilityUrl(known.id)), known.id);
      if (!parsed) throw new Error("not a facility page");
      updated.push(parsed);
    } catch (err) {
      failed.push(known.id);
      console.warn(`facility ${known.id} (${known.name}) refresh failed: ${String(err)}`);
    }
  }

  await upsertFacilities(env.DB, updated, deps.now().toISOString());
  console.log(`facilities refresh: ${updated.length} updated, ${failed.length} failed`);
  if (facilities.length > 0 && failed.length > facilities.length / 2) {
    const msg = `WarriorWatch: daily facilities refresh failed for ${failed.length} of ${facilities.length} pages`;
    console.error(msg);
    await notify(env, deps, msg);
  }
  return { updated: updated.length, failed };
}

/**
 * Library facilities from the Waitz document: name, building and capacity come from the feed; hours stay
 * as stored (LibCal publishes them; the registry carries regular-term hours). Only ids in the registry
 * are written, so a zone Waitz adds is logged, not invented.
 */
export function libraryFacilities(locations: WaitzLocation[], known: Map<FacilityId, Facility>): { updated: Facility[]; unknown: FacilityId[] } {
  const updated: Facility[] = [];
  const unknown: FacilityId[] = [];
  const visit = (loc: WaitzLocation, parent: WaitzLocation | null) => {
    const id = waitzFacilityId(loc.id);
    const prev = known.get(id);
    if (!prev) {
      unknown.push(id);
      return;
    }
    const library = parent?.name ?? loc.name;
    updated.push({
      ...prev,
      name: parent ? `${library} - ${loc.name}` : library,
      building: library,
      path: parent ? [library, loc.name] : [library],
      type: parent ? "Study space" : "Library",
      maxOccupancy: typeof loc.capacity === "number" && loc.capacity > 0 ? Math.round(loc.capacity) : prev.maxOccupancy,
      liveOccupancy: true,
    });
  };
  for (const loc of locations) {
    visit(loc, null);
    if (Array.isArray(loc.subLocs)) for (const sub of loc.subLocs) visit(sub, loc);
  }
  return { updated, unknown };
}

export async function refreshLibraries(env: Env, deps: Deps): Promise<RefreshResult> {
  await ensureSeeded(env.DB, deps.now());
  const known = new Map((await listFacilities(env.DB)).facilities.filter((f) => facilitySource(f.id) === "waitz").map((f) => [f.id, f]));
  try {
    const { updated, unknown } = libraryFacilities(await fetchWaitz(deps.fetch), known);
    await upsertFacilities(env.DB, updated, deps.now().toISOString());
    const missing = LIBRARY_FACILITY_ORDER.filter((id) => !updated.some((f) => f.id === id));
    console.log(`libraries refresh: ${updated.length} updated${unknown.length ? `, unknown on Waitz: ${unknown.join(",")}` : ""}${missing.length ? `, missing from Waitz: ${missing.join(",")}` : ""}`);
    return { updated: updated.length, failed: missing };
  } catch (err) {
    console.warn(`libraries refresh failed: ${String(err)}`);
    return { updated: 0, failed: [...LIBRARY_TOTAL_IDS] };
  }
}
