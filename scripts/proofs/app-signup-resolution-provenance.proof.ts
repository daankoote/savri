import {
  deriveSignupResolutionProvenanceV1,
  SIGNUP_PROVENANCE_AUTHORITIES_V1,
  SIGNUP_REVIEW_REASONS_V1,
} from "../../supabase/functions/_shared/signup_resolution_provenance.ts";
import {
  type CanonicalSigningSourceRegistry,
  createCanonicalSigningFactModel,
} from "../../app/src/features/signup/signing/canonicalSigningFacts.ts";
import type {
  FactPresentationRow,
  FactPresentationSource,
  UnifiedFactPresentation,
} from "../../app/src/features/signup/presentation/factPresentationModel.ts";

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

const source = (identity: string, observedValue: string) => ({
  identity,
  observedValue,
});
const derive = (
  factKey: Parameters<typeof deriveSignupResolutionProvenanceV1>[0]["factKey"],
  action: Parameters<typeof deriveSignupResolutionProvenanceV1>[0]["action"],
  sources: Parameters<typeof deriveSignupResolutionProvenanceV1>[0]["sources"],
  resolutionState: Parameters<
    typeof deriveSignupResolutionProvenanceV1
  >[0]["resolutionState"] = "review_required",
) =>
  deriveSignupResolutionProvenanceV1({
    factKey,
    action,
    sources,
    resolutionState,
    partyKind: "natural_person",
  });

const cases = [
  [
    "USER_OVERRIDE",
    derive("electricityEan", "corrected", [source("file-a", "8711")]),
  ],
  ["USER_SUPPLIED_WITHOUT_DOCUMENT", derive("energySupplier", "supplied", [])],
  [
    "DOCUMENT_CONFLICT_RESOLVED",
    derive("electricityEan", "corrected", [
      source("file-a", "8711"),
      source("file-b", "8722"),
    ]),
  ],
  [
    "PROBABLE_IDENTITY_MATCH",
    derive("partyName", "confirmed", [
      source("file-a", "Jan de Vries"),
      source("file-b", "J. de Vries"),
    ]),
  ],
  [
    "PROBABLE_ADDRESS_MATCH",
    derive("structuredAddress", "confirmed", [
      source("file-a", "Proefstraat 1, 1234 AB Proefstad"),
      source("file-b", "Proefstraat 1-A, 1234 AB Proefstad"),
    ]),
  ],
] as const;
for (const [expected, result] of cases) {
  assert(
    result?.reviewReason === expected,
    `reason_mapping_failed:${expected}`,
  );
}
assert(
  SIGNUP_PROVENANCE_AUTHORITIES_V1.join("|") ===
    "SERVER_VERIFIED|CUSTOMER_SIGNED_RESOLUTION",
  "provenance_authority_enum_drift",
);
assert(
  SIGNUP_REVIEW_REASONS_V1.join("|") === [
    "GENERIC_REVIEW_REQUIRED",
    "USER_OVERRIDE",
    "USER_SUPPLIED_WITHOUT_DOCUMENT",
    "DOCUMENT_CONFLICT_RESOLVED",
    "PROBABLE_IDENTITY_MATCH",
    "PROBABLE_ADDRESS_MATCH",
  ].join("|"),
  "review_reason_enum_drift",
);
assert(
  derive(
    "partyName",
    "confirmed",
    [source("file-a", "Jan de Vries")],
    "confirmed",
  )
    ?.reviewReason === null,
  "clean_confirmation_has_reason",
);
assert(
  derive("electricityEan", "unresolved", [], "pending")?.reviewReason ===
      null &&
    derive("electricityEan", "unresolved", [], "blocked")?.reviewReason ===
      null &&
    derive("energySupplier", "confirmed", [], "review_required") === null,
  "unresolved_or_unclassified_review_became_reason",
);

