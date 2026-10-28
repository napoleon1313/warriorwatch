"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { SLUG_TO_ID, display } from "@/lib/facilities";
import { usePolling, useNow } from "@/lib/hooks";
import { LABEL_TEXT } from "@/lib/labels";
import { relativeAgo } from "@/lib/time";
import { Ring } from "./Ring";
import { REFRESH_MS } from "./LiveBoard";

/** Minimal iframe widget. ?theme=light|dark forces a theme; default follows the viewer. */
export function EmbedCard({ slug }: { slug: string }) {
  const id = SLUG_TO_ID[slug]!;
  const d = display(id);
  const now = useNow(30_000);
  const live = usePolling((s) => api.live(s), REFRESH_MS, "live");
  const f = live.data?.facilities.find((x) => x.id === id);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("theme");
    if (t === "light" || t === "dark") document.documentElement.classList.toggle("dark", t === "dark");
    document.body.style.background = "transparent";
  }, []);

  return (
    <a
      href={`/f/${slug}`}
      target="_blank"
      rel="noopener"
      className="flex h-[120px] w-full max-w-[420px] items-center gap-3 rounded-[14px] border border-line bg-card p-3 text-fg no-underline"
    >
      {f ? <Ring count={f.count} max={f.max} label={f.label} size={72} /> : <div className="skeleton h-[72px] w-[72px] rounded-full" />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold leading-tight">{d.title}</p>
        <p className="truncate text-xs text-muted">{d.where}</p>
        <p className="mono mt-1 text-sm">
          {f ? (
            f.open ? (
              <>
                <strong>{LABEL_TEXT[f.label]}</strong> · {f.count}/{f.max}
              </>
            ) : (
              <strong>Closed</strong>
            )
          ) : live.error ? (
            <span className="text-muted">Unavailable</span>
          ) : (
            " "
          )}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {f ? `Updated ${relativeAgo(f.lastChange, now)} · ` : ""}WarriorWatch ↗
        </p>
      </div>
    </a>
  );
}
