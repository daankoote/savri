import {
  CustomerDocumentFactInteraction,
  type CustomerDocumentFactInteractionModel,
} from "../../documents/CustomerDocumentFactInteraction";
import type { DocumentFirstFactValue } from "../documentFirstSignupModel";
import type { DocumentReviewRow } from "../documentReviewMatrix";
import { createAddressDraft } from "../signupNormalizers";
import {
  type FactPresentationRow,
  type FactPresentationSource,
  isValidFactCorrectionValue,
} from "./factPresentationModel";
import { formatStructuredDutchAddress } from "../structuredAddress";
import {
  type CustomerDocumentFactActiveSource,
  projectCustomerDocumentFactActiveSources,
} from "../../documents/customerDocumentFactActiveSourceProjector.ts";
import {
  createCustomerDocumentWorkflowGroup,
  type CustomerDocumentWorkflowFactInput,
  type CustomerDocumentWorkflowSourceInput,
} from "../../documents/CustomerDocumentWorkflowController.ts";

type FactReviewControlsProps = {
  row: FactPresentationRow;
  onConfirm?: (
    row: DocumentReviewRow,
    value?: DocumentFirstFactValue,
  ) => void;
  onCorrect?: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onInvalidateConfirmation?: (row: DocumentReviewRow) => void;
  onReplaceDocument?: (row: DocumentReviewRow) => void;
  onRestoreSource?: (row: DocumentReviewRow) => void;
  onSelectSource?: (
    row: DocumentReviewRow,
    source: FactPresentationSource,
  ) => void;
};

export function createSignupCustomerInteractionModel({
  activeSources,
  evidenceReady = true,
  onConfirm,
  onCorrect,
  onInvalidateConfirmation,
  onRestoreSource,
  onSelectSource,
  row,
}:
  & Omit<FactReviewControlsProps, "onReplaceDocument">
  & Readonly<{
    activeSources?: readonly CustomerDocumentFactActiveSource[];
    evidenceReady?: boolean;
  }>
):
  | CustomerDocumentFactInteractionModel
  | null {
  const fact = createSignupCustomerWorkflowFactInput({
    activeSources,
    onConfirm,
    onCorrect,
    onInvalidateConfirmation,
    onRestoreSource,
    onSelectSource,
    row,
  });
  if (!fact) return null;
  const group = row.chargerId ? "charger" : "location";
  const scopeRef = row.chargerId || row.locationId || row.reviewRow?.scopeKey ||
    row.id;
  const controlled = createCustomerDocumentWorkflowGroup({
    group,
    scopeRef,
    title: row.label,
    evidenceReady,
    facts: [fact],
  });
  return controlled.facts.find((entry) =>
    entry.factKey === fact.factKey
  )?.row.customer || null;
}

function sourceInputsForSignupRow(
  row: FactPresentationRow,
  activeSources?: readonly CustomerDocumentFactActiveSource[],
): readonly CustomerDocumentWorkflowSourceInput[] {
  if (activeSources) {
    return activeSources.map((source) => Object.freeze({
      sourceRef: source.sourceRef,
      evidenceRootRef: source.evidenceRootRef,
      contentFingerprint: source.contentFingerprint,
      fileName: source.fileName,
      sourceDocumentType: source.sourceDocumentType,
      semanticRole: source.semanticRole,
      relationship: source.relationship,
      observedValue: source.observedValue,
      current: source.current,
    }));
  }
  if (row.workflowSources) return row.workflowSources;
  return Object.freeze(row.sources.flatMap((source) =>
    source.sourceType === "user" ||
      source.sourceType === "organization_extract"
      ? []
      : [Object.freeze({
        sourceRef: `${source.sourceId}:${source.binding}`,
        evidenceRootRef: source.documentIdentity || source.sourceId,
        contentFingerprint: source.documentIdentity || null,
        fileName: source.sourceLabel,
        sourceDocumentType: source.sourceType,
        semanticRole: source.semanticRole,
        relationship: source.relationship,
        observedValue: source.extractionStatus === "found"
          ? source.observedValue || null
          : null,
        current: true,
      })]
  ));
}

