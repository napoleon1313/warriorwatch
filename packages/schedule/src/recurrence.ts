/**
 * Just enough RFC 5545 RRULE to expand what the portal emits. Observed across
 * all 44 facilities on 2026-10-28: FREQ=DAILY|WEEKLY, UNTIL (UTC, Z), COUNT,
 * INTERVAL, BYDAY (plain weekday codes, no ordinals), WKST=SU. Anything else
 * throws, so a vendor change fails loudly in the worker instead of silently
 * producing a wrong calendar.
 */
import { type Local, localToUtc, parseCompact, toLocal, wallMs } from "./time.js";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface Rule {
  freq: "DAILY" | "WEEKLY";
  interval: number;
  count: number | null;
  /** UTC epoch ms, inclusive bound on occurrence start */
  until: number | null;
  /** 0 = Sunday; null = weekday of DTSTART */
  byDay: number[] | null;
}

export function parseRule(src: string): Rule {
  const rule: Rule = { freq: "DAILY", interval: 1, count: null, until: null, byDay: null };
  let sawFreq = false;
  for (const part of src.split(";")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    switch (k) {
      case "FREQ":
        if (v !== "DAILY" && v !== "WEEKLY") throw new Error(`unsupported FREQ ${v}`);
        rule.freq = v; sawFreq = true; break;
      case "INTERVAL": rule.interval = Math.max(1, +v); break;
      case "COUNT": rule.count = +v; break;
      case "UNTIL": {
        const { local, utc } = parseCompact(v);
        rule.until = utc ? wallMs(local) : localToUtc(local);
        break;
      }
      case "BYDAY":
        rule.byDay = v.split(",").map((d) => {
          const i = WEEKDAYS.indexOf(d as (typeof WEEKDAYS)[number]);
          if (i < 0) throw new Error(`unsupported BYDAY ${d}`);
          return i;
        });
        break;
      case "WKST":
        if (v !== "SU") throw new Error(`unsupported WKST ${v}`);
        break;
      default:
        throw new Error(`unsupported RRULE part ${k}`);
    }
  }
  if (!sawFreq) throw new Error(`RRULE without FREQ: ${src}`);
  return rule;
}

/**
 * Wall-clock start times of every occurrence whose start is before `stopUtc`
 * (exclusive), honouring COUNT and UNTIL. EXDATEs are removed by the caller,
 * after COUNT, as RFC 5545 specifies.
 */
export function occurrences(dtstart: Local, rule: Rule, stopUtc: number): Local[] {
  const out: Local[] = [];
  const startWall = wallMs(dtstart);
  const startDay = Math.floor(startWall / DAY_MS);
  const startDow = new Date(startDay * DAY_MS).getUTCDay();
  const weekOrigin = startDay - startDow; // the Sunday on/before DTSTART (WKST=SU)
  const byDay = rule.byDay ?? [startDow];
  const tod = startWall - startDay * DAY_MS;

  let n = 0;
  for (let day = startDay; ; day++) {
    const dow = new Date(day * DAY_MS).getUTCDay();
    const ok = rule.freq === "DAILY"
      ? (day - startDay) % rule.interval === 0
      : byDay.includes(dow) && Math.floor((day - weekOrigin) / 7) % rule.interval === 0;
    if (!ok) continue;
    const d = new Date(day * DAY_MS + tod);
    const local: Local = {
      y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
      h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(),
    };
    const utc = localToUtc(local);
    if (rule.until !== null && utc > rule.until) break;
    if (utc >= stopUtc) break;
    out.push(local);
    n++;
    if (rule.count !== null && n >= rule.count) break;
  }
  return out;
}

/** "20261025T120000,20261101T120000" → set of wall-clock keys. */
export function parseExceptions(src: string | null): Set<number> {
  const set = new Set<number>();
  if (!src) return set;
  for (const s of src.split(",")) {
    if (!s.trim()) continue;
    const { local, utc } = parseCompact(s);
    // A Z-suffixed EXDATE has never been observed; normalise it to wall clock anyway.
    set.add(utc ? wallMs(toLocal(wallMs(local))) : wallMs(local));
  }
  return set;
}
