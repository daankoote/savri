import { getConfirmableEnergyEanCandidates } from "../invoice-analysis/energyEanCandidateExtractor";
import { compareChargerDocumentObservation } from "./chargerDocumentCrossCheck";
import {
  compareDeclaredLocationToObservedDeliveryAddress,
  compareEnergyDocumentPartyName,
} from "./energyDocumentCrossCheck";
import {
  chargerFactKey,
  type DocumentFirstFactValue,
  type DocumentFirstSignupDraft,
  documentFirstSignupToLegacyDraft,
  locationFactKey,
} from "./documentFirstSignupModel";
import {
  isValidDutchPostcode,
  isValidHouseNumber,
} from "./address/addressNormalizers";
import { isValidEmail, isValidName } from "./signupFieldNormalizers";
import { formatStructuredDutchAddress } from "./structuredAddress";
import type {
  AccountType,
  AddressDraft,
  PersonalInfoDraft,
  SignupDraft,
} from "./signupTypes";
import { selectOrganizationDocumentReviewRows } from "./documentReviewMatrix";
import {
  factRowsAllowProgress,
  selectUnifiedFactPresentation,
} from "./presentation/factPresentationModel";

export type DocumentFirstStepId =
  | "account"
  | "documents"
  | "signing";

export const DOCUMENT_FIRST_STEPS: ReadonlyArray<{
  id: DocumentFirstStepId;
  label:
    | "Account"
    | "Documenten"
    | "Ondertekenen";
}> = [
  { id: "account", label: "Account" },
  { id: "documents", label: "Documenten" },
  { id: "signing", label: "Ondertekenen" },
];

export type DocumentFirstAccountTypeConfig = {
  accountType: AccountType;
  organizationLabel: "Bedrijfsnaam" | "VVE naam" | null;
  requiresOrganization: boolean;
  requiresKvk: boolean;
};

export const DOCUMENT_FIRST_ACCOUNT_TYPE_CONFIG: Record<
  AccountType,
  DocumentFirstAccountTypeConfig
> = {
  particulier: {
    accountType: "particulier",
    organizationLabel: null,
    requiresOrganization: false,
    requiresKvk: false,
  },
  zakelijk: {
    accountType: "zakelijk",
    organizationLabel: "Bedrijfsnaam",
    requiresOrganization: true,
    requiresKvk: true,
  },
  vve: {
    accountType: "vve",
    organizationLabel: "VVE naam",
    requiresOrganization: true,
    requiresKvk: true,
  },
};

export type DocumentFirstMatrixStatus =
  | "Komt overeen"
  | "Initiaal en achternaam komen overeen"
  | "Controle nodig"
  | "Bevestigen";

export type DocumentFirstReviewChoice = {
  label: string;
  value: string;
};

export type DocumentFirstReviewFact = {
  factKey: string;
  label: string;
  value: DocumentFirstFactValue;
  displayValue: string;
  status?: DocumentFirstMatrixStatus;
  requiresConfirmation: boolean;
  action?: "confirm" | "correct";
  confirmed: boolean;
  rejected: boolean;
  pendingPersistence: boolean;
  choices?: DocumentFirstReviewChoice[];
  selectedChoice?: string;
};

export type DocumentFirstReviewGroup = {
  id: string;
  title: string;
  facts: DocumentFirstReviewFact[];
};

export type DocumentFirstGapKind =
  | "text"
  | "date"
  | "address"
  | "ean";

export type DocumentFirstGap = {
  factKey: string;
  kind: DocumentFirstGapKind;
  label: string;
  locationId?: string;
  chargerId?: string;
  pendingPersistence: boolean;
  value: DocumentFirstFactValue;
};

export type DocumentFirstStepCompleteness = Record<
  DocumentFirstStepId,
  boolean
>;

export function selectAccountTypeConfig(
  draft: DocumentFirstSignupDraft,
): DocumentFirstAccountTypeConfig {
  return DOCUMENT_FIRST_ACCOUNT_TYPE_CONFIG[draft.accountBasis.accountType];
}