const sourceCases = [
  {
    key: "found",
    fileReference: "11111111-1111-4111-8111-111111111111",
    contentSha256: "a".repeat(64),
    extractionStatus: "found",
    observedValue: " 871685900012345678 ",
  },
  {
    key: "not-found-empty",
    fileReference: "22222222-2222-4222-8222-222222222222",
    contentSha256: "b".repeat(64),
    extractionStatus: "not_found",
    observedValue: "",
  },
  {
    key: "not-found-stale",
    fileReference: "33333333-3333-4333-8333-333333333333",
    contentSha256: "c".repeat(64),
    extractionStatus: "not_found",
    observedValue: "stale non-authoritative value",
  },
  {
    key: "found-blank",
    fileReference: "44444444-4444-4444-8444-444444444444",
    contentSha256: "d".repeat(64),
    extractionStatus: "found",
    observedValue: " \t ",
  },
] as const;
const sourceRegistry = Object.freeze(Object.fromEntries(sourceCases.map(
  ({ key, fileReference, contentSha256 }) => [
    key,
    Object.freeze({
      fileReference,
      clientSlotId: key,
      documentType: "installation_invoice" as const,
      contentSha256,
      parserVersion: "parser-proof-v1",
    }),
  ],
))) as CanonicalSigningSourceRegistry;
const presentationSources: FactPresentationSource[] = sourceCases.map(
  ({ key, contentSha256, extractionStatus, observedValue }) => ({
    sourceId: key,
    sourceType: "installation_invoice",
    sourceLabel: "Installatiefactuur",
    binding: "Installatiefactuur",
    observedValue,
    normalizedValue: observedValue.trim(),
    semanticRole: "electricity_connection",
    extractionStatus,
    relationship: "direct",
    documentIdentity: contentSha256,
  }),
);

const canonicalSourceRow = {
  id: "location:proof:electricity-ean",
  label: "EAN elektriciteit",
  canonicalValue: "871685900012345678",
  sources: presentationSources,
  sourceValues: [],
  sourceLabels: [],
  sourceConsistency: "SINGLE_SOURCE",
  applicability: "required",
  resolutionState: "confirmed",
  resolutionReason: null,
  judgment: "Bevestigd",
  confirmationState: "confirmed",
  correctionState: "unchanged",
  isRequired: true,
  isInformational: false,
  actions: ["correct"],
  locationId: "location-proof",
  reviewRow: { factKey: "electricityEan" } as FactPresentationRow["reviewRow"],
} satisfies FactPresentationRow;
const canonicalSourcePresentation = {
  organizationRows: [],
  account: { id: "account", title: "Account", rows: [] },
  locations: [{
    id: "location-proof",
    title: "Locatie",
    rows: [canonicalSourceRow],
  }],
  chargers: [],
  documents: { id: "documents", title: "Documenten", rows: [] },
} satisfies UnifiedFactPresentation;
const canonicalSourceModel = createCanonicalSigningFactModel(
  canonicalSourcePresentation,
  sourceRegistry,
);
const canonicalSourceFact = canonicalSourceModel.facts[0];
const serializedSources = canonicalSourceFact?.resolutionInput.sources ?? [];

assert(
  serializedSources.some((item) =>
    item.fileReference === sourceCases[0].fileReference &&
    item.observedValue === "871685900012345678"
  ),
  "found_nonblank_source_not_serialized",
);
assert(
  !serializedSources.some((item) =>
    item.fileReference === sourceCases[1].fileReference
  ),
  "not_found_empty_source_serialized",
);
assert(
  !serializedSources.some((item) =>
    item.fileReference === sourceCases[2].fileReference
  ),
  "not_found_stale_source_serialized",
);
assert(
  !serializedSources.some((item) =>
    item.fileReference === sourceCases[3].fileReference
  ),
  "found_blank_source_serialized",
);
assert(
  canonicalSourceModel.schemaVersion === "canonical-signing-facts-v1" &&
    canonicalSourceModel.facts.length === 1 &&
    canonicalSourceFact?.factId === canonicalSourceRow.id &&
    canonicalSourceFact.factKey === "electricityEan" &&
    canonicalSourceFact.label === canonicalSourceRow.label &&
    canonicalSourceFact.value === canonicalSourceRow.canonicalValue &&
    canonicalSourceFact.resolutionState === "confirmed" &&
    canonicalSourceFact.required === true &&
    canonicalSourceFact.locationId === "location-proof" &&
    canonicalSourceFact.resolutionInput.action === "confirmed" &&
    serializedSources.length === 1,
  "remaining_canonical_fact_structure_changed",
);

