import { type ChangeEvent, useRef, useState } from "react";
import { documentLabel } from "./signupNormalizers";
import {
  INVOICE_PDF_ACCEPT,
  isPdfFile,
  supportsInvoicePdfPreview,
} from "./InvoicePdfPreviewPanel";
import type { LocalDocumentDraft, ValidationIssue } from "./signupTypes";
import { signupFieldErrorId } from "./signupValidation";

type DocumentUploadSlotProps<T extends LocalDocumentDraft> = {
  accept?: string;
  disabled?: boolean;
  document: T;
  documentBinding?: string;
  error?: ValidationIssue | null;
  helpText?: string;
  hideDocumentLabel?: boolean;
  onChange: (document: T) => void;
  onRemove?: () => void;
  scope?: string;
  scopeAction?: {
    disabled?: boolean;
    label: string;
    onClick: () => void;
  };
  title?: string;
};

export function safeDocumentFilename(
  file: File | null,
  fallback = "Nog geen bestand gekozen",
): string {
  const cleaned = file?.name
    .replace(/[\\/\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

export function DocumentUploadSlot<T extends LocalDocumentDraft>({
  accept,
  disabled = false,
  document,
  documentBinding,
  error = null,
  helpText,
  hideDocumentLabel = false,
  onChange,
  onRemove,
  scope,
  scopeAction,
  title,
}: DocumentUploadSlotProps<T>) {
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const expectsPdfInvoice = supportsInvoicePdfPreview(document.documentType);
  const errorId = error ? signupFieldErrorId(error.fieldPath) : undefined;

  const handleFileChange = (file: File | null) => {
    onChange({
      ...document,
      file,
      status: file ? "selected" : "empty",
    });
  };

  const removeFile = () => {
    if (inputRef.current) inputRef.current.value = "";
    setFileMessage(null);
    handleFileChange(null);
    onRemove?.();
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;

    if (file && expectsPdfInvoice && !isPdfFile(file)) {
      event.target.value = "";
      setFileMessage("Alleen PDF-documenten worden nu ondersteund.");
      handleFileChange(null);
      return;
    }

    setFileMessage(null);
    handleFileChange(file);
  };

  return (
    <article className="document-slot-card">
      {title || scope || scopeAction
        ? (
          <header className="document-slot-card__header">
            <div>
              {scope ? <span className="step-number">{scope}</span> : null}
              {title ? <h3>{title}</h3> : null}
            </div>
            {scopeAction
              ? (
                <button
                  className="button button-ghost button-compact"
                  disabled={scopeAction.disabled}
                  onClick={scopeAction.onClick}
                  type="button"
                >
                  {scopeAction.label}
                </button>
              )
              : null}
          </header>
        )
        : null}
      {helpText ? <p className="fine-print">{helpText}</p> : null}
      <div className="document-slot">
        <label className="document-slot-picker">
          {hideDocumentLabel
            ? null
            : <span>{documentLabel(document.documentType)}</span>}
          <span className="document-file-native-frame">
            <input
              accept={accept ||
                (expectsPdfInvoice ? INVOICE_PDF_ACCEPT : undefined)}
              aria-describedby={errorId}
              aria-invalid={error ? true : undefined}
              aria-label={hideDocumentLabel
                ? documentLabel(document.documentType)
                : undefined}
              className="document-file-input"
              disabled={disabled}
              onChange={handleInputChange}
              ref={inputRef}
              type="file"
            />
          </span>
          <small className="document-selected-file">
            {safeDocumentFilename(document.file)}
          </small>
        </label>
        {document.file
          ? (
            <button
              className="button button-ghost button-compact"
              disabled={disabled}
              onClick={removeFile}
              type="button"
            >
              Verwijderen
            </button>
          )
          : null}
        {fileMessage
          ? <small className="field-message">{fileMessage}</small>
          : null}
        {error
          ? (
            <small className="field-message" id={errorId} role="alert">
              {error.message}
            </small>
          )
          : null}
      </div>
      {documentBinding
        ? (
          <small className="document-slot-card__binding">
            Binding: {documentBinding}
          </small>
        )
        : null}
    </article>
  );
}
