import {
  createFreshDocumentFirstSignupDraft,
  documentFirstSignupReducer,
} from "../../app/src/features/signup/documentFirstSignupModel.ts";
import type { DocumentReviewRow } from "../../app/src/features/signup/documentReviewMatrix.ts";
import {
  projectFactPresentationRow,
  selectUnifiedFactPresentation,
} from "../../app/src/features/signup/presentation/factPresentationModel.ts";

const ROOT = new URL("../../", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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

function reviewRow(
  overrides: Partial<DocumentReviewRow> = {},
): DocumentReviewRow {
  return {
    factKey: "chargerBrand",
    scopeKey: "charger:charger_a:brand",
    label: "Merk",
    declared: {
      value: null,
      status: "not_found",
      semanticRole: "charger_asset",
    },
    organizationDocument: {
      value: null,
      status: "not_applicable",
      semanticRole: "not_applicable",
    },
    energyDocument: {
      value: null,
      status: "not_applicable",
      semanticRole: "not_applicable",
    },
    chargerDocument: {
      value: "Alfen",
      status: "found",
      semanticRole: "charger_asset",
    },
    decisionStatus: "clean_match",
    statusLabel: "",
    action: "Bevestigen",
    canonicalValue: "",
    proposedValue: "Alfen",
    sourceDocuments: [{
      documentId: "invoice_a",
      documentType: "installation_invoice",
    }],
    choices: ["Alfen"],
    correctedManually: false,
    confirmed: false,
    normalizationApplied: false,
    blocksProgress: true,
    observations: [{
      factKey: "chargerBrand",
      value: "Alfen",
      sourceDocumentId: "invoice_a",
      sourceDocumentType: "installation_invoice",
      semanticRole: "charger_asset",
      extractionStatus: "found",
      confidence: "high",
      sourcePage: 1,
      displayable: true,
      rejectionReason: null,
    }],
    applicability: "required",
    required: true,
    ...overrides,
  };
}

const organization = await source(
  "app/src/features/signup/OrganizationDocumentStepPanel.tsx",
);
const review = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const signing = await source(
  "app/src/features/signup/DocumentFirstSigningSummary.tsx",
);
const documents = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const upload = await source("app/src/features/signup/DocumentUploadSlot.tsx");
const table = await source(
  "app/src/features/signup/presentation/FactTable.tsx",
);
const controls = await source(
  "app/src/features/signup/presentation/FactReviewControls.tsx",
);
const model = await source(
  "app/src/features/signup/presentation/factPresentationModel.ts",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const css = await source("app/src/styles/components.css");

assert(
  [organization, review, signing].every((value) =>
    value.includes("FactTable")
  ) &&
    table.includes("FactReviewControls") &&
    organization.includes('variant="review"') &&
    review.includes('variant="review"') &&
    signing.includes('variant="document"'),
  "shared_fact_table_or_controls_missing",
);
assert(
  organization.includes("DocumentUploadSlot") &&
    documents.includes("DocumentUploadSlot") &&
    organization.includes('title="KvK-uittreksel"') &&
    documents.includes('title="Energienota of energiecontract"') &&
    documents.includes('title="Installatiefactuur"') &&
    (upload.match(/export function DocumentUploadSlot/g) || []).length === 1 &&
    (table.match(/export function FactTable/g) || []).length === 1,
  "single_upload_or_table_family_missing",
);
assert(
  ![organization, review, signing, documents, upload, table, controls, shell]
    .some((value) => value.includes("style={{")) &&
    ![organization, review, signing, documents, upload, table, controls, model]
      .some((value) => /\.css["']/.test(value)),
  "inline_css_or_new_stylesheet_reference",
);
assert(
  controls.includes("Bevestigen") && controls.includes("Corrigeren") &&
    controls.includes("CompactFactCorrectionEditor") &&
    table.includes('className="fact-table__action-cell"') &&
    table.includes('className="fact-table__judgment"') &&
    css.includes(".fact-table--five-columns") &&
    css.includes("flex-wrap: wrap"),
  "shared_inline_action_and_judgment_rendering_missing",
);

const hidden = projectFactPresentationRow(reviewRow({
  applicability: "not_applicable",
  required: false,
}));
assert(
  hidden === null && model.includes('row.applicability === "not_applicable"') &&
    table.includes('row.applicability !== "not_applicable"'),
  "not_applicable_exposed_to_customer_projection",
);

for (const accountType of ["particulier", "zakelijk", "vve"] as const) {
  const presentation = selectUnifiedFactPresentation(
    createFreshDocumentFirstSignupDraft(accountType),
  );
  assert(
    presentation.account.rows[0].id === "account:type" &&
      presentation.account.rows[0].sourceLabels[0] === "Door gebruiker" &&
      presentation.account.rows.every((row) =>
        row.applicability !== "not_applicable"
      ),
    `shared_account_row_model_failed:${accountType}`,
  );
}

let multi = createFreshDocumentFirstSignupDraft("zakelijk");
multi = documentFirstSignupReducer(multi, { type: "add_location" });
const multiPresentation = selectUnifiedFactPresentation(multi);
assert(
  multiPresentation.locations.length === 2 &&
    multiPresentation.locations[0].id !== multiPresentation.locations[1].id &&
    multiPresentation.chargers.length === 2 &&
    multiPresentation.chargers.every((charger) =>
      charger.rows.every((row) =>
        !row.locationId || row.locationId === charger.locationId
      )
    ) &&
    new Set(multiPresentation.chargers.map((charger) => charger.id)).size === 2,
  "location_or_charger_grouping_leaks_state",
);

const parserProjected = projectFactPresentationRow(reviewRow());
const manualProjected = projectFactPresentationRow(reviewRow({
  canonicalValue: "Alfen Eve",
  proposedValue: "Alfen Eve",
  correctedManually: true,
  confirmed: true,
  decisionStatus: "review_required",
}));
assert(
  parserProjected?.sourceLabels.includes("Installatiefactuur") &&
    parserProjected.judgment === "" &&
    manualProjected?.sourceLabels.includes("Handmatig aangepast") &&
    manualProjected.sourceLabels.includes("Installatiefactuur") &&
    manualProjected.judgment === "ENVAL-controle nodig" &&
    projectFactPresentationRow(reviewRow({ confirmed: true }))?.judgment ===
      "Bevestigd",
  "source_or_judgment_projection_failed",
);

const order = [
  signing.indexOf("presentation.account"),
  signing.indexOf("presentation.locations"),
  signing.indexOf("presentation.chargers"),
  signing.indexOf("presentation.documents.title"),
];
assert(
  order.every((index) => index >= 0) &&
    order.every((index, position) =>
      position === 0 || index > order[position - 1]
    ) &&
    signing.includes('className="signing-document"') &&
    !signing.includes("Aanvullend uit documenten") &&
    !signing.includes("document-first-signing-summary") &&
    css.includes(".signing-document") &&
    !css.includes(".document-first-signing-summary"),
  "vertical_signing_document_or_section_order_failed",
);
assert(
  review.includes("locations.flatMap") && review.includes("sections.map") &&
    model.includes("globalChargerNumber") &&
    model.includes("locationId") && model.includes("chargerId"),
  "step_two_hierarchy_or_stable_binding_missing",
);

for (
  const [path, expected] of Object.entries({
    "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts":
      "ff7e40cd3c638d4c3a3b1649fe017da29d3e82faa92844a543deba528d6fb352",
    "app/src/features/invoice-analysis/documentObservationEnvelope.ts":
      "d437a77d5e5a5f2323eaf96d126e3c6272da728bf8228a701f356757b9963323",
    "app/src/features/invoice-analysis/documentTypeClassifier.ts":
      "f72a58e38e53cd6e769639f47412289e3a45deb4d3dc7b28982c4c1823b4986a",
    "app/src/features/invoice-analysis/energyEanCandidateExtractor.ts":
      "de06da71bf03185227ed563e5bfb652f804f08c739c9623851d0cf71a644577e",
    "app/src/features/invoice-analysis/energyDocumentObservation.ts":
      "25790501d38a302cbc7bfdc590928a8dfde8cf312c58f6a09462600eeffba25b",
    "app/src/features/signup/documentSemanticProjector.ts":
      "39ba67165aa0bd969498e3d400d5b7c871177821c21bec096fcdef300ecbb9b8",
    "app/src/features/signup/signupSubmitMapper.ts":
      "d348960a22701e5baec962fdb8e8964d8025b3afa6d8f7d3b30ba5ede147ad06",
    "app/src/features/signup/signupSubmitClient.proof.ts":
      "0295f44c72c9050a30653ec812dc42b273dee3e9402999a73b9949fd4407fd9b",
    "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql":
      "c9a82157dcc77577edf833950ee97eb886ebbaa645cfada20a98e492b2771ff8",
    "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql":
      "561a80fee5c04cc073d8c099e54b7ad721abff021b23522d4cfa8588f4afcb25",
    "supabase/functions/api-app-signup-submit/index.ts":
      "fd4516c31328eb81b8904be4b5594218faed59d6133340c58a85e5dec4106be3",
  })
) {
  assert(await sha256(path) === expected, `protected_hash_mismatch:${path}`);
}

console.log("signup-unified-presentation-08-proof-ok");
