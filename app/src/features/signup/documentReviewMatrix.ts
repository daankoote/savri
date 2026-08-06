import {
  DOCUMENT_FACT_REGISTRY,
  type DocumentFactKey,
  documentFactLabel,
  type DocumentFactObservation,
  type DocumentSemanticRole,
  type DocumentSourceType,
} from "./documentFactRegistry";
import {
  decideDocumentFact,
  type DocumentFactDecisionStatus,
} from "./documentFactDecisionPolicy";
import {
  type DocumentFactApplicability,
  selectDocumentFactApplicability,
} from "./documentFactApplicability";
import {
  chargerFactKey,
  type DocumentFirstFactValue,
  type DocumentFirstSignupDraft,
  locationFactKey,
} from "./documentFirstSignupModel";
import { projectDocumentFacts } from "./documentSemanticProjector";
import {
  formatStructuredDutchAddress,
  hasMeaningfulManualAddress,
} from "./structuredAddress";

export type DocumentReviewCell = {
  value: string | null;
  status: "found" | "not_found" | "not_applicable" | "ambiguous" | "rejected";
  semanticRole: DocumentSemanticRole;
};

export type DocumentReviewAction =
  | "Bevestigen"
  | "Oplossen"
  | "Invullen"
  | "Kiezen"
  | "Document vervangen"
  | "KvK-uittreksel uploaden";

export type DocumentReviewRow = {
  factKey: DocumentFactKey;
  scopeKey: string;
  label: string;
  declared: DocumentReviewCell;
  organizationDocument: DocumentReviewCell;
  energyDocument: DocumentReviewCell;
  chargerDocument: DocumentReviewCell;
  decisionStatus: DocumentFactDecisionStatus;
  decisionReason?: ReturnType<typeof decideDocumentFact>["reason"];
  statusLabel:
    | ""
    | "ENVAL-controle nodig"
    | "Geblokkeerd"
    | "Meerdere waarden";
  action: DocumentReviewAction | null;
  canonicalValue: string;
  proposedValue: string;
  sourceDocuments: ReadonlyArray<{
    documentId: string;
    documentType: DocumentSourceType;
  }>;
  choices: ReadonlyArray<string>;
  correctedManually: boolean;
  confirmed: boolean;
  normalizationApplied: boolean;
  blocksProgress: boolean;
  observations: ReadonlyArray<DocumentFactObservation>;
  applicability: DocumentFactApplicability;
  required: boolean;
};

export type DocumentReviewMatrix = {
  locationId: string;
  chargerId: string;
  observations: DocumentFactObservation[];
  rows: DocumentReviewRow[];
  blockers: DocumentReviewRow[];
  showOrganizationDocument: boolean;
  canContinue: boolean;
};

const ORGANIZATION_FACT_KEYS: ReadonlySet<DocumentFactKey> = new Set([
  "organizationName",
  "kvkNumber",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "directorTitle",
  "representationAuthorityText",
]);

const VISIBLE_ORGANIZATION_FACT_KEYS: ReadonlySet<DocumentFactKey> = new Set([
  "organizationName",
  "kvkNumber",
  "registeredAddress",
  "legalForm",
  "tradeName",
  "directorOrBoardMember",
  "representationAuthorityText",
]);

const clean = (value: unknown) =>
  String(value ?? "").replace(/\s+/g, " ").trim();

