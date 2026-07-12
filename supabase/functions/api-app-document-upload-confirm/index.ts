// supabase/functions/api-app-document-upload-confirm/index.ts
//
// Upload confirm v1 for the new /app document flow.
// Frontend may assist; backend decides.
//
// This endpoint verifies the exact server-issued storage object, computes the
// server SHA-256, and calls an app-specific RPC for the atomic file/version/slot
// transition. It does not mutate legacy dossier tables.

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

type ConfirmPayload = {
  dossier_id?: unknown;
  document_slot_id?: unknown;
  document_file_id?: unknown;
  file_sha256?: unknown;
};

type NormalizedConfirmPayload = {
  dossier_id: string;
  document_slot_id: string;
  document_file_id: string;
  file_sha256: string;
};

type DocumentSlot = {
  id: string;
  dossier_id: string;
  document_type: string;
  status: string;
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
  normalized_file_name: string;
  declared_mime_type: string;
  declared_size_bytes: number;
  client_sha256: string | null;
  expires_at: string;
  server_sha256: string | null;
  confirmed_at: string | null;
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

type RejectPolicy = "nonterminal" | "terminal";

const MODE = "upload_confirm_v1";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const IDEMPOTENCY_SCOPE_PREFIX = "api-app-document-upload-confirm:v1";
const IDEMPOTENCY_TTL_HOURS = 24;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const CONFIRMABLE_FILE_STATUSES = new Set(["issued", "uploaded"]);
const TERMINAL_FILE_STATUSES = new Set(["confirmed", "rejected", "expired", "abandoned"]);

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

async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: ConfirmPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as ConfirmPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function normalizePayload(
  body: ConfirmPayload,
): { ok: true; payload: NormalizedConfirmPayload } | NormalizationError {
  const dossier_id = getString(body.dossier_id).toLowerCase();
  const document_slot_id = getString(body.document_slot_id).toLowerCase();
  const document_file_id = getString(body.document_file_id).toLowerCase();
  const file_sha256 = getString(body.file_sha256).toLowerCase();

  if (!isUuid(dossier_id) || !isUuid(document_slot_id) || !isUuid(document_file_id)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_uuid",
      message: "Controleer dossier en document.",
    };
  }

  if (!SHA256_RE.test(file_sha256)) {
    return {
      ok: false,
      status: 400,
      code: "invalid_file_sha256",
      message: "Controleer de bestandshash.",
    };
  }

  return {
    ok: true,
    payload: { dossier_id, document_slot_id, document_file_id, file_sha256 },
  };
}

function buildIdempotencyScope(authContext: AppCustomerAuthContext, payload: NormalizedConfirmPayload): string {
  return [
    IDEMPOTENCY_SCOPE_PREFIX,
    authContext.customerId,
    authContext.identityId,
    payload.dossier_id,
    payload.document_slot_id,
    payload.document_file_id,
  ].join(":");
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
      message: "Documentcontrole is tijdelijk niet beschikbaar.",
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
      message: "Documentcontrole wordt al verwerkt.",
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
      message: "Documentcontrole wordt al verwerkt.",
    };
  }

  return {
    ok: false,
    conflict: false,
    status: 500,
    code: "service_unavailable",
    message: "Documentcontrole is tijdelijk niet beschikbaar.",
  };
}

async function insertAppAuditStrict(SB: any, input: Parameters<typeof appAuditRow>[0], meta: Parameters<typeof appAuditRow>[1]) {
  const { error } = await SB.from("app_audit_events").insert([appAuditRow(input, meta)]);
  return !error;
}

function replayBody(body: unknown): unknown {
  if (!isRecord(body)) return body;
  if (body.ok === true) return { ...body, replayed: true };
  return body;
}

