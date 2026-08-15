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
    bindingStatus?: "blocked";
  };

type UnknownJsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_REFERENCE_RE =
  /^CASE-(?:[0-9a-f]{12}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MODE = "auth_bootstrap_browser";
const SCHEMA_VERSION = "auth_bootstrap_browser_v2";
const SUCCESS_FIELDS = [
  "authenticated",
  "binding_status",
  "dossiers",
  "mode",
  "ok",
  "schema_version",
] as const;
const DOSSIER_FIELDS = [
  "account_type",
  "case_id",
  "case_reference",
  "dossier_id",
  "dossier_number",
  "status",
] as const;
const BLOCKED_FIELDS = [
  "authenticated",
  "binding_status",
  "code",
  "dossiers",
  "mode",
  "ok",
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

function nullableStringField(
  body: UnknownJsonObject,
  key: string,
): string | null | undefined {
  if (body[key] === null) return null;
  if (typeof body[key] !== "string") return undefined;
  return body[key].trim() || null;
}

function parseDossiers(
  value: unknown,
  allowEmpty = false,
): AuthBootstrapSummary["dossiers"] | null {
  if (!Array.isArray(value)) return null;

  const dossiers = value.map((item) => {
    if (!isRecord(item) || !hasExactFields(item, DOSSIER_FIELDS)) return null;

    const accountType = stringField(item, "account_type");
    if (!isAccountType(accountType)) return null;

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
      status: stringField(item, "status"),
      case_id: caseId,
      case_reference: caseReference,
    };
  });

  if ((!allowEmpty && !dossiers.length) || dossiers.some((item) => !item)) {
    return null;
  }

  return dossiers as AuthBootstrapSummary["dossiers"];
}

export function decodeAuthBootstrapResponse(
  body: unknown,
): AuthBootstrapResult {
  if (
    isRecord(body) && hasExactFields(body, BLOCKED_FIELDS) &&
    body.ok === false && body.mode === MODE &&
    body.schema_version === SCHEMA_VERSION && body.authenticated === true &&
    body.binding_status === "blocked" && Array.isArray(body.dossiers) &&
    body.dossiers.length === 0
  ) {
    return {
      ok: false,
      error: mapBootstrapErrorCode(stringField(body, "code")),
      bindingStatus: "blocked",
    };
  }

  if (!isRecord(body) || !hasExactFields(body, SUCCESS_FIELDS)) {
    return { ok: false, error: safeAuthError("invalid_response") };
  }
  const bindingStatus = stringField(body, "binding_status");
  const dossiers = parseDossiers(
    body.dossiers,
    bindingStatus === "unbound_no_cases",
  );

  const summary: AuthBootstrapSummary = {
    schema_version: SCHEMA_VERSION,
    authenticated: true,
    binding_status: bindingStatus === "unbound_no_cases"
      ? "unbound_no_cases"
      : "bound",
    dossiers: dossiers ?? [],
  };

  if (
    body.ok !== true ||
    body.mode !== MODE ||
    body.schema_version !== SCHEMA_VERSION ||
    body.authenticated !== true ||
    !["bound", "unbound_no_cases"].includes(bindingStatus) || !dossiers ||
    (bindingStatus === "bound" && dossiers.length === 0) ||
    (bindingStatus === "unbound_no_cases" && dossiers.length !== 0)
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
    if (!decoded.ok && decoded.bindingStatus === "blocked") {
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
