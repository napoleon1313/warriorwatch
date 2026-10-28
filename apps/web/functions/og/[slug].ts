import { GoogleFont, ImageResponse, cache } from "@cf-wasm/og/workerd";
import type { Facility, LiveResponse } from "@warriorwatch/contract";
import registry from "@warriorwatch/contract/facilities.json";
import { facilityCard, findBySlug, liveCard } from "../../og/card";
import { openStatus } from "../../src/lib/hours";
import { mockLive } from "../../src/mock/api";

/**
 * GET /og/live and /og/<slug> → 1200×630 PNG with live numbers.
 * Cloudflare Pages Function (the rest of the site is a static export).
 * Reads NEXT_PUBLIC_API_BASE (or API_BASE) from the Pages environment; with
 * neither set it renders the same synthetic data the static site shows.
 */
interface Env {
  NEXT_PUBLIC_API_BASE?: string;
  API_BASE?: string;
}

async function getLive(env: Env, url: URL): Promise<LiveResponse> {
  const base = (env.API_BASE || env.NEXT_PUBLIC_API_BASE || "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (!base) {
    // Demo mode only: ?at=<ISO> renders the mock at another moment.
    const at = Date.parse(url.searchParams.get("at") ?? "");
    return mockLive(Number.isFinite(at) ? at : Date.now(), "normal");
  }
  const res = await fetch(`${base}/api/live`, { headers: { accept: "application/json" }, cf: { cacheTtl: 30 } });
  if (!res.ok) throw new Error(`live ${res.status}`);
  return (await res.json()) as LiveResponse;
}

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  cache.setExecutionContext(ctx);
  const slug = String(ctx.params.slug).replace(/\.png$/, "");
  let live: LiveResponse;
  try {
    live = await getLive(ctx.env, new URL(ctx.request.url));
  } catch {
    return new Response("upstream unavailable", { status: 502, headers: { "cache-control": "no-store" } });
  }
  const node = slug === "live" ? liveCard(live) : (() => {
    const f = findBySlug(live, slug);
    if (!f) return null;
    // Regular hours from the bundled registry; display-only ("Opens 6 AM").
    const fac = (registry as Facility[]).find((x) => x.id === f.id);
    return facilityCard(live, f, fac ? openStatus(fac.hours, Date.parse(live.fetchedAt)).text : undefined);
  })();
  if (!node) return new Response("unknown facility", { status: 404 });
  return ImageResponse.async(node, {
    width: 1200,
    height: 630,
    fonts: [new GoogleFont("Inter", { weight: 400 }), new GoogleFont("Inter", { weight: 700 })],
    headers: { "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300" },
  });
};
