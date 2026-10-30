# @warriorwatch/contract changelog

## 2026-10-30 — library zones (Waitz)

- `SourceKind`, `facilitySource(id)`, `waitzLocationId(id)`, `WAITZ_ID_PREFIX`: a facility's count comes from the
  portal (GUID ids) or from Waitz (`waitz-<id>` ids).
- `GYM_FACILITY_ORDER` (the 7 portal spaces), `LIBRARY_FACILITY_ORDER` (3 library totals + 16 zones),
  `LIBRARY_TOTAL_IDS`; `LIVE_FACILITY_ORDER` is now gyms followed by libraries (26 ids).
- `FACILITY_SLUGS` gains the 19 library slugs.
- `LiveResponse.sources?` (per-feed `SourceStatus`). Optional, so existing clients keep working;
  `fetchedAt`/`stale` still describe the portal feed.
- `SOURCE.waitzLiveUrl`, `SOURCE.waitzPageUrl`, `SOURCE.libraryHoursUrl`.
- `facilities.json` gains the 19 library entries (regular-term hours from LibCal, Oct 2026).
- `schema.sql` gains the `sources` table.
