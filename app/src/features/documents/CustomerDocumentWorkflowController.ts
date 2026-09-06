import type { DocumentFirstFactValue } from "../signup/documentFirstSignupModel.ts";
import { createElement, type ReactNode } from "react";
import {
  customerDocumentFactInstanceRowId,
  type CustomerDocumentEvidenceRelationship,
  type CustomerDocumentFactGroup,
  type DocumentFactKey,
  type DocumentSemanticRole,
  type DocumentSourceType,
  selectCustomerDocumentFactRows,
} from "../signup/documentFactRegistry.ts";
import type {
  CustomerDocumentFactInteractionModel,
  CustomerFacingEnvalRoute,
} from "./CustomerDocumentFactInteraction.tsx";
import type {
  CustomerDocumentFactActiveSource,
  CustomerDocumentFactActiveSourceInput,
} from "./customerDocumentFactActiveSourceProjector.ts";
import { projectCustomerDocumentFactActiveSources } from "./customerDocumentFactActiveSourceProjector.ts";
import {
  normalizeCustomerDocumentFactSourceValue,
  resolveCustomerFactResolutionPolicy,
  type CustomerFactBrowserResolution,
} from "./customerDocumentFactSourceResolution.ts";
import type { CustomerDocumentFactMatrixRow } from "./DocumentFactMatrix.tsx";
import type {
  DocumentEvidenceUploadCardProps,
  DocumentEvidenceUploadState,
  DocumentEvidenceUploadStatus,
} from "./DocumentEvidenceUploadCard.tsx";
import type {
  DocumentEvidenceWorkflowGroup,
  DocumentEvidenceWorkflowModel,
} from "./DocumentEvidenceWorkflow.tsx";

export type CustomerDocumentWorkflowSourceInput = Readonly<{
  sourceRef: string;
  evidenceRootRef: string;
  contentFingerprint?: string | null;
  fileName: string;
  sourceDocumentType: Exclude<DocumentSourceType, "organization_extract">;
  semanticRole: DocumentSemanticRole;
  relationship: CustomerDocumentEvidenceRelationship | null;
  observedValue: string | null;
  current?: boolean;
}>;

export type CustomerDocumentWorkflowFactInput = Readonly<{
  factKey: DocumentFactKey;
  given?: ReactNode;
  hidden?: boolean;
  sources: readonly CustomerDocumentWorkflowSourceInput[];
  editable: boolean;
  browserResolution: CustomerFactBrowserResolution;
  actualReviewTruth: "Nog te beoordelen" | "Akkoord" | "Correctie nodig";
  customerValue?: DocumentFirstFactValue;
  currentValue?: string;
  selectedSourceRef?: string;
  emptyValue: DocumentFirstFactValue;
  editor: "text" | "address";
  locationId?: string;
  maxLength?: number;
  isValid: (value: DocumentFirstFactValue) => boolean;
  normalize?: (value: DocumentFirstFactValue) => DocumentFirstFactValue;
  formatValue?: (value: DocumentFirstFactValue) => string;
  onConfirm?: (
    value: DocumentFirstFactValue,
    resolution: "source" | "manual",
  ) => void;
  onCancel?: (sourceValue?: DocumentFirstFactValue) => void;
  onRestoreSource?: (sourceValue?: DocumentFirstFactValue) => void;
  onSelectSource?: (
    source: CustomerDocumentFactActiveSource,
  ) => void;
}>;

export type CustomerDocumentWorkflowResolvedFact = Readonly<{
  factKey: DocumentFactKey;
  row: CustomerDocumentFactMatrixRow;
  sources: readonly CustomerDocumentFactActiveSource[];
  resolutionType:
    | "SOURCE_CONFIRMED"
    | "SOURCE_CONFLICT_SELECTED"
    | "MANUAL"
    | null;
}>;

export type CustomerDocumentWorkflowControllerResult = Readonly<{
  group: DocumentEvidenceWorkflowGroup;
  facts: readonly CustomerDocumentWorkflowResolvedFact[];
}>;

