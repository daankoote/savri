import type { DocumentFactApplicability } from "../documentFactApplicability";
import { compareDocumentFactValues } from "../documentFactDecisionPolicy";
import type {
  DocumentFactKey,
  DocumentSourceType,
} from "../documentFactRegistry";
import type {
  DocumentFirstFactValue,
  DocumentFirstSignupDraft,
} from "../documentFirstSignupModel";
import {
  type DocumentReviewRow,
  selectDocumentReviewMatrix,
  selectOrganizationDocumentReviewRows,
} from "../documentReviewMatrix";
import { compareBoundedPartyNameValues } from "../signupPartyNameCrossCheck";
import type { AddressDraft } from "../signupTypes";
import {
  isValidDutchPostcode,
  isValidHouseNumber,
  isValidSuffix,
} from "../address/addressNormalizers";
import {
  compareFormattedDutchAddresses,
  hasMeaningfulManualAddress,
} from "../structuredAddress";

export type FactResolutionState =
  | "pending"
  | "confirmed"
  | "review_required"
  | "blocked";

export type FactResolutionReason =
  | "user_override"
  | "user_supplied_without_document"
  | "document_conflict_resolved"
  | "probable_identity_match"
  | "probable_address_match"
  | "unresolved_document_conflict"
  | "invalid_value"
  | "clear_identity_mismatch"
  | "required_missing_after_attempt"
  | null;

export type FactPresentationJudgment =
  | ""
  | "Bevestigd"
  | "ENVAL-controle nodig"
  | "Kan niet worden ingediend";

export type FactPresentationAction =
  | "confirm"
  | "correct"
  | "fill"
  | "choose"
  | "replace-document";

export type FactPresentationSource = {
  sourceId: string;
  sourceType: DocumentSourceType | "user";
  sourceLabel: string;
  binding: string;
  observedValue: string;
  normalizedValue: string;
  documentIdentity?: string;
  locationId?: string;
  chargerId?: string;
};

export type FactPresentationRow = {
  id: string;
  label: string;
  canonicalValue: string;
  sources: FactPresentationSource[];
  sourceValues: string[];
  sourceLabels: string[];
  applicability: DocumentFactApplicability;
  resolutionState: FactResolutionState;
  resolutionReason: FactResolutionReason;
  judgment: FactPresentationJudgment;
  confirmationState: "confirmed" | "unconfirmed";
  correctionState: "manual" | "unchanged";
  correctionValue?: DocumentFirstFactValue;
  isRequired: boolean;
  isInformational: boolean;
  actions: FactPresentationAction[];
  locationId?: string;
  chargerId?: string;
  reviewRow: DocumentReviewRow | null;
};

export type FactPresentationSection = {
  id: string;
  title: string;
  rows: FactPresentationRow[];
  locationId?: string;
  chargerId?: string;
};

export type UnifiedFactPresentation = {
  organizationRows: FactPresentationRow[];
  account: FactPresentationSection;
  locations: FactPresentationSection[];
  chargers: FactPresentationSection[];
  documents: FactPresentationSection;
};

type RowProjectionOptions = {
  id?: string;
  label?: string;
  locationId?: string;
  chargerId?: string;
  sourceType?: DocumentSourceType;
  sourceBindings?: Partial<Record<DocumentSourceType, string>>;
  userBinding?: string;
  documentIdentities?: Record<string, string>;
  manualValue?: DocumentFirstFactValue;
  manualValues?: Record<string, DocumentFirstFactValue>;
  partyKind?: "natural_person" | "organization";
  forceInformational?: boolean;
};

const SOURCE_LABELS: Record<DocumentSourceType, string> = {
  organization_extract: "KvK-uittreksel",
  energy_bill_or_contract: "Energiecontract/-nota",
  installation_invoice: "Installatiefactuur",
};

const ACCOUNT_TYPE_LABELS = {
  particulier: "Particulier",
  zakelijk: "Zakelijk",
  vve: "VvE",
} as const;

