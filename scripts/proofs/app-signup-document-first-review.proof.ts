import { getConfirmableEnergyEanCandidates } from "../../app/src/features/invoice-analysis/energyEanCandidateExtractor.ts";
import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { selectDocumentFactApplicability } from "../../app/src/features/signup/documentFactApplicability.ts";
import { DOCUMENT_FACT_REGISTRY } from "../../app/src/features/signup/documentFactRegistry.ts";
import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import { DOCUMENT_FIRST_STEPS } from "../../app/src/features/signup/documentFirstSignupSelectors.ts";
import { selectDocumentReviewMatrix } from "../../app/src/features/signup/documentReviewMatrix.ts";
import { projectEnergyEanCandidates } from "../../app/src/features/signup/documentSemanticProjector.ts";

const ROOT = new URL("../../", import.meta.url);
let question = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass() {
  question += 1;
  console.log(
    `PILOT-SIGNUP-DOCUMENT-FIRST-REVIEW-02-Q${
      String(question).padStart(2, "0")
    }: PASS`,
  );
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

async function sha256(path: string): Promise<string> {
  const bytes = await Deno.readFile(new URL(path, ROOT));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function requiredFixture(variable: string): Promise<Uint8Array> {
  const path = Deno.env.get(variable);
  assert(path, `required_fixture_env_missing:${variable}`);
  return await Deno.readFile(path);
}

const registry = await source(
  "app/src/features/signup/documentFactRegistry.ts",
);
const matrixSelector = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
const semanticProjector = await source(
  "app/src/features/signup/documentSemanticProjector.ts",
);
const decisionPolicy = await source(
  "app/src/features/signup/documentFactDecisionPolicy.ts",
);
const matrixUi = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const documentsUi = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const navigation = await source(
  "app/src/features/signup/SignupFlowNavigation.tsx",
);
const signingSummary = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const model = await source(
  "app/src/features/signup/documentFirstSignupModel.ts",
);
const selectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const mapper = await source("app/src/features/signup/signupSubmitMapper.ts");
const css = await source("app/src/styles/components.css");

assert(
  DOCUMENT_FIRST_STEPS.map((step) => step.label).join("|") ===
      "Account|Documenten|Ondertekenen" &&
    DOCUMENT_FIRST_STEPS.length === 3 &&
    !selectors.includes('id: "review"') &&
    !selectors.includes('id: "gaps"'),
  "exact_three_step_journey_missing",
);
pass();

for (
  const key of [
    "partyName",
    "partyRole",
    "structuredAddress",
    "electricityEan",
    "energySupplier",
    "contractStart",
    "contractEnd",
    "kvkNumber",
    "installerOrSupplier",
    "chargerBrand",
    "chargerModel",
    "midNumber",
    "serialNumber",
    "invoiceDate",
    "explicitInstallationDate",
  ]
) {
  assert(
    DOCUMENT_FACT_REGISTRY.some((fact) => fact.key === key),
    `registry_fact_missing:${key}`,
  );
}
for (
  const status of [
    "found",
    "not_found",
    "not_applicable",
    "ambiguous",
    "rejected",
  ]
) {
  assert(
    registry.includes(`"${status}"`),
    `extraction_status_missing:${status}`,
  );
}
for (
  const field of [
    "value",
    "sourceDocumentId",
    "sourceDocumentType",
    "semanticRole",
    "extractionStatus",
    "confidence",
    "sourcePage",
    "displayable",
    "rejectionReason",
  ]
) {
  assert(registry.includes(field), `fact_metadata_missing:${field}`);
}
pass();

assert(
  DOCUMENT_FACT_REGISTRY.filter((fact) =>
        selectDocumentFactApplicability("particulier", fact.key) === "required"
      ).map((fact) => fact.key).join("|") ===
      "partyName|structuredAddress|electricityEan|chargerBrand|chargerModel|midNumber|serialNumber" &&
    matrixUi.includes("Gegeven") &&
    !matrixUi.includes("Opgegeven") &&
    matrixUi.includes("Energiecontract/-nota") &&
    matrixUi.includes("Installatiefactuur") &&
    matrixUi.includes("Actie") &&
    matrixUi.includes("Wordt gebruikt") &&
    !matrixUi.includes("Niet opgegeven") &&
    matrixUi.includes("rows.map") &&
    !matrixUi.includes("compareEnergy") &&
    !matrixUi.includes("compareCharger"),
  "single_generic_row_registry_or_matrix_columns_missing",
);
pass();

const energyBytes = await requiredFixture("ENVAL_EAN_REAL_PDF");
const chargerBytes = await requiredFixture("ENVAL_CHARGER_REAL_PDF");
const energyResult = await parseInvoicePdfInput(energyBytes);
const chargerResult = await parseInvoicePdfInput(chargerBytes);
assert(energyResult.ok && chargerResult.ok, "real_fixture_parse_failed");

let draft = createFreshDocumentFirstSignupDraft("particulier");
const locationId = draft.locationOrder[0];
const chargerId = draft.chargerOrderByLocationId[locationId][0];
const energyDocument = draft.energyDocumentsByLocationId[locationId];
const chargerDocument = draft.chargerDocumentsByChargerId[chargerId].find(
  (document) => document.documentType === "installation_invoice",
);
assert(chargerDocument, "charger_document_slot_missing");
draft = documentFirstSignupReducer(draft, {
  type: "update_energy_document",
  document: {
    ...energyDocument,
    file: new File([energyBytes.buffer as ArrayBuffer], "energy-fixture.pdf", {
      type: "application/pdf",
    }),
    status: "selected",
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "set_document_observation",
  documentId: energyDocument.clientId,
  value: {
    documentId: energyDocument.clientId,
    contentFingerprint: energyResult.observation_envelope.contentFingerprint,
    parserVersion: energyResult.parser_version,
    envelope: energyResult.observation_envelope,
  },
});
const energyCandidates = projectEnergyEanCandidates(
  energyResult.observation_envelope,
);
const confirmable = getConfirmableEnergyEanCandidates(
  energyCandidates,
);
draft = documentFirstSignupReducer(draft, {
  type: "update_connection_declaration",
  locationId,
  value: {
    sourceMode: "document",
    preflightStatus: confirmable.length === 1
      ? "electricity_candidate_found"
      : "multiple_candidates",
    candidates: energyCandidates,
    selectedCandidateEan: confirmable.length === 1
      ? confirmable[0].normalizedEan
      : "",
    confirmedEan: "",
    manualEan: "",
    customerConfirmed: false,
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "update_charger_document",
  document: {
    ...chargerDocument,
    file: new File(
      [chargerBytes.buffer as ArrayBuffer],
      "charger-fixture.pdf",
      {
        type: "application/pdf",
      },
    ),
    status: "selected",
    observation: null,
    parseStatus: "parsed",
  },
});
draft = documentFirstSignupReducer(draft, {
  type: "set_document_observation",
  documentId: chargerDocument.clientId,
  value: {
    documentId: chargerDocument.clientId,
    contentFingerprint: chargerResult.observation_envelope.contentFingerprint,
    parserVersion: chargerResult.parser_version,
    envelope: chargerResult.observation_envelope,
  },
});

let matrix = selectDocumentReviewMatrix(draft, locationId, chargerId);
const partyRow = matrix.rows.find((row) => row.factKey === "partyName");
const addressRow = matrix.rows.find((row) =>
  row.factKey === "structuredAddress"
);
assert(
  partyRow?.decisionStatus === "review_required" &&
    partyRow.action === "Oplossen" &&
    addressRow?.decisionStatus === "review_required" &&
    addressRow.action === "Oplossen" &&
    matrix.blockers.includes(partyRow) && matrix.blockers.includes(addressRow),
  "real_cross_document_role_differences_not_review_required",
);
assert(
  matrix.blockers.length ===
    matrix.rows.filter((row) =>
      row.decisionStatus === "blocked" || (row.required && row.blocksProgress)
    ).length,
  "arbitrary_two_difference_limit_detected",
);
pass();

assert(
  semanticProjector.includes("buyer_or_customer") &&
    semanticProjector.includes("invoice_address") &&
    !semanticProjector.includes(
      '"invoice_address",\n      "installation_address"',
    ) &&
    decisionPolicy.includes("boundedPartyMatch") &&
    matrixSelector.includes('factKey === "invoiceDate"') === false &&
    registry.includes('"invoice_date"') &&
    registry.includes('"explicit_installation_date"'),
  "semantic_party_address_or_date_boundaries_missing",
);
pass();

for (const label of ["Bevestigen", "Oplossen", "Invullen", "Kiezen"]) {
  assert(
    `${matrixUi}\n${matrixSelector}`.includes(label),
    `row_action_missing:${label}`,
  );
}
assert(
  matrixUi.includes("Document vervangen") &&
    matrixUi.includes("Waarde corrigeren") &&
    matrixUi.includes("document-first-confirmed") &&
    !matrixUi.includes("Corrigeren") &&
    (matrixUi.match(/row\.action/g) || []).length >= 1,
  "one_action_or_inline_resolution_contract_missing",
);
pass();

assert(partyRow, "party_row_missing");
const preservedObservation =
  draft.parserObservations.byDocumentId[energyDocument.clientId];
draft = documentFirstSignupReducer(draft, {
  type: "set_manual_correction",
  factKey: partyRow.scopeKey,
  canonicalFactKey: partyRow.factKey,
  value: partyRow.energyDocument.value || "corrected",
  sourceDocumentId: partyRow.sourceDocuments[0].documentId,
  sourceDocumentType: partyRow.sourceDocuments[0].documentType,
  observedFact: partyRow.observations[0] || null,
  correctionType: "customer_declared_difference",
  confirmedAt: "2026-08-04T00:00:00.000Z",
  pendingPersistence: false,
});
matrix = selectDocumentReviewMatrix(draft, locationId, chargerId);
const correctedParty = matrix.rows.find((row) => row.factKey === "partyName");
assert(
  correctedParty?.decisionStatus === "review_required" &&
    correctedParty.blocksProgress &&
    draft.parserObservations.byDocumentId[energyDocument.clientId] ===
      preservedObservation &&
    draft.manualCorrections[partyRow.scopeKey].observedFact ===
      partyRow.observations[0] &&
    draft.manualCorrections[partyRow.scopeKey].correctionType ===
      "customer_declared_difference",
  "manual_correction_did_not_preserve_observation_or_review_status",
);
assert(correctedParty, "corrected_party_row_missing");
draft = documentFirstSignupReducer(draft, {
  type: "confirm_fact",
  factKey: correctedParty.scopeKey,
  canonicalFactKey: correctedParty.factKey,
  value: correctedParty.proposedValue,
  sourceDocuments: correctedParty.sourceDocuments,
  confirmedAt: "2026-08-04T00:00:00.000Z",
  decisionStatus: "review_required",
  normalizationApplied: false,
  pendingPersistence: false,
});
matrix = selectDocumentReviewMatrix(draft, locationId, chargerId);
assert(
  matrix.rows.find((row) => row.factKey === "partyName")?.decisionStatus ===
      "review_required" &&
    !matrix.rows.find((row) => row.factKey === "partyName")
      ?.blocksProgress &&
    draft.customerConfirmations[correctedParty.scopeKey]
        .confirmationStatus === "confirmed" &&
    draft.customerConfirmations[correctedParty.scopeKey].correctedManually &&
    draft.customerConfirmations[correctedParty.scopeKey].confirmedAt ===
      "2026-08-04T00:00:00.000Z",
  "canonical_fact_confirmation_contract_missing",
);
pass();

const energyOnlyScope = matrix.rows.find((row) =>
  row.factKey === "electricityEan"
);
assert(energyOnlyScope, "ean_row_missing");
draft = documentFirstSignupReducer(draft, {
  type: "confirm_fact",
  factKey: energyOnlyScope.scopeKey,
  canonicalFactKey: energyOnlyScope.factKey,
  value: energyOnlyScope.proposedValue,
  sourceDocuments: energyOnlyScope.sourceDocuments,
  confirmedAt: "2026-08-04T00:00:01.000Z",
  decisionStatus: energyOnlyScope.decisionStatus,
  normalizationApplied: energyOnlyScope.normalizationApplied,
  pendingPersistence: false,
});
draft = documentFirstSignupReducer(draft, {
  type: "update_charger_document",
  document: {
    ...chargerDocument,
    file: null,
    status: "empty",
    observation: null,
    parseStatus: "idle",
  },
});
assert(
  !draft.customerConfirmations[correctedParty.scopeKey] &&
    draft.customerConfirmations[energyOnlyScope.scopeKey],
  "document_replacement_did_not_invalidate_only_dependent_confirmations",
);
pass();

assert(
  navigation.includes("Vorige") && navigation.includes("Volgende") &&
    navigation.includes("disabled={!canContinue}") &&
    documentsUi.includes("DocumentUploadSlot") &&
    shell.includes("completeness.documents") &&
    selectors.includes("selectDocumentReviewMatrix") &&
    matrixSelector.includes("blockers.length === 0"),
  "shared_navigation_or_fail_closed_step_two_missing",
);
pass();

assert(
  signingSummary.includes("customerConfirmations") &&
    signingSummary.includes("safeDocumentFilename") &&
    signingSummary.includes("Account") &&
    signingSummary.includes("Locaties") &&
    signingSummary.includes("Documenten") &&
    signingSummary.includes("Laadpalen") &&
    signingSummary.includes("MID") &&
    signingSummary.includes("Serienummer") &&
    shell.includes("DocumentFirstSigningSummary") &&
    !shell.includes("ConsentSignatureSection") &&
    !shell.includes("Dossier starten") &&
    !shell.includes("submitSignupPayload") &&
    !navigation.includes("Ondertekenen"),
  "confirmed_only_summary_or_fail_closed_signing_missing",
);
pass();

const customerUi = [matrixUi, documentsUi, signingSummary, shell].join("\n");
for (
  const forbidden of [
    "sourcePage",
    "rejectionReason",
    "parser_version",
    "raw context",
    "style={{",
  ]
) {
  assert(
    !customerUi.toLocaleLowerCase("nl-NL").includes(
      forbidden.toLocaleLowerCase("nl-NL"),
    ),
    `technical_metadata_or_inline_css_visible:${forbidden}`,
  );
}
assert(
  mapper.includes("assertExclusiveConnectionDeclarationSource") &&
    !mapper.includes("parserObservations") &&
    !mapper.includes("customerConfirmations") &&
    !mapper.includes("manualCorrections"),
  "mapper_boundary_changed",
);
pass();

assert(
  css.includes(".signup-flow-document-first") &&
    css.includes(".document-first-matrix") &&
    css.includes("grid-template-columns") &&
    css.includes("@media (max-width: 700px)") &&
    css.includes("content: attr(data-label)") &&
    !customerUi.includes("style={{"),
  "desktop_mobile_matrix_contract_missing",
);
pass();

assert(
  model.includes("sourceDocuments") &&
    model.includes("confirmationStatus") &&
    model.includes("confirmedAt") &&
    model.includes("correctedManually") &&
    model.includes("invalidateDocumentConfirmations") &&
    model.includes("invalidateCorrectionsForDocument"),
  "confirmation_or_dependency_invalidation_model_missing",
);
pass();

for (
  const [path, expected] of [
    [
      "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql",
      "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
    ],
    [
      "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql",
      "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
    ],
    [
      "supabase/functions/api-app-signup-submit/index.ts",
      "fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3",
    ],
  ] as const
) {
  assert(await sha256(path) === expected, `protected_hash_mismatch:${path}`);
}
pass();

console.log("signup-document-first-review-02-proof-ok");
