import {
  createConsentDraft,
  createDocumentDraftsForCharger,
  createLocationDraft,
  createPersonalInfoDraft,
} from "./signupNormalizers";
import type {
  AccountType,
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  ConnectionDeclarationDraft,
  SignupDraft,
} from "./signupTypes";

export type SignupAccountTypeTransition = {
  changed: boolean;
  confirmationRequired: boolean;
  draft: SignupDraft;
};

export function createFreshSignupDraft(accountType: AccountType): SignupDraft {
  const personalInfo = createPersonalInfoDraft();
  personalInfo.accountType = accountType;
  const location = createLocationDraft();

  return {
    personalInfo,
    locations: [location],
    documentsByChargerId: Object.fromEntries(
      location.chargers.map((charger) => [
        charger.clientId,
        createDocumentDraftsForCharger(charger.clientId),
      ]),
    ),
    consents: createConsentDraft(),
  };
}

function hasMeaningfulAddress(address: AddressDraft): boolean {
  return Boolean(
    address.postcode.trim() ||
      address.houseNumber.trim() ||
      address.suffix.trim() ||
      address.street.trim() ||
      address.city.trim() ||
      (address.country.trim() && address.country.trim() !== "Nederland") ||
      address.bagId ||
      address.resolvedLookupKey,
  );
}

function hasMeaningfulConnection(
  declaration: ConnectionDeclarationDraft,
): boolean {
  return declaration.sourceMode !== "document" ||
    declaration.preflightStatus !== "idle" ||
    declaration.candidates.length > 0 ||
    Boolean(
      declaration.selectedCandidateEan ||
        declaration.confirmedEan ||
        declaration.manualEan ||
        declaration.customerConfirmed,
    );
}

function hasMeaningfulCharger(charger: ChargerDraft): boolean {
  return charger.source !== "manual" ||
    charger.brand.trim() !== "" ||
    charger.manualBrand.trim() !== "" ||
    charger.model.trim() !== "" ||
    charger.manualModel.trim() !== "" ||
    (charger.installationYear.trim() !== "" &&
      charger.installationYear.trim() !== String(new Date().getFullYear())) ||
    charger.midNumber.trim() !== "" ||
    charger.serialNumber.trim() !== "" ||
    charger.backendSupplier.trim() !== "" ||
    charger.manualBackendSupplier.trim() !== "" ||
    (charger.solarPanelStatus !== "" && charger.solarPanelStatus !== "none");
}

function hasMeaningfulChargerDocument(
  document: ChargerDocumentDraft,
): boolean {
  return Boolean(
    document.file ||
      document.status !== "empty" ||
      document.observation ||
      document.parseStatus !== "idle",
  );
}

export function hasMeaningfulSignupDraft(draft: SignupDraft): boolean {
  const applicant = draft.personalInfo;
  if (
    applicant.firstName.trim() ||
    applicant.lastName.trim() ||
    applicant.companyName.trim() ||
    applicant.organizationName.trim() ||
    applicant.kvkNumber.trim() ||
    applicant.email.trim() ||
    applicant.phone.trim() ||
    applicant.kvkDocument ||
    hasMeaningfulAddress(applicant.address) ||
    draft.consents.termsBundleAccepted
  ) return true;

  if (draft.locations.length !== 1) return true;
  if (
    draft.locations.some((location) =>
      hasMeaningfulAddress(location.address) ||
      location.energyDocument.file !== null ||
      location.energyDocument.status !== "empty" ||
      location.energyDocumentObservation !== null ||
      hasMeaningfulConnection(location.connectionDeclaration) ||
      location.chargers.length !== 1 ||
      location.chargers.some(hasMeaningfulCharger)
    )
  ) return true;

  return Object.values(draft.documentsByChargerId).some((documents) =>
    documents.some(hasMeaningfulChargerDocument)
  );
}

export function transitionSignupAccountType(
  draft: SignupDraft,
  accountType: AccountType,
  confirmed: boolean,
): SignupAccountTypeTransition {
  if (accountType === draft.personalInfo.accountType) {
    return { changed: false, confirmationRequired: false, draft };
  }

  const confirmationRequired = hasMeaningfulSignupDraft(draft);
  if (confirmationRequired && !confirmed) {
    return { changed: false, confirmationRequired, draft };
  }

  return {
    changed: true,
    confirmationRequired,
    draft: createFreshSignupDraft(accountType),
  };
}
