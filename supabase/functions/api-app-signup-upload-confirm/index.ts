import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import {
  capabilityHash,
  downloadSignupObject,
  isRecord,
  parseRecordBody,
  publicRpcBody,
  signupServiceClient,
  stringField,
  UUID_RE,
} from "../_shared/signup_quarantine.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);
  if (req.method !== "POST") return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  const meta = await getAppRequestMeta(req);
  if (!meta.idempotency_key) return appErrorResponse(req, 400, "Aanvraagcode ontbreekt.", "missing_idempotency_key");
  const body = await parseRecordBody(req);
  if (!body) return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");
  const intakeId = stringField(body, "intake_reference").toLowerCase();
  const fileId = stringField(body, "file_reference").toLowerCase();
  const uploadCapability = stringField(body, "quarantine_upload_capability");
  if (!UUID_RE.test(intakeId) || !UUID_RE.test(fileId) || !uploadCapability) {
    return appErrorResponse(req, 400, "Controleer de upload.", "invalid_upload_request");
  }
  const normalized = { intake_reference: intakeId, file_reference: fileId };
  const normalizedPayloadHash = await payloadHash(normalized);
  const SB = signupServiceClient();
  if (!SB) return appErrorResponse(req, 503, "Uploadcontrole is tijdelijk niet beschikbaar.", "service_unavailable");

  const fileResult = await SB.from("app_signup_intake_files")
    .select("id,intake_id,storage_bucket,storage_path")
    .eq("id", fileId).eq("intake_id", intakeId).maybeSingle();
  if (fileResult.error || !isRecord(fileResult.data)) {
    return appErrorResponse(req, 404, "Upload is niet gevonden.", "upload_not_found");
  }
  const bucket = stringField(fileResult.data, "storage_bucket");
  const path = stringField(fileResult.data, "storage_path");
  const verification = await downloadSignupObject(SB, bucket, path);
  const uploadTokenSha256 = await capabilityHash(uploadCapability);
  const { data, error } = await SB.rpc("app_signup_quarantine_confirm_v1", {
    p_intake_id: intakeId,
    p_file_id: fileId,
    p_upload_token_sha256: uploadTokenSha256,
    p_actual_size_bytes: verification.ok ? verification.sizeBytes : null,
    p_detected_mime_type: verification.ok ? verification.detectedMimeType : null,
    p_server_sha256: verification.ok ? verification.serverSha256 : null,
    p_failure_code: verification.ok ? null : verification.failureCode,
    p_payload_hash: normalizedPayloadHash,
    p_request_id: meta.request_id,
    p_idempotency_key: meta.idempotency_key,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });
  if (error) return appErrorResponse(req, 403, "Upload kan niet worden bevestigd.", "upload_not_available");
  const rpc = publicRpcBody(data);
  return rpc
    ? appJsonResponse(req, rpc.status, rpc.body)
    : appErrorResponse(req, 503, "Uploadcontrole is tijdelijk niet beschikbaar.", "service_unavailable");
});
