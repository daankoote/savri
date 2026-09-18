import {
  parseCustomerCorrectionHandoffSource,
} from "../../supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
import {
  decodeCustomerCorrectionHandoffResponse,
} from "../../app/src/features/dashboard/customerCorrectionHandoffClient.ts";

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const [
  migration,
  subjectRefMigration,
  terminalProjectionMigration,
  terminalFactProjectionMigration,
  terminalFactProjectionBindingFixMigration,
  publish,
  supersede,
  handoff,
  handoffParser,
  resolution,
  panel,
  interaction,
  servedFixture,
] = await Promise.all([
  Deno.readTextFile(
    "supabase/migrations/20260917104334_document_driven_customer_correction_v1.sql",
  ),
  Deno.readTextFile(
    "supabase/migrations/20260917134619_document_driven_subject_ref_evidence_binding_v1.sql",
  ),
  Deno.readTextFile(
    "supabase/migrations/20260917180214_customer_correction_terminal_projection_null_v1.sql",
  ),
  Deno.readTextFile(
    "supabase/migrations/20260918073504_customer_correction_terminal_fact_projection_v1.sql",
  ),
  Deno.readTextFile(
    "supabase/migrations/20260918081541_customer_correction_terminal_fact_projection_customer_binding_fix_v1.sql",
  ),
  Deno.readTextFile(
    "supabase/functions/api-app-evidence-review-correction-publish/index.ts",
  ),
  Deno.readTextFile(
    "supabase/functions/api-app-evidence-review-correction-supersede/index.ts",
  ),
  Deno.readTextFile(
    "supabase/functions/api-app-customer-correction-handoff/index.ts",
  ),
  Deno.readTextFile(
    "supabase/functions/_shared/app_evidence_review_correction_handoff.ts",
  ),
  Deno.readTextFile(
    "supabase/functions/_shared/app_customer_correction_resolution.ts",
  ),
  Deno.readTextFile(
    "app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx",
  ),
  Deno.readTextFile(
    "app/src/features/documents/CustomerDocumentFactInteraction.tsx",
  ),
  Deno.readTextFile(
    "scripts/proofs/app-evidence-fact-review-round-served.proof.mjs",
  ),
]);

