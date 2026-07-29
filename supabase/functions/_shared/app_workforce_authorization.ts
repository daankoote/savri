// Shared transport adapter for the four bounded WP3N workforce location
// callers. It verifies transport identity and invokes one compile-time mapped
// bridge RPC. Database functions remain the sole authorization authority.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "./app_foundation.ts";
import { requireVerifiedSupabaseAuthUser } from "./app_customer_auth.ts";

export type JsonObject = Record<string, unknown>;

export type NormalizeResult =
  | { ok: true; payload: JsonObject }
  | { ok: false; code: "invalid_input" };

export type WorkforceCallerConfig = {
  caller: string;
  actions: Readonly<Record<string, string>>;
  normalize: (action: string, body: JsonObject) => NormalizeResult;
  operationPayload?: (
    action: string,
    payload: JsonObject,
  ) => JsonObject | null;
};

type RpcResult = {
  data?: unknown;
  error?: unknown;
};

type ServiceClient = {
  auth: {
    getUser: (token: string) => Promise<{
      data?: {
        user?: {
          id?: string;
          email?: string | null;
          email_confirmed_at?: string | null;
          confirmed_at?: string | null;
        } | null;
      } | null;
      error?: unknown;
    }>;
  };
  from: (table: string) => unknown;
  rpc: (name: string, args: JsonObject) => Promise<RpcResult>;
};

export type WorkforceHandlerDependencies = {
  createServiceClient: () => ServiceClient | null;
  idempotencyExpiresAt: () => string | null;
  requestMeta: typeof getAppRequestMeta;
  hashPayload: typeof payloadHash;
  verifyBearer: typeof requireVerifiedSupabaseAuthUser;
};

const SAFE_CODES = new Set([
  "authentication_required",
  "workforce_identity_missing",
  "workforce_identity_inactive",
  "role_not_authorized",
  "capability_not_authorized",
  "case_scope_denied",
  "location_scope_denied",
  "case_location_relation_missing",
  "operation_request_missing",
  "operation_request_not_pending",
  "operation_review_missing",
  "operation_not_approved",
  "four_eyes_required",
  "self_approval_forbidden",
  "payload_hash_mismatch",
  "authorization_changed",
  "idempotency_conflict",
  "concurrent_write_conflict",
  "operation_already_executed",
  "invalid_input",
  "location_business_rejected",
  "internal_error",
  "ok",
]);

function isRecord(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeStatus(value: unknown, fallback = 500): number {
  const status = Number(value);
  return Number.isInteger(status) && status >= 200 && status <= 599
    ? status
    : fallback;
}

function defaultServiceClient(): ServiceClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  }) as unknown as ServiceClient;
}

function configuredExpiry(): string | null {
  const seconds = Number(
    Deno.env.get("APP_OPS_LOCATION_IDEMPOTENCY_TTL_SECONDS"),
  );
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 2_592_000) {
    return null;
  }
  return new Date(Date.now() + seconds * 1000).toISOString();
}

const DEFAULT_DEPENDENCIES: WorkforceHandlerDependencies = {
  createServiceClient: defaultServiceClient,
  idempotencyExpiresAt: configuredExpiry,
  requestMeta: getAppRequestMeta,
  hashPayload: payloadHash,
  verifyBearer: requireVerifiedSupabaseAuthUser,
};

async function parseBody(req: Request): Promise<JsonObject | null> {
  try {
    const body = await req.json();
    return isRecord(body) ? body : null;
  } catch (_error) {
    return null;
  }
}

function safeErrorStatus(code: string, proposed: unknown): number {
  if (code === "authentication_required") return 401;
  if (
    code === "workforce_identity_missing" ||
    code === "workforce_identity_inactive" ||
    code === "role_not_authorized" ||
    code === "capability_not_authorized" ||
    code === "case_scope_denied" ||
    code === "location_scope_denied" ||
    code === "case_location_relation_missing" ||
    code === "authorization_changed" ||
    code === "four_eyes_required"
  ) return 403;
  if (code === "operation_request_missing") return 404;
  if (code === "invalid_input") return 400;
  if (code === "internal_error") return 500;
  if (code === "location_business_rejected") return 422;
  return safeStatus(proposed, 409);
}

