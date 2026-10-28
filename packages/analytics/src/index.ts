/**
 * @warriorwatch/analytics — pure functions, no I/O, no runtime deps beyond the contract.
 * See ../README.md for an example of each export.
 */
export { termBucketFor, termCalendar, BUCKET_PRIORITY } from "./calendar.ts";
export type { TermCalendar, TermRange, Term } from "./calendar.ts";
export { localSlot, localParts, localDateKey, localDayBounds, zonedTimeToUtc, DEFAULT_TZ, SLOT_MINUTES } from "./time.ts";
export type { LocalParts, Weekday } from "./time.ts";
export { buildTypical, quantile } from "./typical.ts";
export type { BuildTypicalOptions } from "./typical.ts";
export { nowVsTypical, trend, confidence } from "./live.ts";
export type { Verdict } from "./live.ts";
export { bestWindows } from "./best.ts";
export type { BestWindowOptions } from "./best.ts";
export { isOpen, parseHours, DAY_NAMES } from "./hours.ts";
export type { OpenInterval } from "./hours.ts";
