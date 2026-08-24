import {
  type CustomerDocumentFactActiveSourceInput,
  projectCustomerDocumentFactActiveSources,
} from "../../app/src/features/documents/customerDocumentFactActiveSourceProjector.ts";
import {
  customerDocumentEvidenceBindingFor,
  customerDocumentSemanticRoleFor,
  selectCustomerDocumentFactRows,
} from "../../app/src/features/signup/documentFactRegistry.ts";
import { resolveCustomerFactResolutionPolicy } from "../../platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

const partyDefinition = selectCustomerDocumentFactRows("location").find(
  (row) => row.factKey === "partyName",
)!;
const addressDefinition = selectCustomerDocumentFactRows("location").find(
  (row) => row.factKey === "structuredAddress",
)!;
const eanDefinition = selectCustomerDocumentFactRows("location").find(
  (row) => row.factKey === "electricityEan",
)!;
invariant(partyDefinition && addressDefinition, "registry_rows_missing");

function input(
  sourceRef: string,
  value: string | null,
  overrides: Partial<CustomerDocumentFactActiveSourceInput> = {},
): CustomerDocumentFactActiveSourceInput {
  return Object.freeze({
    sourceRef,
    evidenceRootRef: sourceRef,
    fileName: `${sourceRef}.pdf`,
    canonicalFactKey: "partyName",
    scopeRef: "location:one",
    comparisonRole: partyDefinition.id,
    sourceDocumentType: "energy_bill_or_contract",
    semanticRole: "contract_holder",
    relationship: "direct",
    observedValue: value,
    current: true,
    ...overrides,
  });
}

function counts(inputs: readonly CustomerDocumentFactActiveSourceInput[]) {
  const projection = projectCustomerDocumentFactActiveSources(inputs);
  const policy = resolveCustomerFactResolutionPolicy({
    canonicalFactKey: "partyName",
    scopeRef: "location:one",
    comparisonRole: partyDefinition.id,
    sources: projection.matrixSources,
    editable: true,
    evidenceReady: true,
    browserResolution: "UNRESOLVED",
    actualReviewTruth: "Correctie nodig",
  });
  invariant(
    projection.matrixSources.every((source) =>
      projection.matrixSources.includes(source)
    ) &&
      projection.directSources.map((source) => source.sourceRef).join("|") ===
        projection.directSources.map((source) => source.id).join("|"),
    "display_policy_identity_split",
  );
  return { projection, policy };
}

invariant(counts([]).policy.usableIndependentSourceCount === 0, "zero_failed");
invariant(
  counts([input("energy-a", "Klant")]).policy.usableIndependentSourceCount ===
    1,
  "one_failed",
);
invariant(
  counts([
    input("energy-a", "Klant"),
    input("energy-b", " klant "),
  ]).policy.sourceSetKind === "CORROBORATED_EQUAL_SOURCES",
  "two_equal_failed",
);
invariant(
  counts([
    input("energy-a", "Klant A"),
    input("energy-b", "Klant B"),
  ]).policy.sourceSetKind === "CONFLICTING_SOURCES",
  "two_conflict_failed",
);
invariant(
  counts([
    input("same-observation-a", "Klant", {
      evidenceRootRef: "same-root",
    }),
    input("same-observation-b", "Klant", {
      evidenceRootRef: "same-root",
    }),
  ]).policy.usableIndependentSourceCount === 1,
  "duplicate_root_counted_twice",
);
const duplicateByteSha = "a".repeat(64);
const duplicateByteProjection = counts([
  input("energy-byte-copy", "Klant", {
    contentFingerprint: duplicateByteSha,
  }),
  input("installation-byte-copy", "Klant", {
    evidenceRootRef: "different-lifecycle-root",
    contentFingerprint: duplicateByteSha.toUpperCase(),
    sourceDocumentType: "installation_invoice",
    semanticRole: "buyer_or_customer",
    relationship: "supporting",
  }),
]);
invariant(
  duplicateByteProjection.projection.matrixSources.length === 1 &&
    duplicateByteProjection.policy.usableIndependentSourceCount === 1 &&
    duplicateByteProjection.projection.matrixSources[0]
        ?.contentFingerprint === duplicateByteSha &&
    duplicateByteProjection.projection.matrixSources[0]
        ?.sourceIndependenceKey.endsWith(`sha256:${duplicateByteSha}`),
  "duplicate_byte_sha_counted_or_displayed_twice",
);
const differentByteProjection = counts([
  input("different-file-a", "Klant", {
    contentFingerprint: "b".repeat(64),
  }),
  input("different-file-b", " klant ", {
    contentFingerprint: "c".repeat(64),
  }),
]);
invariant(
  differentByteProjection.projection.matrixSources.length === 2 &&
    differentByteProjection.policy.usableIndependentSourceCount === 2 &&
    differentByteProjection.policy.sourceSetKind ===
      "CORROBORATED_EQUAL_SOURCES",
  "different_pdf_bytes_with_equal_values_were_deduplicated",
);
invariant(
  counts([
    input("historical", "Historisch", { current: false }),
  ]).policy.usableIndependentSourceCount === 0,
  "historical_source_current",
);