function factValue(
  factKey: DocumentFactKey,
  value: DocumentFirstFactValue | null | undefined,
): string {
  if (!value) return "";
  if (factKey !== "structuredAddress" || typeof value === "string") {
    return clean(value);
  }
  if (
    !hasMeaningfulManualAddress({
      street: value.street,
      houseNumber: value.houseNumber,
      houseNumberAddition: value.suffix,
      postalCode: value.postcode,
      city: value.city,
      country: value.country,
    })
  ) return "";
  return formatStructuredDutchAddress({
    street: value.street,
    houseNumber: value.houseNumber,
    houseNumberAddition: value.suffix,
    postalCode: value.postcode,
    city: value.city,
    country: value.country,
  });
}
function buildObservations(
  draft: DocumentFirstSignupDraft,
  locationId: string,
  chargerId: string,
): DocumentFactObservation[] {
  const energyDocument = draft.energyDocumentsByLocationId[locationId];
  const organizationDocument = draft.organizationDocument;
  const chargerDocument = draft.chargerDocumentsByChargerId[chargerId]?.find(
    (document) => document.documentType === "installation_invoice",
  );
  if (!energyDocument || !chargerDocument) return [];
  const organization = draft.parserObservations.byDocumentId[
    organizationDocument.clientId
  ];
  const energy = draft.parserObservations.byDocumentId[energyDocument.clientId];
  const charger =
    draft.parserObservations.byDocumentId[chargerDocument.clientId];
  return [
    ...(organization
      ? projectDocumentFacts(
        organization.envelope,
        organizationDocument.clientId,
        "organization_extract",
      )
      : []),
    ...(energy
      ? projectDocumentFacts(
        energy.envelope,
        energyDocument.clientId,
        "energy_bill_or_contract",
      )
      : []),
    ...(charger
      ? projectDocumentFacts(
        charger.envelope,
        chargerDocument.clientId,
        "installation_invoice",
      )
      : []),
  ];
}

function cell(
  observation: DocumentFactObservation | undefined,
): DocumentReviewCell {
  return observation
    ? {
      value: observation.displayable ? observation.value : null,
      status: observation.extractionStatus,
      semanticRole: observation.semanticRole,
    }
    : {
      value: null,
      status: "not_applicable",
      semanticRole: "not_applicable",
    };
}

function declaredValue(
  draft: DocumentFirstSignupDraft,
  locationId: string,
  chargerId: string,
  factKey: DocumentFactKey,
): string {
  if (factKey === "partyName") {
    return clean(draft.legalParty.legalName) ||
      clean(`${draft.legalParty.firstName} ${draft.legalParty.lastName}`);
  }
  if (factKey === "organizationName") {
    return clean(draft.legalParty.legalName);
  }
  if (factKey === "kvkNumber") {
    return clean(draft.legalParty.kvkNumber);
  }
  if (
    factKey === "registeredAddress" || factKey === "legalForm" ||
    factKey === "tradeName" || factKey === "directorOrBoardMember" ||
    factKey === "directorTitle" ||
    factKey === "representationAuthorityText"
  ) return "";
  if (factKey === "structuredAddress") {
    const address = draft.locationsById[locationId]?.address;
    return address ? factValue(factKey, address) : "";
  }
  if (factKey === "electricityEan") {
    const declaration = draft.connectionDeclarationsByLocationId[locationId];
    return clean(
      declaration?.confirmedEan || declaration?.selectedCandidateEan ||
        declaration?.manualEan,
    );
  }
  const charger = draft.chargersById[chargerId];
  if (factKey === "chargerBrand") {
    return clean(charger?.brand || charger?.manualBrand);
  }
  if (factKey === "chargerModel") {
    return clean(charger?.model || charger?.manualModel);
  }
  if (factKey === "midNumber") return clean(charger?.midNumber);
  if (factKey === "serialNumber") return clean(charger?.serialNumber);
  return "";
}

function scopeKey(
  locationId: string,
  chargerId: string,
  factKey: DocumentFactKey,
): string {
  if (factKey === "partyName") {
    return locationFactKey(locationId, "energy:contractHolder");
  }
  if (factKey === "organizationName") return "account:organizationName";
  if (factKey === "kvkNumber") return "account:kvkNumber";
  if (
    factKey === "registeredAddress" || factKey === "legalForm" ||
    factKey === "tradeName" || factKey === "directorOrBoardMember" ||
    factKey === "directorTitle" ||
    factKey === "representationAuthorityText"
  ) return `account:${factKey}`;
  if (factKey === "structuredAddress") {
    return locationFactKey(locationId, "address");
  }
  if (factKey === "electricityEan") {
    return locationFactKey(locationId, "energy:ean");
  }
  if (factKey === "chargerBrand") return chargerFactKey(chargerId, "brand");
  if (factKey === "chargerModel") return chargerFactKey(chargerId, "model");
  if (factKey === "midNumber") return chargerFactKey(chargerId, "midNumber");
  if (factKey === "serialNumber") {
    return chargerFactKey(chargerId, "serialNumber");
  }
  return `${chargerFactKey(chargerId, factKey)}`;
}

