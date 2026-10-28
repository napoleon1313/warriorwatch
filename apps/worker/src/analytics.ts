/**
 * The worker's single entry point to analytics. Today it re-exports the local fallback.
 * Once @warriorwatch/analytics lands (branch `analytics`), replace the body with:
 *
 *   export * from "@warriorwatch/analytics";
 *   import calendar from "@warriorwatch/analytics/term-calendar.json";
 *   export const termCalendar = calendar as TermCalendar;
 *
 * and add "@warriorwatch/analytics": "*" to apps/worker/package.json. Nothing else changes.
 */
export {
  bestWindows,
  buildTypical,
  confidence,
  isOpen,
  localSlot,
  nowVsTypical,
  termBucketFor,
  termCalendar,
  trend,
} from "./analytics-fallback";
export type { TermCalendar, TermRange } from "./analytics-fallback";
