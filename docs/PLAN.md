# Waterloo Gym Visualizer — Build Plan

Working name: **WarriorWatch** (rename later). Goal: the page every UW student opens before walking to the PAC or CIF. Live crowding, what it usually looks like at this hour, the best time to go today, and a public API so other students can build on it.

---

## 1. What the recon found (2026-10-27, ~10 PM)

**The data is public and server-rendered. No login, no JavaScript needed.**

| Fact | Detail |
|---|---|
| Live page | `https://warrior.uwaterloo.ca/FacilityOccupancy` returns 200 to a plain `curl`, 75 KB of HTML |
| Why Cmd-F finds it but you can't see it | Each facility card is in the HTML. Desktop and mobile layouts are both rendered, which is why every string appears twice. The "Are you still there?" modal from the Fusion session timer overlays it after 2 minutes idle. |
| Raw headcount, not just percent | `<canvas class="occupancy-chart" data-occupancy="42" data-remaining="33">` plus `Max Occupancy: 75`. So we get **42 people**, not just 56%. |
| Facilities tracked | 7, not 3 or 4: CIF Fitness Centre (100), PAC 1F Free Weights (75), Warrior Zone (60), PAC 2F Cardio (50), PAC 2F Weight Machines (40), PAC 1F Functional (25), Esports Lounge PCs (20) |
| Refresh mechanism | None in the browser. The SignalR hub on the site is only for SSO login. The page is a snapshot at request time, so sampling = re-fetching the page. |
| Facility directory | `/Facility` lists 44 facilities with stable GUIDs. `/Facility/GetFacility?facilityId=…` gives type, area, max occupancy and **regular hours per weekday** (server-rendered). |
| Facility calendar | `/Facility/GetSchedule?facilityId=…` renders a DevExpress scheduler. Its event data source is loaded client-side and was not visible in the static HTML. Needs a browser network trace (unknown, see Phase D). |
| Platform | InnoSoft Fusion (same vendor as most Canadian university rec portals). Counts come from WatCard tap-in/out plus staff manual edits. |

**Prior art (all exist, none has traction):**

