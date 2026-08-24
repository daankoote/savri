import type { DocumentFactApplicability } from "../documentFactApplicability";
import type {
  CustomerDocumentEvidenceRelationship,
  DocumentFactKey,
  DocumentFactObservation,
  DocumentSemanticRole,
  DocumentSourceType,
} from "../documentFactRegistry";
import {
  customerDocumentEvidenceBindingFor,
  customerDocumentFactInstanceRowId,
  type CustomerDocumentFactRowDefinition,
  customerDocumentVisibleEvidenceBindingFor,
  selectCustomerDocumentFactRows,
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
import type { AddressDraft } from "../signupTypes";
import {
  decideDocumentFact,
  semanticRolesComparable,
} from "../documentFactDecisionPolicy";
import {
  compareCustomerDocumentFactSourceOrder,
  distinctNormalizedCustomerDocumentFactSourceValues,
  normalizeCustomerDocumentFactSourceValue,
} from "../../documents/customerDocumentFactSourceResolution.ts";
import type { CustomerDocumentWorkflowSourceInput } from "../../documents/CustomerDocumentWorkflowController.ts";
import { deriveSignupSourceRelationV1 } from "../../../../../supabase/functions/_shared/signup_resolution_provenance";
import {
  isValidDutchPostcode,
  isValidHouseNumber,
  isValidSuffix,
} from "../address/addressNormalizers";
import { hasMeaningfulManualAddress } from "../structuredAddress";

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
  semanticRole: DocumentSemanticRole;
  extractionStatus: DocumentFactObservation["extractionStatus"];
  relationship: CustomerDocumentEvidenceRelationship;
  documentIdentity?: string;
  locationId?: string;
  chargerId?: string;
};

export type FactSourceConsistency =
  | "MATCH"
  | "CONFLICT"
  | "SINGLE_SOURCE"
  | "NOT_COMPARABLE"
  | "MISSING";

export type FactPresentationRow = {
  id: string;
  label: string;
  canonicalValue: string;
  sources: FactPresentationSource[];
  workflowSources?: readonly CustomerDocumentWorkflowSourceInput[];
  sourceValues: string[];
  sourceLabels: string[];
  sourceConsistency: FactSourceConsistency;
  applicability: DocumentFactApplicability;
  resolutionState: FactResolutionState;
  resolutionReason: FactResolutionReason;
  judgment: FactPresentationJudgment;
  confirmationState: "confirmed" | "unconfirmed";
  correctionState: "manual" | "unchanged";
  correctionValue?: DocumentFirstFactValue;
  customerConfirmedValue?: DocumentFirstFactValue;
  isRequired: boolean;
  isInformational: boolean;
  actions: FactPresentationAction[];
  locationId?: string;
  chargerId?: string;
  reviewRow: DocumentReviewRow | null;
};

