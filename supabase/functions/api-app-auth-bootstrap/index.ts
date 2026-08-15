// supabase/functions/api-app-auth-bootstrap/index.ts
//
// Stable browser Auth bootstrap adapter for the /app customer dashboard.
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

type BrowserDossierSummary = {
  dossier_id: string;
  dossier_number: string | null;
  account_type: "particulier" | "zakelijk" | "vve";
  status: string;
  case_id: string;
  case_reference: string;
};

type BrowserBootstrapResponse = {
  ok: true;
  mode: "auth_bootstrap_browser";
  schema_version: "auth_bootstrap_browser_v2";
  authenticated: true;
  binding_status: "bound" | "unbound_no_cases";
  dossiers: BrowserDossierSummary[];
};

type BrowserBlockedResponse = {
  ok: false;
  mode: "auth_bootstrap_browser";
  schema_version: "auth_bootstrap_browser_v2";
  authenticated: true;
  binding_status: "blocked";
  dossiers: [];
  code:
    | "customer_identity_already_bound"
    | "customer_identity_binding_ambiguous"
    | "customer_inactive";
};

const MODE = "auth_bootstrap_browser";
const SCHEMA_VERSION = "auth_bootstrap_browser_v2";
const IDEMPOTENCY_SCOPE_PREFIX = "api-app-auth-bootstrap:v3";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
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

function normalizeDossierSummaries(
  value: unknown,
  allowEmpty = false,
): BrowserDossierSummary[] | null {
  if (!Array.isArray(value) || (!allowEmpty && value.length < 1)) return null;
  const dossiers = value.map((item): BrowserDossierSummary | null => {
    if (!isRecord(item)) return null;
    const dossierId = getString(item.dossier_id);
    const caseId = getString(item.case_id);
    const caseReference = getString(item.case_reference);
    const accountType = getString(item.account_type);
    const status = getString(item.status);
    if (
      !isUuid(dossierId) || !isUuid(caseId) ||
      !ACCOUNT_TYPES.has(accountType) || !status ||
      !CASE_REFERENCE_RE.test(caseReference) ||
      (dossierId === getString(item.case_id) ||
          caseReference === `CASE-${dossierId}`) !== true
    ) return null;
    return {
      dossier_id: dossierId,
      dossier_number: getString(item.dossier_number) || null,
      account_type: accountType as BrowserDossierSummary["account_type"],
      status,
      case_id: caseId,
      case_reference: caseReference,
    };
  });
  if (dossiers.some((item) => item === null)) return null;
  return dossiers as BrowserDossierSummary[];
}

function adaptSuccessBody(
  body: BootstrapRpcResponse,
): BrowserBootstrapResponse | null {
  const dossiers = normalizeDossierSummaries(body.dossiers);
  if (
    body.ok !== true ||
    getString(body.request_id).length === 0 ||
    !isUuid(body.customer_id) || !isUuid(body.identity_id) ||
    body.identity_status !== "active" || body.binding_status !== "bound" ||
    !isSha256(body.payload_hash) || typeof body.replayed !== "boolean" ||
    dossiers === null
  ) return null;

  return {
    ok: true,
    mode: MODE,
    schema_version: SCHEMA_VERSION,
    authenticated: true,
    binding_status: "bound",
    dossiers: dossiers as BrowserDossierSummary[],
  };
}

function adaptUnboundBody(
  body: BootstrapRpcResponse,
): BrowserBootstrapResponse | null {
  const code = getString(body.code);
  if (
    body.ok !== false ||
    (code !== "customer_identity_not_found" &&
      code !== "customer_dossier_not_found")
  ) return null;

  return {
    ok: true,
    mode: MODE,
    schema_version: SCHEMA_VERSION,
    authenticated: true,
    binding_status: "unbound_no_cases",
    dossiers: [],
  };
}

function adaptBlockedBody(
  body: BootstrapRpcResponse,
): BrowserBlockedResponse | null {
  const code = getString(body.code);
  if (
    body.ok !== false ||
    ![
      "customer_identity_already_bound",
      "customer_identity_binding_ambiguous",
      "customer_inactive",
    ].includes(code)
  ) return null;

  return {
    ok: false,
    mode: MODE,
    schema_version: SCHEMA_VERSION,
    authenticated: true,
    binding_status: "blocked",
    dossiers: [],
    code: code as BrowserBlockedResponse["code"],
  };
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

  const { data, error } = await SB.rpc("app_bootstrap_customer_auth_v6", {
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
    const unboundBody = adaptUnboundBody(body);
    if (unboundBody) return appJsonResponse(req, 200, unboundBody);

    const blockedBody = adaptBlockedBody(body);
    if (blockedBody) {
      return appJsonResponse(req, statusFromRpcBody(body), blockedBody);
    }

    return appErrorResponse(
      req,
      statusFromRpcBody(body),
      safeMessageFromRpcBody(body),
      safeCodeFromRpcBody(body),
    );
  }

  const browserBody = adaptSuccessBody(body);
  if (!browserBody) {
    return appErrorResponse(
      req,
      503,
      "Inloggen is tijdelijk niet beschikbaar.",
      "invalid_bootstrap_response",
    );
  }

  return appJsonResponse(req, 200, browserBody);
});
