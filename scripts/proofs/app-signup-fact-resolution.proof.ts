import type { DocumentFactObservation } from "../../app/src/features/signup/documentFactRegistry.ts";
import type { DocumentReviewRow } from "../../app/src/features/signup/documentReviewMatrix.ts";
import {
  factResolutionAllowsProgress,
  projectFactPresentationRow,
} from "../../app/src/features/signup/presentation/factPresentationModel.ts";
import { compareBoundedPartyNameValues } from "../../app/src/features/signup/signupPartyNameCrossCheck.ts";
import { compareFormattedDutchAddresses } from "../../app/src/features/signup/structuredAddress.ts";

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

function observation(
  value: string,
  documentId: string,
  documentType: "energy_bill_or_contract" | "installation_invoice" =
    "energy_bill_or_contract",
): DocumentFactObservation {
  return {
    factKey: "partyName",
    value,
    sourceDocumentId: documentId,
    sourceDocumentType: documentType,
    semanticRole: documentType === "energy_bill_or_contract"
      ? "contract_holder"
      : "buyer_or_customer",
    extractionStatus: "found",
    confidence: "high",
    sourcePage: 1,
    displayable: true,
    rejectionReason: null,
  };
}

function reviewRow(
  overrides: Partial<DocumentReviewRow> = {},
): DocumentReviewRow {
  return {
    factKey: "partyName",
    scopeKey: "location:location_a:energy:contractHolder",
    label: "Naam",
    declared: {
      value: null,
      status: "not_found",
      semanticRole: "contract_holder",
    },
    organizationDocument: {
      value: null,
      status: "not_applicable",
      semanticRole: "not_applicable",
    },
    energyDocument: {
      value: null,
      status: "not_found",
      semanticRole: "contract_holder",
    },
    chargerDocument: {
      value: null,
      status: "not_found",
      semanticRole: "buyer_or_customer",
    },
    decisionStatus: "missing",
    decisionReason: "no_value",
    statusLabel: "",
    action: "Invullen",
    canonicalValue: "",
    proposedValue: "",
    sourceDocuments: [],
    choices: [],
    correctedManually: false,
    confirmed: false,
    normalizationApplied: false,
    blocksProgress: true,
    observations: [],
    applicability: "required",
    required: true,
    ...overrides,
  };
}

function rowWithSources(values: string[]): DocumentReviewRow {
  const observations = values.map((value, index) =>
    observation(
      value,
      `document_${index + 1}`,
      index % 2 === 0 ? "energy_bill_or_contract" : "installation_invoice",
    )
  );
  return reviewRow({
    decisionStatus: "clean_match",
    decisionReason: "exact_support",
    proposedValue: values[0] || "",
    observations,
    sourceDocuments: observations.map((candidate) => ({
      documentId: candidate.sourceDocumentId,
      documentType: candidate.sourceDocumentType,
    })),
    choices: values,
  });
}

const pending = projectFactPresentationRow(reviewRow());
assert(
  pending?.resolutionState === "pending" && pending.judgment === "" &&
    pending.actions.includes("fill") && !factResolutionAllowsProgress(pending),
  "empty_required_fact_is_not_neutral_pending",
);

const single = projectFactPresentationRow(rowWithSources(["Daan Koote"]));
assert(
  single?.resolutionState === "pending" && single.judgment === "" &&
    single.sources.length === 1 && !factResolutionAllowsProgress(single),
  "single_document_source_did_not_start_pending",
);

const confirmed = projectFactPresentationRow({
  ...rowWithSources(["Daan Koote"]),
  confirmed: true,
  canonicalValue: "Daan Koote",
});
assert(
  confirmed?.resolutionState === "confirmed" &&
    confirmed.judgment === "Bevestigd" &&
    factResolutionAllowsProgress(confirmed),
  "customer_confirmation_did_not_turn_green",
);

const correction = projectFactPresentationRow({
  ...rowWithSources(["D. Koote"]),
  correctedManually: true,
  confirmed: true,
  canonicalValue: "Daan Koote",
  proposedValue: "Daan Koote",
}, { manualValue: "Daan Koote" });
assert(
  correction?.resolutionState === "review_required" &&
    correction.judgment === "ENVAL-controle nodig" &&
    correction.sources.some((source) => source.sourceType !== "user") &&
    correction.sources.some((source) => source.sourceType === "user") &&
    factResolutionAllowsProgress(correction),
  "manual_correction_did_not_preserve_document_and_user_sources",
);

const corroborated = projectFactPresentationRow(
  rowWithSources(["Daan Koote", "Daan Koote"]),
  {
    documentIdentities: {
      document_1: "fingerprint_a",
      document_2: "fingerprint_b",
    },
  },
);
const duplicateBytes = projectFactPresentationRow(
  rowWithSources(["Daan Koote", "Daan Koote"]),
  {
    documentIdentities: {
      document_1: "same_fingerprint",
      document_2: "same_fingerprint",
    },
  },
);
assert(
  corroborated?.resolutionState === "confirmed" &&
    duplicateBytes?.resolutionState === "pending" &&
    duplicateBytes.sources.length === 2,
  "document_identity_deduplication_or_corroboration_failed",
);

