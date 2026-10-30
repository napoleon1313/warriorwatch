/** Public JSON API, per packages/contract/API.md. */
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { Cache, CacheStorage } from "@cloudflare/workers-types";
import { FACILITY_SLUGS, LIVE_FACILITY_ORDER, busyLabel, facilitySource } from "@warriorwatch/contract";
import type {
  BestResponse,
  EventsResponse,
  FacilitiesResponse,
  FacilityId,
  HistoryResponse,
  LiveFacility,
  LiveResponse,
  Reading,
  SourceStatus,
  TermBucket,
  TypicalResponse,
  TypicalSlot,
} from "@warriorwatch/contract";
import {
  bestWindows,
  confidence,
  isOpen,
  localDateKey,
  localParts,
  localSlot,
  termBucketFor,
  termCalendar,
  trend,
  zonedTimeToUtc,
} from "@warriorwatch/analytics";
import type { Weekday } from "@warriorwatch/analytics";
import {
  SEED_FACILITIES,
  daysOfData,
  ensureSeeded,
  eventsBetween,
  getFacility,
  lastChanges,
  lastOkScrape,
  latestReadings,
  listFacilities,
  readSource,
  readingsWithCarry,
  recentScrapes,
  typicalAt,
  typicalSlots,
} from "./db";
import type { ReadingRow } from "./db";
import type { Env } from "./env";
import { bucketize, sampleAt } from "./series";
import { DAY, HOUR, MINUTE, isIsoDate } from "./time";

export interface HealthResponse {
  /** the portal scrape is fresh */
  ok: boolean;
  lastScrape: string | null;
  lastOkScrape: string | null;
  cards: number;
  /** each upstream feed */
  sources: { portal: SourceStatus; waitz: SourceStatus & { failures: number } };
}

const TERM_BUCKETS: TermBucket[] = ["term", "reading-week", "exams", "break", "holiday"];
/** A typical median needs at least this many days behind it before /api/live shows it. */
const MIN_TYPICAL_DAYS = 3;
/** Data older than this (since the last good scrape) is reported as stale. */
const STALE_AFTER_MS = 5 * MINUTE;
/** Waitz is polled every 5 minutes; three missed polls make it stale. */
const WAITZ_STALE_AFTER_MS = 16 * MINUTE;
const RATE_LIMIT_PER_MIN = 60;

const SLUG_TO_ID = new Map(Object.entries(FACILITY_SLUGS).map(([id, slug]) => [slug, id]));
const ALL_IDS = new Set(SEED_FACILITIES.map((f) => f.id));

class HttpError extends Error {
  constructor(
    readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
  }
}

type AppEnv = { Bindings: Env };
type Ctx = Context<AppEnv>;

function resolveFacility(param: string | undefined, { liveOnly }: { liveOnly: boolean }): FacilityId {
  if (!param) throw new HttpError(400, "missing required query parameter: facility");
  const p = param.trim().toLowerCase();
  const id = SLUG_TO_ID.get(p) ?? p;
  if (LIVE_FACILITY_ORDER.includes(id)) return id;
  if (ALL_IDS.has(id)) {
    if (liveOnly) throw new HttpError(404, `facility ${param} has no live occupancy data`);
    return id;
  }
  throw new HttpError(404, `unknown facility: ${param}`);
}

function parseInstant(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === "") return fallback;
  const t = Date.parse(value);
  if (Number.isNaN(t)) throw new HttpError(400, `${name} must be an ISO 8601 timestamp`);
  return t;
}

function parseRange(c: Ctx, defaultFrom: number, defaultTo: number, maxSpan: number): { from: number; to: number } {
  const from = parseInstant(c.req.query("from"), defaultFrom, "from");
  const to = parseInstant(c.req.query("to"), defaultTo, "to");
  if (from >= to) throw new HttpError(400, "from must be before to");
  if (to - from > maxSpan) throw new HttpError(400, `range too long: at most ${Math.round(maxSpan / DAY)} days for this query`);
  return { from, to };
}

// ---------- middleware ----------

