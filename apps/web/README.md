# apps/web — WarriorWatch site

Next.js 15 (App Router) + Tailwind v4, deployed to **Cloudflare Pages**. Reads only the public API in
`packages/contract/API.md`. With no API configured it runs on synthetic data from `src/mock/`, built from the
contract types.

```bash
npm run dev        # next dev on :3000 (pages only; no /og/*)
npm run build      # static export to ./out
npm run preview    # wrangler pages dev: ./out + the OG Pages Function, like production (:8788)
npm test           # vitest: hours parser, Toronto time helpers, mock API
npm run typecheck  # site + Pages Function
npm run deploy     # build + wrangler pages deploy
```

## Pages

| Route | What | Data |
|---|---|---|
| `/` | Live cards by building: ring, count/max, label, "vs usual", trend, 3-h sparkline, "updated X ago" (from `lastChange`), open/closes-at | `/api/live` every 60 s while visible, `/api/facilities` once |
| `/f/[slug]` | Today's curve over the typical p25–p75 band, best windows today, 7×24 heatmap, regular hours, official calendar link, embed snippet | `live`, `history` (today, 5m), `best`, `typical` × 7 weekdays, `facilities` |
| `/plan` | Facility + day picker (next 7 days), ranked quiet windows, usual curve with windows shaded. `?f=&d=` is shareable | `best`, `typical`, `facilities` |
| `/about` | What the count is, how often it changes, that it's scraped and unaffiliated, label cut-offs (from `BUSY_THRESHOLDS`), API docs rendered from `packages/contract/API.md` at build time | — |
| `/embed/[slug]` | 120-px iframe widget, `?theme=light\|dark` | `/api/live` |
| `/og/live`, `/og/[slug]` | 1200×630 PNG with live numbers | Pages Function → `/api/live` |

## Hosting decision: static export + one Pages Function

The brief offered `output: "export"` or `@cloudflare/next-on-pages`. We use **static export for every page and a
plain Cloudflare Pages Function (`functions/og/[slug].ts`) for the OG images**:

- `@cloudflare/next-on-pages` is deprecated (npm points to OpenNext) and its peer range stops at `next@15.5.2`.
  That would pin us below the 15.5.x security releases (the December 2025 RSC fixes). Not acceptable for a public site.
- Static export alone can't serve OG images with live numbers, since they need code running at request time.
- A Pages Function sits next to the static files in the same Pages project, so there's still one deploy. It renders with
  satori + resvg compiled to WASM (`@cf-wasm/og`) and is edge-cached for 60 s.
- Every page is plain HTML on Cloudflare's CDN. Live numbers are fetched client-side, which keeps Lighthouse at 100
  and the site within the free tier.
- If we ever need SSR, the path is OpenNext on Workers (`@opennextjs/cloudflare`), not next-on-pages.

Headers (`public/_headers`): `/embed/*` drops `X-Frame-Options` and allows any `frame-ancestors`; everything else is
`SAMEORIGIN`.

## Configuration

| Variable | Where | Effect |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | Pages build **and** runtime env | Worker origin, with or without a trailing `/api`. Unset means demo data. Read by the browser bundle (inlined at build) and by the OG function (runtime), so switching to the real worker needs no code change, only a rebuild. |
| `API_BASE` | Pages runtime env (optional) | Overrides the above for the OG function only. |
| `NEXT_PUBLIC_SITE_URL` | build | Absolute origin for OG/canonical URLs and embed snippets (default `https://warriorwatch.pages.dev`). |

Deployed 2026-10-28 to the Pages project `warriorwatch` at https://warriorwatch.pages.dev. `.env.production` holds the public API and site URLs, so `npm run deploy -w apps/web` builds against the live worker and uploads `out`. The OG function reads `API_BASE` from a Pages secret (`wrangler pages secret put API_BASE --project-name warriorwatch`).

## Demo data and switches (mock mode only)