function selectFullDocumentReviewMatrix(
  draft: DocumentFirstSignupDraft,
  locationId: string,
  chargerId = draft.chargerOrderByLocationId[locationId]?.[0] || "",
): DocumentReviewMatrix {
  const observations = buildObservations(draft, locationId, chargerId);
  const energyDocument = draft.energyDocumentsByLocationId[locationId];
  const organizationDocument = draft.organizationDocument;
  const chargerDocument = draft.chargerDocumentsByChargerId[chargerId]?.find(
    (document) => document.documentType === "installation_invoice",
  );
  const rows = DOCUMENT_FACT_REGISTRY.filter((fact) => fact.key !== "partyRole")
    .map(
      ({ key: factKey }): DocumentReviewRow => {
        const key = scopeKey(locationId, chargerId, factKey);
        const confirmation = draft.customerConfirmations[key];
        const correction = draft.manualCorrections[key];
        const applicability = selectDocumentFactApplicability(
          draft.accountBasis.accountType,
          factKey,
        );
        const declared = correction
          ? factValue(factKey, correction.canonicalValue)
          : declaredValue(draft, locationId, chargerId, factKey);
        const energyObservation = observations.find((candidate) =>
          candidate.factKey === factKey &&
          candidate.sourceDocumentType === "energy_bill_or_contract"
        );
        const organizationObservation = observations.find((candidate) =>
          candidate.factKey === factKey &&
          candidate.sourceDocumentType === "organization_extract"
        );
        const chargerObservation = observations.find((candidate) =>
          candidate.factKey === factKey &&
          candidate.sourceDocumentType === "installation_invoice"
        );
        const organization = cell(organizationObservation);
        const energy = cell(energyObservation);
        const charger = cell(chargerObservation);
        const rowObservations = observations.filter((candidate) =>
          candidate.factKey === factKey
        );
        const decision = decideDocumentFact({
          factKey,
          partyKind: draft.accountBasis.accountType === "particulier"
            ? "natural_person"
            : "organization",
          declaredValue: declared || null,
          observations: rowObservations,
          correctedValue: correction
            ? factValue(factKey, correction.canonicalValue)
            : null,
          confirmedValue: confirmation
            ? factValue(factKey, confirmation.canonicalValue)
            : null,
        });
        const decisionStatus = applicability === "not_applicable"
          ? "not_applicable"
          : decision.status;
        const canonicalValue = applicability === "not_applicable"
          ? ""
          : decision.canonicalValue;
        const blocksProgress = applicability === "not_applicable" ||
            (applicability === "informational" &&
              (decision.status === "missing" ||
                decision.status === "clean_match" ||
                decision.status === "normalized_match"))
          ? false
          : decision.blocksProgress;
        const foundValues = [
          declared,
          ...rowObservations.map((candidate) =>
            candidate.displayable ? clean(candidate.value) : ""
          ),
        ].filter(Boolean);
        const sourceDocuments = rowObservations
          .filter((candidate): candidate is DocumentFactObservation =>
            candidate.extractionStatus === "found" ||
            candidate.extractionStatus === "ambiguous"
          )
          .map((candidate) => ({
            documentId: candidate.sourceDocumentId,
            documentType: candidate.sourceDocumentType,
          }));
        return {
          factKey,
          scopeKey: key,
          label: documentFactLabel(factKey),
          declared: {
            value: declared || null,
            status: declared ? "found" : "not_found",
            semanticRole: factKey === "organizationName"
              ? "business_registration"
              : factKey === "registeredAddress"
              ? "registered_office"
              : factKey === "legalForm"
              ? "legal_form"
              : factKey === "tradeName"
              ? "trade_name"
              : factKey === "directorOrBoardMember"
              ? "director_or_board_member"
              : factKey === "directorTitle"
              ? "director_title"
              : factKey === "representationAuthorityText"
              ? "representation_authority_text"
              : factKey === "partyName"
              ? "contract_holder"
              : factKey === "structuredAddress"
              ? "delivery_address"
              : factKey === "electricityEan"
              ? "electricity_connection"
              : "charger_asset",
          },
          organizationDocument: organization,
          energyDocument: energy,
          chargerDocument: charger,
          decisionStatus,
          decisionReason: decision.reason,
          statusLabel: decisionStatus === "review_required"
            ? "ENVAL-controle nodig"
            : decisionStatus === "blocked"
            ? "Geblokkeerd"
            : decisionStatus === "ambiguous"
            ? "Meerdere waarden"
            : "",
          action: applicability === "not_applicable"
            ? null
            : applicability === "required" &&
                ["organizationName", "kvkNumber", "registeredAddress"].includes(
                  factKey,
                ) && !organizationDocument.file
            ? "KvK-uittreksel uploaden"
            : decisionStatus === "blocked"
            ? "Document vervangen"
            : decisionStatus === "missing"
            ? applicability === "required" ? "Invullen" : null
            : decisionStatus === "ambiguous"
            ? "Kiezen"
            : decisionStatus === "review_required"
            ? canonicalValue ? null : "Oplossen"
            : applicability === "informational"
            ? null
            : canonicalValue
            ? null
            : "Bevestigen",
          canonicalValue,
          proposedValue: declared || organization.value || energy.value ||
            charger.value || "",
          sourceDocuments: [...new Map(sourceDocuments.map((source) => [
            source.documentId,
            source,
          ])).values()],
          choices: [...new Set(foundValues)],
          correctedManually: Boolean(
            correction || confirmation?.correctedManually,
          ),
          confirmed: Boolean(confirmation),
          normalizationApplied: decision.normalizationApplied ||
            Boolean(confirmation?.normalizationApplied),
          blocksProgress,
          observations: rowObservations,
          applicability,
          required: applicability === "required",
        };
      },
    );
  const organizationAccount = draft.accountBasis.accountType !== "particulier";
  const requiredDocumentsPresent = Boolean(
    energyDocument?.file && chargerDocument?.file &&
      (!organizationAccount || organizationDocument.file),
  );
  const parsing =
    draft.connectionDeclarationsByLocationId[locationId]?.preflightStatus ===
      "parsing" ||
    chargerDocument?.parseStatus === "parsing" ||
    (organizationAccount && organizationDocument.parseStatus === "parsing");
  const locationLinked = draft.chargersById[chargerId]?.locationClientId ===
    locationId;
  const blockers = rows.filter((row) =>
    row.decisionStatus === "blocked" || (row.required && row.blocksProgress)
  );
  return {
    locationId,
    chargerId,
    observations,
    rows,
    blockers,
    showOrganizationDocument: organizationAccount,
    canContinue: requiredDocumentsPresent && locationLinked && !parsing &&
      blockers.length === 0,
  };
}

