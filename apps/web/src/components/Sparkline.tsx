import type { BusyLabel } from "@warriorwatch/contract";
import { LABEL_VAR } from "@/lib/labels";

/**
 * Last-3-hours line. Gaps where the API has no data (null). Decorative: the
 * card text carries the numbers. Draws itself once on mount (pathLength=1 so
 * the dash animation is length-independent).
 */
export function Sparkline({
  values,
  max,
  label,
  height = 36,
  index = 0,
  baseline,
}: {
  values: (number | null)[];
  max: number;
  label: BusyLabel;
  height?: number;
  /** stagger index for the draw animation */
  index?: number;
  /** optional dotted reference line (e.g. usual count) */
  baseline?: number | null;
}) {
  const w = 300;
  const h = height;
  const n = values.length;
  if (n < 2) return <div style={{ height }} />;
  const x = (i: number) => (i / (n - 1)) * w;
  const y = (v: number) => h - 2 - (Math.min(v, max) / Math.max(1, max)) * (h - 4);
  const segs: string[] = [];
  let d = "";
  values.forEach((v, i) => {
    if (v == null) {
      if (d) segs.push(d);
      d = "";
      return;
    }
    d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (d) segs.push(d);
  const firstIdx = values.findIndex((v) => v != null);
  const lastIdx = n - 1 - [...values].reverse().findIndex((v) => v != null);
  const area =
    firstIdx >= 0 && segs.length === 1 ? `${segs[0]}L${x(lastIdx).toFixed(1)},${h}L${x(firstIdx).toFixed(1)},${h}Z` : null;
  const color = LABEL_VAR[label === "closed" ? "closed" : label];
  const last = values[lastIdx];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      width="100%"
      height={h}
      aria-hidden="true"
      className="block overflow-visible"
      style={{ "--i": index } as React.CSSProperties}
    >
      {/* quarter guides */}
      {[0.25, 0.5, 0.75].map((q) => (
        <line key={q} x1={0} x2={w} y1={y(q * max)} y2={y(q * max)} stroke="var(--line)" strokeWidth={1} strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
      ))}
      {baseline != null && (
        <line x1={0} x2={w} y1={y(baseline)} y2={y(baseline)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="1 3" vectorEffect="non-scaling-stroke" opacity={0.7} />
      )}
      {area && <path d={area} fill={color} opacity={0.1} className="fade-in" />}
      {segs.map((s, i) => (
        <path
          key={i}
          d={s}
          pathLength={1}
          className="draw"
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      ))}
      {last != null && label !== "closed" && (
        <circle cx={x(lastIdx)} cy={y(last)} r={2.5} fill={color} vectorEffect="non-scaling-stroke" className="fade-in" />
      )}
    </svg>
  );
}
