import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  /** Optional Discord/Slack-compatible webhook URL for scraper alerts (secret). */
  ALERT_WEBHOOK?: string;
}

/** A fetch-compatible function, injectable so tests never hit the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface Deps {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
}

export const defaultDeps: Deps = {
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => new Date(),
};