async function rejectWithAudit(
  req: Request,
  SB: any,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext,
  payload: NormalizedConfirmPayload,
  status: number,
  code: string,
  message: string,
  stage: string,
  eventData: Record<string, unknown> = {},
) {
  const responseBody = { ok: false, error: message, code };
  const auditOk = await insertAppAuditStrict(SB, {
    event_type: "document_upload_confirm_rejected",
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
      document_file_id: payload.document_file_id,
      stage,
      status,
      reason: code,
      client_confirm_sha256: payload.file_sha256,
      ...eventData,
    },
  }, meta);

  if (!auditOk) {
    return appErrorResponse(req, 500, "Documentcontrole is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  return appJsonResponse(req, status, responseBody);
}

async function rejectWithAtomicRpc(
  req: Request,
  SB: any,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext,
  payload: NormalizedConfirmPayload,
  idempotency_scope: string,
  payload_hash: string,
  status: number,
  code: string,
  message: string,
  stage: string,
  rejectPolicy: RejectPolicy,
  rejectionReason: string,
  eventData: Record<string, unknown> = {},
) {
  const { data, error } = await SB.rpc("app_reject_document_upload_v1", {
    p_dossier_id: payload.dossier_id,
    p_document_slot_id: payload.document_slot_id,
    p_document_file_id: payload.document_file_id,
    p_customer_id: authContext.customerId,
    p_identity_id: authContext.identityId,
    p_actor_ref: authContext.actorRef,
    p_request_id: meta.request_id,
    p_idempotency_scope: idempotency_scope,
    p_idempotency_key: String(meta.idempotency_key),
    p_payload_hash: payload_hash,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
    p_response_status: status,
    p_error_code: code,
    p_error_message: message,
    p_stage: stage,
    p_reject_policy: rejectPolicy,
    p_rejection_reason: rejectionReason,
    p_event_data: eventData,
  });

  if (error || !data) {
    return appErrorResponse(req, 500, "Documentcontrole is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  return appJsonResponse(req, status, data);
}

async function loadAuthorizedSlot(
  SB: any,
  payload: NormalizedConfirmPayload,
): Promise<{ ok: true; slot: DocumentSlot } | { ok: false; status: number; code: string; message: string }> {
  const { data: slot, error } = await SB
    .from("app_dossier_document_slots")
    .select("id,dossier_id,document_type,status,current_version_id,current_version_number")
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
      current_version_id: slot.current_version_id ? String(slot.current_version_id) : null,
      current_version_number: slot.current_version_number === null || slot.current_version_number === undefined
        ? null
        : Number(slot.current_version_number),
    },
  };
}

async function loadAuthorizedFile(
  SB: any,
  payload: NormalizedConfirmPayload,
): Promise<{ ok: true; file: DocumentFile } | { ok: false; status: number; code: string; message: string }> {
  const { data, error } = await SB
    .from("app_dossier_document_files")
    .select(
      "id,dossier_id,document_slot_id,status,storage_bucket,storage_path,normalized_file_name,declared_mime_type,declared_size_bytes,client_sha256,expires_at,server_sha256,confirmed_at",
    )
    .eq("id", payload.document_file_id)
    .maybeSingle();

  if (error || !data?.id) {
    return {
      ok: false,
      status: 404,
      code: "document_file_not_found_or_forbidden",
      message: "Documentbestand niet gevonden.",
    };
  }

  if (String(data.dossier_id) !== payload.dossier_id || String(data.document_slot_id) !== payload.document_slot_id) {
    return {
      ok: false,
      status: 404,
      code: "document_file_not_found_or_forbidden",
      message: "Documentbestand niet gevonden.",
    };
  }

  return {
    ok: true,
    file: {
      id: String(data.id),
      dossier_id: String(data.dossier_id),
      document_slot_id: String(data.document_slot_id),
      status: String(data.status || ""),
      storage_bucket: String(data.storage_bucket || ""),
      storage_path: String(data.storage_path || ""),
      normalized_file_name: String(data.normalized_file_name || ""),
      declared_mime_type: String(data.declared_mime_type || "").toLowerCase(),
      declared_size_bytes: Number(data.declared_size_bytes),
      client_sha256: data.client_sha256 ? String(data.client_sha256).toLowerCase() : null,
      expires_at: String(data.expires_at || ""),
      server_sha256: data.server_sha256 ? String(data.server_sha256).toLowerCase() : null,
      confirmed_at: data.confirmed_at ? String(data.confirmed_at) : null,
    },
  };
}

async function sha256HexFromBytes(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function detectMimeType(bytes: Uint8Array): string {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "application/pdf";
  }

  return "application/octet-stream";
}

async function downloadStoredObject(
  SB: any,
  file: DocumentFile,
): Promise<
  | { ok: true; bytes: ArrayBuffer; detected_mime_type: string; stored_size_bytes: number; server_sha256: string }
  | { ok: false; code: string; status: number; message: string }
> {
  const { data: blob, error } = await SB.storage
    .from(file.storage_bucket)
    .download(file.storage_path);

  if (error || !blob) {
    return {
      ok: false,
      code: "stored_object_missing",
      status: 409,
      message: "Uploadbestand is niet gevonden.",
    };
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await blob.arrayBuffer();
  } catch (_e) {
    return {
      ok: false,
      code: "hash_compute_failed",
      status: 500,
      message: "Documentcontrole is tijdelijk niet beschikbaar.",
    };
  }

  let server_sha256 = "";
  try {
    server_sha256 = await sha256HexFromBytes(bytes);
  } catch (_e) {
    return {
      ok: false,
      code: "hash_compute_failed",
      status: 500,
      message: "Documentcontrole is tijdelijk niet beschikbaar.",
    };
  }

  const uint8 = new Uint8Array(bytes);
  return {
    ok: true,
    bytes,
    detected_mime_type: detectMimeType(uint8),
    stored_size_bytes: uint8.byteLength,
    server_sha256,
  };
}

async function readPostRpcFileState(
  SB: any,
  payload: NormalizedConfirmPayload,
): Promise<
  | { ok: true; fileStatus: string; confirmedVersionCount: number }
  | { ok: false }
> {
  const fileResult = await SB
    .from("app_dossier_document_files")
    .select("status")
    .eq("id", payload.document_file_id)
    .eq("document_slot_id", payload.document_slot_id)
    .eq("dossier_id", payload.dossier_id)
    .maybeSingle();

  if (fileResult.error || !fileResult.data?.status) return { ok: false };

  const versionResult = await SB
    .from("app_dossier_document_versions")
    .select("id")
    .eq("document_file_id", payload.document_file_id)
    .eq("document_slot_id", payload.document_slot_id)
    .eq("dossier_id", payload.dossier_id);

  if (versionResult.error) return { ok: false };

  return {
    ok: true,
    fileStatus: String(fileResult.data.status || ""),
    confirmedVersionCount: Array.isArray(versionResult.data) ? versionResult.data.length : 0,
  };
}

function buildRpcArgs(
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext,
  payload: NormalizedConfirmPayload,
  idempotency_scope: string,
  payload_hash: string,
  verification: { detected_mime_type: string; stored_size_bytes: number; server_sha256: string },
) {
  return {
    p_dossier_id: payload.dossier_id,
    p_document_slot_id: payload.document_slot_id,
    p_document_file_id: payload.document_file_id,
    p_customer_id: authContext.customerId,
    p_identity_id: authContext.identityId,
    p_actor_ref: authContext.actorRef,
    p_request_id: meta.request_id,
    p_idempotency_scope: idempotency_scope,
    p_idempotency_key: String(meta.idempotency_key),
    p_payload_hash: payload_hash,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
    p_detected_mime_type: verification.detected_mime_type,
    p_stored_size_bytes: verification.stored_size_bytes,
    p_server_sha256: verification.server_sha256,
  };
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
    return appErrorResponse(req, 500, "Documentcontrole is tijdelijk niet beschikbaar.", "service_unavailable");
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

  const file = await loadAuthorizedFile(SB, payload);
  if (!file.ok) {
    return rejectWithAudit(
      req,
      SB,
      meta,
      auth.context,
      payload,
      file.status,
      file.code,
      file.message,
      "file_authorization",
      { document_type: slot.slot.document_type },
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
        "Deze bevestiging hoort bij andere bestandsgegevens.",
        "idempotency",
        { idempotency_scope },
      );
    }

    return appErrorResponse(req, idempotency.status, idempotency.message, idempotency.code);
  }

  if (idempotency.replay) {
    return appJsonResponse(req, idempotency.status, replayBody(idempotency.body));
  }

  if (TERMINAL_FILE_STATUSES.has(file.file.status)) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      file.file.status === "confirmed" ? "document_file_already_confirmed" : "document_file_terminal",
      "Dit documentbestand kan niet opnieuw worden bevestigd.",
      "file_state",
      "nonterminal",
      file.file.status === "confirmed" ? "document_file_already_confirmed" : "document_file_terminal",
      {
        file_status: file.file.status,
        confirmed_at: file.file.confirmed_at,
      },
    );
  }

  if (!CONFIRMABLE_FILE_STATUSES.has(file.file.status)) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      "document_file_not_confirmable",
      "Dit documentbestand kan niet worden bevestigd.",
      "file_state",
      "nonterminal",
      "document_file_not_confirmable",
      { file_status: file.file.status },
    );
  }

  if (new Date(file.file.expires_at).getTime() <= Date.now()) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      "upload_intent_expired",
      "Uploadlink is verlopen.",
      "file_expiry",
      "nonterminal",
      "upload_intent_expired",
      { expires_at: file.file.expires_at },
    );
  }

  if (!file.file.storage_bucket || !file.file.storage_path) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      500,
      "service_unavailable",
      "Documentcontrole is tijdelijk niet beschikbaar.",
      "file_metadata",
      "nonterminal",
      "missing_storage_metadata",
      { missing_storage_metadata: true },
    );
  }

  if (file.file.client_sha256 && file.file.client_sha256 !== payload.file_sha256) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      "issued_client_hash_mismatch",
      "Bestand komt niet overeen met de aangemaakte upload.",
      "issued_client_hash",
      "terminal",
      "issued_client_hash_mismatch",
      { issued_client_sha256: file.file.client_sha256 },
    );
  }

  const downloaded = await downloadStoredObject(SB, file.file);
  if (!downloaded.ok) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      downloaded.status,
      downloaded.code,
      downloaded.message,
      "storage_download",
      "nonterminal",
      downloaded.code,
      {
        storage_bucket: file.file.storage_bucket,
        storage_object_missing: downloaded.code === "stored_object_missing",
      },
    );
  }

  if (downloaded.stored_size_bytes > MAX_UPLOAD_BYTES) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      413,
      "stored_size_mismatch",
      "Bestand is te groot.",
      "stored_size",
      "terminal",
      "stored_size_mismatch",
      {
        declared_size_bytes: file.file.declared_size_bytes,
        stored_size_bytes: downloaded.stored_size_bytes,
      },
    );
  }

  if (downloaded.stored_size_bytes !== file.file.declared_size_bytes) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      "stored_size_mismatch",
      "Bestand komt niet overeen met de aangemaakte upload.",
      "stored_size",
      "terminal",
      "stored_size_mismatch",
      {
        declared_size_bytes: file.file.declared_size_bytes,
        stored_size_bytes: downloaded.stored_size_bytes,
      },
    );
  }

  if (downloaded.detected_mime_type !== file.file.declared_mime_type) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      415,
      "stored_mime_mismatch",
      "Bestandstype komt niet overeen met de aangemaakte upload.",
      "stored_mime",
      "terminal",
      "stored_mime_mismatch",
      {
        declared_mime_type: file.file.declared_mime_type,
        detected_mime_type: downloaded.detected_mime_type,
      },
    );
  }

  if (downloaded.server_sha256 !== payload.file_sha256) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      "server_hash_mismatch",
      "Bestand komt niet overeen met de bevestiging.",
      "server_hash",
      "terminal",
      "server_hash_mismatch",
      { server_sha256: downloaded.server_sha256 },
    );
  }

  if (file.file.client_sha256 && downloaded.server_sha256 !== file.file.client_sha256) {
    return rejectWithAtomicRpc(
      req,
      SB,
      meta,
      auth.context,
      payload,
      idempotency_scope,
      normalized_payload_hash,
      409,
      "issued_client_hash_mismatch",
      "Bestand komt niet overeen met de aangemaakte upload.",
      "server_issued_hash",
      "terminal",
      "issued_client_hash_mismatch",
      {
        issued_client_sha256: file.file.client_sha256,
        server_sha256: downloaded.server_sha256,
      },
    );
  }

  const rpcArgs = buildRpcArgs(meta, auth.context, payload, idempotency_scope, normalized_payload_hash, {
    detected_mime_type: downloaded.detected_mime_type,
    stored_size_bytes: downloaded.stored_size_bytes,
    server_sha256: downloaded.server_sha256,
  });

  const { data: confirmed, error: confirmError } = await SB.rpc("app_confirm_document_upload_v1", rpcArgs);
  if (confirmError || !confirmed) {
    const postRpcState = await readPostRpcFileState(SB, payload);
    if (postRpcState.ok && postRpcState.fileStatus === "confirmed" && postRpcState.confirmedVersionCount === 1) {
      return rejectWithAtomicRpc(
        req,
        SB,
        meta,
        auth.context,
        payload,
        idempotency_scope,
        normalized_payload_hash,
        409,
        "document_file_already_confirmed",
        "Dit documentbestand is al bevestigd.",
        "confirm_transaction_race",
        "nonterminal",
        "document_file_already_confirmed",
        { file_status: postRpcState.fileStatus, confirmed_version_count: postRpcState.confirmedVersionCount },
      );
    }

    if (postRpcState.ok && TERMINAL_FILE_STATUSES.has(postRpcState.fileStatus)) {
      return rejectWithAtomicRpc(
        req,
        SB,
        meta,
        auth.context,
        payload,
        idempotency_scope,
        normalized_payload_hash,
        409,
        "document_file_terminal",
        "Dit documentbestand kan niet opnieuw worden bevestigd.",
        "confirm_transaction_state",
        "nonterminal",
        "document_file_terminal",
        { file_status: postRpcState.fileStatus, confirmed_version_count: postRpcState.confirmedVersionCount },
      );
    }

    if (postRpcState.ok && CONFIRMABLE_FILE_STATUSES.has(postRpcState.fileStatus)) {
      return rejectWithAtomicRpc(
        req,
        SB,
        meta,
        auth.context,
        payload,
        idempotency_scope,
        normalized_payload_hash,
        503,
        "confirmation_transaction_failed",
        "Documentcontrole is tijdelijk niet beschikbaar.",
        "confirm_transaction",
        "nonterminal",
        "confirmation_transaction_failed",
        { file_status: postRpcState.fileStatus },
      );
    }

    return appErrorResponse(req, 500, "Documentcontrole is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  return appJsonResponse(req, 200, confirmed);
});
