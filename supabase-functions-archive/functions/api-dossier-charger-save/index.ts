import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
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
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key",
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

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function nowIso() {
  return new Date().toISOString();
}
function normStr(v: unknown, max = 200) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

serve(async (req) => {
  console.log("[REQ]", {
    fn: "api-dossier-charger-save",
    method: req.method,
    path: new URL(req.url).pathname,
    request_id: req.headers.get("Idempotency-Key") || req.headers.get("idempotency-key") || null,
  });

  const meta = getReqMeta(req);

  // Shared response helper that also writes an audit event (fail-open).
  async function auditAndReturn(opts: {
    SB?: any;
    dossier_id?: string | null;
    actor_type?: string;
    actor_ref?: string | null;
    event_type: string;
    event_data?: Record<string, unknown>;
    http_status: number;
    response_body: any;
  }) {
    const dossier_id = opts.dossier_id ?? null;
    if (opts.SB && dossier_id) {
      try {
        await insertAuditFailOpen(
          opts.SB,
          {
            dossier_id,
            actor_type: opts.actor_type || "customer",
            event_type: opts.event_type,
            event_data: opts.event_data || {},
          },
          meta,
          { actor_ref: opts.actor_ref || null },
        );
      } catch (_e) {
        // fail-open
      }
    }
    return json(req, opts.http_status, opts.response_body);
  }

  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
    if (req.method !== "POST") {
      return bad(req, "Method not allowed", 405);
    }

    const {
      dossier_id,
      token,
      charger_id,
      serial_number,
      brand,
      model,
      power_kw,
      notes,
    } = await req.json().catch(() => ({}));

    // We cannot write audit if dossier_id is missing (table requires NOT NULL),
    // so for this one we just return.
    if (!dossier_id || !token) return bad(req, "Missing dossier_id/token", 400);

    const SB = createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false } },
    );

    const tokenHash = await sha256Hex(String(token));
    const actor_ref = tokenHash.slice(0, 12);

    const serial = normStr(serial_number, 80);
    const b = normStr(brand, 80);
    const m = normStr(model, 120);
    const n = normStr(notes, 240) || null;

    if (!serial) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "serial_required", charger_id: charger_id ?? null },
        http_status: 400,
        response_body: { ok: false, error: "Serienummer verplicht." },
      });
    }
    if (!b) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "brand_required", charger_id: charger_id ?? null },
        http_status: 400,
        response_body: { ok: false, error: "Merk verplicht." },
      });
    }
    if (!m) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "model_required", charger_id: charger_id ?? null },
        http_status: 400,
        response_body: { ok: false, error: "Model verplicht." },
      });
    }

    const kw =
      power_kw === null || power_kw === undefined || String(power_kw).trim() === ""
        ? null
        : Number(String(power_kw).replace(",", "."));

    if (kw !== null && (!Number.isFinite(kw) || kw < 0 || kw > 1000)) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "power_kw_invalid", power_kw: String(power_kw ?? "") },
        http_status: 400,
        response_body: { ok: false, error: "Vermogen (kW) is ongeldig." },
      });
    }

    const { data: dossier, error: dErr } = await SB
      .from("dossiers")
      .select("id, locked_at, status, charger_count")
      .eq("id", dossier_id)
      .eq("access_token_hash", tokenHash)
      .maybeSingle();

    if (dErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_failed",
        event_data: { reason: "dossier_lookup_failed", error: dErr.message },
        http_status: 500,
        response_body: { ok: false, error: dErr.message },
      });
    }
    if (!dossier) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "unauthorized" },
        http_status: 401,
        response_body: { ok: false, error: "Unauthorized" },
      });
    }

    const st = String(dossier.status || "");
    if (dossier.locked_at || st === "in_review" || st === "ready_for_booking") {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "dossier_locked", status: st },
        http_status: 409,
        response_body: { ok: false, error: "Dossier is definitief ingediend en kan niet meer gewijzigd worden." },
      });
    }

    const required = Number(dossier.charger_count || 0) || 0;
    if (required <= 0) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "charger_count_missing" },
        http_status: 409,
        response_body: { ok: false, error: "Kies eerst het aantal laadpunten in stap 1." },
      });
    }

    const { data: existingChargers, error: cErr } = await SB
      .from("dossier_chargers")
      .select("id, serial_number")
      .eq("dossier_id", dossier_id);

    if (cErr) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_failed",
        event_data: { reason: "chargers_read_failed", error: cErr.message },
        http_status: 500,
        response_body: { ok: false, error: `Chargers read failed: ${cErr.message}` },
      });
    }

    const have = (existingChargers || []).length;
    const isUpdate = !!charger_id;

    if (!isUpdate && have >= required) {
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_rejected",
        event_data: { reason: "max_chargers_reached", required, have },
        http_status: 409,
        response_body: {
          ok: false,
          error: `Maximaal aantal laadpalen bereikt (${required}). Verwijder (of voeg) eerst een laadpaal (toe).`,
        },
      });
    }

    if (!isUpdate) {
      const inSameDossier = (existingChargers || []).some((x: any) =>
        String(x.serial_number || "") === serial
      );
      if (inSameDossier) {
        return auditAndReturn({
          SB,
          dossier_id,
          actor_ref,
          event_type: "charger_save_rejected",
          event_data: { reason: "duplicate_serial_same_dossier", serial_number: serial },
          http_status: 409,
          response_body: { ok: false, error: "Deze laadpaal (serienummer) is al toegevoegd in dit dossier." },
        });
      }

      const { data: anyCharger, error: sErr } = await SB
        .from("dossier_chargers")
        .select("id, dossier_id")
        .eq("serial_number", serial)
        .limit(1)
        .maybeSingle();

      if (sErr) {
        return auditAndReturn({
          SB,
          dossier_id,
          actor_ref,
          event_type: "charger_save_failed",
          event_data: { reason: "serial_check_failed", error: sErr.message },
          http_status: 500,
          response_body: { ok: false, error: `Serial check failed: ${sErr.message}` },
        });
      }

      if (anyCharger && String(anyCharger.dossier_id) !== String(dossier_id)) {
        return auditAndReturn({
          SB,
          dossier_id,
          actor_ref,
          event_type: "charger_save_rejected",
          event_data: { reason: "duplicate_serial_other_dossier", serial_number: serial },
          http_status: 409,
          response_body: {
            ok: false,
            error: "Dit serienummer is al gebruikt in een ander dossier. Controleer het serienummer.",
          },
        });
      }
    }

    const ts = nowIso();

    async function invalidateIfNeeded(): Promise<boolean> {
      if (String(dossier.status || "") !== "ready_for_review") return false;

      const { error: sErr } = await SB
        .from("dossiers")
        .update({ status: "incomplete", updated_at: ts })
        .eq("id", dossier_id)
        .eq("status", "ready_for_review")
        .is("locked_at", null);

      if (sErr) throw new Error(`Status invalidation failed: ${sErr.message}`);
      return true;
    }

    if (isUpdate) {
      const { error: upErr } = await SB
        .from("dossier_chargers")
        .update({
          serial_number: serial,
          brand: b,
          model: m,
          power_kw: kw,
          notes: n,
          updated_at: ts,
        })
        .eq("id", charger_id)
        .eq("dossier_id", dossier_id);

      if (upErr) {
        const pgCode = (upErr as any)?.code || "";
        if (pgCode === "23505") {
          return auditAndReturn({
            SB,
            dossier_id,
            actor_ref,
            event_type: "charger_save_rejected",
            event_data: { reason: "unique_violation", code: "23505", charger_id },
            http_status: 409,
            response_body: { ok: false, error: "Dit serienummer is al gebruikt. Controleer het serienummer." },
          });
        }
        return auditAndReturn({
          SB,
          dossier_id,
          actor_ref,
          event_type: "charger_save_failed",
          event_data: { reason: "update_failed", error: upErr.message, charger_id },
          http_status: 500,
          response_body: { ok: false, error: `Update failed: ${upErr.message}` },
        });
      }

      const invalidated = await invalidateIfNeeded();

      await insertAuditFailOpen(
        SB,
        {
          dossier_id,
          actor_type: "customer",
          event_type: "charger_updated",
          event_data: { charger_id, invalidated },
        },
        meta,
        { actor_ref },
      );

      return ok(req, { saved: true, charger_id, invalidated });
    }

    const { data: ins, error: insErr } = await SB
      .from("dossier_chargers")
      .insert([{
        dossier_id,
        serial_number: serial,
        brand: b,
        model: m,
        power_kw: kw,
        notes: n,
        created_at: ts,
        updated_at: ts,
      }])
      .select("id")
      .maybeSingle();

    if (insErr) {
      const pgCode = (insErr as any)?.code || "";
      if (pgCode === "23505") {
        return auditAndReturn({
          SB,
          dossier_id,
          actor_ref,
          event_type: "charger_save_rejected",
          event_data: { reason: "unique_violation", code: "23505", serial_number: serial },
          http_status: 409,
          response_body: { ok: false, error: "Dit serienummer is al gebruikt. Controleer het serienummer." },
        });
      }
      return auditAndReturn({
        SB,
        dossier_id,
        actor_ref,
        event_type: "charger_save_failed",
        event_data: { reason: "insert_failed", error: insErr.message },
        http_status: 500,
        response_body: { ok: false, error: `Insert failed: ${insErr.message}` },
      });
    }

    const invalidated = await invalidateIfNeeded();

    await insertAuditFailOpen(
      SB,
      {
        dossier_id,
        actor_type: "customer",
        event_type: "charger_added",
        event_data: { charger_id: ins?.id || null, invalidated },
      },
      meta,
      { actor_ref },
    );

    return ok(req, { saved: true, charger_id: ins?.id || null, invalidated });
  } catch (e: any) {
    console.error("api-dossier-charger-save fatal:", e);
    return json(req, 500, { ok: false, error: e?.message || "Internal error" });
  }
});
