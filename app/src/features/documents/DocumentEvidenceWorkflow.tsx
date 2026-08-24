import type { ReactNode } from "react";
import {
  DocumentEvidenceUploadCard,
  type DocumentEvidenceUploadCardProps,
} from "./DocumentEvidenceUploadCard.tsx";
import {
  type CustomerDocumentFactMatrixRow,
  DocumentFactMatrix,
} from "./DocumentFactMatrix.tsx";

export type DocumentEvidenceWorkflowGroup = Readonly<{
  id: string;
  title: string;
  rows: readonly CustomerDocumentFactMatrixRow[];
}>;

export type DocumentEvidenceWorkflowUpload = Readonly<{
  id: string;
  card: DocumentEvidenceUploadCardProps;
  itemAction?: ReactNode;
}>;

export type DocumentEvidenceWorkflowAction = Readonly<{
  label: string;
  onClick: () => void;
  disabled?: boolean;
}>;

export type DocumentEvidenceWorkflowEvidenceSlot = Readonly<{
  id: string;
  required: boolean;
  replacementRequired?: boolean;
  usableEvidenceReady: boolean;
}>;

export function allRequiredDocumentEvidenceReady(
  slots: readonly DocumentEvidenceWorkflowEvidenceSlot[],
): boolean {
  return slots.every((slot) => !slot.required || slot.usableEvidenceReady);
}

export type DocumentEvidenceWorkflowModel = Readonly<{
  id: string;
  uploads: readonly DocumentEvidenceWorkflowUpload[];
  groups: readonly DocumentEvidenceWorkflowGroup[];
  evidenceSlots?: readonly DocumentEvidenceWorkflowEvidenceSlot[];
  uploadPrelude?: ReactNode;
  uploadActions?: ReactNode;
  primaryAction?: DocumentEvidenceWorkflowAction;
  eyebrow?: string;
  title?: string;
  reviewTitle?: string;
}>;

/**
 * Shared presentation boundary for initial signup and customer correction.
 * Callers derive authority, upload behavior and row actions before rendering.
 */
export function DocumentEvidenceWorkflow({
  evidenceSlots = [],
  eyebrow = "Stap 2",
  groups,
  id,
  primaryAction,
  reviewTitle = "Controleer de documentgegevens",
  title = "Upload en controle",
  uploadActions,
  uploads,
  uploadPrelude,
}: DocumentEvidenceWorkflowModel) {
  const titleId = `${id}-title`;
  const reviewTitleId = `${id}-review-title`;
  const requiredEvidenceReady = allRequiredDocumentEvidenceReady(evidenceSlots);

  return (
    <section
      aria-labelledby={titleId}
      className="signup-section document-evidence-workflow"
      id={id}
    >
      <div className="signup-section-header">
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>

      <div className="document-location-group">
        {uploadPrelude}
        <div className="document-upload-grid">
          {uploads.map((upload) => (
            <DocumentEvidenceUploadCard
              key={upload.id}
              {...upload.card}
              action={upload.itemAction}
            />
          ))}
        </div>
        {uploadActions
          ? <div className="section-actions">{uploadActions}</div>
          : null}
      </div>

      <div
        aria-labelledby={reviewTitleId}
        className="document-evidence-workflow__review"
      >
        <div className="signup-section-header signup-section-header-compact">
          <h2 id={reviewTitleId}>{reviewTitle}</h2>
        </div>
        <div className="fact-review-groups">
          {groups.map((group) => (
            <section className="fact-review-section-item" key={group.id}>
              <h3>{group.title}</h3>
              <DocumentFactMatrix
                rows={group.rows}
                variant="customer"
              />
            </section>
          ))}
        </div>
      </div>
      {primaryAction
        ? (
          <div className="section-actions document-evidence-workflow__primary-action">
            <button
              className="button button-primary"
              disabled={primaryAction.disabled || !requiredEvidenceReady}
              onClick={primaryAction.onClick}
              type="button"
            >
              {primaryAction.label}
            </button>
          </div>
        )
        : null}
    </section>
  );
}
