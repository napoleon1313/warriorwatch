"use client";

import Link from "next/link";
import type { LiveFacility } from "@warriorwatch/contract";
import { display, slugOf } from "@/lib/facilities";
import type { OpenStatus } from "@/lib/hours";
import { relativeAgo } from "@/lib/time";
import { LabelPill } from "./LabelPill";
import { Ring } from "./Ring";
import { Sparkline } from "./Sparkline";
import { Trend } from "./Trend";
import { vsUsual } from "./copy";

export function FacilityCard({
  f,
  fetchedAt,
  now,
  status,
  index = 0,
}: {
  f: LiveFacility;
  fetchedAt: string;
  now: number;
  /** open/closed with next transition, from hours, when known */
  status?: OpenStatus | null;
  /** position in the grid, for stagger */
  index?: number;
}) {
  const d = display(f.id, f.name);
  const vs = vsUsual(f, fetchedAt);
  const hasSpark = f.sparkline.some((v) => v != null);
  // Hours and the API's `open` can disagree (holiday closures); the API wins.
  const st = status && status.open === f.open ? status : null;
  return (
    <Link
      href={`/f/${slugOf(f.id)}`}
      className="panel panel-hover rise group block p-4"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="eyebrow">
          {String(index + 1).padStart(2, "0")} · {d.where}
        </span>
        <LabelPill label={f.label} />
      </div>
      <div className="flex items-center gap-3.5">
        <Ring count={f.count} max={f.max} label={f.label} size={60} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-semibold leading-tight tracking-tight group-hover:text-accent">{d.title}</h3>
          {f.open ? (
            <p className="mono mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-xl font-semibold leading-none">{f.count}</span>
              <span className="text-xs text-muted">/ {f.max}</span>
              <span className="text-xs text-muted">{f.pct}%</span>
              <Trend trend={f.trend} />
            </p>
          ) : (
            <p className="mono mt-1 text-xs leading-snug text-muted">
              {st ? (
                <>
                  <span className="text-fg">{st.whenText}</span>
                  <span className="text-faint"> · </span>
                  {st.inText}
                </>
              ) : (
                "Closed now"
              )}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 h-9">
        {hasSpark ? <Sparkline values={f.sparkline} max={f.max} label={f.label} index={index} baseline={f.open ? f.typical : null} /> : null}
      </div>
      <div className="mono mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>
          {vs ? (
            <>
              {vs.sign && <span className="font-semibold text-fg">{vs.sign} </span>}
              {vs.rest}
            </>
          ) : (
            "last 3 h"
          )}
        </span>
        <span>
          {f.open && st ? `${st.text.toLowerCase()} · ` : ""}
          <span title={new Date(f.lastChange).toLocaleString("en-CA", { timeZone: "America/Toronto" })}>
            upd {relativeAgo(f.lastChange, now)}
          </span>
        </span>
      </div>
    </Link>
  );
}

export function FacilityCardSkeleton() {
  return (
    <div className="panel p-4" aria-hidden="true">
      <div className="mb-3 flex justify-between">
        <div className="skeleton h-3 w-20" />
        <div className="skeleton h-4 w-14" />
      </div>
      <div className="flex items-center gap-3.5">
        <div className="skeleton h-[60px] w-[60px] rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-5 w-24" />
        </div>
      </div>
      <div className="skeleton mt-3 h-9 w-full" />
      <div className="skeleton mt-2 h-3 w-40" />
    </div>
  );
}
