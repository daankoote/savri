import type { AppRequestMeta } from "../../supabase/functions/_shared/app_foundation.ts";
import {
  parseCustomerCorrectionHandoffSource,
} from "../../supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
import {
  CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES,
  normalizeCorrectionReplacementConfirmRequest,
  normalizeCorrectionReplacementIssueRequest,
} from "../../supabase/functions/_shared/app_customer_correction_replacement.ts";
import {
  createHandler as createConfirmHandler,
} from "../../supabase/functions/api-app-customer-correction-upload-confirm/index.ts";
import {
  createHandler as createIssueHandler,
} from "../../supabase/functions/api-app-customer-correction-upload-url/index.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
const MIGRATION = read(
  "supabase/migrations/20260820220000_app_customer_correction_replacement_staging.sql",
);
const ISSUE_ENDPOINT = read(
  "supabase/functions/api-app-customer-correction-upload-url/index.ts",
);
const CONFIRM_ENDPOINT = read(
  "supabase/functions/api-app-customer-correction-upload-confirm/index.ts",
);
const PARSER_PERSISTENCE = read(
  "supabase/functions/_shared/app_parser_observation_persistence.ts",
);
const PARSER_CONTRACT = read(
  "platform/runtime/document-parsing/document_parser_contract.ts",
);

const CASE_REF = "CASE-000000000001";
const TARGET_REF = `CRT-${"A".repeat(32)}`;
const UPLOAD_REF = `CRU-${"B".repeat(32)}`;
const CANDIDATE_REF = `CRC-${"C".repeat(32)}`;
const AUTH_USER = "e2000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const META: AppRequestMeta = {
  request_id: "customer04c3b1-proof-request",
  idempotency_key: "customer04c3b1-proof-key",
  ip_hash: null,
  user_agent_hash: null,
  method: "POST",
  path: "/customer-correction-upload",
  url: "https://enval.local/customer-correction-upload",
  origin: null,
  timestamp: "2026-08-20T22:00:00.000Z",
  environment: "local",
};

function client(
  rpc: (
    name: string,
    args: JsonObject,
  ) => Promise<{ data?: unknown; error?: unknown }>,
): ServiceClient {
  return { auth: { getUser: async () => ({}) }, from: () => ({}), rpc };
}

function verified() {
  return Promise.resolve({
    ok: true as const,
    context: {
      authUserId: AUTH_USER,
      emailNormalized: "proof@example.invalid",
    },
  });
}

