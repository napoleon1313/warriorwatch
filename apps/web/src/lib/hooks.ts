"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { clockNow } from "./clock";

export interface Polled<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetch now and then every `intervalMs` while the tab is visible. Hidden tabs
 * don't poll; coming back refreshes immediately if the data is older than the
 * interval. Keeps the last good data on error so a blip doesn't blank the page.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number | null,
  key: string,
): Polled<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const last = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const ctrl = useRef<AbortController | null>(null);

  const run = useCallback(() => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    last.current = Date.now();
    fetcherRef
      .current(c.signal)
      .then((d) => {
        if (c.signal.aborted) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => {
        if (c.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setData(null);
    run();
    if (!intervalMs) return () => ctrl.current?.abort();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, intervalMs);
    const onVis = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > intervalMs) run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      ctrl.current?.abort();
    };
  }, [key, intervalMs, run]);

  return { data, error, loading, refresh: run };
}

/** Current time, re-rendered every `ms` so "3 min ago" stays honest. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => clockNow());
  useEffect(() => {
    setNow(clockNow());
    const id = window.setInterval(() => setNow(clockNow()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Width of an element in CSS px, for charts that draw at real size (crisp text on phones). */
export function useWidth<T extends HTMLElement>(fallback = 340): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}
