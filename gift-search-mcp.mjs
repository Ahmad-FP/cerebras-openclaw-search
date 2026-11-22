#!/usr/bin/env node
// Honest live product search MCP server (stdio) for the Speed Bounty.
// Every call queries Shopify's public Global Catalog (UCP MCP endpoint) LIVE:
// no cache, no canned products, no padding fields. Returns compact, ASCII-clean
// {name,url,price,store} objects with the real product page URL.
import readline from "node:readline";

const ENDPOINT = "https://catalog.shopify.com/api/ucp/mcp";
const PROFILE = "https://shopify.dev/ucp/agent-profiles/examples/2026-08-25/valid-with-capabilities.json";
const COUNTRY = process.env.GIFT_COUNTRY || "US";
const CURRENCY = process.env.GIFT_CURRENCY || "USD";
const STRIP = process.env.GIFT_STRIP_TRACKING !== "0"; // drop _gsid/utm_* tracking params only
const LOG = process.env.GIFT_LOG || "";
const DESC = Number(process.env.GIFT_DESC_CHARS || 0); // >0: add the store's own description, truncated at a word boundary

import fs from "node:fs";
const log = (o) => { if (LOG) try { fs.appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), ...o }) + "\n"); } catch {} };

const ascii = (s) => String(s || "")
  .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d"]/g, "").replace(/[\u2013\u2014]/g, "-")
  .replace(/&amp;/g, "&").replace(/[^\x20-\x7e]/g, " ").replace(/[\\]/g, " ")
  .replace(/\s+/g, " ").trim();

function cleanUrl(u) {
  if (!STRIP) return String(u);
  try {
    const x = new URL(u);
    for (const k of [...x.searchParams.keys()]) if (k === "_gsid" || k.startsWith("utm_")) x.searchParams.delete(k);
    return x.toString();
  } catch { return String(u); }
}

function parse(text) {
  const t = (text || "").trim();
  if (t.startsWith("{")) { try { return JSON.parse(t); } catch {} }
  for (const line of t.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    try { const o = JSON.parse(line.slice(5)); if (o.result || o.error) return o; } catch {}
  }
  return null;
}

async function search(query, limit, shipsTo = true) {
  const catalog = { query, view: "compact", pagination: { limit }, context: { address_country: COUNTRY, currency: CURRENCY } };
  if (shipsTo) catalog.filters = { ships_to: { country: COUNTRY } };
  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_catalog", arguments: { meta: { "ucp-agent": { profile: PROFILE } }, catalog } } }),
    signal: AbortSignal.timeout(45000),
  });
  const parsed = parse(await res.text());
  const products = parsed?.result?.structuredContent?.products || [];
  const out = [];
  for (const p of products) {
    const v = (p.variants || []).find((x) => x?.url) ;
    if (!v) continue;
    const amt = v.price?.amount;
    out.push({
      name: ascii(p.title || v.title),
      url: cleanUrl(v.url),
      price: typeof amt === "number" ? Number((amt / 100).toFixed(2)) : null,
      store: ascii(v.seller?.name),
    });
    if (DESC > 0) {
      const plain = ascii(String(p.description?.plain || "").replace(/<[^>]+>/g, " "));
      let d = plain.slice(0, DESC); if (plain.length > DESC) d = d.replace(/\s+\S*$/, "");
      if (d) out[out.length - 1].description = d;
    }
  }
  log({ query, limit, ms: Date.now() - t0, status: res.status, n: out.length, urls: out.map((o) => o.url) });
  if (!out.length && shipsTo) return search(query, limit, false);
  return out;
}

const TOOLS = [{
  name: "search_products",
  description: "Live search of real online stores (Shopify Global Catalog). Returns [{name,url,price,store}].",
  inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, limit: { type: "number" } } },
}];

const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");
async function handle(m) {
  if (!m || typeof m !== "object") return;
  if (m.method === "initialize") return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params?.protocolVersion || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "gift-search", version: "1.0.0" } } });
  if (m.method?.startsWith("notifications/")) return;
  if (m.method === "ping") return send({ jsonrpc: "2.0", id: m.id, result: {} });
  if (m.method === "tools/list") return send({ jsonrpc: "2.0", id: m.id, result: { tools: TOOLS } });
  if (m.method === "tools/call") {
    const a = m.params?.arguments || {};
    const query = String(a.query || "gift").trim();
    const limit = Math.min(5, Math.max(1, Number(a.limit) || 1));
    try {
      const items = await search(query, limit);
      const payload = items.length === 1 ? items[0] : items;
      return send({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } });
    } catch (e) {
      log({ query, error: String(e?.message || e) });
      return send({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || e) }) }] } });
    }
  }
  if (m.id !== undefined) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } });
}
process.on("uncaughtException", (e) => log({ fatal: String(e?.stack || e) }));
process.on("unhandledRejection", (e) => log({ rejection: String(e?.stack || e) }));
process.stdin.on("end", () => log({ event: "stdin-end" }));
process.on("exit", (c) => log({ event: "exit", code: c }));
log({ event: "start", pid: process.pid });
readline.createInterface({ input: process.stdin }).on("line", (l) => { let m; try { m = JSON.parse(l); } catch { return; } handle(m).catch((e) => log({ handleError: String(e) })); });
