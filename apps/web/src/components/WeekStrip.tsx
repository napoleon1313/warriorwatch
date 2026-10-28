"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { Facility, LiveFacility, TypicalResponse } from "@warriorwatch/contract";
import { api } from "@/lib/api";
import { display, slugOf } from "@/lib/facilities";
import { rangeFor } from "@/lib/hours";
import { usePolling } from "@/lib/hooks";
import { LABEL_VAR } from "@/lib/labels";
import { formatMinute, localParts } from "@/lib/time";
import { MiniAxis, MiniCurve } from "./MiniCurve";

/** Live page: every room's usual curve for today, side by side, with "now" marked. */
export function WeekStrip({ facilities, hoursById, now }: { facilities: LiveFacility[]; hoursById: Map<string, Facility>; now: number }) {
  const lp = localParts(now);
  const ids = facilities.map((f) => f.id).join(",");
  const typical = usePolling(
    (s) => Promise.all(facilities.map((f) => api.typical(slugOf(f.id), lp.weekday, s))),
    null,
    `typical-all:${ids}:${lp.weekday}`,
  );
  const byId = useMemo(() => new Map((typical.data ?? []).map((t) => [t.facilityId, t])), [typical.data]);

  if (!typical.data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {facilities.map((f) => (
          <div key={f.id} className="skeleton h-20" aria-hidden="true" />
        ))}
      </div>
    );
  }
  const anyData = typical.data.some((t) => t.slots.some((s) => s.median != null));
  if (!anyData) return <p className="text-sm text-muted">No usual curves yet. They appear after the first full week of counts.</p>;

  return (
    <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
      {facilities.map((f, i) => {
        const t: TypicalResponse | undefined = byId.get(f.id);
        const d = display(f.id, f.name);
        const fac = hoursById.get(f.id);
        const r = fac ? rangeFor(fac.hours, lp.weekday) : null;
        const from = r ? Math.floor(r.open / 60) * 60 : 300;
        const to = r ? Math.min(1560, Math.ceil(r.close / 60) * 60) : 1440;
        const pts = (t?.slots ?? []).map((s) => ({ m: s.minute + 7.5, v: s.median }));
        const peak = (t?.slots ?? []).reduce<{ m: number; v: number } | null>(
          (b, s) => (s.median != null && (!b || s.median > b.v) ? { m: s.minute, v: s.median } : b),
          null,
        );
        const n = Math.max(0, ...(t?.slots.map((s) => s.n) ?? [0]));
        return (
          <Link key={f.id} href={`/f/${slugOf(f.id)}`} className="group min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-medium group-hover:text-accent">{d.title}</span>
              <span className="mono text-[10px] text-faint">{peak ? `peak ~${Math.round(peak.v)} @ ${formatMinute(peak.m)}` : n ? "" : "no data"}</span>
            </div>
            <MiniCurve points={pts} max={f.max} color={f.open ? LABEL_VAR[f.label] : "var(--muted)"} nowMin={lp.minuteOfDay} from={from} to={to} index={i} />
            <MiniAxis from={from} to={to} />
          </Link>
        );
      })}
    </div>
  );
}
