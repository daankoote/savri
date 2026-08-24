import {
  deriveCustomerCorrectionResolutionRoute,
} from "../../supabase/functions/_shared/app_customer_correction_resolution.ts";
import {
  parseCorrectionChallengeRequest,
} from "../../supabase/functions/_shared/app_customer_correction_submission.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
const migration = read(
  "supabase/migrations/20260824100000_app_customer_correction_resolution_routing.sql",
);
const challengeEndpoint = read(
  "supabase/functions/api-app-customer-correction-signing-challenge/index.ts",
);
const finalizeEndpoint = read(
  "supabase/functions/api-app-customer-correction-signing-finalize/index.ts",
);
const panel = read(
  "app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx",
);
const workflowController = read(
  "app/src/features/documents/CustomerDocumentWorkflowController.ts",
);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const shaA = "a".repeat(64);
const shaB = "b".repeat(64);
const oneSource = deriveCustomerCorrectionResolutionRoute(
  "SOURCE_CONFIRMED",
  [{ contentSha256: shaA, normalizedValue: "waarde-a" }],
);
const equalSources = deriveCustomerCorrectionResolutionRoute(
  "SOURCE_CONFIRMED",
  [
    { contentSha256: shaA, normalizedValue: "waarde-a" },
    { contentSha256: shaB, normalizedValue: "waarde-a" },
  ],
);
const duplicateBytes = deriveCustomerCorrectionResolutionRoute(
  "SOURCE_CONFIRMED",
  [
    { contentSha256: shaA, normalizedValue: "waarde-a" },
    { contentSha256: shaA, normalizedValue: "waarde-a" },
  ],
);
const conflictSelected = deriveCustomerCorrectionResolutionRoute(
  "SOURCE_CONFLICT_SELECTED",
  [
    { contentSha256: shaA, normalizedValue: "waarde-a" },
    { contentSha256: shaB, normalizedValue: "waarde-b" },
  ],
);
const manualNoSource = deriveCustomerCorrectionResolutionRoute("MANUAL", []);
const manualConflict = deriveCustomerCorrectionResolutionRoute("MANUAL", [
  { contentSha256: shaA, normalizedValue: "waarde-a" },
  { contentSha256: shaB, normalizedValue: "waarde-b" },
]);

assert(
  oneSource?.resolutionType === "SOURCE_CONFIRMED" &&
    oneSource.evidenceStrength === "SINGLE_SOURCE" &&
    oneSource.requiresEnvalAttention === false,
  "one_source_confirmation_route_failed",
);
assert(
  equalSources?.evidenceStrength === "MULTI_SOURCE_MATCH" &&
    equalSources.requiresEnvalAttention === false,
  "equal_independent_source_strength_failed",
);
assert(
  duplicateBytes?.evidenceStrength === "SINGLE_SOURCE",
  "same_byte_duplicate_increased_strength",
);
assert(
  conflictSelected?.resolutionType === "SOURCE_CONFLICT_SELECTED" &&
    conflictSelected.evidenceStrength === "SOURCE_CONFLICT" &&
    conflictSelected.requiresEnvalAttention,
  "conflict_selection_route_failed",
);
assert(
  manualNoSource?.resolutionType === "MANUAL" &&
    manualNoSource.evidenceStrength === "NO_SOURCE" &&
    manualNoSource.requiresEnvalAttention &&
    manualConflict?.evidenceStrength === "SOURCE_CONFLICT" &&
    manualConflict.requiresEnvalAttention,
  "manual_route_strength_failed",
);
assert(
  oneSource?.downstreamVerificationBypassAllowed === false &&
    equalSources?.downstreamVerificationBypassAllowed === false,
  "source_strength_bypassed_downstream_verification",
);
assert(
  deriveCustomerCorrectionResolutionRoute("SOURCE_CONFIRMED", []) === null &&
    deriveCustomerCorrectionResolutionRoute(
        "SOURCE_CONFLICT_SELECTED",
        [{ contentSha256: shaA, normalizedValue: "waarde-a" }],
      ) === null,
  "invalid_route_strength_pair_accepted",
);

const itemRef = `CCI-${"A".repeat(32)}`;
const candidateRef = `CRC-${"B".repeat(32)}`;
const parsed = parseCorrectionChallengeRequest({
  caseRef: "CASE-AAAAAAAAAAAA",
  typedFullName: "Proof Person",
  responses: [{ itemRef, correctedValue: "Waarde A" }],
  factResolutions: [{
    itemRefs: [itemRef],
    resolutionType: "SOURCE_CONFIRMED",
    sources: [{ candidateRef, relationship: "direct", selected: false }],
  }],
});
assert(
  parsed?.factResolutions[0]?.resolutionType === "SOURCE_CONFIRMED" &&
    parseCorrectionChallengeRequest({
        caseRef: "CASE-AAAAAAAAAAAA",
        typedFullName: "Proof Person",
        responses: [{ itemRef, correctedValue: "Waarde A" }],
        factResolutions: [],
      }) === null,
  "signed_fact_resolution_contract_failed",
);

for (
  const required of [
    "app_customer_correction_fact_resolution_challenge_bindings",
    "app_evidence_review_customer_submission_fact_resolutions",
    "app_evidence_review_customer_submission_fact_resolution_sources",
    "submitted_fact_resolutions",
    "submitted_fact_resolutions_sha256",
    "customer_resolution_type",
    "evidence_strength",
    "independent_source_count",
    "distinct_normalized_value_count",
    "requires_enval_attention",
    "downstream_verification_bypass_allowed = false",
    "pg_catalog.count(distinct source.value->>'content_sha256')",
    "v_current_candidates->'targets'",
    "target.value->'item_refs' ? (item.value->>'item_ref')",
    "app_customer_correction_source_relationship_v1",
    "customer-correction-resolution-scope-v1",
    "context.location_id",
    "context.charger_id",
    "app_evidence_declaration_contexts",
    "v_scope_entity_count <> 1",
    "app_customer_correction_handoff_read_v5",
    "candidate.server_sha256",
    "observation.byte_sha256 = v_candidate.server_sha256",
    "fact.value->>'status' = 'observed'",
    "if not found then\n        continue;",
    "insert into public.app_evidence_review_customer_submission_fact_resolutions",
    "insert into public.app_evidence_review_customer_submission_fact_resolution_sources",
    "app_customer_correction_finalize_v2",
  ]
) {
  assert(
    migration.includes(required),
    `migration_contract_missing:${required}`,
  );
}

assert(
  !migration.includes("HUMAN_ACCEPTED") &&
    !migration.includes("'evidence_strength', v_resolution.value") &&
    migration.includes("never an internal or external review decision") &&
    challengeEndpoint.includes("app_customer_correction_challenge_issue_v4") &&
    finalizeEndpoint.includes("app_customer_correction_finalize_v3") &&
    panel.includes("createCustomerDocumentWorkflowGroup") &&
    panel.includes("resolutionType: resolved.resolutionType") &&
    !panel.includes("resolutionType: manuallyAdjusted") &&
    workflowController.includes("function resolvedType(") &&
    workflowController.includes('return "SOURCE_CONFIRMED"') &&
    workflowController.includes('return "SOURCE_CONFLICT_SELECTED"') &&
    workflowController.includes('return "MANUAL"'),
  "authority_or_ui_wiring_boundary_failed",
);

console.log("CUSTOMER04C3C10_Q01_Q12=PASS");
