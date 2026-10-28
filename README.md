# WarriorWatch

How busy the University of Waterloo gyms are right now, what they usually look like at this hour, and when to go today. Covers PAC (free weights, functional, cardio, machines), the CIF Fitness Centre, Warrior Zone and the Esports Lounge. Every number is also available as free JSON, so you can build your own thing on it.

**Site:** https://warriorwatch.pages.dev
**API:** `https://warriorwatch-api.warriorwatch-worker.workers.dev/api` ([docs](docs/API.md))

Not affiliated with the University of Waterloo or Warriors Athletics.

<!-- SCREENSHOTS: replace the placeholders below before launch.
     Suggested: 1) Live page on a phone, 2) facility detail with today vs typical,
     3) "best time today" list. 1200px wide PNGs in docs/img/. -->

| Live | Today vs usual | Best time to go |
|---|---|---|
| ![Live page](docs/img/live.png) | ![Facility detail](docs/img/detail.png) | ![Best windows](docs/img/best.png) |

## Why use this over the portal

The official page at `warrior.uwaterloo.ca/FacilityOccupancy` shows one number per room. It doesn't say whether that number is normal for a Tuesday at 6, whether the room is filling up or emptying out, or when it'll be quiet. Leave it open for 2 minutes and an "Are you still there?" popup covers it.

WarriorWatch checks that page once a minute and keeps the history. With it you get:

- **Live counts** for all 7 rooms on one screen, with a label (quiet, moderate, busy, packed) and an arrow for the last 20 minutes.
- **Compared to usual.** For example, "12 more people than a normal Tuesday at 6 PM", from past weeks of the same term type (regular term, reading week, exams, breaks).
- **Best time today.** The quietest open windows for the rest of the day.
- **Hours for all 44 spaces** on the portal (courts, pools, studios, fields), not only the 7 with live counts.
- **Honest freshness.** "Updated 4 min ago" means the count last *changed* 4 minutes ago, and forecasts show how many days of data they're based on.
- **An API** with CORS open and no key.

## API quickstart

```bash
export API="https://warriorwatch-api.warriorwatch-worker.workers.dev/api"
```

Facilities take a slug (`pac-free-weights`, `pac-functional`, `pac-cardio`, `pac-machines`, `warrior-zone`, `cif-fitness`, `esports-lounge`) or the portal GUID. Times are UTC ISO strings; "today" and weekdays are Waterloo time.

```bash
# Everything right now
curl -s "$API/live"

# All 44 facilities with regular hours
curl -s "$API/facilities"

# Last 24 h of PAC free weights, 5-minute buckets
curl -s "$API/history?facility=pac-free-weights"

# A specific range, hourly
curl -s "$API/history?facility=cif-fitness&from=2026-10-27T21:00:00Z&to=2026-10-28T04:00:00Z&res=1h"

# What a regular-term Tuesday usually looks like (weekday 0 = Sunday)
curl -s "$API/typical?facility=pac-free-weights&weekday=2&term=term"

# Quietest windows today
curl -s "$API/best?facility=cif-fitness"

# Calendar events (bookings, varsity, closures) for the next 7 days
curl -s "$API/events?facility=4c8a432d-409a-46eb-a1f5-a92bf3b609a2"

# Is the scraper healthy
curl -s "$API/health"
```

One-liner for your terminal:

```bash
curl -s "$API/live" | jq -r '.facilities[] | "\(.pct)%\t\(.label)\t\(.name)"'
```

Response shapes, parameters, caching and rate limits are in [docs/API.md](docs/API.md). TypeScript types live in [`packages/contract/src/index.ts`](packages/contract/src/index.ts).

## How it works

```
warrior.uwaterloo.ca/FacilityOccupancy
        │  1 request per minute
        ▼
apps/worker   Cloudflare Worker: scrape, store to D1, serve /api/*
        │
        ▼
D1 (SQLite)   readings, facilities, hours, events, typical curves
        │
        ▼
apps/web      Next.js on Cloudflare Pages, reads only the public API
```

The occupancy page is server-rendered HTML. Each room's card carries the raw headcount in `canvas[data-occupancy]` and the maximum next to it, so we store headcounts (42 people) as well as percentages (56%). We only write a row when a count changes, plus one row per hour as a heartbeat, so gaps in the data are visible. Once a day the worker also reads the 44 facility pages for regular hours.

`packages/analytics` turns readings into typical curves (median and spread per 15-minute slot, per weekday, per term type), best windows and trends. It's pure functions, no I/O, shared by the worker and the site.

## Repo layout

| Path | What |
|---|---|
| `apps/worker` | Scraper, D1 migrations and the API (Hono) |
| `apps/web` | The site (Next.js, Tailwind) |
| `packages/analytics` | Typical curves, best windows, trends, labels |
| `packages/contract` | Shared types, D1 schema, facility registry. Every other package imports from here. |
| `fixtures/` | Saved portal HTML for parser tests |
| `scripts/` | One-off tools (PACked history import) |
| `docs/` | Plan, API docs, launch notes |

