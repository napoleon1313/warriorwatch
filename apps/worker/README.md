# apps/worker — scraper + public API

Cloudflare Worker (Hono, TypeScript). One cron scrapes `https://warrior.uwaterloo.ca/FacilityOccupancy` every minute into D1. A second cron refreshes the 44 facility pages daily. The same Worker serves every endpoint in [`packages/contract/API.md`](../../packages/contract/API.md).

## Layout

| File | What it does |
|---|---|
| `src/index.ts` | Worker entry: `fetch` → Hono app, `scheduled` → cron dispatch. Only a default export (workerd treats named exports of the entry as entrypoints). |
| `src/scheduled.ts` | `* * * * *`: scrape, plus the hourly `typical` rebuild (one live facility per minute at :05–:11 UTC). `15 9 * * *`: facilities refresh. |
| `src/parse.ts` | `parseOccupancy(html, ts) → Snapshot` and `parseFacilityPage(html, id) → Facility`. String scanning, no DOM, so the same code runs in workerd and vitest. |
| `src/ingest.ts` | Fetch with `SOURCE.userAgent`, at most one retry per tick, change-only storage, `scrapes` row on every attempt, alerts. |
| `src/facilities.ts` | Daily refresh of all facility pages, sequential, 500 ms apart. Seeds from `facilities.json` on first run. |
| `src/typical.ts` | Rebuilds `typical` from the last 70 days of readings. |
| `src/api.ts` | `/api/*` routes, CORS `*`, `Cache-Control` + Cache API edge caching, 60 req/min/IP limit. |
| `src/analytics.ts` | The worker's only import point for analytics. Re-exports `src/analytics-fallback.ts` until `@warriorwatch/analytics` is merged (see below). |
| `migrations/0001_init.sql` | `packages/contract/schema.sql`, verbatim. A test fails if they drift. |

## Storage policy

- **readings**: a row when `count` or `max` differs from the facility's latest stored row, or when that row is from an earlier UTC hour (the hourly heartbeat, so gaps stay visible). Readings from a page showing the stale banner are not stored.
- **scrapes**: one row per attempt: `ok`, `stale`, `cards`, `ms`, `error`.
- **facilities**: seeded from `packages/contract/facilities.json` the first time the table is empty, then refreshed daily. A page that fails to fetch or parse keeps its previous row.
- Bulk writes use `INSERT … SELECT … FROM json_each(?)`, so each one is a single D1 query. The free plan allows 50 queries per invocation.

## Alerts

These are logged at error level and also POSTed to `ALERT_WEBHOOK` when it is set. The body is `{ "content", "text" }`, which works for Discord and Slack.

- 3 consecutive failed scrapes. The webhook fires once, when the streak reaches 3.
- Fewer than 7 cards parsed. The webhook fires once, when the count first drops.
- The daily refresh failing for more than half of the facility pages.

## Run locally

All commands run from `apps/worker`. `wrangler` is a workspace devDependency, so use `npx wrangler`, not a global install.

```bash
npm install                      # once, at the repo root
```

```bash
npm run db:migrate:local         # = wrangler d1 migrations apply DB --local  (applies 0001_init.sql)
```

```bash
npm run dev                      # = wrangler dev --test-scheduled  → http://localhost:8787
```

In another terminal, trigger the crons by hand. Each call to the minute cron makes one real request to the portal, so keep it to one per minute:

```bash
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"
```

```bash
curl "http://localhost:8787/__scheduled?cron=15+9+*+*+*"
```

The second command is the daily facilities refresh: 44 requests, 500 ms apart. Then inspect:

```bash
npx wrangler d1 execute DB --local --command "SELECT facility_id, ts, count, max FROM readings ORDER BY ts DESC LIMIT 10"
```

```bash
curl -s localhost:8787/api/live | jq
```

Local D1 state lives in `.wrangler/state` (gitignored). Delete that folder to start over.

## Tests

```bash
npm test
```

```bash
npm run typecheck
```

- `test/parse.test.ts` runs against `fixtures/facility-occupancy-2026-10-27-2155.html` (7 cards, Free Weights 42/75, Esports 0/20, not stale) and `fixtures/get-facility-pac-free-weights.html` (7 weekday hours, max 75; matches `facilities.json` exactly).
- `test/worker.test.ts` runs the real SQL against an in-memory SQLite (`node:sqlite`) through a small D1 shim (`test/d1-shim.ts`). It covers scrape ticks, retry, stale pages, alerts, the daily refresh and every endpoint.
- `test/analytics-fallback.test.ts` covers the fallback (hours formats, DST, typical, best windows).

## Deploy

Not done yet. These are the steps when you're ready:

```bash
npx wrangler login
```

```bash
npx wrangler d1 create warriorwatch
```

Paste the printed `database_id` into `wrangler.toml`, replacing the zeros. Then:

```bash
npm run db:migrate:remote        # = wrangler d1 migrations apply DB --remote
```

```bash
npx wrangler secret put ALERT_WEBHOOK   # optional
```

```bash
npm run deploy                   # = wrangler deploy
```

The crons start with the deploy. Check `GET /api/health` a couple of minutes later. The first deploy seeds `facilities` on the first tick.

## Bindings and secrets

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `DB` | D1 binding (`wrangler.toml`) | yes | All tables in `schema.sql`. |
| `ALERT_WEBHOOK` | secret (`wrangler secret put`) | no | Discord/Slack webhook URL for alerts. For local dev, put it in `.dev.vars` (gitignored). |

## Analytics dependency

`/api/typical`, `/api/best`, `/api/live` (open, typical, trend) and the hourly rebuild call the functions named in `packages/analytics/README.md`. They are imported only through `src/analytics.ts`. To switch from the local fallback to the real package:

1. Add `"@warriorwatch/analytics": "*"` to `dependencies` here.
2. Replace the body of `src/analytics.ts` with the snippet in its header comment, which re-exports the package and its `term-calendar.json`.

How the worker calls analytics:

- `buildTypical(readings, calendar)` gets the readings of **one** (facility, term, weekday) group. The worker does the grouping with `termBucketFor` + `localSlot`.
- `bestWindows(slots, hours, date, max)`: `slots` is the full 96-slot day and `date` is `YYYY-MM-DD` local. The API drops windows that have already ended.
- `trend(readings)` gets 1-minute forward-filled samples for the last 20 minutes, so a flat count gives `0`, not `null`.

## Notes and limits

- **CPU**: the free plan gives 10 ms of CPU per invocation. Parsing the 75 KB page fits. The hourly `typical` rebuild is split across 7 invocations, but once months of data exist it may need the paid plan.
- **Subrequests**: the daily refresh makes 44 portal fetches plus ~3 D1 queries, under the free plan's 50. Adding facilities would need splitting it.
- **Rate limit**: in-memory and per isolate, so it is best effort. For a hard global limit, add a `[[ratelimits]]` binding.
- **`/api/live` `stale`**: true if the portal showed its banner, or if the last good scrape is more than 5 minutes old.
- **`/api/live` `typical`**: null until the slot has at least 3 days behind it.
