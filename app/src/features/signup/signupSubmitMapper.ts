import { getBackendSupplierLabel, getBrandLabel, getModelLabel } from "./chargerCatalog";
import { normalizeHouseNumber, normalizePostcode, normalizeSuffix } from "./address/addressNormalizers";
import { normalizeEmail, normalizeKvkNumber, normalizePhone } from "./signupFieldNormalizers";
import type {
  AccountType,
  AddressDraft,
  ChargerDraft,
  SignupDraft,
  SignupLocationDraft,
} from "./signupTypes";

export type SignupSubmitAddressPayload = {
  postcode: string;
  houseNumber: string;
  suffix?: string;
  street?: string;
  city?: string;
  country?: string;
  lookupProvider?: string;
  lookupProviderId?: string;
  normalizedLookupKey?: string;
};

export type SignupSubmitChargerPayload = {
  clientChargerId: string;
  brand: string;
  brandLabel?: string;
  manualBrand?: string;
  model: string;
  modelLabel?: string;
  manualModel?: string;
  installationYear?: string;
  midNumber: string;
  serialNumber?: string;
  backendSupplier?: string;
  backendSupplierLabel?: string;
  manualBackendSupplier?: string;
  solarPanelStatus?: string;
};

export type SignupSubmitLocationPayload = {
  clientLocationId: string;
  address: SignupSubmitAddressPayload;
  chargers: SignupSubmitChargerPayload[];
};

export type SignupSubmitPayloadV3 = {
  accountType: AccountType;
  applicant: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    address: SignupSubmitAddressPayload;
  };
  legalEntity?: {
    type: "business" | "vve";
    name: string;
    kvkNumber: string;
  };
  consentBundleAcceptance: {
    accepted: boolean;
    versionRef: "signup-consent-v1";
  };
  feeTermsAcceptance: {
    accepted: boolean;
    versionRef: "fee-terms-v1";
  };
  locations: SignupSubmitLocationPayload[];
};

function optionalString(value: string): string | undefined {
  const normalized = value.trim();
  return normalized || undefined;
}

function stableLocationId(location: SignupLocationDraft | undefined, index: number): string {
  return optionalString(location?.clientId || "") || `location-${index + 1}`;
}

function stableChargerId(
  charger: ChargerDraft | undefined,
  locationIndex: number,
  chargerIndex: number,
): string {
  return optionalString(charger?.clientId || "") || `charger-${locationIndex + 1}-${chargerIndex + 1}`;
}

function mapAddress(address: AddressDraft): SignupSubmitAddressPayload {
  const payload: SignupSubmitAddressPayload = {
    postcode: normalizePostcode(address.postcode),
    houseNumber: normalizeHouseNumber(address.houseNumber),
    country: optionalString(address.country) || "Nederland",
  };

  const suffix = normalizeSuffix(address.suffix);
  if (suffix) payload.suffix = suffix;

  const street = optionalString(address.street);
  if (street) payload.street = street;

  const city = optionalString(address.city);
  if (city) payload.city = city;

  if (address.bagId) {
    payload.lookupProvider = "pdok";
    payload.lookupProviderId = address.bagId;
  }

  if (address.resolvedLookupKey) {
    payload.normalizedLookupKey = address.resolvedLookupKey;
  }

  return payload;
}

function mapCharger(
  charger: ChargerDraft,
  locationIndex: number,
  chargerIndex: number,
): SignupSubmitChargerPayload {
  const brand = charger.brand.trim();
  const model = charger.model.trim();
  const backendSupplier = charger.backendSupplier.trim();

  const payload: SignupSubmitChargerPayload = {
    clientChargerId: stableChargerId(charger, locationIndex, chargerIndex),
    brand,
    model,
    midNumber: charger.midNumber.trim(),
  };

  if (brand) payload.brandLabel = getBrandLabel(brand, charger.manualBrand);
  if (charger.manualBrand.trim()) payload.manualBrand = charger.manualBrand.trim();
  if (model) payload.modelLabel = getModelLabel(brand, model, charger.manualModel);
  if (charger.manualModel.trim()) payload.manualModel = charger.manualModel.trim();
  if (charger.installationYear.trim()) payload.installationYear = charger.installationYear.trim();
  if (charger.serialNumber.trim()) payload.serialNumber = charger.serialNumber.trim();

  if (backendSupplier) {
    payload.backendSupplier = backendSupplier;
    payload.backendSupplierLabel = getBackendSupplierLabel(
      backendSupplier,
      charger.manualBackendSupplier,
    );
  }

  if (charger.manualBackendSupplier.trim()) {
    payload.manualBackendSupplier = charger.manualBackendSupplier.trim();
  }

  if (charger.solarPanelStatus) {
    payload.solarPanelStatus = charger.solarPanelStatus;
  }

  return payload;
}

function mapLocations(draft: SignupDraft): SignupSubmitLocationPayload[] {
  if (draft.personalInfo.accountType === "particulier") {
    const firstLocation = draft.locations[0];
    const chargers = firstLocation?.chargers || [];

    return [{
      clientLocationId: stableLocationId(firstLocation, 0),
      address: mapAddress(draft.personalInfo.address),
      chargers: chargers.map((charger, chargerIndex) => mapCharger(charger, 0, chargerIndex)),
    }];
  }

  return draft.locations.map((location, locationIndex) => ({
    clientLocationId: stableLocationId(location, locationIndex),
    address: mapAddress(location.address),
    chargers: location.chargers.map((charger, chargerIndex) =>
      mapCharger(charger, locationIndex, chargerIndex)
    ),
  }));
}

function mapLegalEntity(draft: SignupDraft): SignupSubmitPayloadV3["legalEntity"] {
  const { personalInfo } = draft;

  if (personalInfo.accountType === "zakelijk") {
    return {
      type: "business",
      name: personalInfo.companyName.trim(),
      kvkNumber: normalizeKvkNumber(personalInfo.kvkNumber),
    };
  }

  if (personalInfo.accountType === "vve") {
    return {
      type: "vve",
      name: personalInfo.organizationName.trim(),
      kvkNumber: normalizeKvkNumber(personalInfo.kvkNumber),
    };
  }

  return undefined;
}

export function mapSignupDraftToSubmitPayload(draft: SignupDraft): SignupSubmitPayloadV3 {
  const accepted = draft.consents.termsBundleAccepted === true;
  const phone = normalizePhone(draft.personalInfo.phone);
  const legalEntity = mapLegalEntity(draft);

  return {
    accountType: draft.personalInfo.accountType,
    applicant: {
      firstName: draft.personalInfo.firstName.trim(),
      lastName: draft.personalInfo.lastName.trim(),
      email: normalizeEmail(draft.personalInfo.email),
      ...(phone ? { phone } : {}),
      address: mapAddress(draft.personalInfo.address),
    },
    ...(legalEntity ? { legalEntity } : {}),
    consentBundleAcceptance: {
      accepted,
      versionRef: "signup-consent-v1",
    },
    feeTermsAcceptance: {
      accepted,
      versionRef: "fee-terms-v1",
    },
    locations: mapLocations(draft),
  };
}