| Project | What it does | Gap |
|---|---|---|
| [uwpac.vercel.app](https://github.com/benz206/uwpac) | Next.js, scrapes every **30 min**, Postgres, weekly heatmap, "typical weekday" prediction. 6 facilities. 0 stars. | 30-min samples miss the dynamics. Needs Vercel Pro. No API docs, no term awareness, no hours, no "best time to go". |
| [uwpacked.vercel.app](https://github.com/pauligwe/PACked) | Python scraper every 15 min, SQLite, FastAPI, React. Heatmap + "quiet slot around my class schedule" recommender. Commits its `occupancy.db` to git. | Personal-project polish. Several features marked planned. |
| liyuxuan tracker | Saves data over time, plots a curve. | Script, not a product. |
| [Waitz](https://waitz.io/waterloo) | Libraries only, Wi-Fi density. The UX benchmark. | Does not cover gyms. |

Opportunity: nobody has combined **1-minute sampling + raw counts + hours + term-aware forecasts + a clean public API + a Waitz-grade UI**. That combination is what makes a thing spread the way Spots did.

---

## 2. Product scope (v1, what ships at launch)

**Pages**
1. **Live** (home). One card per facility: count / max, ring, a plain-English label (Quiet / Moderate / Busy / Packed), "vs usual for Tuesday 10 PM" delta, open/closed from hours, and a 3-hour sparkline. Sorted by building (PAC, CIF). Auto-refreshes.
2. **Facility detail**. Today's curve vs typical, 7×24 heatmap, best windows today, regular hours, link to the official calendar.
3. **Plan my workout**. Pick facility + day → ranked quiet windows. (Optional: paste Quest schedule like PACked. v1.1.)
4. **About / API**. Data source, update cadence, caveats, API docs, credit to the prior projects.

**Public API** (JSON, CORS open, cached at the edge)
- `GET /api/live` — all facilities now
- `GET /api/history?facility=&from=&to=&res=5m|1h` — raw or bucketed
- `GET /api/typical?facility=&weekday=` — hour-of-day expectation + confidence
- `GET /api/facilities` — registry with hours
- `GET /api/best?facility=&date=` — ranked windows

**Distribution**
- PWA (add to home screen), OpenGraph image that shows live numbers, embeddable `<iframe>`/`<script>` widget, optional Discord webhook ("PAC free weights under 30% now").

---

## 3. Architecture

```
┌──────────────┐  cron, every 1 min   ┌──────────────┐
│ warrior.uwa… │ ◄────────────────────│ Scraper      │  parse 7 cards, store only on change
│ /FacilityOcc │                      │ (Worker)     │  + daily: 44 facility pages → hours
└──────────────┘                      └──────┬───────┘
                                             ▼
                                      ┌──────────────┐
                                      │ DB (SQLite)  │  readings(facility_id, ts, count, max)
                                      │              │  facilities, hours, events, rollups
                                      └──────┬───────┘
                                             ▼
                        ┌────────────────────┴───────────────────┐
                        │ API (same Worker) /api/*  edge-cached   │
                        └────────────────────┬───────────────────┘
                                             ▼
                              ┌──────────────────────────┐
                              │ Web (static + client)     │
                              └──────────────────────────┘
```

**Recommended host: Cloudflare** (Workers cron supports 1-minute triggers on the free plan, D1 is SQLite, Pages hosts the site, one account, $0/month). Alternative: Vercel + Neon Postgres, but 1-minute cron needs Vercel Pro ($20/mo). Decision needed (see §6).

**Stack:** TypeScript end to end. Scraper + API = Cloudflare Worker (Hono). Web = Next.js or Astro + React, Tailwind, Recharts/uPlot. Analytics = a pure TS package with unit tests, shared by API and web. Monorepo with pnpm workspaces.

**Politeness:** 1 request/minute to one 75 KB page, descriptive User-Agent with a contact email, store readings only when a count changes (expect ~5–15% of samples to change). Daily hours scrape is 44 requests. This is well under anything the portal would notice.

---

## 4. Analytics (the part that makes it better than the others)

- **Typical curve**: median + IQR per (facility, weekday, 15-min slot), computed separately for term buckets: regular term, reading week, exam period, holiday/closed. Term calendar from the UW registrar's important-dates page, stored as JSON.
- **Confidence**: show "based on N Tuesdays" and widen the band when N is small. Honest about the first weeks.
- **Now vs usual**: current count minus typical median at this slot, rendered as "quieter than usual" / "busier than usual" with a threshold tied to IQR.
- **Best windows today**: slots in the next 12 h where typical ≤ 40% of max and facility is open, ranked.
- **Short-term trend**: slope of last 20 minutes, arrow on the card.
- **Freshness**: measure how often the official count actually changes (first-day finding) and display "updated X min ago" from the last *change*, not the last fetch.

---

## 5. Execution: phases and agents

Phase 0 is me, before any agent starts: repo scaffold, the **data contract** (facility registry JSON with the 7 GUIDs, DB schema, API response types, analytics interfaces). Agents build against that contract so their pieces fit.

Then **five Opus 5.5 agents in parallel**, each with its own worktree/branch:

| Agent | Owns | Done when |
|---|---|---|
| **A. Ingest + API** | Worker cron scraper, D1 schema + migrations, change-only storage, hours scraper, `/api/*` with edge caching, rate limits | Running locally against real site, 1 hour of real readings in D1, all endpoints returning typed JSON, parser unit tests with the saved HTML fixture |
| **B. Analytics lib** | `packages/analytics`: typical curves, term buckets, confidence, best windows, trend, labels. Pure functions, no I/O | ≥ 90% test coverage on synthetic + fixture data; API docs for each function |
| **C. Web app** | Live, facility detail, plan, about pages. Mobile-first, dark mode, PWA, OG image route, embed widget. Builds against mock API first, then real | Lighthouse ≥ 95 mobile, works on phone width, Waitz-level polish |
| **D. Schedule recon + ingest** | Use a real browser to capture how `/Facility/GetSchedule` loads events; ingest facility calendars (pool lanes, main gym bookings, varsity closures) into `events`; expose `/api/events` | Either a working events ingest, or a written finding that it needs auth/is not feasible, in ≤ 2 hours |
| **E. Launch kit** | README, API docs page content, seed-data import from PACked's SQLite (with credit) if license allows, LinkedIn post draft, domain shortlist, uptime monitor, Discord webhook | Docs render, seed import script works, post draft ready |

Phase 2 (me + one agent): integrate branches, deploy to Cloudflare, 48-hour soak with real data, fix what breaks, then launch.

**Rough timeline:** Phase 0 ~1 h. Phase 1 agents ~3–5 h wall clock. Phase 2 over two days (needs real data to accumulate).

---

## 6. Decisions I need from you

1. **Approve the scope above?** Anything to cut or add for v1?
2. **Hosting**: Cloudflare (free, 1-min cron) or Vercel (familiar, $20/mo for 1-min cron)? I recommend Cloudflare.
3. **Where the code lives**: a new folder on your Mac (I'll ask you to pick one) and a new public GitHub repo under your account. Name suggestion: `warriorwatch`.
4. **Seed history from PACked's committed SQLite?** It has no license, so I'd open an issue asking first and credit them regardless. Say no and we start from zero and show confidence bands honestly.

---

## 7. Risks

- **HTML changes** on the Fusion portal break the parser. Mitigation: parser tests on a saved fixture, alerting when 0 cards parse, the `data-occupancy` attribute is a stable vendor pattern.
- **Count accuracy** depends on tap-in/out and manual staff resets. We show it as-is and label the source.
- **Terms of use**: the portal has no robots.txt disallow on this path (to be verified in Phase 0) and the data is public. We keep volume tiny and identify ourselves. If Athletics asks us to stop, we stop.
- **Cold start**: forecasts are weak for ~2 weeks. Confidence bands and "N days of data" labels handle this honestly. Seeding from PACked shortens it.
