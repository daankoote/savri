import { renderToStaticMarkup } from "react-dom/server";
import {
  CustomerDocumentFactInteraction,
  type CustomerDocumentFactInteractionModel,
} from "./CustomerDocumentFactInteraction.tsx";
import { DocumentFactMatrix } from "./DocumentFactMatrix.tsx";
import { createSignupCustomerInteractionModel } from "../signup/presentation/FactReviewControls.tsx";
import type { FactPresentationRow } from "../signup/presentation/factPresentationModel.ts";
import type { DocumentReviewRow } from "../signup/documentReviewMatrix.ts";
import { projectCustomerDocumentFactActiveSources } from "./customerDocumentFactActiveSourceProjector.ts";
import {
  classifyCustomerDocumentFactSourceValues,
  resolveCustomerFactResolutionPolicy,
} from "./customerDocumentFactSourceResolution.ts";

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function model(
  state: CustomerDocumentFactInteractionModel["state"],
  manualEditAllowed?: boolean,
): CustomerDocumentFactInteractionModel {
  const missing = state === "MISSING_SOURCE_UNRESOLVED";
  const conflict = state === "SOURCE_CONFLICT_UNRESOLVED";
  return {
    id: `proof:${state}`,
    label: conflict ? "Laadlocatie" : "Energieleverancier",
    state,
    sourceValue: missing || conflict ? undefined : "Bron Energie B.V.",
    suggestedValue: conflict ? "Bron Energie B.V." : undefined,
    customerValue: state === "MANUAL_CONFIRMED"
      ? "Handmatig Energie B.V."
      : undefined,
    canRestoreSources: !missing,
    emptyValue: "",
    editor: "text",
    manualEditAllowed,
    isValid: (value) => typeof value === "string" && Boolean(value.trim()),
    onConfirm: () => undefined,
    onCancelResolution: () => undefined,
    onInvalidateConfirmation: () => undefined,
    onRestoreSource: () => undefined,
  };
}

function projectedRoute(
  browserResolution:
    | "UNRESOLVED"
    | "CLEAN_SOURCE_CONFIRMED"
    | "CONFLICT_SOURCE_SELECTED"
    | "MANUAL_CONFIRMED"
    | "LOCKED",
  sourceValues: readonly string[],
  actualReviewTruth: "Akkoord" | "Correctie nodig" = "Correctie nodig",
) {
  return resolveCustomerFactResolutionPolicy({
    canonicalFactKey: "proof",
    scopeRef: "proof",
    comparisonRole: "proof",
    editable: browserResolution !== "LOCKED",
    evidenceReady: true,
    browserResolution,
    actualReviewTruth,
    sources: sourceValues.map((observedValue, index) => ({
      canonicalFactKey: "proof",
      scopeRef: "proof",
      comparisonRole: "proof",
      evidenceRootRef: `source:${index}`,
      observedValue,
      usable: true,
    })),
  }).projectedEnvalRoute;
}

const sourceInitial = renderToStaticMarkup(
  <CustomerDocumentFactInteraction model={model("SOURCE_UNRESOLVED")} />,
);
const sourceConfirmed = renderToStaticMarkup(
  <CustomerDocumentFactInteraction model={model("SOURCE_CONFIRMED")} />,
);
const manualConfirmed = renderToStaticMarkup(
  <CustomerDocumentFactInteraction model={model("MANUAL_CONFIRMED")} />,
);
const missing = renderToStaticMarkup(
  <CustomerDocumentFactInteraction
    model={model("MISSING_SOURCE_UNRESOLVED")}
  />,
);
const single = renderToStaticMarkup(
  <CustomerDocumentFactInteraction
    model={model("SINGLE_SOURCE_UNRESOLVED")}
  />,
);
const conflict = renderToStaticMarkup(
  <CustomerDocumentFactInteraction
    model={model("SOURCE_CONFLICT_UNRESOLVED")}
    sourceChoices={[{
      id: "contractholder-energy",
      documentLabel: "Energiedocument",
      fileName: "energy.pdf",
      value: "Proof Person",
      selectable: true,
      onSelect: () => undefined,
    }, {
      id: "contractholder-invoice",
      documentLabel: "Installatiefactuur",
      fileName: "invoice.pdf",
      value: "Dense Browser Testklant",
      selectable: true,
      onSelect: () => undefined,
    }]}
  />,
);
const manualEdit = renderToStaticMarkup(
  <CustomerDocumentFactInteraction model={model("MANUAL_EDIT")} />,
);
const evidenceNotReady = renderToStaticMarkup(
  <CustomerDocumentFactInteraction model={model("EVIDENCE_NOT_READY")} />,
);
const locked = renderToStaticMarkup(
  <CustomerDocumentFactInteraction model={model("LOCKED")} />,
);
const documentFirstSource = renderToStaticMarkup(
  <CustomerDocumentFactInteraction
    model={model("SOURCE_UNRESOLVED", false)}
  />,
);
const documentFirstMissing = renderToStaticMarkup(
  <CustomerDocumentFactInteraction
    model={model("MISSING_SOURCE_UNRESOLVED", false)}
  />,
);

