/** The 1-minute scrape of /FacilityOccupancy, and alerting. */
import { GYM_FACILITY_ORDER, SOURCE } from "@warriorwatch/contract";
import type { Reading, Snapshot } from "@warriorwatch/contract";
import {
  ensureSeeded,
  insertReadingsStatement,
  insertScrapeStatement,
  latestReadings,
  recentScrapes,
} from "./db";
import type { ReadingRow, ScrapeRow } from "./db";
import type { Deps, Env, FetchLike } from "./env";
import { parseOccupancy } from "./parse";

export const EXPECTED_CARDS = GYM_FACILITY_ORDER.length;
const FETCH_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 5_000;
const ALERT_AFTER_FAILURES = 3;

/** GET a portal page as the identified WarriorWatch client. Throws on network error or non-2xx. */
export async function fetchPage(fetchImpl: FetchLike, url: string): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": SOURCE.userAgent, Accept: "text/html" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

/** Any difference in count or max counts as a change (the portal counter is exact). */
export const anyChange = (prev: ReadingRow, r: Reading): boolean => prev.count !== r.count || prev.max !== r.max;

/**
 * Change-only storage: keep a reading when it differs from the facility's latest stored row (by
 * `changed`, default any difference), or when the latest row is from an earlier UTC hour (the hourly heartbeat).
 */
export function planReadings(snapshot: Snapshot, latest: Map<string, ReadingRow>, changed: (prev: ReadingRow, r: Reading) => boolean = anyChange): Reading[] {
  return snapshot.readings.filter((r) => {
    const prev = latest.get(r.facilityId);
    return !prev || changed(prev, r) || prev.ts.slice(0, 13) !== r.ts.slice(0, 13);
  });
}

export interface ScrapeResult {
  scrape: ScrapeRow;
  stored: number;
}

export async function runScrape(env: Env, deps: Deps): Promise<ScrapeResult> {
  const started = deps.now();
  const ts = started.toISOString();
  await ensureSeeded(env.DB, started);
  const previous = await recentScrapes(env.DB, ALERT_AFTER_FAILURES);

  let snapshot: Snapshot | null = null;
  let error: string | null = null;
  try {
    let html: string;
    try {
      html = await fetchPage(deps.fetch, SOURCE.occupancyUrl);
    } catch (first) {
      console.warn(`occupancy fetch failed, retrying once: ${String(first)}`);
      await deps.sleep(RETRY_DELAY_MS);
      html = await fetchPage(deps.fetch, SOURCE.occupancyUrl);
    }
    snapshot = parseOccupancy(html, ts);
    if (snapshot.readings.length === 0) error = "parsed 0 facility cards (page layout changed?)";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const cards = snapshot?.readings.length ?? 0;
  const scrape: ScrapeRow = {
    ts,
    ok: error === null ? 1 : 0,
    stale: snapshot?.stale ? 1 : 0,
    cards,
    ms: deps.now().getTime() - started.getTime(),
    error,
  };

  // Stale pages repeat old numbers; record the attempt but do not store them as readings.
  const toStore = snapshot && scrape.ok && !snapshot.stale ? planReadings(snapshot, await latestReadings(env.DB)) : [];
  const statements = [insertScrapeStatement(env.DB, scrape)];
  if (toStore.length > 0) statements.push(insertReadingsStatement(env.DB, toStore));
  await env.DB.batch(statements);

  await checkAlerts(env, deps, scrape, previous);
  return { scrape, stored: toStore.length };
}

async function checkAlerts(env: Env, deps: Deps, scrape: ScrapeRow, previous: ScrapeRow[]): Promise<void> {
  if (!scrape.ok) {
    let failures = 1;
    for (const p of previous) {
      if (p.ok) break;
      failures++;
    }
    if (failures >= ALERT_AFTER_FAILURES) {
      const msg = `WarriorWatch: ${failures} consecutive scrape failures. Last error: ${scrape.error}`;
      console.error(msg);
      // Notify once, when the streak first reaches the threshold.
      if (failures === ALERT_AFTER_FAILURES) await notify(env, deps, msg);
    }
    return;
  }
  if (scrape.cards < EXPECTED_CARDS) {
    const msg = `WarriorWatch: parsed ${scrape.cards} of ${EXPECTED_CARDS} facility cards`;
    console.error(msg);
    const prev = previous[0];
    if (!prev || !prev.ok || prev.cards >= EXPECTED_CARDS) await notify(env, deps, msg);
  }
}

export async function notify(env: Env, deps: Deps, message: string): Promise<void> {
  if (!env.ALERT_WEBHOOK) return;
  try {
    // `content` for Discord, `text` for Slack-style hooks.
    const res = await deps.fetch(env.ALERT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message, text: message }),
    });
    if (!res.ok) console.error(`alert webhook returned HTTP ${res.status}`);
  } catch (err) {
    console.error(`alert webhook failed: ${String(err)}`);
  }
}
