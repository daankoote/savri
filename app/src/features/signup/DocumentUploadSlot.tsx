import { DocumentEvidenceUploadCard } from "../documents/DocumentEvidenceUploadCard.tsx";
import type {
  DocumentEvidenceUploadCardProps,
  DocumentEvidenceUploadState,
} from "../documents/DocumentEvidenceUploadCard.tsx";
import { createCustomerDocumentUploadCardModel } from "../documents/CustomerDocumentWorkflowController.ts";
import { documentLabel } from "./signupNormalizers";
import {
  INVOICE_PDF_ACCEPT,
  isPdfFile,
  supportsInvoicePdfPreview,
} from "./InvoicePdfPreviewPanel";
import type { LocalDocumentDraft, ValidationIssue } from "./signupTypes";
import { signupFieldErrorId } from "./signupValidation";

export type DocumentUploadSlotProps<T extends LocalDocumentDraft> = {
  accept?: string;
  disabled?: boolean;
  document: T;
  error?: ValidationIssue | null;
  helpText?: string;
  onChange: (document: T) => void;
  onRemove?: () => void;
  scope?: string;
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
  ...props
}: DocumentUploadSlotProps<T>) {
  return (
    <DocumentEvidenceUploadCard {...createDocumentUploadCardModel(props)} />
  );
}

export function selectDocumentUploadState<T extends LocalDocumentDraft>(
  document: T,
  error: ValidationIssue | null = null,
): DocumentEvidenceUploadState {
  const parseStatus = "parseStatus" in document ? document.parseStatus : "idle";
  return error ||
      document.quarantineStatus === "error" || parseStatus === "error"
    ? "ERROR"
    : parseStatus === "parsing"
    ? "PARSING"
    : document.quarantineStatus === "uploading" ||
        (document.file &&
          document.quarantineStatus !== "confirmed_quarantine" &&
          parseStatus !== "parsed")
    ? "UPLOADING"
    : document.quarantineStatus === "confirmed_quarantine" ||
        parseStatus === "parsed"
    ? "READY"
    : "EMPTY";
}

export function isDocumentUploadReady<T extends LocalDocumentDraft>(
  document: T,
): boolean {
  return selectDocumentUploadState(document) === "READY";
}

export function createDocumentUploadCardModel<T extends LocalDocumentDraft>({
  accept,
  disabled = false,
  document,
  error = null,
  helpText,
  onChange,
  onRemove,
  scope,
  title,
}: DocumentUploadSlotProps<T>): DocumentEvidenceUploadCardProps {
  const expectsPdfInvoice = supportsInvoicePdfPreview(document.documentType);
  const errorId = error ? signupFieldErrorId(error.fieldPath) : undefined;
  const uploadState = selectDocumentUploadState(document, error);

  const handleFileChange = (file: File | null) => {
    onChange({
      ...document,
      file,
      status: file ? "selected" : "empty",
      quarantineStatus: "idle",
      quarantineFileReference: null,
      quarantineRevision: null,
    });
  };

  const removeFile = () => {
    handleFileChange(null);
    onRemove?.();
  };

  return createCustomerDocumentUploadCardModel({
    state: uploadState,
    errorMessage: error?.message,
    disabled,
    fileName: document.file ? safeDocumentFilename(document.file) : undefined,
    helpText,
    inputAriaDescribedBy: errorId,
    inputAriaInvalid: error ? true : undefined,
    messages: null,
    onFileChange: handleFileChange,
    onRemove: document.file ? removeFile : undefined,
    scope,
    title: title || documentLabel(document.documentType),
    accept: accept || (expectsPdfInvoice ? INVOICE_PDF_ACCEPT : undefined),
    validateFile: expectsPdfInvoice
      ? (file) =>
        isPdfFile(file) ? null : "Alleen PDF-documenten worden nu ondersteund."
      : undefined,
  });
}