type FactPresentationActiveSourceSlot = Readonly<{
  sourceRef: string;
  evidenceRootRef: string;
  contentFingerprint: string | null;
  fileName: string;
  sourceDocumentType: Extract<
    DocumentSourceType,
    "energy_bill_or_contract" | "installation_invoice"
  >;
}>;

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
  sourceNames?: Record<string, string>;
  evidenceRelationships?: Record<string, CustomerDocumentEvidenceRelationship>;
  userBinding?: string;
  documentIdentities?: Record<string, string>;
  manualValue?: DocumentFirstFactValue;
  manualValues?: Record<string, DocumentFirstFactValue>;
  confirmedValues?: Record<string, DocumentFirstFactValue>;
  partyKind?: "natural_person" | "organization";
  forceInformational?: boolean;
  allowLocationDocumentForCharger?: boolean;
  activeSourceSlots?: readonly FactPresentationActiveSourceSlot[];
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

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizedValue(value: string): string {
  return normalizeCustomerDocumentFactSourceValue(clean(value));
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
    .map((candidate): FactPresentationSource => ({
      sourceId: candidate.sourceDocumentId,
      sourceType: candidate.sourceDocumentType,
      sourceLabel: options.sourceNames?.[candidate.sourceDocumentId] ||
        SOURCE_LABELS[candidate.sourceDocumentType],
      binding: options.sourceBindings?.[candidate.sourceDocumentType] ||
        SOURCE_LABELS[candidate.sourceDocumentType],
      observedValue: clean(candidate.value),
      normalizedValue: normalizedValue(clean(candidate.value)),
      semanticRole: candidate.semanticRole,
      extractionStatus: candidate.extractionStatus,
      relationship: options.evidenceRelationships?.[
        `${candidate.sourceDocumentType}:${candidate.semanticRole}`
      ] || "direct",
      documentIdentity:
        options.documentIdentities?.[candidate.sourceDocumentId] ||
        candidate.sourceDocumentId,
      locationId: options.locationId,
      chargerId: options.chargerId,
    }))
    .sort((left, right) =>
      compareCustomerDocumentFactSourceOrder({
        sourceDocumentType: left.sourceType,
        immutableSourceIdentity: left.documentIdentity || left.sourceId,
        semanticRole: left.semanticRole,
        sourceLabel: left.sourceLabel,
        value: left.observedValue,
      }, {
        sourceDocumentType: right.sourceType,
        immutableSourceIdentity: right.documentIdentity || right.sourceId,
        semanticRole: right.semanticRole,
        sourceLabel: right.sourceLabel,
        value: right.observedValue,
      })
    );
  const manualValue = options.manualValue ??
    options.manualValues?.[row.scopeKey];
  const userValue = options.forceInformational && options.sourceType
    ? ""
    : manualValue
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
      semanticRole: "unknown",
      extractionStatus: "found",
      relationship: "direct",
      locationId: options.locationId,
      chargerId: options.chargerId,
    });
  }
  return sources;
}

export function deriveFactSourceConsistency(
  _factKey: DocumentFactKey,
  sources: readonly FactPresentationSource[],
  _partyKind: "natural_person" | "organization" = "natural_person",
): FactSourceConsistency {
  const found = sources.filter((source) =>
    source.sourceType !== "user" && source.extractionStatus === "found" &&
    Boolean(source.observedValue)
  );
  if (found.length === 0) return "MISSING";
  const comparable = found.filter((source) => source.relationship === "direct");
  if (comparable.length === 0) return "NOT_COMPARABLE";
  if (comparable.length === 1) {
    return found.length === 1 ? "SINGLE_SOURCE" : "NOT_COMPARABLE";
  }
  let hasComparableSet = false;
  for (const source of comparable) {
    const sameRoleSet = comparable.filter((candidate) =>
      source.locationId === candidate.locationId &&
      source.chargerId === candidate.chargerId &&
      semanticRolesComparable(source.semanticRole, candidate.semanticRole)
    );
    if (sameRoleSet.length < 2) continue;
    hasComparableSet = true;
    if (
      distinctNormalizedCustomerDocumentFactSourceValues(
        sameRoleSet.map((candidate) => candidate.observedValue),
      ).length >= 2
    ) return "CONFLICT";
  }
  return hasComparableSet ? "MATCH" : "NOT_COMPARABLE";
}

function sourceRelation(
  factKey: DocumentFactKey,
  sources: FactPresentationSource[],
  partyKind: "natural_person" | "organization",
): ReturnType<typeof deriveSignupSourceRelationV1> {
  return deriveSignupSourceRelationV1({
    factKey,
    partyKind,
    sources: sources.filter((source) =>
      source.sourceType !== "user" && source.extractionStatus === "found" &&
      Boolean(source.observedValue) && source.relationship === "direct"
    ).map(
      (source) => ({
        identity: source.documentIdentity || source.sourceId,
        observedValue: source.observedValue,
      }),
    ),
  });
}