export type CustomerDocumentWorkflowGroupInput = Readonly<{
  group: CustomerDocumentFactGroup;
  scopeRef: string;
  title: string;
  evidenceReady: boolean;
  facts: readonly CustomerDocumentWorkflowFactInput[];
}>;

export function customerDocumentUploadStatus(
  state: DocumentEvidenceUploadState,
  errorMessage = "Upload mislukt.",
): DocumentEvidenceUploadStatus {
  return Object.freeze({
    state,
    label: state === "EMPTY"
      ? "Geen document gekozen"
      : state === "UPLOADING"
      ? "Uploaden…"
      : state === "PARSING"
      ? "Controleren…"
      : state === "READY"
      ? "Document beschikbaar"
      : errorMessage,
  });
}

export type CustomerDocumentWorkflowUploadCardInput = Readonly<{
  state: DocumentEvidenceUploadState;
  title: string;
  scope?: string;
  fileName?: string;
  disabled?: boolean;
  helpText?: string;
  accept?: string;
  errorMessage?: string;
  statusLabel?: string;
  inputAriaDescribedBy?: string;
  inputAriaInvalid?: boolean;
  messages?: ReactNode;
  onFileChange: (file: File | null) => void;
  validateFile?: (file: File) => string | null;
  onRemove?: () => void;
  onRetry?: () => void;
}>;

export function createCustomerDocumentUploadCardModel(
  input: CustomerDocumentWorkflowUploadCardInput,
): DocumentEvidenceUploadCardProps {
  const status = customerDocumentUploadStatus(
    input.state,
    input.errorMessage,
  );
  const disabled = input.disabled === true;
  return Object.freeze({
    accept: input.accept,
    actions: input.onRetry
      ? createElement(
        "button",
        {
          className: "button button-secondary button-compact",
          onClick: input.onRetry,
          type: "button",
        },
        "Opnieuw proberen",
      )
      : undefined,
    disabled,
    fileAction: input.fileName && input.onRemove
      ? createElement(
        "button",
        {
          className: "button button-ghost button-compact",
          disabled,
          onClick: input.onRemove,
          type: "button",
        },
        "Verwijderen",
      )
      : undefined,
    fileName: input.fileName,
    helpText: input.helpText,
    inputAriaDescribedBy: input.inputAriaDescribedBy,
    inputAriaInvalid: input.inputAriaInvalid,
    messages: input.messages,
    onFileChange: input.onFileChange,
    scope: input.scope,
    status: input.statusLabel
      ? Object.freeze({ ...status, label: input.statusLabel })
      : status,
    title: input.title,
    validateFile: input.validateFile,
  });
}

export function createCustomerDocumentWorkflowModel(
  input: DocumentEvidenceWorkflowModel,
): DocumentEvidenceWorkflowModel {
  return Object.freeze({
    ...input,
    evidenceSlots: Object.freeze([...(input.evidenceSlots || [])]),
    groups: Object.freeze([...input.groups]),
    uploads: Object.freeze([...input.uploads]),
  });
}

function activeSourceInputs(
  fact: CustomerDocumentWorkflowFactInput,
  definitionId: string,
  scopeRef: string,
): readonly CustomerDocumentFactActiveSourceInput[] {
  return fact.sources.map((source) => Object.freeze({
    ...source,
    canonicalFactKey: fact.factKey,
    scopeRef,
    comparisonRole: definitionId,
    current: source.current !== false,
  }));
}

function resolvedType(
  resolution: CustomerFactBrowserResolution,
): CustomerDocumentWorkflowResolvedFact["resolutionType"] {
  if (resolution === "CLEAN_SOURCE_CONFIRMED") return "SOURCE_CONFIRMED";
  if (resolution === "CONFLICT_SOURCE_SELECTED") {
    return "SOURCE_CONFLICT_SELECTED";
  }
  if (resolution === "MANUAL_CONFIRMED") return "MANUAL";
  return null;
}

