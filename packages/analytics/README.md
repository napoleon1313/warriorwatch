# @warriorwatch/analytics — Agent B

Pure TypeScript, zero I/O, zero runtime deps. Consumed by `apps/worker` (to build `typical` rows and `/api/best`) and `apps/web` (to render bands, labels, trends client-side when needed).

## Functions to implement (all exported from `src/index.ts`)

- `termBucketFor(date: Date, calendar: TermCalendar): TermBucket`
- `localSlot(ts: string, tz = "America/Toronto"): { weekday: 0..6, minute: number /* step 15 */ }`
- `buildTypical(readings: Reading[], calendar: TermCalendar): TypicalResponse["slots"]` grouped by (facility, term, weekday) — median/p25/p75 per 15-min slot, `n` = distinct local days. Readings are *change-only* samples, so **forward-fill** each day's series to 1-min before bucketing, otherwise quiet hours are under-represented.
- `nowVsTypical(count, slot): { delta, verdict: "quieter" | "usual" | "busier" }` — threshold = max(2 people, 0.5 × IQR).
- `trend(last20min: Reading[]): number | null` — people per 10 min, least squares, null if < 3 points.
- `bestWindows(typical, hours, date, max): BestWindow[]` — contiguous ≥30-min runs with expected ≤ 40% of max while open, ranked by expected, merged, max 5.
- `confidence(daysOfData): "low" | "medium" | "high"` — <7 low, <28 medium, else high.
- `isOpen(hours: FacilityHours, at: Date, tz): boolean` — parse the portal's "6:00 AM - 11:59 PM" / "6:00 - 12:30 AM" / "12:00 - 10:00 PM" formats (see `facilities.json` for every variant that exists).

## `term-calendar.json`
UW important dates for Fall 2025 through Winter 2027: term start/end, reading weeks, exam periods, holidays and building closures. Source: https://uwaterloo.ca/registrar/important-dates . Shape: `{ "ranges": [{ "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "bucket": TermBucket, "label": string }] }`, default bucket when nothing matches: `"term"` between term start and end, `"break"` otherwise.

## Done when
`npm test` passes with ≥90% coverage (vitest), synthetic fixtures cover: a facility closed Sunday mornings, change-only sparse days, DST transitions (Nov 2 2025, Mar 8 2026), a day with 2 readings only.
