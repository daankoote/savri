import {
  extractEnergyDocumentObservation,
  type ObservedDeliveryAddress,
  type ObservedValue,
} from "../../app/src/features/invoice-analysis/energyDocumentObservation.ts";
import { extractEnergyEanCandidates } from "../../app/src/features/invoice-analysis/energyEanCandidateExtractor.ts";
import { parseInvoicePdfInput } from "../../app/src/features/invoice-analysis/invoicePdfParserAdapter.ts";
import { projectEnergyDocumentObservation } from "../../app/src/features/signup/documentSemanticProjector.ts";
import {
  compareDeclaredLocationToObservedDeliveryAddress,
  compareEnergyDocumentPartyName,
} from "../../app/src/features/signup/energyDocumentCrossCheck.ts";
import {
  createLocationDraft,
  createPersonalInfoDraft,
} from "../../app/src/features/signup/signupNormalizers.ts";
import type {
  PersonalInfoDraft,
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
    `PILOT-SIGNUP-ENERGY-DOC-CROSSCHECK-01-Q${
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

function observedValue(value: string): ObservedValue {
  return {
    value,
    sourcePage: 1,
    confidence: "high",
    extractionMethod: "semantic_contract_holder_block",
    displayable: true,
    rejectionReason: null,
  };
}

function compareApplicantToObservedHolder(
  personalInfo: PersonalInfoDraft,
  observed: ObservedValue,
) {
  const draft: SignupDraft = {
    personalInfo,
    locations: [createLocationDraft()],
    documentsByChargerId: {},
    consents: { termsBundleAccepted: false },
  };
  return compareEnergyDocumentPartyName(draft, observed);
}

function observedAddress(
  overrides: Partial<ObservedDeliveryAddress> = {},
): ObservedDeliveryAddress {
  return {
    value: "Bewijsstraat 12-A, 1234AB Proefstad, Nederland",
    street: "Bewijsstraat",
    houseNumber: "12",
    houseNumberAddition: "A",
    postalCode: "1234AB",
    city: "Proefstad",
    country: "Nederland",
    sourcePage: 1,
    confidence: "high",
    extractionMethod: "semantic_delivery_address_block",
    displayable: true,
    rejectionReason: null,
    ...overrides,
  };
}

const syntheticPages = [{
  page: 1,
  text: [
    "Onze gegevens: Voorbeeld Energie B.V.",
    "Documentdatum: 03-08-2026",
    "Contracthouder Voorbeeld Persoon",
    "Leveradres\tBewijsstraat 12-A",
    "Postcode\t1234 AB Proefstad",
    "Elektriciteit netbeheerder: Voorbeeld Netbeheer",
    "Elektriciteit\t871685900012345678\t01-08-2026 t/m 31-07-2027",
    "Gas\t871685900012345679\t01-08-2026 t/m 31-07-2027",
    "IBAN NL00PROOF0000000000",
    "E-mail afgeschermd@example.invalid telefoon 0612345678 klantnummer 9988",
  ].join("\n"),
}];
const syntheticCandidates = extractEnergyEanCandidates(syntheticPages);
const syntheticObservation = extractEnergyDocumentObservation(
  syntheticPages,
  syntheticCandidates,
);

assert(
  syntheticObservation.supplierName.value === "Voorbeeld Energie B.V.",
  "supplier_semantic_extraction_failed",
);
pass();

assert(
  syntheticObservation.contractHolderName.value === "Voorbeeld Persoon",
  "holder_observation_failed",
);
pass();

assert(
  syntheticObservation.deliveryAddress.postalCode === "1234AB" &&
    syntheticObservation.deliveryAddress.houseNumber === "12" &&
    syntheticObservation.deliveryAddress.houseNumberAddition === "A",
  "delivery_address_observation_failed",
);
pass();

assert(
  syntheticObservation.electricityConnections.length === 1 &&
    syntheticObservation.gasConnections.length === 1,
  "energy_connection_classification_failed",
);
pass();

assert(
  syntheticObservation.electricityConnections[0].validFrom === "2026-08-01" &&
    syntheticObservation.electricityConnections[0].validTo === "2027-07-31",
  "electricity_contract_period_failed",
);
pass();

assert(
  syntheticObservation.documentDate.value === "2026-08-03",
  "document_date_failed",
);
pass();

const publicObservationKeys = new Set<string>();
function collectKeys(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(collectKeys);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    publicObservationKeys.add(key.toLocaleLowerCase("nl-NL"));
    collectKeys(child);
  }
}
collectKeys(syntheticObservation);
for (
  const forbiddenKey of [
    "iban",
    "bankaccount",
    "birthdate",
    "phone",
    "email",
    "customernumber",
    "termamount",
    "tariff",
    "paymentmethod",
  ]
) {
  assert(
    !publicObservationKeys.has(forbiddenKey),
    `forbidden_key:${forbiddenKey}`,
  );
}
pass();

const serializedObservation = JSON.stringify(syntheticObservation);
for (
  const forbiddenFixtureValue of [
    "NL00PROOF0000000000",
    "afgeschermd@example.invalid",
    "0612345678",
    "9988",
  ]
) {
  assert(
    !serializedObservation.includes(forbiddenFixtureValue),
    "private fixture value escaped into public observation",
  );
}
pass();

for (
  const field of [
    syntheticObservation.supplierName,
    syntheticObservation.contractHolderName,
    syntheticObservation.documentDate,
    syntheticObservation.electricityNetworkOperatorCandidate,
  ]
) {
  assert(
    "value" in field &&
      "sourcePage" in field &&
      "confidence" in field &&
      "extractionMethod" in field &&
      "displayable" in field &&
      "rejectionReason" in field,
    "scalar_field_candidate_contract_incomplete",
  );
}
assert(
  "value" in syntheticObservation.deliveryAddress &&
    "sourcePage" in syntheticObservation.deliveryAddress &&
    "confidence" in syntheticObservation.deliveryAddress &&
    "extractionMethod" in syntheticObservation.deliveryAddress &&
    "displayable" in syntheticObservation.deliveryAddress &&
    "rejectionReason" in syntheticObservation.deliveryAddress &&
    syntheticObservation.electricityConnections.every((connection) =>
      "extractionMethod" in connection &&
      "displayable" in connection &&
      "rejectionReason" in connection
    ),
  "structured_field_candidate_contract_incomplete",
);
pass();

const sideBySidePages = [{
  page: 1,
  text: [
    "Uw gegevens\tOnze gegevens",
    "Naam\tKlant Voorbeeld\tNaam\tVoorbeeld Energie B.V.",
    "Postadres\tKlantstraat 1\tPostadres\tLeverancierstraat 2",
    "Postcode\t1234 AB Proefstad\tPostcode\t5678 CD Teststad",
    "Leveradres\tAansluitstraat 3",
    "Postcode\t9012 EF Energiestad",
  ].join("\n"),
}];
const sideBySideObservation = extractEnergyDocumentObservation(
  sideBySidePages,
  [],
);
assert(
  sideBySideObservation.contractHolderName.displayable &&
    sideBySideObservation.contractHolderName.value === "Klant Voorbeeld" &&
    sideBySideObservation.supplierName.displayable &&
    sideBySideObservation.supplierName.value === "Voorbeeld Energie B.V.",
  "side_by_side_name_columns_not_semantically_separated",
);
pass();

assert(
  sideBySideObservation.deliveryAddress.displayable &&
    sideBySideObservation.deliveryAddress.street === "Aansluitstraat" &&
    sideBySideObservation.deliveryAddress.postalCode === "9012EF" &&
    !sideBySideObservation.deliveryAddress.value?.includes("Postadres"),
  "post_address_was_used_as_delivery_address",
);
pass();

const supplierLabelOnlyObservation = extractEnergyDocumentObservation([{
  page: 1,
  text:
    "Energieleverancier\nContact\nLeveradres\tProefweg 4\nPostcode\t1234 AB Teststad",
}], []);
assert(
  !supplierLabelOnlyObservation.supplierName.displayable &&
    supplierLabelOnlyObservation.supplierName.value === null &&
    Boolean(supplierLabelOnlyObservation.supplierName.rejectionReason),
  "supplier_label_without_value_was_displayable",
);
pass();

const ambiguousAddressObservation = extractEnergyDocumentObservation([{
  page: 1,
  text: [
    "Leveradres\tEersteweg 1",
    "Postcode\t1234 AB Teststad",
    "Aansluitadres\tTweedeweg 2",
    "Postcode\t5678 CD Proefstad",
  ].join("\n"),
}], []);
assert(
  !ambiguousAddressObservation.deliveryAddress.displayable &&
    ambiguousAddressObservation.deliveryAddress.value === null &&
    ambiguousAddressObservation.deliveryAddress.rejectionReason ===
      "multiple_delivery_address_candidates",
  "two_delivery_addresses_were_combined_or_displayed",
);
pass();

const combinedHolderObservation = extractEnergyDocumentObservation([{
  page: 1,
  text: [
    "Klantgegevens",
    "Naam\tNaam Klant Voorbeeld Naam Voorbeeld Energie B.V.",
  ].join("\n"),
}], []);
assert(
  !combinedHolderObservation.contractHolderName.displayable &&
    combinedHolderObservation.contractHolderName.value === null &&
    Boolean(combinedHolderObservation.contractHolderName.rejectionReason),
  "combined_name_columns_were_displayable",
);
pass();

const applicant = {
  ...createPersonalInfoDraft(),
  firstName: "Anna Maria",
  lastName: "de Vries",
};
assert(
  compareApplicantToObservedHolder(
    applicant,
    observedValue("Anna Maria de Vries"),
  ).status === "exact_full_match",
  "exact_name_match_failed",
);
pass();

assert(
  compareApplicantToObservedHolder(
    applicant,
    observedValue("A. M. de Vries"),
  ).status === "initial_and_surname_match",
  "initials_name_probable_match_failed",
);
pass();

assert(
  compareApplicantToObservedHolder(
    applicant,
    observedValue("Anna Maria Jansen"),
  ).status === "mismatch",
  "different_surname_mismatch_failed",
);
pass();

assert(
  compareApplicantToObservedHolder(
    { ...applicant, accountType: "zakelijk", companyName: "Voorbeeld B.V." },
    observedValue("Anna Maria de Vries"),
  ).status === "mismatch",
  "natural_signer_was_treated_as_business_holder_match",
);
pass();

assert(
  compareApplicantToObservedHolder(
    { ...applicant, accountType: "vve", organizationName: "VvE Zonnehof" },
    observedValue("VvE Zonnehof"),
  ).status === "exact_full_match",
  "legal_organization_name_match_failed",
);
pass();

const declaredAddress = {
  ...createLocationDraft().address,
  postcode: "1234 ab",
  houseNumber: "12",
  suffix: "a",
  street: "Bewijsstraat",
  city: "Proefstad",
};
assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    declaredAddress,
    observedAddress(),
  ).status === "match",
  "postcode_house_number_match_failed",
);
pass();

assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    { ...declaredAddress, suffix: "" },
    observedAddress(),
  ).status === "probable_match",
  "missing_addition_probable_match_failed",
);
pass();

assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    declaredAddress,
    observedAddress({ houseNumber: "13" }),
  ).status === "mismatch",
  "different_house_number_mismatch_failed",
);
pass();

assert(
  compareDeclaredLocationToObservedDeliveryAddress(
    createLocationDraft().address,
    observedAddress(),
  ).status === "unavailable",
  "empty_location_input_must_not_claim_comparison",
);
pass();

assert(
  compareApplicantToObservedHolder(
    createPersonalInfoDraft(),
    observedValue("Klant Voorbeeld"),
  ).status === "unavailable",
  "empty_applicant_input_must_not_claim_comparison",
);
pass();

const card = await source(
  "app/src/features/signup/EnergyDocumentCheckCard.tsx",
);
const sharedCard = await source(
  "app/src/features/signup/DocumentCheckCard.tsx",
);
for (
  const label of [
    "EAN elektriciteit",
    "Contracthouder",
    "Leveradres",
    "Energieleverancier",
    "Contract vanaf",
  ]
) {
  assert(card.includes(`label: "${label}"`), `card_label_missing:${label}`);
}
assert(
  sharedCard.includes('title = "Uit het document gehaald"'),
  "card_title_missing",
);
pass();

const confirmation = await source(
  "app/src/features/signup/ConnectionEanConfirmation.tsx",
);
assert(
  !confirmation.includes("candidate.context") &&
    !card.includes("context") &&
    !card.includes("sourcePage") &&
    !card.includes("confidence") &&
    !card.includes("rejectionReason"),
  "raw_or_technical_parser_context_visible",
);
pass();

assert(
  card.includes(".displayable") &&
    card.includes("partyComparison.status") &&
    card.includes("addressComparison.status") &&
    !sharedCard.includes("Niet automatisch te controleren") &&
    !sharedCard.includes('status-pill">Niet'),
  "displayability_or_unavailable_status_presentation_missing",
);
pass();

assert(
  !card.includes("gasConnections") &&
    confirmation.includes("getConfirmableEnergyEanCandidates") &&
    confirmation.includes("confirmableCandidates.map"),
  "gas_ean_visible_in_normal_customer_route",
);
pass();

const section = await source(
  "app/src/features/signup/SignupConnectionSection.tsx",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const documentFirstMatrix = await source(
  "app/src/features/signup/DocumentFirstCheckMatrix.tsx",
);
const documentFirstSelectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const documentReviewMatrix = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
assert(
  documentFirstSelectors.includes("requiresConfirmation") &&
    documentFirstMatrix.includes("onCorrect(row, value)") &&
    documentFirstMatrix.includes("Document vervangen") &&
    documentFirstMatrix.includes("Waarde corrigeren") &&
    documentReviewMatrix.includes('decision.status === "review_required"') &&
    !shell.includes('setActiveStep("gaps")'),
  "inline_mismatch_correction_action_missing",
);
pass();

const types = await source("app/src/features/signup/signupTypes.ts");
const mapper = await source("app/src/features/signup/signupSubmitMapper.ts");
const normalizers = await source(
  "app/src/features/signup/signupNormalizers.ts",
);
assert(
  types.includes(
    "energyDocumentObservation: EnergyDocumentObservation | null",
  ) &&
    section.includes("onEnergyDocumentObservationChange") &&
    mapper.includes("assertExclusiveConnectionDeclarationSource") &&
    !mapper.includes("energy_document_observation:"),
  "observation_not_separate_from_declared_or_reached_payload",
);
pass();

assert(
  section.includes("selectedCandidateEan: candidate.normalizedEan") &&
    confirmation.includes(
      "confirmedEan: customerConfirmed ? value.selectedCandidateEan :",
    ) &&
    mapper.includes("connectionDeclaration.confirmedEan") &&
    mapper.includes("connectionDeclaration.customerConfirmed"),
  "confirmed_electricity_ean_boundary_missing",
);
pass();

const locationA = createLocationDraft();
const locationB = createLocationDraft();
locationA.energyDocumentObservation = syntheticObservation;
assert(
  locationB.energyDocumentObservation === null &&
    locationA.clientId !== locationB.clientId,
  "multi_location_observation_leak",
);
pass();

assert(
  section.includes("transitionLocationToDocumentEanSource") &&
    section.includes("transitionLocationToManualEanSource") &&
    section.includes(
      "onEnergyDocumentObservationChange(location.clientId, null)",
    ) &&
    normalizers.includes("energyDocumentObservation: null"),
  "document_change_observation_reset_missing",
);
pass();

assert(
  syntheticObservation.electricityNetworkOperatorCandidate.value ===
      "Voorbeeld Netbeheer" &&
    !card.toLocaleLowerCase("nl-NL").includes("netbeheerder"),
  "network_operator_not_internal_or_customer_facing",
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

const productionSources = [
  await source(
    "app/src/features/invoice-analysis/energyDocumentObservation.ts",
  ),
  await source("app/src/features/signup/energyDocumentCrossCheck.ts"),
  card,
  section,
  confirmation,
  shell,
  sharedCard,
  normalizers,
].join("\n");
assert(
  !productionSources.includes("style={{") &&
    !sharedCard.includes("className={`") &&
    sharedCard.includes("invoice-preview-panel") &&
    sharedCard.includes("status-pill"),
  "inline_or_duplicate_card_css_present",
);
pass();

