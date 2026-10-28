# Facility schedule recon (Agent D)

Date: 2026-10-28, ~02:05–02:30 America/Toronto. Result: **feasible, no login.**

## TL;DR

The DevExtreme scheduler on `/Facility/GetSchedule` loads its appointments with a plain
jQuery `$.getJSON` to:

```
GET https://warrior.uwaterloo.ca/Facility/GetScheduleCustomAppointmentsForDevExtremeScheduler
    ?selectedFacilityId=<facility GUID>
    &start=YYYY-MM-DDTHH:mm:ss      (Toronto wall clock, no offset)
    &end=YYYY-MM-DDTHH:mm:ss
```

It answers a cookieless `curl` with only our `User-Agent` with `200 application/json`: an
array of appointments, with recurring series as RRULE + EXDATE. `packages/schedule`
fetches it, expands it and returns contract `FacilityEvent[]`. Its expansion matches the
live browser rendering of the DST week exactly (41/41 occurrences).

## How it was found

1. Opened `/Facility/GetSchedule?facilityId=a3e9c00d-5aa7-45ea-ad73-f62c293856a8` (PAC Main
   Gym) in a real browser and listed network requests. After the static bundles, the page made
   two XHRs to the endpoint above: one for the week view (`start=2026-10-25T00:00:00&end=2026-10-31T23:59:00`)
   and one when the page switched to day view on narrow screens (`start=2026-10-28T00:00:00&end=2026-10-28T23:59:00`).
2. The caller is `/bundles/calendar?v=…` (not the `innosoft` bundle, which is why the static recon missed
   it). It defines a `DevExpress.data.CustomStore({ key: "Id", load })`. `load` reads
   `#SelectedFacility`, takes `scheduler.getStartViewDate()` / `getEndViewDate()`, formats them
   as local `YYYY-MM-DDTHH:mm:ss`, and calls `$.getJSON(url, { selectedFacilityId, start, end })`.
3. Paging to the next week sent `start=2026-11-01T00:00:00&end=2026-11-07T23:59:00`. Switching to
   day view sent a single-day range (`2026-11-04`). Weeks run Sunday 00:00 to Saturday 23:59 (`firstDayOfWeek: 0`).
4. Scheduler options read live from the page: `timeZone: ""` (browser local), `startDateExpr: "StartDate"`,
   `textExpr: "Text"`, `recurrenceRuleExpr: "RecurrenceRule"`, `recurrenceExceptionExpr: "RecurrenceException"`,
   `remoteFiltering: false`. Views are `day`/`month` on mobile and `day`/`week`/`month` on desktop.

## Request

| | |
|---|---|
| Method | `GET` |
| Auth | none. No cookie, no anti-forgery token, no `X-Requested-With`, no reCAPTCHA. |
| Headers we send | `User-Agent: SOURCE.userAgent`, `Accept: application/json` |
| Response headers | `content-type: application/json; charset=utf-8`, `cache-control: no-cache, no-store, must-revalidate`, served via CloudFront (`x-cache: Miss`). It sets an `ASP.NET_SessionId` cookie, which we ignore. |
| Latency | 1.8–3 s for a week, 10–11 s for a year or a past range. Server-side cost grows with range, so keep windows short. |

### Parameter behaviour (probed sequentially, 1 s apart, PAC Main Gym)

| Probe | Rows | Bytes | Notes |
|---|---|---|---|
| day `2026-10-28` | 132 | 41 KB | 41 recurring series + every non-recurring row from the start date on (through 2027-05) + far-future holds (2029) |
| week `10-25..10-31` | 139 | 43 KB | same as day, plus the 7 one-off rows from 10-25..10-27 |
| month `11-01..11-30` | 139 | 43 KB | `end` is effectively ignored |
| `09-01..12-31` | 350 | 114 KB | |
| year 2026 | 972 | 316 KB | 10 s |
| past week `2026-03-01..07` | 279 | 93 KB | 11 s, history is available |
| no `start`/`end` | 388 | 125 KB | server default window (looks like "this term onward") |
| `start=…Z` (UTC suffix) | 132 | | suffix ignored; parsed as local |
| date-only `start=2026-10-28` | 132 | | accepted |
| **no `selectedFacilityId`**, or an unknown GUID | 1718 | 568 KB | **every facility's events with no facility column**. Useless for attribution. Never omit it. |

