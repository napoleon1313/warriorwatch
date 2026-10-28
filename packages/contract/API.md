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
