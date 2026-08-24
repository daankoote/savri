import {
  CUSTOMER_DOCUMENT_FACT_ROW_REGISTRY,
  customerDocumentEvidenceBindingFor,
  customerDocumentFactInstanceRowId,
  type DocumentFactObservation,
  selectCustomerDocumentFactRows,
} from "../signup/documentFactRegistry.ts";
import {
  buildCustomerCorrectionWorkspace,
  customerCorrectionFactRowDefinition,
  rebuildCustomerCorrectionTargetLocalState,
  resetCustomerCorrectionTargetLocalState,
  selectCustomerCorrectionFactScopes,
} from "../dashboard/customerCorrectionWorkspace.ts";
import type { CustomerCorrectionHandoffItem } from "../dashboard/customerCorrectionHandoffClient.ts";
import {
  deriveFactSourceConsistency,
  type FactPresentationSource,
} from "../signup/presentation/factPresentationModel.ts";
import type { DocumentFactKey } from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";
import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../signup/documentFirstSignupModel.ts";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
const ref = (prefix: "CCI" | "CRT", digit: string) =>
  `${prefix}-${digit.repeat(32)}`;

const locationRows = selectCustomerDocumentFactRows("location");
const chargerRows = selectCustomerDocumentFactRows("charger");
assert(
  locationRows.map((row) => row.id).join("|") ===
      "location:party-name|location:structured-address|location:electricity-ean|location:energy-supplier" &&
    chargerRows.map((row) => row.id).join("|") ===
      "charger:brand|charger:model|charger:serial-number|charger:mid-number" &&
    CUSTOMER_DOCUMENT_FACT_ROW_REGISTRY.every((row, index, rows) =>
      index === 0 || row.group !== rows[index - 1].group ||
      row.order > rows[index - 1].order
    ) &&
    !CUSTOMER_DOCUMENT_FACT_ROW_REGISTRY.some((row) =>
      row.label === "Gekoppelde locatie" ||
      row.label === "Naam op installatiefactuur"
    ),
  "Q01_canonical_row_plan_invalid",
);

const address = locationRows.find((row) =>
  row.factKey === "structuredAddress"
)!;
const billing = address.evidenceBindings.find((binding) =>
  binding.semanticRoles.includes("invoice_address")
);
const installation = address.evidenceBindings.find((binding) =>
  binding.semanticRoles.includes("installation_address")
);
assert(
  billing?.relationship === "supporting" &&
    installation?.relationship === "direct" &&
    locationRows.find((row) => row.factKey === "partyName")?.evidenceBindings
        .find((binding) => binding.semanticRoles.includes("buyer_or_customer"))
        ?.relationship === "supporting",
  "Q02_semantic_role_relationship_invalid",
);
assert(
  customerDocumentEvidenceBindingFor(address, {
        sourceDocumentType: "installation_invoice",
        semanticRole: "invoice_address",
      })?.relationship === "supporting" &&
    customerDocumentEvidenceBindingFor(address, {
        sourceDocumentType: "installation_invoice",
        semanticRole: "installation_address",
      })?.relationship === "direct" &&
    customerDocumentEvidenceBindingFor(address, {
        sourceDocumentType: "energy_bill_or_contract",
        semanticRole: "delivery_address",
      })?.relationship === "direct",
  "Q02b_scope_role_match_invalid",
);

function factSource(
  id: string,
  value: string,
  role: DocumentFactObservation["semanticRole"],
  relationship: FactPresentationSource["relationship"],
): FactPresentationSource {
  return {
    sourceId: id,
    sourceType: id.startsWith("energy")
      ? "energy_bill_or_contract"
      : "installation_invoice",
    sourceLabel: `${id}.pdf`,
    binding: id,
    observedValue: value,
    normalizedValue: value.toLocaleLowerCase("nl-NL"),
    semanticRole: role,
    extractionStatus: "found",
    relationship,
  };
}
const delivery = factSource(
  "energy-1",
  "Energieweg 1, 1000AA Proefstad",
  "delivery_address",
  "direct",
);
const explicitInstall = factSource(
  "invoice-1",
  "Energieweg 1, 1000AA Proefstad",
  "installation_address",
  "direct",
);
const conflictingInstall = factSource(
  "invoice-2",
  "Andereweg 9, 9000ZZ Conflictstad",
  "installation_address",
  "direct",
);
const invoiceBilling = factSource(
  "invoice-3",
  "Factuurstraat 2, 2000BB Teststad",
  "invoice_address",
  "supporting",
);
const otherLocationInstall = {
  ...conflictingInstall,
  sourceId: "invoice-location-2",
  locationId: "location-2",
};
const locationOneDelivery = {
  ...delivery,
  locationId: "location-1",
};
assert(
  deriveFactSourceConsistency("structuredAddress", []) === "MISSING" &&
    deriveFactSourceConsistency("structuredAddress", [delivery]) ===
      "SINGLE_SOURCE" &&
    deriveFactSourceConsistency("structuredAddress", [
        delivery,
        explicitInstall,
      ]) ===
      "MATCH" &&
    deriveFactSourceConsistency("structuredAddress", [
        delivery,
        conflictingInstall,
      ]) ===
      "CONFLICT" &&
    deriveFactSourceConsistency("structuredAddress", [
        delivery,
        invoiceBilling,
      ]) ===
      "NOT_COMPARABLE" &&
    deriveFactSourceConsistency("structuredAddress", [
        conflictingInstall,
        delivery,
      ]) === "CONFLICT" &&
    deriveFactSourceConsistency("structuredAddress", [
        locationOneDelivery,
        otherLocationInstall,
      ]) === "NOT_COMPARABLE",
  "Q03_source_consistency_or_address_role_invalid",
);