## Local development

Needs Node 22 or newer and npm (the repo uses npm workspaces).

```bash
npm install
npm test            # every workspace
npm run typecheck
```

**Worker** (`apps/worker`)

```bash
npm run dev -w apps/worker      # wrangler dev --test-scheduled on :8787
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # run one scrape now
curl -s http://localhost:8787/api/live
```

`wrangler dev` uses a local D1 file under `.wrangler/`. Apply the schema once with `npx wrangler d1 migrations apply <db-name> --local` from `apps/worker`. Running the scheduled handler locally hits the real portal, so keep it to the 1-per-minute cron.

**Web** (`apps/web`)

```bash
NEXT_PUBLIC_API_BASE=http://localhost:8787 npm run dev -w apps/web
```

Leave `NEXT_PUBLIC_API_BASE` unset to use the mock data in `apps/web/src/mock/`, which needs no worker.

**Analytics** (`packages/analytics`)

```bash
npm test -w packages/analytics
```

**Seed history from PACked** (optional, see the licence note in Credits)

```bash
npx tsx scripts/import-packed.ts                         # dry run: fetch, inspect, summarise
npx tsx scripts/import-packed.ts --out packed-seed.sql --drop-closed
npx wrangler d1 execute <db-name> --local --file packed-seed.sql
```

Each workspace's own README has more detail.

## Deployment

Everything runs on Cloudflare's free tier.

1. `npx wrangler d1 create warriorwatch` and put the database ID in `apps/worker/wrangler.toml`.
2. `npx wrangler d1 migrations apply warriorwatch --remote` from `apps/worker`.
3. `npm run deploy -w apps/worker`. This deploys the API and two cron triggers: every minute for occupancy, daily for hours.
4. Create a Cloudflare Pages project for `apps/web` with `NEXT_PUBLIC_API_BASE` set to the worker's URL.
5. Point an uptime monitor at `/api/health` ([recipe](docs/launch/ops.md)).

Optional: set `ALERT_WEBHOOK` on the worker to get a Discord or Slack message when scraping breaks.

## Data caveats

Read these before you trust a number.

- **It's scraped.** The data comes from a public page that wasn't built as an API. If Athletics changes the page, the scraper breaks until someone fixes the parser. `/api/health` reports it.
- **Counts are tap-ins, not a camera.** The portal counts WatCard taps at the door. People who leave without tapping out keep the count high until staff correct it.
- **Staff edit and reset counts.** Counts can jump when staff correct them by hand. The portal also keeps the last number overnight while a room is closed, so we mark closed hours from the posted schedule and ignore the count then.
- **Stale banner.** When the portal shows its own "results not live" warning, `/api/live` returns `stale: true`.
- **Hours are regular hours.** Holiday closures and one-off bookings aren't in them. Check the official calendar for those.
- **Forecasts need history.** "Usual" and "best time" are weak for the first couple of weeks of each term type. The site and API say how many days a number is based on.
- **robots.txt.** As of 2026-10-28, `warrior.uwaterloo.ca/robots.txt` disallows all paths for every crawler except Googlebot. We read one page once a minute, identify ourselves in the User-Agent with a contact address, never log in, and only use data the portal shows to anyone. If UW Athletics asks us to stop or change how we collect it, we will.

Contact: the address in `SOURCE.userAgent` in [`packages/contract/src/index.ts`](packages/contract/src/index.ts), or open an issue.

## Credits

Other UW students got here first. WarriorWatch builds on what they showed was possible.

- **[uwpac](https://github.com/benz206/uwpac)** ([uwpac.vercel.app](https://uwpac.vercel.app)) by benz206. Next.js tracker sampling every 30 minutes with a weekly heatmap and typical-weekday prediction.
- **[PACked](https://github.com/pauligwe/PACked)** ([uwpacked.vercel.app](https://uwpacked.vercel.app)) by pauligwe. Python scraper every 15 minutes, a heatmap, and a recommender that finds quiet gym slots around your class schedule. Its repo has no licence, so we haven't imported its history; `scripts/import-packed.ts` is ready if the author agrees.
- **[Waitz](https://waitz.io/waterloo)**, the live occupancy app for UW's libraries. The design bar for how a "how busy is it" app should look.
- **[Spots](https://github.com/notAkki/spots)** by notAkki, the UW empty-classroom finder. Showed that a small student-built tool can spread across campus when it answers one question well.

The data belongs to UW Athletics' InnoSoft Fusion portal. This project is unofficial.

## Contributing

Issues and PRs welcome. Keep the scraper polite (one request per minute to the occupancy page, sequential facility pages at least 500 ms apart) and change `packages/contract` only in its own commit. If you build something on the API, open a PR to list it here.

## Licence

[MIT](LICENSE). The licence covers this code, not the portal's data.
