import {
  type CustomerFactBrowserResolution,
  resolveCustomerFactResolutionPolicy,
} from "./customer_fact_resolution_policy.ts";

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const facts = [
  "partyName",
  "structuredAddress",
  "electricityEan",
  "energySupplier",
  "chargerBrand",
  "chargerModel",
  "serialNumber",
  "midNumber",
  "futureCanonicalFact",
] as const;

function policy(
  values: readonly Readonly<{
    root: string;
    value: string | null;
    fact?: string;
    scope?: string;
    role?: string;
    usable?: boolean;
    relationship?: "direct" | "supporting" | "provenance_only" | null;
  }>[],
  browserResolution: CustomerFactBrowserResolution = "UNRESOLVED",
  fact = "partyName",
  evidenceReady = true,
  actualReviewTruth: "Nog te beoordelen" | "Akkoord" | "Correctie nodig" =
    "Correctie nodig",
) {
  return resolveCustomerFactResolutionPolicy({
    canonicalFactKey: fact,
    scopeRef: "location:1",
    comparisonRole: "canonical",
    editable: true,
    evidenceReady,
    browserResolution,
    actualReviewTruth,
    sources: values.map((source) => ({
      canonicalFactKey: source.fact || fact,
      scopeRef: source.scope || "location:1",
      comparisonRole: source.role || "canonical",
      evidenceRootRef: source.root,
      observedValue: source.value,
      usable: source.usable ?? true,
      relationship: source.relationship,
    })),
  });
}

const zero = policy([]);
const one = policy([
  { root: "document-a", value: "A", relationship: "direct" },
]);
const oneEvidenceNotReady = policy(
  [{ root: "document-a", value: "A", relationship: "direct" }],
  "UNRESOLVED",
  "partyName",
  false,
);
const twoEqual = policy([
  { root: "document-a", value: "Waarde", relationship: "direct" },
  { root: "document-b", value: " waarde ", relationship: "direct" },
]);
const twoConflict = policy([
  { root: "document-a", value: "A", relationship: "direct" },
  { root: "document-b", value: "B", relationship: "direct" },
]);
const threeEqual = policy([
  { root: "document-a", value: "A" },
  { root: "document-b", value: "a" },
  { root: "document-c", value: " A " },
]);
const threeMixed = policy([
  { root: "document-a", value: "A" },
  { root: "document-b", value: "A" },
  { root: "document-c", value: "B" },
]);
const directSupportingEqual = policy([
  { root: "direct", value: "Waarde", relationship: "direct" },
  { root: "supporting", value: " waarde ", relationship: "supporting" },
]);
const directSupportingConflict = policy([
  { root: "direct", value: "A", relationship: "direct" },
  { root: "supporting", value: "B", relationship: "supporting" },
]);
const supportingOnlyEqual = policy([
  { root: "supporting-a", value: "A", relationship: "supporting" },
  { root: "supporting-b", value: "a", relationship: "supporting" },
]);
const provenanceExcluded = policy([
  { root: "direct", value: "A", relationship: "direct" },
  { root: "provenance", value: "B", relationship: "provenance_only" },
]);

assert(
  zero.interactionState === "MISSING_SOURCE_UNRESOLVED" &&
    !zero.cleanConfirmAvailable && zero.manualEditAvailable &&
    one.interactionState === "SOURCE_UNRESOLVED" &&
    one.cleanConfirmAvailable && one.manualEditAvailable &&
    oneEvidenceNotReady.interactionState === "SINGLE_SOURCE_UNRESOLVED" &&
    !oneEvidenceNotReady.cleanConfirmAvailable,
  "Q01_zero_one_or_evidence_gate_policy_invalid",
);
assert(
  twoEqual.interactionState === "SOURCE_UNRESOLVED" &&
    twoEqual.cleanConfirmAvailable && !twoEqual.conflictChoiceAvailable &&
    twoConflict.interactionState === "SOURCE_CONFLICT_UNRESOLVED" &&
    !twoConflict.cleanConfirmAvailable && twoConflict.conflictChoiceAvailable,
  "Q02_two_source_policy_invalid",
);
assert(
  threeEqual.interactionState === "SOURCE_UNRESOLVED" &&
    threeEqual.usableIndependentSourceCount === 3 &&
    threeMixed.interactionState === "SOURCE_CONFLICT_UNRESOLVED" &&
    threeMixed.usableIndependentSourceCount === 3,
  "Q03_three_source_policy_invalid",
);
assert(
  directSupportingEqual.cleanConfirmAvailable &&
    directSupportingEqual.usableIndependentSourceCount === 2 &&
    !directSupportingEqual.conflictChoiceAvailable &&
    directSupportingConflict.interactionState ===
      "SOURCE_CONFLICT_UNRESOLVED" &&
    directSupportingConflict.conflictChoiceAvailable &&
    directSupportingConflict.projectedEnvalRoute === "Wacht op klant" &&
    !supportingOnlyEqual.cleanConfirmAvailable &&
    supportingOnlyEqual.usableIndependentSourceCount === 2 &&
    supportingOnlyEqual.interactionState === "SINGLE_SOURCE_UNRESOLVED" &&
    provenanceExcluded.usableIndependentSourceCount === 1 &&
    provenanceExcluded.cleanConfirmAvailable,
  "Q04_relationship_corroboration_policy_invalid",
);

