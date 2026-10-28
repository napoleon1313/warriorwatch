import type { BusyLabel } from "@warriorwatch/contract";
import { LABEL_VAR } from "@/lib/labels";

/** Last-3-hours line. Gaps where the API has no data (null). Decorative: the card text carries the numbers. */
export function Sparkline({
  values,
  max,
  label,
  height = 36,
}: {
  values: (number | null)[];
  max: number;
  label: BusyLabel;
  height?: number;
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
    firstIdx >= 0 && segs.length === 1
      ? `${segs[0]}L${x(lastIdx).toFixed(1)},${h}L${x(firstIdx).toFixed(1)},${h}Z`
      : null;
  const color = LABEL_VAR[label === "closed" ? "closed" : label];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h} aria-hidden="true" className="block">
      {area && <path d={area} fill={color} opacity={0.12} />}
      {segs.map((s, i) => (
        <path key={i} d={s} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
