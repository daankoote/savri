import type {
  ObservedDeliveryAddress,
  ObservedValue,
} from "../../app/src/features/invoice-analysis/energyDocumentObservation.ts";
import {
  compareChargerDocumentObservation,
} from "../../app/src/features/signup/chargerDocumentCrossCheck.ts";
import {
  compareEnergyDocumentPartyName,
} from "../../app/src/features/signup/energyDocumentCrossCheck.ts";
import {
  compareSignupDraftToObservedDocumentParty,
  resolveExpectedDocumentPartyName,
} from "../../app/src/features/signup/signupPartyNameCrossCheck.ts";
import {
  createLocationDraft,
  createPersonalInfoDraft,
  transitionLocationToManualEanSource,
} from "../../app/src/features/signup/signupNormalizers.ts";
import type {
  AccountType,
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
    `PILOT-SIGNUP-PARTY-NAME-CROSSCHECK-03-Q${
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

function observedValue(value: string | null): ObservedValue {
  return value
    ? {
      value,
      sourcePage: 1,
      confidence: "high",
      extractionMethod: "semantic_contract_holder_block",
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

function observedAddress(): ObservedDeliveryAddress {
  return {
    value: null,
    street: null,
    houseNumber: null,
    houseNumberAddition: null,
    postalCode: null,
    city: null,
    country: null,
    sourcePage: null,
    confidence: "unavailable",
    extractionMethod: "not_found",
    displayable: false,
    rejectionReason: "proof_value_missing",
  };
}

function proofDraft(
  accountType: AccountType = "particulier",
  overrides: Partial<ReturnType<typeof createPersonalInfoDraft>> = {},
): SignupDraft {
  return {
    personalInfo: {
      ...createPersonalInfoDraft(),
      accountType,
      firstName: "Daan",
      lastName: "Koote",
      companyName: accountType === "zakelijk" ? "Voorbeeld Energie BV" : "",
      organizationName: accountType === "vve" ? "VvE Zonnehof" : "",
      ...overrides,
    },
    locations: [createLocationDraft()],
    documentsByChargerId: {},
    consents: { termsBundleAccepted: false },
  };
}

function chargerObservation(name: string): ChargerDocumentObservation {
  const unavailable = observedValue(null);
  return {
    customerName: observedValue(name),
    supplierInstallerName: unavailable,
    brand: unavailable,
    model: unavailable,
    serialNumber: unavailable,
    midNumber: unavailable,
    location: observedAddress(),
    installationDate: unavailable,
    installationYear: unavailable,
    invoiceDate: unavailable,
  };
}

const charger: ChargerDraft = {
  clientId: "charger-proof",
  source: "manual",
  brand: "",
  manualBrand: "",
  model: "",
  manualModel: "",
  installationYear: "",
  midNumber: "",
  serialNumber: "",
  backendSupplier: "",
  manualBackendSupplier: "",
  solarPanelStatus: "none",
};

const privateDraft = proofDraft();
const privateExpected = resolveExpectedDocumentPartyName(privateDraft);
assert(
  privateExpected?.kind === "natural_person" &&
    privateExpected.value === "Daan Koote",
  "private_expected_party_failed",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
    privateDraft,
    observedValue("Daan Koote"),
  ).status === "exact_full_match",
  "private_exact_full_match_failed",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
    privateDraft,
    observedValue("D. Koote"),
  ).status === "initial_and_surname_match",
  "private_initial_match_failed",
);
assert(
  compareSignupDraftToObservedDocumentParty(
    proofDraft("particulier", { firstName: "Daa" }),
    observedValue("D. Koote"),
  ).status === "initial_and_surname_match",
  "initial_does_not_prove_full_given_name",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
    proofDraft("particulier", { firstName: "Daa" }),
    observedValue("Daan Koote"),
  ).status === "mismatch",
  "full_given_name_typo_was_accepted",
);
assert(
  compareSignupDraftToObservedDocumentParty(
    privateDraft,
    observedValue("Daa Koote"),
  ).status === "mismatch",
  "prefix_or_edit_distance_was_accepted",
);
pass();

const differentInitial = compareSignupDraftToObservedDocumentParty(
  privateDraft,
  observedValue("P. Koote"),
);
const differentFullName = compareSignupDraftToObservedDocumentParty(
  privateDraft,
  observedValue("Paul Koote"),
);
assert(
  differentInitial.status === "mismatch" &&
    differentInitial.focusTarget === "applicant.firstName" &&
    differentFullName.status === "mismatch" &&
    differentFullName.focusTarget === "applicant.firstName",
  "different_person_did_not_target_given_name",
);
pass();

const surnameDraft = proofDraft("particulier", {
  firstName: "Anna Maria",
  lastName: "de Vries",
});
assert(
  compareSignupDraftToObservedDocumentParty(
        surnameDraft,
        observedValue("Anna Maria de Vries"),
      ).status === "exact_full_match" &&
    compareSignupDraftToObservedDocumentParty(
        surnameDraft,
        observedValue("A. M. de Vries"),
      ).status === "initial_and_surname_match",
  "multi_given_name_or_surname_particles_failed",
);
pass();

const surnameMismatch = compareSignupDraftToObservedDocumentParty(
  surnameDraft,
  observedValue("Anna Maria Jansen"),
);
assert(
  surnameMismatch.status === "mismatch" &&
    surnameMismatch.focusTarget === "applicant.lastName",
  "surname_mismatch_focus_failed",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
        privateDraft,
        observedValue("Daan en Paul Koote"),
      ).status === "unavailable" &&
    compareSignupDraftToObservedDocumentParty(
        privateDraft,
        observedValue(null),
      ).status === "unavailable",
  "unreliable_or_missing_candidate_was_compared",
);
pass();

const businessDraft = proofDraft("zakelijk", {
  firstName: "Paul",
  lastName: "Koote",
  companyName: "Voorbeeld Energie BV",
});
const businessExpected = resolveExpectedDocumentPartyName(businessDraft);
assert(
  businessExpected?.kind === "organization" &&
    businessExpected.value === "Voorbeeld Energie BV",
  "business_legal_entity_ground_failed",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
    businessDraft,
    observedValue("Voorbeeld Energie B.V."),
  ).status === "exact_full_match",
  "business_legal_form_punctuation_failed",
);
pass();

const businessPersonMismatch = compareSignupDraftToObservedDocumentParty(
  businessDraft,
  observedValue("Paul Koote"),
);
assert(
  businessPersonMismatch.status === "mismatch" &&
    businessPersonMismatch.focusTarget === "legalEntity.name",
  "representative_masked_business_holder_mismatch",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
    businessDraft,
    observedValue("Energie BV"),
  ).status === "mismatch",
  "organization_substring_was_accepted",
);
pass();

const vveDraft = proofDraft("vve", {
  firstName: "Paul",
  lastName: "Koote",
  organizationName: "VvE Zonnehof",
});
const vveExpected = resolveExpectedDocumentPartyName(vveDraft);
assert(
  vveExpected?.kind === "organization" &&
    vveExpected.value === "VvE Zonnehof" &&
    compareSignupDraftToObservedDocumentParty(
        vveDraft,
        observedValue("Daan Koote"),
      ).status === "mismatch",
  "vve_legal_entity_or_representative_boundary_failed",
);
pass();

assert(
  compareSignupDraftToObservedDocumentParty(
        proofDraft("zakelijk", { companyName: "" }),
        observedValue("Voorbeeld Energie BV"),
      ).status === "unavailable" &&
    compareSignupDraftToObservedDocumentParty(
        proofDraft("vve", { organizationName: "" }),
        observedValue("VvE Zonnehof"),
      ).status === "unavailable",
  "missing_legal_name_was_compared",
);
pass();

assert(
  compareEnergyDocumentPartyName(
        privateDraft,
        observedValue("D. Koote"),
      ).status === "initial_and_surname_match" &&
    compareChargerDocumentObservation(
        charger,
        privateDraft,
        privateDraft.locations[0].address,
        chargerObservation("D. Koote"),
      ).customerName.status === "initial_and_surname_match",
  "energy_and_charger_name_semantics_diverged",
);
pass();

assert(
  compareChargerDocumentObservation(
        charger,
        privateDraft,
        privateDraft.locations[0].address,
        chargerObservation("Daan Koote"),
      ).customerName.status === "exact_full_match" &&
    compareChargerDocumentObservation(
        charger,
        privateDraft,
        privateDraft.locations[0].address,
        chargerObservation("Paul Koote"),
      ).customerName.status === "mismatch",
  "charger_full_or_other_person_semantics_failed",
);
pass();

for (const draft of [businessDraft, vveDraft]) {
  assert(
    compareChargerDocumentObservation(
      charger,
      draft,
      draft.locations[0].address,
      chargerObservation("Daan Koote"),
    ).customerName.status === "mismatch",
    "charger_organization_used_representative_fallback",
  );
}
pass();

const locationTwoDraft: SignupDraft = {
  ...privateDraft,
  locations: [privateDraft.locations[0], createLocationDraft()],
};
const locationStatuses = [
  compareEnergyDocumentPartyName(
    locationTwoDraft,
    observedValue("Daan Koote"),
  ).status,
  compareEnergyDocumentPartyName(
    locationTwoDraft,
    observedValue("Paul Koote"),
  ).status,
];
assert(
  locationStatuses[0] === "exact_full_match" &&
    locationStatuses[1] === "mismatch" &&
    resolveExpectedDocumentPartyName(locationTwoDraft)?.value ===
      privateExpected?.value,
  "multi_location_party_ground_or_status_isolation_failed",
);
pass();

const chargerStatuses = [
  compareChargerDocumentObservation(
    { ...charger, clientId: "charger-a" },
    privateDraft,
    privateDraft.locations[0].address,
    chargerObservation("Daan Koote"),
  ).customerName.status,
  compareChargerDocumentObservation(
    { ...charger, clientId: "charger-b" },
    privateDraft,
    privateDraft.locations[0].address,
    chargerObservation("Paul Koote"),
  ).customerName.status,
];
assert(
  chargerStatuses[0] === "exact_full_match" &&
    chargerStatuses[1] === "mismatch",
  "multi_charger_status_isolation_failed",
);
pass();

const manualDraft: SignupDraft = {
  ...privateDraft,
  locations: [transitionLocationToManualEanSource(privateDraft.locations[0])],
};
assert(
  manualDraft.locations[0].connectionDeclaration.sourceMode === "manual" &&
    resolveExpectedDocumentPartyName(manualDraft)?.value ===
      privateExpected?.value,
  "manual_ean_route_changed_expected_party",
);
pass();

const partyModule = await source(
  "app/src/features/signup/signupPartyNameCrossCheck.ts",
);
const energyModule = await source(
  "app/src/features/signup/energyDocumentCrossCheck.ts",
);
const chargerModule = await source(
  "app/src/features/signup/chargerDocumentCrossCheck.ts",
);
assert(
  energyModule.includes("compareSignupDraftToObservedDocumentParty") &&
    chargerModule.includes("compareSignupDraftToObservedDocumentParty") &&
    partyModule.includes("resolveExpectedDocumentPartyName") &&
    !energyModule.includes("includes(holder)") &&
    !partyModule.includes("startsWith(") &&
    !partyModule.includes("localeCompare"),
  "shared_resolver_or_no_fuzzy_source_boundary_failed",
);
pass();

const personalInfo = await source(
  "app/src/features/signup/PersonalInfoSection.tsx",
);
const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const documentFirstSelectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const documentFactRegistry = await source(
  "app/src/features/signup/documentFactRegistry.ts",
);
const documentReviewMatrix = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
assert(
  !personalInfo.includes('"Voornaam/voornamen (voluit)"') &&
    documentFactRegistry.includes('{ key: "partyName", label: "Naam"') &&
    documentReviewMatrix.includes('factKey === "partyName"') &&
    shell.includes("DocumentFirstCheckMatrix") &&
    !shell.includes('setActiveStep("gaps")') &&
    documentFirstSelectors.includes("selectOpenGaps"),
  "inline_document_party_name_review_missing",
);
pass();

const sharedCard = await source(
  "app/src/features/signup/DocumentCheckCard.tsx",
);
assert(
  sharedCard.includes('if (status === "exact_full_match")') &&
    sharedCard.includes('"Initiaal en achternaam komen overeen"') &&
    sharedCard.includes('if (status === "mismatch")') &&
    sharedCard.includes('row.comparisonStatus === "mismatch"') &&
    !partyModule.includes('status: "accepted"') &&
    !partyModule.includes("aangeslotene_status"),
  "party_status_ui_or_authority_boundary_failed",
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

assert(question === 24, "unexpected_question_count:" + question);
console.log("signup-party-name-crosscheck-proof-ok");
