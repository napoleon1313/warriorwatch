import type {
  BestResponse,
  FacilitiesResponse,
  HistoryResponse,
  LiveResponse,
  TypicalResponse,
} from "@warriorwatch/contract";
import type { MockScenario } from "@/mock/api";

/**
 * Public API client. NEXT_PUBLIC_API_BASE may be given as either
 * "https://worker.example" or "https://worker.example/api"; when it is unset
 * the client serves synthetic data from src/mock (loaded lazily, so a build
 * pointed at a real worker never downloads it).
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "").trim().replace(/\/+$/, "").replace(/\/api$/, "");
export const USING_MOCK = API_BASE === "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function scenario(): MockScenario {
  if (typeof location === "undefined") return "normal";
  const s = new URLSearchParams(location.search).get("mock");
  return s === "fresh" || s === "stale" || s === "down" ? s : "normal";
}

type Query = Record<string, string | number | undefined>;

async function get<T>(path: string, query: Query = {}, signal?: AbortSignal): Promise<T> {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") q[k] = String(v);
  if (USING_MOCK) {
    const [mock, { clockNow }] = await Promise.all([import("@/mock/api"), import("./clock")]);
    try {
      return mock.mockGet(path, q, scenario(), clockNow()) as T;
    } catch (e) {
      throw e instanceof mock.MockHttpError ? new ApiError(e.status, e.message) : e;
    }
  }
  const qs = new URLSearchParams(q).toString();
  const res = await fetch(`${API_BASE}/api/${path}${qs ? `?${qs}` : ""}`, { signal, headers: { accept: "application/json" } });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export const api = {
  live: (signal?: AbortSignal) => get<LiveResponse>("live", {}, signal),
  facilities: (signal?: AbortSignal) => get<FacilitiesResponse>("facilities", {}, signal),
  history: (facility: string, from: string, to?: string, res: "raw" | "5m" | "15m" | "1h" = "5m", signal?: AbortSignal) =>
    get<HistoryResponse>("history", { facility, from, to, res }, signal),
  typical: (facility: string, weekday: number, signal?: AbortSignal) =>
    get<TypicalResponse>("typical", { facility, weekday }, signal),
  best: (facility: string, date: string, signal?: AbortSignal) => get<BestResponse>("best", { facility, date }, signal),
};

/** Public URL of an endpoint, for the docs page and "view JSON" links. */
export function publicEndpoint(path: string): string | null {
  return USING_MOCK ? null : `${API_BASE}/api/${path}`;
}