assert(
  customerDocumentFactInstanceRowId(locationRows[0], "location-1") !==
      customerDocumentFactInstanceRowId(locationRows[0], "location-2") &&
    customerDocumentFactInstanceRowId(chargerRows[0], "charger-1") !==
      customerDocumentFactInstanceRowId(chargerRows[0], "charger-2") &&
    new Set([
        ...["location-1", "location-2"].flatMap((scopeRef) =>
          locationRows.map((row) =>
            customerDocumentFactInstanceRowId(row, scopeRef)
          )
        ),
        ...["charger-1", "charger-2"].flatMap((scopeRef) =>
          chargerRows.map((row) =>
            customerDocumentFactInstanceRowId(row, scopeRef)
          )
        ),
      ]).size === 16,
  "Q04_multi_scope_identity_invalid",
);

function item(
  number: number,
  factKey: DocumentFactKey,
  targetRef: string,
  documentLabel: "Energiedocument" | "Installatiefactuur",
): CustomerCorrectionHandoffItem {
  return Object.freeze({
    itemRef: ref("CCI", number.toString(16).toUpperCase()),
    factKey,
    documentLabel,
    factLabel: `server-label-${number}`,
    currentValue: `current-${number}`,
    correctionReason: "INCORRECT_INFORMATION",
    correctionReasonLabel: "Gegeven onjuist",
    correctionInstruction: "Audit instruction",
    responseRequirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT",
    replacementTarget: Object.freeze({
      replacementTargetRef: targetRef,
      documentLabel,
      acceptedMimeTypes: Object.freeze(["application/pdf"] as const),
      maximumFileSize: 15 * 1024 * 1024,
    }),
  });
}
const targetRef = ref("CRT", "1");
const items = Object.freeze([
  item(1, "structuredAddress", targetRef, "Installatiefactuur"),
  item(2, "chargerBrand", targetRef, "Installatiefactuur"),
]);
const workspace = buildCustomerCorrectionWorkspace(items, {
  [items[0].itemRef]: "draft-address",
  [items[1].itemRef]: "draft-brand",
});
const target = workspace.replacementTargets[0];
const scopes = selectCustomerCorrectionFactScopes(workspace.items);
assert(
  customerCorrectionFactRowDefinition(items[0])?.group === "location" &&
    customerCorrectionFactRowDefinition(items[1])?.group === "charger" &&
    scopes.length === 2 &&
    scopes.some((scope) => scope.group === "location") &&
    scopes.some((scope) => scope.group === "charger"),
  "Q05_install_observation_or_canonical_scope_invalid",
);
const reset = resetCustomerCorrectionTargetLocalState(
  { [items[0].itemRef]: "old-address", [items[1].itemRef]: "old-brand" },
  new Set(items.map((entry) => entry.itemRef)),
  target,
);
const rebuilt = rebuildCustomerCorrectionTargetLocalState(
  items,
  reset.draft,
  reset.unconfirmedParserPrefills,
  target,
  [{ factKey: "structuredAddress", observedValue: null }],
);
assert(
  reset.draft[items[0].itemRef] === "" &&
    reset.draft[items[1].itemRef] === "" &&
    rebuilt.draft[items[0].itemRef] === "" &&
    rebuilt.draft[items[1].itemRef] === "",
  "Q06_candidate_reset_or_fresh_miss_invalid",
);

