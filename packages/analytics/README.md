# @warriorwatch/analytics

Pure TypeScript, zero I/O, zero runtime deps (only types and `busyLabel` from `@warriorwatch/contract`). Consumed by `apps/worker` (to build `typical` rows and `/api/best`) and `apps/web` (to render bands, labels, trends client-side when needed).

```ts
import {
  termBucketFor, localSlot, buildTypical, nowVsTypical, trend,
  bestWindows, confidence, isOpen, termCalendar, type TermCalendar,
} from "@warriorwatch/analytics";
import calendar from "@warriorwatch/analytics/term-calendar.json" with { type: "json" };
```

The package exports its TypeScript source (`src/index.ts`), like the contract does. Bundlers (wrangler/esbuild, Vite, Next with `transpilePackages`) and Node ≥ 23.6 (type stripping) load it directly. `npm run build` also emits plain JS + `.d.ts` to `dist/`.

Time zone: every function that turns an instant into a wall-clock time takes an optional `tz` argument (default `"America/Toronto"`). The conversion uses `Intl.DateTimeFormat` parts only, with no tz library. Inputs and outputs are UTC ISO strings.

Scripts: `npm run typecheck`, `npm test` (vitest + v8 coverage, fails below 90%), `npm run build`.

## Functions

### `termBucketFor(date, calendar = termCalendar, tz?) → TermBucket`
`date` is a `Date` (converted to its Toronto date) or a local `"YYYY-MM-DD"`. Ranges win over the term default, by priority `holiday > reading-week > exams > break`. Days inside a term with no range are `"term"`; days outside every term are `"break"`.
```ts
termBucketFor("2026-10-14");                        // "reading-week"
termBucketFor("2026-10-12");                        // "holiday" (Thanksgiving, inside Reading Week)
termBucketFor(new Date("2026-12-15T15:00:00Z"));    // "exams"
termBucketFor("2027-01-05");                        // "break" (classes start Jan 11)
```

### `localSlot(ts, tz = "America/Toronto") → { weekday, minute }`
Weekday (0 = Sunday) and the 15-minute slot start in minutes since local midnight.
```ts
localSlot("2026-10-28T13:07:00Z");  // { weekday: 3, minute: 540 }  (Wed 09:07 EDT)
localSlot("2026-03-08T07:00:00Z");  // { weekday: 0, minute: 180 }  (03:00 EDT, 02:xx skipped)
```

### `buildTypical(readings, calendar = termCalendar, options?) → TypicalResponse[]`
Returns one `TypicalResponse` per (facility, term bucket, weekday) that has data, each with all 96 slots.
- Change-only readings are **forward-filled to a 1-minute grid**. A count holds until the next reading, for at most `maxGapMinutes` (default 90, about 1.5× the hourly heartbeat). A longer gap means the scraper was down, and those minutes stay unknown.
- Each local day contributes the mean of its filled minutes to a slot. `median`/`p25`/`p75` are then taken across days (linear interpolation, rounded to 0.1), and `n` = distinct local days with data in that slot.
- Slots are local wall time. On the fall-back day, both 01:xx hours land in the same slots (still one day). On the spring-forward day, the 02:xx slots get nothing.
- Pass `until: now` so the newest reading is not carried into the future.
```ts
const groups = buildTypical(readings, termCalendar, { until: new Date() });
const wedTerm = groups.find((g) => g.facilityId === id && g.term === "term" && g.weekday === 3);
wedTerm?.slots[36]; // { minute: 540, median: 25, p25: 17.5, p75: 32.5, n: 4 }
```

### `nowVsTypical(count, slot) → { delta, verdict }`
`delta = count − median`. The verdict is `"busier"` / `"quieter"` when |delta| > max(2 people, 0.5 × IQR), otherwise `"usual"`. With no median, it returns `{ delta: null, verdict: "usual" }`.
```ts
nowVsTypical(31, { minute: 600, median: 20, p25: 10, p75: 30, n: 12 }); // { delta: 11, verdict: "busier" }
nowVsTypical(22, { minute: 600, median: 20, p25: 19, p75: 21, n: 3 });  // { delta: 2, verdict: "usual" }
```