export function selectPersonalInfoAdapter(
  draft: DocumentFirstSignupDraft,
): PersonalInfoDraft {
  const accountType = draft.accountBasis.accountType;
  return {
    accountType,
    firstName: "",
    lastName: "",
    companyName: accountType === "zakelijk" ? draft.legalParty.legalName : "",
    organizationName: accountType === "vve" ? draft.legalParty.legalName : "",
    kvkNumber: draft.legalParty.kvkNumber,
    email: draft.accountBasis.email,
    phone: "",
    address: {
      postcode: "",
      houseNumber: "",
      suffix: "",
      street: "",
      city: "",
      country: "Nederland",
      bagId: null,
      resolvedLookupKey: null,
    },
    kvkDocument: null,
  };
}

export function selectMapperCompatibleDraft(
  draft: DocumentFirstSignupDraft,
): SignupDraft {
  return documentFirstSignupToLegacyDraft(draft);
}

function statusFromComparison(
  status: string,
): DocumentFirstMatrixStatus | undefined {
  if (status === "match" || status === "exact_full_match") {
    return "Komt overeen";
  }
  if (status === "initial_and_surname_match") {
    return "Initiaal en achternaam komen overeen";
  }
  if (status === "mismatch") return "Controle nodig";
  return undefined;
}

function factResolution(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): { confirmed: boolean; rejected: boolean } {
  return {
    confirmed: Boolean(
      draft.customerConfirmations[factKey] ||
        draft.manualCorrections[factKey],
    ),
    rejected: draft.rejectedFactKeys[factKey] === true,
  };
}

function observedAddressToDraft(
  observed: {
    postalCode: string | null;
    houseNumber: string | null;
    houseNumberAddition: string | null;
    street: string | null;
    city: string | null;
    country: string | null;
  },
): AddressDraft {
  return {
    postcode: observed.postalCode || "",
    houseNumber: observed.houseNumber || "",
    suffix: observed.houseNumberAddition || "",
    street: observed.street || "",
    city: observed.city || "",
    country: observed.country || "Nederland",
    bagId: null,
    resolvedLookupKey: null,
  };
}

function observedTextFact(
  draft: DocumentFirstSignupDraft,
  input: Omit<DocumentFirstReviewFact, "confirmed" | "rejected">,
): DocumentFirstReviewFact {
  const resolution = factResolution(draft, input.factKey);
  return {
    ...input,
    ...resolution,
    action: input.requiresConfirmation
      ? resolution.confirmed || resolution.rejected ||
          input.status === "Controle nodig"
        ? "correct"
        : "confirm"
      : undefined,
  };
}

export function selectEnergyReviewFacts(
  draft: DocumentFirstSignupDraft,
  locationId: string,
): DocumentFirstReviewFact[] {
  const legacy = documentFirstSignupToLegacyDraft(draft);
  const location = legacy.locations.find((candidate) =>
    candidate.clientId === locationId
  );
  const observation = location?.energyDocumentObservation;
  const declaration = draft.connectionDeclarationsByLocationId[locationId];
  if (!location || !observation || !declaration) return [];

  const facts: DocumentFirstReviewFact[] = [];
  const candidates = getConfirmableEnergyEanCandidates(declaration.candidates);
  const selectedEan = declaration.selectedCandidateEan ||
    (candidates.length === 1 ? candidates[0].normalizedEan : "");
  if (selectedEan || candidates.length > 1) {
    const factKey = locationFactKey(locationId, "energy:ean");
    facts.push(observedTextFact(draft, {
      factKey,
      label: "EAN elektriciteit",
      value: selectedEan,
      displayValue: selectedEan,
      status: declaration.customerConfirmed ? undefined : "Bevestigen",
      requiresConfirmation: true,
      pendingPersistence: false,
      choices: candidates.length > 1
        ? candidates.map((candidate) => ({
          label: candidate.normalizedEan,
          value: candidate.normalizedEan,
        }))
        : undefined,
      selectedChoice: selectedEan,
    }));
  }

  if (
    observation.contractHolderName.displayable &&
    observation.contractHolderName.value
  ) {
    const comparison = compareEnergyDocumentPartyName(
      legacy,
      observation.contractHolderName,
    );
    const factKey = locationFactKey(locationId, "energy:contractHolder");
    const resolution = factResolution(draft, factKey);
    facts.push(observedTextFact(draft, {
      factKey,
      label: "Contracthouder",
      value: observation.contractHolderName.value,
      displayValue: observation.contractHolderName.value,
      status: resolution.confirmed
        ? statusFromComparison(comparison.status)
        : statusFromComparison(comparison.status) || "Bevestigen",
      requiresConfirmation: true,
      pendingPersistence: true,
    }));
  }

  if (observation.deliveryAddress.displayable) {
    const factKey = locationFactKey(locationId, "address");
    const value = observedAddressToDraft(observation.deliveryAddress);
    const comparison = compareDeclaredLocationToObservedDeliveryAddress(
      location.address,
      observation.deliveryAddress,
    );
    const resolution = factResolution(draft, factKey);
    facts.push(observedTextFact(draft, {
      factKey,
      label: "Leveradres",
      value,
      displayValue: formatStructuredDutchAddress(observation.deliveryAddress),
      status: resolution.confirmed
        ? statusFromComparison(comparison.status)
        : statusFromComparison(comparison.status) || "Bevestigen",
      requiresConfirmation: true,
      pendingPersistence: false,
    }));
  }

  return facts;
}

