# WarriorWatch public API (v1)

Base: `https://warriorwatch-api.warriorwatch-worker.workers.dev/api`. All JSON. `Access-Control-Allow-Origin: *`. Edge-cached; `Cache-Control` headers tell you how long.
Facilities are addressed by **slug** (see `FACILITY_SLUGS`) or by the portal GUID.

| Endpoint | Query | Returns | Cache |
|---|---|---|---|
| `GET /api/live` | — | `LiveResponse` | 30 s |
| `GET /api/facilities` | — | `FacilitiesResponse` (all 44, with hours) | 1 h |
| `GET /api/history` | `facility` (required), `from`, `to` (ISO, default last 24 h), `res` = `raw\|5m\|15m\|1h` (default `5m`) | `HistoryResponse` | 5 min |
| `GET /api/typical` | `facility`, `weekday` (0–6, default today), `term` (default: current) | `TypicalResponse` | 1 h |
| `GET /api/best` | `facility`, `date` (YYYY-MM-DD, default today) | `BestResponse` | 15 min |
| `GET /api/events` | `facility`, `from`, `to` | `EventsResponse` | 15 min |
| `GET /api/health` | — | `{ ok, lastScrape, lastOkScrape, cards }` | none |

Errors: `{ "error": "message" }` with 400/404/500. Rate limit: 60 req/min per IP, `429` beyond.

Types are the single source of truth in `packages/contract/src/index.ts`.


## Libraries (added 2026-10-30)

The three UW libraries and their floors are facilities like any other. Their ids are `waitz-<location id>`
(`facilitySource(id)` → `"waitz"`), their slugs are `dana-porter`, `davis-library`, `musagetes` for the whole
buildings and `dp-*` / `dc-*` for Dana Porter and Davis Centre floors. Every endpoint that takes `facility`
accepts them, and `/api/live` lists them after the gyms (26 facilities in all, in `LIVE_FACILITY_ORDER`).

Differences from the gyms:

- The count is an Occuspace sensor estimate (Bluetooth / Wi-Fi), read from Waitz every 5 minutes, not a
  door counter read every minute. A reading is stored when a count moves by at least 1% of capacity.
- A whole-building total is its own sensor reading; the floors do not sum to it.
- Hours are regular-term hours from LibCal, kept in the registry; `open` follows them.
- `LiveResponse.sources` reports each feed's freshness: `portal` (gyms) and `waitz` (libraries). The top-level
  `fetchedAt` / `stale` still describe the portal feed. A library is omitted from `facilities` until Waitz
  has been polled at least once.
- Libraries have no `/api/events` calendar.
