/** Daily refresh of the 44 facility pages (hours, max occupancy). Sequential, 500 ms apart. */
import { SOURCE } from "@warriorwatch/contract";
import type { Facility } from "@warriorwatch/contract";
import { ensureSeeded, listFacilities, upsertFacilities } from "./db";
import type { Deps, Env } from "./env";
import { fetchPage, notify } from "./ingest";
import { parseFacilityPage } from "./parse";

const GAP_MS = 500;

export interface RefreshResult {
  updated: number;
  failed: string[];
}

export async function refreshFacilities(env: Env, deps: Deps): Promise<RefreshResult> {
  await ensureSeeded(env.DB, deps.now());
  const { facilities } = await listFacilities(env.DB);

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