export function selectChargerReviewFacts(
  draft: DocumentFirstSignupDraft,
  locationId: string,
  chargerId: string,
): DocumentFirstReviewFact[] {
  const charger = draft.chargersById[chargerId];
  if (!charger || charger.locationClientId !== locationId) {
    return [];
  }
  const legacy = documentFirstSignupToLegacyDraft(draft);
  const legacyLocation = legacy.locations.find((location) =>
    location.clientId === locationId
  );
  const legacyCharger = legacyLocation?.chargers.find((candidate) =>
    candidate.clientId === chargerId
  );
  const observation = legacy.documentsByChargerId[chargerId]?.find((document) =>
    document.documentType === "installation_invoice"
  )?.observation;
  if (!legacyLocation || !legacyCharger || !observation) return [];
  const comparisons = compareChargerDocumentObservation(
    legacyCharger,
    legacy,
    legacyLocation.address,
    observation,
  );

  const facts: DocumentFirstReviewFact[] = [];
  const addText = (
    fact: string,
    label: string,
    value: string | null,
    displayable: boolean,
    comparisonStatus: string | undefined,
    pendingPersistence: boolean,
    requiresConfirmation = true,
    displayValue?: string,
  ) => {
    if (!displayable || !value) return;
    const factKey = chargerFactKey(chargerId, fact);
    const resolution = factResolution(draft, factKey);
    facts.push(observedTextFact(draft, {
      factKey,
      label,
      value,
      displayValue: displayValue || value,
      status: requiresConfirmation && !resolution.confirmed
        ? statusFromComparison(comparisonStatus || "") || "Bevestigen"
        : statusFromComparison(comparisonStatus || ""),
      requiresConfirmation,
      pendingPersistence,
    }));
  };

  addText(
    "brand",
    "Merk",
    observation.brand.value,
    observation.brand.displayable,
    comparisons.brand.status,
    false,
  );
  addText(
    "model",
    "Model",
    observation.model.value,
    observation.model.displayable,
    comparisons.model.status,
    false,
  );
  addText(
    "midNumber",
    "MID",
    observation.midNumber.value,
    observation.midNumber.displayable,
    comparisons.midNumber.status,
    false,
  );
  addText(
    "serialNumber",
    "Serienummer",
    observation.serialNumber.value,
    observation.serialNumber.displayable,
    comparisons.serialNumber.status,
    false,
  );
  return facts;
}

export function selectReviewGroups(
  draft: DocumentFirstSignupDraft,
  locationId: string,
): DocumentFirstReviewGroup[] {
  const groups: DocumentFirstReviewGroup[] = [{
    id: `${locationId}:energy`,
    title: "Energienota of energiecontract",
    facts: selectEnergyReviewFacts(draft, locationId),
  }];
  (draft.chargerOrderByLocationId[locationId] || []).forEach(
    (chargerId, index) => {
      groups.push({
        id: `${locationId}:${chargerId}`,
        title: `Laadpaal ${index + 1}`,
        facts: selectChargerReviewFacts(draft, locationId, chargerId),
      });
    },
  );
  return groups.filter((group) => group.facts.length > 0);
}

