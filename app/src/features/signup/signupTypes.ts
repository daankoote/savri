import type { EnergyEanCandidate } from "../invoice-analysis/energyEanCandidateExtractor";
import type {
  EnergyDocumentObservation,
} from "../invoice-analysis/energyDocumentObservation";
import type { ChargerDocumentObservation } from "../invoice-analysis/invoicePdfParserAdapter";
export type { ChargerDocumentObservation } from "../invoice-analysis/invoicePdfParserAdapter";

export type AccountType = "particulier" | "zakelijk" | "vve";

export type ChargerSource = "manual" | "import";

export type DocumentType =
  | "organization_extract"
  | "energy_bill_or_contract"
  | "installation_invoice";

export type SignupTab = "manual" | "import";

export type SolarPanelStatus =
  | ""
  | "hourly_exportable"
  | "not_hourly_exportable"
  | "none";

export type AddressDraft = {
  postcode: string;
  houseNumber: string;
  suffix: string;
  street: string;
  city: string;
  country: string;
  bagId: string | null;
  resolvedLookupKey: string | null;
};

export type PersonalInfoDraft = {
  accountType: AccountType;
  firstName: string;
  lastName: string;
  companyName: string;
  organizationName: string;
  kvkNumber: string;
  email: string;
  phone: string;
  address: AddressDraft;
  kvkDocument: File | null;
};

export type ChargerDraft = {
  clientId: string;
  source: ChargerSource;
  brand: string;
  manualBrand: string;
  model: string;
  manualModel: string;
  installationYear: string;
  midNumber: string;
  serialNumber: string;
  backendSupplier: string;
  manualBackendSupplier: string;
  solarPanelStatus: SolarPanelStatus;
};

export type ConnectionDeclarationDraft = {
  sourceMode: "document" | "manual";
  preflightStatus:
    | "idle"
    | "parsing"
    | "electricity_candidate_found"
    | "unclassified_candidate_found"
    | "multiple_candidates"
    | "no_candidate"
    | "parser_error"
    | "customer_confirmed"
    | "manual_entry_required"
    | "manual_customer_confirmed";
  candidates: EnergyEanCandidate[];
  selectedCandidateEan: string;
  confirmedEan: string;
  manualEan: string;
  customerConfirmed: boolean;
};

export type SignupLocationDraft = {
  clientId: string;
  address: AddressDraft;
  energyDocument: LocationDocumentDraft;
  energyDocumentObservation: EnergyDocumentObservation | null;
  connectionDeclaration: ConnectionDeclarationDraft;
  chargers: ChargerDraft[];
};

export type LocalDocumentDraft = {
  clientId: string;
  documentType: DocumentType;
  file: File | null;
  status: "empty" | "selected";
  quarantineStatus?: "idle" | "uploading" | "confirmed_quarantine" | "error";
  quarantineFileReference?: string | null;
  quarantineRevision?: number | null;
};

export type AccountDocumentDraft = LocalDocumentDraft & {
  accountScope: "account";
  documentType: "organization_extract";
  parseStatus: "idle" | "parsing" | "parsed" | "error";
};

export type LocationDocumentDraft = LocalDocumentDraft & {
  locationClientId: string;
  documentType: "energy_bill_or_contract";
};

export type ChargerDocumentDraft = LocalDocumentDraft & {
  chargerClientId: string;
  documentType: "installation_invoice";
  observation: ChargerDocumentObservation | null;
  parseStatus: "idle" | "parsing" | "parsed" | "error";
};

export type DocumentsByChargerId = Record<string, ChargerDocumentDraft[]>;

export type ConsentDraft = {
  termsBundleAccepted: boolean;
};

export type SignupDraft = {
  personalInfo: PersonalInfoDraft;
  locations: SignupLocationDraft[];
  documentsByChargerId: DocumentsByChargerId;
  consents: ConsentDraft;
};

export type ValidationIssue = {
  id: string;
  fieldPath: string;
  message: string;
  severity: "error" | "warning";
};

export type SignupFieldErrors = Record<string, ValidationIssue[]>;

export type SignupValidationResult = {
  canStartDossier: boolean;
  errors: ValidationIssue[];
  fieldErrors: SignupFieldErrors;
  warnings: ValidationIssue[];
};
