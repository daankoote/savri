import type {
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  ConsentDraft,
  DocumentType,
  PersonalInfoDraft,
  SignupLocationDraft,
} from "./signupTypes";

export const documentTypes: DocumentType[] = ["installation_invoice", "monthly_reimbursement"];

export function createAddressDraft(): AddressDraft {
  return {
    postcode: "",
    houseNumber: "",
    suffix: "",
    street: "",
    city: "",
    country: "Nederland",
    bagId: null,
    resolvedLookupKey: null,
  };
}

export function createPersonalInfoDraft(): PersonalInfoDraft {
  return {
    accountType: "particulier",
    firstName: "",
    lastName: "",
    companyName: "",
    organizationName: "",
    kvkNumber: "",
    email: "",
    phone: "",
    address: createAddressDraft(),
    kvkDocument: null,
  };
}

export function createConsentDraft(): ConsentDraft {
  return {
    termsBundleAccepted: false,
  };
}

export function createClientId(prefix: string) {
  if (crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createChargerDraft(source: ChargerDraft["source"] = "manual"): ChargerDraft {
  return {
    clientId: createClientId("charger"),
    source,
    brand: "",
    manualBrand: "",
    model: "",
    manualModel: "",
    installationYear: String(new Date().getFullYear()),
    midNumber: "",
    serialNumber: "",
    backendSupplier: "",
    manualBackendSupplier: "",
    solarPanelStatus: "none",
  };
}

export function createLocationDraft(source: ChargerDraft["source"] = "manual"): SignupLocationDraft {
  return {
    clientId: createClientId("location"),
    address: createAddressDraft(),
    chargers: [createChargerDraft(source)],
  };
}

export function createDocumentDraftsForCharger(
  chargerClientId: string,
  includeBusinessMonthly = true,
): ChargerDocumentDraft[] {
  return documentTypes
    .filter((documentType) => includeBusinessMonthly || documentType === "installation_invoice")
    .map((documentType) => ({
      clientId: createClientId(`doc_${documentType}`),
      chargerClientId,
      documentType,
      file: null,
      status: "empty",
    }));
}

export function documentLabel(documentType: DocumentType) {
  if (documentType === "installation_invoice") return "Factuur installatie";
  return "Indien zakelijk rijden: voeg een maandoverzicht van je thuislaadvergoeding toe";
}
