import { USING_MOCK } from "./api";
import { localParts, zonedToUtc } from "./time";

/**
 * Demo-only time travel: with mock data, `?at=18:30` (Toronto, today) or
 * `?at=<ISO>` shifts the whole UI's clock so open/closed, curves and "updated
 * X ago" can be checked at any hour. Ignored when a real API is configured.
 */
let offset: number | null = null;

function computeOffset(): number {
  if (!USING_MOCK || typeof location === "undefined") return 0;
  const at = new URLSearchParams(location.search).get("at");
  if (!at) return 0;
  const hm = at.match(/^(\d{1,2}):(\d{2})$/);
  const target = hm
    ? zonedToUtc(localParts(Date.now()).ymd, Number(hm[1]) * 60 + Number(hm[2])).getTime()
    : Date.parse(at);
  return Number.isFinite(target) ? target - Date.now() : 0;
}

export function clockNow(): number {
  if (offset === null) offset = computeOffset();
  return Date.now() + offset;
}
