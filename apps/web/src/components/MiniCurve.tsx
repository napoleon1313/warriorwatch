/**
 * Small-multiple curve over a day (minutes 0..1440). Used for "room by room"
 * on the live page, "a usual week" and "last 7 days" on the facility page, and
 * the block rows in the session builder. Pure SVG, no interaction; the
 * surrounding text carries the numbers.
 */
export interface MiniPoint {
  /** minute of local day */
  m: number;
  v: number | null;
}

export function MiniCurve({
  points,
  max,
  color = "var(--accent)",
  nowMin,
  from = 300,
  to = 1440,
  height = 44,
  highlight,
  highlightColor = "var(--accent)",
  fill = true,
  dashed = false,
  index = 0,
}: {
  points: MiniPoint[];
  max: number;
  color?: string;
  /** vertical marker at this minute */
  nowMin?: number | null;
  from?: number;
  to?: number;
  height?: number;
  /** shaded minute range, e.g. a planned block */
  highlight?: { from: number; to: number } | null;
  highlightColor?: string;
  fill?: boolean;
  dashed?: boolean;
  index?: number;
}) {
  const W = 300;
  const H = height;
  const x = (m: number) => ((Math.min(to, Math.max(from, m)) - from) / (to - from)) * W;
  const y = (v: number) => H - 1.5 - (Math.min(v, max) / Math.max(1, max)) * (H - 4);
  let d = "";
  let pen = false;
  let first: number | null = null;
  let last: number | null = null;
  for (const p of points) {
    if (p.m < from || p.m > to) continue;
    if (p.v == null) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${x(p.m).toFixed(1)},${y(p.v).toFixed(1)}`;
    if (first == null) first = p.m;
    last = p.m;
    pen = true;
  }
  const area = d && fill && first != null && last != null ? `${d}L${x(last).toFixed(1)},${H}L${x(first).toFixed(1)},${H}Z` : null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
      aria-hidden="true"
      className="block overflow-visible"
      style={{ "--i": index } as React.CSSProperties}
    >
      <line x1={0} x2={W} y1={y(max / 2)} y2={y(max / 2)} stroke="var(--line)" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
      {highlight && (
        <rect
          x={x(highlight.from)}
          width={Math.max(1, x(highlight.to) - x(highlight.from))}
          y={0}
          height={H}
          fill={highlightColor}
          opacity={0.16}
          className="fade-in"
        />
      )}
      {area && <path d={area} fill={color} opacity={0.1} />}
      {d && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeDasharray={dashed ? "3 3" : undefined}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          pathLength={1}
          className="draw"
        />
      )}
      {nowMin != null && nowMin >= from && nowMin <= to && (
        <line x1={x(nowMin)} x2={x(nowMin)} y1={0} y2={H} stroke="var(--fg)" strokeWidth={1} opacity={0.55} vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

/** "6a · 12p · 6p" axis under a MiniCurve. */
export function MiniAxis({ from = 300, to = 1440 }: { from?: number; to?: number }) {
  const ticks: number[] = [];
  for (let m = Math.ceil(from / 360) * 360; m <= to; m += 360) ticks.push(m);
  const label = (m: number) => {
    const h = (m / 60) % 24;
    return h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`;
  };
  return (
    <div className="relative mt-1 h-3" aria-hidden="true">
      {ticks.map((m) => (
        <span key={m} className="mono absolute -translate-x-1/2 text-[9px] text-faint" style={{ left: `${((m - from) / (to - from)) * 100}%` }}>
          {label(m)}
        </span>
      ))}
    </div>
  );
}
