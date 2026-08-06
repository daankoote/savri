import type {
  InvoicePdfParserResult,
} from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import {
  chargerDocumentObservationFromParserResult,
  parseInvoicePdfInput,
} from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import type {
  EnergyDocumentObservation,
  ObservedDeliveryAddress,
  ObservedValue,
} from "../../app/src/features/invoice-analysis/energyDocumentObservation.ts";
import { extractEnergyDocumentObservation } from "../../app/src/features/invoice-analysis/energyDocumentObservation.ts";
import {
  compareChargerDocumentObservation,
} from "../../app/src/features/signup/chargerDocumentCrossCheck.ts";
import {
  compareDeclaredLocationToObservedDeliveryAddress,
  compareEnergyDocumentPartyName,
} from "../../app/src/features/signup/energyDocumentCrossCheck.ts";
import {
  projectChargerDocumentObservation,
  projectEnergyDocumentObservation,
} from "../../app/src/features/signup/documentSemanticProjector.ts";
import {
  createDocumentDraftsForCharger,
  createLocationDraft,
  createPersonalInfoDraft,
  removeChargerDocumentState,
  replaceChargerDocumentState,
  transitionLocationToDocumentEanSource,
  transitionLocationToManualEanSource,
} from "../../app/src/features/signup/signupNormalizers.ts";
import {
  assertExclusiveConnectionDeclarationSource,
  mapSignupDraftToSubmitPayload,
} from "../../app/src/features/signup/signupSubmitMapper.ts";
import {
  formatDutchHouseNumber,
  formatStructuredDutchAddress,
} from "../../app/src/features/signup/structuredAddress.ts";
import type {
  ChargerDocumentObservation,
  ChargerDraft,
  SignupDraft,
} from "../../app/src/features/signup/signupTypes.ts";

