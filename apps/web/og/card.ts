import { createElement as h, type ReactElement } from "react";
import type { BusyLabel, LiveFacility, LiveResponse } from "@warriorwatch/contract";
import { display, slugOf } from "../src/lib/facilities";
import { LABEL_TEXT } from "../src/lib/labels";
import { formatTime, localParts } from "../src/lib/time";

/**
 * OpenGraph cards (1200×630), rendered by satori in the Pages Function at
 * functions/og/[slug].ts. Plain createElement so the function needs no JSX
 * build step. Satori supports a flexbox subset only: every div is display:flex.
 */
const C = {
  bg: "#0c0c0e",
  card: "#17171a",
  fg: "#f4f4f5",
  muted: "#a1a1aa",
  line: "#2a2a30",
  brand: "#4c1d95",
  gold: "#fbbf24",
};
const LABEL: Record<BusyLabel, string> = {
  closed: "#52525b",
  quiet: "#34d399",
  moderate: "#fbbf24",
  busy: "#fb923c",
  packed: "#fb7185",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Style = Record<string, string | number>;
const div = (style: Style, ...children: (ReactElement | string | null)[]) =>
  h("div", { style: { display: "flex", ...style } }, ...children);

function ring(f: LiveFacility, size: number): ReactElement {
  const stroke = size / 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = f.open ? Math.min(1, f.count / Math.max(1, f.max)) : 0;
  return div(
    { width: size, height: size, position: "relative", alignItems: "center", justifyContent: "center" },
    h(
      "svg",
      { width: size, height: size, viewBox: `0 0 ${size} ${size}`, style: { position: "absolute", left: 0, top: 0 } },
      h("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: C.line, strokeWidth: stroke }),
      h("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none", stroke: LABEL[f.label], strokeWidth: stroke, strokeLinecap: "round",
        strokeDasharray: `${c}`, strokeDashoffset: `${c * (1 - frac)}`, transform: `rotate(-90 ${size / 2} ${size / 2})`,
      }),
    ),
    div({ fontSize: size * 0.3, fontWeight: 700, color: f.open ? C.fg : C.muted }, f.open ? String(f.count) : "–"),
  );
}

function pill(label: BusyLabel, fontSize: number): ReactElement {
  return div(
    { background: LABEL[label], color: "#0c0c0e", borderRadius: 999, padding: `${fontSize * 0.2}px ${fontSize * 0.7}px`, fontSize, fontWeight: 700 },
    LABEL_TEXT[label],
  );
}

function stamp(iso: string): string {
  return `${DAYS[localParts(iso).weekday]} ${formatTime(iso)}`;
}

function footer(): ReactElement {
  return div(
    { justifyContent: "space-between", alignItems: "center", color: C.muted, fontSize: 24 },
    div(
      { alignItems: "center", gap: 14 },
      div({ width: 34, height: 34, borderRadius: 10, background: C.brand, alignItems: "center", justifyContent: "center" },
        div({ width: 18, height: 18, borderRadius: 999, border: `4px solid ${C.gold}` })),
      div({ color: C.fg, fontWeight: 700 }, "WarriorWatch"),
    ),
    div({}, "Not affiliated with the University of Waterloo"),
  );
}

/** `closedText` e.g. "Opens 6 AM tomorrow", shown instead of the count when closed. */
export function facilityCard(live: LiveResponse, f: LiveFacility, closedText = "Closed right now"): ReactElement {
  const d = display(f.id, f.name);
  return div(
    { width: 1200, height: 630, background: C.bg, color: C.fg, padding: 64, flexDirection: "column", justifyContent: "space-between", fontFamily: "Inter" },
    div({ color: C.muted, fontSize: 28 }, `Live at UWaterloo · ${stamp(live.fetchedAt)}${live.stale ? " · source not live" : ""}`),
    div(
      { alignItems: "center", gap: 64 },
      ring(f, 300),
      div(
        { flexDirection: "column", gap: 14 },
        div({ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }, d.title),
        div({ fontSize: 34, color: C.muted }, d.where),
        div(
          { alignItems: "center", gap: 24, marginTop: 18 },
          pill(f.label, 34),
          f.open
            ? div({ fontSize: 40, color: C.fg }, `${f.count} / ${f.max} people · ${f.pct}%`)
            : div({ fontSize: 40, color: C.muted }, closedText),
        ),
      ),
    ),
    footer(),
  );
}

export function liveCard(live: LiveResponse): ReactElement {
  const rows = live.facilities.map((f) => {
    const d = display(f.id, f.name);
    const frac = f.open ? Math.min(1, f.count / Math.max(1, f.max)) : 0;
    return div(
      { alignItems: "center", gap: 24, height: 52 },
      div({ width: 340, fontSize: 30, fontWeight: 700 }, d.title),
      div(
        { width: 380, height: 18, background: C.line, borderRadius: 999 },
        div({ width: Math.max(frac > 0 ? 18 : 0, Math.round(380 * frac)), height: 18, background: LABEL[f.label], borderRadius: 999 }),
      ),
      div({ width: 130, fontSize: 30, justifyContent: "flex-end", color: f.open ? C.fg : C.muted }, f.open ? `${f.count}/${f.max}` : "closed"),
      div({ width: 150, justifyContent: "flex-end" }, f.open ? pill(f.label, 22) : null),
    );
  });
  return div(
    { width: 1200, height: 630, background: C.bg, color: C.fg, padding: "52px 64px", flexDirection: "column", justifyContent: "space-between", fontFamily: "Inter" },
    div(
      { justifyContent: "space-between", alignItems: "baseline" },
      div({ fontSize: 46, fontWeight: 700 }, "How busy is the gym?"),
      div({ fontSize: 26, color: C.muted }, `${stamp(live.fetchedAt)}${live.stale ? " · source not live" : ""}`),
    ),
    div({ flexDirection: "column", gap: 4 }, ...rows),
    footer(),
  );
}

export function findBySlug(live: LiveResponse, slug: string): LiveFacility | undefined {
  return live.facilities.find((f) => slugOf(f.id) === slug);
}
