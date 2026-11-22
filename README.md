# cerebras-openclaw-search

Ahmad Fauzan Putra's entry for the Cerebras x Kimi K3.1 Pro **Santa's Speedy Shopper** speed bounty.

**Result:** `1,469 tok/s mean · 1,483 p90 (server)`, measured by the official OpenClaw speed patch readout over one fresh session.

## What's here

| File | What it is |
| --- | --- |
| `gift-search-mcp.mjs` | A small MCP server: the only addition to stock OpenClaw. It exposes one tool, `search_products`, which runs a **live** keyword search against Shopify's public product catalog (`catalog.shopify.com`, no API key) and returns `{name, url, price, store}` per product. It strips `_gsid` / `utm_*` tracking parameters from URLs. Nothing is hardcoded: every product and link comes from the live search. |
| `prompt.txt` | The exact prompt used. |
| `config/openclaw.json` | The OpenClaw config used (API key removed; set `CEREBRAS_API_KEY`). |
| `evidence/` | Per-call evidence for the 1,469 session: Cerebras response IDs, token counts and server completion times. |

## Setup

- OpenClaw with the official Cerebras speed patch (the TPS readout). The patch is not included here, as requested by the organizers. No other changes were made to the OpenClaw source.
- Model: `cerebras/moonshotai-kimi-k3.1-pro-trial` (Kimi K3.1 Pro), thinking `low`.
- Config only, no code changes:
  - `tools.profile: minimal`, `tools.alsoAllow: ["gifts__*"]` (only the gift search tool is enabled)
  - `tools.toolSearch: false`, `skills.allowBundled: []`
  - `agents.defaults.heartbeat.every: 0m`, `agents.defaults.contextInjection: never`
- The gift search tool is registered as the `gifts` MCP server (see `config/openclaw.json`), with parallel tool calls enabled.

No system-prompt replacement, forced tool calls, temperature or output-length caps, or other patches to OpenClaw.

## Run

```bash
npm i -g openclaw   # then apply the official speed patch
export CEREBRAS_API_KEY=...
# copy config/openclaw.json into your OpenClaw profile and fix the path to gift-search-mcp.mjs
openclaw gateway run
openclaw agent --session-id "$(uuidgen)" --thinking low --message-file prompt.txt
```

Or paste `prompt.txt` into a fresh chat in the dashboard.

## The 1,469 run

Session `cf12d9ba-d865-425e-b803-b15f98f75c2c`, 22 Nov 2026, 19:58–19:59 WIB (UTC+7). Two model calls:

| Call | Cerebras response ID | Completion tokens | tok/s |
| --- | --- | --- | --- |
| Tool call (5 parallel searches) | `chatcmpl-0d0dbf26-facf-41cf-bad5-176540f36fb1` | 281 | 1,483 |
| Final answer | `chatcmpl-afd6d77d-44a8-40a7-bf78-38a1eeb8609a` | 285 | 1,454 |

Output (5 real gifts from live search):

```json
{"gifts":[{"name":"Magnetic RoboCar Set","url":"https://smartoonkids.com/products/magnetic-robocar-set?variant=44703613092029","price":64.97,"store":"Smartoon Kids"},{"name":"Warm & Welcome 3-Wick Candle","url":"https://goosecreek.com/products/warm-welcome-large-3-wick-candle?variant=40236410830923","price":10.25,"store":"Goose Creek Candle"},{"name":"Dreamer Blanket","url":"https://comfrt.com/products/the-dreamer-blanket","price":99,"store":"Comfrt"},{"name":"Pickle Stickle Super Chewer Durable Gnaw Dog Toy","url":"https://bark.co/products/pickle-stickle?variant=40831751684183","price":8,"store":"BARK"},{"name":"Artisan Coffee Mug - Cup Of Cozy","url":"https://www.naturallife.com/products/artisan-coffee-mug-cup-of-cozy?variant=42283252744365","price":19,"store":"Natural Life"}]}
```

Note: this session was started from the CLI (`openclaw agent`), so the dashboard lists it as `explicit:cf12d9ba…`. Scores vary run to run with Cerebras load; most runs of this prompt landed around 950–1,150 mean.
