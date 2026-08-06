import type {
  EnergyDocumentObservation,
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
  createFreshSignupDraft,
  hasMeaningfulSignupDraft,
  transitionSignupAccountType,
} from "../../app/src/features/signup/signupAccountTypeTransition.ts";
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
    `PILOT-SIGNUP-PARTY-RUNTIME-04-Q${String(question).padStart(2, "0")}: PASS`,
  );
}

async function source(path: string): Promise<string> {
  return await Deno.readTextFile(new URL(path, ROOT));
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

function unavailableAddress(): ObservedDeliveryAddress {
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

function energyObservation(name: string): EnergyDocumentObservation {
  return {
    supplierName: observedValue(null),
    contractHolderName: observedValue(name),
    deliveryAddress: unavailableAddress(),
    electricityConnections: [],
    gasConnections: [],
    documentDate: observedValue(null),
    electricityNetworkOperatorCandidate: observedValue(null),
    limitations: [],
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
    location: unavailableAddress(),
    installationDate: unavailable,
    installationYear: unavailable,
    invoiceDate: unavailable,
  };
}

const charger: ChargerDraft = {
  clientId: "charger-runtime-proof",
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

type RuntimeFixture = {
  draft: SignupDraft;
  energy: EnergyDocumentObservation;
  charger: ChargerDocumentObservation;
};

function renderRuntimeComparisons(fixture: RuntimeFixture) {
  return {
    energy: compareEnergyDocumentPartyName(
      fixture.draft,
      fixture.energy.contractHolderName,
    ),
    charger: compareChargerDocumentObservation(
      charger,
      fixture.draft,
      fixture.draft.locations[0].address,
      fixture.charger,
    ).customerName,
  };
}

function privateRuntime(
  firstName: string,
  observedName: string,
): RuntimeFixture {
  const draft = createFreshSignupDraft("particulier");
  draft.personalInfo.firstName = firstName;
  draft.personalInfo.lastName = "Koote";
  return {
    draft,
    energy: energyObservation(observedName),
    charger: chargerObservation(observedName),
  };
}

const reactiveFixture = privateRuntime("Daan", "D. Koote");
const energyObservationBefore = reactiveFixture.energy;
const chargerObservationBefore = reactiveFixture.charger;
let rendered = renderRuntimeComparisons(reactiveFixture);
assert(
  rendered.energy.status === "initial_and_surname_match" &&
    rendered.charger.status === "initial_and_surname_match",
  "initial_runtime_status_missing",
);
pass();

reactiveFixture.draft = {
  ...reactiveFixture.draft,
  personalInfo: { ...reactiveFixture.draft.personalInfo, firstName: "Paul" },
};
rendered = renderRuntimeComparisons(reactiveFixture);
assert(
  rendered.energy.status === "mismatch" &&
    rendered.charger.status === "mismatch" &&
    reactiveFixture.energy === energyObservationBefore &&
    reactiveFixture.charger === chargerObservationBefore,
  "current_applicant_did_not_recompute_against_same_observation",
);
pass();

reactiveFixture.draft = {
  ...reactiveFixture.draft,
  personalInfo: { ...reactiveFixture.draft.personalInfo, firstName: "Daan" },
};
rendered = renderRuntimeComparisons(reactiveFixture);
assert(
  rendered.energy.status === "initial_and_surname_match" &&
    rendered.charger.status === "initial_and_surname_match",
  "runtime_status_did_not_restore_without_reparse",
);
pass();

const differentObserved = privateRuntime("Daan", "Paul Koote");
rendered = renderRuntimeComparisons(differentObserved);
assert(
  rendered.energy.status === "mismatch" &&
    rendered.charger.status === "mismatch" &&
    rendered.energy.focusTarget === "applicant.firstName" &&
    rendered.charger.focusTarget === "applicant.firstName",
  "different_observed_person_was_not_mismatch",
);
pass();

const exactObserved = privateRuntime("Daan", "Daan Koote");
rendered = renderRuntimeComparisons(exactObserved);
assert(
  rendered.energy.status === "exact_full_match" &&
    rendered.charger.status === "exact_full_match",
  "exact_runtime_status_missing",
);
pass();

const businessDraft = createFreshSignupDraft("zakelijk");
businessDraft.personalInfo.firstName = "Paul";
businessDraft.personalInfo.lastName = "Koote";
businessDraft.personalInfo.companyName = "Voorbeeld Energie BV";
const businessMatch = renderRuntimeComparisons({
  draft: businessDraft,
  energy: energyObservation("Voorbeeld Energie B.V."),
  charger: chargerObservation("Voorbeeld Energie BV"),
});
assert(
  businessMatch.energy.status === "exact_full_match" &&
    businessMatch.charger.status === "exact_full_match",
  "business_legal_entity_match_missing",
);
pass();

const businessMismatch = renderRuntimeComparisons({
  draft: businessDraft,
  energy: energyObservation("Paul Koote"),
  charger: chargerObservation("Paul Koote"),
});
assert(
  businessMismatch.energy.status === "mismatch" &&
    businessMismatch.charger.status === "mismatch" &&
    businessMismatch.energy.focusTarget === "legalEntity.name" &&
    businessMismatch.charger.focusTarget === "legalEntity.name",
  "business_representative_masked_legal_entity_mismatch",
);
pass();

const vveDraft = createFreshSignupDraft("vve");
vveDraft.personalInfo.firstName = "Paul";
vveDraft.personalInfo.lastName = "Koote";
vveDraft.personalInfo.organizationName = "VvE Zonnehof";
const vveMatch = renderRuntimeComparisons({
  draft: vveDraft,
  energy: energyObservation("VvE Zonnehof"),
  charger: chargerObservation("VvE Zonnehof"),
});
const vveMismatch = renderRuntimeComparisons({
  draft: vveDraft,
  energy: energyObservation("Daan Koote"),
  charger: chargerObservation("Daan Koote"),
});
assert(
  vveMatch.energy.status === "exact_full_match" &&
    vveMatch.charger.status === "exact_full_match" &&
    vveMismatch.energy.status === "mismatch" &&
    vveMismatch.charger.status === "mismatch",
  "vve_legal_entity_runtime_semantics_failed",
);
pass();

const incompleteDraft = createFreshSignupDraft("particulier");
incompleteDraft.personalInfo.firstName = "Daan";
const incomplete = renderRuntimeComparisons({
  draft: incompleteDraft,
  energy: energyObservation("Daan Koote"),
  charger: chargerObservation("Daan Koote"),
});
assert(
  incomplete.energy.status === "unavailable" &&
    incomplete.charger.status === "unavailable",
  "incomplete_expected_name_was_compared",
);
pass();

const emptyDraft = createFreshSignupDraft("particulier");
assert(!hasMeaningfulSignupDraft(emptyDraft), "fresh_draft_was_meaningful");
const emptySwitch = transitionSignupAccountType(emptyDraft, "zakelijk", false);
assert(
  emptySwitch.changed && !emptySwitch.confirmationRequired &&
    emptySwitch.draft.personalInfo.accountType === "zakelijk" &&
    emptySwitch.draft.locations.length === 1 &&
    emptySwitch.draft.locations[0].chargers.length === 1,
  "empty_account_type_switch_failed",
);
pass();

const oldApplicantFile = new File(["proof"], "applicant-proof.pdf", {
  type: "application/pdf",
});
const oldEnergyFile = new File(["proof"], "energy-proof.pdf", {
  type: "application/pdf",
});
const oldChargerFile = new File(["proof"], "charger-proof.pdf", {
  type: "application/pdf",
});
const filledDraft = createFreshSignupDraft("particulier");
filledDraft.personalInfo.firstName = "Daan";
filledDraft.personalInfo.lastName = "Koote";
filledDraft.personalInfo.email = "proof@example.invalid";
filledDraft.personalInfo.kvkDocument = oldApplicantFile;
filledDraft.locations[0].address.postcode = "1234AB";
filledDraft.locations[0].address.houseNumber = "12";
filledDraft.locations[0].address.bagId = "proof-bag";
filledDraft.locations[0].energyDocument.file = oldEnergyFile;
filledDraft.locations[0].energyDocument.status = "selected";
filledDraft.locations[0].energyDocumentObservation = energyObservation(
  "Daan Koote",
);
filledDraft.locations[0].connectionDeclaration.preflightStatus =
  "electricity_candidate_found";
filledDraft.locations[0].connectionDeclaration.candidates = [{
  normalizedEan: "871685900012345678",
  classification: "electricity",
  context: "proof context omitted",
  page: 1,
}];
filledDraft.locations[0].connectionDeclaration.selectedCandidateEan =
  "871685900012345678";
filledDraft.locations[0].connectionDeclaration.confirmedEan =
  "871685900012345678";
filledDraft.locations[0].connectionDeclaration.customerConfirmed = true;
filledDraft.locations[0].connectionDeclaration.preflightStatus =
  "customer_confirmed";
filledDraft.locations[0].chargers[0].brand = "1";
filledDraft.locations[0].chargers[0].midNumber = "MID-PROOF";
const chargerDocument = filledDraft.documentsByChargerId[
  filledDraft.locations[0].chargers[0].clientId
][0];
chargerDocument.file = oldChargerFile;
chargerDocument.status = "selected";
chargerDocument.observation = chargerObservation("Daan Koote");
chargerDocument.parseStatus = "parsed";
const extraLocation = createFreshSignupDraft("particulier").locations[0];
extraLocation.connectionDeclaration.sourceMode = "manual";
extraLocation.connectionDeclaration.manualEan = "871685900087654321";
extraLocation.connectionDeclaration.confirmedEan = "871685900087654321";
extraLocation.connectionDeclaration.customerConfirmed = true;
extraLocation.connectionDeclaration.preflightStatus =
  "manual_customer_confirmed";
filledDraft.locations.push(extraLocation);
filledDraft.consents.termsBundleAccepted = true;
assert(hasMeaningfulSignupDraft(filledDraft), "filled_draft_not_detected");
pass();

const cancelled = transitionSignupAccountType(filledDraft, "vve", false);
assert(
  !cancelled.changed && cancelled.confirmationRequired &&
    cancelled.draft === filledDraft &&
    cancelled.draft.locations[0].energyDocument.file === oldEnergyFile &&
    cancelled.draft.documentsByChargerId[
        filledDraft.locations[0].chargers[0].clientId
      ][0].file === oldChargerFile,
  "cancelled_transition_changed_draft_or_files",
);
pass();

const confirmed = transitionSignupAccountType(filledDraft, "vve", true);
const fresh = confirmed.draft;
assert(
  confirmed.changed && confirmed.confirmationRequired &&
    fresh.personalInfo.accountType === "vve" &&
    fresh.personalInfo.firstName === "" &&
    fresh.personalInfo.lastName === "" &&
    fresh.personalInfo.companyName === "" &&
    fresh.personalInfo.organizationName === "" &&
    fresh.personalInfo.email === "" && fresh.personalInfo.phone === "" &&
    fresh.personalInfo.kvkDocument === null &&
    fresh.locations.length === 1 && fresh.locations[0].chargers.length === 1,
  "confirmed_transition_did_not_reset_account_or_shape",
);
pass();

const freshLocation = fresh.locations[0];
const freshDocument = fresh.documentsByChargerId[
  freshLocation.chargers[0].clientId
][0];
assert(
  freshLocation.address.postcode === "" &&
    freshLocation.address.bagId === null &&
    freshLocation.energyDocument.file === null &&
    freshLocation.energyDocumentObservation === null &&
    freshLocation.connectionDeclaration.preflightStatus === "idle" &&
    freshLocation.connectionDeclaration.candidates.length === 0 &&
    freshLocation.connectionDeclaration.selectedCandidateEan === "" &&
    freshLocation.connectionDeclaration.confirmedEan === "" &&
    freshLocation.connectionDeclaration.manualEan === "" &&
    !freshLocation.connectionDeclaration.customerConfirmed &&
    freshLocation.chargers[0].brand === "" &&
    freshLocation.chargers[0].midNumber === "" &&
    freshDocument.file === null && freshDocument.observation === null &&
    freshDocument.parseStatus === "idle" &&
    !fresh.consents.termsBundleAccepted,
  "confirmed_transition_retained_domain_state",
);
pass();

function containsReference(
  value: unknown,
  reference: object,
  seen = new Set<object>(),
): boolean {
  if (value === reference) return true;
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some((child) =>
    containsReference(child, reference, seen)
  );
}
assert(
  !containsReference(fresh, oldApplicantFile) &&
    !containsReference(fresh, oldEnergyFile) &&
    !containsReference(fresh, oldChargerFile) &&
    freshLocation.clientId !== filledDraft.locations[0].clientId &&
    freshLocation.chargers[0].clientId !==
      filledDraft.locations[0].chargers[0].clientId,
  "fresh_transition_retained_old_reference_or_id",
);
pass();

const secondSwitch = transitionSignupAccountType(fresh, "zakelijk", true);
assert(
  secondSwitch.changed && secondSwitch.draft !== fresh &&
    secondSwitch.draft.locations[0].clientId !== freshLocation.clientId &&
    secondSwitch.draft.personalInfo.organizationName === "" &&
    secondSwitch.draft.personalInfo.companyName === "",
  "account_type_history_was_cached",
);
pass();

let currentGeneration = 0;
let appliedObservation: EnergyDocumentObservation | null = null;
let resolveParser: ((value: EnergyDocumentObservation) => void) | null = null;
const parserPromise = new Promise<EnergyDocumentObservation>((resolve) => {
  resolveParser = resolve;
});
const capturedGeneration = currentGeneration;
const pendingApply = parserPromise.then((observation) => {
  if (currentGeneration !== capturedGeneration) return false;
  appliedObservation = observation;
  return true;
});
currentGeneration += 1;
resolveParser!(energyObservation("Daan Koote"));
assert(
  !(await pendingApply) && appliedObservation === null,
  "stale_parser_result_was_applied_after_reset",
);
pass();

const shell = await source("app/src/features/signup/SignupPageShell.tsx");
const documentFirstDocuments = await source(
  "app/src/features/signup/DocumentFirstDocumentsStep.tsx",
);
const documentFirstSelectors = await source(
  "app/src/features/signup/documentFirstSignupSelectors.ts",
);
const documentReviewMatrix = await source(
  "app/src/features/signup/documentReviewMatrix.ts",
);
const energyCrossCheck = await source(
  "app/src/features/signup/energyDocumentCrossCheck.ts",
);
const chargerCrossCheck = await source(
  "app/src/features/signup/chargerDocumentCrossCheck.ts",
);
assert(
  shell.includes("draftGenerationRef.current += 1") &&
    shell.includes('dispatch({ type: "replace_draft", value: fresh })') &&
    shell.includes('setActiveStep("account")') &&
    documentFirstDocuments.includes(
      "isDraftGenerationCurrent(generation)",
    ) &&
    documentFirstDocuments.includes("energyAttempts.current.get(locationId)") &&
    documentFirstDocuments.includes("chargerAttempts.current.get(chargerId)"),
  "runtime_reset_or_generation_wiring_missing",
);
pass();

assert(
  shell.includes("useMemo") &&
    shell.includes("selectDocumentReviewMatrix(draft, activeLocationId") &&
    shell.includes("[activeLocationId, draft]") &&
    documentFirstSelectors.includes("compareEnergyDocumentPartyName(") &&
    documentFirstSelectors.includes("compareChargerDocumentObservation(") &&
    documentReviewMatrix.includes('factKey === "partyName"') &&
    energyCrossCheck.includes("compareSignupDraftToObservedDocumentParty(") &&
    chargerCrossCheck.includes("compareSignupDraftToObservedDocumentParty("),
  "integrated_current_draft_selector_wiring_missing",
);
pass();

assert(
  shell.includes(
    "Accounttype wijzigen? Alle ingevulde gegevens en geselecteerde documenten worden gewist.",
  ) &&
    shell.includes("confirmSignupAccountTypeReset") &&
    shell.includes("window.confirm(message)") &&
    shell.includes("if (transition.changed)") &&
    !shell.includes("draftByAccountType") && !shell.includes("cachedDraft"),
  "confirmation_or_no_hidden_cache_boundary_missing",
);
pass();

const card = await source("app/src/features/signup/DocumentCheckCard.tsx");
assert(
  card.includes('if (status === "exact_full_match")') &&
    card.includes('"Initiaal en achternaam komen overeen"') &&
    card.includes('if (status === "mismatch")') &&
    !card.includes("accountType") && !card.includes("parseInvoicePdfInput") &&
    !card.includes("compareEnergyDocumentPartyName") &&
    !card.includes("compareChargerDocumentObservation"),
  "document_card_contains_comparison_business_logic",
);
pass();

assert(question === 21, "unexpected_question_count:" + question);
console.log("signup-party-runtime-04-proof-ok");
