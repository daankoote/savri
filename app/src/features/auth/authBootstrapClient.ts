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
  | {
    ok: false;
    error: AuthSafeError;
    status?: number;
    bindingStatus?: "denied" | "blocked";
  };

type UnknownJsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MODE = "auth_bootstrap_browser";
const SCHEMA_VERSION = "auth_bootstrap_browser_v3";
const SUCCESS_FIELDS = [
  "authenticated",
  "binding_status",
  "dossiers",
  "mode",
  "ok",
  "portal_contexts",
  "schema_version",
] as const;
const DOSSIER_FIELDS = [
  "account_type",
  "case_id",
  "case_reference",
  "dossier_id",
  "dossier_number",
  "portal_context",
  "status",
] as const;
const BLOCKED_FIELDS = [
  "authenticated",
  "binding_status",
  "code",
  "dossiers",
  "mode",
  "ok",
  "portal_contexts",
  "schema_version",
] as const;

function isRecord(value: unknown): value is UnknownJsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(body: UnknownJsonObject, key: string): string {
  return typeof body[key] === "string" ? body[key].trim() : "";
}

function hasExactFields(
  body: UnknownJsonObject,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(body).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isAccountType(
  value: string,
): value is AuthBootstrapSummary["dossiers"][number]["account_type"] {
  return value === "particulier" || value === "zakelijk" || value === "vve";
}

function isPortalContext(
  value: string,
): value is AuthBootstrapSummary["portal_contexts"][number] {
  return value === "customer" || value === "business";
}

function nullableStringField(
  body: UnknownJsonObject,
  key: string,
): string | null | undefined {
  if (body[key] === null) return null;
  if (typeof body[key] !== "string") return undefined;
  return body[key].trim() || null;
}

function parseDossiers(value: unknown): AuthBootstrapSummary["dossiers"] | null {
  if (!Array.isArray(value)) return null;

  const dossiers = value.map((item) => {
    if (!isRecord(item) || !hasExactFields(item, DOSSIER_FIELDS)) return null;

    const accountType = stringField(item, "account_type");
    const portalContext = stringField(item, "portal_context");
    if (!isAccountType(accountType)) return null;
    if (
      !isPortalContext(portalContext) ||
      (accountType === "particulier"
        ? portalContext !== "customer"
        : portalContext !== "business")
    ) return null;

    const dossierId = stringField(item, "dossier_id");
    const caseId = stringField(item, "case_id");
    const caseReference = stringField(item, "case_reference");
    const dossierNumber = nullableStringField(item, "dossier_number");
    if (
      !isUuid(dossierId) ||
      !isUuid(caseId) ||
      !CASE_REFERENCE_RE.test(caseReference) ||
      dossierNumber === undefined ||
      !stringField(item, "status")
    ) {
      return null;
    }

    return {
      dossier_id: dossierId,
      dossier_number: dossierNumber,
      account_type: accountType,
      portal_context: portalContext,
      status: stringField(item, "status"),
      case_id: caseId,
      case_reference: caseReference,
    };
  });

  if (!dossiers.length || dossiers.some((item) => !item)) {
    return null;
  }

  return dossiers as AuthBootstrapSummary["dossiers"];
}

function parsePortalContexts(value: unknown): AuthBootstrapSummary["portal_contexts"] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
  const contexts = value.map((item) => typeof item === "string" ? item.trim() : "");
  if (
    contexts.some((context) => !isPortalContext(context)) ||
    new Set(contexts).size !== contexts.length
  ) return null;
  return contexts as AuthBootstrapSummary["portal_contexts"];
}

export function decodeAuthBootstrapResponse(
  body: unknown,
): AuthBootstrapResult {
  if (
    isRecord(body) && hasExactFields(body, BLOCKED_FIELDS) &&
    body.ok === false && body.mode === MODE &&
    body.schema_version === SCHEMA_VERSION && body.authenticated === true &&
    ["denied", "blocked"].includes(stringField(body, "binding_status")) &&
    Array.isArray(body.portal_contexts) && body.portal_contexts.length === 0 &&
    Array.isArray(body.dossiers) && body.dossiers.length === 0 &&
    ((body.binding_status === "denied" && stringField(body, "code") === "portal_context_not_authorized") ||
      (body.binding_status === "blocked" && [
        "customer_identity_already_bound",
        "customer_identity_binding_ambiguous",
        "customer_inactive",
      ].includes(stringField(body, "code"))))
  ) {
    return {
      ok: false,
      error: mapBootstrapErrorCode(stringField(body, "code")),
      bindingStatus: stringField(body, "binding_status") as "denied" | "blocked",
    };
  }

  if (!isRecord(body) || !hasExactFields(body, SUCCESS_FIELDS)) {
    return { ok: false, error: safeAuthError("invalid_response") };
  }
  const bindingStatus = stringField(body, "binding_status");
  const dossiers = parseDossiers(body.dossiers);
  const portalContexts = parsePortalContexts(body.portal_contexts);

  const summary: AuthBootstrapSummary = {
    schema_version: SCHEMA_VERSION,
    authenticated: true,
    binding_status: "bound",
    portal_contexts: portalContexts ?? [],
    dossiers: dossiers ?? [],
  };

  if (
    body.ok !== true ||
    body.mode !== MODE ||
    body.schema_version !== SCHEMA_VERSION ||
    body.authenticated !== true ||
    bindingStatus !== "bound" || !dossiers || !portalContexts ||
    portalContexts.length !== new Set(dossiers.map((dossier) => dossier.portal_context)).size ||
    dossiers.some((dossier) => !portalContexts.includes(dossier.portal_context))
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

  const decoded = decodeAuthBootstrapResponse(parsed.body);
  if (!response.ok) {
    if (!decoded.ok && decoded.bindingStatus) {
      return { ...decoded, status: response.status };
    }
    return {
      ok: false,
      error: mapBootstrapErrorCode(stringField(parsed.body, "code")),
      status: response.status,
    };
  }

  return decoded;
}
