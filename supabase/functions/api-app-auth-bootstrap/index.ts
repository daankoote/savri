// supabase/functions/api-app-auth-bootstrap/index.ts
//
// Auth bootstrap v2 for the new /app customer dashboard boundary.
// Frontend may assist; backend decides.
//
// This endpoint binds a verified Supabase Auth user to an existing active
// app_customer_identity created by api-app-signup-submit. It does not create
// customers, identities, dossiers, sessions, or legacy dossier auth state.

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
  requireVerifiedSupabaseAuthUser,
} from "../_shared/app_customer_auth.ts";

type BootstrapRpcResponse = {
  ok?: unknown;
  status?: unknown;
  code?: unknown;
  error?: unknown;
  mode?: unknown;
  request_id?: unknown;
  customer_id?: unknown;
  identity_id?: unknown;
  identity_status?: unknown;
  binding_status?: unknown;
  dossiers?: unknown;
  payload_hash?: unknown;
  replayed?: unknown;
};

const MODE = "auth_bootstrap_v2";
const IDEMPOTENCY_SCOPE_PREFIX = "api-app-auth-bootstrap:v2";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const ACCOUNT_TYPES = new Set(["particulier", "zakelijk", "vve"]);

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

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

async function parseEmptyJsonBody(
  req: Request,
): Promise<
  { ok: true; body: Record<string, unknown> } | {
    ok: false;
    code: "invalid_json";
  }
> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false, code: "invalid_json" };
    return { ok: true, body };
  } catch (_e) {
    return { ok: false, code: "invalid_json" };
  }
}

function dossierSummaryIsValid(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 1) return false;
  return value.every((item) => {
    if (!isRecord(item)) return false;
    const dossierId = getString(item.dossier_id);
    const caseReference = getString(item.case_reference);
    return isUuid(dossierId) &&
      getString(item.dossier_number).length > 0 &&
      ACCOUNT_TYPES.has(getString(item.account_type)) &&
      getString(item.status).length > 0 &&
      isUuid(item.case_id) &&
      caseReference === `CASE-${dossierId}`;
  });
}

function validateSuccessBody(body: BootstrapRpcResponse): body is {
  ok: true;
  mode: "auth_bootstrap_v2";
  request_id: string;
  customer_id: string;
  identity_id: string;
  identity_status: "active";
  binding_status: "bound";
  dossiers: unknown[];
  payload_hash: string;
  replayed: boolean;
} {
  return body.ok === true &&
    body.mode === MODE &&
    getString(body.request_id).length > 0 &&
    isUuid(body.customer_id) &&
    isUuid(body.identity_id) &&
    body.identity_status === "active" &&
    body.binding_status === "bound" &&
    dossierSummaryIsValid(body.dossiers) &&
    isSha256(body.payload_hash) &&
    typeof body.replayed === "boolean";
}

function statusFromRpcBody(body: BootstrapRpcResponse): number {
  const status = Number(body.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  return 500;
}

function safeCodeFromRpcBody(body: BootstrapRpcResponse): string {
  const code = getString(body.code);
  return code || "service_unavailable";
}

function safeMessageFromRpcBody(body: BootstrapRpcResponse): string {
  const message = getString(body.error);
  return message || "Inloggen is tijdelijk niet beschikbaar.";
}

async function existingIdempotencyPayloadHash(
  SB: any,
  scope: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await SB
    .from("app_idempotency_keys")
    .select("payload_hash")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (error || !data?.payload_hash) return null;
  return getString(data.payload_hash);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(
      req,
      405,
      "Methode niet toegestaan.",
      "method_not_allowed",
    );
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(
      req,
      400,
      "Idempotency-Key ontbreekt.",
      "missing_idempotency_key",
    );
  }

  const parsed = await parseEmptyJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      parsed.code,
    );
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(
      req,
      503,
      "Inloggen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  const verifiedAuth = await requireVerifiedSupabaseAuthUser(req, SB);
  if (!verifiedAuth.ok) {
    return appErrorResponse(
      req,
      verifiedAuth.status,
      verifiedAuth.message,
      verifiedAuth.code,
    );
  }

  const idempotencyScope =
    `${IDEMPOTENCY_SCOPE_PREFIX}:auth_user:${verifiedAuth.context.authUserId}`;
  const actorRef = `supabase_auth_user:${verifiedAuth.context.authUserId}`;
  const normalizedPayloadHash = await payloadHash(parsed.body);

  if (Object.keys(parsed.body).length > 0) {
    const existingHash = await existingIdempotencyPayloadHash(
      SB,
      idempotencyScope,
      meta.idempotency_key,
    );
    if (existingHash && existingHash !== normalizedPayloadHash) {
      return appErrorResponse(
        req,
        409,
        "Aanvraag is al gebruikt met andere inhoud.",
        "idempotency_conflict",
      );
    }
    return appErrorResponse(
      req,
      400,
      "Controleer de aanvraag.",
      "invalid_body",
    );
  }

  const { data, error } = await SB.rpc("app_bootstrap_customer_auth_v2", {
    p_auth_user_id: verifiedAuth.context.authUserId,
    p_email_normalized: verifiedAuth.context.emailNormalized,
    p_actor_ref: actorRef,
    p_request_id: meta.request_id,
    p_idempotency_scope: idempotencyScope,
    p_idempotency_key: meta.idempotency_key,
    p_payload_hash: normalizedPayloadHash,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });

  if (error || !isRecord(data)) {
    return appErrorResponse(
      req,
      503,
      "Inloggen is tijdelijk niet beschikbaar.",
      "service_unavailable",
    );
  }

  const body = data as BootstrapRpcResponse;
  if (body.ok !== true) {
    return appErrorResponse(
      req,
      statusFromRpcBody(body),
      safeMessageFromRpcBody(body),
      safeCodeFromRpcBody(body),
    );
  }

  if (!validateSuccessBody(body)) {
    return appErrorResponse(
      req,
      503,
      "Inloggen is tijdelijk niet beschikbaar.",
      "invalid_bootstrap_response",
    );
  }

  return appJsonResponse(req, 200, body);
});