const conflictRow = rowWithSources(["Daan Koote", "Pal Koote"]);
conflictRow.decisionStatus = "blocked";
conflictRow.decisionReason = "hard_value_conflict";
const conflict = projectFactPresentationRow(conflictRow);
assert(
  conflict?.resolutionState === "blocked" &&
    conflict.judgment === "Kan niet worden ingediend" &&
    conflict.sources.map((source) => source.observedValue).join("|") ===
      "Daan Koote|Pal Koote" &&
    conflict.actions.includes("choose") &&
    !factResolutionAllowsProgress(conflict),
  "unresolved_conflict_did_not_preserve_sources_or_block",
);

const resolvedConflict = projectFactPresentationRow({
  ...conflictRow,
  correctedManually: true,
  confirmed: true,
  canonicalValue: "Daan Koote",
  proposedValue: "Daan Koote",
}, { manualValue: "Daan Koote" });
assert(
  resolvedConflict?.resolutionState === "review_required" &&
    resolvedConflict.resolutionReason === "document_conflict_resolved" &&
    factResolutionAllowsProgress(resolvedConflict),
  "resolved_document_conflict_did_not_turn_orange_and_allow_progress",
);

const manualMissing = projectFactPresentationRow(
  reviewRow({
    correctedManually: true,
    confirmed: true,
    canonicalValue: "Handmatige waarde",
    proposedValue: "Handmatige waarde",
  }),
  { manualValue: "Handmatige waarde" },
);
const hiddenInformational = projectFactPresentationRow(reviewRow({
  applicability: "informational",
  required: false,
}));
const foundInformational = projectFactPresentationRow({
  ...rowWithSources(["Waargenomen KvK-tekst"]),
  applicability: "informational",
  required: false,
});
assert(
  manualMissing?.resolutionState === "review_required" &&
    manualMissing.resolutionReason === "user_supplied_without_document" &&
    hiddenInformational === null &&
    foundInformational?.actions.includes("confirm") &&
    foundInformational.actions.includes("correct") &&
    factResolutionAllowsProgress(foundInformational),
  "manual_missing_or_hidden_informational_rule_failed",
);

const probableRow = rowWithSources(["D. Koote", "Daan Koote"]);
probableRow.confirmed = true;
probableRow.canonicalValue = "Daan Koote";
const probable = projectFactPresentationRow(probableRow);
assert(
  compareBoundedPartyNameValues(
        "D. Koote",
        "Daan Koote",
        "natural_person",
      ) === "probable" &&
    probable?.resolutionState === "review_required" &&
    probable.resolutionReason === "probable_identity_match" &&
    compareBoundedPartyNameValues(
        "D. Koote",
        "Pal Koote",
        "natural_person",
      ) === "mismatch",
  "bounded_person_name_resolution_failed",
);

assert(
  compareFormattedDutchAddresses(
        "Dorpsweg 28-1, 1234 AB Plaats, Nederland",
        "dorpsweg 28-1, 1234ab Plaats",
      ) === "match" &&
    compareFormattedDutchAddresses(
        "Dorpsweg 28-1, 1234 AB Plaats",
        "Dorpsweg 28, 1234 AB Plaats",
      ) === "probable" &&
    compareFormattedDutchAddresses(
        "Dorpsweg 28, 1234 AB Plaats",
        "Dorpsweg 29, 1234 AB Plaats",
      ) === "mismatch" &&
    compareFormattedDutchAddresses(
        "Dorpsweg 28, 1234 AB Plaats",
        "Dorpsweg 28, 5678 CD Plaats",
      ) === "mismatch",
  "postcode_house_number_addition_address_rules_failed",
);

const table = await source(
  "app/src/features/signup/presentation/FactTable.tsx",
);
const controls = await source(
  "app/src/features/signup/presentation/FactReviewControls.tsx",
);
const editor = await source(
  "app/src/features/signup/presentation/CompactFactCorrectionEditor.tsx",
);
const matrix = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const selectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const css = await source("app/src/styles/components.css");
assert(
  table.includes('actions: columns.actions || "Bevestiging / correctie"') &&
    table.includes('className="fact-table__action-cell"') &&
    table.indexOf("headers.value") < table.indexOf("headers.actions") &&
    controls.includes("CompactFactCorrectionEditor") &&
    editor.includes("<AddressFields") && editor.includes("compact") &&
    table.indexOf('className="fact-table__action-cell"') <
      table.indexOf("<FactReviewControls"),
  "separate_action_column_or_compact_editor_missing",
);
assert(
  matrix.includes("locations.flatMap") && matrix.includes("sections.map") &&
    !matrix.includes("fact-review-chargers") &&
    selectors.includes("factRowsAllowProgress") &&
    selectors.includes("locationFactsComplete") &&
    selectors.includes("chargerFactsComplete"),
  "sibling_sections_or_central_gating_missing",
);
assert(
  ![table, controls, editor, matrix].some((value) =>
    value.includes("style={{")
  ) &&
    ![table, controls, editor, matrix].some((value) =>
      /\.css["']/.test(value)
    ) &&
    css.includes(".fact-table--five-columns") &&
    css.includes(".fact-correction-editor") &&
    css.includes(".address-fields-compact"),
  "inline_css_or_shared_stylesheet_boundary_failed",
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

console.log("signup-fact-resolution-08b-proof-ok");
