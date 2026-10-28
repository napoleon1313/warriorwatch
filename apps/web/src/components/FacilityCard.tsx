import Link from "next/link";
import type { LiveFacility } from "@warriorwatch/contract";
import { display, slugOf } from "@/lib/facilities";
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
}: {
  f: LiveFacility;
  fetchedAt: string;
  now: number;
  /** "Closes midnight" / "Opens 6 AM" from hours, when known */
  status?: string;
}) {
  const d = display(f.id, f.name);
  const vs = vsUsual(f, fetchedAt);
  const hasSpark = f.sparkline.some((v) => v != null);
  // Hours and the API's `open` can disagree (holiday closures); the API wins.
  if (status && f.open !== status.startsWith("Closes")) status = undefined;
  return (
    <Link
      href={`/f/${slugOf(f.id)}`}
      className="group block rounded-2xl border border-line bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[color:var(--muted)]"
    >
      <div className="flex items-start gap-3.5">
        <Ring count={f.count} max={f.max} label={f.label} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold leading-tight group-hover:underline group-hover:underline-offset-2">
              {d.title}
            </h3>
            <LabelPill label={f.label} className="shrink-0" />
          </div>
          <p className="mt-0.5 text-xs text-muted">{d.where}</p>
          <p className="tnum mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
            {f.open ? (
              <>
                <span>
                  <span className="font-semibold">{f.count}</span>
                  <span className="text-muted"> / {f.max}</span>
                  <span className="text-muted"> · {f.pct}%</span>
                </span>
                <Trend trend={f.trend} />
              </>
            ) : (
              <span className="text-muted">{status ?? "Closed now"}</span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-3 h-9">{hasSpark ? <Sparkline values={f.sparkline} max={f.max} label={f.label} /> : null}</div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-muted">
        <span className="tnum">
          {vs ? (
            <>
              {vs.sign && <span className="font-semibold text-fg">{vs.sign} </span>}
              {vs.rest}
            </>
          ) : (
            "Last 3 hours"
          )}
        </span>
        <span className="tnum">
          {f.open && status ? `${status} · ` : ""}
          <span title={new Date(f.lastChange).toLocaleString("en-CA", { timeZone: "America/Toronto" })}>
            updated {relativeAgo(f.lastChange, now)}
          </span>
        </span>
      </div>
    </Link>
  );
}

export function FacilityCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-card p-4" aria-hidden="true">
      <div className="flex items-start gap-3.5">
        <div className="skeleton h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="skeleton h-4 w-32" />
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-4 w-28" />
        </div>
      </div>
      <div className="skeleton mt-3 h-9 w-full" />
      <div className="skeleton mt-2 h-3 w-40" />
    </div>
  );
}