function safeErrorMessage(code: string): string {
  if (code === "authentication_required") return "Authenticatie vereist.";
  if (code === "invalid_input") return "Controleer de aanvraag.";
  if (code === "internal_error") {
    return "De locatiebewerking is tijdelijk niet beschikbaar.";
  }
  if (code === "location_business_rejected") {
    return "De locatiebewerking kon niet worden uitgevoerd.";
  }
  return "De locatiebewerking is niet toegestaan.";
}

export function createWorkforceLocationHandler(
  config: WorkforceCallerConfig,
  overrides: Partial<WorkforceHandlerDependencies> = {},
): (req: Request) => Promise<Response> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...overrides };
  const allowedActions = Object.freeze({ ...config.actions });

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return appOptionsResponse(req);
    if (req.method !== "POST") {
      return appErrorResponse(
        req,
        405,
        "Methode niet toegestaan.",
        "invalid_input",
      );
    }

    const meta = await deps.requestMeta(req);
    if (
      !meta.idempotency_key ||
      meta.idempotency_key.length > 200 ||
      /\s/.test(meta.idempotency_key) ||
      meta.request_id.length > 96
    ) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_input",
      );
    }

    const body = await parseBody(req);
    const action = typeof body?.action === "string" ? body.action.trim() : "";
    const rpcName = allowedActions[action];
    if (!body || !rpcName) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        "invalid_input",
      );
    }

    const normalized = config.normalize(action, body);
    if (!normalized.ok) {
      return appErrorResponse(
        req,
        400,
        "Controleer de aanvraag.",
        normalized.code,
      );
    }

    const serviceClient = deps.createServiceClient();
    const expiresAt = deps.idempotencyExpiresAt();
    if (!serviceClient || !expiresAt) {
      return appErrorResponse(
        req,
        503,
        "De locatiebewerking is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    const verified = await deps.verifyBearer(req, serviceClient);
    if (!verified.ok) {
      return appErrorResponse(
        req,
        401,
        "Authenticatie vereist.",
        "authentication_required",
      );
    }

    const operationPayload = config.operationPayload?.(
      action,
      normalized.payload,
    ) ?? null;
    const bridgePayload: JsonObject = { ...normalized.payload };
    if (operationPayload) {
      bridgePayload.operation_payload_hash = await deps.hashPayload(
        operationPayload,
      );
    }

    const canonicalHash = await deps.hashPayload({
      contract_version: "wp3n_location_caller_v1",
      caller: config.caller,
      action,
      auth_user_id: verified.context.authUserId,
      payload: bridgePayload,
    });

    const { data, error } = await serviceClient.rpc(rpcName, {
      p_auth_user_id: verified.context.authUserId,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_payload_hash: canonicalHash,
      p_idempotency_expires_at: expiresAt,
      p_payload: bridgePayload,
    });

    if (error || !isRecord(data)) {
      return appErrorResponse(
        req,
        500,
        "De locatiebewerking is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    const code = typeof data.code === "string" && SAFE_CODES.has(data.code)
      ? data.code
      : "internal_error";
    if (data.ok !== true) {
      return appErrorResponse(
        req,
        safeErrorStatus(code, data.status),
        safeErrorMessage(code),
        code,
      );
    }
    if (code !== "ok") {
      return appErrorResponse(
        req,
        500,
        "De locatiebewerking is tijdelijk niet beschikbaar.",
        "internal_error",
      );
    }

    return appJsonResponse(req, safeStatus(data.status, 200), data);
  };
}

export function boundedObject(
  body: JsonObject,
  keys: readonly string[],
): JsonObject | null {
  if (
    Object.keys(body).some((key) => key !== "action" && !keys.includes(key))
  ) return null;
  const payload: JsonObject = {};
  for (const key of keys) payload[key] = body[key] ?? null;
  return payload;
}

export function boundedString(
  value: unknown,
  maxLength: number,
  nullable = false,
): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

export function boundedUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(normalized)
    ? normalized
    : null;
}

export function boundedSha256(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value)
    ? value
    : null;
}

export function boundedTimestamp(
  value: unknown,
  nullable = false,
): string | null {
  if (value === null && nullable) return null;
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
