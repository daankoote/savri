// supabase/functions/api-app-document-upload-url/index.ts
//
// Upload URL v1 for the new /app document flow.
// Frontend may assist; backend decides.
//
// This endpoint only issues a server-generated private upload target. It does
// not confirm uploads, create document versions, or update slot current-version
// pointers.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appAuditRow,
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  requireAppCustomer,
  requireAppDossierAccess,
  type AppCustomerAuthContext,
} from "../_shared/app_customer_auth.ts";

type UploadUrlPayload = {
  dossier_id?: unknown;
  document_slot_id?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
  client_sha256?: unknown;
};

type NormalizedUploadUrlPayload = {
  dossier_id: string;
  document_slot_id: string;
  normalized_file_name: string;
  mime_type: string;
  size_bytes: number;
  client_sha256: string | null;
};

type DocumentSlot = {
  id: string;
  dossier_id: string;
  document_type: string;
  status: string;
  required: boolean;
  title: string | null;
  current_version_id: string | null;
  current_version_number: number | null;
};

type DocumentFile = {
  id: string;
  dossier_id: string;
  document_slot_id: string;
  status: string;
  storage_bucket: string;
  storage_path: string;
  original_file_name: string;
  normalized_file_name: string;
  declared_mime_type: string;
  declared_size_bytes: number;
  client_sha256: string | null;
  expires_at: string;
};

type StoredUploadResponse = {
  ok: true;
  mode: "upload_url_v1";
  request_id: string;
  document_file_id: string;
  document_slot_id: string;
  status: "issued";
  storage_bucket: string;
  storage_path: string;
  expires_at: string;
  max_size_bytes: number;
  payload_hash: string;
};

type SignedUpload = {
  signed_upload_url: string;
  upload_token: string;
};

type NormalizationError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

type IdempotencyResult =
  | { ok: true; replay: false }
  | { ok: true; replay: true; status: number; body: unknown }
  | { ok: false; conflict: true }
  | { ok: false; conflict: false; status: number; code: string; message: string };

const MODE = "upload_url_v1";
const STORAGE_BUCKET = Deno.env.get("APP_DOCUMENTS_BUCKET") || "app-documents";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const SIGNED_UPLOAD_TTL_SECONDS = 10 * 60;
const FILE_INTENT_TTL_MINUTES = 30;
const IDEMPOTENCY_SCOPE_PREFIX = "api-app-document-upload-url:v1";
const IDEMPOTENCY_TTL_HOURS = 24;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const UPLOADABLE_SLOT_STATUSES = new Set(["expected", "needs_review", "rejected"]);
const REPLACEABLE_SLOT_STATUSES = new Set(["uploaded"]);
const ACTIVE_FILE_STATUSES = ["issued", "uploaded"];

const DOCUMENT_TYPE_POLICIES = new Map<string, { allowedMimeTypes: Set<string>; requiresPdfExtension: boolean }>([
  [
    "invoice_or_ownership_evidence",
    {
      allowedMimeTypes: new Set(["application/pdf"]),
      requiresPdfExtension: true,
    },
  ],
  [
    "mid_meter_evidence",
    {
      allowedMimeTypes: new Set(["application/pdf"]),
      requiresPdfExtension: true,
    },
  ],
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function minutesFromNowIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function appSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function normalizeFileName(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  const normalized = trimmed
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 120)
    .toLowerCase();

  if (!normalized || normalized === "." || normalized === "..") return null;
  if (normalized.includes("..")) return null;
  return normalized;
}

function fileExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? String(parts[parts.length - 1] || "") : "";
}

