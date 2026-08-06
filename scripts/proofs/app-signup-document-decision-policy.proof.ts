import { getConfirmableEnergyEanCandidates } from "../../app/src/features/invoice-analysis/energyEanCandidateExtractor.ts";
import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import {
  compareDocumentFactValues,
  decideDocumentFact,
  type DocumentFactDecisionStatus,
} from "../../app/src/features/signup/documentFactDecisionPolicy.ts";
import type {
  DocumentFactKey,
  DocumentFactObservation,
  DocumentSemanticRole,
  DocumentSourceType,
} from "../../app/src/features/signup/documentFactRegistry.ts";
import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import { selectDocumentReviewMatrix } from "../../app/src/features/signup/documentReviewMatrix.ts";
import { projectEnergyEanCandidates } from "../../app/src/features/signup/documentSemanticProjector.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
}

async function requiredFixture(variable: string): Promise<Uint8Array> {
  const path = Deno.env.get(variable);
  assert(path, `required_fixture_env_missing:${variable}`);
  return await Deno.readFile(path);
}

async function sha256(path: string): Promise<string> {
  const bytes = await Deno.readFile(new URL(path, ROOT));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function observation(
  factKey: DocumentFactKey,
  value: string | null,
  semanticRole: DocumentSemanticRole,
  sourceDocumentType: DocumentSourceType = "energy_bill_or_contract",
  extractionStatus: DocumentFactObservation["extractionStatus"] = value
    ? "found"
    : "not_found",
): DocumentFactObservation {
  return {
    factKey,
    value,
    sourceDocumentId: `${sourceDocumentType}:fixture`,
    sourceDocumentType,
    semanticRole,
    extractionStatus,
    confidence: value ? "high" : "unavailable",
    sourcePage: null,
    displayable: extractionStatus === "found" && Boolean(value),
    rejectionReason: null,
  };
}

function status(
  factKey: DocumentFactKey,
  declaredValue: string | null,
  observations: DocumentFactObservation[],
  correctedValue: string | null = null,
  confirmedValue: string | null = null,
): DocumentFactDecisionStatus {
  return decideDocumentFact({
    factKey,
    declaredValue,
    observations,
    correctedValue,
    confirmedValue,
  }).status;
}

const policy = await source(
  "app/src/features/signup/documentFactDecisionPolicy.ts",
);
const applicability = await source(
  "app/src/features/signup/documentFactApplicability.ts",
);
const matrixUi = await source(
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
const documentsUi = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const uploadSlot = await source(
  "app/src/features/signup/DocumentUploadSlot.tsx",
);
const signingSummary = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const navigation = await source(
  "app/src/features/signup/SignupFlowNavigation.tsx",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const mapper = await source("app/src/features/signup/signupSubmitMapper.ts");
const css = await source("app/src/styles/components.css");

for (
  const decisionStatus of [
    "clean_match",
    "normalized_match",
    "review_required",
    "blocked",
    "missing",
    "ambiguous",
    "not_applicable",
  ]
) {
  assert(
    policy.includes(`"${decisionStatus}"`),
    `status_missing:${decisionStatus}`,
  );
}
assert(
  applicability.includes('"required"') &&
    applicability.includes('"informational"') &&
    applicability.includes('"not_applicable"') &&
    !policy.includes("selectDocumentFactApplicability"),
  "applicability_widened_decision_policy",
);

assert(
  compareDocumentFactValues("partyName", "D. de Vries", "Daan de Vries") ===
      "normalized" &&
    compareDocumentFactValues("partyName", "Daa de Vries", "Daan de Vries") ===
      "different" &&
    compareDocumentFactValues("partyName", "Daan d Vries", "D. de Vries") ===
      "different" &&
    compareDocumentFactValues(
        "structuredAddress",
        "Dorpsweg 28 1",
        "dorpsweg 28-1",
      ) ===
      "normalized" &&
    compareDocumentFactValues(
        "electricityEan",
        "8710 0000 0000 0000 01",
        "871000000000000001",
      ) === "normalized" &&
    compareDocumentFactValues("midNumber", "MID-AB 01", "mid ab01") ===
      "normalized",
  "bounded_normalization_policy_failed",
);

const roleDifference = [
  observation("partyName", "A. Voorbeeld", "contract_holder"),
  observation(
    "partyName",
    "B. Voorbeeld",
    "buyer_or_customer",
    "installation_invoice",
  ),
];
const reviewBefore = decideDocumentFact({
  factKey: "partyName",
  declaredValue: "A. Voorbeeld",
  observations: roleDifference,
  correctedValue: null,
  confirmedValue: null,
});
const reviewAfter = decideDocumentFact({
  factKey: "partyName",
  declaredValue: "A. Voorbeeld",
  observations: roleDifference,
  correctedValue: null,
  confirmedValue: "A. Voorbeeld",
});
assert(
  reviewBefore.status === "review_required" && reviewBefore.blocksProgress &&
    reviewAfter.status === "review_required" && !reviewAfter.blocksProgress &&
    reviewAfter.canonicalValue === "A. Voorbeeld",
  "customer_intent_erased_review_status",
);

const cleanBeforeConfirmation = decideDocumentFact({
  factKey: "chargerBrand",
  declaredValue: "Merk A",
  observations: [
    observation(
      "chargerBrand",
      "Merk A",
      "charger_asset",
      "installation_invoice",
    ),
  ],
  correctedValue: null,
  confirmedValue: null,
});
assert(
  cleanBeforeConfirmation.status === "clean_match" &&
    cleanBeforeConfirmation.canonicalValue === "" &&
    cleanBeforeConfirmation.blocksProgress,
  "clean_match_was_canonical_before_confirmation",
);

const blockedDecision = decideDocumentFact({
  factKey: "electricityEan",
  declaredValue: "871000000000000001",
  observations: [
    observation(
      "electricityEan",
      "871000000000000002",
      "electricity_connection",
    ),
  ],
  correctedValue: null,
  confirmedValue: null,
});
assert(
  blockedDecision.status === "blocked" && blockedDecision.blocksProgress &&
    !blockedDecision.needsCustomerIntent &&
    blockedDecision.canonicalValue === "",
  "blocked_decision_allowed_progress_or_override",
);

assert(
  status("partyName", null, [
        observation("partyName", "A. Voorbeeld", "contract_holder"),
        observation("partyName", "B. Voorbeeld", "contract_holder"),
      ]) === "blocked" &&
    status("electricityEan", "871000000000000001", [
        observation(
          "electricityEan",
          "871000000000000002",
          "electricity_connection",
        ),
      ]) === "blocked" &&
    status("midNumber", "MID-A", [
        observation(
          "midNumber",
          "MID-B",
          "charger_asset",
          "installation_invoice",
        ),
      ]) === "blocked" &&
    status("serialNumber", "SER-A", [
        observation(
          "serialNumber",
          "SER-B",
          "charger_asset",
          "installation_invoice",
        ),
      ]) === "blocked" &&
    status("structuredAddress", null, [
        observation("structuredAddress", "Adres 1", "delivery_address"),
        observation(
          "structuredAddress",
          "Adres 2",
          "installation_or_delivery_address",
          "installation_invoice",
        ),
      ]) === "blocked" &&
    status(
        "electricityEan",
        "871000000000000001",
        [
          observation(
            "electricityEan",
            "871000000000000002",
            "electricity_connection",
          ),
        ],
        "871000000000000001",
        "871000000000000001",
      ) === "review_required" &&
    status("chargerModel", null, [
        observation(
          "chargerModel",
          null,
          "charger_asset",
          "installation_invoice",
          "rejected",
        ),
      ]) === "blocked",
  "hard_conflict_policy_failed",
);

assert(
  status("chargerBrand", null, []) === "missing" &&
    status("electricityEan", null, [
        observation(
          "electricityEan",
          null,
          "electricity_connection",
          "energy_bill_or_contract",
          "ambiguous",
        ),
      ]) === "ambiguous" &&
    status("chargerBrand", null, [
        observation(
          "chargerBrand",
          null,
          "not_applicable",
          "energy_bill_or_contract",
          "not_applicable",
        ),
      ]) === "not_applicable" &&
    status(
        "chargerModel",
        "Model A",
        [
          observation(
            "chargerModel",
            "Model A",
            "charger_asset",
            "installation_invoice",
          ),
        ],
        "Model B",
        "Model B",
      ) === "review_required",
  "missing_ambiguous_not_applicable_or_correction_policy_failed",
);

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
const matrix = selectDocumentReviewMatrix(draft, locationId, chargerId);
const realParty = matrix.rows.find((row) => row.factKey === "partyName");
const realAddress = matrix.rows.find((row) =>
  row.factKey === "structuredAddress"
);
const realEan = matrix.rows.find((row) => row.factKey === "electricityEan");
assert(
  realParty?.decisionStatus === "review_required" &&
    realAddress?.decisionStatus === "review_required" &&
    realAddress.chargerDocument.semanticRole === "invoice_address" &&
    realEan?.energyDocument.semanticRole === "electricity_connection" &&
    realEan.chargerDocument.status === "not_found",
  "real_fixture_semantic_roles_failed",
);
for (
  const factKey of [
    "chargerBrand",
    "chargerModel",
    "midNumber",
    "serialNumber",
  ] as const
) {
  const row = matrix.rows.find((candidate) => candidate.factKey === factKey);
  assert(
    row?.energyDocument.status === "not_found" &&
      row.chargerDocument.semanticRole === "charger_asset",
    `real_fixture_charger_role_failed:${factKey}`,
  );
}

const exactHeaders = [
  "Gegeven",
  "Waarde",
  "Bronnen",
  "Bevestiging / correctie",
  "Oordeel",
];
let previousHeaderIndex = -1;
for (const header of exactHeaders) {
  const index = factTable.indexOf(`"${header}"`);
  assert(
    index > previousHeaderIndex,
    `matrix_header_missing_or_out_of_order:${header}`,
  );
  previousHeaderIndex = index;
}
assert(
  !factTable.includes("Opgegeven") && !factTable.includes("Niet opgegeven") &&
    reviewControls.includes("button button-secondary button-compact") &&
    !reviewControls.includes("button-link") &&
    reviewControls.includes("CompactFactCorrectionEditor") &&
    factTable.includes("fact-table__action-cell") &&
    factTable.includes("row.canonicalValue") &&
    reviewControls.includes("row.actions") &&
    presentationModel.includes('row.applicability === "not_applicable"') &&
    factTable.includes('row.canonicalValue || "—"') &&
    !factTable.includes("Niet gevonden") &&
    ![matrixUi, factTable, reviewControls].some((value) =>
      value.includes("style={{")
    ),
  "canonical_matrix_ui_contract_failed",
);

assert(
  (documentsUi.match(/Energienota of energiecontract/g) || []).length === 1 &&
    (documentsUi.match(/title="Installatiefactuur"/g) || []).length === 1 &&
    documentsUi.includes("document-upload-grid") &&
    documentsUi.includes("hideDocumentLabel") &&
    uploadSlot.includes("document-selected-file") &&
    uploadSlot.includes("safeDocumentFilename") &&
    uploadSlot.includes("slice(0, 180)") &&
    css.includes(".document-upload-grid") &&
    css.includes("auto-fit") &&
    css.includes("min(100%, 260px)"),
  "compact_upload_grid_contract_failed",
);

assert(
  signingSummary.includes("presentation.account") &&
    signingSummary.includes("presentation.locations") &&
    signingSummary.includes("presentation.chargers") &&
    signingSummary.includes("presentation.documents") &&
    signingSummary.includes('variant="document"') &&
    presentationModel.includes("ENVAL-controle nodig") &&
    !navigation.includes("Ondertekenen") &&
    !navigation.includes("aria-disabled") &&
    !shell.includes("Dossier starten") &&
    !shell.includes("submitSignupPayload") &&
    !signingSummary.includes("snapshotHash") &&
    !signingSummary.includes("immutable snapshot") &&
    !signingSummary.includes("legalTextVersion") &&
    !signingSummary.includes("reauthentication") &&
    !signingSummary.includes("auditmetadata") &&
    !signingSummary.includes("authorityEvidence") &&
    !signingSummary.includes("style={{"),
  "compact_signing_summary_or_hidden_sign_action_failed",
);

assert(
  policy.includes('"parser_correction"') &&
    policy.includes('"customer_declared_difference"') &&
    !mapper.includes("parserObservations") &&
    !mapper.includes("customerConfirmations") &&
    !mapper.includes("manualCorrections"),
  "correction_types_or_mapper_boundary_failed",
);

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

assert(
  (await source("scripts/proofs/app-signup-document-decision-policy.proof.ts"))
    .match(/console\.log\(/g)?.length === 1,
  "proof_output_may_expose_fixture_values",
);

console.log("signup-document-decision-policy-03-proof-ok");
