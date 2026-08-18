import {
  deriveSignupResolutionProvenanceV1,
  SIGNUP_PROVENANCE_AUTHORITIES_V1,
  SIGNUP_REVIEW_REASONS_V1,
} from "../../supabase/functions/_shared/signup_resolution_provenance.ts";

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
      '"id,client_slot_id,document_type,status,server_sha256"',
    ) &&
    endpoint.includes('file.status !== "confirmed_quarantine"') &&
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