function resolveRow(
  row: DocumentReviewRow,
  sources: FactPresentationSource[],
  manualValue: DocumentFirstFactValue | undefined,
  partyKind: "natural_person" | "organization",
): { state: FactResolutionState; reason: FactResolutionReason } {
  const documents = sources.filter((source) =>
    source.sourceType !== "user" && source.extractionStatus === "found" &&
    Boolean(source.observedValue) && source.relationship === "direct"
  );
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
  if (relation === "equal") return { state: "pending", reason: null };
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
  const sourceCandidate =
    sources.find((source) =>
      source.sourceType !== "user" && source.extractionStatus === "found" &&
      source.relationship === "direct"
    )?.observedValue || "";
  const candidateValue = options.forceInformational && options.sourceType
    ? sourceCandidate
    : visibleValue(row) || sourceCandidate;
  if (isInformational && !candidateValue) return null;
  const canonicalValue = resolution.state === "blocked" ? "" : candidateValue;
  return {
    id: options.id || row.scopeKey,
    label: options.label || row.label,
    canonicalValue,
    sources,
    sourceValues: sources.map((source) => source.observedValue),
    sourceLabels: sources.map((source) => source.sourceLabel),
    sourceConsistency: deriveFactSourceConsistency(
      row.factKey,
      sources,
      partyKind,
    ),
    applicability: isInformational ? "informational" : row.applicability,
    resolutionState: resolution.state,
    resolutionReason: resolution.reason,
    judgment: judgment(resolution.state),
    confirmationState: row.confirmed ? "confirmed" : "unconfirmed",
    correctionState: row.correctedManually ? "manual" : "unchanged",
    correctionValue: manualValue,
    customerConfirmedValue: options.confirmedValues?.[row.scopeKey],
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
    semanticRole: "unknown",
    extractionStatus: "found",
    relationship: "direct",
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
    sourceConsistency: value ? "SINGLE_SOURCE" : "MISSING",
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
    customerConfirmedValue: undefined,
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
  definitions: readonly CustomerDocumentFactRowDefinition[],
  scopeRef: string,
  options: Omit<RowProjectionOptions, "id" | "label">,
): FactPresentationRow[] {
  return definitions.flatMap((definition) => {
    const row = rows.find((candidate) =>
      candidate.factKey === definition.factKey
    );
    if (!row) return [];
    const bindingFor = (observation: DocumentFactObservation) =>
      customerDocumentEvidenceBindingFor(definition, observation);
    const scopedObservations = row.observations.filter((observation) =>
      Boolean(bindingFor(observation)) &&
      !(definition.group === "charger" &&
        observation.sourceDocumentType === "energy_bill_or_contract" &&
        options.allowLocationDocumentForCharger !== true)
    );
    const decisionObservations = scopedObservations.filter((observation) =>
      bindingFor(observation)?.relationship === "direct"
    );
    const decision = decideDocumentFact({
      factKey: row.factKey,
      declaredValue: row.declared.value,
      observations: decisionObservations,
      correctedValue: row.correctedManually ? visibleValue(row) : null,
      confirmedValue: row.confirmed ? visibleValue(row) : null,
      partyKind: options.partyKind,
    });
    const scopedRow: DocumentReviewRow = {
      ...row,
      scopeKey: row.scopeKey,
      observations: scopedObservations,
      sourceDocuments: scopedObservations.map((observation) => ({
        documentId: observation.sourceDocumentId,
        documentType: observation.sourceDocumentType,
      })),
      decisionStatus: decision.status,
      decisionReason: decision.reason,
      canonicalValue: decision.canonicalValue,
      proposedValue: decision.canonicalValue,
      choices: Object.freeze([
        ...new Set(
          scopedObservations.flatMap((observation) =>
            observation.displayable && observation.value
              ? [clean(observation.value)]
              : []
          ),
        ),
      ]),
      correctedManually: row.correctedManually,
      confirmed: row.confirmed,
      normalizationApplied: decision.normalizationApplied,
      blocksProgress: decision.blocksProgress,
    };
    const projected = projectFactPresentationRow(scopedRow, {
      ...options,
      evidenceRelationships: Object.fromEntries(
        definition.evidenceBindings.flatMap((binding) =>
          binding.semanticRoles.map((semanticRole) => [
            `${binding.sourceDocumentType}:${semanticRole}`,
            binding.relationship,
          ])
        ),
      ),
      id: customerDocumentFactInstanceRowId(definition, scopeRef),
      label: definition.label,
    });
    if (!projected) return [];
    const workflowSources = options.activeSourceSlots
      ? options.activeSourceSlots.flatMap((slot) => {
          const observed = projected.sources.find((source) =>
            source.sourceType !== "user" &&
            source.sourceId === slot.sourceRef &&
            source.extractionStatus === "found" &&
            Boolean(source.observedValue) &&
            source.relationship !== "provenance_only"
          );
          const displayBinding = observed
            ? customerDocumentEvidenceBindingFor(definition, {
              sourceDocumentType: slot.sourceDocumentType,
              semanticRole: observed.semanticRole,
            })
            : customerDocumentVisibleEvidenceBindingFor(
              definition,
              slot.sourceDocumentType,
            );
          if (!displayBinding) return [];
          return [Object.freeze({
            sourceRef: observed
              ? `${observed.sourceId}:${observed.binding}`
              : `${slot.sourceRef}:${definition.id}`,
            evidenceRootRef: slot.evidenceRootRef,
            contentFingerprint: slot.contentFingerprint,
            fileName: slot.fileName,
            sourceDocumentType: slot.sourceDocumentType,
            semanticRole: observed?.semanticRole ||
              displayBinding.semanticRoles[0],
            relationship: observed?.relationship ||
              displayBinding.relationship,
            observedValue: observed?.observedValue || null,
            current: true,
          })];
        })
      : undefined;
    const activeProjected = workflowSources
      ? { ...projected, workflowSources }
      : projected;
    return activeProjected.sourceConsistency === "CONFLICT"
      ? [{
        ...activeProjected,
        resolutionState: "review_required" as const,
        resolutionReason: "unresolved_document_conflict" as const,
        judgment: "ENVAL-controle nodig" as const,
      }]
      : [activeProjected];
  });
}

function mergeReviewRows(
  matrices: readonly DocumentReviewRow[][],
): DocumentReviewRow[] {
  const byFactKey = new Map<DocumentFactKey, DocumentReviewRow>();
  for (const rows of matrices) {
    for (const row of rows) {
      const current = byFactKey.get(row.factKey);
      if (!current) {
        byFactKey.set(row.factKey, row);
        continue;
      }
      const observations = [...current.observations, ...row.observations];
      const unique = [...new Map(observations.map((observation) => [
        [
          observation.sourceDocumentId,
          observation.factKey,
          observation.semanticRole,
          observation.extractionStatus,
          observation.value || "",
        ].join(":"),
        observation,
      ])).values()];
      byFactKey.set(row.factKey, {
        ...current,
        observations: unique,
        sourceDocuments: [...new Map(unique.map((observation) => [
          observation.sourceDocumentId,
          {
            documentId: observation.sourceDocumentId,
            documentType: observation.sourceDocumentType,
          },
        ])).values()],
      });
    }
  }
  return [...byFactKey.values()];
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
  const sourceNames = Object.fromEntries([
    [
      draft.organizationDocument.clientId,
      documentFilename(draft.organizationDocument.file),
    ],
    ...Object.values(draft.energyDocumentsByLocationId).map((document) => [
      document.clientId,
      documentFilename(document.file),
    ]),
    ...Object.values(draft.chargerDocumentsByChargerId).flat().map((
      document,
    ) => [
      document.clientId,
      documentFilename(document.file),
    ]),
  ]);
  const activeSourceSlot = (
    document: Readonly<{ clientId: string; file: File | null }>,
    sourceDocumentType: FactPresentationActiveSourceSlot["sourceDocumentType"],
  ): FactPresentationActiveSourceSlot | null =>
    document.file
      ? Object.freeze({
        sourceRef: document.clientId,
        evidenceRootRef: identities[document.clientId] || document.clientId,
        contentFingerprint: identities[document.clientId] || null,
        fileName: sourceNames[document.clientId],
        sourceDocumentType,
      })
      : null;
  const corrections = manualValues(draft);
  const confirmedValues = Object.fromEntries(
    Object.entries(draft.customerConfirmations).map(([key, confirmation]) => [
      key,
      confirmation.value,
    ]),
  );
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
      sourceNames,
      manualValues: corrections,
      confirmedValues,
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
    const energyDocument = draft.energyDocumentsByLocationId[locationId];
    const locationActiveSourceSlots = [
      energyDocument
        ? activeSourceSlot(energyDocument, "energy_bill_or_contract")
        : null,
      ...chargerIds.map((chargerId) => {
        const document = draft.chargerDocumentsByChargerId[chargerId]?.find(
          (candidate) => candidate.documentType === "installation_invoice",
        );
        return document
          ? activeSourceSlot(document, "installation_invoice")
          : null;
      }),
    ].filter((slot): slot is FactPresentationActiveSourceSlot => Boolean(slot));
    const locationMatrices = chargerIds.map((chargerId) =>
      selectDocumentReviewMatrix(draft, locationId, chargerId)
    );
    const locationRows = locationMatrices.length > 0
      ? selectRows(
        mergeReviewRows(locationMatrices.map((matrix) => matrix.rows)),
        selectCustomerDocumentFactRows("location"),
        locationId,
        {
          documentIdentities: identities,
          activeSourceSlots: locationActiveSourceSlots,
          sourceNames,
          locationId,
          manualValues: corrections,
          confirmedValues,
          partyKind,
          sourceBindings: {
            energy_bill_or_contract: `Locatie ${locationNumber}`,
            installation_invoice: `Locatie ${locationNumber}`,
          },
          userBinding: `Locatie ${locationNumber}`,
        },
      )
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
      const chargerDocument = draft.chargerDocumentsByChargerId[chargerId]
        ?.find((document) =>
          document.documentType === "installation_invoice"
        );
      const chargerActiveSourceSlots = [
        chargerDocument
          ? activeSourceSlot(chargerDocument, "installation_invoice")
          : null,
        chargerIds.length === 1 && energyDocument
          ? activeSourceSlot(energyDocument, "energy_bill_or_contract")
          : null,
      ].filter((slot): slot is FactPresentationActiveSourceSlot =>
        Boolean(slot)
      );
      const chargerDefinitions = selectCustomerDocumentFactRows("charger");
      const chargerRows = selectRows(
        matrix.rows,
        chargerDefinitions,
        chargerId,
        {
          chargerId,
          documentIdentities: identities,
          activeSourceSlots: chargerActiveSourceSlots,
          sourceNames,
          locationId,
          manualValues: corrections,
          confirmedValues,
          partyKind,
          allowLocationDocumentForCharger: chargerIds.length === 1,
          sourceBindings: { installation_invoice: chargerBinding },
          userBinding: chargerBinding,
        },
      );
      const brand = chargerRows.find((row) =>
        row.reviewRow?.factKey === "chargerBrand"
      )?.canonicalValue;
      const model = chargerRows.find((row) =>
        row.reviewRow?.factKey === "chargerModel"
      )?.canonicalValue;
      const descriptor = clean(`${brand || ""} ${model || ""}`);
      const chargerTitle =
        `Laadpaal ${globalChargerNumber} · Locatie ${locationNumber}${
          descriptor ? ` · ${descriptor}` : ""
        }`;
      chargers.push({
        id: chargerId,
        title: chargerTitle,
        rows: chargerRows,
        locationId,
        chargerId,
      });

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
