import type {
  AddressDraft,
  ChargerDocumentDraft,
  ChargerDraft,
  ConnectionDeclarationDraft,
  ConsentDraft,
  DocumentsByChargerId,
  DocumentType,
  LocationDocumentDraft,
  PersonalInfoDraft,
  SignupLocationDraft,
} from "./signupTypes";

export const documentTypes: ChargerDocumentDraft["documentType"][] = [
  "installation_invoice",
];

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

export function createChargerDraft(
  source: ChargerDraft["source"] = "manual",
): ChargerDraft {
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

export function createLocationDraft(
  source: ChargerDraft["source"] = "manual",
): SignupLocationDraft {
  const clientId = createClientId("location");

  return {
    clientId,
    address: createAddressDraft(),
    energyDocument: {
      clientId: createClientId("doc_energy"),
      locationClientId: clientId,
      documentType: "energy_bill_or_contract",
      file: null,
      status: "empty",
    },
    energyDocumentObservation: null,
    connectionDeclaration: createConnectionDeclarationDraft(),
    chargers: [createChargerDraft(source)],
  };
}

export function createConnectionDeclarationDraft(): ConnectionDeclarationDraft {
  return {
    sourceMode: "document",
    preflightStatus: "idle",
    candidates: [],
    selectedCandidateEan: "",
    confirmedEan: "",
    manualEan: "",
    customerConfirmed: false,
  };
}

export function transitionLocationToManualEanSource(
  location: SignupLocationDraft,
  preflightStatus: Extract<
    ConnectionDeclarationDraft["preflightStatus"],
    "parser_error" | "no_candidate" | "manual_entry_required"
  > = "manual_entry_required",
): SignupLocationDraft {
  return {
    ...location,
    energyDocument: {
      ...location.energyDocument,
      file: null,
      status: "empty",
    },
    energyDocumentObservation: null,
    connectionDeclaration: {
      sourceMode: "manual",
      preflightStatus,
      candidates: [],
      selectedCandidateEan: "",
      confirmedEan: "",
      manualEan: "",
      customerConfirmed: false,
    },
  };
}

export function transitionLocationToDocumentEanSource(
  location: SignupLocationDraft,
  document: LocationDocumentDraft,
): SignupLocationDraft {
  return {
    ...location,
    energyDocument: document,
    energyDocumentObservation: null,
    connectionDeclaration: {
      sourceMode: "document",
      preflightStatus: document.file ? "parsing" : "idle",
      candidates: [],
      selectedCandidateEan: "",
      confirmedEan: "",
      manualEan: "",
      customerConfirmed: false,
    },
  };
}

export function createDocumentDraftsForCharger(
  chargerClientId: string,
): ChargerDocumentDraft[] {
  return documentTypes
    .map((documentType) => ({
      clientId: createClientId(`doc_${documentType}`),
      chargerClientId,
      documentType,
      file: null,
      status: "empty",
      observation: null,
      parseStatus: "idle",
    }));
}

export function replaceChargerDocumentState(
  documents: DocumentsByChargerId,
  updated: ChargerDocumentDraft,
): DocumentsByChargerId {
  return {
    ...documents,
    [updated.chargerClientId]: (documents[updated.chargerClientId] || []).map(
      (document) => document.clientId === updated.clientId ? updated : document,
    ),
  };
}

export function removeChargerDocumentState(
  documents: DocumentsByChargerId,
  chargerClientIds: string[],
): DocumentsByChargerId {
  const next = { ...documents };
  chargerClientIds.forEach((chargerClientId) => {
    delete next[chargerClientId];
  });
  return next;
}

export function documentLabel(documentType: DocumentType) {
  if (documentType === "organization_extract") return "KvK-uittreksel";
  if (documentType === "energy_bill_or_contract") {
    return "Energienota of energiecontract";
  }
  if (documentType === "installation_invoice") {
    return "Installatie- of aanschaffactuur laadpaal";
  }

  return documentType;
}
