import { serve } from "jsr:@std/http@0.224.0/server";

import {
  appErrorResponse,
  appJsonResponse,
  appOptionsResponse,
  getAppRequestMeta,
  payloadHash,
} from "../_shared/app_foundation.ts";
import { CURRENT_PDF_PARSER_ADAPTER } from "../_shared/app_document_parser_pdf_adapter.ts";
import {
  findPersistedParserObservation,
  persistParserObservation,
} from "../_shared/app_parser_observation_persistence.ts";
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
import {
  buildParserExecutionIdentity,
  createDocumentParserPort,
} from "../../../platform/runtime/document-parsing/document_parser_core.ts";
import { getDocumentParserProfile } from "../../../platform/runtime/document-parsing/document_parser_profiles.ts";

const ENERGY_PROFILE = getDocumentParserProfile("energy_document_v1");
const DOCUMENT_PARSER = createDocumentParserPort(
  CURRENT_PDF_PARSER_ADAPTER,
  payloadHash,
);

serve(async (req) => {
  if (req.method === "OPTIONS") return appOptionsResponse(req);
  if (req.method !== "POST") return appErrorResponse(req, 405, "Methode niet toegestaan.", "method_not_allowed");
  const meta = await getAppRequestMeta(req);
  if (meta instanceof Response) return meta;
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
    .select("id,intake_id,storage_bucket,storage_path,document_type,revision_number")
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
  if (
    rpc && rpc.status === 200 && rpc.body.ok === true && verification.ok &&
    stringField(fileResult.data, "document_type") === "energy_bill_or_contract"
  ) {
    try {
      const revisionNumber = Number(fileResult.data.revision_number);
      const source = {
        kind: "signup_intake_file" as const,
        signupIntakeFileRef: fileId,
        revisionNumber,
        evidenceVersionRef:
          `signup_intake_file:${fileId}:revision:${revisionNumber}`,
      };
      const executionIdentitySha256 = await buildParserExecutionIdentity(
        payloadHash,
        {
          source,
          byteSha256: verification.serverSha256,
          profile: ENERGY_PROFILE.key,
          profileVersion: ENERGY_PROFILE.version,
          provider: CURRENT_PDF_PARSER_ADAPTER,
        },
      );
      let observation = await findPersistedParserObservation(
        SB,
        executionIdentitySha256,
      );
      if (!observation) {
        const parsed = await DOCUMENT_PARSER.parse(
          new Uint8Array(verification.bytes),
          ENERGY_PROFILE.key,
          {
            provenanceAuthority: "trusted_server",
            observationRef: crypto.randomUUID(),
            source,
            byteSha256: verification.serverSha256,
            serverObservedAt: meta.timestamp,
          },
        );
        observation = await persistParserObservation(SB, parsed) || parsed;
      }
      rpc.body.parser_observation = observation;
    } catch (_error) {
      // Parsing is observational. A valid immutable upload remains valid when
      // the parser runtime or observation persistence is unavailable.
      rpc.body.parser_observation = null;
    }
  }
  return rpc
    ? appJsonResponse(req, rpc.status, rpc.body)
    : appErrorResponse(req, 503, "Uploadcontrole is tijdelijk niet beschikbaar.", "service_unavailable");
});
