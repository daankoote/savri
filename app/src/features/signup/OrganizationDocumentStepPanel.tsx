import { DocumentUploadSlot } from "./DocumentUploadSlot";
import type { DocumentFirstFactValue } from "./documentFirstSignupModel";
import type { DocumentReviewRow } from "./documentReviewMatrix";
import { FactTable } from "./presentation/FactTable";
import type { FactPresentationRow } from "./presentation/factPresentationModel";
import type { AccountDocumentDraft } from "./signupTypes";

type OrganizationDocumentStepPanelProps = {
  document: AccountDocumentDraft;
  hasObservation: boolean;
  onConfirm: (row: DocumentReviewRow) => void;
  onCorrect: (row: DocumentReviewRow, value: DocumentFirstFactValue) => void;
  onDocumentChange: (document: AccountDocumentDraft) => void;
  rows: FactPresentationRow[];
};

export function OrganizationDocumentStepPanel({
  document,
  hasObservation,
  onConfirm,
  onCorrect,
  onDocumentChange,
  rows,
}: OrganizationDocumentStepPanelProps) {
  const helpText = document.parseStatus === "parsing"
    ? "Documentgegevens worden lokaal uitgelezen…"
    : document.file && !hasObservation
    ? "Geen gegevens gevonden."
    : "Upload één uittreksel voor dit zakelijke of VvE-account.";

  return (
    <div className="document-groups" id="organization-document-upload">
      <DocumentUploadSlot
        document={document}
        documentBinding="Account"
        helpText={helpText}
        onChange={onDocumentChange}
        scope="Accountdocument"
        title="KvK-uittreksel"
      />
      {document.file && rows.length > 0
        ? (
          <section className="fact-review-section">
            <h3>Controleer de organisatiegegevens</h3>
            <FactTable
              onConfirm={onConfirm}
              onCorrect={onCorrect}
              rows={rows}
              variant="review"
            />
          </section>
        )
        : null}
    </div>
  );
}
