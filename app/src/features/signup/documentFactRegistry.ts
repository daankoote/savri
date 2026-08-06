export type DocumentFactKey =
  | "partyName"
  | "organizationName"
  | "registeredAddress"
  | "legalForm"
  | "tradeName"
  | "directorOrBoardMember"
  | "directorTitle"
  | "representationAuthorityText"
  | "partyRole"
  | "structuredAddress"
  | "electricityEan"
  | "gasEan"
  | "energySupplier"
  | "contractStart"
  | "contractEnd"
  | "kvkNumber"
  | "installerOrSupplier"
  | "chargerBrand"
  | "chargerModel"
  | "midNumber"
  | "serialNumber"
  | "invoiceDate"
  | "explicitInstallationDate";

export type DocumentSourceType =
  | "organization_extract"
  | "energy_bill_or_contract"
  | "installation_invoice";

export type DocumentSemanticRole =
  | "unknown"
  | "contract_holder"
  | "buyer_or_customer"
  | "delivery_address"
  | "installation_or_delivery_address"
  | "installation_address"
  | "invoice_address"
  | "electricity_connection"
  | "gas_connection"
  | "energy_supplier"
  | "contract_period"
  | "business_registration"
  | "registered_office"
  | "legal_form"
  | "trade_name"
  | "director_or_board_member"
  | "director_title"
  | "representation_authority_text"
  | "installer_or_supplier"
  | "charger_asset"
  | "invoice_date"
  | "installation_date"
  | "explicit_installation_date"
  | "not_applicable";

export type DocumentFactExtractionStatus =
  | "found"
  | "not_found"
  | "not_applicable"
  | "ambiguous"
  | "rejected";

export type DocumentFactObservation = {
  factKey: DocumentFactKey;
  value: string | null;
  sourceDocumentId: string;
  sourceDocumentType: DocumentSourceType;
  semanticRole: DocumentSemanticRole;
  extractionStatus: DocumentFactExtractionStatus;
  confidence: "high" | "medium" | "low" | "unavailable";
  extractionMethod?: string;
  sourcePage: number | null;
  displayable: boolean;
  rejectionReason: string | null;
};

export type DocumentFactDefinition = {
  key: DocumentFactKey;
  label: string;
};

export const DOCUMENT_FACT_REGISTRY: ReadonlyArray<DocumentFactDefinition> = [
  { key: "partyName", label: "Naam" },
  { key: "organizationName", label: "Organisatienaam" },
  { key: "registeredAddress", label: "Vestigingsadres" },
  { key: "legalForm", label: "Rechtsvorm" },
  { key: "tradeName", label: "Handelsnaam" },
  { key: "directorOrBoardMember", label: "Bestuurder of bestuurslid" },
  { key: "directorTitle", label: "Titel" },
  {
    key: "representationAuthorityText",
    label: "Vertegenwoordigingsinformatie",
  },
  { key: "partyRole", label: "Rol" },
  { key: "structuredAddress", label: "Adres" },
  { key: "electricityEan", label: "EAN elektriciteit" },
  { key: "gasEan", label: "EAN gas" },
  { key: "energySupplier", label: "Energieleverancier" },
  { key: "contractStart", label: "Start contract" },
  { key: "contractEnd", label: "Einde contract" },
  { key: "kvkNumber", label: "KvK-nummer" },
  { key: "installerOrSupplier", label: "Installateur of leverancier" },
  { key: "chargerBrand", label: "Merk" },
  { key: "chargerModel", label: "Model" },
  { key: "midNumber", label: "MID" },
  { key: "serialNumber", label: "Serienummer" },
  { key: "invoiceDate", label: "Factuurdatum" },
  { key: "explicitInstallationDate", label: "Installatiedatum" },
];

export function documentFactLabel(key: DocumentFactKey): string {
  return DOCUMENT_FACT_REGISTRY.find((fact) => fact.key === key)?.label || key;
}