assert(
  sourceInitial.includes('title="Bevestigen"') &&
    sourceInitial.includes('title="Corrigeren"') &&
    !sourceInitial.includes("<input"),
  "Q01_equal_source_global_actions_invalid",
);
assert(
  sourceConfirmed.includes("Bevestigd") &&
    sourceConfirmed.includes("customer-fact-confirmed-value") &&
    sourceConfirmed.includes('title="Bevestiging annuleren"') &&
    sourceConfirmed.includes("customer-fact-cancel") &&
    !sourceConfirmed.includes("customer-fact-edit") &&
    !sourceConfirmed.includes("status-pill"),
  "Q02_source_confirmed_customer_state_invalid",
);
assert(
  conflict.includes('title="Corrigeren"') &&
    conflict.match(/type="radio"/g)?.length === 2 &&
    !conflict.includes('type="text"') &&
    !conflict.includes('title="Bevestigen"'),
  "Q03_conflict_or_laadlocatie_initial_editor_invalid",
);
assert(
  manualConfirmed.includes("Handmatig Energie B.V.") &&
    manualConfirmed.includes("customer-fact-confirmed-value") &&
    manualConfirmed.includes("Handmatig aangepast:") &&
    manualConfirmed.includes('title="Correctie annuleren"') &&
    !manualConfirmed.includes("customer-fact-edit") &&
    !manualConfirmed.includes("status-pill"),
  "Q04_manual_confirmed_value_invalid",
);
assert(
  [missing, single].every((html) =>
    html.includes('title="Bevestigen niet beschikbaar"') &&
    html.includes('disabled=""') && html.includes('title="Corrigeren"') &&
    !html.includes('type="text"')
  ) &&
    manualEdit.includes('type="text"') &&
    manualEdit.includes('title="Correctie annuleren"') &&
    !manualEdit.includes("Bronwaarden gebruiken") &&
    evidenceNotReady.includes("Documentbewijs nog niet gereed") &&
    !evidenceNotReady.includes("<button") &&
    locked.includes("Vastgelegd") && !locked.includes("customer-fact-edit"),
  "Q05_missing_or_locked_state_invalid",
);
assert(
  documentFirstSource.includes('title="Bevestigen"') &&
    !documentFirstSource.includes('title="Corrigeren"') &&
    !documentFirstMissing.includes("<button") &&
    !documentFirstMissing.includes('type="text"'),
  "Q05_document_first_manual_entry_not_closed",
);