for (
  const fact of [
    "partyName",
    "structuredAddress",
    "electricityEan",
    "energySupplier",
    "chargerBrand",
    "chargerModel",
    "midNumber",
    "serialNumber",
  ]
) {
  assert(migration.includes(`'${fact}'`), `fact_missing:${fact}`);
}
assert(
  migration.includes("energy_document_v1") &&
    migration.includes("installation_invoice_v1"),
  "parser_contract_missing",
);
assert(
  migration.includes("VALUE_PLUS_DOCUMENT_REPLACEMENT") &&
    migration.includes("DOCUMENT_TRANSCRIPTION"),
  "document_routes_missing",
);
assert(
  migration.includes("transcription_allowed") &&
    migration.includes("direct_count <> 1"),
  "transcription_guard_missing",
);
assert(
  migration.includes("value_status' <> 'PRESENT'") &&
    migration.includes("then 'Nog te beoordelen'"),
  "status_guard_missing",
);
assert(
  migration.includes(
    "create trigger trg_app_customer_submission_item_subject_ref",
  ) &&
    subjectRefMigration.includes(
      "app_evidence_fact_review_manifest_v1(v_submission.case_id)",
    ) &&
    subjectRefMigration.includes(
      "select subject.item->>'subject_ref' into strict new.resulting_subject_ref",
    ) &&
    subjectRefMigration.includes(
      "join public.app_evidence_versions evidence_version",
    ) &&
    subjectRefMigration.includes(
      "evidence_version.id = new.evidence_version_id",
    ) &&
    subjectRefMigration.includes(
      "evidence_version.evidence_file_id = new.evidence_file_id",
    ) &&
    subjectRefMigration.includes(
      "evidence_version.sha256 = new.evidence_sha256",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'signing_snapshot_id' =",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'evidence_file_id' = new.evidence_file_id::text",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'evidence_version_id' = new.evidence_version_id::text",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'fact_id' = new.fact_id",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'fact_key' = new.fact_key",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'scope_ref' = new.scope_ref",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'value_sha256' = new.resulting_value_sha256",
    ) &&
    subjectRefMigration.includes(
      "subject.item->>'value_status' = 'PRESENT'",
    ) &&
    !subjectRefMigration.includes(
      "subject.item->>'evidence_sha256' = new.evidence_sha256",
    ),
  "resulting_subject_ref_not_snapshot_authoritative",
);
assert(
  migration.includes("app_customer_correction_challenge_issue_v1(") &&
    migration.includes("app_customer_correction_finalize_v3(") &&
    migration.includes("from service_role"),
  "old_execute_not_revoked",
);
assert(
  migration.includes("'{handoff,bundle_version}' <>") &&
    migration.includes("'evidence-review-correction-handoff-bundle-v4'") &&
    migration.includes("v_read #> '{handoff,items}'"),
  "document_handoff_guard_not_bound_to_v4_items",
);
assert(
  migration.includes("'fact_ref', 'CFR-'") &&
    migration.includes("'source_ref', 'CES-'") &&
    migration.includes("'replacement_target_ref',") &&
    handoffParser.includes("/^CFR-[A-F0-9]{32}$/") &&
    handoffParser.includes("/^CES-[A-F0-9]{32}$/") &&
    handoffParser.includes("/^CRT-[A-F0-9]{32}$/"),
  "safe_fact_projection_contract_mismatch",
);
assert(
  migration.includes("having pg_catalog.count(*) = 1") &&
    migration.includes("pg_catalog.bool_and(pg_catalog.lower("),
  "ambiguous_direct_source_could_be_accepted",
);
assert(
  terminalProjectionMigration.includes(
    "pg_catalog.jsonb_typeof(v_read->'handoff') = 'null'",
  ) &&
    terminalProjectionMigration.includes(
      "v_read->'ok' is distinct from 'true'::jsonb",
    ) &&
    terminalProjectionMigration.includes(
      "(v_read - 'ok' - 'status' - 'code' - 'case_ref' - 'handoff') =",
    ) &&
    terminalProjectionMigration.includes(
      "pg_catalog.jsonb_typeof(v_read->'handoff') <> 'object'",
    ) &&
    terminalProjectionMigration.includes(
      "'code', 'correction_handoff_reconstruction_failed'",
    ),
  "terminal_json_null_projection_guard_missing",
);
assert(
  terminalProjectionMigration.includes(
    "from public, anon, authenticated, service_role;",
  ) &&
    !terminalProjectionMigration.includes(
      "grant execute on function public.app_customer_correction_safe_projection_v1",
    ),
  "private_projection_privilege_changed",
);
assert(
  terminalFactProjectionMigration.includes(
    "create function public.app_customer_correction_safe_projection_v2",
  ) &&
    terminalFactProjectionMigration.includes(
      "create function public.app_customer_correction_handoff_read_v8",
    ) &&
    terminalFactProjectionMigration.includes(
      "public.app_evidence_fact_review_manifest_v1(v_case_id)",
    ) &&
    terminalFactProjectionMigration.includes(
      "round_row.manifest_hash = v_manifest->>'manifest_hash'",
    ) &&
    terminalFactProjectionMigration.includes(
      "round_row.outcome = 'ALL_FACTS_ACCEPTED'",
    ) &&
    terminalFactProjectionMigration.includes(
      "decision.disposition = 'ACCEPTED'",
    ) &&
    terminalFactProjectionMigration.includes(
      "subject.item->>'evidence_kind' =",
    ) &&
    terminalFactProjectionMigration.includes(
      "subject.primary_document->>'document_type'",
    ) &&
    terminalFactProjectionMigration.includes("and source_valid.valid") &&
    terminalFactProjectionMigration.includes(
      "evidence_version.sha256 = observation.byte_sha256",
    ) &&
    terminalFactProjectionMigration.includes(
      "subject.primary_document->>'parser_profile'",
    ) &&
    terminalFactProjectionMigration.includes(
      "public.app_customer_correction_source_relationship_v2(",
    ) &&
    terminalFactProjectionMigration.includes(
      "select pg_catalog.count(*) = 1",
    ) &&
    !terminalFactProjectionMigration.includes("group by observation.id") &&
    terminalFactProjectionMigration.includes(
      "when source_valid.valid then 'direct'",
    ) &&
    terminalFactProjectionMigration.includes("else 'supporting'") &&
    terminalFactProjectionMigration.includes(
      "item.resulting_subject_ref = subject.item->>'subject_ref'",
    ) &&
    terminalFactProjectionMigration.includes(
      "evidence_version.sha256 = item.evidence_sha256",
    ) &&
    terminalFactProjectionMigration.includes(
      "item.resulting_value_sha256 = subject.item->>'value_sha256'",
    ) &&
    terminalFactProjectionMigration.includes(
      "from public, anon, authenticated, service_role;",
    ) &&
    terminalFactProjectionMigration.includes(
      "to service_role;",
    ),
  "terminal_fact_projection_authority_missing",
);
const originalTerminalFactProjectionBody = terminalFactProjectionMigration
  .slice(
    terminalFactProjectionMigration.indexOf(
      "create function public.app_customer_correction_safe_projection_v2(",
    ),
    terminalFactProjectionMigration.indexOf(
      "create function public.app_customer_correction_handoff_read_v8(",
    ),
  )
  .trim()
  .replace(/^create function /, "create or replace function ")
  .replace(
    "handoff.customer_id = v_submission.customer_id",
    "handoff.target_customer_id = v_submission.customer_id",
  );
