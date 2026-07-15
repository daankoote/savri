import { useId, useState, type ChangeEvent } from "react";
import type { DashboardDocumentSlot } from "../dashboard/dashboardTypes.ts";
import { downloadCurrentDocument } from "./documentDownloadClient.ts";
import {
  createDocumentWithdrawIdempotencyKey,
  withdrawCurrentDocument,
} from "./documentWithdrawClient.ts";
import {
  documentSlotRequirednessLabel,
  getDocumentSlotDefinition,
  getDocumentSlotStatusPresentation,
} from "./documentSlotPresentation.ts";
import { isPdfUploadFile, useDocumentSlotUpload } from "./useDocumentSlotUpload.ts";

export type DocumentUploadCardProps = {
  accessToken: string | null;
  documentChangesAllowed: boolean;
  onRefreshSelectedDossier: () => Promise<boolean>;
  selectedDossierId: string | null;
  slot: DashboardDocumentSlot;
  title: string;
};

export function DocumentUploadCard({
  accessToken,
  documentChangesAllowed,
  onRefreshSelectedDossier,
  selectedDossierId,
  slot,
  title,
}: DocumentUploadCardProps) {
  const inputId = useId();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawState, setWithdrawState] = useState<"idle" | "withdrawing" | "refresh_failed">("idle");
  const definition = getDocumentSlotDefinition(slot.document_type);
  const status = getDocumentSlotStatusPresentation(slot);
  const hasCurrentDocument = !!slot.current_file_name;
  const upload = useDocumentSlotUpload({
    accessToken,
    dossierId: selectedDossierId,
    documentSlotId: slot.document_slot_id,
    onRefreshSelectedDossier,
  });
  const isUploading = upload.state.status === "uploading";
  const canSelectFile = !!accessToken && !!selectedDossierId && definition?.uploadSupported === true && documentChangesAllowed && !isUploading && withdrawState !== "withdrawing";
  const uploadTriggerCopy = isUploading ? "Uploaden..." : "Bestand kiezen";
  const requiredness = documentSlotRequirednessLabel(slot.required);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setDownloadError(null);
    setWithdrawError(null);
    setConfirmationOpen(false);
    upload.selectFile(file);
    if (!file || !isPdfUploadFile(file)) {
      event.target.value = "";
    }
  }

  async function handleDownload() {
    if (!accessToken || !selectedDossierId || !slot.current_file_name) return;
    setDownloadError(null);
    const result = await downloadCurrentDocument({
      accessToken,
      dossierId: selectedDossierId,
      documentSlotId: slot.document_slot_id,
    });
    if (!result.ok) setDownloadError(result.error.message);
  }

  async function handleWithdraw() {
    if (!accessToken || !selectedDossierId || !documentChangesAllowed || withdrawState === "withdrawing") return;
    setWithdrawError(null);
    setWithdrawState("withdrawing");
    const result = await withdrawCurrentDocument({
      accessToken,
      dossierId: selectedDossierId,
      documentSlotId: slot.document_slot_id,
      idempotencyKey: createDocumentWithdrawIdempotencyKey(),
    });

    if (!result.ok) {
      setWithdrawError(result.error.message);
      setWithdrawState("idle");
      return;
    }

    const refreshed = await onRefreshSelectedDossier();
    if (refreshed) {
      setConfirmationOpen(false);
      setWithdrawState("idle");
      upload.reset();
      return;
    }

    setWithdrawState("refresh_failed");
    setWithdrawError("Document verwijderd, maar het dashboard kon niet worden bijgewerkt.");
  }

  async function handleRefreshAfterWithdraw() {
    const refreshed = await onRefreshSelectedDossier();
    if (refreshed) {
      setConfirmationOpen(false);
      setWithdrawError(null);
      setWithdrawState("idle");
      upload.reset();
    }
  }

  return (
    <article className="document-upload-card">
      <header className="document-upload-card-header">
        <h3 className="document-upload-card-title">{title}</h3>
        <span
          aria-label={status.label}
          className={`document-upload-card-status document-upload-card-status-${status.tone}`}
          role="img"
        />
      </header>

      <div className="document-upload-card-body">
        {definition?.uploadSupported ? (
          <div className="document-upload-card-trigger-wrap">
            <input
              accept={definition.accept}
              className="document-file-input document-file-input-hidden"
              disabled={!canSelectFile}
              id={inputId}
              onChange={handleFileChange}
              type="file"
            />
            <label
              aria-disabled={!canSelectFile}
              className="button button-secondary button-compact document-upload-card-trigger"
              htmlFor={inputId}
            >
              {uploadTriggerCopy}
            </label>
          </div>
        ) : (
          <small className="document-upload-card-note">Dit documenttype kan nog niet via het dashboard worden geupload.</small>
        )}

        {requiredness ? <small className="document-upload-card-note">{requiredness}</small> : null}
        {upload.state.error ? <small className="field-message">{upload.state.error.message}</small> : null}
        {upload.state.status === "error" && upload.state.canRetryUpload ? (
          <button className="button button-secondary button-compact" onClick={upload.retryUpload} type="button">
            Opnieuw proberen
          </button>
        ) : null}
        {upload.state.status === "refresh_failed" ? (
          <button className="button button-secondary button-compact" onClick={onRefreshSelectedDossier} type="button">
            Dashboard verversen
          </button>
        ) : null}
        {downloadError ? <small className="field-message">{downloadError}</small> : null}
        {withdrawError ? <small className="field-message">{withdrawError}</small> : null}
      </div>

      <footer className="document-upload-card-footer">
        {hasCurrentDocument ? (
          <>
            <div className="document-upload-card-file-row">
              <button className="document-upload-card-file-link" onClick={handleDownload} type="button">
                {slot.current_file_name}
              </button>
              {documentChangesAllowed ? (
                <button
                  aria-label="Document verwijderen"
                  className="document-upload-card-remove"
                  disabled={withdrawState === "withdrawing"}
                  onClick={() => setConfirmationOpen(true)}
                  type="button"
                >
                  ×
                </button>
              ) : null}
            </div>
            {confirmationOpen ? (
              <div className="document-upload-card-confirm">
                <small>Document verwijderen uit uw dossier?</small>
                <div className="section-actions">
                  <button className="button button-ghost button-compact" onClick={() => setConfirmationOpen(false)} type="button">
                    Annuleren
                  </button>
                  <button
                    className="button button-secondary button-compact"
                    disabled={withdrawState === "withdrawing"}
                    onClick={handleWithdraw}
                    type="button"
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            ) : null}
            {withdrawState === "refresh_failed" ? (
              <button className="button button-secondary button-compact" onClick={handleRefreshAfterWithdraw} type="button">
                Dashboard verversen
              </button>
            ) : null}
          </>
        ) : null}
      </footer>
    </article>
  );
}
