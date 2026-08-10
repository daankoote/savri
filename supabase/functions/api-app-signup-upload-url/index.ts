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
  configuredMinutes,
  createSignupSignedUpload,
  deriveCapabilityToken,
  isRecord,
  minutesFromNow,
  parseRecordBody,
  publicRpcBody,
  sanitizeFilename,
  SHA256_RE,
  SIGNUP_MAX_UPLOAD_BYTES,
  signupServiceClient,
  SignupCapabilityConfigurationError,
  stringField,
  UUID_RE,
} from "../_shared/signup_quarantine.ts";

const DOCUMENT_TYPES = new Set(["organization_extract", "energy_bill_or_contract", "installation_invoice"]);

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);
  if (req.method !== "POST") return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  const meta = await getAppRequestMeta(req);
  if (!meta.idempotency_key) return appErrorResponse(req, 400, "Aanvraagcode ontbreekt.", "missing_idempotency_key");
  const body = await parseRecordBody(req);
  if (!body) return appErrorResponse(req, 400, "Controleer de aanvraag.", "invalid_json");

  const operation = stringField(body, "operation") || "issue";
  const intakeId = stringField(body, "intake_reference").toLowerCase();
  const manageCapability = stringField(body, "management_capability");
  const clientSlotId = stringField(body, "client_slot_id");
  if (!UUID_RE.test(intakeId) || !manageCapability || !clientSlotId || clientSlotId.length > 200) {
    return appErrorResponse(req, 400, "Controleer de upload.", "invalid_upload_request");
  }
  const SB = signupServiceClient();
  if (!SB) return appErrorResponse(req, 503, "Upload is tijdelijk niet beschikbaar.", "service_unavailable");
  const manageTokenSha256 = await capabilityHash(manageCapability);

  if (operation === "remove") {
    const normalized = { operation, intake_reference: intakeId, client_slot_id: clientSlotId };
    const normalizedPayloadHash = await payloadHash(normalized);
    const { data, error } = await SB.rpc("app_signup_quarantine_remove_v1", {
      p_intake_id: intakeId,
      p_manage_token_sha256: manageTokenSha256,
      p_client_slot_id: clientSlotId,
      p_payload_hash: normalizedPayloadHash,
      p_request_id: meta.request_id,
      p_idempotency_key: meta.idempotency_key,
      p_ip_hash: meta.ip_hash,
      p_user_agent_hash: meta.user_agent_hash,
      p_environment: meta.environment,
    });
    if (error) return appErrorResponse(req, 403, "Upload kan niet worden gewijzigd.", "upload_not_available");
    const rpc = publicRpcBody(data);
    return rpc
      ? appJsonResponse(req, rpc.status, rpc.body)
      : appErrorResponse(req, 503, "Upload is tijdelijk niet beschikbaar.", "service_unavailable");
  }

  if (operation !== "issue") return appErrorResponse(req, 400, "Controleer de upload.", "invalid_upload_request");
  const documentType = stringField(body, "document_type");
  const fileName = sanitizeFilename(stringField(body, "file_name"));
  const mimeType = stringField(body, "mime_type").toLowerCase();
  const sizeBytes = Number(body.size_bytes);
  const clientSha256 = stringField(body, "client_sha256").toLowerCase();
  if (!DOCUMENT_TYPES.has(documentType) || !fileName || mimeType !== "application/pdf" ||
    !Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > SIGNUP_MAX_UPLOAD_BYTES ||
    !SHA256_RE.test(clientSha256)) {
    return appErrorResponse(req, 400, "Controleer het PDF-bestand.", "invalid_file_metadata");
  }

  const normalized = {
    operation,
    intake_reference: intakeId,
    client_slot_id: clientSlotId,
    document_type: documentType,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    client_sha256: clientSha256,
  };
  const normalizedPayloadHash = await payloadHash(normalized);
  let rawUploadCapability: string;
  try {
    rawUploadCapability = await deriveCapabilityToken(
      "quarantine_upload",
      meta.idempotency_key,
      normalizedPayloadHash,
    );
  } catch (error) {
    if (error instanceof SignupCapabilityConfigurationError) {
      return appErrorResponse(req, 503, "Upload is tijdelijk niet beschikbaar.", "service_unavailable");
    }
    throw error;
  }
  const uploadTokenSha256 = await capabilityHash(rawUploadCapability);
  const fileTtlMinutes = configuredMinutes("APP_SIGNUP_FILE_TTL_MINUTES", 120, 10, 1440);
  const capabilityTtlMinutes = configuredMinutes("APP_SIGNUP_UPLOAD_CAPABILITY_TTL_MINUTES", 30, 10, fileTtlMinutes);
  const { data, error } = await SB.rpc("app_signup_quarantine_issue_v1", {
    p_intake_id: intakeId,
    p_manage_token_sha256: manageTokenSha256,
    p_client_slot_id: clientSlotId,
    p_document_type: documentType,
    p_original_filename: fileName,
    p_declared_mime_type: mimeType,
    p_size_bytes: sizeBytes,
    p_client_sha256: clientSha256,
    p_payload_hash: normalizedPayloadHash,
    p_upload_token_sha256: uploadTokenSha256,
    p_file_expires_at: minutesFromNow(fileTtlMinutes),
    p_capability_expires_at: minutesFromNow(capabilityTtlMinutes),
    p_request_id: meta.request_id,
    p_idempotency_key: meta.idempotency_key,
    p_ip_hash: meta.ip_hash,
    p_user_agent_hash: meta.user_agent_hash,
    p_environment: meta.environment,
  });
  if (error) return appErrorResponse(req, 403, "Upload kan niet worden voorbereid.", "upload_not_available");
  const rpc = publicRpcBody(data);
  if (!rpc) return appErrorResponse(req, 503, "Upload is tijdelijk niet beschikbaar.", "service_unavailable");
  if (rpc.body.ok !== true) return appJsonResponse(req, rpc.status, rpc.body);
  if (!isRecord(rpc.body)) return appErrorResponse(req, 503, "Upload is tijdelijk niet beschikbaar.", "service_unavailable");
  const bucket = stringField(rpc.body, "storage_bucket");
  const path = stringField(rpc.body, "storage_path");
  const signed = await createSignupSignedUpload(SB, bucket, path);
  if (!signed) return appErrorResponse(req, 503, "Upload is tijdelijk niet beschikbaar.", "service_unavailable");
  return appJsonResponse(req, rpc.status, {
    ...rpc.body,
    ...signed,
    quarantine_upload_capability: rawUploadCapability,
    max_size_bytes: SIGNUP_MAX_UPLOAD_BYTES,
  });
});
