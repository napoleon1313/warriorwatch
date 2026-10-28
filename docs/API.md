# WarriorWatch API

Free, read-only JSON for University of Waterloo gym occupancy. No key, no sign-up. CORS is open (`Access-Control-Allow-Origin: *`), so you can call it straight from a browser.

```
https://warriorwatch-api.warriorwatch-worker.workers.dev/api
```

The production host isn't fixed yet. Every example below uses `$API`:

```bash
export API="https://warriorwatch-api.warriorwatch-worker.workers.dev/api"        # production
export API="http://localhost:8787/api"     # local worker (wrangler dev)
```

The source of truth for every shape on this page is [`packages/contract/src/index.ts`](../packages/contract/src/index.ts). If this page and that file disagree, the file wins.

## Basics

**Facilities.** Pass either a slug or the portal's GUID wherever a `facility` parameter is asked for.

| Slug | Facility | Max |
|---|---|---|
| `pac-free-weights` | PAC 1st Floor, Free Weights | 75 |
| `pac-functional` | PAC 1st Floor, Functional | 25 |
| `pac-cardio` | PAC 2nd Floor, Cardio | 50 |
| `pac-machines` | PAC 2nd Floor, Weight Machines | 40 |
| `warrior-zone` | Warrior Zone | 60 |
| `cif-fitness` | CIF Fitness Centre | 100 |
| `esports-lounge` | Esports & Gaming Lounge, PCs | 20 |

These 7 have live counts. `/api/facilities` lists all 44 spaces on the portal, with hours, but only these 7 have occupancy data. Slugs won't change.

**Time.** Every timestamp in a response is ISO 8601 in UTC (`2026-10-28T01:55:00.000Z`). "Today", weekdays, `date` and `minute` are in Waterloo local time (America/Toronto). Weekday `0` is Sunday.

**Labels.** `label` is one of `closed`, `quiet`, `moderate`, `busy`, `packed`, from count ÷ max:

| Label | Share of max |
|---|---|
| `quiet` | under 35% |
| `moderate` | 35% to under 60% |
| `busy` | 60% to under 85% |
| `packed` | 85% and up |
| `closed` | outside regular hours, whatever the count says |

**Caching.** Responses are cached at the edge. The `Cache-Control` header says for how long. Polling `/api/live` more than twice a minute gets you the same answer.

**Rate limit.** 60 requests per minute per IP. Past that you get `429`.

**Errors.** Non-2xx responses have a JSON body:

```json
{ "error": "unknown facility: pac-squash" }
```

`400` bad parameter, `404` unknown facility or route, `429` rate limited, `500` our fault.

## Endpoints

