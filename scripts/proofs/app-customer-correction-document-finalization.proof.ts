import {
  CUSTOMER_CORRECTION_RUNTIME_ACTIONS,
  isRuntimeCorrectionAction,
  parseCorrectionChallengeRequest,
} from "../../supabase/functions/_shared/app_customer_correction_submission.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
const migration = read(
  "supabase/migrations/20260821100000_app_customer_correction_document_finalization.sql",
);
const challengeEndpoint = read(
  "supabase/functions/api-app-customer-correction-signing-challenge/index.ts",
);
const finalizeEndpoint = read(
  "supabase/functions/api-app-customer-correction-signing-finalize/index.ts",
);
const confirmEndpoint = read(
  "supabase/functions/api-app-customer-correction-upload-confirm/index.ts",
);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const CASE_REF = "CASE-AAAAAAAAAAAA";
const ITEM_REF = `CCI-${"A".repeat(32)}`;
const CANDIDATE_REF = `CRC-${"B".repeat(32)}`;

assert(
  parseCorrectionChallengeRequest({
        caseRef: CASE_REF,
        typedFullName: "Proof Person",
        responses: [{
          itemRef: ITEM_REF,
          replacementCandidateRef: CANDIDATE_REF,
        }],
      }) !== null &&
    parseCorrectionChallengeRequest({
        caseRef: CASE_REF,
        typedFullName: "Proof Person",
        responses: [{
          itemRef: ITEM_REF,
          correctedValue: "Manual customer resolution",
          replacementCandidateRef: CANDIDATE_REF,
        }],
      }) !== null &&
    parseCorrectionChallengeRequest({
        caseRef: CASE_REF,
        typedFullName: "Proof Person",
        responses: [{
          itemRef: ITEM_REF,
          replacementCandidateRef: CANDIDATE_REF,
          storagePath: "browser-authority.pdf",
        }],
      }) === null,
  "closed_document_response_contract_failed",
);
assert(
  CUSTOMER_CORRECTION_RUNTIME_ACTIONS.join("|") ===
      "VALUE_CORRECTION|MISSING_VALUE|DOCUMENT_REPLACEMENT|VALUE_PLUS_DOCUMENT_REPLACEMENT" &&
    isRuntimeCorrectionAction("DOCUMENT_REPLACEMENT") &&
    isRuntimeCorrectionAction("VALUE_PLUS_DOCUMENT_REPLACEMENT"),
  "runtime_action_set_not_complete",
);

for (
  const required of [
    "create table public.app_evidence_review_customer_submission_replacements",
    "correction_replacement_candidate_id uuid",
    "app_evidence_versions_source_xor_chk",
    "app_evidence_versions_candidate_key",
    "unique (submission_id, replacement_target_ref)",
    "replacement_candidate_id uuid not null unique",
    "resulting_evidence_version_id uuid not null unique",
    "app_customer_correction_replacement_resolution_v1",
    "candidate.candidate_reference = target.value->>'candidate_ref'",
    "parser.envelope->'evidenceSource'->>'replacementCandidateId'",
    "parser.byte_sha256 =",
    "item.value->>'replacement_content_sha256'",
    "select distinct on (item.value->>'replacement_target_ref')",
    "insert into public.app_evidence_versions",
    "correction_replacement_candidate_id, storage_bucket, storage_path",
    "insert into public.app_signup_signing_snapshots",
    "insert into public.app_signup_signature_evidence",
    "insert into public.app_evidence_review_customer_submissions",
    "insert into public.app_evidence_review_customer_submission_replacements",
    "insert into public.app_evidence_review_customer_submission_items",
    "public.app_evidence_fact_review_manifest_v1",
    "insert into public.app_evidence_review_decision_carry_forwards",
    "current_subject.item->>'evidence_version_id' =",
    "decision.evidence_version_id::text",
    "and not exists (",
    "set consumed_at = v_now",
    "prepared_payload_sha256",
    "replacement_set_sha256",
    "snapshot_draft_sha256",
    "v_fresh := public.app_customer_correction_prepare_v2",
    "stale_correction_context",
    "signer_authority_changed",
    "CUSTOMER04C3B2_AFTER_SUBMISSION_HEADER",
    "CUSTOMER04C3B2_AFTER_FIRST_PROMOTION",
    "CUSTOMER04C3B2_AFTER_SNAPSHOT",
    "CUSTOMER04C3B2_BEFORE_MANIFEST",
    "exception when unique_violation",
    "overall_review_status', 'TO_REVIEW'",
    "enable row level security",
  ]
) {
  assert(
    migration.includes(required),
    `migration_contract_missing:${required}`,
  );
}

assert(
  !migration.includes("consumed boolean") &&
    !migration.includes("promoted boolean") &&
    !migration.includes("DOCUMENT_PARSER.parse") &&
    !migration.includes("storage.objects") &&
    !migration.includes("HUMAN_ACCEPTED") &&
    challengeEndpoint.includes("app_customer_correction_challenge_issue_v3") &&
    finalizeEndpoint.includes("app_customer_correction_finalize_v2") &&
    confirmEndpoint.includes("DOCUMENT_PARSER.parse") &&
    confirmEndpoint.includes("persistParserObservation"),
  "reuse_or_authority_boundary_failed",
);

console.log("CUSTOMER04C3B2_Q01_Q24=PASS");
