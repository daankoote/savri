import { type ChangeEvent, type ReactNode, useId, useState } from "react";

export type DocumentEvidenceUploadState =
  | "EMPTY"
  | "UPLOADING"
  | "PARSING"
  | "READY"
  | "ERROR";

export type DocumentEvidenceUploadStatus = Readonly<{
  label: string;
  state: DocumentEvidenceUploadState;
}>;

export type DocumentEvidenceUploadCardProps = Readonly<{
  accept?: string;
  action?: ReactNode;
  actions?: ReactNode;
  disabled?: boolean;
  fileAction?: ReactNode;
  fileName?: string;
  helpText?: string;
  inputAriaDescribedBy?: string;
  inputAriaInvalid?: boolean;
  messages?: ReactNode;
  onFileChange: (file: File | null) => void;
  scope?: string;
  status: DocumentEvidenceUploadStatus;
  title: string;
  validateFile?: (file: File) => string | null;
}>;

const STATUS_TONE: Readonly<
  Record<
    DocumentEvidenceUploadState,
    "neutral" | "warning" | "success" | "danger"
  >
> = Object.freeze({
  EMPTY: "neutral",
  UPLOADING: "warning",
  PARSING: "warning",
  READY: "success",
  ERROR: "danger",
});

export function DocumentEvidenceUploadStatus({
  label,
  state,
}: DocumentEvidenceUploadStatus) {
  const tone = STATUS_TONE[state];
  const dotClass = tone === "success"
    ? "status-dot-ok"
    : tone === "danger"
    ? "status-dot-danger"
    : "status-dot-warning";
  if (state === "EMPTY") {
    return (
      <small aria-live="polite" className="sr-only" role="status">
        {label}
      </small>
    );
  }
  if (state === "READY") {
    return (
      <small
        aria-live="polite"
        className="document-upload-card-message document-upload-card-message-success"
        role="status"
      >
        <span
          aria-hidden="true"
          className="status-pill status-pill-ok"
        >
          ✓
        </span>
        <span className="sr-only">{label}</span>
      </small>
    );
  }
  return (
    <small
      aria-live="polite"
      className={`document-upload-card-message document-upload-card-message-${tone}`}
      role={state === "ERROR" ? "alert" : "status"}
    >
      <span aria-hidden="true" className={`status-dot ${dotClass}`} /> {label}
    </small>
  );
}

/**
 * Shared upload presentation for initial signup and correction replacement
 * evidence. Callers own authority and transport; this component owns the DOM,
 * visual states, picker, filename and action placement.
 */
export function DocumentEvidenceUploadCard({
  accept = "application/pdf,.pdf",
  action,
  actions,
  disabled = false,
  fileAction,
  fileName,
  helpText,
  inputAriaDescribedBy,
  inputAriaInvalid,
  messages,
  onFileChange,
  scope,
  status,
  title,
  validateFile,
}: DocumentEvidenceUploadCardProps) {
  const inputId = useId();
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );
  const busy = status.state === "UPLOADING" || status.state === "PARSING";
  const pickerLabel = status.state === "READY" || fileName
    ? "PDF vervangen"
    : "PDF kiezen";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    const nextValidationMessage = file && validateFile
      ? validateFile(file)
      : null;
    setValidationMessage(nextValidationMessage);
    onFileChange(nextValidationMessage ? null : file);
    event.target.value = "";
  }

  return (
    <article className="document-slot-card">
      <header className="document-slot-card__header">
        <div>
          {scope ? <span className="step-number">{scope}</span> : null}
          <h3>{title}</h3>
        </div>
        {action}
      </header>
      {helpText ? <p className="fine-print">{helpText}</p> : null}
      <div className="document-slot">
        <div className="document-upload-card-trigger-wrap">
          <input
            accept={accept}
            aria-describedby={inputAriaDescribedBy}
            aria-invalid={inputAriaInvalid}
            className="document-file-input document-file-input-hidden"
            disabled={disabled || busy}
            id={inputId}
            onChange={handleFileChange}
            type="file"
          />
          <label
            aria-disabled={disabled || busy}
            className="button button-secondary button-compact document-upload-card-trigger"
            htmlFor={inputId}
          >
            {pickerLabel}
          </label>
        </div>
        <DocumentEvidenceUploadStatus {...status} />
        {fileName
          ? (
            <div className="document-upload-card-file-row">
              <small className="document-selected-file" title={fileName}>
                {fileName}
              </small>
              {fileAction}
            </div>
          )
          : null}
        {actions ? <div className="section-actions">{actions}</div> : null}
        {validationMessage
          ? (
            <small className="field-message" role="alert">
              {validationMessage}
            </small>
          )
          : null}
        {messages}
      </div>
    </article>
  );
}