const [endpoint, client, canonical, signingIntent, projection, baseline] =
  await Promise.all([
    Deno.readTextFile(
      "supabase/functions/api-app-signup-signing-finalize/index.ts",
    ),
    Deno.readTextFile("app/src/features/signup/signupSigningClient.ts"),
    Deno.readTextFile(
      "app/src/features/signup/signing/canonicalSigningFacts.ts",
    ),
    Deno.readTextFile("app/src/features/signup/signing/signingIntent.ts"),
    Deno.readTextFile(
      "supabase/migrations/20260818180000_app_signup_resolution_provenance_projection.sql",
    ),
    Deno.readTextFile(
      "supabase/migrations/20260816150000_app_current_baseline.sql",
    ),
  ]);

const factInputParser = endpoint.slice(
  endpoint.indexOf("function safeFactInputs"),
  endpoint.indexOf("function safeFacts"),
);

assert(
  endpoint.includes("deriveSignupResolutionProvenanceV1({") &&
    endpoint.includes("canonical-signing-facts-v2") &&
    endpoint.includes(
      '"id,client_slot_id,document_type,server_sha256"',
    ) &&
    !endpoint.includes('file.status !== "confirmed_quarantine"') &&
    endpoint.includes("file.server_sha256 !== source.contentSha256") &&
    endpoint.includes("file.client_slot_id !== source.clientSlotId") &&
    endpoint.includes("resolution_provenance:") &&
    endpoint.includes(
      'resolution_authority: "CUSTOMER_SIGNED_RESOLUTION"',
    ) &&
    endpoint.includes('document_binding_authority: "SERVER_VERIFIED"') &&
    endpoint.includes(
      'parser_observation_authority: "CUSTOMER_SIGNED_RESOLUTION"',
    ) &&
    endpoint.indexOf("resolution_provenance:") <
      endpoint.indexOf("const snapshotSha256") &&
    endpoint.indexOf("const snapshotSha256") <
      endpoint.indexOf('SB.rpc("app_signup_signing_finalize_v2"'),
  "server_derivation_or_hash_order_invalid",
);
assert(
  !client.includes("reviewReason") &&
    factInputParser.includes("exactKeys(item") &&
    factInputParser.includes("exactKeys(item.resolutionInput") &&
    !factInputParser.includes('"reviewReason"') &&
    !factInputParser.includes('"review_reason"') &&
    canonical.includes("resolutionInput") &&
    canonical.includes("quarantineFileReference") &&
    canonical.includes("contentFingerprint") &&
    canonical.includes("parserVersion") &&
    signingIntent.includes("signingSourceRegistry"),
  "client_reason_authority_or_source_binding_invalid",
);
assert(
  factInputParser.includes("!observedValue") &&
    serializedSources.every((item) =>
      Object.keys(item).sort().join("|") ===
        [
          "clientSlotId",
          "contentSha256",
          "documentType",
          "fileReference",
          "observedValue",
          "parserVersion",
        ].sort().join("|") &&
      item.observedValue.trim().length > 0
    ),
  "canonical_sources_do_not_match_server_structural_contract",
);
assert(
  projection.includes("canonical-signing-facts-v1") &&
    projection.includes("GENERIC_REVIEW_REQUIRED") &&
    projection.includes("canonical-signing-facts-v2") &&
    projection.includes("resolution_provenance,review_reason") &&
    !projection.includes("'GENERIC_REVIEW_REQUIRED',") &&
    baseline.includes("trg_app_signup_signing_snapshots_immutable") &&
    baseline.includes("facts_not_ready"),
  "historical_fallback_immutability_or_blocker_guard_invalid",
);

console.log("REVIEW10_FINALIZABLE_CAUSE_MATRIX=PASS");
console.log("REVIEW10_REASON_DERIVATION_Q01_Q05=PASS");
console.log("REVIEW10_CLEAN_CONFIRMATION=PASS");
console.log("REVIEW10_BLOCKED_CAUSES=PASS");
console.log("REVIEW10_SERVER_DERIVED_HASHED_PROVENANCE=PASS");
console.log("REVIEW10_DIRECT_REASON_TAMPER_DENIED=PASS");
console.log("REVIEW10_PROVENANCE_AUTHORITY=PASS");
console.log("SL01CF01_FOUND_NONBLANK_SOURCE_INCLUDED=PASS");
console.log("SL01CF01_NOT_FOUND_SOURCE_EXCLUDED=PASS");
console.log("SL01CF01_NOT_FOUND_STALE_VALUE_EXCLUDED=PASS");
console.log("SL01CF01_FOUND_BLANK_VALUE_EXCLUDED=PASS");
console.log("SL01CF01_REMAINING_FACT_STRUCTURE_PRESERVED=PASS");
