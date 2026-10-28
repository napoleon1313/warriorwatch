/** Turning change-only reading rows back into values at chosen instants. */
import type { HistoryPoint } from "@warriorwatch/contract";
import type { ReadingRow } from "./db";
import { MINUTE } from "./time";

/** A stored row stands for at most this long; heartbeats are hourly, so longer means a gap. */
export const FILL_CAP_MS = 75 * MINUTE;
/** Scrapes run every minute, so the last good scrape vouches for the value a little past its own time. */
const SCRAPE_SLACK_MS = 2 * MINUTE;

export interface Sample {
  count: number;
  max: number;
}

/**
 * Value of the series at each instant in `times` (ascending, epoch ms): the last row at or before
 * it, or null if there is none, it is older than FILL_CAP_MS, or the instant is well after `validUntil`
 * (the last successful scrape, beyond which we do not know the value).
 */
export function sampleAt(series: ReadingRow[], times: number[], validUntil: number): (Sample | null)[] {
  const out: (Sample | null)[] = [];
  let i = -1;
  for (const t of times) {
    while (i + 1 < series.length && Date.parse(series[i + 1]!.ts) <= t) i++;
    const row = series[i];
    if (!row || t > validUntil + SCRAPE_SLACK_MS || t - Date.parse(row.ts) > FILL_CAP_MS) out.push(null);
    else out.push({ count: row.count, max: row.max });
  }
  return out;
}

/** Time-weighted mean per bucket of `bucketMs`, aligned to the epoch, sampled every `stepMs`. Empty buckets are omitted. */
export function bucketize(
  series: ReadingRow[],
  from: number,
  to: number,
  bucketMs: number,
  stepMs: number,
  validUntil: number,
): HistoryPoint[] {
  const first = Math.floor(from / bucketMs) * bucketMs;
  const times: number[] = [];
  for (let t = first; t < to; t += stepMs) times.push(t);
  times.push(to); // so the newest bucket reflects the latest reading
  const samples = sampleAt(series, times, validUntil);

  const points: HistoryPoint[] = [];
  let bucket = first;
  let sum = 0;
  let n = 0;
  let max = 0;
  const flush = () => {
    if (n > 0) points.push({ ts: new Date(bucket).toISOString(), count: Math.round(sum / n), max });
    sum = 0;
    n = 0;
  };
  times.forEach((t, k) => {
    const b = Math.floor(t / bucketMs) * bucketMs;
    if (b !== bucket) {
      flush();
      bucket = b;
    }
    const s = samples[k];
    if (s) {
      sum += s.count;
      n++;
      max = s.max;
    }
  });
  flush();
  return points;
}
