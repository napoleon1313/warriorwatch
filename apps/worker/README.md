# apps/worker — Agent A

Cloudflare Worker (Hono + TypeScript) that scrapes, stores to D1, and serves `/api/*` per `packages/contract/API.md`.

- `wrangler.toml`: `[triggers] crons = ["* * * * *"]` (every minute) plus a daily `15 9 * * *` for the 44 facility pages (hours). D1 binding `DB`.
- Parser: `src/parse.ts` → `Snapshot` from the HTML. Use the `data-facilityid`, `canvas.occupancy-chart[data-occupancy]` and `.max-occupancy strong` of the **first** (desktop) card only; the page renders every card twice. Detect the stale banner (`.results-not-live` without `hidden`).
- Storage policy: insert a reading only when `count` or `max` differs from the facility's latest stored row, plus a heartbeat row once per hour. Always insert a `scrapes` row.
- Hourly job: rebuild `typical` using `@warriorwatch/analytics`.
- `User-Agent` = `SOURCE.userAgent` from the contract. One request per minute. Never retry more than once per tick.
- Alerting: if `cards < 7` or 3 consecutive failures, log at error level (and POST to `ALERT_WEBHOOK` if set).
- Tests: vitest with `fixtures/facility-occupancy-2026-10-27-2155.html` (expect 7 cards, Free Weights count 42 max 75) and `fixtures/get-facility-pac-free-weights.html` (expect 7 weekday hours).

## Done when
`npm run dev` scrapes the live site locally (`wrangler dev --test-scheduled`), D1 local has readings, every endpoint in API.md returns typed JSON, tests pass, `npm run deploy` is documented in this README.
