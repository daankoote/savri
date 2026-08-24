import type { DocumentFirstFactValue } from "./documentFirstSignupModel";
import type { DocumentReviewRow } from "./documentReviewMatrix";
import { createCustomerDocumentWorkflowGroup } from "../documents/CustomerDocumentWorkflowController.ts";
import { createSignupCustomerWorkflowFactInput } from "./presentation/FactReviewControls.tsx";
import type { FactPresentationSection } from "./presentation/factPresentationModel";
import type { FactPresentationSource } from "./presentation/factPresentationModel";
import type { DocumentEvidenceWorkflowGroup } from "../documents/DocumentEvidenceWorkflow.tsx";

type DocumentFirstCheckMatrixProps = {
  evidenceReady: boolean;
  locations: FactPresentationSection[];
  chargers: FactPresentationSection[];
  onConfirm: (
    row: DocumentReviewRow,
    value?: DocumentFirstFactValue,
  ) => void;
  onCorrect: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onInvalidateConfirmation: (row: DocumentReviewRow) => void;
  onReplaceDocument: (row: DocumentReviewRow) => void;
  onRestoreSource: (row: DocumentReviewRow) => void;
  onSelectSource: (
    row: DocumentReviewRow,
    source: FactPresentationSource,
  ) => void;
};

export function createDocumentFirstWorkflowGroups({
  chargers,
  evidenceReady,
  locations,
  onConfirm,
  onCorrect,
  onInvalidateConfirmation,
  onRestoreSource,
  onSelectSource,
}: DocumentFirstCheckMatrixProps): DocumentEvidenceWorkflowGroup[] {
  return locations.flatMap((location) => [
    location,
    ...chargers.filter((charger) => charger.locationId === location.locationId),
  ]).map((section) => {
    const group = section.chargerId ? "charger" as const : "location" as const;
    const scopeRef = section.chargerId || section.locationId || section.id;
    const facts = section.rows.flatMap((row) => {
      const fact = createSignupCustomerWorkflowFactInput({
        onConfirm,
        onCorrect,
        onInvalidateConfirmation,
        onRestoreSource,
        onSelectSource,
        row,
      });
      return fact ? [fact] : [];
    });
    return createCustomerDocumentWorkflowGroup({
      group,
      scopeRef,
      title: section.title,
      evidenceReady,
      facts,
    }).group;
  });
}
