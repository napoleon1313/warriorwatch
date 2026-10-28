"use client";

import type { BusyLabel } from "@warriorwatch/contract";
import { useCountUp } from "@/lib/hooks";
import { LABEL_TEXT, LABEL_VAR } from "@/lib/labels";

interface Props {
  count: number;
  max: number;
  label: BusyLabel;
  size?: number;
  /** what's printed in the middle; defaults to the count */
  center?: string;
  /** faint tick marks around the ring (instrument look) */
  ticks?: boolean;
}

/** Capacity ring. One accessible name carries the whole reading. Arc and number animate on change. */
export function Ring({ count, max, label, size = 64, center, ticks = true }: Props) {
  const stroke = Math.max(4, Math.round(size / 12));
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const frac = label === "closed" ? 0 : Math.max(0, Math.min(1, max ? count / max : 0));
  const pct = Math.round(frac * 100);
  const shown = useCountUp(count);
  const name =
    label === "closed" ? "Closed" : `${count} of ${max} people, ${pct}% full, ${LABEL_TEXT[label].toLowerCase()}`;
  const cx = size / 2;
  const tickEls = ticks
    ? Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const r1 = size / 2 - 1;
        const r2 = r1 - (i % 3 === 0 ? 3 : 1.5);
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r1}
            y1={cx + Math.sin(a) * r1}
            x2={cx + Math.cos(a) * r2}
            y2={cx + Math.sin(a) * r2}
            stroke="var(--line-2)"
            strokeWidth={1}
          />
        );
      })
    : null;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={name} className="shrink-0">
      {tickEls}
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        className="ring-arc"
        cx={cx}
        cy={cx}
        r={r}
        fill="none"
        stroke={LABEL_VAR[label]}
        strokeWidth={stroke}
        strokeLinecap="butt"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill={label === "closed" ? "var(--muted)" : "var(--fg)"}
        fontSize={size * (center && center.length > 3 ? 0.22 : 0.3)}
        fontWeight={600}
        className="mono"
      >
        {center ?? (label === "closed" ? "—" : shown)}
      </text>
    </svg>
  );
}