async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: UploadUrlPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as UploadUrlPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function normalizePayload(
  body: UploadUrlPayload,
): { ok: true; payload: NormalizedUploadUrlPayload } | NormalizationError {
  const dossier_id = getString(body.dossier_id).toLowerCase();
  const document_slot_id = getString(body.document_slot_id).toLowerCase();

  if (!isUuid(dossier_id) || !isUuid(document_slot_id)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_uuid",
      message: "Controleer dossier en document.",
    };
  }

  const fileName = getString(body.file_name);
  const normalized_file_name = normalizeFileName(fileName);
  if (!fileName || !normalized_file_name) {
    return {
      ok: false,
      status: 400,
      code: "invalid_file_metadata",
      message: "Controleer de bestandsnaam.",
    };
  }

  const mime_type = getString(body.mime_type).toLowerCase();
  if (!mime_type) {
    return {
      ok: false,
      status: 400,
      code: "invalid_file_metadata",
      message: "Controleer het bestandstype.",
    };
  }

  const size_bytes = Number(body.size_bytes);
  if (!Number.isInteger(size_bytes) || size_bytes <= 0) {
    return {
      ok: false,
      status: 400,
      code: "invalid_file_metadata",
      message: "Controleer de bestandsgrootte.",
    };
  }

  if (size_bytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "file_too_large",
      message: "Bestand is te groot.",
    };
  }

  const rawClientSha = getString(body.client_sha256).toLowerCase();
  const client_sha256 = rawClientSha || null;
  if (client_sha256 && !SHA256_RE.test(client_sha256)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_file_metadata",
      message: "Controleer de bestandshash.",
    };
  }

  return {
    ok: true,
    payload: {
      dossier_id,
      document_slot_id,
      normalized_file_name,
      mime_type,
      size_bytes,
      client_sha256,
    },
  };
}

function validatePayloadAgainstSlot(
  payload: NormalizedUploadUrlPayload,
  slot: DocumentSlot,
): { ok: true } | NormalizationError {
  if (slot.status === "not_required") {
    return {
      ok: false,
      status: 409,
      code: "document_slot_not_required",
      message: "Dit document is niet vereist.",
    };
  }

  const canReplaceCurrentDocument = REPLACEABLE_SLOT_STATUSES.has(slot.status) &&
    !!slot.current_version_id &&
    !!slot.current_version_number;
  if (!UPLOADABLE_SLOT_STATUSES.has(slot.status) && !canReplaceCurrentDocument) {
    return {
      ok: false,
      status: 409,
      code: "document_slot_not_uploadable",
      message: "Dit document kan nu niet worden geupload.",
    };
  }

  const policy = DOCUMENT_TYPE_POLICIES.get(slot.document_type);
  if (!policy) {
    return {
      ok: false,
      status: 415,
      code: "unsupported_document_type",
      message: "Dit documenttype wordt nog niet ondersteund.",
    };
  }

  if (!policy.allowedMimeTypes.has(payload.mime_type)) {
    return {
      ok: false,
      status: 415,
      code: "unsupported_mime_type",
      message: "Dit bestandstype wordt niet ondersteund voor dit document.",
    };
  }

  if (policy.requiresPdfExtension && fileExtension(payload.normalized_file_name) !== "pdf") {
    return {
      ok: false,
      status: 415,
      code: "unsupported_mime_type",
      message: "Upload een PDF-bestand.",
    };
  }

  return { ok: true };
}

function buildIdempotencyScope(authContext: AppCustomerAuthContext, payload: NormalizedUploadUrlPayload): string {
  return [
    IDEMPOTENCY_SCOPE_PREFIX,
    authContext.customerId,
    authContext.identityId,
    payload.dossier_id,
    payload.document_slot_id,
  ].join(":");
}

function storagePathFor(payload: NormalizedUploadUrlPayload, documentFileId: string): string {
  return [
    "app",
    "dossiers",
    payload.dossier_id,
    "slots",
    payload.document_slot_id,
    "files",
    documentFileId,
    payload.normalized_file_name,
  ].join("/");
}