export function createSignupCustomerWorkflowFactInput({
  activeSources,
  onConfirm,
  onCorrect,
  onInvalidateConfirmation,
  onRestoreSource,
  onSelectSource,
  row,
}: Omit<FactReviewControlsProps, "onReplaceDocument"> & Readonly<{
  activeSources?: readonly CustomerDocumentFactActiveSource[];
}>): CustomerDocumentWorkflowFactInput | null {
  const reviewRow = row.reviewRow;
  if (!reviewRow) return null;
  const confirmed = row.confirmationState === "confirmed";
  return Object.freeze({
    factKey: reviewRow.factKey,
    hidden: row.applicability === "not_applicable",
    sources: sourceInputsForSignupRow(row, activeSources),
    editable: Boolean(onCorrect),
    browserResolution: confirmed
      ? row.correctionState === "manual"
        ? "MANUAL_CONFIRMED"
        : row.sourceConsistency === "CONFLICT"
        ? "CONFLICT_SOURCE_SELECTED"
        : "CLEAN_SOURCE_CONFIRMED"
      : "UNRESOLVED",
    actualReviewTruth: "Correctie nodig",
    customerValue: row.customerConfirmedValue ?? row.correctionValue,
    emptyValue: reviewRow.factKey === "structuredAddress"
      ? createAddressDraft()
      : "",
    editor: reviewRow.factKey === "structuredAddress" ? "address" : "text",
    locationId: row.locationId,
    isValid: (value) => isValidFactCorrectionValue(reviewRow.factKey, value),
    normalize: (value) => typeof value === "string" ? value.trim() : value,
    formatValue: (value) =>
      typeof value === "string" ? value : formatStructuredDutchAddress({
        street: value.street,
        houseNumber: value.houseNumber,
        houseNumberAddition: value.suffix,
        postalCode: value.postcode,
        city: value.city,
        country: value.country,
      }),
    onConfirm: onConfirm && onCorrect
      ? (value, resolution) => {
        if (resolution === "source") {
          onConfirm(reviewRow, value);
          return;
        }
        onCorrect(reviewRow, value);
      }
      : undefined,
    onCancel: onRestoreSource
      ? () => onRestoreSource(reviewRow)
      : onInvalidateConfirmation
      ? () => onInvalidateConfirmation(reviewRow)
      : undefined,
    onRestoreSource: onRestoreSource
      ? () => onRestoreSource(reviewRow)
      : undefined,
    onSelectSource: onSelectSource
      ? (source) => {
        const presentationSource = row.sources.find((candidate) =>
          `${candidate.sourceId}:${candidate.binding}` === source.sourceRef
        );
        if (presentationSource) onSelectSource(reviewRow, presentationSource);
      }
      : undefined,
  });
}

export function projectSignupCustomerActiveSources(
  row: FactPresentationRow,
): readonly CustomerDocumentFactActiveSource[] {
  const reviewRow = row.reviewRow;
  if (!reviewRow) return Object.freeze([]);
  return projectCustomerDocumentFactActiveSources(
    sourceInputsForSignupRow(row).map((source) => Object.freeze({
      ...source,
      canonicalFactKey: reviewRow.factKey,
      scopeRef: row.chargerId || row.locationId || reviewRow.scopeKey,
      comparisonRole: row.id.split(":").slice(0, 2).join(":"),
      current: source.current !== false,
    })),
  ).matrixSources;
}

export function FactReviewControls({
  onConfirm,
  onCorrect,
  onInvalidateConfirmation,
  onReplaceDocument,
  onRestoreSource,
  onSelectSource,
  row,
}: FactReviewControlsProps) {
  const model = createSignupCustomerInteractionModel({
    onConfirm,
    onCorrect,
    onInvalidateConfirmation,
    onRestoreSource,
    onSelectSource,
    row,
  });
  if (model) return <CustomerDocumentFactInteraction model={model} />;
  const reviewRow = row.reviewRow;
  return reviewRow && row.actions.includes("replace-document") &&
      onReplaceDocument
    ? (
      <button
        className="button button-secondary button-compact"
        onClick={() => onReplaceDocument(reviewRow)}
        type="button"
      >
        Document vervangen
      </button>
    )
    : null;
}
