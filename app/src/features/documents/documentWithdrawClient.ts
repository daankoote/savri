import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig.ts";

type RuntimeConfig = {
  anonKey: string;
  withdrawEndpointUrl: string;
};

type WithdrawCurrentDocumentInput = {
  accessToken: string;
  dossierId: string;
  documentSlotId: string;
  idempotencyKey: string;
};

type UnknownRecord = Record<string, unknown>;

export type WithdrawCurrentDocumentResult =
  | { ok: true; slotStatus: string; hasCurrentDocument: false; requestId: string; replayed: boolean }
  | { ok: false; error: { code: string; message: string; retryable: boolean } };

export type DocumentWithdrawDependencies = {
  fetchImpl?: typeof fetch;
  runtimeConfig?: RuntimeConfig;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: UnknownRecord, key: string): string {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function booleanField(record: UnknownRecord, key: string): boolean {
  return record[key] === true;
}

function endpointFromApiBase(apiBaseUrl: string, endpoint: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${endpoint}`;
}

function resolveWithdrawRuntimeConfig(config?: RuntimeConfig): RuntimeConfig | null {
  if (config) return config;

  const authConfig = resolveAuthRuntimeConfig();
  if (!authConfig.ok) return null;

  const dashboardSuffix = "/api-app-dashboard-get";
  const dashboardUrl = authConfig.dashboardEndpointUrl;
  const apiBaseUrl = dashboardUrl.endsWith(dashboardSuffix)
    ? dashboardUrl.slice(0, -dashboardSuffix.length)
    : "";
  if (!apiBaseUrl) return null;

  return {
    anonKey: authConfig.anonKey,
    withdrawEndpointUrl: endpointFromApiBase(apiBaseUrl, "api-app-document-withdraw-current"),
  };
}

function safeError(code: string, message: string, retryable = true): WithdrawCurrentDocumentResult {
  return { ok: false, error: { code, message, retryable } };
}

export function createDocumentWithdrawIdempotencyKey(): string {
  return crypto.randomUUID();
}

async function parseJsonResponse(response: Response): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return { ok: false };
  }
}

export async function withdrawCurrentDocument(
  input: WithdrawCurrentDocumentInput,
  dependencies: DocumentWithdrawDependencies = {},
): Promise<WithdrawCurrentDocumentResult> {
  const runtime = resolveWithdrawRuntimeConfig(dependencies.runtimeConfig);
  if (!runtime) return safeError("not_configured", "Document verwijderen is lokaal nog niet geconfigureerd.");

  const accessToken = input.accessToken.trim();
  const dossierId = input.dossierId.trim().toLowerCase();
  const documentSlotId = input.documentSlotId.trim().toLowerCase();
  const idempotencyKey = input.idempotencyKey.trim();
  if (!accessToken || !UUID_RE.test(dossierId) || !UUID_RE.test(documentSlotId) || !idempotencyKey) {
    return safeError("invalid_input", "Controleer dossier en document.", false);
  }

  let response: Response;
  try {
    response = await (dependencies.fetchImpl ?? fetch)(runtime.withdrawEndpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: runtime.anonKey,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        dossier_id: dossierId,
        document_slot_id: documentSlotId,
      }),
    });
  } catch (_error) {
    return safeError("service_unavailable", "Document verwijderen is tijdelijk niet beschikbaar.");
  }

  const parsed = await parseJsonResponse(response);
  if (!parsed.ok) return safeError("invalid_response", "Document verwijderen gaf een onverwacht antwoord.");

  if (!response.ok) {
    const code = isRecord(parsed.body) ? stringField(parsed.body, "code") || "withdraw_failed" : "withdraw_failed";
    const retryable = response.status >= 500 || code === "request_in_progress";
    return safeError(code, "Document verwijderen is tijdelijk niet beschikbaar.", retryable);
  }

  if (!isRecord(parsed.body) || parsed.body.ok !== true || stringField(parsed.body, "mode") !== "document_withdraw_current_v1") {
    return safeError("invalid_response", "Document verwijderen gaf een onverwacht antwoord.");
  }

  const requestId = stringField(parsed.body, "request_id");
  const slotStatus = stringField(parsed.body, "slot_status");
  if (!requestId || !slotStatus || booleanField(parsed.body, "has_current_document") !== false) {
    return safeError("invalid_response", "Document verwijderen gaf een onverwacht antwoord.");
  }

  return {
    ok: true,
    hasCurrentDocument: false,
    replayed: booleanField(parsed.body, "replayed"),
    requestId,
    slotStatus,
  };
}
