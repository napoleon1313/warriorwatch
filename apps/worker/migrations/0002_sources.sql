-- Freshness of each upstream feed the worker polls. One row per SourceKind.
CREATE TABLE IF NOT EXISTS sources (
  source TEXT PRIMARY KEY,
  last_attempt TEXT NOT NULL,
  last_ok TEXT,
  failures INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