async function reserveOrReplayIdempotency(
  SB: any,
  scope: string,
  key: string,
  payload_hash: string,
): Promise<IdempotencyResult> {
  const { data: existing, error: lookupError } = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      conflict: false,
      status: 500,
      code: "service_unavailable",
      message: "Documentupload is tijdelijk niet beschikbaar.",
    };
  }

  if (existing) {
    if (existing.payload_hash !== payload_hash) {
      return { ok: false, conflict: true };
    }

    if (existing.response_status && existing.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(existing.response_status),
        body: existing.response_body,
      };
    }

    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Documentupload wordt al voorbereid.",
    };
  }

  const { error: insertError } = await SB.from("app_idempotency_keys").insert([{
    scope,
    key,
    payload_hash,
    locked_at: nowIso(),
    expires_at: hoursFromNowIso(IDEMPOTENCY_TTL_HOURS),
  }]);

  if (!insertError) {
    return { ok: true, replay: false };
  }

  const retry = await SB
    .from("app_idempotency_keys")
    .select("payload_hash,response_status,response_body")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (!retry.error && retry.data) {
    if (retry.data.payload_hash !== payload_hash) return { ok: false, conflict: true };
    if (retry.data.response_status && retry.data.response_body) {
      return {
        ok: true,
        replay: true,
        status: Number(retry.data.response_status),
        body: retry.data.response_body,
      };
    }
    return {
      ok: false,
      conflict: false,
      status: 409,
      code: "request_in_progress",
      message: "Documentupload wordt al voorbereid.",
    };
  }

  return {
    ok: false,
    conflict: false,
    status: 500,
    code: "service_unavailable",
    message: "Documentupload is tijdelijk niet beschikbaar.",
  };
}

async function completeIdempotency(
  SB: any,
  scope: string,
  key: string,
  status: number,
  body: unknown,
): Promise<boolean> {
  const { error } = await SB
    .from("app_idempotency_keys")
    .update({
      response_status: status,
      response_body: body,
      completed_at: nowIso(),
    })
    .eq("scope", scope)
    .eq("key", key);

  return !error;
}

async function insertAppAuditStrict(SB: any, input: Parameters<typeof appAuditRow>[0], meta: Parameters<typeof appAuditRow>[1]) {
  const { error } = await SB.from("app_audit_events").insert([appAuditRow(input, meta)]);
  return !error;
}

