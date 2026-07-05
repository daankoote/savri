export type AccountType = "particulier" | "zakelijk" | "vve";

export type ChargerSource = "manual" | "import";

export type DocumentType = "installation_invoice" | "monthly_reimbursement";

export type SignupTab = "manual" | "import";

export type SolarPanelStatus =
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

export type SignupLocationDraft = {
  clientId: string;
  address: AddressDraft;
  chargers: ChargerDraft[];
};

export type ChargerDocumentDraft = {
  clientId: string;
  chargerClientId: string;
  documentType: DocumentType;
  file: File | null;
  status: "empty" | "selected";
};

export type DocumentsByChargerId = Record<string, ChargerDocumentDraft[]>;

export type SignupDraft = {
  personalInfo: PersonalInfoDraft;
  locations: SignupLocationDraft[];
  documentsByChargerId: DocumentsByChargerId;
};

export type ValidationIssue = {
  id: string;
  message: string;
  severity: "error" | "warning";
};

export type SignupValidationResult = {
  canStartDossier: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};
