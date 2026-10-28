import { BUSY_THRESHOLDS, type BusyLabel } from "@warriorwatch/contract";

/**
 * Words and colours for the contract's BusyLabel. Thresholds are never
 * redefined here: anything that needs a label calls busyLabel() from the
 * contract. Colour tokens live in globals.css (--quiet, --moderate, ...).
 */
export const LABEL_TEXT: Record<BusyLabel, string> = {
  closed: "Closed",
  quiet: "Quiet",
  moderate: "Moderate",
  busy: "Busy",
  packed: "Packed",
};

export const LABEL_VAR: Record<BusyLabel, string> = {
  closed: "var(--closed)",
  quiet: "var(--quiet)",
  moderate: "var(--moderate)",
  busy: "var(--busy)",
  packed: "var(--packed)",
};

/** Tailwind classes for the pill. Text on tinted background, ≥4.5:1 in both themes. */
export const LABEL_PILL: Record<BusyLabel, string> = {
  closed: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  quiet: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  moderate: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  busy: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  packed: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

/** Human description of the thresholds for the About page, derived from the contract. */
export function thresholdCopy(): { label: BusyLabel; range: string }[] {
  const q = Math.round(BUSY_THRESHOLDS.quiet * 100);
  const m = Math.round(BUSY_THRESHOLDS.moderate * 100);
  const b = Math.round(BUSY_THRESHOLDS.busy * 100);
  return [
    { label: "quiet", range: `under ${q}% of capacity` },
    { label: "moderate", range: `${q}–${m}%` },
    { label: "busy", range: `${m}–${b}%` },
    { label: "packed", range: `${b}% and up` },
  ];
}
