export type GenericDocumentFactKey =
  | "partyName"
  | "organizationName"
  | "registeredAddress"
  | "legalForm"
  | "tradeName"
  | "directorOrBoardMember"
  | "directorTitle"
  | "representationAuthorityText"
  | "structuredAddress"
  | "electricityEan"
  | "gasEan"
  | "kvkNumber"
  | "energySupplier"
  | "installerOrSupplier"
  | "contractStart"
  | "contractEnd"
  | "invoiceDate"
  | "explicitInstallationDate"
  | "chargerBrand"
  | "chargerModel"
  | "midNumber"
  | "serialNumber";

export type GenericDocumentType =
  | "organization_extract"
  | "energy_document"
  | "charger_installation_invoice";

export type GenericFactConfidence =
  | "high"
  | "medium"
  | "low"
  | "unavailable";

export type GenericStructuredAddress = {
  street: string | null;
  houseNumber: string | null;
  houseNumberAddition: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
};

export type GenericDocumentFactCandidate = {
  factKey: GenericDocumentFactKey;
  rawValue: string;
  normalizedValue: string;
  structuredAddress?: GenericStructuredAddress;
  sourcePage: number | null;
  sourceRegion: string | null;
  confidence: GenericFactConfidence;
  extractionMethod: string;
  displayable: boolean;
  rejectionReason: string | null;
};

export type GenericDocumentTypeCandidate = {
  documentType: GenericDocumentType;
  score: number;
  indicators: string[];
};

export type DocumentObservationEnvelope = {
  parserVersion: string;
  contentFingerprint: string;
  pageCount: number;
  documentTypeCandidates: GenericDocumentTypeCandidate[];
  factCandidates: GenericDocumentFactCandidate[];
  extractionWarnings: string[];
  rejectedCandidates: GenericDocumentFactCandidate[];
};

export type CachedDocumentObservation = {
  documentId: string;
  contentFingerprint: string;
  parserVersion: string;
  envelope: DocumentObservationEnvelope;
};
