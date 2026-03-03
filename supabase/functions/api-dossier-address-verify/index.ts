//supabase/functions/api-dossier-address-verify/index.ts

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { getReqMeta } from "../_shared/reqmeta.ts";
import { insertAuditFailOpen } from "../_shared/audit.ts";

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

// -------------------- ENV / helpers --------------------
function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function actorRefForCustomer(dossierId: string, tokenHash: string) {
  return `dossier:${dossierId}|token:${tokenHash.slice(0, 16)}`;
}

function normalizePostcode(pc: string) {
  return (pc || "").toUpperCase().replace(/\s+/g, "").trim();
}
function isValidPostcode(pc: string) {
  return /^[0-9]{4}[A-Z]{2}$/.test(normalizePostcode(pc));
}
function isValidHouseNumber(v: string) {
  return /^[1-9][0-9]{0,4}$/.test((v || "").trim());
}
function normalizeSuffix(v: string) {
  const t = (v || "").trim();
  if (!t) return null;
  return t.slice(0, 12);
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

  const best = pool.slice().sort((a, b) => Number(b.score || 0) - Number(a.score || 0))[0];
  if (!best) return null;

  const straat = (best.straatnaam || "").trim();
  const plaats = (best.woonplaatsnaam || "").trim();
  const id = (best.id || "").trim();
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

  return { street: straat2, city: plaats2, bag_id: id || null };
}

serve(async (req) => {
  const meta = getReqMeta(req);

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") return bad(req, "Method not allowed", 405);

    const body = await req.json().catch(() => ({} as any));

    const dossier_id = body?.dossier_id ? String(body.dossier_id) : null;
    const token = body?.token ? String(body.token) : null;

    // accepteer meerdere key-varianten (UI mismatch killers)
    const postcode = body?.postcode;
    const house_number =
      body?.house_number ?? body?.houseNumber ?? body?.housenumber ?? body?.number;
    const suffix = body?.suffix ?? body?.addition ?? body?.house_suffix ?? null;

    if (!dossier_id || !token) return bad(req, "Missing dossier_id/token", 400);

    const pc = normalizePostcode(String(postcode || ""));
    const hn = String(house_number || "").trim();
    const suf = normalizeSuffix(String(suffix || ""));

    if (!pc || !isValidPostcode(pc)) return bad(req, "Postcode is ongeldig (format: 1234AB).");
    if (!hn || !isValidHouseNumber(hn)) return bad(req, "Huisnummer is ongeldig.");

    const SB = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });

    const tokenHash = await sha256Hex(token);
    const actor_ref = actorRefForCustomer(dossier_id, tokenHash);

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id")
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (dErr) return bad(req, dErr.message, 500);
    if (!dossier) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "address_verify_rejected",
          event_data: { stage: "auth", status: 401, message: "Unauthorized" },
        },
        meta,
        { actor_ref: `dossier:${dossier_id}|token:invalid` },
      );
      return bad(req, "Unauthorized", 401);
    }

    let found: any;
    try {
      found = await pdokLookup(pc, hn, suf);
    } catch (e) {
      console.error("PDOK lookup error:", e);
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "system",
          event_type: "address_verify_failed",
          event_data: { stage: "pdok_lookup", status: 502, message: "PDOK failed" },
        },
        meta,
        { actor_ref },
      );
      return bad(req, "Adresvalidatie service faalt (PDOK). Probeer later opnieuw.", 502);
    }

    if (!found) {
      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "address_verify_not_found",
          event_data: {
            status: 404,
            input: { postcode: pc, house_number: hn, suffix: suf },
          },
        },
        meta,
        { actor_ref },
      );
      return bad(req, "Adres niet gevonden. Controleer postcode/huisnummer/toevoeging.", 404);
    }

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "address_verify_ok",
        event_data: {
          input: { postcode: pc, house_number: hn, suffix: suf },
          resolved: { street: found.street, city: found.city, bag_id: found.bag_id },
          source: "pdok_locatieserver_v3_1_free",
        },
      },
      meta,
      { actor_ref },
    );

    return ok(req, {
      preview: true,
      street: found.street,
      city: found.city,
      bag_id: found.bag_id,
      normalized: { postcode: pc, house_number: hn, suffix: suf },
    });
  } catch (e) {
    console.error("api-dossier-address-verify fatal:", e);
    return json(req, 500, { ok: false, error: "Internal error" });
  }
});
