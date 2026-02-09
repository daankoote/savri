// supabase/functions/api-dossier-addres-preview

import { serve } from "jsr:@std/http@0.224.0/server";

// -------------------- CORS --------------------
function parseAllowedOrigins(): string[] {
  const raw =
    Deno.env.get("ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_ORIGIN") ??
    "https://www.enval.nl,https://enval.nl";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}
const ALLOWED_ORIGINS = parseAllowedOrigins();

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || req.headers.get("Origin") || "";
  const allowOrigin = ALLOWED_ORIGINS.includes(origin)
    ? origin
    : (ALLOWED_ORIGINS[0] || "https://www.enval.nl");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key, x-request-id, X-Request-Id",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeadersFor(req) },
  });
}
function ok(req: Request, data: Record<string, unknown> = {}) {
  return json(req, 200, { ok: true, ...data });
}
function bad(req: Request, msg: string, code = 400) {
  return json(req, code, { ok: false, error: msg });
}

function normalizePostcode(pc: string) {
  return (pc || "").toUpperCase().replace(/\s+/g, "").trim();
}
function toPDOKQuery(postcode: string, houseNumber: string, suffix?: string | null) {
  const pc = normalizePostcode(postcode);
  const hn = String(houseNumber || "").trim();
  const suf = String(suffix || "").trim();
  return [pc, hn, suf].filter(Boolean).join(" ").trim();
}

type PdokDoc = {
  id?: string;
  weergavenaam?: string;
  straatnaam?: string;
  woonplaatsnaam?: string;
  type?: string;
  score?: number;
};

async function pdokLookup(postcode: string, houseNumber: string, suffix?: string | null) {
  const q = toPDOKQuery(postcode, houseNumber, suffix);
  const url =
    "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free" +
    `?q=${encodeURIComponent(q)}` +
    "&rows=10";

  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`PDOK HTTP ${res.status} ${t}`.slice(0, 240));
  }

  const j = await res.json().catch(() => ({}));
  const docs: PdokDoc[] = j?.response?.docs || [];

  const adresDocs = docs.filter((d) => String(d.type || "").toLowerCase() === "adres");
  const pool = adresDocs.length ? adresDocs : docs;

  const best = pool
    .slice()
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];

  if (!best) return null;

  const straat = (best.straatnaam || "").trim();
  const plaats = (best.woonplaatsnaam || "").trim();
  const weergave = (best.weergavenaam || "").trim();

  let straat2 = straat;
  let plaats2 = plaats;

  if ((!straat2 || !plaats2) && weergave) {
    const parts = weergave.split(",").map((x: string) => x.trim()).filter(Boolean);
    if (!straat2 && parts[0]) straat2 = parts[0].replace(/\s+\d.*$/, "").trim();
    if (!plaats2 && parts[1]) {
      const w = parts[1].split(/\s+/).filter(Boolean);
      plaats2 = w.length ? w[w.length - 1] : "";
    }
  }

  if (!straat2 || !plaats2) return null;
  return { street: straat2, city: plaats2 };
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") return bad(req, "Method not allowed", 405);

    const body = await req.json().catch(() => ({} as any));

    // accepteer meerdere key-varianten (UI mismatch killers)
    const postcode = body?.postcode;
    const house_number =
      body?.house_number ?? body?.houseNumber ?? body?.housenumber ?? body?.number;
    const suffix = body?.suffix ?? body?.addition ?? body?.house_suffix ?? null;

    const pc = normalizePostcode(String(postcode || ""));
    const hn = String(house_number || "").trim();
    const suf = String(suffix || "").trim() || null;

    if (!/^[0-9]{4}[A-Z]{2}$/.test(pc)) return bad(req, "Ongeldige postcode.", 400);
    if (!/^[1-9][0-9]{0,4}$/.test(hn)) return bad(req, "Ongeldig huisnummer.", 400);

    const found = await pdokLookup(pc, hn, suf);
    if (!found) return bad(req, "Adres niet gevonden.", 404);

    return ok(req, { street: found.street, city: found.city });
  } catch (e) {
    console.error("api-dossier-address-preview fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});