### `trend(last20min) → number | null`
Least-squares slope of count over time, in people per 10 minutes, rounded to 0.1. Pass one facility's readings from the last 20 minutes, in any order. Returns `null` with fewer than 3 readings.
```ts
trend([{ ts: "…14:00Z", count: 10 }, { ts: "…14:05Z", count: 12 }, { ts: "…14:10Z", count: 14 }]); // 4
```

### `bestWindows(typical, hours, date, max, options?) → BestWindow[]`
Finds quiet windows on local `date` (`"YYYY-MM-DD"` or a `Date`) from that weekday/term's `slots`:
- A slot qualifies when its median is ≤ 40% of `max` and the facility is open for the whole slot. That includes after-midnight spill from the previous day's hours.
- Adjacent qualifying slots merge, and runs shorter than 30 minutes are dropped.
- Windows are ranked quietest first (ties go to the earlier window), at most 5.
- `expected` is the mean slot median, `pct` is `round(expected/max·100)`, and `label` is `busyLabel(expected, max, true)`.
- Options: `from` (drop slots already over, e.g. now), `threshold`, `minMinutes`, `limit`, `tz`.
```ts
bestWindows(wedTerm.slots, facility.hours, "2026-10-28", 75, { from: new Date() });
// [{ start: "2026-10-28T10:00:00.000Z", end: "2026-10-28T12:00:00.000Z", expected: 10, pct: 13, label: "quiet" }, …]
```

### `confidence(daysOfData) → "low" | "medium" | "high"`
`< 7` low, `< 28` medium, else high.
```ts
confidence(3);  // "low"
confidence(14); // "medium"
confidence(40); // "high"
```

### `isOpen(hours, at = new Date(), tz = "America/Toronto") → boolean`
Parses every hours variant the portal uses (all strings in `facilities.json` are covered by a test). When the start has no AM/PM, it takes the end's (the portal drops the duplicate), so `"12:00 - 10:00 PM"` = noon to 10 PM and `"6:00 - 12:30 AM"` = 6 AM to 00:30 the next day. `"11:59 PM"` means until midnight. `"Closed"`, missing days and unrecognised text count as closed. `parseHours(text)` exposes the parsed `{ open, close }` minutes.
```ts
isOpen({ Sunday: "9:00 AM - 11:59 PM" }, "2026-10-25T12:30:00Z");      // false (08:30 Sunday)
isOpen({ Monday: "6:00 - 12:30 AM" }, "2026-10-27T04:15:00Z");         // true  (Tue 00:15, Monday's late close)
parseHours("12:00 - 10:00 PM");                                          // { open: 720, close: 1320 }
```

### Also exported
`termCalendar` (the bundled JSON, typed), `TermCalendar` / `TermRange` / `Term` types, `parseHours`, `quantile`, `localParts`, `localDateKey`, `localDayBounds`, `zonedTimeToUtc`, `DAY_NAMES`, `DEFAULT_TZ`, `SLOT_MINUTES`.

## `term-calendar.json`
UW undergraduate important dates, Fall 2025 through Spring 2027. Source: https://uwaterloo.ca/registrar/important-dates (which redirects to `/important-dates/undergraduate`; 2025-26 comes from `/important-dates/undergraduate/archive/2025-2026`), retrieved 2026-10-28.

Shape: `{ terms: [{ name, from, to }], ranges: [{ from, to, bucket, label }] }`, with inclusive local dates.
- A term runs from "Classes begin" to the last final-exam emergency day.
- `exams` covers the pre-exam study days through that last day.
- `holiday` covers statutory holidays and the University holiday closure (Dec 24 – Jan 2/3).
- `reading-week` covers the 9-day Reading Week block.

The default bucket when nothing matches is `"term"` inside a term and `"break"` otherwise. Update the file each spring when the registrar publishes the next academic year.