function correctionString(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): string {
  const value = draft.manualCorrections[factKey]?.value;
  return typeof value === "string" ? value : "";
}

function correctionAddress(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): AddressDraft {
  const value = draft.manualCorrections[factKey]?.value;
  return value && typeof value !== "string" ? value : {
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

function resolvedString(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): boolean {
  const confirmation = draft.customerConfirmations[factKey]?.value;
  const correction = correctionString(draft, factKey);
  const value = typeof confirmation === "string" && confirmation.trim()
    ? confirmation
    : correction;
  return factKey.startsWith("party:")
    ? isValidName(value)
    : value.trim() !== "";
}

function resolvedAddress(
  draft: DocumentFirstSignupDraft,
  factKey: string,
): boolean {
  const confirmed = draft.customerConfirmations[factKey]?.value;
  if (
    confirmed && typeof confirmed !== "string" &&
    isValidDutchPostcode(confirmed.postcode) &&
    isValidHouseNumber(confirmed.houseNumber)
  ) return true;

  const corrected = draft.manualCorrections[factKey]?.value;
  return Boolean(
    corrected && typeof corrected !== "string" &&
      isValidDutchPostcode(corrected.postcode) &&
      isValidHouseNumber(corrected.houseNumber) &&
      corrected.street.trim() && corrected.city.trim() &&
      corrected.resolvedLookupKey,
  );
}

export function selectOpenGaps(
  draft: DocumentFirstSignupDraft,
): DocumentFirstGap[] {
  const gaps: DocumentFirstGap[] = [];
  if (draft.accountBasis.accountType === "particulier") {
    const hasConfirmedHolder = draft.locationOrder.some((locationId) =>
      Boolean(
        draft.customerConfirmations[
          locationFactKey(locationId, "energy:contractHolder")
        ],
      )
    );
    if (!hasConfirmedHolder && !resolvedString(draft, "party:firstName")) {
      gaps.push({
        factKey: "party:firstName",
        kind: "text",
        label: "Voornaam/voornamen (voluit)",
        pendingPersistence: false,
        value: correctionString(draft, "party:firstName"),
      });
    }
    if (!hasConfirmedHolder && !resolvedString(draft, "party:lastName")) {
      gaps.push({
        factKey: "party:lastName",
        kind: "text",
        label: "Achternaam",
        pendingPersistence: false,
        value: correctionString(draft, "party:lastName"),
      });
    }
  }

  draft.locationOrder.forEach((locationId) => {
    const addressKey = locationFactKey(locationId, "address");
    if (!resolvedAddress(draft, addressKey)) {
      gaps.push({
        factKey: addressKey,
        kind: "address",
        label: "Locatie",
        locationId,
        pendingPersistence: false,
        value: correctionAddress(draft, addressKey),
      });
    }

    const declaration = draft.connectionDeclarationsByLocationId[locationId];
    if (!declaration?.customerConfirmed) {
      gaps.push({
        factKey: locationFactKey(locationId, "energy:ean"),
        kind: "ean",
        label: "EAN elektriciteit",
        locationId,
        pendingPersistence: false,
        value: declaration?.manualEan || declaration?.selectedCandidateEan ||
          "",
      });
    }

    (draft.chargerOrderByLocationId[locationId] || []).forEach((chargerId) => {
      const requiredTextFacts = [
        ["brand", "Merk", false],
        ["model", "Model", false],
        ["midNumber", "MID", false],
        ["serialNumber", "Serienummer", false],
      ] as const;
      requiredTextFacts.forEach(([fact, label, pendingPersistence]) => {
        const factKey = chargerFactKey(chargerId, fact);
        if (!resolvedString(draft, factKey)) {
          gaps.push({
            factKey,
            kind: "text",
            label,
            locationId,
            chargerId,
            pendingPersistence,
            value: correctionString(draft, factKey),
          });
        }
      });
    });
  });

  return gaps;
}

function accountComplete(draft: DocumentFirstSignupDraft): boolean {
  if (!isValidEmail(draft.accountBasis.email)) return false;
  if (draft.accountBasis.accountType === "particulier") return true;
  if (
    !draft.organizationDocument.file ||
    draft.organizationDocument.quarantineStatus !== "confirmed_quarantine" ||
    draft.organizationDocument.parseStatus === "parsing"
  ) return false;
  const rows = selectOrganizationDocumentReviewRows(draft);
  const requiredFactKeys = [
    "organizationName",
    "kvkNumber",
    "registeredAddress",
  ];
  const presentation = selectUnifiedFactPresentation(draft);
  return requiredFactKeys.every((factKey) =>
    rows.some((row) => row.factKey === factKey)
  ) && factRowsAllowProgress(
    presentation.organizationRows.filter((row) => row.isRequired),
  );
}

function documentsComplete(draft: DocumentFirstSignupDraft): boolean {
  const presentation = selectUnifiedFactPresentation(draft);
  return draft.locationOrder.every((locationId) => {
    const energyDocument = draft.energyDocumentsByLocationId[locationId];
    const connection = draft.connectionDeclarationsByLocationId[locationId];
    const energyTerminal = connection?.preflightStatus !== "parsing";
    const chargersComplete = (draft.chargerOrderByLocationId[locationId] || [])
      .every((chargerId) => {
        const document = draft.chargerDocumentsByChargerId[chargerId]?.find(
          (candidate) => candidate.documentType === "installation_invoice",
        );
        return Boolean(
          document?.file &&
            document.quarantineStatus === "confirmed_quarantine" &&
            document.parseStatus !== "parsing",
        );
      });
    const locationFactsComplete = factRowsAllowProgress(
      presentation.locations.find((section) =>
        section.locationId === locationId
      )
        ?.rows || [],
    );
    const chargerFactsComplete = presentation.chargers
      .filter((section) => section.locationId === locationId)
      .every((section) => factRowsAllowProgress(section.rows));
    return Boolean(
      energyDocument?.file &&
        energyDocument.quarantineStatus === "confirmed_quarantine" &&
        energyTerminal && chargersComplete &&
        locationFactsComplete && chargerFactsComplete,
    );
  });
}

export function selectSigningFileReadiness(
  draft: DocumentFirstSignupDraft,
): { ready: boolean; fileReferences: string[] } {
  const requiredDocuments = [
    ...(draft.accountBasis.accountType === "particulier"
      ? []
      : [draft.organizationDocument]),
    ...draft.locationOrder.map((locationId) =>
      draft.energyDocumentsByLocationId[locationId]
    ),
    ...draft.locationOrder.flatMap((locationId) =>
      (draft.chargerOrderByLocationId[locationId] || []).map((chargerId) =>
        draft.chargerDocumentsByChargerId[chargerId]?.find((document) =>
          document.documentType === "installation_invoice"
        )
      )
    ),
  ];
  const fileReferences = [
    ...new Set(
      requiredDocuments.flatMap((document) =>
        typeof document?.quarantineFileReference === "string" &&
          document.quarantineFileReference
          ? [document.quarantineFileReference]
          : []
      ),
    ),
  ];
  return {
    ready: requiredDocuments.length > 0 &&
      fileReferences.length === requiredDocuments.length &&
      requiredDocuments.every((document) =>
        Boolean(
          document?.file &&
            document.quarantineStatus === "confirmed_quarantine" &&
            document.quarantineFileReference,
        )
      ),
    fileReferences,
  };
}

function reviewComplete(draft: DocumentFirstSignupDraft): boolean {
  return draft.locationOrder.every((locationId) =>
    selectReviewGroups(draft, locationId).every((group) =>
      group.facts.every((fact) =>
        !fact.requiresConfirmation || fact.confirmed || fact.rejected
      )
    )
  );
}

export function selectStepCompleteness(
  draft: DocumentFirstSignupDraft,
): DocumentFirstStepCompleteness {
  const account = accountComplete(draft);
  const documents = account && documentsComplete(draft);
  return {
    account,
    documents,
    signing: false,
  };
}

export function selectMaximumReachableStepIndex(
  draft: DocumentFirstSignupDraft,
): number {
  const completeness = selectStepCompleteness(draft);
  if (!completeness.account) return 0;
  if (!completeness.documents) return 1;
  return 2;
}