function request(body: unknown): Request {
  return new Request("https://enval.local/customer-correction-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function handoffItem(
  number: number,
  requirement:
    | "VALUE_CORRECTION"
    | "DOCUMENT_REPLACEMENT"
    | "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  target = TARGET_REF,
) {
  return {
    item_ref: `CCI-${number.toString(16).padStart(32, "0").toUpperCase()}`,
    document_label: "Energiedocument",
    fact_key: "energySupplier",
    fact_label: `Fact ${number}`,
    current_value: `Current ${number}`,
    correction_reason: "INCORRECT_INFORMATION",
    correction_reason_label: "Gegeven onjuist",
    correction_instruction: `Corrigeer item ${number}`,
    response_requirement: requirement,
    ...(requirement === "VALUE_CORRECTION" ? {} : {
      replacement_target: {
        replacement_target_ref: target,
        document_label: "Energiedocument",
        accepted_mime_types: ["application/pdf"],
        maximum_file_size: CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES,
      },
    }),
  };
}

function handoffSource(items: unknown[]) {
  return {
    ok: true,
    status: 200,
    code: "ok",
    case_ref: CASE_REF,
    handoff: {
      bundle_version: 4,
      cover_message: null,
      current_replacement_candidates: [],
      customer_publication_snapshot_sha256: null,
      fact_projections: [],
      handoff_ref: "CRH-0123456789ABCDEF",
      published_at: "2026-08-20T22:00:00.000Z",
      signer_authority: { status: "unavailable" },
      items,
    },
  };
}

function contractProof(): void {
  const issue = normalizeCorrectionReplacementIssueRequest({
    caseRef: CASE_REF,
    replacementTargetRef: TARGET_REF,
    fileName: "replacement.pdf",
    mimeType: "application/pdf",
    sizeBytes: 123,
  });
  assert(issue.ok && issue.value.sizeBytes === 123, "valid_issue_rejected");
  assert(
    !normalizeCorrectionReplacementIssueRequest({
      caseRef: CASE_REF,
      replacementTargetRef: TARGET_REF,
      fileName: "replacement.png",
      mimeType: "image/png",
      sizeBytes: 123,
    }).ok &&
      !normalizeCorrectionReplacementIssueRequest({
        caseRef: CASE_REF,
        replacementTargetRef: TARGET_REF,
        fileName: "replacement.pdf",
        mimeType: "application/pdf",
        sizeBytes: 123,
        storagePath: "browser/chosen.pdf",
      }).ok,
    "issue_input_not_fail_closed",
  );
  assert(
    normalizeCorrectionReplacementConfirmRequest({
      caseRef: CASE_REF,
      uploadRef: UPLOAD_REF,
    }).ok &&
      !normalizeCorrectionReplacementConfirmRequest({
        caseRef: CASE_REF,
        uploadRef: UPLOAD_REF,
        sha256: HASH,
      }).ok,
    "confirm_input_not_exact_or_server_authoritative",
  );

  const parsed = parseCustomerCorrectionHandoffSource(handoffSource([
    handoffItem(1, "VALUE_PLUS_DOCUMENT_REPLACEMENT"),
    handoffItem(2, "DOCUMENT_REPLACEMENT"),
    handoffItem(3, "VALUE_CORRECTION"),
  ]));
  assert(
    parsed?.handoff?.items[0].replacementTarget?.replacementTargetRef ===
        TARGET_REF &&
      parsed.handoff.items[1].replacementTarget?.replacementTargetRef ===
        TARGET_REF &&
      !("replacementTarget" in parsed.handoff.items[2]),
    "handoff_document_projection_invalid",
  );
  assert(
    !parseCustomerCorrectionHandoffSource(handoffSource([
      handoffItem(1, "VALUE_CORRECTION", TARGET_REF),
    ].map((item) => ({
      ...item,
      replacement_target: {
        replacement_target_ref: TARGET_REF,
        document_label: "Energiedocument",
        accepted_mime_types: ["application/pdf"],
        maximum_file_size: CORRECTION_REPLACEMENT_MAX_UPLOAD_BYTES,
      },
    })))),
    "value_only_target_not_denied",
  );
}

async function endpointProof(): Promise<void> {
  let issueName = "";
  let issueArgs: JsonObject = {};
  const issueHandler = createIssueHandler({
    createServiceClient: () =>
      client(async (name, args) => {
        issueName = name;
        issueArgs = args;
        return {
          data: {
            ok: true,
            status: 201,
            code: "upload_issued",
            upload_ref: UPLOAD_REF,
            replacement_target_ref: TARGET_REF,
            storage_bucket: "app-documents",
            storage_path: "customer-corrections/server-owned.pdf",
            expires_at: "2026-08-20T22:30:00.000Z",
          },
        };
      }),
    requestMeta: async () => META,
    hashPayload: async () => HASH,
    verifyBearer: verified,
    uploadExpiresAt: () => "2026-08-20T22:30:00.000Z",
    idempotencyExpiresAt: () => "2026-08-21T22:00:00.000Z",
    createSignedUpload: async (_client, bucket, path) => {
      assert(
        bucket === "app-documents" &&
          path === "customer-corrections/server-owned.pdf",
        "signed_upload_did_not_use_server_path",
      );
      return {
        signed_upload_url: "https://storage.local/signed",
        upload_token: "opaque-upload-token",
      };
    },
  });
  const issued = await issueHandler(request({
    caseRef: CASE_REF,
    replacementTargetRef: TARGET_REF,
    fileName: "replacement.pdf",
    mimeType: "application/pdf",
    sizeBytes: 123,
  }));
  const issuedBody = await issued.json();
  assert(
    issued.status === 201 && issuedBody.uploadRef === UPLOAD_REF &&
      issueName === "app_customer_correction_replacement_upload_issue_v2" &&
      issueArgs.p_auth_user_id === AUTH_USER &&
      issueArgs.p_replacement_target_ref === TARGET_REF &&
      !("storageBucket" in issuedBody) && !("storagePath" in issuedBody),
    "upload_issue_authority_or_safe_response_failed",
  );

  let confirmName = "";
  let confirmArgs: JsonObject = {};
  const confirmHandler = createConfirmHandler({
    createServiceClient: () =>
      client(async (name, args) => {
        if (name.endsWith("_resolve_v2")) {
          return {
            data: {
              ok: true,
              status: 200,
              upload_id: "f2000000-0000-4000-8000-000000000001",
              storage_bucket: "app-documents",
              storage_path: "customer-corrections/server-owned.pdf",
              original_filename: "replacement.pdf",
            },
          };
        }
        confirmName = name;
        confirmArgs = args;
        return {
          data: {
            ok: true,
            status: 201,
            code: "confirmed_staged",
            candidate_id: "f2000000-0000-4000-8000-000000000002",
            candidate_ref: CANDIDATE_REF,
            replacement_target_ref: TARGET_REF,
            parser_profile: "energy_document_v1",
            item_refs: [],
            fact_keys: [],
          },
        };
      }),
    requestMeta: async () => META,
    hashPayload: async () => HASH,
    verifyBearer: verified,
    downloadObject: async (_client, bucket, path) => {
      assert(
        bucket === "app-documents" &&
          path === "customer-corrections/server-owned.pdf",
        "confirm_did_not_resolve_server_path",
      );
      return {
        ok: false as const,
        failureCode: "object_missing" as const,
      };
    },
  });
  const confirmed = await confirmHandler(request({
    caseRef: CASE_REF,
    uploadRef: UPLOAD_REF,
  }));
  assert(
    confirmed.status === 200 &&
      confirmName ===
        "app_customer_correction_replacement_upload_confirm_v2" &&
      confirmArgs.p_actual_size_bytes === null &&
      confirmArgs.p_detected_mime_type === null &&
      confirmArgs.p_server_sha256 === null &&
      confirmArgs.p_failure_code === "object_missing" &&
      !("storage_path" in confirmArgs),
    "confirm_did_not_use_server_observation",
  );
}

function architectureProof(): void {
  for (
    const required of [
      "app_customer_correction_replacement_uploads",
      "app_customer_correction_replacement_candidates",
      "app_customer_correction_replacement_targets_v1",
      "app_customer_correction_replacement_authority_v1",
      "app_customer_correction_replacement_upload_issue_v1",
      "app_customer_correction_replacement_upload_resolve_v1",
      "app_customer_correction_replacement_upload_confirm_v1",
      "app_customer_correction_replacement_resolution_v1",
      "correction_replacement_candidate",
      "app_customer_correction_immutable_guard_v1",
      "storage_bucket = 'app-documents'",
      "storage_path like 'customer-corrections/%'",
      "detected_mime_type = 'application/pdf'",
      "predecessor_evidence_file_id",
      "predecessor_evidence_version_id",
      "customer_correction_replacement_confirm:v1:upload:",
      "for update",
      "confirmed_bytes_changed",
      "correction_handoff_not_current",
      "predecessor_evidence_not_current",
      "all_required_candidates_confirmed",
    ]
  ) assert(MIGRATION.includes(required), `migration_missing:${required}`);
  assert(
    MIGRATION.includes("group by document.evidence_file_ref") &&
      MIGRATION.includes("document.evidence_version_ref") &&
      MIGRATION.includes("pg_catalog.jsonb_agg(") &&
      MIGRATION.includes("'item_refs', grouped.item_refs") &&
      MIGRATION.includes("'fact_keys', grouped.fact_keys"),
    "server_document_grouping_missing",
  );
  assert(
    MIGRATION.includes(
      "create trigger trg_app_customer_correction_replacement_uploads_immutable",
    ) &&
      MIGRATION.includes(
        "create trigger trg_app_customer_correction_replacement_candidates_immutable",
      ) &&
      MIGRATION.includes("create policy deny_all") &&
      !MIGRATION.includes("insert into public.app_evidence_versions") &&
      !MIGRATION.includes("update public.app_evidence_versions") &&
      !MIGRATION.includes(
        "update public.app_evidence_review_correction_handoffs",
      ) &&
      !MIGRATION.includes("update public.app_evidence_review_rounds") &&
      !MIGRATION.includes(
        "update public.app_evidence_review_round_subject_decisions",
      ),
    "staging_not_immutable_or_core_truth_mutated",
  );
  assert(
    ISSUE_ENDPOINT.includes("createCorrectionReplacementSignedUpload") &&
      CONFIRM_ENDPOINT.includes("downloadCorrectionReplacementObject") &&
      CONFIRM_ENDPOINT.includes("createDocumentParserPort") &&
      CONFIRM_ENDPOINT.includes("CURRENT_PDF_PARSER_ADAPTER") &&
      CONFIRM_ENDPOINT.includes("getDocumentParserProfile") &&
      CONFIRM_ENDPOINT.includes("persistParserObservation") &&
      CONFIRM_ENDPOINT.includes("projectCustomerSafeReplacementObservation") &&
      !CONFIRM_ENDPOINT.includes("app_evidence_versions") &&
      !CONFIRM_ENDPOINT.includes("finalize"),
    "shared_upload_parser_or_pre_finalize_boundary_missing",
  );
  assert(
    PARSER_CONTRACT.includes('kind: "correction_replacement_candidate"') &&
      PARSER_PERSISTENCE.includes(
        '"app_customer_correction_replacement_candidates"',
      ) &&
      PARSER_PERSISTENCE.includes("server_sha256") &&
      PARSER_PERSISTENCE.includes("executionIdentitySha256") &&
      PARSER_PERSISTENCE.includes("findPersistedParserObservation"),
    "candidate_parser_provenance_missing",
  );
}

contractProof();
await endpointProof();
architectureProof();

console.log("CUSTOMER04C3B1_PURE_Q01_Q24=PASS");
