import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
  locationFactKey,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import {
  DOCUMENT_FIRST_ACCOUNT_TYPE_CONFIG,
  DOCUMENT_FIRST_STEPS,
  selectPersonalInfoAdapter,
  selectSigningReadiness,
} from "../../app/src/features/signup/documentFirstSignupSelectors.ts";

const ROOT = new URL("../../", import.meta.url);
let question = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass() {
  question += 1;
  console.log(
    `PILOT-SIGNUP-DOCUMENT-FIRST-UI-01-Q${
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

const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const flow = await source(
  "app/src/features/signup/DocumentFirstSignupFlow.tsx",
);
const account = await source(
  "app/src/features/signup/PersonalInfoSection.tsx",
);
const documents = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const organizationPanel = await source(
  "app/src/features/signup/OrganizationDocumentStepPanel.tsx",
);
const matrix = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const factTable = await source(
  "app/src/features/signup/presentation/FactTable.tsx",
);
const reviewControls = await source(
  "app/src/features/signup/presentation/FactReviewControls.tsx",
);
const presentationModel = await source(
  "app/src/features/signup/presentation/factPresentationModel.ts",
);
const matrixSelector = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
const registry = await source(
  "app/src/features/signup/documentFactRegistry.ts",
);
const model = await source(
  "app/src/features/signup/documentFirstSignupModel.ts",
);
const selectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const navigation = await source(
  "app/src/features/signup/SignupFlowNavigation.tsx",
);
const signing = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const mapper = await source("app/src/features/signup/signupSubmitMapper.ts");
const css = await source("app/src/styles/components.css");

assert(
  DOCUMENT_FIRST_STEPS.map((step) => step.label).join("|") ===
      "Account|Documenten|Ondertekenen" &&
    DOCUMENT_FIRST_STEPS.length === 3 &&
    (flow.match(/DOCUMENT_FIRST_STEPS\.map/g) || []).length === 1,
  "exact_three_visible_steps_missing",
);
pass();

assert(
  Object.keys(DOCUMENT_FIRST_ACCOUNT_TYPE_CONFIG).join("|") ===
      "particulier|zakelijk|vve" &&
    !account.includes("DOCUMENT_FIRST_ACCOUNT_TYPE_CONFIG") &&
    !account.includes("Bedrijfsnaam") && !account.includes("KVK nummer") &&
    selectPersonalInfoAdapter(createFreshDocumentFirstSignupDraft("zakelijk"))
        .accountType === "zakelijk",
  "shared_account_configuration_missing",
);
pass();

assert(
  shell.includes("OrganizationDocumentStepPanel") &&
    shell.includes('accountType !== "particulier"') &&
    organizationPanel.includes("KvK-uittreksel") &&
    organizationPanel.includes("DocumentUploadSlot") &&
    organizationPanel.includes("Controleer de organisatiegegevens") &&
    !organizationPanel.includes("parseInvoicePdfInput"),
  "step_one_organization_upload_and_compact_review_missing",
);
pass();

assert(
  documents.includes("DocumentUploadSlot") &&
    documents.includes("parseInvoicePdfInput") &&
    documents.includes("chargerDocumentsByChargerId") &&
    shell.includes("DocumentFirstCheckMatrix") &&
    shell.includes('activeStep === "documents"'),
  "step_two_upload_and_review_composition_missing",
);
pass();

assert(
  matrix.includes("locations.flatMap") && matrix.includes("sections.map") &&
    factTable.includes("visibleRows.map") &&
    factTable.includes("FactReviewControls") &&
    reviewControls.includes("Document vervangen") &&
    reviewControls.includes("CompactFactCorrectionEditor") &&
    reviewControls.includes("Andere waarde") &&
    !matrix.includes("compareEnergy") && !matrix.includes("compareCharger") &&
    matrixSelector.includes("selectDocumentReviewMatrix") &&
    matrixSelector.includes("selectDocumentFactApplicability") &&
    !registry.includes("requiredForReview"),
  "generic_matrix_or_inline_resolution_missing",
);
pass();

const draft = createFreshDocumentFirstSignupDraft("particulier");
const locationId = draft.locationOrder[0];
const holderKey = locationFactKey(locationId, "energy:contractHolder");
const corrected = documentFirstSignupReducer(draft, {
  type: "set_manual_correction",
  factKey: holderKey,
  canonicalFactKey: "partyName",
  value: "Voorbeeldnaam",
  sourceDocumentId: draft.energyDocumentsByLocationId[locationId].clientId,
  sourceDocumentType: "energy_bill_or_contract",
  observedFact: null,
  correctionType: "customer_declared_difference",
  confirmedAt: "2026-08-04T00:00:00.000Z",
  pendingPersistence: false,
});
const confirmed = documentFirstSignupReducer(corrected, {
  type: "confirm_fact",
  factKey: holderKey,
  canonicalFactKey: "partyName",
  value: "Voorbeeldnaam",
  sourceDocuments: [{
    documentId: draft.energyDocumentsByLocationId[locationId].clientId,
    documentType: "energy_bill_or_contract",
  }],
  confirmedAt: "2026-08-04T00:00:00.000Z",
  decisionStatus: "review_required",
  normalizationApplied: false,
  pendingPersistence: false,
});
assert(
  confirmed.manualCorrections[holderKey].canonicalValue === "Voorbeeldnaam" &&
    confirmed.customerConfirmations[holderKey].confirmationStatus ===
      "confirmed" &&
    confirmed.customerConfirmations[holderKey].correctedManually &&
    Object.keys(confirmed.parserObservations.byDocumentId).length === 0,
  "observed_corrected_confirmed_state_not_separate",
);
pass();

const replaced = documentFirstSignupReducer(confirmed, {
  type: "update_energy_document",
  document: {
    ...confirmed.energyDocumentsByLocationId[locationId],
    file: null,
    status: "empty",
  },
});
assert(
  !replaced.customerConfirmations[holderKey] &&
    !replaced.manualCorrections[holderKey],
  "document_dependency_invalidation_missing",
);
pass();

assert(
  navigation.includes("Vorige") && navigation.includes("Volgende") &&
    navigation.includes("disabled={!canContinue}") &&
    shell.includes("completeness.documents") &&
    selectors.includes("blockers.length === 0") === false &&
    matrixSelector.includes("blockers.length === 0"),
  "primary_footer_or_fail_closed_next_missing",
);
pass();

assert(
  signing.includes("selectUnifiedFactPresentation") &&
    signing.includes("presentation.locations") &&
    signing.includes("presentation.chargers") &&
    signing.includes("presentation.documents") &&
    !signing.includes("Aanvullend uit documenten") &&
    presentationModel.includes('"Handmatig aangepast"') &&
    presentationModel.includes("ENVAL-controle nodig") &&
    shell.includes("DocumentFirstSigningSummary") &&
    !shell.includes("ConsentSignatureSection") &&
    !shell.includes("Dossier starten") &&
    !shell.includes("submitSignupPayload") &&
    selectSigningReadiness(draft).ready === false,
  "confirmed_summary_or_signing_fail_closed_missing",
);
pass();

const customerUi = [
  shell,
  flow,
  account,
  organizationPanel,
  documents,
  matrix,
  navigation,
  signing,
]
  .join("\n");
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
    !customerUi.toLowerCase().includes(forbidden.toLowerCase()),
    `technical_metadata_or_inline_css:${forbidden}`,
  );
}
pass();

assert(
  model.includes("parserObservations") &&
    model.includes("customerConfirmations") &&
    model.includes("manualCorrections") &&
    model.includes("sourceDocuments") &&
    model.includes("confirmedAt") &&
    mapper.includes("assertExclusiveConnectionDeclarationSource") &&
    !mapper.includes("parserObservations") &&
    !mapper.includes("customerConfirmations"),
  "canonical_model_or_mapper_boundary_missing",
);
pass();

assert(
  css.includes(".signup-flow-document-first") &&
    css.includes(".document-upload-grid") &&
    css.includes(".fact-table") &&
    css.includes(".signing-document") &&
    css.includes("@media (max-width: 700px)") &&
    css.includes("content: attr(data-label)") &&
    !customerUi.includes("style={{"),
  "compact_responsive_css_missing",
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

console.log("signup-document-first-ui-proof-ok");
