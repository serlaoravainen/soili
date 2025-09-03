// Ei ulkoisia importteja → toimii myös, jos deno.land ei ole saatavilla.

type Manifest = { files: { path: string; size: number; binary?: boolean }[] };

const PROJECT_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://chatgpt.com").split(",");
const RAW_BASE = Deno.env.get("RAW_BASE") || "https://raw.githubusercontent.com/serlaoravainen/tuukka-chat-exports/main/files/";
const MANIFEST_URL = Deno.env.get("MANIFEST_URL") || "https://raw.githubusercontent.com/serlaoravainen/tuukka-chat-exports/main/code-index.json";
const ACTIONS_TOKEN = Deno.env.get("ACTIONS_TOKEN") || ""; // aseta supabase secretsiin
const MAX_BYTES = parseInt(Deno.env.get("MAX_BYTES") || "100000", 10); // 100 kB

let allowlist: Set<string> | null = null;

async function loadAllowlist(): Promise<Set<string>> {
  if (allowlist) return allowlist;
  const r = await fetch(MANIFEST_URL, { cache: "no-store" });
  if (!r.ok) throw new Error(`manifest fetch failed: ${r.status}`);
  const m = (await r.json()) as Manifest;
  allowlist = new Set(m.files.filter(f => !f.binary && f.size > 0).map(f => f.path));
  return allowlist!;
}

function corsHeaders(origin: string | null) {
  const allowed = origin && PROJECT_ORIGINS.includes(origin) ? origin : PROJECT_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

function unauthorized(origin: string | null, code = 401, msg = "unauthorized") {
  return new Response(msg, { status: code, headers: corsHeaders(origin) });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origin = req.headers.get("Origin");

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders(origin) });
  }

  // Auth (Bearer)
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return unauthorized(origin, 401, "unauthorized");
  const token = auth.slice("Bearer ".length).trim();
  if (!ACTIONS_TOKEN || token !== ACTIONS_TOKEN) return unauthorized(origin, 403, "forbidden");

  // Route: GET /soili-code/code/get?path=...
  if (req.method === "GET" && url.pathname === "/soili-code/code/get") {
    const p = url.searchParams.get("path") || "";
    if (!p) return new Response("missing path", { status: 400, headers: corsHeaders(origin) });

    // allowlist check from manifest
    try {
      const list = await loadAllowlist();
      if (!list.has(p)) {
        return new Response("path not allowed", { status: 403, headers: corsHeaders(origin) });
      }
    } catch (e) {
      return new Response(`manifest error: ${(e as Error).message}`, { status: 502, headers: corsHeaders(origin) });
    }

    const target = RAW_BASE + p;
    const r = await fetch(target);
    if (!r.ok) return new Response(`fetch failed: ${r.status}`, { status: 502, headers: corsHeaders(origin) });

    const buf = new Uint8Array(await r.arrayBuffer());
    const cut = buf.slice(0, Math.min(buf.length, MAX_BYTES));
    return new Response(cut, {
      status: 200,
      headers: { ...corsHeaders(origin), "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Not found
  return new Response("not found", { status: 404, headers: corsHeaders(origin) });
});