async function rejectWithAudit(
  req: Request,
  SB: any,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext,
  payload: NormalizedUploadUrlPayload,
  status: number,
  code: string,
  message: string,
  stage: string,
  eventData: Record<string, unknown> = {},
  idem?: { scope: string; key: string },
) {
  const responseBody = { ok: false, error: message, code };
  const auditOk = await insertAppAuditStrict(SB, {
    event_type: "document_upload_url_rejected",
    scope_type: "document",
    scope_id: payload.document_slot_id,
    customer_id: authContext.customerId,
    dossier_id: payload.dossier_id,
    actor_type: "customer",
    actor_ref: authContext.actorRef,
    event_data: {
      request_id: meta.request_id,
      idempotency_key: meta.idempotency_key,
      actor_ref: authContext.actorRef,
      customer_id: authContext.customerId,
      identity_id: authContext.identityId,
      dossier_id: payload.dossier_id,
      document_slot_id: payload.document_slot_id,
      stage,
      status,
      reason: code,
      declared_mime_type: payload.mime_type,
      declared_size_bytes: payload.size_bytes,
      client_sha256_supplied: !!payload.client_sha256,
      ...eventData,
    },
  }, meta);

  if (!auditOk) {
    return appErrorResponse(req, 500, "Documentupload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  if (idem) {
    const stored = await completeIdempotency(SB, idem.scope, idem.key, status, responseBody);
    if (!stored) {
      return appErrorResponse(req, 500, "Documentupload is tijdelijk niet beschikbaar.", "service_unavailable");
    }
  }

  return appJsonResponse(req, status, responseBody);
}

async function loadAuthorizedSlot(
  SB: any,
  payload: NormalizedUploadUrlPayload,
): Promise<{ ok: true; slot: DocumentSlot } | { ok: false; status: number; code: string; message: string }> {
  const { data: slot, error } = await SB
    .from("app_dossier_document_slots")
    .select("id,dossier_id,document_type,status,required,title,current_version_id,current_version_number")
    .eq("id", payload.document_slot_id)
    .maybeSingle();

  if (error || !slot?.id) {
    return {
      ok: false,
      status: 404,
      code: "document_slot_not_found_or_forbidden",
      message: "Document niet gevonden.",
    };
  }

  if (String(slot.dossier_id) !== payload.dossier_id) {
    return {
      ok: false,
      status: 404,
      code: "document_slot_not_found_or_forbidden",
      message: "Document niet gevonden.",
    };
  }

  return {
    ok: true,
    slot: {
      id: String(slot.id),
      dossier_id: String(slot.dossier_id),
      document_type: String(slot.document_type || ""),
      status: String(slot.status || ""),
      required: slot.required === true,
      title: slot.title ? String(slot.title) : null,
      current_version_id: slot.current_version_id ? String(slot.current_version_id) : null,
      current_version_number: slot.current_version_number === null || slot.current_version_number === undefined
        ? null
        : Number(slot.current_version_number),
    },
  };
}

async function expireStaleActiveFiles(
  SB: any,
  payload: NormalizedUploadUrlPayload,
): Promise<{ ok: true; expiredCount: number } | { ok: false }> {
  const { data: stale, error } = await SB
    .from("app_dossier_document_files")
    .select("id")
    .eq("document_slot_id", payload.document_slot_id)
    .in("status", ACTIVE_FILE_STATUSES)
    .lte("expires_at", nowIso());

  if (error) return { ok: false };
  const ids = Array.isArray(stale) ? stale.map((row) => String(row.id || "")).filter(Boolean) : [];
  if (!ids.length) return { ok: true, expiredCount: 0 };

  const { error: updateError } = await SB
    .from("app_dossier_document_files")
    .update({
      status: "expired",
      expired_at: nowIso(),
      terminal_reason: "upload_url_intent_expired_before_new_request",
    })
    .in("id", ids);

  if (updateError) return { ok: false };
  return { ok: true, expiredCount: ids.length };
}

async function findActiveFileForSlot(SB: any, payload: NormalizedUploadUrlPayload): Promise<DocumentFile | null | "error"> {
  const { data, error } = await SB
    .from("app_dossier_document_files")
    .select(
      "id,dossier_id,document_slot_id,status,storage_bucket,storage_path,original_file_name,normalized_file_name,declared_mime_type,declared_size_bytes,client_sha256,expires_at",
    )
    .eq("document_slot_id", payload.document_slot_id)
    .in("status", ACTIVE_FILE_STATUSES)
    .gt("expires_at", nowIso())
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return "error";
  if (!data?.id) return null;
  return normalizeDocumentFile(data);
}

function normalizeDocumentFile(data: Record<string, unknown>): DocumentFile {
  return {
    id: String(data.id),
    dossier_id: String(data.dossier_id),
    document_slot_id: String(data.document_slot_id),
    status: String(data.status),
    storage_bucket: String(data.storage_bucket),
    storage_path: String(data.storage_path),
    original_file_name: String(data.original_file_name),
    normalized_file_name: String(data.normalized_file_name),
    declared_mime_type: String(data.declared_mime_type),
    declared_size_bytes: Number(data.declared_size_bytes),
    client_sha256: data.client_sha256 ? String(data.client_sha256) : null,
    expires_at: String(data.expires_at),
  };
}

async function createDocumentFile(
  SB: any,
  payload: NormalizedUploadUrlPayload,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  payload_hash: string,
): Promise<{ ok: true; file: DocumentFile } | { ok: false }> {
  const documentFileId = crypto.randomUUID();
  const issuedAt = nowIso();
  const expiresAt = minutesFromNowIso(FILE_INTENT_TTL_MINUTES);
  const storagePath = storagePathFor(payload, documentFileId);

  const { data, error } = await SB
    .from("app_dossier_document_files")
    .insert([{
      id: documentFileId,
      dossier_id: payload.dossier_id,
      document_slot_id: payload.document_slot_id,
      issued_request_id: meta.request_id,
      issued_idempotency_key: String(meta.idempotency_key),
      status: "issued",
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      original_file_name: payload.normalized_file_name,
      normalized_file_name: payload.normalized_file_name,
      declared_mime_type: payload.mime_type,
      declared_size_bytes: payload.size_bytes,
      client_sha256: payload.client_sha256,
      issued_at: issuedAt,
      expires_at: expiresAt,
      metadata: {
        source: "api-app-document-upload-url",
        mode: MODE,
        payload_hash,
        client_sha256_supplied: !!payload.client_sha256,
      },
    }])
    .select(
      "id,dossier_id,document_slot_id,status,storage_bucket,storage_path,original_file_name,normalized_file_name,declared_mime_type,declared_size_bytes,client_sha256,expires_at",
    )
    .single();

  if (error || !data?.id) return { ok: false };
  return { ok: true, file: normalizeDocumentFile(data) };
}

async function abandonDocumentFile(SB: any, documentFileId: string, reason: string): Promise<boolean> {
  const { error } = await SB
    .from("app_dossier_document_files")
    .update({
      status: "abandoned",
      abandoned_at: nowIso(),
      terminal_reason: reason,
    })
    .eq("id", documentFileId)
    .eq("status", "issued");

  return !error;
}

async function signUploadUrl(SB: any, file: DocumentFile): Promise<{ ok: true; signed: SignedUpload } | { ok: false }> {
  const { data, error } = await SB.storage
    .from(file.storage_bucket)
    .createSignedUploadUrl(file.storage_path, SIGNED_UPLOAD_TTL_SECONDS);

  if (error || !data?.signedUrl || !data?.token) return { ok: false };
  return {
    ok: true,
    signed: {
      signed_upload_url: String(data.signedUrl),
      upload_token: String(data.token),
    },
  };
}

function storedResponseFromFile(
  file: DocumentFile,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  payload_hash: string,
): StoredUploadResponse {
  return {
    ok: true,
    mode: MODE,
    request_id: meta.request_id,
    document_file_id: file.id,
    document_slot_id: file.document_slot_id,
    status: "issued",
    storage_bucket: file.storage_bucket,
    storage_path: file.storage_path,
    expires_at: file.expires_at,
    max_size_bytes: MAX_UPLOAD_BYTES,
    payload_hash,
  };
}

function publicSuccessResponse(stored: StoredUploadResponse, signed: SignedUpload, replayed: boolean) {
  return {
    ...stored,
    signed_upload_url: signed.signed_upload_url,
    upload_token: signed.upload_token,
    replayed,
  };
}

async function replayStoredUpload(
  req: Request,
  SB: any,
  stored: Record<string, unknown>,
) {
  const documentFileId = getString(stored.document_file_id);
  if (!isUuid(documentFileId)) {
    return appErrorResponse(req, 409, "Documentupload wordt al verwerkt.", "request_in_progress");
  }

  const { data, error } = await SB
    .from("app_dossier_document_files")
    .select(
      "id,dossier_id,document_slot_id,status,storage_bucket,storage_path,original_file_name,normalized_file_name,declared_mime_type,declared_size_bytes,client_sha256,expires_at",
    )
    .eq("id", documentFileId)
    .maybeSingle();

  if (error || !data?.id) {
    return appErrorResponse(req, 409, "Documentupload wordt al verwerkt.", "request_in_progress");
  }

  const file = normalizeDocumentFile(data);
  if (!ACTIVE_FILE_STATUSES.includes(file.status) || new Date(file.expires_at).getTime() <= Date.now()) {
    return appErrorResponse(req, 409, "Uploadlink is verlopen.", "upload_intent_expired");
  }

  const signed = await signUploadUrl(SB, file);
  if (!signed.ok) {
    return appErrorResponse(req, 500, "Documentupload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  return appJsonResponse(req, 200, publicSuccessResponse(stored as StoredUploadResponse, signed.signed, true));
}

async function handleSigningFailure(
  req: Request,
  SB: any,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext,
  payload: NormalizedUploadUrlPayload,
  file: DocumentFile,
  idempotency_scope: string,
) {
  await abandonDocumentFile(SB, file.id, "storage_signing_failed");

  const responseBody = {
    ok: false,
    error: "Documentupload is tijdelijk niet beschikbaar.",
    code: "service_unavailable",
  };

  await insertAppAuditStrict(SB, {
    event_type: "document_upload_url_rejected",
    scope_type: "document",
    scope_id: payload.document_slot_id,
    customer_id: authContext.customerId,
    dossier_id: payload.dossier_id,
    actor_type: "customer",
    actor_ref: authContext.actorRef,
    event_data: {
      request_id: meta.request_id,
      idempotency_key: meta.idempotency_key,
      actor_ref: authContext.actorRef,
      customer_id: authContext.customerId,
      identity_id: authContext.identityId,
      dossier_id: payload.dossier_id,
      document_slot_id: payload.document_slot_id,
      document_file_id: file.id,
      stage: "storage_signing",
      status: 500,
      reason: "storage_signing_failed",
      declared_mime_type: payload.mime_type,
      declared_size_bytes: payload.size_bytes,
      client_sha256_supplied: !!payload.client_sha256,
      expires_at: file.expires_at,
      storage_bucket: file.storage_bucket,
      storage_path: file.storage_path,
      compensation: "abandoned",
    },
  }, meta);

  await completeIdempotency(SB, idempotency_scope, String(meta.idempotency_key), 500, responseBody);
  return appJsonResponse(req, 500, responseBody);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  if (!meta.idempotency_key) {
    return appErrorResponse(req, 400, "Idempotency-Key ontbreekt.", "missing_idempotency_key");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const normalized = normalizePayload(parsed.body);
  if (!normalized.ok) {
    return appErrorResponse(req, normalized.status, normalized.message, normalized.code);
  }
  const payload = normalized.payload;
  const normalized_payload_hash = await payloadHash(payload);

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(req, 500, "Documentupload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const auth = await requireAppCustomer(req, SB);
  if (!auth.ok) {
    return appErrorResponse(req, auth.status, auth.message, auth.code);
  }

  const dossierAccess = await requireAppDossierAccess(SB, auth.context, payload.dossier_id);
  if (!dossierAccess.ok) {
    return appErrorResponse(req, dossierAccess.status, dossierAccess.message, dossierAccess.code);
  }

  const slot = await loadAuthorizedSlot(SB, payload);
  if (!slot.ok) {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      slot.status,
      slot.code,
      slot.message,
      "slot_authorization",
    );
  }

  const slotValidation = validatePayloadAgainstSlot(payload, slot.slot);
  if (!slotValidation.ok) {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      slotValidation.status,
      slotValidation.code,
      slotValidation.message,
      "slot_validation",
      {
        document_type: slot.slot.document_type,
        slot_status: slot.slot.status,
      },
    );
  }

  const idempotency_scope = buildIdempotencyScope(auth.context, payload);
  const idempotency = await reserveOrReplayIdempotency(
    SB,
    idempotency_scope,
    meta.idempotency_key,
    normalized_payload_hash,
  );

  if (!idempotency.ok) {
    if (idempotency.conflict) {
      return rejectWithAudit(
        req,
        SB,
        meta,
        auth.context,
        payload,
        409,
        "idempotency_conflict",
        "Deze uploadaanvraag hoort bij andere bestandsgegevens.",
        "idempotency",
        { idempotency_scope },
      );
    }

    return appErrorResponse(req, idempotency.status, idempotency.message, idempotency.code);
  }

  if (idempotency.replay) {
    if (isRecord(idempotency.body) && idempotency.status === 200) {
      return await replayStoredUpload(req, SB, idempotency.body);
    }
    return appJsonResponse(req, idempotency.status, idempotency.body);
  }

  const expired = await expireStaleActiveFiles(SB, payload);
  if (!expired.ok) {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      500,
      "service_unavailable",
      "Documentupload is tijdelijk niet beschikbaar.",
      "active_upload_cleanup",
      undefined,
      { scope: idempotency_scope, key: meta.idempotency_key },
    );
  }

  const activeFile = await findActiveFileForSlot(SB, payload);
  if (activeFile === "error") {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      500,
      "service_unavailable",
      "Documentupload is tijdelijk niet beschikbaar.",
      "active_upload_check",
      undefined,
      { scope: idempotency_scope, key: meta.idempotency_key },
    );
  }

  if (activeFile) {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      409,
      "active_upload_exists",
      "Er staat al een upload klaar voor dit document.",
      "active_upload_check",
      {
        active_document_file_id: activeFile.id,
        active_expires_at: activeFile.expires_at,
      },
      { scope: idempotency_scope, key: meta.idempotency_key },
    );
  }

  const created = await createDocumentFile(SB, payload, meta, normalized_payload_hash);
  if (!created.ok) {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      500,
      "service_unavailable",
      "Documentupload is tijdelijk niet beschikbaar.",
      "file_row_create",
      undefined,
      { scope: idempotency_scope, key: meta.idempotency_key },
    );
  }

  const signed = await signUploadUrl(SB, created.file);
  if (!signed.ok) {
    return await handleSigningFailure(req, SB, meta, auth.context, payload, created.file, idempotency_scope);
  }

  const successAuditOk = await insertAppAuditStrict(SB, {
    event_type: "document_upload_url_issued",
    scope_type: "document",
    scope_id: payload.document_slot_id,
    customer_id: auth.context.customerId,
    dossier_id: payload.dossier_id,
    actor_type: "customer",
    actor_ref: auth.context.actorRef,
    event_data: {
      request_id: meta.request_id,
      idempotency_key: meta.idempotency_key,
      actor_ref: auth.context.actorRef,
      customer_id: auth.context.customerId,
      identity_id: auth.context.identityId,
      dossier_id: payload.dossier_id,
      document_slot_id: payload.document_slot_id,
      document_file_id: created.file.id,
      stage: "issued",
      status: 200,
      reason: "issued",
      declared_mime_type: payload.mime_type,
      declared_size_bytes: payload.size_bytes,
      client_sha256_supplied: !!payload.client_sha256,
      expires_at: created.file.expires_at,
      environment: meta.environment,
      storage_bucket: created.file.storage_bucket,
      storage_path: created.file.storage_path,
      document_type: slot.slot.document_type,
      expired_active_upload_count: expired.expiredCount,
    },
  }, meta);

  if (!successAuditOk) {
    await abandonDocumentFile(SB, created.file.id, "success_audit_failed");
    await insertAppAuditStrict(SB, {
      event_type: "document_upload_url_rejected",
      scope_type: "document",
      scope_id: payload.document_slot_id,
      customer_id: auth.context.customerId,
      dossier_id: payload.dossier_id,
      actor_type: "customer",
      actor_ref: auth.context.actorRef,
      event_data: {
        request_id: meta.request_id,
        idempotency_key: meta.idempotency_key,
        actor_ref: auth.context.actorRef,
        customer_id: auth.context.customerId,
        identity_id: auth.context.identityId,
        dossier_id: payload.dossier_id,
        document_slot_id: payload.document_slot_id,
        document_file_id: created.file.id,
        stage: "success_audit",
        status: 500,
        reason: "success_audit_failed",
        compensation: "abandoned",
      },
    }, meta);
    return appErrorResponse(req, 500, "Documentupload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const storedResponse = storedResponseFromFile(created.file, meta, normalized_payload_hash);
  const idempotencyStored = await completeIdempotency(
    SB,
    idempotency_scope,
    meta.idempotency_key,
    200,
    storedResponse,
  );

  if (!idempotencyStored) {
    await abandonDocumentFile(SB, created.file.id, "idempotency_finalize_failed");
    await insertAppAuditStrict(SB, {
      event_type: "document_upload_url_rejected",
      scope_type: "document",
      scope_id: payload.document_slot_id,
      customer_id: auth.context.customerId,
      dossier_id: payload.dossier_id,
      actor_type: "customer",
      actor_ref: auth.context.actorRef,
      event_data: {
        request_id: meta.request_id,
        idempotency_key: meta.idempotency_key,
        actor_ref: auth.context.actorRef,
        customer_id: auth.context.customerId,
        identity_id: auth.context.identityId,
        dossier_id: payload.dossier_id,
        document_slot_id: payload.document_slot_id,
        document_file_id: created.file.id,
        stage: "idempotency_finalize",
        status: 500,
        reason: "idempotency_finalize_failed",
        compensation: "abandoned",
      },
    }, meta);
    return appErrorResponse(req, 500, "Documentupload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  return appJsonResponse(req, 200, publicSuccessResponse(storedResponse, signed.signed, false));
});