const equalMatrix = renderToStaticMarkup(
  <DocumentFactMatrix
    rows={[{
      id: "equal",
      given: "Bedrijfsnaam",
      sources: [{
        id: "energy:a",
        documentLabel: "Energiedocument",
        fileName: "energiecontract.pdf",
        value: "Dense Browser Testklant",
        selected: true,
      }, {
        id: "invoice:b",
        documentLabel: "Installatiefactuur",
        fileName: "installatiefactuur.pdf",
        value: "Dense Browser Testklant",
        selected: true,
      }],
      customer: model("SOURCE_CONFIRMED"),
      enval: "Klant bevestigd",
    }]}
    variant="customer"
  />,
);
let sourceSelectionCount = 0;
const conflictMatrix = renderToStaticMarkup(
  <DocumentFactMatrix
    rows={[{
      id: "conflict",
      given: "Contracthouder",
      sources: [{
        id: "energy:a",
        documentLabel: "Energiedocument",
        fileName: "energiecontract-met-een-bewust-zeer-lange-naam.pdf",
        value: "Proof Person met een bewust zeer lange bronwaarde",
        selected: false,
        selectable: true,
        onSelect: () => sourceSelectionCount++,
      }, {
        id: "invoice:b",
        documentLabel: "Installatiefactuur",
        fileName: "installatiefactuur.pdf",
        value: "Dense Browser Testklant",
        selected: false,
        selectable: true,
        onSelect: () => sourceSelectionCount++,
      }, {
        id: "third:c",
        documentLabel: "Installatiefactuur",
        fileName: "derde-bewijsbron.pdf",
        value: "Arbitrary Third Value",
        selected: false,
        selectable: true,
        onSelect: () => sourceSelectionCount++,
      }],
      customer: model("SOURCE_CONFLICT_UNRESOLVED"),
      enval: "Wacht op klant",
    }]}
    variant="customer"
  />,
);
const conflictResolvedMatrix = renderToStaticMarkup(
  <DocumentFactMatrix
    rows={[{
      id: "conflict-resolved",
      given: "Contracthouder",
      sources: [{
        id: "energy:a",
        documentLabel: "Energiedocument",
        fileName: "energiecontract.pdf",
        value: "Proof Person",
        selected: true,
      }, {
        id: "invoice:b",
        documentLabel: "Installatiefactuur",
        fileName: "installatiefactuur.pdf",
        value: "Dense Browser Testklant",
        selected: false,
      }],
      customer: model("SOURCE_CONFIRMED"),
      enval: "ENVAL checken",
    }]}
    variant="customer"
  />,
);
assert(
  equalMatrix.match(/customer-fact-confirmed-value/g)?.length === 3 &&
    !equalMatrix.includes('type="radio"') &&
    equalMatrix.includes("Klant bevestigd"),
  "Q06_equal_sources_highlight_or_route_invalid",
);
assert(
  conflictMatrix.match(/type="radio"/g)?.length === 3 &&
    !conflictMatrix.includes('checked=""') &&
    conflictMatrix.includes(
      "Kies Proof Person met een bewust zeer lange bronwaarde uit energiecontract",
    ) &&
    conflictMatrix.indexOf("Proof Person") <
      conflictMatrix.indexOf("Dense Browser Testklant") &&
    conflictResolvedMatrix.match(/customer-fact-confirmed-value/g)?.length ===
      2 &&
    !conflictResolvedMatrix.includes('type="radio"') &&
    conflictResolvedMatrix.includes('title="Bevestiging annuleren"') &&
    !conflictMatrix.includes(">+1</small>"),
  "Q07_conflicting_source_single_selection_invalid",
);
assert(sourceSelectionCount === 0, "Q08_render_mutated_source_selection");
const sourceInfoCell = conflictMatrix.slice(
  conflictMatrix.indexOf('class="fact-table__source-pairs"'),
  conflictMatrix.indexOf('class="fact-table__customer"'),
);
const customerCell = conflictMatrix.slice(
  conflictMatrix.indexOf('class="fact-table__customer"'),
  conflictMatrix.indexOf('class="fact-table__enval"'),
);
assert(
  !sourceInfoCell.includes("<input") &&
    !sourceInfoCell.includes("<button") &&
    sourceInfoCell.includes("fact-table__ellipsis") &&
    sourceInfoCell.includes("Energiedocument") &&
    sourceInfoCell.includes("Installatiefactuur") &&
    !sourceInfoCell.includes(
      "energiecontract-met-een-bewust-zeer-lange-naam.pdf",
    ) &&
    sourceInfoCell.includes(
      'title="Proof Person met een bewust zeer lange bronwaarde"',
    ) &&
    customerCell.match(/type="radio"/g)?.length === 3 &&
    customerCell.includes("customer-fact-source-choice-stack"),
  "Q09_source_info_or_customer_control_ownership_invalid",
);