const duplicateReparse = policy([
  { root: "evidence-version-a", value: "A" },
  { root: "evidence-version-a", value: "A" },
]);
const unrelatedSecondDocument = policy(
  [
    { root: "ean-document", value: "871234567890123456" },
    {
      root: "invoice-document",
      value: "871234567890123456",
      fact: "serialNumber",
    },
  ],
  "UNRESOLVED",
  "electricityEan",
);
assert(
  duplicateReparse.usableIndependentSourceCount === 1 &&
    duplicateReparse.interactionState === "SOURCE_UNRESOLVED" &&
    unrelatedSecondDocument.usableIndependentSourceCount === 1 &&
    unrelatedSecondDocument.interactionState === "SOURCE_UNRESOLVED",
  "Q05_independent_evidence_root_or_unrelated_fact_invalid",
);

const isolated = policy([
  { root: "correct", value: "A" },
  { root: "wrong-scope", value: "B", scope: "location:2" },
  { root: "wrong-role", value: "B", role: "billing" },
  { root: "missing", value: null },
  { root: "failed", value: "B", usable: false },
]);
assert(
  isolated.usableIndependentSourceCount === 1 &&
    isolated.interactionState === "SOURCE_UNRESOLVED",
  "Q06_scope_role_missing_or_failure_filter_invalid",
);

assert(
  policy([{ root: "a", value: "A", relationship: "direct" }])
        .projectedEnvalRoute === "Wacht op klant" &&
    policy(
        [{ root: "a", value: "A", relationship: "direct" }],
        "CLEAN_SOURCE_CONFIRMED",
      ).projectedEnvalRoute === "Klant bevestigd" &&
    policy([
        { root: "a", value: "A" },
        { root: "b", value: "A" },
      ], "CLEAN_SOURCE_CONFIRMED").projectedEnvalRoute ===
      "Klant bevestigd" &&
    policy([
        { root: "a", value: "A" },
        { root: "b", value: "B" },
      ]).projectedEnvalRoute === "Wacht op klant" &&
    policy([
        { root: "a", value: "A" },
        { root: "b", value: "B" },
      ], "CONFLICT_SOURCE_SELECTED").projectedEnvalRoute ===
      "ENVAL checken" &&
    policy([], "MANUAL_CONFIRMED").projectedEnvalRoute ===
      "ENVAL checken" &&
    policy([{ root: "a", value: "A" }], "MANUAL_CONFIRMED")
        .projectedEnvalRoute === "ENVAL checken" &&
    resolveCustomerFactResolutionPolicy({
        canonicalFactKey: "partyName",
        scopeRef: "location:1",
        comparisonRole: "canonical",
        editable: false,
        evidenceReady: true,
        browserResolution: "LOCKED",
        actualReviewTruth: "Correctie nodig",
        sources: [],
      }).projectedEnvalRoute === "Correctie nodig" &&
    resolveCustomerFactResolutionPolicy({
        canonicalFactKey: "partyName",
        scopeRef: "location:1",
        comparisonRole: "canonical",
        editable: false,
        evidenceReady: true,
        browserResolution: "LOCKED",
        actualReviewTruth: "Akkoord",
        sources: [],
      }).projectedEnvalRoute === "Akkoord",
  "Q07_projected_route_invalid",
);

for (const fact of facts) {
  const result = policy(
    [
      { root: `${fact}:a`, value: "A" },
      { root: `${fact}:b`, value: "B" },
    ],
    "UNRESOLVED",
    fact,
  );
  assert(
    result.interactionState === "SOURCE_CONFLICT_UNRESOLVED",
    `Q08_generic_fact_policy_invalid:${fact}`,
  );
}

console.log("CUSTOMER04C3C9H_GENERIC_POLICY_Q01_Q08=PASS");