const realPdfPath = Deno.env.get("ENVAL_EAN_REAL_PDF")?.trim() || "";
assert(realPdfPath, "real_pdf_env_missing");
const realResult = await parseInvoicePdfInput(await Deno.readFile(realPdfPath));
assert(realResult.ok, "real_pdf_parse_failed");
const realObservation = projectEnergyDocumentObservation(
  realResult.observation_envelope,
);
const realElectricity = realObservation.electricityConnections;
const realGas = realObservation.gasConnections;
const realSerialized = JSON.stringify(realObservation).toLocaleLowerCase(
  "nl-NL",
);
const realHolder = realObservation.contractHolderName.value || "";
const realSupplier = realObservation.supplierName.value || "";
const realAddress = realObservation.deliveryAddress.value || "";
console.log(
  `real_pdf_supplier_present=${Boolean(realObservation.supplierName.value)}`,
);
console.log(
  `real_pdf_holder_present=${
    Boolean(realObservation.contractHolderName.value)
  }`,
);
console.log(
  `real_pdf_delivery_address_present=${
    Boolean(realObservation.deliveryAddress.postalCode) &&
    Boolean(realObservation.deliveryAddress.houseNumber)
  }`,
);
console.log(`real_pdf_electricity_count=${realElectricity.length}`);
console.log(`real_pdf_gas_count=${realGas.length}`);
console.log(
  `real_pdf_electricity_valid_from_present=${
    Boolean(realElectricity[0]?.validFrom)
  }`,
);
console.log(
  `real_pdf_network_operator_ambiguous=${
    realObservation.limitations.includes("network_operator_ambiguous")
  }`,
);
console.log("real_pdf_output_values_omitted=true");
assert(
  realObservation.supplierName.displayable &&
    realObservation.contractHolderName.displayable &&
    realObservation.deliveryAddress.displayable &&
    realElectricity.length === 1 && realGas.length === 1 &&
    realElectricity.filter((connection) => Boolean(connection.validFrom))
        .length === 1,
  "real_pdf_required_observations_missing",
);
assert(
  (realHolder.match(/\bnaam\b/gi) || []).length === 0 &&
    !/\b(?:postadres|postcode|ean|energieleverancier)\b/i.test(realHolder) &&
    !/\benergie\s+(?:b\.?\s*v\.?|n\.?\s*v\.?)\b/i.test(realHolder),
  "real_pdf_holder_candidate_not_bounded",
);
assert(
  realSupplier.toLocaleLowerCase("nl-NL") !== "naam" &&
    !/^(?:leverancier|energieleverancier|onze gegevens|contact)$/i.test(
      realSupplier,
    ),
  "real_pdf_supplier_candidate_is_label",
);
assert(
  !/\b(?:postadres|postcode|adres|plaats|naam)\b/i.test(realAddress) &&
    (realAddress.match(/\b\d{4}\s?[a-z]{2}\b/gi) || []).length === 1,
  "real_pdf_delivery_address_not_coherent",
);
for (
  const forbiddenKey of [
    "iban",
    "birthdate",
    "phone",
    "email",
    "customernumber",
    "termamount",
    "tariff",
    "paymentmethod",
  ]
) {
  assert(
    !realSerialized.includes(`\"${forbiddenKey}\"`),
    `real_pdf_forbidden_key:${forbiddenKey}`,
  );
}
pass();

assert(question === 37, "unexpected_question_count:" + question);
console.log("signup-energy-document-crosscheck-proof-ok");