| Endpoint | What it gives you | Cache |
|---|---|---|
| [`GET /live`](#get-live) | Every live facility right now | 30 s |
| [`GET /facilities`](#get-facilities) | All 44 facilities with regular hours | 1 h |
| [`GET /history`](#get-history) | Past counts for one facility | 5 min |
| [`GET /typical`](#get-typical) | Usual crowd by time of day | 1 h |
| [`GET /best`](#get-best) | Quietest windows for a day | 15 min |
| [`GET /events`](#get-events) | Bookings and closures from the facility calendar | 15 min |
| [`GET /health`](#get-health) | Is the scraper running | none |

---

### GET /live

All 7 live facilities, PAC first.

```bash
curl -s "$API/live"
```

```json
{
  "fetchedAt": "2026-10-28T01:55:00.000Z",
  "stale": false,
  "facilities": [
    {
      "id": "7c59cbfb-ea06-46e0-8ec7-06739ccaec45",
      "name": "PAC - 1st Floor - Free Weights",
      "building": "Physical Activities Complex",
      "count": 42,
      "max": 75,
      "pct": 56,
      "label": "moderate",
      "open": true,
      "typical": 38,
      "delta": 4,
      "trend": -1.5,
      "lastChange": "2026-10-28T01:52:00.000Z",
      "sparkline": [51, 53, 55, 54, 58, null, 49, 47, 46, 44, 43, 42]
    },
    {
      "id": "b08d4801-c28c-4eba-8602-8e904ae0568c",
      "name": "PAC - 2nd Floor - Weight Machines",
      "building": "Physical Activities Complex",
      "count": 31,
      "max": 40,
      "pct": 78,
      "label": "busy",
      "open": true,
      "typical": null,
      "delta": null,
      "trend": null,
      "lastChange": "2026-10-28T01:49:00.000Z",
      "sparkline": [24, 26, 29, 31]
    }
  ]
}
```

The real response has all 7 facilities and a full sparkline (36 points: 3 hours at 5 minutes, oldest first). Two are shown here to keep the page short.

| Field | Meaning |
|---|---|
| `fetchedAt` | When we last fetched the portal |
| `stale` | `true` when the portal itself shows its "results not live" banner. The numbers may be old. |
| `count`, `max` | Headcount and the posted maximum, straight from the portal |
| `pct` | `count / max × 100`, rounded |
| `open` | From the facility's regular hours at `fetchedAt`. Doesn't know about holiday closures. |
| `typical` | Median count for this weekday, 15-minute slot and term type. `null` until there's enough history. |
| `delta` | `count - typical`. Positive means busier than usual. |
| `trend` | Change over the last 20 minutes, in people per 10 minutes. Negative means emptying out. |
| `lastChange` | When the count last *changed*. The portal can sit on one number for a while; this tells you how fresh it is. |
| `sparkline` | Last 3 hours, 5-minute steps, oldest first. `null` where we have no sample. |

### GET /facilities

All 44 facilities from the portal's directory, including courts, pools and fields that have no live count.

```bash
curl -s "$API/facilities"
```

```json
{
  "updatedAt": "2026-10-28T13:15:00.000Z",
  "facilities": [
    {
      "id": "b2d98ff8-e37a-42da-bf72-06b259ff1a2c",
      "name": "CIF Fitness Centre",
      "building": "Columbia Icefield Building",
      "path": ["Columbia Icefield Building", "CIF Fitness Centre"],
      "type": "Fitness Centre",
      "area": "6000 Square feet",
      "maxOccupancy": 100,
      "liveOccupancy": true,
      "hours": {
        "Sunday": "9:00 AM - 11:59 PM",
        "Monday": "6:00 AM - 11:59 PM",
        "Tuesday": "6:00 AM - 11:59 PM",
        "Wednesday": "6:00 AM - 11:59 PM",
        "Thursday": "6:00 AM - 11:59 PM",
        "Friday": "6:00 AM - 11:59 PM",
        "Saturday": "9:00 AM - 11:59 PM"
      }
    }
  ]
}
```

`hours` strings are copied exactly as the portal shows them, or `"Closed"`. A missing day means the portal didn't list it. Hours are refreshed once a day.

### GET /history

Past readings for one facility.

| Param | Required | Default | Notes |
|---|---|---|---|
| `facility` | yes | | slug or GUID |
| `from` | no | 24 h ago | ISO timestamp |
| `to` | no | now | ISO timestamp |
| `res` | no | `5m` | `raw`, `5m`, `15m` or `1h` |

```bash
# last 24 hours at 5-minute resolution
curl -s "$API/history?facility=pac-free-weights"

# one evening, hourly
curl -s "$API/history?facility=cif-fitness&from=2026-10-27T21:00:00Z&to=2026-10-28T04:00:00Z&res=1h"
```

```json
{
  "facilityId": "b2d98ff8-e37a-42da-bf72-06b259ff1a2c",
  "from": "2026-10-27T21:00:00.000Z",
  "to": "2026-10-28T04:00:00.000Z",
  "resolution": "1h",
  "points": [
    { "ts": "2026-10-27T21:00:00.000Z", "count": 58, "max": 100 },
    { "ts": "2026-10-27T22:00:00.000Z", "count": 66, "max": 100 },
    { "ts": "2026-10-27T23:00:00.000Z", "count": 71, "max": 100 },
    { "ts": "2026-10-28T00:00:00.000Z", "count": 63, "max": 100 },
    { "ts": "2026-10-28T01:00:00.000Z", "count": 49, "max": 100 },
    { "ts": "2026-10-28T02:00:00.000Z", "count": 30, "max": 100 },
    { "ts": "2026-10-28T03:00:00.000Z", "count": 12, "max": 100 }
  ]
}
```

`raw` returns stored rows as-is. We store a row when the count changes, plus one per hour if it doesn't, so `raw` is uneven in time. Bucketed resolutions are even and easier to chart.

### GET /typical

What a facility usually looks like across a day, in 15-minute slots.

| Param | Required | Default | Notes |
|---|---|---|---|
| `facility` | yes | | slug or GUID |
| `weekday` | no | today | `0` (Sunday) to `6` |
| `term` | no | current | `term`, `reading-week`, `exams`, `break`, `holiday` |

```bash
# Tuesdays during regular term
curl -s "$API/typical?facility=pac-free-weights&weekday=2&term=term"
```

```json
{
  "facilityId": "7c59cbfb-ea06-46e0-8ec7-06739ccaec45",
  "weekday": 2,
  "term": "term",
  "slots": [
    { "minute": 360, "median": 6, "p25": 4, "p75": 9, "n": 5 },
    { "minute": 375, "median": 9, "p25": 6, "p75": 12, "n": 5 },
    { "minute": 1080, "median": 61, "p25": 54, "p75": 68, "n": 5 },
    { "minute": 1095, "median": 63, "p25": 57, "p75": 70, "n": 4 }
  ]
}
```

`minute` is minutes after local midnight (`1080` = 6:00 PM). `p25`/`p75` give the usual spread. `n` is how many distinct days fed the slot. Treat anything with `n` under 3 as a guess. Slots with no data have `median: null`. The real response has all 96 slots.

### GET /best

The quietest open windows for a facility on one day, quietest first.

| Param | Required | Default |
|---|---|---|
| `facility` | yes | |
| `date` | no | today (`YYYY-MM-DD`, local) |

```bash
curl -s "$API/best?facility=cif-fitness&date=2026-10-28"
```

```json
{
  "facilityId": "b2d98ff8-e37a-42da-bf72-06b259ff1a2c",
  "date": "2026-10-28",
  "windows": [
    { "start": "2026-10-28T10:00:00.000Z", "end": "2026-10-28T11:30:00.000Z", "expected": 14, "pct": 14, "label": "quiet" },
    { "start": "2026-10-28T13:30:00.000Z", "end": "2026-10-28T14:30:00.000Z", "expected": 22, "pct": 22, "label": "quiet" },
    { "start": "2026-10-28T19:00:00.000Z", "end": "2026-10-28T20:00:00.000Z", "expected": 31, "pct": 31, "label": "quiet" }
  ],
  "confidence": "medium",
  "daysOfData": 9
}
```

`start` and `end` are UTC; convert them for display (10:00 Z is 6:00 AM in Waterloo during daylight time). Windows only cover open hours. `confidence` is `low` while `daysOfData` is small. Show it to your users.

### GET /events

Bookings, varsity practices and closures from a facility's calendar, best effort.

| Param | Required | Default |
|---|---|---|
| `facility` | yes | |
| `from` | no | now |
| `to` | no | 7 days from `from` |

```bash
# PAC Small Gym has no slug, so use its GUID
curl -s "$API/events?facility=4c8a432d-409a-46eb-a1f5-a92bf3b609a2&from=2026-10-28T00:00:00Z&to=2026-10-29T00:00:00Z"
```

```json
{
  "facilityId": "4c8a432d-409a-46eb-a1f5-a92bf3b609a2",
  "from": "2026-10-28T00:00:00.000Z",
  "to": "2026-10-29T00:00:00.000Z",
  "events": [
    {
      "facilityId": "4c8a432d-409a-46eb-a1f5-a92bf3b609a2",
      "title": "Open Rec Badminton",
      "start": "2026-10-28T16:00:00.000Z",
      "end": "2026-10-28T18:00:00.000Z",
      "kind": "Open Rec"
    }
  ]
}
```

`kind` is our guess from the title (`Open Rec`, `Varsity`, `Intramural`, `Booking`, `Closed`) and can be `null`. This endpoint depends on calendar data the portal loads in the browser; if we can't get it for a facility, `events` is empty.

Only the 7 live facilities have slugs. For courts, pools and studios, use the GUID from `/api/facilities`.

### GET /health

For uptime monitors. Never cached.

```bash
curl -s "$API/health"
```

```json
{
  "ok": true,
  "lastScrape": "2026-10-28T01:55:00.000Z",
  "lastOkScrape": "2026-10-28T01:55:00.000Z",
  "cards": 7
}
```

`ok` is `false` when the last successful scrape is too old or found fewer than 7 facilities. `cards` is how many facilities the last scrape found.

## Small examples

Current count for one facility, with `jq`:

```bash
curl -s "$API/live" | jq -r '.facilities[] | select(.id=="7c59cbfb-ea06-46e0-8ec7-06739ccaec45") | "\(.name): \(.count)/\(.max) (\(.label))"'
```

Every quiet facility right now:

```bash
curl -s "$API/live" | jq -r '.facilities[] | select(.open and .label=="quiet") | .name'
```

In the browser:

```js
const res = await fetch("https://warriorwatch-api.warriorwatch-worker.workers.dev/api/live");
const { facilities } = await res.json();
for (const f of facilities) console.log(`${f.name}: ${f.pct}% (${f.label})`);
```

TypeScript users can import the types from `packages/contract/src/index.ts` instead of writing their own.

## Fair use

The counts come from a public page we fetch once a minute. Please hit our API, not the portal; that's half the reason it exists. If you build something on it, open an issue or PR to get it listed in the README.