In short, `start` works as a lower bound (a recurring series is included while its UNTIL is after
`start`), `end` hardly limits anything, and the client must expand and clip. `/Facility/GetSchedule` itself
takes no date parameter: the page always starts at `new Date()`, and all dating happens in this XHR.

## Response

A JSON array. Saved samples:

- `fixtures/schedule-appointments-pac-main-gym-2026-10-25.json`: week of 10-25, 139 rows
- `fixtures/schedule-appointments-pac-main-gym-2026-11-01.json`: week of 11-01 (DST change)
- `fixtures/schedule-appointments-pac-pool-2026-10-25.json`: PAC Pool, week of 10-25, 72 rows
- `fixtures/schedule-rendered-pac-main-gym-2026-11-01.json`: what DevExtreme rendered for that week (ground truth)

```json
{
  "Id": "4a1a350f-d73c-41f6-ab5b-43a8aff47bb2",
  "Text": "IM Vball",
  "StartDate": "2026-09-22T20:30:00.000",
  "EndDate": "2026-09-22T23:30:00.000",
  "AllDay": false,
  "Description": "",
  "RecurrenceRule": "FREQ=WEEKLY;UNTIL=20261204T043000Z;BYDAY=TU,TH;WKST=SU",
  "RecurrenceException": "20261027T203000,20261029T203000,…",
  "BackgroundColor": "#E0E9F6",
  "TextColor": "#000000"
}
```

Semantics, all confirmed against the live rendering:

- `StartDate` / `EndDate` are **naive America/Toronto wall clock**. The scheduler has `timeZone: ""`, so the
  browser reads them as local. "Building Closed 00:30–06:00" stays 00:30–06:00 on both sides of the
  2026-11-01 DST change, so durations are wall-clock durations.
- `RecurrenceRule` is an RFC 5545 RRULE body with `StartDate` as DTSTART. Across all 1718 rows seen we
  found only: `FREQ=DAILY|WEEKLY`, `UNTIL` (always UTC `Z`), `COUNT`, `INTERVAL=2`, plain `BYDAY` lists, `WKST=SU`.
- `RecurrenceException` holds comma-separated **naive local** EXDATEs matching an occurrence's start.
- `AllDay` was `false` on all 1718 rows. Multi-day holds are encoded as 06:00–00:00 daily series.
- `Description` holds free-text staff notes (vendors, setup instructions). The contract has no field for it,
  and we do not store it.
- `BackgroundColor` takes four values: `#D3D3D3` (program bookings, "Fall 2026 - …"), `#E0E9F6` (ops/other),
  `#F0E68C` (games/special events), `#808080`. These are probably booking-type colours, but the
  mapping is unconfirmed, so `kind` comes from the title.
- Titles: `"<Term> - <Program> - <Offering>"` for registered programs; `IU` = interuniversity
  (varsity); `IM`, `Complete | A vs B` and bare `A vs B` are intramurals; `vs <School>` is a varsity
  game. Intramural team names are user-chosen and can include first names. They are public on the
  portal, but avoid showing them prominently.

## Fusion Go app feed (secondary lead, not needed)

- `pgaskin/innosoftfusiongo-ical` fetches `GET https://innosoftfusiongo.com/schools/download.php?schoolid=<N>&version=5.15.0&device=Android&file=schedule`
  (also `file=facilities` and `file=notifications`), with no auth. The school id lives only in
  `assets/config.json` inside the branded Android APK.
- Waterloo's branded app is "Waterloo Warriors Recreation" (App Store id1178725553, also called Warrior Rec).
  We **did not find Waterloo's school id**. Getting it means downloading and unpacking the APK, which was out of
  scope here (untrusted binary). Guessing ids against a third-party host would be enumeration, so we did not.
- Judging by the Queen's sample data in that repo, this feed holds the *program* schedule (drop-ins, classes)
  rather than facility bookings, so the portal endpoint above is the better source for "booked or open
  right now". It could still be a cross-check later.

## Etiquette used

Every request was sequential, at least 1 s apart, and sent `SOURCE.userAgent`. There were about 15
requests to the JSON endpoint in total, with no login, no account and no form submission.

## Open questions

- What `#808080` means, and whether colour maps to a booking type. This only matters if title rules prove too weak.
- Whether `end` is ever enforced (it was not, for ranges up to a year).
- Whether a cancelled one-off disappears from the feed or turns into an exception. The adapter handles both
  by replacing the whole window (see `packages/schedule/README.md`).
