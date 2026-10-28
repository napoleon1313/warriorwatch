/**
 * UW term calendar → TermBucket.
 *
 * Dates come from the Office of the Registrar's important dates:
 *   https://uwaterloo.ca/registrar/important-dates
 * (which redirects to https://uwaterloo.ca/important-dates/undergraduate; past
 * years live under /important-dates/undergraduate/archive/YYYY-YYYY).
 * The bundled data is in ../term-calendar.json.
 */
import type { TermBucket } from "@warriorwatch/contract";
import calendarJson from "../term-calendar.json" with { type: "json" };
import { DEFAULT_TZ, localDateKey } from "./time.ts";

export interface TermRange {
  /** inclusive local date, YYYY-MM-DD */
  from: string;
  /** inclusive local date, YYYY-MM-DD */
  to: string;
  bucket: TermBucket;
  label: string;
}

export interface Term {
  name: string;
  /** first day of classes */
  from: string;
  /** last day of the final examination period */
  to: string;
}

export interface TermCalendar {
  source?: string[];
  retrieved?: string;
  notes?: string;
  /** Days inside a term default to "term"; days outside every term default to "break". */
  terms: Term[];
  /** Overrides. When ranges overlap, the higher-priority bucket wins. */
  ranges: TermRange[];
}

/** holiday > reading-week > exams > break > term */
export const BUCKET_PRIORITY: Record<TermBucket, number> = {
  holiday: 4,
  "reading-week": 3,
  exams: 2,
  break: 1,
  term: 0,
};

/** Fall 2025 through Spring 2027, from the registrar. */
export const termCalendar = calendarJson as TermCalendar;

/**
 * Term bucket for a local date. `date` is either an instant (converted to its
 * local date in `tz`) or an already-local "YYYY-MM-DD" string.
 */
export function termBucketFor(
  date: Date | string,
  calendar: TermCalendar = termCalendar,
  tz: string = DEFAULT_TZ,
): TermBucket {
  const key = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : localDateKey(date, tz);
  let best: TermBucket | null = null;
  for (const r of calendar.ranges) {
    if (key >= r.from && key <= r.to && (best === null || BUCKET_PRIORITY[r.bucket] > BUCKET_PRIORITY[best])) {
      best = r.bucket;
    }
  }
  if (best) return best;
  return calendar.terms.some((t) => key >= t.from && key <= t.to) ? "term" : "break";
}