export function createCustomerDocumentWorkflowGroup(
  input: CustomerDocumentWorkflowGroupInput,
): CustomerDocumentWorkflowControllerResult {
  const factByKey = new Map(input.facts.map((fact) => [fact.factKey, fact]));
  const facts = selectCustomerDocumentFactRows(input.group).flatMap(
    (definition): CustomerDocumentWorkflowResolvedFact[] => {
      const fact = factByKey.get(definition.factKey);
      if (!fact) return [];
      const sources = projectCustomerDocumentFactActiveSources(
        activeSourceInputs(fact, definition.id, input.scopeRef),
      ).matrixSources;
      const policy = resolveCustomerFactResolutionPolicy({
        canonicalFactKey: definition.factKey,
        scopeRef: input.scopeRef,
        comparisonRole: definition.id,
        editable: fact.editable,
        evidenceReady: input.evidenceReady,
        browserResolution: fact.browserResolution,
        actualReviewTruth: fact.actualReviewTruth,
        sources,
      });
      const directSources = sources.filter((source) => source.direct);
      const suggestedValue = directSources.find((source) => source.usable)
        ?.observedValue || undefined;
      const sourceValue = policy.cleanConfirmAvailable && suggestedValue &&
          (!fact.currentValue ||
            normalizeCustomerDocumentFactSourceValue(suggestedValue) !==
              normalizeCustomerDocumentFactSourceValue(fact.currentValue))
        ? suggestedValue
        : undefined;
      const rowId = customerDocumentFactInstanceRowId(
        definition,
        input.scopeRef,
      );
      const interaction: CustomerDocumentFactInteractionModel = {
        id: rowId + ":" +
          sources.map((source) =>
            source.sourceRef + ":" + source.observedValue + ":" + source.usable
          ).join("|"),
        label: definition.label,
        state: policy.interactionState,
        projectedEnvalRoute:
          policy.projectedEnvalRoute as CustomerFacingEnvalRoute,
        sourceValue,
        suggestedValue,
        customerValue: fact.customerValue ??
          (policy.interactionState === "SOURCE_CONFIRMED"
            ? sourceValue
            : undefined),
        canRestoreSources: directSources.some((source) => source.usable),
        emptyValue: fact.emptyValue,
        editor: fact.editor,
        locationId: fact.locationId,
        maxLength: fact.maxLength,
        isValid: fact.isValid,
        normalize: fact.normalize,
        formatValue: fact.formatValue,
        onConfirm: fact.editable ? fact.onConfirm : undefined,
        onCancelResolution: fact.editable && fact.onCancel
          ? () => fact.onCancel?.(sourceValue)
          : undefined,
        onRestoreSource: fact.editable &&
            directSources.some((source) => source.usable)
          ? () => fact.onRestoreSource?.(sourceValue)
          : undefined,
      };
      const matrixSources = sources.map((source) => {
        const selected = interaction.state === "SOURCE_CONFIRMED" &&
          (source.direct || source.supporting) && source.value !== null &&
          (fact.selectedSourceRef
            ? fact.selectedSourceRef === source.sourceRef ||
              fact.selectedSourceRef === source.id
            : sourceValue !== undefined &&
              normalizeCustomerDocumentFactSourceValue(source.value) ===
                normalizeCustomerDocumentFactSourceValue(sourceValue));
        const selectable = policy.conflictChoiceAvailable &&
          (source.direct || source.supporting) && source.value !== null &&
          Boolean(fact.onSelectSource);
        return Object.freeze({
          id: source.sourceRef,
          fileName: source.fileName,
          value: source.value,
          relationship: source.relationship,
          selected,
          selectable,
          onSelect: selectable
            ? () => fact.onSelectSource?.(source)
            : undefined,
        });
      });
      const row = Object.freeze({
        id: rowId,
        hidden: fact.hidden,
        given: fact.given ?? definition.label,
        sources: Object.freeze(matrixSources),
        customer: Object.freeze(interaction),
        enval: policy.projectedEnvalRoute,
      });
      return [Object.freeze({
        factKey: definition.factKey,
        row,
        sources,
        resolutionType: resolvedType(fact.browserResolution),
      })];
    },
  );
  return Object.freeze({
    group: Object.freeze({
      id: "customer-" + input.group + ":" + input.scopeRef,
      title: input.title,
      rows: Object.freeze(facts.map((fact) => fact.row)),
    }),
    facts: Object.freeze(facts),
  });
}