const fixedTerminalFactProjectionBody =
  terminalFactProjectionBindingFixMigration
    .slice(
      terminalFactProjectionBindingFixMigration.indexOf(
        "create or replace function public.app_customer_correction_safe_projection_v2(",
      ),
      terminalFactProjectionBindingFixMigration.indexOf(
        "revoke all on function public.app_customer_correction_safe_projection_v2(",
      ),
    )
    .trim();
assert(
  originalTerminalFactProjectionBody === fixedTerminalFactProjectionBody &&
    terminalFactProjectionBindingFixMigration.includes(
      "handoff.target_customer_id = v_submission.customer_id",
    ) &&
    !terminalFactProjectionBindingFixMigration.includes(
      "handoff.customer_id = v_submission.customer_id",
    ) &&
    terminalFactProjectionBindingFixMigration.includes(
      "from public, anon, authenticated, service_role;",
    ) &&
    terminalFactProjectionBindingFixMigration.includes("to service_role;"),
  "terminal_fact_projection_customer_binding_fix_not_exact",
);
assert(
  publish.includes("app_evidence_review_correction_publish_v3") &&
    publish.includes("p_item_requirements"),
  "publish_v3_not_wired",
);
assert(
  supersede.includes("app_evidence_review_correction_supersede_v3") &&
    !supersede.includes('"VALUE_CORRECTION",\n    "MISSING_VALUE"'),
  "supersede_not_document_only",
);
assert(
  handoff.includes("app_customer_correction_handoff_read_v8") &&
    !handoff.includes("server_sha256"),
  "customer_projection_leaks_hash",
);
assert(
  !resolution.includes('"MANUAL"') &&
    resolution.includes('"DOCUMENT_TRANSCRIPTION"'),
  "source_less_route_active",
);
assert(
  panel.includes("factProjections") &&
    panel.includes("factStatusByScopeAndFact") &&
    panel.includes("transcriptionCandidateByScopeAndFact") &&
    panel.includes("correctionScopeFactKey("),
  "server_status_or_transcription_not_scope_bound",
);
const sourceUnresolved = interaction.split(
  'model.state === "SOURCE_UNRESOLVED"',
)[1]?.split('model.state === "MISSING_SOURCE_UNRESOLVED"')[0] ?? "";
assert(
  sourceUnresolved.includes('aria-label="Bevestigen"') &&
    sourceUnresolved.includes("manualEditAllowed !== false") &&
    sourceUnresolved.indexOf('aria-label="Bevestigen"') <
      sourceUnresolved.indexOf("manualEditAllowed !== false"),
  "source_confirmation_or_manual_edit_guard_missing",
);
assert(
  servedFixture.includes("fixtureIdempotencyLineage") &&
    servedFixture.includes("row.payloadHash") &&
    servedFixture.includes("idempotency.scope=expected.scope") &&
    servedFixture.includes("idempotency.payload_hash=expected.payload_hash") &&
    servedFixture.includes("fixture idempotency lineage changed") &&
    servedFixture.includes("correction_publish_requirements_missing"),
  "fixture_cleanup_lineage_or_publish_contract_not_strengthened",
);

const caseRef = "CASE-AAAAAAAAAAAA";
const targetRef = `CRT-${"A".repeat(32)}`;
const projectedFact = {
  fact_ref: `CFR-${"A".repeat(32)}`,
  source_ref: `CES-${"B".repeat(32)}`,
  replacement_target_ref: targetRef,
  fact_key: "energySupplier",
  fact_label: "Energieleverancier",
  value: "Voorbeeld Energie",
  enval_status: "Nog te beoordelen",
  sources: [{
    source_ref: `CES-${"B".repeat(32)}`,
    document_label: "Energiedocument",
    value: "Voorbeeld Energie",
    relationship: "direct",
  }],
};
const parsedProjection = parseCustomerCorrectionHandoffSource({
  ok: true,
  status: 200,
  code: "ok",
  case_ref: caseRef,
  fact_projections: [projectedFact],
  handoff: {
    bundle_version: "evidence-review-correction-handoff-bundle-v4",
    cover_message: "Controleer dit gegeven.",
    current_replacement_candidates: [],
    customer_publication_snapshot_sha256: "a".repeat(64),
    fact_projections: [projectedFact],
    handoff_ref: "CRH-0123456789ABCDEF",
    published_at: "2026-09-17T10:43:34.000Z",
    signer_authority: { status: "unavailable" },
    items: [{
      item_ref: `CCI-${"C".repeat(32)}`,
      document_label: "Energiedocument",
      fact_key: "energySupplier",
      fact_label: "Energieleverancier",
      current_value: "Vorige leverancier",
      correction_reason: "INCORRECT_INFORMATION",
      correction_reason_label: "Gegeven onjuist",
      correction_instruction: "Controleer de leverancier.",
      response_requirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT",
      replacement_target: {
        replacement_target_ref: targetRef,
        document_label: "Energiedocument",
        accepted_mime_types: ["application/pdf"],
        maximum_file_size: 15 * 1024 * 1024,
      },
    }],
  },
});
assert(
  parsedProjection?.handoff?.factProjections[0]?.replacementTargetRef ===
      targetRef &&
    decodeCustomerCorrectionHandoffResponse(parsedProjection, caseRef).ok,
  "safe_projection_dto_round_trip_failed",
);

