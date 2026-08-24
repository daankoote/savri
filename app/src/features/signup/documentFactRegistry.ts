import type { DocumentFactKey } from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

export type { DocumentFactKey } from "../../../../platform/runtime/document-parsing/document_fact_vocabulary.ts";

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

export type CustomerDocumentFactGroup = "location" | "charger";

export type CustomerDocumentFactScopeKind =
  | "location"
  | "charger";

export type CustomerDocumentEvidenceRelationship =
  | "direct"
  | "supporting"
  | "provenance_only";

export type CustomerDocumentEvidenceBinding = Readonly<{
  sourceDocumentType: Extract<
    DocumentSourceType,
    "energy_bill_or_contract" | "installation_invoice"
  >;
  semanticRoles: readonly DocumentSemanticRole[];
  relationship: CustomerDocumentEvidenceRelationship;
}>;

export type CustomerDocumentFactRowDefinition = Readonly<{
  id: string;
  factKey: DocumentFactKey;
  label: string;
  group: CustomerDocumentFactGroup;
  order: number;
  scopeKind: CustomerDocumentFactScopeKind;
  evidenceBindings: readonly CustomerDocumentEvidenceBinding[];
}>;

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

/**
 * The customer-visible location/charger row plan. Signup and correction add
 * journey-specific values and actions to these definitions; neither journey
 * owns labels, ordering, grouping, or address meaning independently.
 */
export const CUSTOMER_DOCUMENT_FACT_ROW_REGISTRY:
  readonly CustomerDocumentFactRowDefinition[] = Object.freeze(
    [
      {
        id: "location:party-name",
        factKey: "partyName",
        label: "Contracthouder",
        group: "location",
        order: 10,
        scopeKind: "location",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["contract_holder"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["unknown"]),
            relationship: "provenance_only",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["contract_holder"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["buyer_or_customer"]),
            relationship: "supporting",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["unknown"]),
            relationship: "provenance_only",
          }),
        ]),
      },
      {
        id: "location:structured-address",
        factKey: "structuredAddress",
        label: "Laadlocatie",
        group: "location",
        order: 20,
        scopeKind: "location",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze([
              "delivery_address",
              "installation_or_delivery_address",
            ]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["unknown"]),
            relationship: "provenance_only",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze([
              "installation_address",
              "installation_or_delivery_address",
            ]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["invoice_address"]),
            relationship: "supporting",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["unknown"]),
            relationship: "provenance_only",
          }),
        ]),
      },
      {
        id: "location:electricity-ean",
        factKey: "electricityEan",
        label: "EAN elektriciteit",
        group: "location",
        order: 30,
        scopeKind: "location",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["electricity_connection"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["electricity_connection"]),
            relationship: "direct",
          }),
        ]),
      },
      {
        id: "location:energy-supplier",
        factKey: "energySupplier",
        label: "Energieleverancier",
        group: "location",
        order: 40,
        scopeKind: "location",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["energy_supplier"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["energy_supplier"]),
            relationship: "direct",
          }),
        ]),
      },
      {
        id: "charger:brand",
        factKey: "chargerBrand",
        label: "Merk",
        group: "charger",
        order: 10,
        scopeKind: "charger",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
        ]),
      },
      {
        id: "charger:model",
        factKey: "chargerModel",
        label: "Model",
        group: "charger",
        order: 20,
        scopeKind: "charger",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
        ]),
      },
      {
        id: "charger:serial-number",
        factKey: "serialNumber",
        label: "Serienummer",
        group: "charger",
        order: 30,
        scopeKind: "charger",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
        ]),
      },
      {
        id: "charger:mid-number",
        factKey: "midNumber",
        label: "MID",
        group: "charger",
        order: 40,
        scopeKind: "charger",
        evidenceBindings: Object.freeze([
          Object.freeze({
            sourceDocumentType: "installation_invoice",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
          Object.freeze({
            sourceDocumentType: "energy_bill_or_contract",
            semanticRoles: Object.freeze(["charger_asset"]),
            relationship: "direct",
          }),
        ]),
      },
    ] as readonly CustomerDocumentFactRowDefinition[],
  );

