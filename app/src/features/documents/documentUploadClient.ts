import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../auth/authClient";
import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig";
import type {
  DocumentUploadAttempt,
  DocumentUploadErrorCode,
  DocumentUploadSafeError,
  DocumentUploadStage,
  UploadDocumentInput,
  UploadDocumentResult,
} from "./documentUploadTypes";

type RuntimeConfig = {
  anonKey: string;
  uploadUrlEndpointUrl: string;
  uploadConfirmEndpointUrl: string;
};

type UnknownRecord = Record<string, unknown>;

export type DocumentUploadClientDependencies = {
  fetchImpl?: typeof fetch;
  runtimeConfig?: RuntimeConfig;
  supabaseClient?: Pick<SupabaseClient, "storage">;
  digestImpl?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: UnknownRecord, key: string): string {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

function numberField(record: UnknownRecord, key: string): number | null {
  return typeof record[key] === "number" && Number.isFinite(record[key]) ? record[key] : null;
}

function safeError(
  code: DocumentUploadErrorCode,
  stage: DocumentUploadStage,
  message: string,
  retryable: boolean,
  backendCode?: string,
): DocumentUploadSafeError {
  return backendCode
    ? { code, message, stage, retryable, backendCode }
    : { code, message, stage, retryable };
}

function mapBackendError(stage: DocumentUploadStage, body: unknown, fallbackMessage: string): DocumentUploadSafeError {
  const backendCode = isRecord(body) ? stringField(body, "code") : "";
  const code: DocumentUploadErrorCode = stage === "issue" ? "issue_failed" : "confirm_failed";
  return safeError(code, stage, fallbackMessage, true, backendCode || undefined);
}

function endpointFromApiBase(apiBaseUrl: string, endpoint: string): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/${endpoint}`;
}

function resolveUploadRuntimeConfig(config?: RuntimeConfig): RuntimeConfig | null {
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
    uploadUrlEndpointUrl: endpointFromApiBase(apiBaseUrl, "api-app-document-upload-url"),
    uploadConfirmEndpointUrl: endpointFromApiBase(apiBaseUrl, "api-app-document-upload-confirm"),
  };
}

function normalizeFileName(value: string): string {
  return value.trim();
}

function normalizeMimeType(value: string, file: Blob): string {
  return value.trim().toLowerCase() || file.type.trim().toLowerCase();
}

function validateInput(input: UploadDocumentInput): { ok: true; fileName: string; mimeType: string; sizeBytes: number } | { ok: false; error: DocumentUploadSafeError } {
  const dossierId = input.dossierId.trim().toLowerCase();
  const documentSlotId = input.documentSlotId.trim().toLowerCase();
  const uploadKey = input.attempt.uploadUrlIdempotencyKey.trim();
  const confirmKey = input.attempt.confirmIdempotencyKey.trim();
  const fileName = normalizeFileName(input.originalFileName);
  const mimeType = normalizeMimeType(input.declaredMimeType, input.file);

  if (!input.accessToken.trim() || !UUID_RE.test(dossierId) || !UUID_RE.test(documentSlotId) || !uploadKey || !confirmKey) {
    return {
      ok: false,
      error: safeError("invalid_input", "precheck", "Controleer dossier en document.", false),
    };
  }

  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..") || /[\u0000-\u001f\u007f]/.test(fileName)) {
    return {
      ok: false,
      error: safeError("invalid_input", "precheck", "Controleer de bestandsnaam.", false),
    };
  }

  if (!mimeType) {
    return {
      ok: false,
      error: safeError("invalid_input", "precheck", "Controleer het bestandstype.", false),
    };
  }

  if (!Number.isFinite(input.file.size) || input.file.size <= 0) {
    return {
      ok: false,
      error: safeError("invalid_input", "precheck", "Kies een geldig bestand.", false),
    };
  }

  return { ok: true, fileName, mimeType, sizeBytes: input.file.size };
}

async function sha256HexFromFile(
  file: Blob,
  digestImpl: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>,
): Promise<string | null> {
  try {
    const bytes = await file.arrayBuffer();
    const hash = await digestImpl("SHA-256", bytes);
    return Array.from(new Uint8Array(hash))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch (_error) {
    return null;
  }
}

async function parseJsonResponse(response: Response): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await response.json() };
  } catch (_error) {
    return { ok: false };
  }
}

function validateIssueResponse(body: unknown): {
  ok: true;
  documentFileId: string;
  documentSlotId: string;
  storageBucket: string;
  storagePath: string;
  uploadToken: string;
} | { ok: false } {
  if (!isRecord(body) || body.ok !== true || body.mode !== "upload_url_v1") return { ok: false };

  const documentFileId = stringField(body, "document_file_id");
  const documentSlotId = stringField(body, "document_slot_id");
  const storageBucket = stringField(body, "storage_bucket");
  const storagePath = stringField(body, "storage_path");
  const uploadToken = stringField(body, "upload_token");

  if (!UUID_RE.test(documentFileId) || !UUID_RE.test(documentSlotId) || !storageBucket || !storagePath || !uploadToken) {
    return { ok: false };
  }

  return { ok: true, documentFileId, documentSlotId, storageBucket, storagePath, uploadToken };
}

function validateConfirmResponse(body: unknown): UploadDocumentResult {
  if (!isRecord(body) || body.ok !== true || body.mode !== "upload_confirm_v1") {
    return {
      ok: false,
      error: safeError("invalid_response", "confirm", "Documentcontrole gaf een onverwacht antwoord.", true),
    };
  }

  const documentFileId = stringField(body, "document_file_id");
  const documentSlotId = stringField(body, "document_slot_id");
  const requestId = stringField(body, "request_id");
  const fileStatus = stringField(body, "file_status");
  const versionStatus = stringField(body, "version_status");
  const currentVersionNumber = numberField(body, "version_number");

  if (
    !UUID_RE.test(documentFileId) ||
    !UUID_RE.test(documentSlotId) ||
    !requestId ||
    fileStatus !== "confirmed" ||
    versionStatus !== "current" ||
    !currentVersionNumber
  ) {
    return {
      ok: false,
      error: safeError("invalid_response", "confirm", "Documentcontrole gaf een onverwacht antwoord.", true),
    };
  }

  return {
    ok: true,
    documentFileId,
    documentSlotId,
    fileStatus,
    currentVersionNumber,
    currentVersionStatus: versionStatus,
    safeFileName: null,
    requestId,
  };
}

async function postJson(
  endpointUrl: string,
  accessToken: string,
  anonKey: string,
  idempotencyKey: string,
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
}

export function createDocumentUploadAttempt(): DocumentUploadAttempt {
  return {
    uploadUrlIdempotencyKey: crypto.randomUUID(),
    confirmIdempotencyKey: crypto.randomUUID(),
  };
}

export async function uploadDocument(
  input: UploadDocumentInput,
  dependencies: DocumentUploadClientDependencies = {},
): Promise<UploadDocumentResult> {
  const runtime = resolveUploadRuntimeConfig(dependencies.runtimeConfig);
  if (!runtime) {
    return {
      ok: false,
      error: safeError("not_configured", "precheck", "Documentupload is lokaal nog niet geconfigureerd.", true),
    };
  }

  const supabaseClient = dependencies.supabaseClient ?? getSupabaseBrowserClient();
  if (!supabaseClient) {
    return {
      ok: false,
      error: safeError("not_configured", "precheck", "Documentupload is lokaal nog niet geconfigureerd.", true),
    };
  }

  const validated = validateInput(input);
  if (!validated.ok) return { ok: false, error: validated.error };

  const digestImpl = dependencies.digestImpl ?? crypto.subtle.digest.bind(crypto.subtle);
  const clientSha256 = await sha256HexFromFile(input.file, digestImpl);
  if (!clientSha256 || !SHA256_RE.test(clientSha256)) {
    return {
      ok: false,
      error: safeError("hash_failed", "hash", "Bestand kon niet worden voorbereid.", true),
    };
  }

  const accessToken = input.accessToken.trim();
  const dossierId = input.dossierId.trim().toLowerCase();
  const documentSlotId = input.documentSlotId.trim().toLowerCase();
  const fetchImpl = dependencies.fetchImpl ?? fetch;

  const issueBody = {
    dossier_id: dossierId,
    document_slot_id: documentSlotId,
    file_name: validated.fileName,
    mime_type: validated.mimeType,
    size_bytes: validated.sizeBytes,
    client_sha256: clientSha256,
  };

  let issueResponse: Response;
  try {
    issueResponse = await postJson(
      runtime.uploadUrlEndpointUrl,
      accessToken,
      runtime.anonKey,
      input.attempt.uploadUrlIdempotencyKey.trim(),
      issueBody,
      fetchImpl,
    );
  } catch (_error) {
    return {
      ok: false,
      error: safeError("service_unavailable", "issue", "Documentupload is tijdelijk niet beschikbaar.", true),
    };
  }

  const issueJson = await parseJsonResponse(issueResponse);
  if (!issueJson.ok) {
    return {
      ok: false,
      error: safeError("invalid_response", "issue", "Documentupload gaf een onverwacht antwoord.", true),
    };
  }

  if (!issueResponse.ok) {
    return { ok: false, error: mapBackendError("issue", issueJson.body, "Documentupload is tijdelijk niet beschikbaar.") };
  }

  const issued = validateIssueResponse(issueJson.body);
  if (!issued.ok || issued.documentSlotId !== documentSlotId) {
    return {
      ok: false,
      error: safeError("invalid_response", "issue", "Documentupload gaf een onverwacht antwoord.", true),
    };
  }

  const uploadResult = await supabaseClient.storage
    .from(issued.storageBucket)
    .uploadToSignedUrl(issued.storagePath, issued.uploadToken, input.file, {
      contentType: validated.mimeType,
    });

  if (uploadResult.error) {
    return {
      ok: false,
      error: safeError("upload_failed", "upload", "Bestand kon niet worden geupload.", true),
    };
  }

  const confirmBody = {
    dossier_id: dossierId,
    document_slot_id: documentSlotId,
    document_file_id: issued.documentFileId,
    file_sha256: clientSha256,
  };

  let confirmResponse: Response;
  try {
    confirmResponse = await postJson(
      runtime.uploadConfirmEndpointUrl,
      accessToken,
      runtime.anonKey,
      input.attempt.confirmIdempotencyKey.trim(),
      confirmBody,
      fetchImpl,
    );
  } catch (_error) {
    return {
      ok: false,
      error: safeError("service_unavailable", "confirm", "Documentcontrole is tijdelijk niet beschikbaar.", true),
    };
  }

  const confirmJson = await parseJsonResponse(confirmResponse);
  if (!confirmJson.ok) {
    return {
      ok: false,
      error: safeError("invalid_response", "confirm", "Documentcontrole gaf een onverwacht antwoord.", true),
    };
  }

  if (!confirmResponse.ok) {
    return { ok: false, error: mapBackendError("confirm", confirmJson.body, "Documentcontrole is tijdelijk niet beschikbaar.") };
  }

  return validateConfirmResponse(confirmJson.body);
}
