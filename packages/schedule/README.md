# @warriorwatch/schedule

Facility calendars (bookings, open rec, varsity, closures) for all 44 facilities, taken from
the portal's public JSON feed. The package has no I/O beyond an injectable `fetch`. Background
and raw behaviour are in [`docs/schedule-recon.md`](../../docs/schedule-recon.md).

```ts
import { fetchFacilityEvents } from "@warriorwatch/schedule";
const events = await fetchFacilityEvents(facilityId, from, to); // FacilityEvent[], UTC ISO
```

- `fetchAppointments(id, from, to, opts?)` returns `RawAppointment[]` exactly as the portal sends them.
- `expandAppointments(raw, id, from, to)` expands RRULE/EXDATE in Toronto wall clock and keeps
  occurrences that overlap `[from, to)`, sorted and de-duplicated on `(start, title)`.
- `classifyKind(title)` returns `"Open Rec" | "Varsity" | "Intramural" | "Booking" | "Closed" | null`.
- `opts.fetch` takes a test double or the Worker's `fetch`. `opts.userAgent` defaults to `SOURCE.userAgent`.

Unknown RRULE parts throw. Catch the error per facility and log it, so one odd calendar does not stop the others.

## Adapter note for `apps/worker` (not implemented there; Agent A owns it)

**Schedule.** Spread the work across the existing 1-minute cron rather than adding a burst job:
each tick takes the next 3 facilities from `facilities.json` round-robin
(`tick % 15` → slice), so all 44 refresh every 15 minutes. That keeps us at ≤3 extra
requests per minute, 500 ms apart, and inside Worker CPU limits. Parsing and expanding one
facility costs a few ms of CPU. A single 44-facility burst would take about 100 s wall clock.

**Window.** `from` = start of today in America/Toronto and `to` = `from + 8 days`. The server
returns every future one-off regardless of `end` (40–125 KB per facility), so the response size
does not depend on the window. Expansion clips it.

**Storage.** The `events` key is `(facility_id, start, title)`. A rescheduled or cancelled event
would leave a stale row under a plain upsert, so replace the window instead, in one D1 batch:

```sql
DELETE FROM events WHERE facility_id = ?1 AND start < ?3 AND end > ?2;   -- ?2 = from, ?3 = to (ISO)
INSERT INTO events (facility_id, start, end, title, kind) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (facility_id, start, title) DO UPDATE SET end = excluded.end, kind = excluded.kind;
```

Skip the delete when the fetch failed, so a portal outage does not wipe the calendar. Rows
before `from` stay as history.

**Sketch.**

```ts
import facilities from "@warriorwatch/contract/facilities.json" with { type: "json" };
import { fetchFacilityEvents } from "@warriorwatch/schedule";

const PER_TICK = 3;
export async function scheduleTick(tick: number, db: D1Database, now = new Date()) {
  const from = startOfTorontoDay(now), to = new Date(from.getTime() + 8 * 86_400_000);
  const slice = facilities.slice((tick % 15) * PER_TICK, (tick % 15) * PER_TICK + PER_TICK);
  for (const f of slice) {
    try {
      const events = await fetchFacilityEvents(f.id, from, to);
      await replaceWindow(db, f.id, from, to, events);
    } catch (err) { console.warn("schedule", f.id, err); }
    await sleep(500);
  }
}
```

`/api/events?facility=&from=&to=` can then read straight from `events`. "Booked or open right
now" for a facility means rows where `start <= now < end`. When no row matches during open
hours, the facility has no booking on the calendar. It is not necessarily open rec, because
studios and courts may need a reservation.