const factScope = "location:proof-location:energy:ean";
const initialSignup = createFreshDocumentFirstSignupDraft("particulier");
const confirmedSignup = documentFirstSignupReducer(initialSignup, {
  type: "confirm_fact",
  factKey: factScope,
  canonicalFactKey: "electricityEan",
  value: "871234567890123456",
  sourceDocuments: [],
  confirmedAt: "2026-08-23T00:00:00.000Z",
  decisionStatus: "clean_match",
  normalizationApplied: false,
  pendingPersistence: false,
});
const changedSignup = documentFirstSignupReducer(confirmedSignup, {
  type: "set_manual_correction",
  factKey: factScope,
  canonicalFactKey: "electricityEan",
  value: "871234567890123457",
  sourceDocumentId: "energy-proof",
  sourceDocumentType: "energy_bill_or_contract",
  observedFact: null,
  correctionType: "parser_correction",
  confirmedAt: "2026-08-23T00:01:00.000Z",
  pendingPersistence: false,
});
const reconfirmedSignup = documentFirstSignupReducer(changedSignup, {
  type: "confirm_fact",
  factKey: factScope,
  canonicalFactKey: "electricityEan",
  value: "871234567890123457",
  sourceDocuments: [],
  confirmedAt: "2026-08-23T00:02:00.000Z",
  decisionStatus: "review_required",
  normalizationApplied: false,
  pendingPersistence: false,
});
assert(
  confirmedSignup.customerConfirmations[factScope]?.confirmationStatus ===
      "confirmed" &&
    !confirmedSignup.customerConfirmations[factScope]?.correctedManually &&
    !(factScope in changedSignup.customerConfirmations) &&
    changedSignup.manualCorrections[factScope]?.correctedManually === true &&
    reconfirmedSignup.customerConfirmations[factScope]?.correctedManually ===
      true,
  "Q07_confirm_change_reconfirm_state_invalid",
);

const [
  signupSource,
  signupWorkflowSource,
  correctionSource,
  registrySource,
  workspaceSource,
  workflowControllerSource,
  sharedWorkflowSource,
] =
  await Promise.all([
    source("app/src/features/signup/presentation/factPresentationModel.ts"),
    source("app/src/features/signup/DocumentFirstCheckMatrix.tsx"),
    source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
    source("app/src/features/signup/documentFactRegistry.ts"),
    source("app/src/features/dashboard/customerCorrectionWorkspace.ts"),
    source(
      "app/src/features/documents/CustomerDocumentWorkflowController.ts",
    ),
    source("app/src/features/documents/DocumentEvidenceWorkflow.tsx"),
  ]);
assert(
  signupSource.includes('selectCustomerDocumentFactRows("location")') &&
    signupSource.includes('selectCustomerDocumentFactRows("charger")') &&
    correctionSource.includes('selectCustomerDocumentFactRows("location")') &&
    correctionSource.includes('selectCustomerDocumentFactRows("charger")') &&
    signupWorkflowSource.includes("createCustomerDocumentWorkflowGroup") &&
    correctionSource.includes("createCustomerDocumentWorkflowGroup") &&
    sharedWorkflowSource.includes("<DocumentFactMatrix") &&
    workspaceSource.includes("customerCorrectionFactRowDefinition") &&
    signupSource.includes("allowLocationDocumentForCharger") &&
    signupSource.includes("chargerIds.length === 1") &&
    registrySource.includes('relationship: "direct"') &&
    registrySource.includes('relationship: "supporting"') &&
    registrySource.includes('relationship: "provenance_only"') &&
    workflowControllerSource.includes(
      "const directSources = sources.filter",
    ) &&
    workflowControllerSource.includes("resolveCustomerFactResolutionPolicy") &&
    !signupWorkflowSource.includes("resolveCustomerFactResolutionPolicy") &&
    !correctionSource.includes("resolveCustomerFactResolutionPolicy") &&
    registrySource.includes('label: "Laadlocatie"') &&
    registrySource.includes('label: "Energieleverancier"') &&
    !registrySource.includes('label: "Gekoppelde locatie"'),
  "Q08_signup_correction_registry_parity_invalid",
);
assert(
  !correctionSource.includes("LOCATION_CORRECTION_FACTS") &&
    !correctionSource.includes("CHARGER_CORRECTION_FACTS") &&
    correctionSource.includes("resetCustomerCorrectionTargetLocalState") &&
    correctionSource.includes("rebuildCustomerCorrectionTargetLocalState") &&
    !correctionSource.includes("previousReady") &&
    !correctionSource.includes("keepPreviousReplacement"),
  "Q09_duplicate_registry_or_candidate_fallback_invalid",
);

assert(
  correctionSource.includes("function confirmValues") &&
    correctionSource.includes(
      "itemRefs.forEach((itemRef) => next.delete(itemRef))",
    ) &&
    workflowControllerSource.includes("onCancelResolution:") &&
    correctionSource.includes(
      "itemRefs.forEach((itemRef) => next.add(itemRef))",
    ) &&
    correctionSource.includes("function restoreSourceValues") &&
    correctionSource.includes("replacedSourceTypes") &&
    correctionSource.includes(
      "replacedSourceTypes.has(binding.sourceDocumentType)",
    ) &&
    correctionSource.includes('"Handmatig aangepast"') &&
    correctionSource.includes('"Nog invullen"') &&
    correctionSource.includes('"Nog te beoordelen"') &&
    correctionSource.includes('"Correctie nodig"') &&
    workflowControllerSource.includes("interactionState") &&
    !signupWorkflowSource.includes("interactionState") &&
    !correctionSource.includes("interactionState"),
  "Q10_correction_confirmation_or_status_semantics_invalid",
);

console.log("CUSTOMER04C3C7_CANONICAL_FACTS_Q01_Q10=PASS");
Deno.exit(0);
