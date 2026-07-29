import { mapBootstrapErrorCode, safeAuthError } from "./authErrorMapping";
import { resolveAuthRuntimeConfig } from "./authRuntimeConfig";
import type { AuthBootstrapSummary, AuthSafeError } from "./authTypes";

export type AuthBootstrapClientConfig = {
  accessToken: string;
  idempotencyKey: string;
  fetchImpl?: typeof fetch;
};

export type AuthBootstrapResult =
  | { ok: true; summary: AuthBootstrapSummary }
  | { ok: false; error: AuthSafeError; status?: number };

type UnknownJsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_REFERENCE_RE =
  /^CASE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is UnknownJsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(body: UnknownJsonObject, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function booleanField(body: UnknownJsonObject, key: string): boolean {
  return body[key] === true;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isAccountType(
  value: string,
): value is AuthBootstrapSummary["dossiers"][number]["account_type"] {
  return value === "particulier" || value === "zakelijk" || value === "vve";
}

function parseDossiers(
  value: unknown,
): AuthBootstrapSummary["dossiers"] | null {
  if (!Array.isArray(value)) return null;

  const dossiers = value.map((item) => {
    if (!isRecord(item)) return null;

    const accountType = stringField(item, "account_type");
    if (!isAccountType(accountType)) return null;

    const dossierId = stringField(item, "dossier_id");
    const caseId = stringField(item, "case_id");
    const caseReference = stringField(item, "case_reference");
    if (
      !isUuid(dossierId) ||
      !isUuid(caseId) ||
      !CASE_REFERENCE_RE.test(caseReference)
    ) {
      return null;
    }

    return {
      dossier_id: dossierId,
      dossier_number: stringField(item, "dossier_number"),
      account_type: accountType,
      status: stringField(item, "status"),
      case_id: caseId,
      case_reference: caseReference,
    };
  });

  if (!dossiers.length || dossiers.some((item) => !item)) return null;

  return dossiers as AuthBootstrapSummary["dossiers"];
}

function validateSuccessBody(body: UnknownJsonObject): AuthBootstrapResult {
  const dossiers = parseDossiers(body.dossiers);

  const summary: AuthBootstrapSummary = {
    customer_id: stringField(body, "customer_id"),
    identity_id: stringField(body, "identity_id"),
    identity_status: "active",
    binding_status: "bound",
    dossiers: dossiers ?? [],
    payload_hash: stringField(body, "payload_hash"),
    request_id: stringField(body, "request_id"),
    replayed: booleanField(body, "replayed"),
  };

  if (
    body.ok !== true ||
    body.mode !== "auth_bootstrap_v2" ||
    body.identity_status !== "active" ||
    body.binding_status !== "bound" ||
    !isUuid(summary.customer_id) ||
    !isUuid(summary.identity_id) ||
    !SHA256_RE.test(summary.payload_hash) ||
    !summary.request_id ||
    !dossiers
  ) {
    return { ok: false, error: safeAuthError("invalid_response") };
  }

  return { ok: true, summary };
}

async function parseJsonResponse(
  response: Response,
): Promise<{ ok: true; body: unknown } | { ok: false; error: AuthSafeError }> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return { ok: false, error: safeAuthError("invalid_response") };
  }
}

export async function bootstrapAppCustomerAuth({
  accessToken,
  fetchImpl = fetch,
  idempotencyKey,
}: AuthBootstrapClientConfig): Promise<AuthBootstrapResult> {
  const runtime = resolveAuthRuntimeConfig();
  if (!runtime.ok) return { ok: false, error: safeAuthError("not_configured") };

  const bearerToken = accessToken.trim();
  const idemKey = idempotencyKey.trim();
  if (!bearerToken || !idemKey) {
    return { ok: false, error: safeAuthError("invalid_response") };
  }

  let response: Response;
  try {
    response = await fetchImpl(runtime.bootstrapEndpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        apikey: runtime.anonKey,
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey,
      },
      body: "{}",
    });
  } catch (_error) {
    return { ok: false, error: safeAuthError("service_unavailable") };
  }

  const parsed = await parseJsonResponse(response);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error, status: response.status };
  }

  if (!isRecord(parsed.body)) {
    return {
      ok: false,
      error: safeAuthError("invalid_response"),
      status: response.status,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: mapBootstrapErrorCode(stringField(parsed.body, "code")),
      status: response.status,
    };
  }

  return validateSuccessBody(parsed.body);
}