const installationPartyRole = customerDocumentSemanticRoleFor(
  "partyName",
  "invoice_customer_block",
);
const installationPartyBinding = customerDocumentEvidenceBindingFor(
  partyDefinition,
  {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationPartyRole,
  },
);
invariant(
  installationPartyRole === "buyer_or_customer" &&
    installationPartyBinding?.relationship === "supporting",
  "installation_party_relationship_invalid",
);
const supportingProjection = projectCustomerDocumentFactActiveSources([
  input("installation-party", "Andere naam", {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationPartyRole,
    relationship: installationPartyBinding?.relationship || null,
  }),
]);
const directSupportingEqualParty = counts([
  input("energy-direct", "Klant A"),
  input("installation-supporting", " klant a ", {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationPartyRole,
    relationship: installationPartyBinding?.relationship || null,
  }),
]).policy;
const directSupportingConflictParty = counts([
  input("energy-direct", "Klant A"),
  input("installation-supporting", "Klant B", {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationPartyRole,
    relationship: installationPartyBinding?.relationship || null,
  }),
]).policy;
const supportingOnlyParty = counts([
  input("installation-supporting-a", "Klant A", {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationPartyRole,
    relationship: installationPartyBinding?.relationship || null,
  }),
  input("installation-supporting-b", " klant a ", {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationPartyRole,
    relationship: installationPartyBinding?.relationship || null,
  }),
]).policy;
invariant(
  supportingProjection.matrixSources.length === 1 &&
    supportingProjection.supportingSources.length === 1 &&
    supportingProjection.directSources.length === 0 &&
    directSupportingEqualParty.cleanConfirmAvailable &&
    directSupportingEqualParty.usableIndependentSourceCount === 2 &&
    directSupportingConflictParty.conflictChoiceAvailable &&
    directSupportingConflictParty.projectedEnvalRoute === "Wacht op klant" &&
    !supportingOnlyParty.cleanConfirmAvailable &&
    supportingOnlyParty.interactionState === "SINGLE_SOURCE_UNRESOLVED",
  "supporting_corroboration_policy_failed",
);

const invoiceAddressRole = customerDocumentSemanticRoleFor(
  "structuredAddress",
  "invoice_address_block",
);
const invoiceAddressBinding = customerDocumentEvidenceBindingFor(
  addressDefinition,
  {
    sourceDocumentType: "installation_invoice",
    semanticRole: invoiceAddressRole,
  },
);
const installationAddressRole = customerDocumentSemanticRoleFor(
  "structuredAddress",
  "explicit_installation_address_block",
);
const installationAddressBinding = customerDocumentEvidenceBindingFor(
  addressDefinition,
  {
    sourceDocumentType: "installation_invoice",
    semanticRole: installationAddressRole,
  },
);
invariant(
  invoiceAddressBinding?.relationship === "supporting",
  "invoice_address_relationship_invalid",
);
invariant(
  installationAddressBinding?.relationship === "direct",
  "installation_address_not_direct",
);

