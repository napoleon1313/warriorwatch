"use client";

import { useMemo, useState } from "react";
import type { HistoryPoint, TypicalSlot } from "@warriorwatch/contract";
import { useWidth } from "@/lib/hooks";
import type { Range } from "@/lib/hours";
import { formatMinute, hourTick, localParts } from "@/lib/time";

interface Props {
  /** today's points (any resolution), oldest first */
  points: HistoryPoint[];
  /** typical slots for today's weekday; may be all-null early on */
  typical: TypicalSlot[] | null;
  max: number;
  hours: Range | null;
  now: number;
  /** "Tuesday" */
  weekdayName: string;
  /** colour for today's line */
  color?: string;
  height?: number;
  /** shaded spans (minutes of day), e.g. suggested quiet windows */
  highlights?: { from: number; to: number }[];
  /** hide the "now" marker and today's line (planning a future day) */
  planning?: boolean;
}

const PAD = { l: 30, r: 8, t: 10, b: 22 };

/** Today's curve drawn over the typical p25–p75 band and median. Arrow keys scrub. */
export function DayCurve({ points, typical, max, hours, now, weekdayName, color = "var(--accent)", height = 210, highlights = [], planning = false }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [cursor, setCursor] = useState<number | null>(null); // minute of day

  // Domain: opening hour → closing hour (whole hours), else 5 AM → midnight.
  const x0 = hours ? Math.floor(hours.open / 60) * 60 : 300;
  const x1 = hours ? Math.min(1440 + 120, Math.ceil(hours.close / 60) * 60) : 1440;
  const yMax = Math.max(1, max);
  const W = Math.max(200, width);
  const H = height;
  const x = (m: number) => PAD.l + ((m - x0) / (x1 - x0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - Math.min(v, yMax) / yMax) * (H - PAD.t - PAD.b);

  const today = useMemo(
    () =>
      points.map((p) => {
        const lp = localParts(p.ts);
        return { m: lp.minuteOfDay, c: p.count };
      }),
    [points],
  );
  const slots = useMemo(() => (typical ?? []).filter((s) => s.minute >= x0 && s.minute <= x1), [typical, x0, x1]);
  const hasTypical = slots.some((s) => s.median != null);
  const nowMin = planning ? -1 : localParts(now).minuteOfDay;

  const bandPath = (() => {
    const segs: string[] = [];
    let run: TypicalSlot[] = [];
    const flush = () => {
      if (run.length > 1) {
        const top = run.map((s, i) => `${i ? "L" : "M"}${x(s.minute + 7.5).toFixed(1)},${y(s.p75!).toFixed(1)}`).join("");
        const bot = [...run].reverse().map((s) => `L${x(s.minute + 7.5).toFixed(1)},${y(s.p25!).toFixed(1)}`).join("");
        segs.push(`${top}${bot}Z`);
      }
      run = [];
    };
    for (const s of slots) {
      if (s.p25 != null && s.p75 != null) run.push(s);
      else flush();
    }
    flush();
    return segs.join("");
  })();

  const line = (pts: { m: number; v: number | null }[]) => {
    let d = "";
    let pen = false;
    for (const p of pts) {
      if (p.v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const medianPath = line(slots.map((s) => ({ m: s.minute + 7.5, v: s.median })));
  const todayPath = line(today.filter((p) => p.m >= x0).map((p) => ({ m: p.m, v: p.c })));

  const ticks: number[] = [];
  for (let m = Math.ceil(x0 / 180) * 180; m <= x1; m += 180) ticks.push(m);
  const yTicks = [0, Math.round(yMax / 2), yMax];

  // Readout at the cursor (or "now")
  const at = cursor ?? (nowMin >= x0 && nowMin <= x1 ? nowMin : null);
  const readout = useMemo(() => {
    if (at == null) return null;
    let todayVal: number | null = null;
    for (const p of today) if (p.m <= at) todayVal = p.c;
    if (at > nowMin) todayVal = null;
    const slot = slots.find((s) => at >= s.minute && at < s.minute + 15) ?? null;
    return { at, todayVal, slot };
  }, [at, today, slots, nowMin]);

  const peak = today.reduce<{ m: number; c: number } | null>((b, p) => (!b || p.c > b.c ? p : b), null);
  const typPeak = slots.reduce<TypicalSlot | null>((b, s) => (s.median != null && (!b || s.median > (b.median ?? -1)) ? s : b), null);
  const summary = [
    planning ? "" : peak ? `Today so far: busiest ${peak.c} people around ${formatMinute(peak.m)}, now ${today.at(-1)?.c ?? 0}.` : "No readings yet today.",
    typPeak?.median != null
      ? `A usual ${weekdayName} peaks around ${Math.round(typPeak.median)} people at ${formatMinute(typPeak.minute)}.`
      : `No usual ${weekdayName} yet.`,
  ].join(" ");

  const onMove = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    const m = x0 + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (x1 - x0);
    setCursor(Math.max(x0, Math.min(x1 - 1, Math.round(m / 5) * 5)));
  };

  return (
    <figure className="m-0">
      <div
        ref={ref}
        tabIndex={0}
        role="img"
        aria-label={`Chart. ${summary} Use left and right arrow keys to read values.`}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setCursor(null)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const base = cursor ?? Math.min(Math.max(nowMin, x0), x1 - 15);
          setCursor(Math.max(x0, Math.min(x1 - 15, base + (e.key === "ArrowRight" ? 15 : -15))));
        }}
        onBlur={() => setCursor(null)}
      >
        <svg width={W} height={H} className="block overflow-visible" aria-hidden="true">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "2 4"} />
              <text x={PAD.l - 6} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={11} fill="var(--muted)" className="tnum">
                {t}
              </text>
            </g>
          ))}
          {ticks.map((m) => (
            <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {hourTick(m / 60)}
            </text>
          ))}
          {highlights.map((h) => (
            <rect
              key={h.from}
              x={x(Math.max(x0, h.from))}
              width={Math.max(0, x(Math.min(x1, h.to)) - x(Math.max(x0, h.from)))}
              y={PAD.t}
              height={H - PAD.t - PAD.b}
              fill="var(--quiet)"
              opacity={0.14}
            />
          ))}
          {bandPath && <path d={bandPath} fill="var(--band)" />}
          {medianPath && <path d={medianPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.9} />}
          {nowMin >= x0 && nowMin <= x1 && (
            <line x1={x(nowMin)} x2={x(nowMin)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
          )}
          {todayPath && <path d={todayPath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />}
          {readout && (
            <g>
              <line x1={x(readout.at)} x2={x(readout.at)} y1={PAD.t} y2={H - PAD.b} stroke="var(--fg)" strokeWidth={1} opacity={cursor == null ? 0 : 0.6} />
              {readout.todayVal != null && <circle cx={x(readout.at)} cy={y(readout.todayVal)} r={4} fill={color} stroke="var(--card)" strokeWidth={2} />}
            </g>
          )}
        </svg>
      </div>
      <figcaption className="tnum mt-2 flex min-h-[2.5rem] flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {readout && (
          <span className="font-medium text-fg" aria-live="polite">
            {formatMinute(readout.at)}
            {readout.todayVal != null ? ` · today ${readout.todayVal}` : ""}
            {readout.slot?.median != null
              ? ` · usual ${Math.round(readout.slot.median)} (${Math.round(readout.slot.p25 ?? 0)}–${Math.round(readout.slot.p75 ?? 0)})`
              : ""}
          </span>
        )}
        {!planning && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: color }} aria-hidden="true" /> Today
          </span>
        )}
        {highlights.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "color-mix(in oklab, var(--quiet) 30%, transparent)" }} aria-hidden="true" /> Suggested
          </span>
        )}
        {hasTypical && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "var(--band)" }} aria-hidden="true" /> Usual {weekdayName} (middle half)
          </span>
        )}
      </figcaption>
    </figure>
  );
}
