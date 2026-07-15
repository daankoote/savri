// supabase/functions/api-app-document-download-url/index.ts
//
// Customer-safe current document download URL endpoint for the new /app portal.
// Frontend may assist; backend decides.

import { serve } from "jsr:@std/http@0.224.0/server";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  insertAppAuditFailOpen,
} from "../_shared/app_foundation.ts";
import {
  requireAppCustomer,
  requireAppDossierAccess,
  type AppCustomerAuthContext,
} from "../_shared/app_customer_auth.ts";

type DownloadPayload = {
  dossier_id?: unknown;
  document_slot_id?: unknown;
};

type NormalizedDownloadPayload = {
  dossier_id: string;
  document_slot_id: string;
};

type NormalizationError = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

const MODE = "document_download_url_v1";
const SIGNED_DOWNLOAD_TTL_SECONDS = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function appSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

async function parseJsonBody(
  req: Request,
): Promise<{ ok: true; body: DownloadPayload } | { ok: false }> {
  try {
    const body = await req.json();
    if (!isRecord(body)) return { ok: false };
    return { ok: true, body: body as DownloadPayload };
  } catch (_e) {
    return { ok: false };
  }
}

function normalizePayload(body: DownloadPayload): { ok: true; payload: NormalizedDownloadPayload } | NormalizationError {
  const keys = Object.keys(body);
  if (keys.length !== 2 || !keys.includes("dossier_id") || !keys.includes("document_slot_id")) {
    return {
      ok: false,
      status: 400,
      code: "invalid_body",
      message: "Controleer de aanvraag.",
    };
  }

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

  return { ok: true, payload: { dossier_id, document_slot_id } };
}

async function auditScopedReject(
  SB: any,
  meta: Awaited<ReturnType<typeof getAppRequestMeta>>,
  authContext: AppCustomerAuthContext | null,
  payload: NormalizedDownloadPayload | null,
  reason: string,
  stage: string,
) {
  if (!authContext) return;

  await insertAppAuditFailOpen(SB, {
    event_type: "document_download_url_rejected",
    scope_type: "document",
    scope_id: payload?.document_slot_id ?? null,
    customer_id: authContext.customerId,
    dossier_id: payload?.dossier_id ?? null,
    actor_type: "customer",
    actor_ref: authContext.actorRef,
    event_data: {
      stage,
      reason,
    },
  }, meta);
}

function safeNotFound(req: Request) {
  return appErrorResponse(req, 404, "Document niet gevonden.", "document_not_found_or_forbidden");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);

  const meta = await getAppRequestMeta(req);

  if (req.method !== "POST") {
    return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  }

  const parsed = await parseJsonBody(req);
  if (!parsed.ok) {
    return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  }

  const normalized = normalizePayload(parsed.body);
  if (!normalized.ok) {
    return appErrorResponse(req, normalized.status, normalized.message, normalized.code);
  }

  const SB = appSupabaseClient();
  if (!SB) {
    return appErrorResponse(req, 503, "Documentdownload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const authResult = await requireAppCustomer(req, SB);
  if (!authResult.ok) {
    return appErrorResponse(req, authResult.status, authResult.message, authResult.code);
  }

  const payload = normalized.payload;
  const accessResult = await requireAppDossierAccess(SB, authResult.context, payload.dossier_id);
  if (!accessResult.ok) {
    await auditScopedReject(SB, meta, authResult.context, payload, accessResult.code, "dossier_access");
    return safeNotFound(req);
  }

  const { data: slot, error: slotError } = await SB
    .from("app_dossier_document_slots")
    .select("id,dossier_id,current_version_id,current_version_number")
    .eq("id", payload.document_slot_id)
    .maybeSingle();

  if (slotError || !slot?.id || String(slot.dossier_id) !== payload.dossier_id || !slot.current_version_id) {
    await auditScopedReject(SB, meta, authResult.context, payload, "document_not_found_or_forbidden", "slot_lookup");
    return safeNotFound(req);
  }

  const { data: version, error: versionError } = await SB
    .from("app_dossier_document_versions")
    .select("id,document_file_id,status")
    .eq("id", String(slot.current_version_id))
    .eq("document_slot_id", payload.document_slot_id)
    .eq("dossier_id", payload.dossier_id)
    .maybeSingle();

  if (versionError || !version?.id || version.status !== "current") {
    await auditScopedReject(SB, meta, authResult.context, payload, "document_not_found_or_forbidden", "version_lookup");
    return safeNotFound(req);
  }

  const { data: file, error: fileError } = await SB
    .from("app_dossier_document_files")
    .select("id,status,storage_bucket,storage_path,original_file_name,normalized_file_name")
    .eq("id", String(version.document_file_id))
    .eq("document_slot_id", payload.document_slot_id)
    .eq("dossier_id", payload.dossier_id)
    .maybeSingle();

  if (fileError || !file?.id || file.status !== "confirmed") {
    await auditScopedReject(SB, meta, authResult.context, payload, "document_not_found_or_forbidden", "file_lookup");
    return safeNotFound(req);
  }

  const { data: signed, error: signedError } = await SB.storage
    .from(String(file.storage_bucket))
    .createSignedUrl(String(file.storage_path), SIGNED_DOWNLOAD_TTL_SECONDS);

  if (signedError || !signed?.signedUrl) {
    await auditScopedReject(SB, meta, authResult.context, payload, "signed_url_failed", "storage");
    return appErrorResponse(req, 503, "Documentdownload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  const safeFileName = getString(file.original_file_name) || getString(file.normalized_file_name) || "document.pdf";
  const expiresAt = new Date(Date.now() + SIGNED_DOWNLOAD_TTL_SECONDS * 1000).toISOString();

  return appJsonResponse(req, 200, {
    ok: true,
    mode: MODE,
    request_id: meta.request_id,
    file_name: safeFileName,
    signed_url: signed.signedUrl,
    expires_in: SIGNED_DOWNLOAD_TTL_SECONDS,
    expires_at: expiresAt,
  });
});
