-- Cloudflare D1 (SQLite). Owned by apps/worker migrations; this is the canonical shape.

CREATE TABLE IF NOT EXISTS facilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  building TEXT,
  path_json TEXT NOT NULL,         -- JSON array
  type TEXT,
  area TEXT,
  max_occupancy INTEGER,
  live_occupancy INTEGER NOT NULL DEFAULT 0,
  hours_json TEXT NOT NULL,        -- JSON object, weekday -> "6:00 AM - 11:59 PM"
  updated_at TEXT NOT NULL
);

-- One row per (facility, scrape) where the count CHANGED from the previous stored row,
-- plus one heartbeat row per facility per hour even if unchanged (so gaps are visible).
CREATE TABLE IF NOT EXISTS readings (
  facility_id TEXT NOT NULL,
  ts TEXT NOT NULL,                -- ISO 8601 UTC
  count INTEGER NOT NULL,
  max INTEGER NOT NULL,
  PRIMARY KEY (facility_id, ts)
);
CREATE INDEX IF NOT EXISTS readings_ts ON readings(ts);

-- Every scrape attempt, for freshness and alerting.
CREATE TABLE IF NOT EXISTS scrapes (
  ts TEXT PRIMARY KEY,
  ok INTEGER NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  cards INTEGER NOT NULL DEFAULT 0,
  ms INTEGER,
  error TEXT
);

-- Facility calendar events (Agent D). Upsert by (facility_id, start, title).
CREATE TABLE IF NOT EXISTS events (
  facility_id TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  title TEXT NOT NULL,
  kind TEXT,
  PRIMARY KEY (facility_id, start, title)
);

-- Precomputed typical curves, rebuilt hourly by the worker from readings.
CREATE TABLE IF NOT EXISTS typical (
  facility_id TEXT NOT NULL,
  term TEXT NOT NULL,              -- TermBucket
  weekday INTEGER NOT NULL,        -- 0..6, Sunday = 0, America/Toronto
  minute INTEGER NOT NULL,         -- 0..1425 step 15
  median REAL, p25 REAL, p75 REAL,
  n INTEGER NOT NULL,
  PRIMARY KEY (facility_id, term, weekday, minute)
);

-- Freshness of each upstream feed the worker polls (the portal keeps its per-attempt log in `scrapes`;
-- Waitz, polled every 5 minutes, records only its latest state here). One row per SourceKind.
CREATE TABLE IF NOT EXISTS sources (
  source TEXT PRIMARY KEY,         -- SourceKind
  last_attempt TEXT NOT NULL,      -- ISO 8601 UTC
  last_ok TEXT,                    -- ISO 8601 UTC of the last successful fetch
  failures INTEGER NOT NULL DEFAULT 0,  -- consecutive failures
  error TEXT
);