const genericConflicts = [
  ["Proof Person", "Dense Browser Testklant"],
  ["Straat 1, 1234 AB Stad", "Andereweg 2, 5678 CD Plaats"],
  ["Alfen", "EVBox"],
].map((sourceValues) => classifyCustomerDocumentFactSourceValues(sourceValues));
assert(
  genericConflicts.every((state) => state === "SOURCE_CONFLICT_UNRESOLVED") &&
    classifyCustomerDocumentFactSourceValues([
        "Dense Browser Testklant",
        " Dense  Browser Testklant ",
      ]) === "SOURCE_UNRESOLVED" &&
    classifyCustomerDocumentFactSourceValues([]) ===
      "MISSING_SOURCE_UNRESOLVED",
  "Q10_generic_conflict_or_exact_normalization_invalid",
);

assert(
  projectedRoute("UNRESOLVED", ["a"]) === "Wacht op klant" &&
    projectedRoute("CLEAN_SOURCE_CONFIRMED", ["a"]) ===
      "Klant bevestigd" &&
    projectedRoute("UNRESOLVED", ["a", "b"]) === "Wacht op klant" &&
    projectedRoute("CONFLICT_SOURCE_SELECTED", ["a", "b"]) ===
      "ENVAL checken" &&
    projectedRoute("MANUAL_CONFIRMED", ["a"]) === "ENVAL checken" &&
    projectedRoute("LOCKED", ["a"]) === "Correctie nodig" &&
    projectedRoute("LOCKED", ["a"], "Akkoord") === "Akkoord",
  "Q11_projected_enval_route_invalid",
);
assert(
  [
    ["Clean source"],
    ["Conflicting A", "Conflicting B"],
    [],
  ].every((sourceValues) =>
    projectedRoute("UNRESOLVED", sourceValues) === "Wacht op klant"
  ),
  "Q12_cancel_did_not_reset_projected_route",
);

const signupReviewRow = {
  factKey: "partyName",
  scopeKey: "location:proof:contract-holder",
  proposedValue: "",
} as unknown as DocumentReviewRow;
const signupPresentationRow = {
  id: "location:party-name:proof",
  label: "Contracthouder",
  reviewRow: signupReviewRow,
  confirmationState: "unconfirmed",
  correctionState: "unchanged",
} as unknown as FactPresentationRow;
const signupSources = projectCustomerDocumentFactActiveSources([{
  sourceRef: "signup-energy:contract-holder",
  evidenceRootRef: "signup-energy",
  contentFingerprint: "c".repeat(64),
  fileName: "signup-energie.pdf",
  canonicalFactKey: "partyName",
  scopeRef: signupReviewRow.scopeKey,
  comparisonRole: signupPresentationRow.id,
  sourceDocumentType: "energy_bill_or_contract",
  semanticRole: "contract_holder",
  relationship: "direct",
  observedValue: "Voorbeeld Klant",
  current: true,
}]).matrixSources;
let signupConfirmedValue: unknown = null;
const unresolvedSignupModel = createSignupCustomerInteractionModel({
  activeSources: signupSources,
  evidenceReady: true,
  onConfirm: (_row, value) => {
    signupConfirmedValue = value;
  },
  onCorrect: () => undefined,
  onRestoreSource: () => undefined,
  row: signupPresentationRow,
});
assert(
  unresolvedSignupModel?.state === "SOURCE_UNRESOLVED" &&
    unresolvedSignupModel.sourceValue === "Voorbeeld Klant",
  "Q13_signup_source_confirm_not_available",
);
unresolvedSignupModel.onConfirm?.("Voorbeeld Klant", "source");
const confirmedSignupModel = createSignupCustomerInteractionModel({
  activeSources: signupSources,
  evidenceReady: true,
  onConfirm: () => undefined,
  onCorrect: () => undefined,
  onRestoreSource: () => undefined,
  row: {
    ...signupPresentationRow,
    confirmationState: "confirmed",
    customerConfirmedValue: "Voorbeeld Klant",
  },
});
const confirmedSignupHtml = confirmedSignupModel
  ? renderToStaticMarkup(
    <CustomerDocumentFactInteraction model={confirmedSignupModel} />,
  )
  : "";