const LOCATION_FACTS: ReadonlyArray<{
  factKey: DocumentFactKey;
  label?: string;
}> = [
  { factKey: "partyName", label: "Naam op energiecontract" },
  { factKey: "structuredAddress" },
  { factKey: "electricityEan" },
  { factKey: "energySupplier" },
  { factKey: "contractStart" },
  { factKey: "contractEnd" },
];

const CHARGER_FACTS: ReadonlyArray<{
  factKey: DocumentFactKey;
  label?: string;
}> = [
  { factKey: "chargerBrand" },
  { factKey: "chargerModel" },
  { factKey: "serialNumber" },
  { factKey: "midNumber" },
  { factKey: "invoiceDate" },
  { factKey: "explicitInstallationDate" },
];

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedValue(value: string): string {
  return clean(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("nl-NL").replace(/[^a-z0-9]+/g, " ").trim();
}

function visibleValue(row: DocumentReviewRow): string {
  return clean(row.canonicalValue || row.proposedValue);
}

export function isValidFactCorrectionValue(
  factKey: DocumentFactKey,
  value: DocumentFirstFactValue,
): boolean {
  if (typeof value === "string") {
    const cleaned = clean(value);
    if (!cleaned) return false;
    if (factKey === "electricityEan") return /^\d{18}$/.test(cleaned);
    return true;
  }
  return factKey === "structuredAddress" &&
    isValidDutchPostcode(value.postcode) &&
    isValidHouseNumber(value.houseNumber) && isValidSuffix(value.suffix) &&
    hasMeaningfulManualAddress({
      street: value.street,
      houseNumber: value.houseNumber,
      houseNumberAddition: value.suffix,
      postalCode: value.postcode,
      city: value.city,
      country: value.country,
    });
}

function observationSources(
  row: DocumentReviewRow,
  options: RowProjectionOptions,
): FactPresentationSource[] {
  const sources = row.observations
    .filter((candidate) =>
      !options.sourceType || candidate.sourceDocumentType === options.sourceType
    )
    .filter((candidate) =>
      candidate.extractionStatus === "found" && candidate.displayable &&
      Boolean(clean(candidate.value))
    )
    .map((candidate): FactPresentationSource => ({
      sourceId: candidate.sourceDocumentId,
      sourceType: candidate.sourceDocumentType,
      sourceLabel: SOURCE_LABELS[candidate.sourceDocumentType],
      binding: options.sourceBindings?.[candidate.sourceDocumentType] ||
        SOURCE_LABELS[candidate.sourceDocumentType],
      observedValue: clean(candidate.value),
      normalizedValue: normalizedValue(clean(candidate.value)),
      documentIdentity:
        options.documentIdentities?.[candidate.sourceDocumentId] ||
        candidate.sourceDocumentId,
      locationId: options.locationId,
      chargerId: options.chargerId,
    }));
  const manualValue = options.manualValue ??
    options.manualValues?.[row.scopeKey];
  const userValue = manualValue
    ? typeof manualValue === "string" ? clean(manualValue) : visibleValue(row)
    : row.confirmed || (!sources.length && row.declared.value)
    ? visibleValue(row)
    : "";
  if (userValue) {
    sources.push({
      sourceId: `user:${row.scopeKey}`,
      sourceType: "user",
      sourceLabel: row.correctedManually
        ? "Handmatig aangepast"
        : "Door gebruiker",
      binding: options.userBinding || "Door gebruiker",
      observedValue: userValue,
      normalizedValue: normalizedValue(userValue),
      locationId: options.locationId,
      chargerId: options.chargerId,
    });
  }
  return sources;
}

type SourceRelation = "single" | "equal" | "probable" | "conflict";

function sourceRelation(
  factKey: DocumentFactKey,
  sources: FactPresentationSource[],
  partyKind: "natural_person" | "organization",
): SourceRelation {
  const documentSources = [...new Map(
    sources.filter((source) => source.sourceType !== "user").map((source) => [
      source.documentIdentity || source.sourceId,
      source,
    ]),
  ).values()];
  if (documentSources.length < 2) return "single";
  let probable = false;
  for (let left = 0; left < documentSources.length; left += 1) {
    for (let right = left + 1; right < documentSources.length; right += 1) {
      const leftValue = documentSources[left].observedValue;
      const rightValue = documentSources[right].observedValue;
      if (factKey === "partyName") {
        const match = compareBoundedPartyNameValues(
          leftValue,
          rightValue,
          partyKind,
        );
        if (match === "mismatch") return "conflict";
        if (match === "probable") probable = true;
        continue;
      }
      if (factKey === "structuredAddress") {
        const match = compareFormattedDutchAddresses(leftValue, rightValue);
        if (match === "mismatch") return "conflict";
        if (match === "probable") probable = true;
        if (match !== "unavailable") continue;
      }
      const match = compareDocumentFactValues(
        factKey,
        leftValue,
        rightValue,
        partyKind,
      );
      if (match === "different") return "conflict";
    }
  }
  return probable ? "probable" : "equal";
}

function resolveRow(
  row: DocumentReviewRow,
  sources: FactPresentationSource[],
  manualValue: DocumentFirstFactValue | undefined,
  partyKind: "natural_person" | "organization",
): { state: FactResolutionState; reason: FactResolutionReason } {
  const documents = sources.filter((source) => source.sourceType !== "user");
  const relation = sourceRelation(row.factKey, sources, partyKind);
  if (
    row.correctedManually &&
    !isValidFactCorrectionValue(
      row.factKey,
      manualValue || row.canonicalValue || row.proposedValue,
    )
  ) return { state: "blocked", reason: "invalid_value" };

  if (row.correctedManually) {
    if (relation === "probable") {
      return {
        state: "review_required",
        reason: row.factKey === "structuredAddress"
          ? "probable_address_match"
          : "probable_identity_match",
      };
    }
    return {
      state: "review_required",
      reason: relation === "conflict"
        ? "document_conflict_resolved"
        : documents.length === 0
        ? "user_supplied_without_document"
        : "user_override",
    };
  }

  if (row.confirmed) {
    if (relation === "conflict") {
      return { state: "blocked", reason: "unresolved_document_conflict" };
    }
    if (relation === "probable") {
      return {
        state: "review_required",
        reason: row.factKey === "structuredAddress"
          ? "probable_address_match"
          : "probable_identity_match",
      };
    }
    return { state: "confirmed", reason: null };
  }

  if (relation === "conflict") {
    return {
      state: "blocked",
      reason: row.factKey === "partyName"
        ? "clear_identity_mismatch"
        : "unresolved_document_conflict",
    };
  }
  if (relation === "equal") return { state: "confirmed", reason: null };
  if (relation === "probable") return { state: "pending", reason: null };
  if (row.decisionStatus === "blocked" || row.decisionStatus === "ambiguous") {
    return { state: "blocked", reason: "unresolved_document_conflict" };
  }
  if (
    documents.length === 0 &&
    sources.some((source) => source.sourceType === "user")
  ) {
    return {
      state: "review_required",
      reason: "user_supplied_without_document",
    };
  }
  return { state: "pending", reason: null };
}

function judgment(state: FactResolutionState): FactPresentationJudgment {
  if (state === "confirmed") return "Bevestigd";
  if (state === "review_required") return "ENVAL-controle nodig";
  if (state === "blocked") return "Kan niet worden ingediend";
  return "";
}

function actions(
  row: DocumentReviewRow,
  resolutionState: FactResolutionState,
  resolutionReason: FactResolutionReason,
): FactPresentationAction[] {
  if (resolutionState === "blocked") {
    return resolutionReason === "invalid_value"
      ? ["correct"]
      : ["choose", "correct"];
  }
  if (resolutionState === "review_required") return ["correct"];
  if (resolutionState === "confirmed") return ["correct"];
  return visibleValue(row) ? ["confirm", "correct"] : ["fill"];
}

export function projectFactPresentationRow(
  row: DocumentReviewRow,
  options: RowProjectionOptions = {},
): FactPresentationRow | null {
  if (row.applicability === "not_applicable") return null;
  const partyKind = options.partyKind || "natural_person";
  const manualValue = options.manualValue ??
    options.manualValues?.[row.scopeKey];
  const sources = observationSources(row, options);
  const resolution = resolveRow(row, sources, manualValue, partyKind);
  const isInformational = options.forceInformational ||
    row.applicability === "informational";
  const candidateValue = visibleValue(row) ||
    sources.find((source) => source.sourceType !== "user")?.observedValue || "";
  if (isInformational && !candidateValue) return null;
  const canonicalValue = resolution.state === "blocked" ? "" : candidateValue;
  return {
    id: options.id || row.scopeKey,
    label: options.label || row.label,
    canonicalValue,
    sources,
    sourceValues: sources.map((source) => source.observedValue),
    sourceLabels: sources.map((source) => source.sourceLabel),
    applicability: isInformational ? "informational" : row.applicability,
    resolutionState: resolution.state,
    resolutionReason: resolution.reason,
    judgment: judgment(resolution.state),
    confirmationState: resolution.state === "confirmed"
      ? "confirmed"
      : "unconfirmed",
    correctionState: row.correctedManually ? "manual" : "unchanged",
    correctionValue: manualValue,
    isRequired: !isInformational && row.required,
    isInformational,
    actions: actions(row, resolution.state, resolution.reason),
    locationId: options.locationId,
    chargerId: options.chargerId,
    reviewRow: isInformational && options.sourceType === "installation_invoice"
      ? null
      : row,
  };
}

export function projectFactPresentationRows(
  rows: DocumentReviewRow[],
  options: Omit<RowProjectionOptions, "id" | "label"> = {},
): FactPresentationRow[] {
  return rows.map((row) => projectFactPresentationRow(row, options))
    .filter((row): row is FactPresentationRow => row !== null);
}

export function factResolutionAllowsProgress(
  row: FactPresentationRow,
): boolean {
  return !row.isRequired || row.resolutionState === "confirmed" ||
    row.resolutionState === "review_required";
}

export function factRowsAllowProgress(rows: FactPresentationRow[]): boolean {
  return rows.every(factResolutionAllowsProgress);
}

function syntheticRow(input: {
  id: string;
  label: string;
  value: string;
  sourceLabel: string;
  resolutionState?: FactResolutionState;
  locationId?: string;
  chargerId?: string;
}): FactPresentationRow {
  const value = clean(input.value);
  const source: FactPresentationSource = {
    sourceId: `user:${input.id}`,
    sourceType: "user",
    sourceLabel: input.sourceLabel,
    binding: input.sourceLabel,
    observedValue: value,
    normalizedValue: normalizedValue(value),
    locationId: input.locationId,
    chargerId: input.chargerId,
  };
  const resolutionState = input.resolutionState || "review_required";
  return {
    id: input.id,
    label: input.label,
    canonicalValue: value,
    sources: value ? [source] : [],
    sourceValues: value ? [value] : [],
    sourceLabels: value ? [input.sourceLabel] : [],
    applicability: "required",
    resolutionState,
    resolutionReason: resolutionState === "review_required"
      ? "user_supplied_without_document"
      : null,
    judgment: judgment(resolutionState),
    confirmationState: resolutionState === "confirmed"
      ? "confirmed"
      : "unconfirmed",
    correctionState: "unchanged",
    isRequired: true,
    isInformational: false,
    actions: [],
    locationId: input.locationId,
    chargerId: input.chargerId,
    reviewRow: null,
  };
}

function selectRows(
  rows: DocumentReviewRow[],
  factKeys: ReadonlyArray<{ factKey: DocumentFactKey; label?: string }>,
  options: Omit<RowProjectionOptions, "id" | "label">,
): FactPresentationRow[] {
  return factKeys.flatMap(({ factKey, label }) => {
    const row = rows.find((candidate) => candidate.factKey === factKey);
    if (!row) return [];
    const projected = projectFactPresentationRow(row, { ...options, label });
    return projected ? [projected] : [];
  });
}

function documentFilename(file: File | null): string {
  return clean(
    file?.name.replace(/[\\/\u0000-\u001f\u007f]/g, "").slice(0, 180),
  ) || "Nog geen bestand gekozen";
}

function manualValues(draft: DocumentFirstSignupDraft) {
  return Object.fromEntries(
    Object.entries(draft.manualCorrections).map(([key, correction]) => [
      key,
      correction.value,
    ]),
  );
}

export function selectUnifiedFactPresentation(
  draft: DocumentFirstSignupDraft,
): UnifiedFactPresentation {
  const partyKind = draft.accountBasis.accountType === "particulier"
    ? "natural_person" as const
    : "organization" as const;
  const identities = Object.fromEntries(
    Object.entries(draft.parserObservations.byDocumentId).map(([id, cache]) => [
      id,
      cache.contentFingerprint,
    ]),
  );
  const corrections = manualValues(draft);
  const chargerNumbers = new Map<string, number>();
  let chargerNumber = 0;
  draft.locationOrder.forEach((locationId) => {
    (draft.chargerOrderByLocationId[locationId] || []).forEach((chargerId) => {
      chargerNumber += 1;
      chargerNumbers.set(chargerId, chargerNumber);
    });
  });
  const organizationReviewRows = selectOrganizationDocumentReviewRows(draft);
  const organizationRows = projectFactPresentationRows(
    organizationReviewRows,
    {
      documentIdentities: identities,
      manualValues: corrections,
      partyKind,
      sourceBindings: { organization_extract: "Account" },
      userBinding: "Account",
    },
  );
  const accountRows: FactPresentationRow[] = [
    syntheticRow({
      id: "account:type",
      label: "Accounttype",
      value: ACCOUNT_TYPE_LABELS[draft.accountBasis.accountType],
      sourceLabel: "Door gebruiker",
    }),
    syntheticRow({
      id: "account:email",
      label: "E-mailadres",
      value: draft.accountBasis.email,
      sourceLabel: "Door gebruiker",
    }),
  ];
  if (draft.accountBasis.accountType !== "particulier") {
    accountRows.push(...organizationRows);
  }

  const locations: FactPresentationSection[] = [];
  const chargers: FactPresentationSection[] = [];
  const documentRows: FactPresentationRow[] = [];

  if (draft.accountBasis.accountType !== "particulier") {
    documentRows.push(syntheticRow({
      id: draft.organizationDocument.clientId,
      label: "KvK-uittreksel",
      value: documentFilename(draft.organizationDocument.file),
      sourceLabel: "Account",
      resolutionState: "confirmed",
    }));
  }

  draft.locationOrder.forEach((locationId, locationIndex) => {
    const locationNumber = locationIndex + 1;
    const chargerIds = draft.chargerOrderByLocationId[locationId] || [];
    const representativeChargerId = chargerIds[0] || "";
    const representativeMatrix = representativeChargerId
      ? selectDocumentReviewMatrix(draft, locationId, representativeChargerId)
      : null;
    const representativeChargerNumber = chargerNumbers.get(
      representativeChargerId,
    );
    const locationRows = representativeMatrix
      ? selectRows(representativeMatrix.rows, LOCATION_FACTS, {
        documentIdentities: identities,
        locationId,
        manualValues: corrections,
        partyKind,
        sourceBindings: {
          energy_bill_or_contract: `Locatie ${locationNumber}`,
          installation_invoice: representativeChargerNumber
            ? `Locatie ${locationNumber} · Laadpaal ${representativeChargerNumber}`
            : `Locatie ${locationNumber}`,
        },
        userBinding: `Locatie ${locationNumber}`,
      })
      : [];
    const address = locationRows.find((row) =>
      row.reviewRow?.factKey === "structuredAddress"
    )?.canonicalValue;
    const locationTitle = `Locatie ${locationNumber}${
      address ? ` · ${address}` : ""
    }`;
    locations.push({
      id: locationId,
      title: locationTitle,
      rows: locationRows,
      locationId,
    });

    const energyDocument = draft.energyDocumentsByLocationId[locationId];
    if (energyDocument) {
      documentRows.push(syntheticRow({
        id: energyDocument.clientId,
        label: "Energiecontract/-nota",
        value: documentFilename(energyDocument.file),
        sourceLabel: `Locatie ${locationNumber}`,
        resolutionState: "confirmed",
        locationId,
      }));
    }

    chargerIds.forEach((chargerId) => {
      const globalChargerNumber = chargerNumbers.get(chargerId) || 0;
      const chargerBinding =
        `Locatie ${locationNumber} · Laadpaal ${globalChargerNumber}`;
      const matrix = selectDocumentReviewMatrix(draft, locationId, chargerId);
      const chargerRows = selectRows(matrix.rows, CHARGER_FACTS, {
        chargerId,
        documentIdentities: identities,
        locationId,
        manualValues: corrections,
        partyKind,
        sourceBindings: { installation_invoice: chargerBinding },
        userBinding: chargerBinding,
      });
      const invoicePartyRow = matrix.rows.find((row) =>
        row.factKey === "partyName"
      );
      const invoiceParty = invoicePartyRow
        ? projectFactPresentationRow(invoicePartyRow, {
          chargerId,
          documentIdentities: identities,
          forceInformational: true,
          id: `charger:${chargerId}:invoice-party-name`,
          label: "Naam op installatiefactuur",
          locationId,
          manualValues: corrections,
          partyKind,
          sourceBindings: { installation_invoice: chargerBinding },
          sourceType: "installation_invoice",
          userBinding: chargerBinding,
        })
        : null;
      const linkedLocation = syntheticRow({
        id: `charger:${chargerId}:location`,
        label: "Gekoppelde locatie",
        value: locationTitle,
        sourceLabel: "Door gebruiker",
        locationId,
        chargerId,
      });
      const brand = chargerRows.find((row) =>
        row.reviewRow?.factKey === "chargerBrand"
      )?.canonicalValue;
      const model = chargerRows.find((row) =>
        row.reviewRow?.factKey === "chargerModel"
      )?.canonicalValue;
      const descriptor = clean(`${brand || ""} ${model || ""}`);
      const chargerTitle = `Laadpaal ${globalChargerNumber}${
        descriptor ? ` · ${descriptor}` : ""
      }`;
      chargers.push({
        id: chargerId,
        title: chargerTitle,
        rows: [
          linkedLocation,
          ...(invoiceParty ? [invoiceParty] : []),
          ...chargerRows,
        ],
        locationId,
        chargerId,
      });

      const chargerDocument = draft.chargerDocumentsByChargerId[chargerId]
        ?.find((document) => document.documentType === "installation_invoice");
      if (chargerDocument) {
        documentRows.push(syntheticRow({
          id: chargerDocument.clientId,
          label: "Installatiefactuur",
          value: documentFilename(chargerDocument.file),
          sourceLabel: chargerBinding,
          resolutionState: "confirmed",
          locationId,
          chargerId,
        }));
      }
    });
  });

  if (draft.accountBasis.accountType === "particulier") {
    const name = locations[0]?.rows.find((row) =>
      row.reviewRow?.factKey === "partyName"
    );
    if (name) accountRows.push({ ...name, id: "account:name", label: "Naam" });
  }

  return {
    organizationRows,
    account: { id: "account", title: "Account", rows: accountRows },
    locations,
    chargers,
    documents: { id: "documents", title: "Documenten", rows: documentRows },
  };
}
