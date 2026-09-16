import type { CustomerCorrectionWorkspaceItem } from "./customerCorrectionWorkspace.ts";
import { selectCustomerCorrectionActiveFactSources } from "./customerCorrectionWorkspace.ts";
import {
  classifyCustomerDocumentFactSourceValues,
} from "../documents/customerDocumentFactSourceResolution.ts";
import { selectCustomerDocumentFactRows } from "../signup/documentFactRegistry.ts";

declare const Deno: { exit(code: number): never };

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function workspaceItem(
  number: number,
  documentLabel: "Energiedocument" | "Installatiefactuur",
  currentValue: string,
): CustomerCorrectionWorkspaceItem {
  const digit = number.toString(16).toUpperCase();
  return Object.freeze({
    item: Object.freeze({
      itemRef: `CCI-${digit.repeat(32)}`,
      factKey: "partyName" as const,
      documentLabel,
      factLabel: "Contracthouder",
      correctionReason: "INCONSISTENT_INFORMATION" as const,
      correctionInstruction: "Controleer de bronwaarden.",
      currentValue,
      responseRequirement: "VALUE_CORRECTION" as const,
    }),
    correctedValue: "",
    normalizedValue: "",
    requiresValue: true,
    requiresReplacement: false,
    showCurrentValue: true,
    valid: false,
    sameAsCurrentValue: false,
    parserPrefillNeedsConfirmation: false,
  });
}

const energy = workspaceItem(1, "Energiedocument", "Proof Person");
const invoice = workspaceItem(
  2,
  "Installatiefactuur",
  "Dense Browser Testklant",
);
const identities = Object.freeze({
  [energy.item.itemRef]: `CRC-${"A".repeat(32)}`,
  [invoice.item.itemRef]: `CRC-${"B".repeat(32)}`,
});
const differingObservations = Object.freeze({
  [energy.item.itemRef]: "Proof Person",
  [invoice.item.itemRef]: "Dense Browser Testklant",
});
const definition = selectCustomerDocumentFactRows("location").find((row) =>
  row.factKey === "partyName"
);
assert(definition, "party_definition_missing");
const partyDefinition = definition;

function projectedSources(
  items: readonly CustomerCorrectionWorkspaceItem[],
  observations: Readonly<Record<string, string | null>>,
  sourceIdentities: Readonly<Record<string, string>> = identities,
) {
  return selectCustomerCorrectionActiveFactSources({
    definition: partyDefinition,
    items,
    scopeRef: "location:proof",
    sourceFileNameByItemRef: Object.freeze({
      [energy.item.itemRef]: "energy.pdf",
      [invoice.item.itemRef]: "invoice.pdf",
    }),
    observedValuesByItemRef: observations,
    extractionMethodsByItemRef: Object.freeze({
      [energy.item.itemRef]: "semantic_contract_holder_block",
      [invoice.item.itemRef]: "invoice_customer_block",
    }),
    sourceIdentityByItemRef: sourceIdentities,
  });
}

const orderASources = projectedSources(
  [energy, invoice],
  differingObservations,
);
const orderBSources = projectedSources(
  [invoice, energy],
  differingObservations,
);
const orderA = orderASources.filter((source) =>
  (source.direct || source.supporting) && source.value !== null
).map((source) => source.value);
const orderB = orderBSources.filter((source) =>
  (source.direct || source.supporting) && source.value !== null
).map((source) => source.value);
assert(
  classifyCustomerDocumentFactSourceValues(orderA) ===
      "SOURCE_CONFLICT_UNRESOLVED" &&
    classifyCustomerDocumentFactSourceValues(orderB) ===
      "SOURCE_CONFLICT_UNRESOLVED" &&
    orderA.length === 2 && orderASources.length === 2 &&
    orderASources.some((source) => source.relationship === "supporting") &&
    JSON.stringify(orderA) === JSON.stringify(orderB),
  "Q01_installation_party_supporting_visibility_or_count_invalid",
);

const equalObservations = Object.freeze({
  [energy.item.itemRef]: "Dense Browser Testklant",
  [invoice.item.itemRef]: "Dense Browser Testklant",
});
const equalASources = projectedSources([energy, invoice], equalObservations);
const equalBSources = projectedSources([invoice, energy], equalObservations);
const equalA = equalASources.filter((source) =>
  (source.direct || source.supporting) && source.value !== null
).map((source) => source.value);
const equalB = equalBSources.filter((source) =>
  (source.direct || source.supporting) && source.value !== null
).map((source) => source.value);
assert(
  classifyCustomerDocumentFactSourceValues(equalA) ===
      "SOURCE_UNRESOLVED" &&
    classifyCustomerDocumentFactSourceValues(equalB) ===
      "SOURCE_UNRESOLVED" &&
    equalA.length === 2 && equalB.length === 2 &&
    equalASources.length === 2 && equalBSources.length === 2 &&
    JSON.stringify(equalA) === JSON.stringify(equalB),
  "Q02_equal_sources_or_provenance_changed",
);

const incompleteCandidateSet = projectedSources(
  [invoice, energy],
  { [energy.item.itemRef]: "Proof Person" },
  { [energy.item.itemRef]: identities[energy.item.itemRef] },
).filter((source) => source.direct).map((source) => source.value);
assert(
  classifyCustomerDocumentFactSourceValues(incompleteCandidateSet) ===
      "SOURCE_UNRESOLVED" && incompleteCandidateSet.length === 1,
  "Q03_current_truth_promoted_to_replacement_evidence",
);

const publicationSources = selectCustomerCorrectionActiveFactSources({
  definition: partyDefinition,
  items: [invoice, energy],
  scopeRef: "location:publication-proof",
  sourceFileNameByItemRef: Object.freeze({}),
  observedValuesByItemRef: Object.freeze({}),
  extractionMethodsByItemRef: Object.freeze({}),
  sourceIdentityByItemRef: Object.freeze({}),
});
assert(
  publicationSources.length === 2 &&
    publicationSources.some((source) =>
      source.fileName === "Energiedocument" &&
      source.value === "Proof Person"
    ) &&
    publicationSources.some((source) =>
      source.fileName === "Installatiefactuur" &&
      source.value === "Dense Browser Testklant"
    ) &&
    publicationSources.every((source) =>
      source.evidenceRootRef.startsWith("handoff:CCI-")
    ),
  "Q03b_customer_safe_publication_value_or_document_label_missing",
);

for (
  const values of [
    ["Proof Person", "Dense Browser Testklant"],
    ["Straat 1, 1234 AB Stad", "Andereweg 2, 5678 CD Plaats"],
    ["Alfen", "EVBox"],
  ]
) {
  assert(
    classifyCustomerDocumentFactSourceValues(values) ===
        "SOURCE_CONFLICT_UNRESOLVED" &&
      classifyCustomerDocumentFactSourceValues([...values].reverse()) ===
        "SOURCE_CONFLICT_UNRESOLVED",
    "Q04_generic_fact_order_changed_conflict",
  );
}

assert(
  classifyCustomerDocumentFactSourceValues([
        " Dense  Browser Testklant ",
        "dense browser testklant",
      ]) === "SOURCE_UNRESOLVED" &&
    classifyCustomerDocumentFactSourceValues(["D. Koote", "Daan Koote"]) ===
      "SOURCE_CONFLICT_UNRESOLVED" &&
    classifyCustomerDocumentFactSourceValues([null, " "]) ===
      "MISSING_SOURCE_UNRESOLVED",
  "Q05_normalization_or_non_fuzzy_contract_invalid",
);

console.log("customer-document-source-resolution-proof-ok");