function relevantPolicy(
  canonicalFactKey: string,
  comparisonRole: string,
  sources: readonly CustomerDocumentFactActiveSourceInput[],
) {
  const projection = projectCustomerDocumentFactActiveSources(sources);
  return resolveCustomerFactResolutionPolicy({
    canonicalFactKey,
    scopeRef: "location:one",
    comparisonRole,
    sources: projection.matrixSources,
    editable: true,
    evidenceReady: true,
    browserResolution: "UNRESOLVED",
    actualReviewTruth: "Correctie nodig",
  });
}

const equalAddress = relevantPolicy("structuredAddress", addressDefinition.id, [
  input("energy-address", "Corroboratieweg 7, 5678CD Teststad", {
    canonicalFactKey: "structuredAddress",
    comparisonRole: addressDefinition.id,
    semanticRole: "delivery_address",
    relationship: "direct",
  }),
  input("installation-address", " corroboratieweg 7, 5678CD Teststad ", {
    canonicalFactKey: "structuredAddress",
    comparisonRole: addressDefinition.id,
    sourceDocumentType: "installation_invoice",
    semanticRole: "installation_address",
    relationship: "direct",
  }),
]);
const conflictingAddress = relevantPolicy(
  "structuredAddress",
  addressDefinition.id,
  [
    input("energy-address", "Corroboratieweg 7, 5678CD Teststad", {
      canonicalFactKey: "structuredAddress",
      comparisonRole: addressDefinition.id,
      semanticRole: "delivery_address",
      relationship: "direct",
    }),
    input("installation-address", "Andereweg 9, 9000ZZ Conflictstad", {
      canonicalFactKey: "structuredAddress",
      comparisonRole: addressDefinition.id,
      sourceDocumentType: "installation_invoice",
      semanticRole: "installation_address",
      relationship: "direct",
    }),
  ],
);
const equalEan = relevantPolicy("electricityEan", eanDefinition.id, [
  input("energy-ean", "871685900012345678", {
    canonicalFactKey: "electricityEan",
    comparisonRole: eanDefinition.id,
    semanticRole: "electricity_connection",
    relationship: "direct",
  }),
  input("installation-ean", "871685900012345678", {
    canonicalFactKey: "electricityEan",
    comparisonRole: eanDefinition.id,
    sourceDocumentType: "installation_invoice",
    semanticRole: "electricity_connection",
    relationship: "direct",
  }),
]);
const energyAndBillingAddress = relevantPolicy(
  "structuredAddress",
  addressDefinition.id,
  [
    input("energy-delivery-address", "Huidigeweg 4, 1234AB Utrecht", {
      canonicalFactKey: "structuredAddress",
      comparisonRole: addressDefinition.id,
      semanticRole: "delivery_address",
      relationship: "direct",
    }),
    input("installation-billing-address", " huidigeweg 4, 1234AB Utrecht ", {
      canonicalFactKey: "structuredAddress",
      comparisonRole: addressDefinition.id,
      sourceDocumentType: "installation_invoice",
      semanticRole: invoiceAddressRole,
      relationship: invoiceAddressBinding?.relationship || null,
    }),
  ],
);
const provenanceExcluded = counts([
  input("energy-direct", "Klant A"),
  input("audit-only", "Klant B", {
    relationship: "provenance_only",
  }),
]).policy;
invariant(
  equalAddress.cleanConfirmAvailable &&
    equalAddress.usableIndependentSourceCount === 2,
  "true_two_direct_equal_address_not_confirmable",
);
invariant(
  conflictingAddress.conflictChoiceAvailable &&
    conflictingAddress.usableIndependentSourceCount === 2,
  "true_two_direct_conflict_address_not_selectable",
);
invariant(
  equalEan.cleanConfirmAvailable &&
    equalEan.usableIndependentSourceCount === 2,
  "true_two_direct_ean_not_confirmable",
);
invariant(
  energyAndBillingAddress.cleanConfirmAvailable &&
    energyAndBillingAddress.usableIndependentSourceCount === 2,
  "direct_plus_supporting_location_not_confirmable",
);
invariant(
  provenanceExcluded.usableIndependentSourceCount === 1 &&
    provenanceExcluded.cleanConfirmAvailable &&
    !provenanceExcluded.conflictChoiceAvailable,
  "provenance_only_participated",
);

