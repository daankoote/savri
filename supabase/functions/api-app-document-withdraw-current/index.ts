// supabase/functions/api-app-document-withdraw-current/index.ts
//
// Customer current-document withdrawal endpoint for the new /app portal.
// Frontend may assist; backend decides.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  requireAppCustomer,
  requireAppDossierAccess,
  type AppCustomerAuthContext,
} from "../_shared/app_customer_auth.ts";

type WithdrawPayload = {
  dossier_id?: unknown;
  document_slot_id?: unknown;
};

type NormalizedWithdrawPayload = {
  dossier_id: string;
  document_slot_id: string;
};

type NormalizationError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

type IdempotencyResult =
  | { ok: true; replay: false }
  | { ok: true; replay: true; status: number; body: unknown }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; status: number; code: string; message: string };

const MODE = "document_withdraw_current_v1";
const IDEMPOTENCY_SCOPE_PREFIX = "api-app-document-withdraw-current:v1";
const IDEMPOTENCY_TTL_HOURS = 24;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: WithdrawPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as WithdrawPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function normalizePayload(body: WithdrawPayload): { ok: true; payload: NormalizedWithdrawPayload } | NormalizationError {
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("dossier_id") || !keys.includes("document_slot_id")) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Controleer de aanvraag.",
    };
  }

  const dossier_id = getString(body.dossier_id).toLowerCase();
  const document_slot_id = getString(body.document_slot_id).toLowerCase();
  if (!isUuid(dossier_id) || !isUuid(document_slot_id)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_uuid",
      message: "Controleer dossier en document.",
    };
  }

  return { ok: true, payload: { dossier_id, document_slot_id } };
}

function buildIdempotencyScope(authContext: AppCustomerAuthContext, _payload: NormalizedWithdrawPayload): string {
  return [
    IDEMPOTENCY_SCOPE_PREFIX,
    authContext.customerId,
    authContext.identityId,
  ].join(":");
}

async function reserveOrReplayIdempotency(
  SB: any,
  scope: string,
  key: string,
  payload_hash: string,
): Promise<IdempotencyResult> {
  const { data: existing, error: lookupError } = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      conflict: false,
      status: 500,
      code: "service_unavailable",
      message: "Document verwijderen is tijdelijk niet beschikbaar.",
    };
  }

  if (existing) {
    if (existing.payload_hash !== payload_hash) {
      return { ok: false, conflict: true };
    }

    if (existing.response_status && existing.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(existing.response_status),
        body: existing.response_body,
      };
    }

    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Document verwijderen wordt al verwerkt.",
    };
  }

  const { error: insertError } = await SB.from("app_idempotency_keys").insert([{
    scope,
    key,
    payload_hash,
    locked_at: nowIso(),
    expires_at: hoursFromNowIso(IDEMPOTENCY_TTL_HOURS),
  }]);

  if (!insertError) {
    return { ok: true, replay: false };
  }

  const retry = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (!retry.error && retry.data) {
    if (retry.data.payload_hash !== payload_hash) return { ok: false, conflict: true };
    if (retry.data.response_status && retry.data.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(retry.data.response_status),
        body: retry.data.response_body,
      };
    }
    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Document verwijderen wordt al verwerkt.",
    };
  }

  return {
    ok: false,
    conflict: false,
    status: 500,
    code: "service_unavailable",
    message: "Document verwijderen is tijdelijk niet beschikbaar.",
  };
}

function replayBody(body: unknown): unknown {
  if (!isRecord(body)) return body;
  if (body.ok === true || body.ok === false) return { ...body, replayed: true };
  return body;
}

function safeStatusFromRpcBody(body: unknown): number {
  if (!isRecord(body)) return 500;
  if (body.ok === true) return 200;
  const code = getString(body.code);
  if (code === "document_changes_locked" || code === "document_current_missing") return 409;
  return 500;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(req, 400, "Idempotency-Key ontbreekt.", "missing_idempotency_key");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const normalized = normalizePayload(parsed.body);
  if (!normalized.ok) {
    return appErrorResponse(req, normalized.status, normalized.message, normalized.code);
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(req, 503, "Document verwijderen is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const authResult = await requireAppCustomer(req, SB);
  if (!authResult.ok) {
    return appErrorResponse(req, authResult.status, authResult.message, authResult.code);
  }

  const payload = normalized.payload;
  const accessResult = await requireAppDossierAccess(SB, authResult.context, payload.dossier_id);
  if (!accessResult.ok) {
    return appErrorResponse(req, 404, "Document niet gevonden.", "document_not_found_or_forbidden");
  }

  const { data: slot, error: slotError } = await SB
    .from("app_dossier_document_slots")
    .select("id")
    .eq("id", payload.document_slot_id)
    .eq("dossier_id", payload.dossier_id)
    .maybeSingle();

  if (slotError || !slot?.id) {
    return appErrorResponse(req, 404, "Document niet gevonden.", "document_not_found_or_forbidden");
  }

  const serializedPayload = {
    dossier_id: payload.dossier_id,
    document_slot_id: payload.document_slot_id,
  };
  const payload_hash = await payloadHash(serializedPayload);
  const idempotency_scope = buildIdempotencyScope(authResult.context, payload);
  const idem = await reserveOrReplayIdempotency(
    SB,
    idempotency_scope,
    meta.idempotency_key,
    payload_hash,
  );

  if (!idem.ok && idem.conflict) {
    return appErrorResponse(req, 409, "Deze aanvraag wijkt af van de eerdere poging.", "idempotency_conflict");
  }

  if (!idem.ok) {
    return appErrorResponse(req, idem.status, idem.message, idem.code);
  }

  if (idem.replay) {
    return appJsonResponse(req, idem.status, replayBody(idem.body));
  }

  const { data, error } = await SB.rpc("app_withdraw_current_document_v1", {
    p_dossier_id: payload.dossier_id,
    p_document_slot_id: payload.document_slot_id,
    p_customer_id: authResult.context.customerId,
    p_identity_id: authResult.context.identityId,
    p_actor_ref: authResult.context.actorRef,
    p_request_id: meta.request_id,
    p_idempotency_scope: idempotency_scope,
    p_idempotency_key: meta.idempotency_key,
    p_payload_hash: payload_hash,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });

  if (error || !data) {
    return appErrorResponse(req, 503, "Document verwijderen is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  if (!isRecord(data) || getString(data.mode) !== MODE) {
    return appErrorResponse(req, 503, "Document verwijderen is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  return appJsonResponse(req, safeStatusFromRpcBody(data), data);
});
