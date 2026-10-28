"use client";

import type { FacilityHours, TypicalResponse } from "@warriorwatch/contract";
import { busyLabel } from "@warriorwatch/contract";
import { rangeFor } from "@/lib/hours";
import { LABEL_VAR } from "@/lib/labels";
import { WEEKDAYS, formatMinute, type Weekday } from "@/lib/time";
import { MiniAxis, MiniCurve } from "./MiniCurve";

const ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** Facility page: seven small curves, one per weekday, so the week's rhythm reads in a glance. */
export function WeekMultiples({
  week,
  max,
  hours,
  today,
  nowMin,
}: {
  week: TypicalResponse[];
  max: number;
  hours: FacilityHours;
  today: Weekday;
  nowMin: number;
}) {
  const byDay = new Map(week.map((t) => [t.weekday, t]));
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
      {ORDER.map((wd, i) => {
        const t = byDay.get(wd);
        const r = rangeFor(hours, wd);
        const pts = (t?.slots ?? []).map((s) => ({ m: s.minute + 7.5, v: s.median }));
        const peak = (t?.slots ?? []).reduce<{ m: number; v: number } | null>(
          (b, s) => (s.median != null && (!b || s.median > b.v) ? { m: s.minute, v: s.median } : b),
          null,
        );
        const n = Math.max(0, ...(t?.slots.map((s) => s.n) ?? [0]));
        const isToday = wd === today;
        const color = peak ? LABEL_VAR[busyLabel(peak.v, max, true)] : "var(--muted)";
        return (
          <div key={wd} className={`min-w-0 rounded-lg ${isToday ? "bg-card-2 p-2 -m-2" : ""}`}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className={`mono text-[11px] ${isToday ? "font-semibold text-fg" : "text-muted"}`}>
                {WEEKDAYS[wd].slice(0, 3)}
                {isToday && <span className="ml-1 text-[9px] text-accent">now</span>}
              </span>
              <span className="mono text-[10px] text-faint">{r ? (peak ? `~${Math.round(peak.v)} @ ${formatMinute(peak.m)}` : n ? "" : "no data") : "closed"}</span>
            </div>
            <MiniCurve points={pts} max={max} color={color} nowMin={isToday ? nowMin : null} from={300} to={1440} height={40} index={i} />
            <MiniAxis from={300} to={1440} />
          </div>
        );
      })}
    </div>
  );
}
