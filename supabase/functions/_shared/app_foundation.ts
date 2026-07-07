// supabase/functions/_shared/app_foundation.ts
//
// Shared primitives for future api-app-* CORE endpoints.
// Frontend may assist; backend decides.
//
// This file intentionally creates no endpoint and performs no DB work at module
// load time. The app foundation migration may not be applied in a local DB yet.

export type AppActorType =
  | "anonymous"
  | "customer"
  | "system"
  | "support"
  | "admin"
  | "edge_function"
  | "worker"
  | "provider"
  | "unknown";

export type AppScopeType =
  | "intake"
  | "auth"
  | "customer"
  | "dossier"
  | "location"
  | "charger"
  | "document"
  | "request"
  | "support"
  | "consent"
  | "kwh"
  | "result"
  | "fee"
  | "retention";

export type AppRequestMeta = {
  request_id: string;
  idempotency_key: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  method: string;
  path: string;
  url: string;
  origin: string | null;
  timestamp: string;
  environment: string;
};

export type AppAuditEventInput = {
  event_type: string;
  scope_type: AppScopeType;
  scope_id?: string | null;
  customer_id?: string | null;
  dossier_id?: string | null;
  actor_type: AppActorType;
  actor_ref?: string | null;
  event_data?: Record<string, unknown>;
};

export type AppIntakeAuditEventInput = {
  event_type: string;
  actor_type?: AppActorType;
  actor_ref?: string | null;
  event_data?: Record<string, unknown>;
};

export type AppIdempotencyScope = string;
export type AppIdempotencyKey = string;

export type AppIdempotencyInput = {
  scope: AppIdempotencyScope;
  key: AppIdempotencyKey;
  payload_hash: string;
  expires_at: string;
};

export type AppCachedResponse = {
  status: number;
  body: unknown;
};

export type AppJsonResult = {
  status: number;
  body: unknown;
};

const DEFAULT_ALLOWED_ORIGINS = "https://www.enval.nl,https://enval.nl";

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return null;
}

function getEnvironment(): string {
  return firstNonEmpty(
    Deno.env.get("ENVIRONMENT"),
    Deno.env.get("ENV"),
    Deno.env.get("APP_ENV"),
  )?.toLowerCase() || "unknown";
}

function getHeader(req: Request, ...names: string[]): string | null {
  for (const name of names) {
    const value = req.headers.get(name);
    if (value && value.trim()) return value.trim();
  }
  return null;
}

export function getAppIdempotencyKey(req: Request): string | null {
  return getHeader(req, "Idempotency-Key", "idempotency-key");
}

export function getAppRequestId(req: Request): string {
  return getHeader(req, "X-Request-Id", "x-request-id") ||
    getAppIdempotencyKey(req) ||
    crypto.randomUUID();
}

export function getForwardedIpInput(req: Request): string | null {
  const forwarded = getHeader(req, "X-Forwarded-For", "x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return getHeader(
    req,
    "CF-Connecting-IP",
    "cf-connecting-ip",
    "X-Real-IP",
    "x-real-ip",
    "Client-IP",
    "client-ip",
  );
}

export function getUserAgentInput(req: Request): string | null {
  return getHeader(req, "User-Agent", "user-agent");
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashNullableInput(input: string | null): Promise<string | null> {
  const value = String(input ?? "").trim();
  if (!value) return null;
  return await sha256Hex(value);
}

export async function getAppRequestMeta(req: Request): Promise<AppRequestMeta> {
  const parsedUrl = new URL(req.url);
  const ipInput = getForwardedIpInput(req);
  const uaInput = getUserAgentInput(req);

  return {
    request_id: getAppRequestId(req),
    idempotency_key: getAppIdempotencyKey(req),
    ip_hash: await hashNullableInput(ipInput),
    user_agent_hash: await hashNullableInput(uaInput),
    method: req.method,
    path: parsedUrl.pathname,
    url: `${parsedUrl.origin}${parsedUrl.pathname}`,
    origin: getHeader(req, "Origin", "origin"),
    timestamp: new Date().toISOString(),
    environment: getEnvironment(),
  };
}

function parseAllowedOrigins(): string[] {
  const raw = firstNonEmpty(
    Deno.env.get("ALLOWED_ORIGINS"),
    Deno.env.get("ALLOWED_ORIGIN"),
  ) || DEFAULT_ALLOWED_ORIGINS;

  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// CORS helper for future api-app-* endpoints.
export function appCorsHeadersFor(req: Request): Record<string, string> {
  const allowedOrigins = parseAllowedOrigins();
  const origin = getHeader(req, "Origin", "origin") || "";
  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : (allowedOrigins[0] || "https://www.enval.nl");

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, idempotency-key, Idempotency-Key, x-request-id, X-Request-Id",
    "Vary": "Origin",
  };
}

export function appOptionsResponse(req: Request): Response {
  return new Response("ok", { headers: appCorsHeadersFor(req) });
}

export function appJsonResponse(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...appCorsHeadersFor(req),
    },
  });
}

