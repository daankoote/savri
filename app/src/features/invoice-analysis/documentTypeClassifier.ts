import type {
  GenericDocumentFactCandidate,
  GenericDocumentTypeCandidate,
} from "./documentObservationEnvelope";

// Internal descriptive envelope metadata only. Signup display and progression
// must never consume these scores as a document classification or gate.

function found(
  candidates: ReadonlyArray<GenericDocumentFactCandidate>,
  factKey: GenericDocumentFactCandidate["factKey"],
  method?: string,
): boolean {
  return candidates.some((candidate) =>
    candidate.factKey === factKey && candidate.displayable &&
    (!method || candidate.extractionMethod === method)
  );
}

export function deriveDocumentTypeCandidates(
  candidates: ReadonlyArray<GenericDocumentFactCandidate>,
): GenericDocumentTypeCandidate[] {
  const organizationIndicators: string[] = [];
  let organizationScore = 0;
  const organizationSignal = (
    condition: boolean,
    indicator: string,
    score: number,
  ) => {
    if (!condition) return;
    organizationIndicators.push(indicator);
    organizationScore += score;
  };
  organizationSignal(
    found(candidates, "organizationName"),
    "organization_name",
    3,
  );
  organizationSignal(found(candidates, "kvkNumber"), "registration_number", 4);
  organizationSignal(
    found(candidates, "registeredAddress"),
    "registered_address",
    3,
  );
  organizationSignal(found(candidates, "legalForm"), "legal_form", 2);
  organizationSignal(found(candidates, "tradeName"), "trade_name", 1);
  organizationSignal(
    found(candidates, "directorOrBoardMember"),
    "director_or_board_member",
    1,
  );
  organizationSignal(found(candidates, "directorTitle"), "director_title", 1);
  organizationSignal(
    found(candidates, "representationAuthorityText"),
    "representation_authority_text",
    1,
  );
  const energyIndicators: string[] = [];
  let energyScore = 0;
  const energySignal = (
    condition: boolean,
    indicator: string,
    score: number,
  ) => {
    if (!condition) return;
    energyIndicators.push(indicator);
    energyScore += score;
  };
  energySignal(found(candidates, "electricityEan"), "electricity_ean", 4);
  energySignal(found(candidates, "energySupplier"), "energy_supplier", 2);
  energySignal(found(candidates, "contractStart"), "contract_start", 2);
  energySignal(found(candidates, "contractEnd"), "contract_end", 2);
  energySignal(
    found(candidates, "structuredAddress", "semantic_delivery_address_block"),
    "delivery_address",
    2,
  );
  energySignal(
    found(candidates, "partyName", "semantic_contract_holder_block"),
    "contract_holder",
    1,
  );

  const chargerIndicators: string[] = [];
  let chargerScore = 0;
  const chargerSignal = (
    condition: boolean,
    indicator: string,
    score: number,
  ) => {
    if (!condition) return;
    chargerIndicators.push(indicator);
    chargerScore += score;
  };
  chargerSignal(found(candidates, "invoiceDate"), "invoice_date", 3);
  chargerSignal(found(candidates, "chargerBrand"), "charger_brand", 2);
  chargerSignal(found(candidates, "chargerModel"), "charger_model", 2);
  chargerSignal(found(candidates, "midNumber"), "mid_number", 2);
  chargerSignal(found(candidates, "serialNumber"), "serial_number", 2);
  chargerSignal(
    found(candidates, "installerOrSupplier"),
    "installer_or_supplier",
    2,
  );
  chargerSignal(
    found(candidates, "structuredAddress", "invoice_address_block"),
    "invoice_address",
    1,
  );
  chargerSignal(
    found(candidates, "partyName", "invoice_customer_block"),
    "invoice_customer",
    1,
  );
  chargerSignal(
    found(candidates, "explicitInstallationDate"),
    "installation_date",
    2,
  );

  return [
    {
      documentType: "organization_extract",
      score: organizationScore,
      indicators: organizationIndicators,
    },
    {
      documentType: "energy_document",
      score: energyScore,
      indicators: energyIndicators,
    },
    {
      documentType: "charger_installation_invoice",
      score: chargerScore,
      indicators: chargerIndicators,
    },
  ];
}