/** Best-effort, per-isolate fixed-window limiter: 60 requests per minute per client IP. */
const hits = new Map<string, { window: number; n: number }>();
const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const window = Math.floor(Date.now() / MINUTE);
  if (hits.size > 10_000) for (const [k, v] of hits) if (v.window !== window) hits.delete(k);
  const entry = hits.get(ip);
  const n = entry && entry.window === window ? entry.n + 1 : 1;
  hits.set(ip, { window, n });
  if (n > RATE_LIMIT_PER_MIN) {
    c.header("Retry-After", String(60 - Math.floor((Date.now() % MINUTE) / 1000)));
    return c.json({ error: "rate limit exceeded: 60 requests per minute" }, 429);
  }
  await next();
};

function edgeCache(): Cache | null {
  const storage = (globalThis as unknown as { caches?: CacheStorage }).caches;
  return storage && "default" in storage ? storage.default : null;
}

/** Sets Cache-Control and serves/stores 200 responses in the colo's edge cache. */
function cached(seconds: number): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const cache = edgeCache();
    const key = c.req.url;
    if (cache) {
      const hit = await cache.match(key);
      if (hit) return hit as unknown as Response;
    }
    await next();
    if (c.res.status !== 200) return;
    c.res.headers.set("Cache-Control", `public, max-age=${seconds}, s-maxage=${seconds}`);
    if (cache) {
      const put = cache.put(key, c.res.clone() as unknown as Parameters<Cache["put"]>[1]);
      try {
        c.executionCtx.waitUntil(put);
      } catch {
        await put;
      }
    }
  };
}

const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
};

// ---------- app ----------

export const app = new Hono<AppEnv>();