`src/mock/generate.ts` is deterministic: the same instant gives the same count everywhere (cards, curves, OG).
Shapes: small 7–8 AM bump, lunch bump, a big 5–8 PM peak, flatter weekends, Fridays lighter in the evening,
counts that move every 3 min like the real tap counter. The Esports lounge is mostly 0. Typical curves pretend we
started collecting 20 days ago, so pages honestly say "based on 2 Wednesdays".

Append to any page URL:

- `?at=18:30` (Toronto, today) or `?at=<ISO>`: move the whole UI's clock, e.g. to see open gyms at 3 AM
- `?mock=fresh`: day 2 of collection; empty typical curves and empty states
- `?mock=stale`: the portal's "results not live" banner
- `?mock=down`: API unreachable

These are ignored once `NEXT_PUBLIC_API_BASE` is set. `/og/*?at=<ISO>` does the same for the OG function in demo mode.

## Design notes

- Labels and colours: `busyLabel()` and `BUSY_THRESHOLDS` from the contract, never re-derived. `src/lib/labels.ts`
  only maps label to words and colour tokens.
- Charts are hand-rolled SVG (ring, sparkline, day curve, heatmap) instead of uPlot/Recharts. They render with
  zero chart-library JS, draw at real pixel width (crisp 11-px text on phones), and share code with the OG cards.
  The day curve scrubs with pointer or arrow keys.
- Accessibility: every ring has a full spoken reading ("42 of 75 people, 56% full, busy"), charts carry text
  summaries, skip link, visible focus, 44-px tap targets, contrast checked in both themes (Lighthouse a11y 100).
- Time: everything shown is `America/Toronto` (`src/lib/time.ts`, DST-safe); everything stored or sent is UTC ISO.
- Hours parsing (`src/lib/hours.ts`) covers all 19 variants in `facilities.json`, including `"6:00 - 12:30 AM"`.
  It's display-only. When `@warriorwatch/analytics` lands, its `isOpen` is canonical and this can import it.
- PWA: `manifest.webmanifest`, maskable icons (`node scripts/icons.mjs` regenerates them), an install toast on the
  second visit (real prompt on Chrome/Android, Share-sheet tip on iOS). No service worker yet: Lighthouse 12+
  no longer scores PWA, and stale-cache bugs on a live-data site are worse than no offline mode.

## Lighthouse (mobile, local `wrangler pages dev`, 2026-10-28)

| Page | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| `/` | 100 | 100 | 100 | 100 |
| `/f/pac-free-weights` | 96 | 100 | 100 | 100 |
| `/plan` | 100 | 100 | 100 | 100 |
| `/about` | 100 | 100 | 100 | 100 |

## Contract gaps found while building against it

1. **No "vs usual" verdict on `LiveFacility`.** Analytics defines `nowVsTypical` with an IQR threshold, but `/api/live`
   only exposes `typical` and `delta`, so the web can't say "busier than usual" without inventing a threshold. The UI
   shows the signed number ("+8 vs a usual Wed 6:30 PM (68)"). Suggest adding `verdict: "quieter" | "usual" | "busier" | null`.
2. **No trend cut-off.** `trend` is people/10 min but nothing says what counts as "steady". The web uses ±1/10 min
   (`TREND_STEADY` in `src/components/Trend.tsx`). Suggest exporting `TREND_STEADY` from the contract.
3. **Heatmap costs 7 requests.** `/api/typical` takes one weekday. Suggest `weekday=all` returning all seven.
4. **`/api/best` for today:** unspecified whether windows already over are included. The web filters `end > now`
   itself, so either answer works; worth stating in API.md.
5. **No slug on `LiveFacility` / `Facility`.** Derivable from `FACILITY_SLUGS`, fine, but `slug` on the response would
   help third-party API users.
6. **`SOURCE.userAgent` contains a GitHub handle and an email.** It isn't shown anywhere in the UI, but the site is meant
   to be anonymous and the worker sends that string to the portal. Flagging for the owner.
