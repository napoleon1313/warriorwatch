import type { BusyLabel } from "@warriorwatch/contract";
import { LABEL_TEXT, LABEL_VAR } from "@/lib/labels";

interface Props {
  count: number;
  max: number;
  label: BusyLabel;
  size?: number;
  /** what's printed in the middle; defaults to the count */
  center?: string;
}

/** Capacity ring. One accessible name carries the whole reading. */
export function Ring({ count, max, label, size = 64, center }: Props) {
  const stroke = Math.max(5, Math.round(size / 10));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = label === "closed" ? 0 : Math.max(0, Math.min(1, max ? count / max : 0));
  const pct = Math.round(frac * 100);
  const name =
    label === "closed"
      ? "Closed"
      : `${count} of ${max} people, ${pct}% full, ${LABEL_TEXT[label].toLowerCase()}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={name} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
      <circle
        className="ring-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={LABEL_VAR[label]}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill={label === "closed" ? "var(--muted)" : "var(--fg)"}
        fontSize={size * (center && center.length > 3 ? 0.24 : 0.32)}
        fontWeight={700}
        className="tnum"
      >
        {center ?? (label === "closed" ? "–" : count)}
      </text>
    </svg>
  );
}