app.use("*", cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"], maxAge: 86400 }));
app.use("/api/*", rateLimit);

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(`unhandled error on ${c.req.path}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  return c.json({ error: "internal error" }, 500);
});
app.notFound((c) => c.json({ error: `no route for ${c.req.method} ${c.req.path}` }, 404));

app.get("/", (c) =>
  c.json({ name: "WarriorWatch API", docs: "https://github.com/napoleon1313/warriorwatch/blob/main/packages/contract/API.md", endpoints: ["/api/live", "/api/facilities", "/api/history", "/api/typical", "/api/best", "/api/events", "/api/health"] }),
);

app.get("/api/health", noStore, async (c) => {
  await ensureSeeded(c.env.DB, new Date());
  const [[last], lastOk, waitz] = await Promise.all([recentScrapes(c.env.DB, 1), lastOkScrape(c.env.DB), readSource(c.env.DB, "waitz")]);
  const now = Date.now();
  const fresh = !!lastOk && now - Date.parse(lastOk.ts) <= STALE_AFTER_MS;
  return c.json<HealthResponse>({
    ok: !!last && last.ok === 1 && fresh,
    lastScrape: last?.ts ?? null,
    lastOkScrape: lastOk?.ts ?? null,
    cards: last?.cards ?? 0,
    sources: {
      portal: { fetchedAt: lastOk?.ts ?? null, stale: !fresh || lastOk?.stale === 1 },
      waitz: { ...waitzStatus(waitz?.last_ok ?? null, now), failures: waitz?.failures ?? 0 },
    },
  });
});

function waitzStatus(lastOk: string | null, now: number): SourceStatus {
  return { fetchedAt: lastOk, stale: !lastOk || now - Date.parse(lastOk) > WAITZ_STALE_AFTER_MS };
}

/** Last row in a change-only series whose count or max differs from the row before it; null when the series never moves. */
function lastChangeIn(series: ReadingRow[]): string | null {
  for (let i = series.length - 1; i > 0; i--) {
    const cur = series[i]!;
    const prev = series[i - 1]!;
    if (cur.count !== prev.count || cur.max !== prev.max) return cur.ts;
  }
  return null;
}

app.get("/api/facilities", cached(3600), async (c) => {
  await ensureSeeded(c.env.DB, new Date());
  const { facilities, updatedAt } = await listFacilities(c.env.DB);
  return c.json<FacilitiesResponse>({ facilities, updatedAt: updatedAt ?? new Date().toISOString() });
});

app.get("/api/live", cached(30), async (c) => {
  const db = c.env.DB;
  const now = Date.now();
  const nowDate = new Date(now);
  await ensureSeeded(db, nowDate);

  const sparkTimes = Array.from({ length: 36 }, (_, k) => now - (35 - k) * 5 * MINUTE);
  const trendTimes = Array.from({ length: 21 }, (_, k) => now - (20 - k) * MINUTE);
  const slot = localSlot(nowDate.toISOString());
  const term = termBucketFor(nowDate, termCalendar);

  const [lastOk, waitz, { facilities }, rows, typical] = await Promise.all([
    lastOkScrape(db),
    readSource(db, "waitz"),
    listFacilities(db),
    readingsWithCarry(db, LIVE_FACILITY_ORDER, new Date(sparkTimes[0]!).toISOString(), nowDate.toISOString()),
    typicalAt(db, term, slot.weekday, slot.minute),
  ]);
  // Samples are only trusted up to each feed's last successful fetch, so a dead feed shows a gap, not a flat line.
  const validUntilBy = {
    portal: lastOk ? Date.parse(lastOk.ts) : 0,
    waitz: waitz?.last_ok ? Date.parse(waitz.last_ok) : 0,
  };
  const byFacility = groupRows(rows);
  const meta = new Map(facilities.map((f) => [f.id, f]));

  // "Last change" usually falls inside the 3-hour window already loaded; only flat series need the wider query.
  const flat = LIVE_FACILITY_ORDER.filter((id) => byFacility.has(id) && lastChangeIn(byFacility.get(id)!) === null);
  const changes = await lastChanges(db, new Date(now - 7 * DAY).toISOString(), flat);

  const out: LiveFacility[] = [];
  for (const id of LIVE_FACILITY_ORDER) {
    const series = byFacility.get(id);
    const latest = series?.[series.length - 1];
    if (!series || !latest) continue;
    const validUntil = validUntilBy[facilitySource(id)];
    const f = meta.get(id);
    const open = f ? isOpen(f.hours, nowDate) : true;
    const t = typical.get(id);
    const typicalCount = t && t.n >= MIN_TYPICAL_DAYS ? t.median : null;
    const trendInput: Reading[] = [];
    sampleAt(series, trendTimes, validUntil).forEach((s, k) => {
      if (s) trendInput.push({ facilityId: id, ts: new Date(trendTimes[k]!).toISOString(), count: s.count, max: s.max });
    });
    out.push({
      id,
      name: f?.name ?? FACILITY_SLUGS[id] ?? id,
      building: f?.building ?? null,
      count: latest.count,
      max: latest.max,
      pct: latest.max > 0 ? Math.round((latest.count / latest.max) * 100) : 0,
      label: busyLabel(latest.count, latest.max, open),
      open,
      typical: typicalCount,
      delta: typicalCount === null ? null : Math.round((latest.count - typicalCount) * 10) / 10,
      trend: trend(trendInput),
      lastChange: lastChangeIn(series) ?? changes.get(id) ?? latest.ts,
      sparkline: sampleAt(series, sparkTimes, validUntil).map((s) => s?.count ?? null),
    });
  }

  return c.json<LiveResponse>({
    fetchedAt: lastOk?.ts ?? nowDate.toISOString(),
    stale: !lastOk || lastOk.stale === 1 || now - validUntilBy.portal > STALE_AFTER_MS,
    facilities: out,
    sources: {
      portal: { fetchedAt: lastOk?.ts ?? null, stale: !lastOk || lastOk.stale === 1 || now - validUntilBy.portal > STALE_AFTER_MS },
      waitz: waitzStatus(waitz?.last_ok ?? null, now),
    },
  });
});

const RESOLUTIONS = {
  raw: { bucket: 0, step: 0, maxSpan: 7 * DAY },
  "5m": { bucket: 5 * MINUTE, step: MINUTE, maxSpan: 31 * DAY },
  "15m": { bucket: 15 * MINUTE, step: MINUTE, maxSpan: 92 * DAY },
  "1h": { bucket: HOUR, step: 5 * MINUTE, maxSpan: 366 * DAY },
} as const;
type Resolution = keyof typeof RESOLUTIONS;

app.get("/api/history", cached(300), async (c) => {
  const facilityId = resolveFacility(c.req.query("facility"), { liveOnly: true });
  const res = (c.req.query("res") ?? "5m") as Resolution;
  const spec = RESOLUTIONS[res];
  if (!spec) throw new HttpError(400, "res must be one of raw, 5m, 15m, 1h");
  const now = Date.now();
  const { from, to } = parseRange(c, now - DAY, now, spec.maxSpan);
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();

  let points: HistoryResponse["points"];
  if (res === "raw") {
    const rows = await readingsWithCarry(c.env.DB, [facilityId], fromIso, toIso);
    points = rows.filter((r) => r.ts >= fromIso).map((r) => ({ ts: r.ts, count: r.count, max: r.max }));
  } else {
    const [rows, lastOk] = await Promise.all([readingsWithCarry(c.env.DB, [facilityId], fromIso, toIso), lastOkScrape(c.env.DB)]);
    points = bucketize(rows, from, to, spec.bucket, spec.step, lastOk ? Date.parse(lastOk.ts) : 0);
  }
  return c.json<HistoryResponse>({ facilityId, from: fromIso, to: toIso, resolution: res, points });
});

function parseWeekday(value: string | undefined, fallback: Weekday): Weekday {
  if (value === undefined || value === "") return fallback;
  if (!/^[0-6]$/.test(value)) throw new HttpError(400, "weekday must be an integer 0-6 (0 = Sunday)");
  return Number(value) as Weekday;
}

function parseTerm(value: string | undefined, fallback: TermBucket): TermBucket {
  if (value === undefined || value === "") return fallback;
  if (!TERM_BUCKETS.includes(value as TermBucket)) throw new HttpError(400, `term must be one of ${TERM_BUCKETS.join(", ")}`);
  return value as TermBucket;
}

/** All 96 slots of a day, filling slots with no stored row as empty. */
function fullDay(stored: TypicalSlot[]): TypicalSlot[] {
  const byMinute = new Map(stored.map((s) => [s.minute, s]));
  return Array.from({ length: 96 }, (_, k) => byMinute.get(k * 15) ?? { minute: k * 15, median: null, p25: null, p75: null, n: 0 });
}

app.get("/api/typical", cached(3600), async (c) => {
  const facilityId = resolveFacility(c.req.query("facility"), { liveOnly: true });
  const now = new Date();
  const weekday = parseWeekday(c.req.query("weekday"), localParts(now).weekday);
  const term = parseTerm(c.req.query("term"), termBucketFor(now, termCalendar));
  const slots = fullDay(await typicalSlots(c.env.DB, facilityId, term, weekday));
  return c.json<TypicalResponse>({ facilityId, weekday, term, slots });
});

app.get("/api/best", cached(900), async (c) => {
  const facilityId = resolveFacility(c.req.query("facility"), { liveOnly: true });
  const now = new Date();
  const date = c.req.query("date") || localDateKey(now);
  if (!isIsoDate(date)) throw new HttpError(400, "date must be YYYY-MM-DD");

  const weekday = localParts(zonedTimeToUtc(date, 12 * 60)).weekday;
  const term = termBucketFor(date, termCalendar);
  await ensureSeeded(c.env.DB, now);
  const [facility, stored, days, latest] = await Promise.all([
    getFacility(c.env.DB, facilityId),
    typicalSlots(c.env.DB, facilityId, term, weekday),
    daysOfData(c.env.DB, facilityId),
    latestReadings(c.env.DB),
  ]);
  const max = facility?.maxOccupancy ?? latest.get(facilityId)?.max ?? 0;
  const windows = bestWindows(fullDay(stored), facility?.hours ?? {}, date, max, { from: now });
  return c.json<BestResponse>({ facilityId, date, windows, confidence: confidence(days), daysOfData: days });
});

app.get("/api/events", cached(900), async (c) => {
  const facilityId = resolveFacility(c.req.query("facility"), { liveOnly: false });
  const now = Date.now();
  const { from, to } = parseRange(c, now, now + 7 * DAY, 92 * DAY);
  const fromIso = new Date(from).toISOString();
  const toIso = new Date(to).toISOString();
  const events = await eventsBetween(c.env.DB, facilityId, fromIso, toIso);
  return c.json<EventsResponse>({ facilityId, from: fromIso, to: toIso, events });
});

function groupRows(rows: ReadingRow[]): Map<string, ReadingRow[]> {
  const out = new Map<string, ReadingRow[]>();
  for (const r of rows) {
    const list = out.get(r.facility_id) ?? [];
    list.push(r);
    out.set(r.facility_id, list);
  }
  return out;
}
