import {
  extractEnergyEanCandidates,
  getConfirmableEnergyEanCandidates,
} from "../../app/src/features/invoice-analysis/energyEanCandidateExtractor.ts";
import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { projectEnergyEanCandidates } from "../../app/src/features/signup/documentSemanticProjector.ts";
import {
  createDocumentDraftsForCharger,
  createLocationDraft,
  createPersonalInfoDraft,
} from "../../app/src/features/signup/signupNormalizers.ts";
import { mapSignupDraftToSubmitPayload } from "../../app/src/features/signup/signupSubmitMapper.ts";
import type {
  SignupDraft,
  SignupLocationDraft,
} from "../../app/src/features/signup/signupTypes.ts";
import { validateSignupDraft } from "../../app/src/features/signup/signupValidation.ts";

const ROOT = new URL("../../", import.meta.url);
let question = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass() {
  question += 1;
  console.log(
    `PILOT-SIGNUP-EAN-PREFLIGHT-02-Q${String(question).padStart(2, "0")}: PASS`,
  );
}

async function source(path: string) {
  return await Deno.readTextFile(new URL(path, ROOT));
}

async function sha256(path: string) {
  const bytes = await Deno.readFile(new URL(path, ROOT));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function proofPdf(name: string): File {
  return new File(["proof"], name, { type: "application/pdf" });
}

function completeLocation(location: SignupLocationDraft): SignupLocationDraft {
  const charger = location.chargers[0];
  return {
    ...location,
    address: {
      ...location.address,
      postcode: "2042PC",
      houseNumber: "65",
      street: "Proofstraat",
      city: "Proefstad",
      resolvedLookupKey: "2042PC|65|",
    },
    energyDocument: {
      ...location.energyDocument,
      file: proofPdf(`${location.clientId}-energy.pdf`),
      status: "selected",
    },
    connectionDeclaration: {
      sourceMode: "document",
      preflightStatus: "customer_confirmed",
      candidates: [{
        normalizedEan: "871685900012345678",
        classification: "electricity",
        context: "Elektriciteit 871685900012345678",
        page: 1,
      }],
      selectedCandidateEan: "871685900012345678",
      confirmedEan: "871685900012345678",
      manualEan: "",
      customerConfirmed: true,
    },
    chargers: [{
      ...charger,
      brand: "1",
      model: "1",
      installationYear: "2025",
      midNumber: "MID123456",
      serialNumber: "SER123456",
      solarPanelStatus: "none",
    }],
  };
}

function completeDraft(): SignupDraft {
  const location = completeLocation(createLocationDraft());
  const charger = location.chargers[0];
  return {
    personalInfo: {
      ...createPersonalInfoDraft(),
      firstName: "Test",
      lastName: "Gebruiker",
      email: "test@example.com",
    },
    locations: [location],
    documentsByChargerId: {
      [charger.clientId]: createDocumentDraftsForCharger(charger.clientId).map(
        (document) => ({
          ...document,
          file: proofPdf(`${charger.clientId}-invoice.pdf`),
          status: "selected" as const,
        }),
      ),
    },
    consents: { termsBundleAccepted: true },
  };
}

const sanitizedTable = [{
  page: 1,
  text: [
    "Product\tEAN aansluiting\tContractperiode",
    "Elektriciteit\t871685900012345678\t01-01-2026 t/m 31-12-2026",
    "Gas\t871685900012345679\t01-01-2026 t/m 31-12-2026",
  ].join("\n"),
}];
const tableCandidates = extractEnergyEanCandidates(sanitizedTable);
assert(
  tableCandidates.length === 2 &&
    tableCandidates.filter((candidate) =>
        candidate.classification === "electricity"
      ).length === 1 &&
    tableCandidates.filter((candidate) => candidate.classification === "gas")
        .length === 1,
  "sanitized_table_candidate_classification_failed",
);
pass();

assert(
  tableCandidates.every((candidate) => candidate.page === 1) &&
    tableCandidates.every((candidate) =>
      /^\d{18}$/.test(candidate.normalizedEan)
    ),
  "sanitized_table_page_or_exact_length_failed",
);
pass();

assert(
  extractEnergyEanCandidates(
    "Elektriciteit\t871685900012345680\t01-02-2026",
  ).length === 1,
  "ean_date_separator_regression_failed",
);
pass();

assert(
  extractEnergyEanCandidates("EAN 12345678901234567").length === 0 &&
    extractEnergyEanCandidates("EAN 1234567890123456789").length === 0,
  "ean_numeric_boundary_failed",
);
pass();

assert(
  extractEnergyEanCandidates(
    "IBAN NL00TEST0000000000 telefoon 0612345678 klant 123456 bedrag 18,00",
  ).length === 0,
  "non_ean_numeric_noise_accepted",
);
pass();

const confirmableTableCandidates = getConfirmableEnergyEanCandidates(
  tableCandidates,
);
assert(
  confirmableTableCandidates.length === 1 &&
    confirmableTableCandidates[0].classification === "electricity",
  "single_electricity_plus_gas_route_failed",
);
pass();

assert(
  getConfirmableEnergyEanCandidates(extractEnergyEanCandidates(
    "Elektriciteit 871685900012345681\nElektriciteit 871685900012345682",
  )).length === 2,
  "multiple_electricity_route_failed",
);
pass();

assert(
  getConfirmableEnergyEanCandidates(extractEnergyEanCandidates(
    "Aansluiting 871685900012345683\nAansluiting 871685900012345684",
  )).length === 2,
  "multiple_unclassified_route_failed",
);
pass();

const adapter = await source(
  "app/src/features/invoice-analysis/invoicePdfParserAdapter.ts",
);
const extractor = await source(
  "app/src/features/invoice-analysis/energyEanCandidateExtractor.ts",
);
assert(
  adapter.includes('from "./energyEanCandidateExtractor"') &&
    adapter.includes("extractTextFromPdfBytes") &&
    adapter.includes("parseToUnicodeCMap") &&
    adapter.includes('filter === "FlateDecode"') &&
    adapter.includes('text += "\\t"') &&
    !extractor.includes("DecompressionStream") &&
    !extractor.includes("fetch("),
  "existing_parser_or_text_composition_not_reused",
);
pass();

const connection = await source(
  "app/src/features/signup/SignupConnectionSection.tsx",
);
const normalizers = await source(
  "app/src/features/signup/signupNormalizers.ts",
);
assert(
  connection.includes("parseInvoicePdfInput(document.file)") &&
    normalizers.includes(
      'preflightStatus: document.file ? "parsing" : "idle"',
    ) &&
    connection.includes(
      "parserAttempts.current.get(location.clientId) !== attempt",
    ),
  "document_selection_parser_or_stale_guard_missing",
);
pass();

assert(
  connection.includes("getConfirmableEnergyEanCandidates(candidates)") &&
    connection.includes("confirmableCandidates.length === 0") &&
    connection.includes("confirmableCandidates.length > 1"),
  "electricity_candidate_routing_missing",
);
pass();

const confirmation = await source(
  "app/src/features/signup/ConnectionEanConfirmation.tsx",
);
assert(
  confirmation.includes(
    "Aansluitgegevens worden uit het document gehaald…",
  ) && !confirmation.includes("Mogelijke EAN") &&
    confirmation.includes("EAN klopt niet"),
  "visible_parser_states_missing",
);
pass();

assert(
  confirmation.includes("confirmableCandidates.map") &&
    !confirmation.includes('disabled={candidate.classification === "gas"}') &&
    !confirmation.includes("candidate.context"),
  "gas_candidate_exposed_as_electricity_choice",
);
pass();

assert(
  connection.includes('activateManualMode(location, "no_candidate")') &&
    connection.includes('activateManualMode(location, "parser_error")') &&
    confirmation.includes(
      "We konden de EAN van je elektriciteitsaansluiting niet uit",
    ),
  "conditional_manual_fallback_missing",
);
pass();

assert(
  confirmation.includes('replace(/\\D/g, "").slice(0, 18)') &&
    confirmation.includes("/^\\d{18}$/.test(value.manualEan)"),
  "manual_exact_eighteen_digit_contract_missing",
);
pass();

const independentA = createLocationDraft();
const independentB = createLocationDraft();
independentA.connectionDeclaration.confirmedEan = "871685900012345678";
assert(
  independentB.connectionDeclaration.confirmedEan === "" &&
    independentA.energyDocument.clientId !==
      independentB.energyDocument.clientId,
  "location_state_leak",
);
pass();

const invalidDraft = completeDraft();
invalidDraft.personalInfo.firstName = "";
invalidDraft.personalInfo.email = "bad";
invalidDraft.locations[0].energyDocument.file = null;
invalidDraft.locations[0].connectionDeclaration.customerConfirmed = false;
invalidDraft.locations[0].connectionDeclaration.confirmedEan = "";
invalidDraft.locations[0].chargers[0].brand = "";
invalidDraft.documentsByChargerId = {};
invalidDraft.consents.termsBundleAccepted = false;
const invalid = validateSignupDraft(invalidDraft);
for (
  const path of [
    "applicant.firstName",
    "applicant.email",
    `locations.${invalidDraft.locations[0].clientId}.energyDocument`,
    `locations.${invalidDraft.locations[0].clientId}.confirmedEan`,
    `chargers.${invalidDraft.locations[0].chargers[0].clientId}.brand`,
    `chargers.${invalidDraft.locations[0].chargers[0].clientId}.invoice`,
    "acceptances.terms",
  ]
) {
  assert(
    invalid.fieldErrors[path]?.length === 1,
    `field_error_missing:${path}`,
  );
}
assert(invalid.errors.length >= 7, "all_relevant_errors_not_computed");
pass();

invalidDraft.personalInfo.firstName = "Test";
const corrected = validateSignupDraft(invalidDraft);
assert(
  !corrected.fieldErrors["applicant.firstName"] &&
    corrected.fieldErrors["applicant.email"]?.length === 1,
  "corrected_field_did_not_clear_independently",
);
pass();

const business = completeDraft();
business.personalInfo.accountType = "zakelijk";
const businessValidation = validateSignupDraft(business);
business.personalInfo.accountType = "particulier";
const personalValidation = validateSignupDraft(business);
assert(
  businessValidation.fieldErrors["legalEntity.name"]?.length === 1 &&
    businessValidation.fieldErrors["legalEntity.tradeRegisterNumber"]
        ?.length ===
      1 &&
    !personalValidation.fieldErrors["legalEntity.name"] &&
    !personalValidation.fieldErrors["legalEntity.tradeRegisterNumber"],
  "conditional_account_type_errors_failed",
);
pass();

const multiLocation = completeDraft();
const secondLocation = completeLocation(createLocationDraft());
secondLocation.address.postcode = "";
multiLocation.personalInfo.accountType = "zakelijk";
multiLocation.personalInfo.companyName = "Testbedrijf";
multiLocation.personalInfo.kvkNumber = "12345678";
multiLocation.locations.push(secondLocation);
const multiValidation = validateSignupDraft(multiLocation);
assert(
  multiValidation.fieldErrors[
        `locations.${secondLocation.clientId}.postalCode`
      ]?.length === 1 &&
    !multiValidation.fieldErrors[
      `locations.${multiLocation.locations[0].clientId}.postalCode`
    ],
  "multi_location_error_binding_failed",
);
pass();

const complete = completeDraft();
assert(
  validateSignupDraft(complete).canStartDossier,
  "complete_fixture_not_ready",
);
pass();

assert(
  mapSignupDraftToSubmitPayload(complete).locations[0].connectionDeclaration
    ?.captureMethod === "energy_document_customer_confirmed",
  "confirmed_candidate_not_mapped",
);
pass();

const observedOnly = completeDraft();
observedOnly.locations[0].connectionDeclaration.customerConfirmed = false;
observedOnly.locations[0].connectionDeclaration.confirmedEan = "";
assert(
  mapSignupDraftToSubmitPayload(observedOnly).locations[0]
    .connectionDeclaration === undefined,
  "parser_output_created_truth_without_confirmation",
);
pass();

const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const documentFirstSelectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const documentFirstGaps = await source(
  "app/src/features/signup/DocumentFirstGapFields.tsx",
);
const documentFirstNavigation = await source(
  "app/src/features/signup/SignupFlowNavigation.tsx",
);
const documentReviewMatrix = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
assert(
  documentFirstSelectors.includes('"mandate-copy"') &&
    documentFirstSelectors.includes('"calendar-year-scope"') &&
    documentFirstSelectors.includes('"signature-evidence"') &&
    documentFirstSelectors.includes("return { ready: false, blockers"),
  "signing_open_boundary_missing",
);
pass();

assert(
  !documentFirstNavigation.includes("Ondertekenen") &&
    documentFirstNavigation.includes("disabled={!canContinue}"),
  "signing_cta_not_hidden_or_next_not_guarded",
);
pass();

assert(
  !shell.includes("submitSignupPayload(") &&
    !shell.includes("mapSignupDraftToSubmitPayload("),
  "successful_submit_reachable_in_document_first_ui",
);
pass();

assert(
  documentFirstGaps.includes("ConnectionEanConfirmation") &&
    documentFirstGaps.includes("onRequireManualEntry") &&
    documentReviewMatrix.includes('factKey === "electricityEan"') &&
    documentReviewMatrix.includes('decision.status === "missing"') &&
    documentReviewMatrix.includes('"Invullen"'),
  "inline_manual_ean_fallback_missing",
);
pass();

assert(
  shell.includes("selectMapperCompatibleDraft(draft)") &&
    shell.includes("selectStepCompleteness(draft)") &&
    !shell.includes("parserObservations"),
  "selector_or_observation_boundary_missing",
);
pass();

const upload = await source(
  "app/src/features/signup/DocumentUploadSlot.tsx",
);
assert(
  upload.includes("handleFileChange(null)") && upload.includes("Verwijderen") &&
    !upload.includes("EAN") && !upload.includes("parseInvoicePdfInput"),
  "generic_upload_separation_failed",
);
pass();

const productionSources = [
  adapter,
  extractor,
  connection,
  confirmation,
  upload,
  shell,
  await source("app/src/features/signup/signupValidation.ts"),
].join("\n");
assert(!productionSources.includes("style={{"), "inline_css_present");
pass();

const realPdfPath = Deno.env.get("ENVAL_EAN_REAL_PDF")?.trim() || "";
assert(
  !productionSources.includes("ENVAL_EAN_REAL_PDF"),
  "supplier_or_personal_pdf_hardcode_present",
);
if (realPdfPath) {
  const realResult = await parseInvoicePdfInput(
    await Deno.readFile(realPdfPath),
  );
  assert(realResult.ok, "real_pdf_parse_failed");
  const projectedCandidates = projectEnergyEanCandidates(
    realResult.observation_envelope,
  );
  const electricityCount = projectedCandidates.filter((candidate) =>
    candidate.classification === "electricity"
  ).length;
  const gasCount = projectedCandidates.filter((candidate) =>
    candidate.classification === "gas"
  ).length;
  const confirmable = getConfirmableEnergyEanCandidates(
    projectedCandidates,
  );
  assert(
    projectedCandidates.length === 2 && electricityCount === 1 &&
      gasCount === 1 && confirmable.length === 1 &&
      confirmable[0].classification === "electricity",
    "real_pdf_candidate_route_failed",
  );
  console.log(`real_pdf_candidate_count=${projectedCandidates.length}`);
  console.log(`real_pdf_electricity_count=${electricityCount}`);
  console.log(`real_pdf_gas_count=${gasCount}`);
  console.log("real_pdf_manual_fallback=hidden");
} else {
  console.log("real_pdf_proof=SKIPPED_ENVAL_EAN_REAL_PDF_NOT_SET");
}
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

assert(question === 32, `unexpected_question_count:${question}`);
console.log("signup-ean-preflight-02-proof-ok");
