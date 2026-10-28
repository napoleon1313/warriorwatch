"use client";

import { useMemo } from "react";
import type { HistoryPoint } from "@warriorwatch/contract";
import { busyLabel } from "@warriorwatch/contract";
import { LABEL_VAR } from "@/lib/labels";
import { WEEKDAYS, formatMinute, formatYmd, localParts, weekdayOf } from "@/lib/time";
import { MiniAxis, MiniCurve } from "./MiniCurve";

/** Facility page: the actual counts for each of the last 7 days, one small curve per day, newest first. */
export function RecentDays({ points, max, today }: { points: HistoryPoint[]; max: number; today: string }) {
  const days = useMemo(() => {
    const m = new Map<string, { m: number; v: number }[]>();
    for (const p of points) {
      const lp = localParts(p.ts);
      m.set(lp.ymd, [...(m.get(lp.ymd) ?? []), { m: lp.minuteOfDay, v: p.count }]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);
  }, [points]);

  if (days.length === 0) return <p className="text-sm text-muted">No readings in the last week yet.</p>;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
      {days.map(([ymd, pts], i) => {
        const peak = pts.reduce<{ m: number; v: number } | null>((b, p) => (!b || p.v > b.v ? p : b), null);
        const avg = pts.length ? pts.reduce((a, p) => a + p.v, 0) / pts.length : 0;
        const isToday = ymd === today;
        const color = peak ? LABEL_VAR[busyLabel(peak.v, max, true)] : "var(--muted)";
        return (
          <div key={ymd} className={`min-w-0 rounded-lg ${isToday ? "-m-2 bg-card-2 p-2" : ""}`}>
            <div className="mb-1 flex items-baseline justify-between gap-1">
              <span className={`mono truncate text-[11px] ${isToday ? "font-semibold text-fg" : "text-muted"}`}>
                {isToday ? "Today" : `${WEEKDAYS[weekdayOf(ymd)].slice(0, 3)} ${formatYmd(ymd).split(", ")[1]}`}
              </span>
              <span className="mono shrink-0 text-[10px] text-faint">{peak ? `pk ${peak.v} @ ${formatMinute(peak.m)}` : ""}</span>
            </div>
            <MiniCurve points={pts} max={max} color={color} from={300} to={1440} height={40} index={i} />
            <MiniAxis from={300} to={1440} />
            <p className="mono mt-1 text-[10px] text-faint">avg {Math.round(avg)} · {pts.length} pts</p>
          </div>
        );
      })}
    </div>
  );
}
