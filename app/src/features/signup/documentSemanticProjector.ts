import type {
  DocumentObservationEnvelope,
  GenericDocumentFactCandidate,
  GenericDocumentFactKey,
} from "../invoice-analysis/documentObservationEnvelope";
import type {
  EnergyDocumentObservation,
  ObservedDeliveryAddress,
  ObservedEnergyConnection,
  ObservedValue,
} from "../invoice-analysis/energyDocumentObservation";
import type { EnergyEanCandidate } from "../invoice-analysis/energyEanCandidateExtractor";
import type { ChargerDocumentObservation } from "../invoice-analysis/invoicePdfParserAdapter";
import type {
  DocumentFactKey,
  DocumentFactObservation,
  DocumentSemanticRole,
  DocumentSourceType,
} from "./documentFactRegistry";

const clean = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

function candidatesFor(
  envelope: DocumentObservationEnvelope,
  factKey: GenericDocumentFactKey,
  extractionMethod?: string,
): GenericDocumentFactCandidate[] {
  return envelope.factCandidates.filter((candidate) =>
    candidate.factKey === factKey && candidate.displayable &&
    (!extractionMethod || candidate.extractionMethod === extractionMethod)
  );
}

function firstCandidate(
  envelope: DocumentObservationEnvelope,
  factKey: GenericDocumentFactKey,
  extractionMethod?: string,
): GenericDocumentFactCandidate | null {
  return candidatesFor(envelope, factKey, extractionMethod)[0] || null;
}

const GENERIC_FACT_KEYS: ReadonlyArray<GenericDocumentFactKey> = [
  "partyName",
  "organizationName",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
  "structuredAddress",
  "electricityEan",
  "gasEan",
  "kvkNumber",
  "energySupplier",
  "installerOrSupplier",
  "contractStart",
  "contractEnd",
  "invoiceDate",
  "explicitInstallationDate",
  "chargerBrand",
  "chargerModel",
  "midNumber",
  "serialNumber",
];

