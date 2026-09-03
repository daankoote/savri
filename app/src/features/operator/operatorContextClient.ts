import { resolvePublicApiRuntimeConfig } from "../auth/authRuntimeConfig.ts";

export const OPERATOR_CAPABILITIES = Object.freeze(
  [
    "compliance.delivery_year.view",
    "evidence.review.view",
  ] as const,
);

export type OperatorCapability = (typeof OPERATOR_CAPABILITIES)[number];

export type OperatorContext = Readonly<{
  actorType: "tenant_workforce";
  tenantReference: string;
  effectiveCapabilities: readonly OperatorCapability[];
  active: true;
  authorized: true;
}>;

export type OperatorContextErrorCode =
  | "not_configured"
  | "unauthorized"
  | "not_workforce"
  | "workforce_inactive"
  | "forbidden"
  | "service_unavailable"
  | "invalid_response";

export type OperatorContextSafeError = Readonly<{
  code: OperatorContextErrorCode;
  message: string;
}>;

export type OperatorContextLoadResult =
  | Readonly<{ ok: true; value: OperatorContext }>
  | Readonly<{
    ok: false;
    error: OperatorContextSafeError;
    status?: number;
  }>;

type OperatorContextClientConfig = Readonly<{
  accessToken: string;
  fetchImpl?: typeof fetch;
  runtimeConfig?: Readonly<{ anonKey: string; apiBaseUrl: string }>;
  signal?: AbortSignal;
}>;

type JsonRecord = Record<string, unknown>;

const RESPONSE_FIELDS = Object.freeze([
  "active",
  "actor_type",
  "authorized",
  "effective_capabilities",
  "schema_version",
  "tenant_reference",
]);

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasExactFields(value: JsonRecord, fields: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === fields.length &&
    actual.every((field, index) => field === fields[index]);
}

function safeError(code: OperatorContextErrorCode): OperatorContextSafeError {
  const messages: Record<OperatorContextErrorCode, string> = {
    forbidden: "U heeft geen toegang tot beheer.",
    invalid_response:
      "Beheer kon niet veilig worden geladen. Probeer het opnieuw.",
    not_configured: "Beheer is lokaal nog niet geconfigureerd.",
    not_workforce: "U heeft geen toegang tot beheer.",
    service_unavailable:
      "Beheer is tijdelijk niet beschikbaar. Probeer het opnieuw.",
    unauthorized: "Log opnieuw in om beheer te openen.",
    workforce_inactive: "U heeft geen toegang tot beheer.",
  };
  return Object.freeze({ code, message: messages[code] });
}

export function decodeOperatorContextResponse(
  body: unknown,
): OperatorContextLoadResult {
  if (!isRecord(body) || !hasExactFields(body, RESPONSE_FIELDS)) {
    return { ok: false, error: safeError("invalid_response") };
  }
  if (
    body.schema_version !== "operator_context_v1" ||
    body.actor_type !== "tenant_workforce" || body.active !== true ||
    body.authorized !== true ||
    typeof body.tenant_reference !== "string" ||
    !/^[0-9a-f]{64}$/.test(body.tenant_reference) ||
    !Array.isArray(body.effective_capabilities) ||
    body.effective_capabilities.length < 1 ||
    new Set(body.effective_capabilities).size !==
      body.effective_capabilities.length ||
    !body.effective_capabilities.every((capability) =>
      OPERATOR_CAPABILITIES.includes(capability as OperatorCapability)
    )
  ) return { ok: false, error: safeError("invalid_response") };

  return {
    ok: true,
    value: Object.freeze({
      actorType: "tenant_workforce",
      tenantReference: body.tenant_reference,
      effectiveCapabilities: Object.freeze(
        [...body.effective_capabilities] as OperatorCapability[],
      ),
      active: true,
      authorized: true,
    }),
  };
}

function errorCode(body: unknown, status: number): OperatorContextErrorCode {
  const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
  if (status === 401) return "unauthorized";
  if (status === 403 && code === "workforce_identity_missing") {
    return "not_workforce";
  }
  if (status === 403 && code === "workforce_identity_inactive") {
    return "workforce_inactive";
  }
  if (status === 403) return "forbidden";
  return "service_unavailable";
}

export async function loadOperatorContext(
  config: OperatorContextClientConfig,
): Promise<OperatorContextLoadResult> {
  const accessToken = config.accessToken.trim();
  if (!accessToken) return { ok: false, error: safeError("unauthorized") };
  let runtime = config.runtimeConfig;
  if (!runtime) {
    const resolved = resolvePublicApiRuntimeConfig();
    if (!resolved.ok) return { ok: false, error: safeError("not_configured") };
    runtime = resolved;
  }

  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(
      `${runtime.apiBaseUrl}/api-app-operator-context`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: runtime.anonKey,
        },
        signal: config.signal,
      },
    );
  } catch {
    return { ok: false, error: safeError("service_unavailable") };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: safeError("invalid_response") };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: safeError(errorCode(body, response.status)),
      status: response.status,
    };
  }
  return decodeOperatorContextResponse(body);
}