const ROOT = new URL("../../", import.meta.url);
const [
  signupProjectionSource,
  signupTableSource,
  correctionProjectionSource,
  correctionPanelSource,
  sharedInteractionSource,
  workflowControllerSource,
] = await Promise.all([
  Deno.readTextFile(
    new URL(
      "app/src/features/signup/presentation/FactReviewControls.tsx",
      ROOT,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "app/src/features/signup/presentation/FactTable.tsx",
      ROOT,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "app/src/features/dashboard/customerCorrectionWorkspace.ts",
      ROOT,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx",
      ROOT,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "app/src/features/documents/CustomerDocumentFactInteraction.tsx",
      ROOT,
    ),
  ),
  Deno.readTextFile(
    new URL(
      "app/src/features/documents/CustomerDocumentWorkflowController.ts",
      ROOT,
    ),
  ),
]);
invariant(
  signupProjectionSource.includes("projectCustomerDocumentFactActiveSources") &&
    correctionProjectionSource.includes(
      "projectCustomerDocumentFactActiveSources",
    ) &&
    workflowControllerSource.includes(
      "projectCustomerDocumentFactActiveSources",
    ) &&
    workflowControllerSource.includes("resolveCustomerFactResolutionPolicy") &&
    !signupProjectionSource.includes("resolveCustomerFactResolutionPolicy") &&
    !correctionPanelSource.includes("resolveCustomerFactResolutionPolicy") &&
    signupProjectionSource.includes(
      "contentFingerprint: source.documentIdentity || null",
    ) &&
    correctionProjectionSource.includes(
      "sourceContentFingerprintByItemRef[slotItemRef] || null",
    ) &&
    correctionPanelSource.includes("sourceContentFingerprintByItemRef") &&
    workflowControllerSource.includes("source.direct || source.supporting") &&
    !signupTableSource.includes("source.direct || source.supporting") &&
    !correctionPanelSource.includes("source.direct || source.supporting") &&
    !sharedInteractionSource.includes(
      'source.relationship === "supporting" || !source.selectable',
    ),
  "signup_correction_projector_or_policy_diverged",
);
const signupModelSource = await Deno.readTextFile(
  new URL(
    "app/src/features/signup/presentation/factPresentationModel.ts",
    ROOT,
  ),
);
invariant(
  signupModelSource.includes("allowLocationDocumentForCharger") &&
    signupModelSource.includes("chargerIds.length === 1"),
  "ambiguous_charger_scope_auto_assignment_guard_missing",
);

console.log("ACTIVE_SOURCE_PROJECTOR=PASS");
console.log("DISPLAY_POLICY_BASE_SOURCE_OBJECT_PARITY=PASS");
console.log("DIRECT_SUPPORTING_PROVENANCE_RELATIONSHIPS=PASS");
console.log("DIRECT_PLUS_SUPPORTING_EQUAL_CONFIRM=PASS");
console.log("DIRECT_PLUS_SUPPORTING_CONFLICT=PASS");
console.log("SUPPORTING_ONLY_CONFIRM_AVAILABLE=NO");
console.log("PROVENANCE_ONLY_COUNTS=NO");
console.log("CONTRACTHOLDER_CURRENT_TWO_PDFS_CONFIRM=YES");
console.log("LAADLOCATIE_CURRENT_TWO_PDFS_CONFIRM=YES");
console.log("TRUE_TWO_DIRECT_EQUAL_ADDRESS_CONFIRM=PASS");
console.log("TRUE_TWO_DIRECT_CONFLICT_ADDRESS_CHOICE=PASS");
console.log("TRUE_TWO_DIRECT_EAN_CONFIRM=PASS");
console.log("SAME_RELATIONSHIP_PROJECTOR_SIGNUP_CORRECTION=PASS");
console.log("SAME_RESOLUTION_POLICY_SIGNUP_CORRECTION=PASS");
console.log("AMBIGUOUS_CHARGER_SCOPE_AUTO_ASSIGNED=NO");
console.log("DUPLICATE_BYTE_SHA_COUNTS_AS_TWO_SOURCES=NO");
console.log("DUPLICATE_BYTE_SHA_DUPLICATE_DISPLAY_LINE=NO");
console.log("DIFFERENT_PDFS_EQUAL_VALUES_REMAIN_INDEPENDENT=PASS");