function semanticRoleFor(
  factKey: GenericDocumentFactKey,
  extractionMethod: string | null,
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

function projectGenericFact(
  envelope: DocumentObservationEnvelope,
  documentId: string,
  sourceDocumentType: DocumentSourceType,
  factKey: GenericDocumentFactKey,
): DocumentFactObservation {
  const matches = candidatesFor(envelope, factKey);
  const distinctByValue = new Map<string, GenericDocumentFactCandidate>();
  matches.forEach((candidate) => {
    const signature = clean(candidate.normalizedValue).toLocaleLowerCase(
      "nl-NL",
    );
    if (!distinctByValue.has(signature)) {
      distinctByValue.set(signature, candidate);
    }
  });
  const distinct = [...distinctByValue.values()];
  const candidate = distinct[0] || null;
  const ambiguous = distinct.length > 1;
  return {
    factKey: factKey as DocumentFactKey,
    value: ambiguous ? null : candidate?.normalizedValue || null,
    sourceDocumentId: documentId,
    sourceDocumentType,
    semanticRole: semanticRoleFor(factKey, candidate?.extractionMethod || null),
    extractionStatus: ambiguous
      ? "ambiguous"
      : candidate
      ? "found"
      : "not_found",
    confidence: ambiguous
      ? "unavailable"
      : candidate?.confidence || "unavailable",
    extractionMethod: ambiguous
      ? "multiple_candidates"
      : candidate?.extractionMethod,
    sourcePage: ambiguous ? null : candidate?.sourcePage || null,
    displayable: !ambiguous && Boolean(candidate?.normalizedValue),
    rejectionReason: candidate ? null : `${factKey}_not_found`,
  };
}

export function projectDocumentFacts(
  envelope: DocumentObservationEnvelope,
  documentId: string,
  sourceDocumentType: DocumentSourceType,
): DocumentFactObservation[] {
  return GENERIC_FACT_KEYS.map((factKey) =>
    projectGenericFact(envelope, documentId, sourceDocumentType, factKey)
  );
}

function observedValue(
  candidate: GenericDocumentFactCandidate | null,
  missingReason: string,
): ObservedValue {
  return {
    value: candidate?.normalizedValue || null,
    sourcePage: candidate?.sourcePage || null,
    confidence: candidate?.confidence || "unavailable",
    extractionMethod:
      candidate?.extractionMethod as ObservedValue["extractionMethod"] ||
      "not_found",
    displayable: Boolean(candidate?.displayable && candidate.normalizedValue),
    rejectionReason: candidate ? null : missingReason,
  };
}

function observedAddress(
  candidate: GenericDocumentFactCandidate | null,
  missingReason: string,
): ObservedDeliveryAddress {
  const address = candidate?.structuredAddress;
  return {
    value: candidate?.normalizedValue || null,
    street: address?.street || null,
    houseNumber: address?.houseNumber || null,
    houseNumberAddition: address?.houseNumberAddition || null,
    postalCode: address?.postalCode || null,
    city: address?.city || null,
    country: address?.country || null,
    sourcePage: candidate?.sourcePage || null,
    confidence: candidate?.confidence || "unavailable",
    extractionMethod: candidate
      ?.extractionMethod as ObservedDeliveryAddress["extractionMethod"] ||
      "not_found",
    displayable: Boolean(candidate?.displayable && address),
    rejectionReason: candidate ? null : missingReason,
  };
}

export function projectEnergyEanCandidates(
  envelope: DocumentObservationEnvelope,
): EnergyEanCandidate[] {
  return envelope.factCandidates
    .filter((candidate) =>
      (candidate.factKey === "electricityEan" ||
        candidate.factKey === "gasEan") &&
      candidate.displayable
    )
    .map((candidate) => ({
      normalizedEan: candidate.normalizedValue,
      classification: candidate.factKey === "electricityEan"
        ? "electricity" as const
        : "gas" as const,
      context: candidate.factKey === "electricityEan"
        ? "electricity_connection"
        : "gas_connection",
      page: candidate.sourcePage,
    }));
}

export function projectEnergyDocumentObservation(
  envelope: DocumentObservationEnvelope,
): EnergyDocumentObservation {
  const start = firstCandidate(envelope, "contractStart");
  const end = firstCandidate(envelope, "contractEnd");
  const connection = (
    candidate: GenericDocumentFactCandidate,
  ): ObservedEnergyConnection => ({
    normalizedEan: candidate.normalizedValue,
    validFrom: start?.normalizedValue || null,
    validTo: end?.normalizedValue || null,
    openEnded: !end?.normalizedValue,
    sourcePage: candidate.sourcePage,
    confidence: candidate.confidence,
    extractionMethod: "ean_context",
    displayable: candidate.displayable,
    rejectionReason: null,
  });
  return {
    supplierName: observedValue(
      firstCandidate(envelope, "energySupplier"),
      "energy_supplier_not_found",
    ),
    contractHolderName: observedValue(
      firstCandidate(
        envelope,
        "partyName",
        "semantic_contract_holder_block",
      ),
      "contract_holder_not_found",
    ),
    deliveryAddress: observedAddress(
      firstCandidate(
        envelope,
        "structuredAddress",
        "semantic_delivery_address_block",
      ),
      "delivery_address_not_found",
    ),
    electricityConnections: candidatesFor(envelope, "electricityEan").map(
      connection,
    ),
    gasConnections: candidatesFor(envelope, "gasEan").map(connection),
    documentDate: observedValue(null, "document_date_not_found"),
    electricityNetworkOperatorCandidate: observedValue(
      null,
      "network_operator_not_found",
    ),
    limitations: [...envelope.extractionWarnings],
  };
}

export function projectChargerDocumentObservation(
  envelope: DocumentObservationEnvelope,
): ChargerDocumentObservation {
  return {
    customerName: observedValue(
      firstCandidate(envelope, "partyName", "invoice_customer_block"),
      "charger_invoice_customer_not_found",
    ),
    supplierInstallerName: observedValue(
      firstCandidate(envelope, "installerOrSupplier"),
      "charger_invoice_supplier_not_found",
    ),
    brand: observedValue(
      firstCandidate(envelope, "chargerBrand"),
      "charger_brand_not_found",
    ),
    model: observedValue(
      firstCandidate(envelope, "chargerModel"),
      "charger_model_not_found",
    ),
    serialNumber: observedValue(
      firstCandidate(envelope, "serialNumber"),
      "charger_serial_not_found",
    ),
    midNumber: observedValue(
      firstCandidate(envelope, "midNumber"),
      "charger_mid_not_found",
    ),
    location: observedAddress(
      firstCandidate(envelope, "structuredAddress", "invoice_address_block"),
      "charger_invoice_address_not_found",
    ),
    installationDate: observedValue(
      firstCandidate(envelope, "explicitInstallationDate"),
      "explicit_installation_date_not_found",
    ),
    installationYear: observedValue(
      null,
      "explicit_installation_year_not_found",
    ),
    invoiceDate: observedValue(
      firstCandidate(envelope, "invoiceDate"),
      "invoice_date_not_found",
    ),
  };
}
