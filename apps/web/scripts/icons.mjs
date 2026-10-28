// Regenerates the PNG app icons in public/ from the same drawing as icon.svg.
// Run once after changing the logo: `node scripts/icons.mjs`.
import { writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og.js";
import { createElement as h } from "react";

function logo(size, padding) {
  const inner = size - padding * 2;
  const r = inner * 0.28;
  const stroke = inner * 0.125;
  const c = 2 * Math.PI * r;
  return h(
    "div",
    { style: { width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: "#4c1d95", borderRadius: padding ? 0 : size * 0.28 } },
    h(
      "svg",
      { width: inner, height: inner, viewBox: `0 0 ${inner} ${inner}` },
      h("circle", { cx: inner / 2, cy: inner / 2, r, fill: "none", stroke: "#3b2a6b", strokeWidth: stroke }),
      h("circle", {
        cx: inner / 2, cy: inner / 2, r, fill: "none", stroke: "#fbbf24", strokeWidth: stroke, strokeLinecap: "round",
        strokeDasharray: c, strokeDashoffset: c * 0.354, transform: `rotate(-90 ${inner / 2} ${inner / 2})`,
      }),
    ),
  );
}

const out = new URL("../public/", import.meta.url);
for (const [name, size, pad] of [["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0], ["icon-maskable-512.png", 512, 80]]) {
  const res = new ImageResponse(logo(size, pad), { width: size, height: size });
  await writeFile(new URL(name, out), Buffer.from(await res.arrayBuffer()));
  console.log("wrote", name);
}