export function appErrorResponse(
  req: Request,
  status: number,
  message: string,
  code = "request_failed",
): Response {
  // Keep safe customer-facing errors concise. Do not expose SQL, RLS, storage
  // paths, stack traces, raw audit payloads, or provider secrets.
  return appJsonResponse(req, status, {
    ok: false,
    error: message,
    code,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalizeJson(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return null;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error("Cannot hash circular JSON payload");
    seen.add(value);
    const out = value.map((item) => canonicalizeJson(item, seen));
    seen.delete(value);
    return out;
  }

  if (isPlainObject(value)) {
    if (seen.has(value)) throw new Error("Cannot hash circular JSON payload");
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const child = value[key];
      if (typeof child === "undefined") continue;
      out[key] = canonicalizeJson(child, seen);
    }
    seen.delete(value);
    return out;
  }

  return String(value);
}

export function stableJsonStringify(value: unknown): string {
  // Deterministic for JSON-like values: object keys are sorted recursively.
  // Non-JSON values are coerced conservatively. Circular structures are rejected.
  return JSON.stringify(canonicalizeJson(value, new WeakSet<object>()));
}

export async function payloadHash(payload: unknown): Promise<string> {
  // payload hash for app_idempotency_keys.payload_hash.
  return await sha256Hex(stableJsonStringify(payload));
}

export function buildAppIdempotencyInput(
  scope: AppIdempotencyScope,
  key: AppIdempotencyKey,
  payload_hash: string,
  expires_at: string,
): AppIdempotencyInput {
  return { scope, key, payload_hash, expires_at };
}

export function appAuditRow(input: AppAuditEventInput, meta: AppRequestMeta) {
  return {
    event_type: input.event_type,
    scope_type: input.scope_type,
    scope_id: input.scope_id || null,
    customer_id: input.customer_id || null,
    dossier_id: input.dossier_id || null,
    request_id: meta.request_id,
    idempotency_key: meta.idempotency_key,
    actor_type: input.actor_type,
    actor_ref: input.actor_ref || null,
    ip_hash: meta.ip_hash,
    user_agent_hash: meta.user_agent_hash,
    event_data: {
      environment: meta.environment,
      method: meta.method,
      path: meta.path,
      timestamp: meta.timestamp,
      ...(input.event_data || {}),
    },
  };
}

export function appIntakeAuditRow(input: AppIntakeAuditEventInput, meta: AppRequestMeta) {
  return {
    event_type: input.event_type,
    request_id: meta.request_id,
    idempotency_key: meta.idempotency_key,
    actor_type: input.actor_type || "anonymous",
    actor_ref: input.actor_ref || null,
    ip_hash: meta.ip_hash,
    user_agent_hash: meta.user_agent_hash,
    event_data: {
      environment: meta.environment,
      method: meta.method,
      path: meta.path,
      timestamp: meta.timestamp,
      ...(input.event_data || {}),
    },
  };
}

export async function insertAppAuditFailOpen(
  SB: any,
  input: AppAuditEventInput,
  meta: AppRequestMeta,
): Promise<void> {
  try {
    await SB.from("app_audit_events").insert([appAuditRow(input, meta)]);
  } catch (_e) {
    // fail-open for audit logging only
  }
}

export async function insertAppIntakeAuditFailOpen(
  SB: any,
  input: AppIntakeAuditEventInput,
  meta: AppRequestMeta,
): Promise<void> {
  try {
    await SB.from("app_intake_audit_events").insert([appIntakeAuditRow(input, meta)]);
  } catch (_e) {
    // fail-open for audit logging only
  }
}