const missingProjectedFact = {
  fact_ref: `CFR-${"D".repeat(32)}`,
  source_ref: `CES-${"E".repeat(32)}`,
  replacement_target_ref: targetRef,
  fact_key: "midNumber",
  fact_label: "MID-nummer",
  value: null,
  enval_status: "Nog te beoordelen",
  sources: [{
    source_ref: `CES-${"E".repeat(32)}`,
    document_label: "Installatiefactuur",
    value: null,
    relationship: "supporting",
  }],
};
const missingValueSource = JSON.parse(JSON.stringify({
  ok: true,
  status: 200,
  code: "ok",
  case_ref: caseRef,
  fact_projections: [missingProjectedFact],
  handoff: {
    bundle_version: "evidence-review-correction-handoff-bundle-v4",
    cover_message: "Controleer dit ontbrekende gegeven.",
    current_replacement_candidates: [],
    customer_publication_snapshot_sha256: "b".repeat(64),
    fact_projections: [missingProjectedFact],
    handoff_ref: "CRH-FEDCBA9876543210",
    published_at: "2026-09-17T10:43:34.000Z",
    signer_authority: { status: "unavailable" },
    items: [{
      item_ref: `CCI-${"F".repeat(32)}`,
      document_label: "Installatiefactuur",
      fact_key: "midNumber",
      fact_label: "MID-nummer",
      correction_reason: "MISSING_INFORMATION",
      correction_reason_label: "Gegeven ontbreekt",
      correction_instruction: "Controleer het ontbrekende nummer.",
      response_requirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT",
      replacement_target: {
        replacement_target_ref: targetRef,
        document_label: "Installatiefactuur",
        accepted_mime_types: ["application/pdf"],
        maximum_file_size: 15 * 1024 * 1024,
      },
    }],
  },
}));
const missingProjection = parseCustomerCorrectionHandoffSource(
  missingValueSource,
);
assert(
  missingProjection?.handoff?.factProjections[0]?.value === null &&
    missingProjection.handoff.factProjections[0].envalStatus ===
      "Nog te beoordelen" &&
    decodeCustomerCorrectionHandoffResponse(missingProjection, caseRef).ok,
  "missing_customer_safe_value_not_preserved_fail_closed",
);
const invalidDirectMissingValue = JSON.parse(
  JSON.stringify(missingValueSource),
);
invalidDirectMissingValue.handoff.fact_projections[0].sources[0].relationship =
  "direct";
invalidDirectMissingValue.fact_projections[0].sources[0].relationship =
  "direct";
assert(
  parseCustomerCorrectionHandoffSource(invalidDirectMissingValue) === null,
  "missing_value_with_direct_relationship_not_rejected",
);
const invalidAcceptedMissingValue = JSON.parse(
  JSON.stringify(missingValueSource),
);
invalidAcceptedMissingValue.handoff.fact_projections[0].enval_status =
  "Akkoord";
invalidAcceptedMissingValue.fact_projections[0].enval_status = "Akkoord";
assert(
  parseCustomerCorrectionHandoffSource(invalidAcceptedMissingValue) === null,
  "accepted_status_without_customer_safe_value_not_rejected",
);

const terminalProjection = parseCustomerCorrectionHandoffSource({
  ok: true,
  status: 200,
  code: "not_available",
  case_ref: caseRef,
  handoff: null,
  fact_projections: [{
    ...projectedFact,
    enval_status: "Akkoord",
  }],
});
assert(
  terminalProjection?.handoff === null &&
    terminalProjection.factProjections.length === 1 &&
    terminalProjection.factProjections[0].envalStatus === "Akkoord" &&
    decodeCustomerCorrectionHandoffResponse(terminalProjection, caseRef).ok,
  "terminal_customer_safe_fact_projection_round_trip_failed",
);

console.log("DOCUMENT_DRIVEN_CUSTOMER_CORRECTION_V1_PURE=PASS");