export function selectOrganizationDocumentReviewRows(
  draft: DocumentFirstSignupDraft,
): DocumentReviewRow[] {
  const locationId = draft.locationOrder[0] || "";
  const chargerId = draft.chargerOrderByLocationId[locationId]?.[0] || "";
  if (!locationId || !chargerId) return [];
  return selectFullDocumentReviewMatrix(draft, locationId, chargerId).rows
    .filter((row) => VISIBLE_ORGANIZATION_FACT_KEYS.has(row.factKey));
}

export function selectDocumentReviewMatrix(
  draft: DocumentFirstSignupDraft,
  locationId: string,
  chargerId = draft.chargerOrderByLocationId[locationId]?.[0] || "",
): DocumentReviewMatrix {
  const full = selectFullDocumentReviewMatrix(draft, locationId, chargerId);
  const rows = full.rows.filter((row) =>
    !ORGANIZATION_FACT_KEYS.has(row.factKey)
  );
  const blockers = rows.filter((row) =>
    row.decisionStatus === "blocked" || (row.required && row.blocksProgress)
  );
  const energyDocument = draft.energyDocumentsByLocationId[locationId];
  const chargerDocument = draft.chargerDocumentsByChargerId[chargerId]?.find(
    (document) => document.documentType === "installation_invoice",
  );
  const requiredDocumentsPresent = Boolean(
    energyDocument?.file && chargerDocument?.file,
  );
  const parsing =
    draft.connectionDeclarationsByLocationId[locationId]?.preflightStatus ===
      "parsing" || chargerDocument?.parseStatus === "parsing";
  const locationLinked = draft.chargersById[chargerId]?.locationClientId ===
    locationId;
  return {
    ...full,
    rows,
    blockers,
    showOrganizationDocument: false,
    canContinue: requiredDocumentsPresent && locationLinked && !parsing &&
      blockers.length === 0,
  };
}