const ROOT = new URL("../../", import.meta.url);
let question = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass() {
  question += 1;
  console.log(
    `PILOT-SIGNUP-DOCUMENT-CROSSCHECK-02-Q${
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

function proofPdf(name: string): File {
  return new File(["proof"], name, { type: "application/pdf" });
}

function observedValue(value: string | null): ObservedValue {
  return value
    ? {
      value,
      sourcePage: 1,
      confidence: "high",
      extractionMethod: "invoice_labeled_field",
      displayable: true,
      rejectionReason: null,
    }
    : {
      value: null,
      sourcePage: null,
      confidence: "unavailable",
      extractionMethod: "not_found",
      displayable: false,
      rejectionReason: "proof_value_missing",
    };
}

function observedAddress(
  overrides: Partial<ObservedDeliveryAddress> = {},
): ObservedDeliveryAddress {
  return {
    value: "Bewijsstraat 28-1, 1234AB Proefstad, Nederland",
    street: "Bewijsstraat",
    houseNumber: "28",
    houseNumberAddition: "1",
    postalCode: "1234AB",
    city: "Proefstad",
    country: "Nederland",
    sourcePage: 1,
    confidence: "high",
    extractionMethod: "invoice_address_block",
    displayable: true,
    rejectionReason: null,
    ...overrides,
  };
}

function chargerObservation(
  overrides: Partial<ChargerDocumentObservation> = {},
): ChargerDocumentObservation {
  return {
    customerName: observedValue("D. Koote"),
    supplierInstallerName: observedValue("Voorbeeld Installateur"),
    brand: observedValue("Alfen"),
    model: observedValue("Eve Single Pro-Line"),
    serialNumber: observedValue("SER-123 456"),
    midNumber: observedValue("MID-123 456"),
    location: observedAddress(),
    installationDate: observedValue("2025-04-03"),
    installationYear: observedValue("2025"),
    invoiceDate: observedValue("2026-08-03"),
    ...overrides,
  };
}

const applicant = {
  ...createPersonalInfoDraft(),
  firstName: "Daan",
  lastName: "Koote",
};
const applicantDraft: SignupDraft = {
  personalInfo: applicant,
  locations: [createLocationDraft()],
  documentsByChargerId: {},
  consents: { termsBundleAccepted: false },
};
assert(
  compareEnergyDocumentPartyName(
    applicantDraft,
    observedValue("D. Koote"),
  ).status === "initial_and_surname_match",
  "initial_and_full_name_must_remain_probable",
);
assert(
  compareEnergyDocumentPartyName(
    applicantDraft,
    observedValue("Daan Koote"),
  ).status === "exact_full_match",
  "full_name_match_failed",
);
pass();

assert(
  formatDutchHouseNumber("28", "1") === "28-1" &&
    formatStructuredDutchAddress({
        street: "Bewijsstraat",
        houseNumber: "28",
        houseNumberAddition: "A",
        postalCode: null,
        city: null,
        country: null,
      }) === "Bewijsstraat 28-A",
  "canonical_address_display_failed",
);
pass();

const declaredAddress = {
  ...createLocationDraft().address,
  postcode: "1234AB",
  houseNumber: "28",
  suffix: "1",
  street: "Bewijsstraat",
  city: "Proefstad",
};
assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    declaredAddress,
    observedAddress({ houseNumberAddition: " / 1 " }),
  ).status === "match",
  "address_separator_normalization_failed",
);
assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    declaredAddress,
    observedAddress({ houseNumberAddition: "2" }),
  ).status === "mismatch",
  "different_real_addition_must_mismatch",
);
assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    declaredAddress,
    observedAddress({
      value: "Bewijsstraat 281, 1234AB Proefstad, Nederland",
      houseNumber: "281",
      houseNumberAddition: null,
    }),
  ).status === "unavailable",
  "unbounded_281_must_not_be_split_or_matched",
);
pass();

const separateCellObservation = extractEnergyDocumentObservation([{
  page: 1,
  text: [
    "Leveradres\tBewijsstraat 28\t1",
    "Postcode\t1234 AB Proefstad",
  ].join("\n"),
}], []);
assert(
  separateCellObservation.deliveryAddress.houseNumber === "28" &&
    separateCellObservation.deliveryAddress.houseNumberAddition === "1" &&
    compareDeclaredLocationToObservedDeliveryAddress(
        declaredAddress,
        separateCellObservation.deliveryAddress,
      ).status === "match",
  "separate_pdf_address_cells_not_preserved",
);
pass();

const documentLocation = createLocationDraft();
documentLocation.energyDocument.file = proofPdf("energy-proof.pdf");
documentLocation.energyDocument.status = "selected";
documentLocation.connectionDeclaration = {
  sourceMode: "document",
  preflightStatus: "customer_confirmed",
  candidates: [{
    normalizedEan: "871685900012345678",
    classification: "electricity",
    context: "proof context omitted from output",
    page: 1,
  }],
  selectedCandidateEan: "871685900012345678",
  confirmedEan: "871685900012345678",
  manualEan: "",
  customerConfirmed: true,
};
documentLocation.energyDocumentObservation = {} as EnergyDocumentObservation;
const manualLocation = transitionLocationToManualEanSource(documentLocation);
assert(
  manualLocation.connectionDeclaration.sourceMode === "manual" &&
    manualLocation.energyDocument.file === null &&
    manualLocation.energyDocumentObservation === null &&
    manualLocation.connectionDeclaration.candidates.length === 0 &&
    manualLocation.connectionDeclaration.selectedCandidateEan === "" &&
    manualLocation.connectionDeclaration.confirmedEan === "" &&
    !manualLocation.connectionDeclaration.customerConfirmed,
  "manual_transition_did_not_clear_document_source",
);
pass();

manualLocation.connectionDeclaration.manualEan = "871685900012345679";
manualLocation.connectionDeclaration.confirmedEan = "871685900012345679";
manualLocation.connectionDeclaration.customerConfirmed = true;
manualLocation.connectionDeclaration.preflightStatus =
  "manual_customer_confirmed";
assertExclusiveConnectionDeclarationSource(manualLocation);
const manualDraft: SignupDraft = {
  personalInfo: applicant,
  locations: [manualLocation],
  documentsByChargerId: {},
  consents: { termsBundleAccepted: true },
};
const manualPayload = mapSignupDraftToSubmitPayload(manualDraft);
assert(
  manualPayload.locations[0].connectionDeclaration?.captureMethod ===
      "manual_customer_confirmed" &&
    manualPayload.locations[0].connectionDeclaration?.ean ===
      manualLocation.connectionDeclaration.manualEan,
  "manual_mode_did_not_serialize_only_manual_confirmed_ean",
);
pass();

const returnedToDocument = transitionLocationToDocumentEanSource(
  manualLocation,
  {
    ...manualLocation.energyDocument,
    file: proofPdf("new-energy-proof.pdf"),
    status: "selected",
  },
);
assert(
  returnedToDocument.connectionDeclaration.sourceMode === "document" &&
    returnedToDocument.connectionDeclaration.manualEan === "" &&
    returnedToDocument.connectionDeclaration.confirmedEan === "" &&
    !returnedToDocument.connectionDeclaration.customerConfirmed,
  "new_document_did_not_clear_manual_source",
);
pass();

let conflictRejected = false;
try {
  assertExclusiveConnectionDeclarationSource({
    ...manualLocation,
    energyDocument: {
      ...manualLocation.energyDocument,
      file: proofPdf("conflict.pdf"),
      status: "selected",
    },
  });
} catch {
  conflictRejected = true;
}
assert(conflictRejected, "two_connection_sources_were_serializable");
pass();

const charger: ChargerDraft = {
  clientId: "charger-proof",
  source: "manual",
  brand: "1",
  manualBrand: "",
  model: "1",
  manualModel: "",
  installationYear: "2025",
  midNumber: "MID123456",
  serialNumber: "SER123456",
  backendSupplier: "",
  manualBackendSupplier: "",
  solarPanelStatus: "none",
};
const chargerComparisons = compareChargerDocumentObservation(
  charger,
  applicantDraft,
  declaredAddress,
  chargerObservation(),
);
assert(
  chargerComparisons.midNumber.status === "match" &&
    chargerComparisons.serialNumber.status === "match" &&
    chargerComparisons.brand.status === "match" &&
    chargerComparisons.model.status === "match" &&
    chargerComparisons.location.status === "match" &&
    chargerComparisons.customerName.status === "initial_and_surname_match" &&
    chargerComparisons.installationYear.status === "match",
  "charger_match_parity_failed",
);
pass();

const mismatchComparisons = compareChargerDocumentObservation(
  charger,
  applicantDraft,
  declaredAddress,
  chargerObservation({
    midNumber: observedValue("MID999999"),
    serialNumber: observedValue("SER999999"),
    brand: observedValue("Ander Merk"),
    model: observedValue("Ander Model"),
  }),
);
assert(
  mismatchComparisons.midNumber.status === "mismatch" &&
    mismatchComparisons.serialNumber.status === "mismatch" &&
    mismatchComparisons.brand.status === "mismatch" &&
    mismatchComparisons.model.status === "mismatch",
  "charger_exact_mismatch_rules_failed",
);
pass();

const invoiceDateOnlyResult: InvoicePdfParserResult = {
  ok: true,
  parser_kind: "invoice_pdf_parser",
  parser_version: "2026-08-04-unified-document-v5",
  source_kind: "pdf",
  observed_fields: {
    customer_name: null,
    supplier_installer_name: null,
    address_line: null,
    street: null,
    house_number: null,
    house_number_addition: null,
    postcode_line: null,
    city_line: null,
    country_line: null,
    brand: null,
    model: null,
    serial_number: null,
    serial_candidate_raw: null,
    mid_number: null,
    mid_candidate_raw: null,
    installation_date: null,
    installation_year: null,
    invoice_date: "2025-01-01",
    address_block_ambiguous: false,
  },
  ean_candidates: [],
  energy_document_observation: {} as EnergyDocumentObservation,
  observation_envelope: {
    parserVersion: "2026-08-04-unified-document-v5",
    contentFingerprint: "fixture-digest",
    pageCount: 1,
    documentTypeCandidates: [],
    factCandidates: [],
    extractionWarnings: [],
    rejectedCandidates: [],
  },
  confidence: {
    pdf_text_length: 1,
    observed_non_null_fields: 1,
  },
  limitations: [],
  summary: {
    mode: "unified_document_extract_app_adapter_v5",
    reason: "client_pdf_text_extract_completed",
    byte_length: 1,
    pdf_text_length: 1,
    observed_non_null_fields: 1,
  },
  field_sources: null,
  pages: null,
};
const invoiceDateOnly = chargerDocumentObservationFromParserResult(
  invoiceDateOnlyResult,
);
assert(
  invoiceDateOnly?.invoiceDate.displayable === true &&
    invoiceDateOnly.installationYear.displayable === false &&
    compareChargerDocumentObservation(
        charger,
        applicantDraft,
        declaredAddress,
        invoiceDateOnly,
      ).installationYear.status === "unavailable",
  "invoice_date_was_used_as_installation_year",
);
pass();

const locationA = createLocationDraft();
const locationB = createLocationDraft();
const transitionedA = transitionLocationToManualEanSource(locationA);
assert(
  transitionedA.connectionDeclaration.sourceMode === "manual" &&
    locationB.connectionDeclaration.sourceMode === "document" &&
    locationB.energyDocument.file === null,
  "multi_location_connection_state_leaked",
);
pass();

const chargerA = createDocumentDraftsForCharger("charger-a")[0];
const chargerB = createDocumentDraftsForCharger("charger-b")[0];
const state = {
  "charger-a": [chargerA],
  "charger-b": [chargerB],
};
const chargerAObserved = replaceChargerDocumentState(state, {
  ...chargerA,
  observation: chargerObservation(),
  parseStatus: "parsed",
});
assert(
  chargerAObserved["charger-a"][0].observation !== null &&
    chargerAObserved["charger-b"][0].observation === null,
  "multi_charger_observation_state_leaked",
);
const chargerAReset = replaceChargerDocumentState(chargerAObserved, {
  ...chargerAObserved["charger-a"][0],
  file: proofPdf("replacement.pdf"),
  observation: null,
  parseStatus: "parsing",
});
assert(
  chargerAReset["charger-a"][0].observation === null &&
    chargerAReset["charger-b"][0] === chargerB,
  "charger_document_switch_reset_other_object",
);
const chargerARemoved = removeChargerDocumentState(chargerAReset, [
  "charger-a",
]);
assert(
  !("charger-a" in chargerARemoved) && "charger-b" in chargerARemoved,
  "charger_state_cleanup_was_not_bounded",
);
pass();

const declaredBefore = JSON.stringify(charger);
compareChargerDocumentObservation(
  charger,
  applicantDraft,
  declaredAddress,
  chargerObservation({ brand: observedValue("Ander Merk") }),
);
assert(
  JSON.stringify(charger) === declaredBefore,
  "observed_data_overwrote_declared_input",
);
pass();

const sharedCard = await source(
  "app/src/features/signup/DocumentCheckCard.tsx",
);
const energyCard = await source(
  "app/src/features/signup/EnergyDocumentCheckCard.tsx",
);
const chargerCard = await source(
  "app/src/features/signup/InvoicePdfPreviewPanel.tsx",
);
assert(
  energyCard.includes("<DocumentCheckCard rows={rows} />") &&
    chargerCard.includes("<DocumentCheckCard rows={rows} />") &&
    sharedCard.includes("DocumentCheckRow") &&
    sharedCard.includes("comparisonStatus") &&
    sharedCard.includes("actionTarget"),
  "shared_document_check_presentation_missing",
);
pass();

for (
  const forbiddenCustomerUi of [
    "PDF-preview",
    "Gevonden velden",
    "Aandachtspunten",
    "elapsedMs",
    "observedFieldNames",
    "limitationCodes",
    "<dt>Status</dt>",
    "mid_candidate_raw}",
    "customer_name}",
  ]
) {
  assert(
    !chargerCard.includes(forbiddenCustomerUi),
    `technical_charger_ui_present:${forbiddenCustomerUi}`,
  );
}
pass();

const productionSources = [
  sharedCard,
  energyCard,
  chargerCard,
  await source("app/src/features/signup/SignupConnectionSection.tsx"),
  await source("app/src/features/signup/ConnectionEanConfirmation.tsx"),
  await source("app/src/features/signup/structuredAddress.ts"),
  await source("app/src/features/signup/chargerDocumentCrossCheck.ts"),
].join("\n");
assert(
  !productionSources.includes("style={{") &&
    sharedCard.includes("invoice-preview-panel") &&
    sharedCard.includes("status-pill") &&
    sharedCard.includes("button-link"),
  "inline_or_duplicate_presentation_css_present",
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

const energyFixture = Deno.env.get("ENVAL_EAN_REAL_PDF")?.trim() || "";
assert(energyFixture, "real_energy_fixture_missing");
const realEnergy = await parseInvoicePdfInput(
  await Deno.readFile(energyFixture),
);
assert(realEnergy.ok, "real_energy_fixture_parse_failed");
const realEnergyAddress = projectEnergyDocumentObservation(
  realEnergy.observation_envelope,
).deliveryAddress;
assert(
  realEnergyAddress.displayable &&
    compareDeclaredLocationToObservedDeliveryAddress(
        {
          ...createLocationDraft().address,
          postcode: realEnergyAddress.postalCode || "",
          houseNumber: "28",
          suffix: "1",
        },
        realEnergyAddress,
      ).status === "match",
  "real_energy_fixture_address_not_exact_match",
);
pass();

const chargerFixture = Deno.env.get("ENVAL_CHARGER_REAL_PDF")?.trim() || "";
assert(chargerFixture, "real_charger_fixture_missing");
const realCharger = await parseInvoicePdfInput(
  await Deno.readFile(chargerFixture),
);
assert(realCharger.ok, "real_charger_fixture_parse_failed");
const realChargerObservation = projectChargerDocumentObservation(
  realCharger.observation_envelope,
);
assert(
  realChargerObservation?.midNumber.displayable &&
    realChargerObservation.serialNumber.displayable &&
    realChargerObservation.brand.displayable &&
    realChargerObservation.model.displayable,
  "real_charger_fixture_required_observations_missing",
);
pass();

console.log("signup-document-crosscheck-parity-proof-ok");