assert(
  signupConfirmedValue === "Voorbeeld Klant" &&
    confirmedSignupModel?.state === "SOURCE_CONFIRMED" &&
    confirmedSignupModel.projectedEnvalRoute === "Klant bevestigd" &&
    confirmedSignupHtml.includes("Bevestigd") &&
    confirmedSignupHtml.includes('title="Bevestiging annuleren"'),
  "Q14_signup_confirm_transition_invalid",
);

const [
  workflow,
  matrixSource,
  interaction,
  signup,
  signupFactTable,
  signupShell,
  correction,
  registry,
  workspace,
  portal,
  sidebar,
  layoutCss,
  componentCss,
  resolutionPolicy,
  signupControls,
  workflowController,
] = await Promise.all([
  source("app/src/features/documents/DocumentEvidenceWorkflow.tsx"),
  source("app/src/features/documents/DocumentFactMatrix.tsx"),
  source("app/src/features/documents/CustomerDocumentFactInteraction.tsx"),
  source("app/src/features/signup/DocumentFirstDocumentsStep.tsx"),
  source("app/src/features/signup/presentation/FactTable.tsx"),
  source("app/src/features/signup/SignupPageShell.tsx"),
  source("app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx"),
  source("app/src/features/signup/documentFactRegistry.ts"),
  source("app/src/features/dashboard/customerCorrectionWorkspace.ts"),
  source("app/src/features/dashboard/DashboardPageShell.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("app/src/styles/layout.css"),
  source("app/src/styles/components.css"),
  source(
    "platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts",
  ),
  source("app/src/features/signup/presentation/FactReviewControls.tsx"),
  source("app/src/features/documents/CustomerDocumentWorkflowController.ts"),
]);

assert(
  signup.includes("<DocumentEvidenceWorkflow {...workflowModel} />") &&
    correction.includes("<DocumentEvidenceWorkflow {...workflowModel} />") &&
    workflow.includes("<DocumentFactMatrix") &&
    matrixSource.includes("<CustomerDocumentFactInteraction") &&
    !signup.includes("<DocumentFactMatrix") &&
    !correction.includes("<DocumentFactMatrix"),
  "Q10_one_external_workflow_architecture_invalid",
);
assert(
  [
    "EVIDENCE_NOT_READY",
    "SINGLE_SOURCE_UNRESOLVED",
    "SOURCE_UNRESOLVED",
    "SOURCE_CONFIRMED",
    "SOURCE_CONFLICT_UNRESOLVED",
    "MANUAL_EDIT",
    "MANUAL_CONFIRMED",
    "MISSING_SOURCE_UNRESOLVED",
    "LOCKED",
  ]
    .every((state) => interaction.includes(`| "${state}"`)) &&
    interaction.includes("Bevestiging annuleren") &&
    interaction.includes("Correctie annuleren") &&
    !interaction.includes("Bronwaarden gebruiken") &&
    signupShell.includes("selectSourceRow") &&
    signupFactTable.includes("onSelectSource") &&
    correction.includes("selectSourceValue"),
  "Q11_shared_interaction_or_source_selection_invalid",
);
assert(
  registry.includes('label: "Contracthouder"') &&
    interaction.includes('type="radio"') &&
    interaction.includes("customer-source-choice:${model.id}") &&
    !matrixSource.includes('type="radio"') &&
    componentCss.includes(".customer-fact-source-choice") &&
    componentCss.includes(".customer-fact-confirmed-value"),
  "Q12_registry_or_source_selection_presentation_invalid",
);
assert(
  workflowController.includes("resolveCustomerFactResolutionPolicy") &&
    workflowController.includes("actualReviewTruth: fact.actualReviewTruth") &&
    correction.includes("actualReviewTruth: factStatusByScopeAndFact.get") &&
    correction.includes(
      "correctionScopeFactKey(authorityScopeRef, definition.factKey)",
    ) &&
    correction.includes(
      "correctionAuthorityScopeRef(",
    ) &&
    !interaction.includes("server acceptance") &&
    !interaction.includes("workforce accepted"),
  "Q13_projection_not_derived_or_manufactures_acceptance",
);
assert(
  workspace.includes("resetCustomerCorrectionTargetLocalState") &&
    correction.includes("target.itemRefs.forEach") &&
    correction.includes("delete next[itemRef]") &&
    correction.includes("sourceIdentityByItemRef") &&
    correction.includes("upload.receipt.candidateRef"),
  "Q14_candidate_reset_or_source_identity_invalid",
);
assert(
  portal.includes("actionableDocumentWorkflow") &&
    portal.includes("setSidebarOpen(false)") &&
    portal.includes("setSidebarOpen(true)") &&
    portal.includes("collapsed={!sidebarOpen}") &&
    portal.includes("showToggle={actionableDocumentWorkflow}") &&
    !portal.includes("portal-sidebar-toggle") &&
    sidebar.includes("portal-sidebar--collapsed") &&
    sidebar.includes("portal-sidebar-toggle") &&
    sidebar.includes("aria-expanded={!collapsed}") &&
    layoutCss.includes("grid-template-columns: 72px minmax(0, 1fr)") &&
    !layoutCss.includes(".portal-sidebar[hidden]"),
  "Q15_navigation_rail_or_navigation_owned_toggle_invalid",
);
assert(
  !workflow.includes("sidebar") && !interaction.includes("sidebar") &&
    !signup.includes("sidebar") &&
    ![workflow, matrixSource, interaction, signup, correction, portal, sidebar]
      .some((value) => value.includes("style={{")),
  "Q16_navigation_coupling_or_inline_style_invalid",
);
assert(
  matrixSource.includes("row.sources.map((source)") &&
    matrixSource.includes("source.documentLabel") &&
    matrixSource.includes("aria-colspan={2}") &&
    matrixSource.includes("sourceChoices={row.sources}") &&
    workflowController.includes("projectCustomerDocumentFactActiveSources") &&
    workflowController.includes("documentLabel:") &&
    !signupFactTable.includes("createCustomerDocumentFactRows") &&
    !signupFactTable.includes('source.relationship !== "provenance_only"') &&
    componentCss.includes("text-overflow: ellipsis") &&
    componentCss.includes(".fact-table__source-pair") &&
    !matrixSource.includes(">+") &&
    !componentCss.includes("customer-correction-fact-table"),
  "Q17_source_alignment_or_mode_specific_css_invalid",
);
assert(
  correction.includes("setSourceSelections") &&
    correction.includes("setUnconfirmedParserPrefills") &&
    correction.includes("setDraft") &&
    correction.includes("invalidateChallenge") &&
    !correction.includes("aiFallback") && !workflow.includes("aiFallback"),
  "Q18_reset_or_ai_boundary_invalid",
);
assert(
  workflowController.includes("resolveCustomerFactResolutionPolicy") &&
    !signupControls.includes("resolveCustomerFactResolutionPolicy") &&
    !correction.includes("resolveCustomerFactResolutionPolicy") &&
    resolutionPolicy.includes("usableIndependentSourceCount") &&
    resolutionPolicy.includes("evidenceRootRef") &&
    !signupControls.includes("selectCustomerDocumentFactUnresolvedState") &&
    !correction.includes("selectCustomerDocumentFactUnresolvedState") &&
    !interaction.includes("resolveCustomerFactResolutionPolicy") &&
    !/(partyName|structuredAddress|electricityEan|chargerBrand|serialNumber)/
      .test(resolutionPolicy),
  "Q19_shared_generic_resolution_policy_invalid",
);
assert(
  signupControls.includes("onConfirm(reviewRow, value)") &&
    signupShell.includes("selectedValue ?? row.proposedValue") &&
    !signupShell.includes('row.decisionStatus === "missing"'),
  "Q20_signup_confirm_adapter_dropped_shared_value",
);

console.log("CUSTOMER04C3C8_INTERACTION_SOURCE_SIDEBAR_Q01_Q15=PASS");
console.log("CUSTOMER04C3C9_MULTI_SOURCE_PROJECTED_NAV_Q01_Q18=PASS");
console.log("CUSTOMER04C3C9A_CANCEL_ALIGNMENT_GENERIC_CONFLICT_Q01_Q20=PASS");
console.log("CUSTOMER04C3C9C_ZERO_ONE_MANUAL_INTERACTION=PASS");
console.log("CUSTOMER04C3C9H_PROJECTED_STATUS=PASS");
console.log("CUSTOMER04C_UI_PARITY_SIGNUP_CONFIRM=PASS");
Deno.exit(0);
