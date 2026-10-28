/**
 * The contract gives the slope in people per 10 min but no "flat" cut-off;
 * below one person per 10 minutes is treated as steady (display-only).
 */
export const TREND_STEADY = 1;

export function trendWord(trend: number | null): { arrow: string; text: string } | null {
  if (trend == null) return null;
  if (trend >= TREND_STEADY) return { arrow: "↗", text: "Filling up" };
  if (trend <= -TREND_STEADY) return { arrow: "↘", text: "Emptying" };
  return { arrow: "→", text: "Steady" };
}

export function Trend({ trend }: { trend: number | null }) {
  const t = trendWord(trend);
  if (!t) return null;
  const per = trend == null ? "" : `${trend > 0 ? "+" : ""}${trend.toFixed(1)} people per 10 min over the last 20 min`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted" title={per}>
      <span aria-hidden="true" className="text-sm leading-none">
        {t.arrow}
      </span>
      {t.text}
      <span className="sr-only">, {per}</span>
    </span>
  );
}