export function selectCustomerDocumentFactRows(
  group: CustomerDocumentFactGroup,
): readonly CustomerDocumentFactRowDefinition[] {
  return CUSTOMER_DOCUMENT_FACT_ROW_REGISTRY.filter((row) =>
    row.group === group
  );
}

export function customerDocumentFactInstanceRowId(
  row: CustomerDocumentFactRowDefinition,
  scopeRef: string,
): string {
  return `${row.id}:${scopeRef}`;
}

export function customerDocumentEvidenceBindingFor(
  row: CustomerDocumentFactRowDefinition,
  observation: Pick<
    DocumentFactObservation,
    "sourceDocumentType" | "semanticRole"
  >,
): CustomerDocumentEvidenceBinding | null {
  return row.evidenceBindings.find((binding) =>
    binding.sourceDocumentType === observation.sourceDocumentType &&
    binding.semanticRoles.includes(observation.semanticRole)
  ) || null;
}

export function customerDocumentVisibleEvidenceBindingFor(
  row: CustomerDocumentFactRowDefinition,
  sourceDocumentType: CustomerDocumentEvidenceBinding["sourceDocumentType"],
): CustomerDocumentEvidenceBinding | null {
  return row.evidenceBindings.find((binding) =>
    binding.sourceDocumentType === sourceDocumentType &&
    binding.relationship !== "provenance_only"
  ) || null;
}

/**
 * Shared parser semantic-role authority. Parser adapters expose the extraction
 * method; signup and correction both resolve that method through this registry
 * boundary before deciding whether an observation is comparable.
 */
export function customerDocumentSemanticRoleFor(
  factKey: DocumentFactKey,
  extractionMethod: string | null | undefined,
): DocumentSemanticRole {
  if (factKey === "partyName" || factKey === "organizationName") {
    if (extractionMethod === "semantic_contract_holder_block") {
      return "contract_holder";
    }
    if (extractionMethod === "invoice_customer_block") {
      return "buyer_or_customer";
    }
    return "unknown";
  }
  if (factKey === "structuredAddress") {
    if (
      extractionMethod === "semantic_delivery_address_block" ||
      extractionMethod === "explicit_delivery_address_block"
    ) return "delivery_address";
    if (extractionMethod === "invoice_address_block") return "invoice_address";
    if (extractionMethod === "explicit_installation_address_block") {
      return "installation_address";
    }
    return "unknown";
  }
  if (factKey === "electricityEan") return "electricity_connection";
  if (factKey === "gasEan") return "gas_connection";
  if (factKey === "energySupplier") return "energy_supplier";
  if (factKey === "installerOrSupplier") return "installer_or_supplier";
  if (factKey === "contractStart" || factKey === "contractEnd") {
    return "contract_period";
  }
  if (factKey === "kvkNumber") return "business_registration";
  if (factKey === "registeredAddress") return "registered_office";
  if (factKey === "legalForm") return "legal_form";
  if (factKey === "tradeName") return "trade_name";
  if (factKey === "directorOrBoardMember") return "director_or_board_member";
  if (factKey === "directorTitle") return "director_title";
  if (factKey === "representationAuthorityText") {
    return "representation_authority_text";
  }
  if (
    factKey === "chargerBrand" || factKey === "chargerModel" ||
    factKey === "midNumber" || factKey === "serialNumber"
  ) return "charger_asset";
  if (factKey === "invoiceDate") return "invoice_date";
  if (factKey === "explicitInstallationDate") return "installation_date";
  return "unknown";
}

export function documentFactLabel(key: DocumentFactKey): string {
  return DOCUMENT_FACT_REGISTRY.find((fact) => fact.key === key)?.label || key;
}
