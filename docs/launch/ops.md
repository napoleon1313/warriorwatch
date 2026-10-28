# Ops recipes

Two things to set up after the first deploy: an uptime monitor so you hear when scraping breaks, and an optional Discord alert when a gym gets quiet. Both only read the public API.

Replace `https://<api-host>` with the real worker URL.

## 1. Uptime monitor on `/api/health`

`/api/health` is never cached and returns:

```json
{ "ok": true, "lastScrape": "2026-10-28T01:55:00.000Z", "lastOkScrape": "2026-10-28T01:55:00.000Z", "cards": 7 }
```

The worker can answer `200` while scraping is broken, so check the body for `"ok":true` as well as the status code.

### UptimeRobot (free plan, 5-minute checks)

1. New monitor → type **Keyword**.
2. URL: `https://<api-host>/api/health`
3. Keyword: `"ok":true`, alert when the keyword **does not exist**.
4. Interval: 5 minutes.
5. Alert contacts: the project email, and a Discord webhook if you want it in a channel (UptimeRobot has a Discord integration under Integrations).

Better Stack, Cronitor and Healthchecks.io all do the same with a keyword or JSON assertion. Use whichever the owner already has an account with.

What it catches:

| Failure | How it shows up |
|---|---|
| Worker down or erroring | no response or 5xx, keyword missing |
| Portal changed its HTML, parser finds fewer than 7 cards | `ok: false`, `cards` < 7 |
| Cron stopped or portal unreachable | `ok: false`, `lastOkScrape` getting old |

### No-account fallback: cron on any machine

```bash
#!/usr/bin/env bash
# ww-health.sh: run every 5 minutes. Posts to Discord when health turns bad, and again when it recovers.
set -euo pipefail
API="${API:-https://<api-host>/api}"
WEBHOOK="${DISCORD_WEBHOOK:?set DISCORD_WEBHOOK}"
STATE="${STATE:-$HOME/.ww-health-state}"

body=$(curl -fsS --max-time 20 "$API/health" || echo '{"ok":false,"error":"unreachable"}')
now=$(jq -r 'if .ok then "ok" else "bad" end' <<<"$body")
before=$(cat "$STATE" 2>/dev/null || echo ok)
if [[ "$now" != "$before" ]]; then
  msg="WarriorWatch health: $now. $(jq -c . <<<"$body")"
  curl -fsS -H 'Content-Type: application/json' -d "$(jq -n --arg c "$msg" '{content:$c}')" "$WEBHOOK" >/dev/null
fi
echo "$now" > "$STATE"
```

```
*/5 * * * * API=https://<api-host>/api DISCORD_WEBHOOK=https://discord.com/api/webhooks/... /path/to/ww-health.sh
```

It only posts when the state flips, so a long outage is one message, not 288 a day.

## 2. Discord alert: "free weights under 30% now"

Posts once when a facility drops under 30% of max while open, then stays quiet until it climbs back to 35% or more. The 5-point gap stops a count bouncing between 29% and 31% from spamming the channel.

### Make the webhook

Discord server → channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Treat the URL as a password: anyone with it can post to the channel. Keep it in an env var or a secret, never in the repo.

### Option A: bash + cron (simplest)

Needs `curl` and `jq`.

```bash
#!/usr/bin/env bash
# ww-quiet.sh: run every 5 minutes. Alerts when a watched facility drops under 30%.
set -euo pipefail
API="${API:-https://<api-host>/api}"
WEBHOOK="${DISCORD_WEBHOOK:?set DISCORD_WEBHOOK}"
WATCH="${WATCH:-Free Weights|CIF Fitness}"      # regex on facility name
STATE="${STATE:-$HOME/.ww-quiet-state}"          # ids already alerted
touch "$STATE"

curl -fsS --max-time 20 "$API/live" |
  jq -r --arg w "$WATCH" 'select(.stale | not) | .facilities[]
        | select(.open and (.name | test($w))) | [.id, .pct, .count, .max, .name] | @tsv' |
  while IFS=$'\t' read -r id pct count max name; do
    if (( pct < 30 )) && ! grep -qx "$id" "$STATE"; then
      msg="$name is at $pct% right now ($count/$max)."
      curl -fsS -H 'Content-Type: application/json' -d "$(jq -n --arg c "$msg" '{content:$c}')" "$WEBHOOK" >/dev/null
      echo "$id" >> "$STATE"
    elif (( pct >= 35 )); then
      grep -vx "$id" "$STATE" > "$STATE.tmp" || true
      mv "$STATE.tmp" "$STATE"
    fi
  done
```

```
*/5 * * * * DISCORD_WEBHOOK=https://discord.com/api/webhooks/... /path/to/ww-quiet.sh
```

The script skips the whole run when the portal reports stale data, and ignores closed facilities (the portal keeps the last count overnight).

### Option B: a separate Cloudflare Worker (no machine to keep on)

Same logic, with Workers KV holding the "already alerted" set. Keep it as its own small Worker, separate from the main API worker, so a bug here can't affect scraping.

`wrangler.toml`:

```toml
name = "warriorwatch-quiet-alert"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[triggers]
crons = ["*/5 * * * *"]

[[kv_namespaces]]
binding = "STATE"
id = "<from: npx wrangler kv namespace create STATE>"

[vars]
API_BASE = "https://<api-host>/api"
# DISCORD_WEBHOOK is a secret: npx wrangler secret put DISCORD_WEBHOOK
```

`src/index.ts`:

```ts
import type { LiveResponse } from "@warriorwatch/contract";

interface Env { STATE: KVNamespace; DISCORD_WEBHOOK: string; API_BASE: string }

const WATCH = new Set([
  "7c59cbfb-ea06-46e0-8ec7-06739ccaec45", // PAC 1st Floor Free Weights
  "b2d98ff8-e37a-42da-bf72-06b259ff1a2c", // CIF Fitness Centre
]);
const UNDER = 30; // alert below this %
const REARM = 35; // re-arm at or above this %

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const res = await fetch(`${env.API_BASE}/live`);
    if (!res.ok) return;
    const live = (await res.json()) as LiveResponse;
    if (live.stale) return;

    for (const f of live.facilities) {
      if (!WATCH.has(f.id) || !f.open) continue;
      const alerted = (await env.STATE.get(f.id)) !== null;
      if (f.pct < UNDER && !alerted) {
        await fetch(env.DISCORD_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `${f.name} is at ${f.pct}% right now (${f.count}/${f.max}).` }),
        });
        // TTL so a missed re-arm (e.g. facility closed while quiet) clears by itself.
        await env.STATE.put(f.id, "1", { expirationTtl: 12 * 3600 });
      } else if (f.pct >= REARM && alerted) {
        await env.STATE.delete(f.id);
      }
    }
  },
};
```

Deploy:

```bash
npx wrangler kv namespace create STATE     # paste the id into wrangler.toml
npx wrangler secret put DISCORD_WEBHOOK
npx wrangler deploy
```

Every 5 minutes is 288 calls a day to `/api/live`, well inside the API's 60-per-minute limit, and the response is edge-cached for 30 s, so it costs the portal nothing. Don't point either recipe at `warrior.uwaterloo.ca` directly.

### Variations

- Different threshold or rooms: change `UNDER`/`REARM` and `WATCH` (or the `WATCH` regex in the bash version). GUIDs and names are in `packages/contract/facilities.json`.
- "Quieter than usual" instead of a fixed %: alert on `f.delta !== null && f.delta <= -10`.
- Morning digest: a daily cron that calls `/api/best?facility=cif-fitness` and posts the top 3 windows.
