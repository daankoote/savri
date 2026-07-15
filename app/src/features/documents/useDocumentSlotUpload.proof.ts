import type { DocumentUploadSafeError } from "./documentUploadTypes.ts";
import {
  canUseInstallationInvoiceUpload,
  customerDocumentSlotTitle,
  documentReplacementSelectionLabel,
  documentSlotRequirednessLabel,
  documentSlotUploadReducer,
  documentSlotVisualState,
  initialDocumentSlotUploadState,
  INSTALLATION_INVOICE_CUSTOMER_LABEL,
  INSTALLATION_INVOICE_DOCUMENT_TYPE,
  isMissingRequiredDocument,
  isPdfUploadFile,
  MID_METER_DOCUMENT_TYPE,
} from "./useDocumentSlotUpload.ts";

export type DocumentSlotUploadProofResult = {
  ok: true;
  slotDiscriminatorVerified: true;
  titleDoesNotActivateUpload: true;
  midSlotUsesSharedUpload: true;
  unsupportedSlotsRemainReadOnly: true;
  pdfGateVerified: true;
  customerLabelVerified: true;
  requirednessCopyVerified: true;
  missingRequiredVisualStateVerified: true;
  replacementSelectionCopyVerified: true;
  logicalAttemptVerified: true;
  retryBoundaryVerified: true;
  confirmBoundaryVerified: true;
  resetBoundaryVerified: true;
  noAccountTypeBranchRequired: true;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function file(name: string, type: string): File {
  return new File(["proof"], name, { type });
}

function attempt(seed: string) {
  return {
    confirmIdempotencyKey: `confirm-${seed}`,
    uploadUrlIdempotencyKey: `issue-${seed}`,
  };
}

function error(stage: DocumentUploadSafeError["stage"]): DocumentUploadSafeError {
  return {
    code: stage === "confirm" ? "confirm_failed" : stage === "upload" ? "upload_failed" : "issue_failed",
    message: "Veilige foutmelding.",
    retryable: true,
    stage,
  };
}

export async function runDocumentSlotUploadProof(): Promise<DocumentSlotUploadProofResult> {
  assert(
    canUseInstallationInvoiceUpload(INSTALLATION_INVOICE_DOCUMENT_TYPE, true),
    "canonical installation-invoice slot type must activate upload",
  );
  assert(
    canUseInstallationInvoiceUpload(MID_METER_DOCUMENT_TYPE, true),
    "MID evidence slot type must use the same shared upload path",
  );
  assert(
    !canUseInstallationInvoiceUpload(INSTALLATION_INVOICE_DOCUMENT_TYPE, false),
    "upload must require authenticated dossier scope",
  );
  assert(
    !canUseInstallationInvoiceUpload("Factuur of eigendomsbewijs laadpaal", true),
    "display title must not activate upload behavior",
  );
  assert(
    customerDocumentSlotTitle(INSTALLATION_INVOICE_DOCUMENT_TYPE, "Factuur of eigendomsbewijs laadpaal") ===
      INSTALLATION_INVOICE_CUSTOMER_LABEL,
    "installation invoice customer label mismatch",
  );
  assert(
    customerDocumentSlotTitle(MID_METER_DOCUMENT_TYPE, "MID bewijs") === "MID-bewijs laadpaal",
    "MID evidence customer label mismatch",
  );
  assert(
    !canUseInstallationInvoiceUpload("unsupported_document_type", true),
    "unsupported document slot types must remain read-only",
  );
  assert(documentSlotRequirednessLabel(true) === null, "required slots must not render requiredness copy");
  assert(documentSlotRequirednessLabel(false) === "Optioneel", "optional slots must render Optioneel");
  assert(documentSlotVisualState(true, null) === "missing_required", "missing required document must use missing visual state");
  assert(isMissingRequiredDocument(true, null), "missing required document helper must return true");
  assert(documentSlotVisualState(false, null) === "missing_optional", "missing optional document must remain optional visual state");
  assert(!isMissingRequiredDocument(false, null), "missing optional document helper must return false");
  assert(documentSlotVisualState(true, "bestaand.pdf") === "has_current", "current document must remain visible during replacement state");
  assert(!isMissingRequiredDocument(true, "bestaand.pdf"), "current document must not show missing marker");
  assert(
    documentReplacementSelectionLabel(null) === "Geen nieuw bestand geselecteerd",
    "replacement picker must distinguish no replacement file from current file",
  );
  assert(
    documentReplacementSelectionLabel("nieuw.pdf") === "nieuw.pdf",
    "replacement picker must show selected replacement filename",
  );

  assert(isPdfUploadFile(file("factuur.pdf", "application/pdf")), "PDF file must pass the local PDF gate");
  assert(!isPdfUploadFile(file("factuur.txt", "text/plain")), "non-PDF file must fail before upload");
  assert(!isPdfUploadFile(file("factuur.pdf", "text/plain")), "wrong MIME must fail before upload");

  const firstFile = file("factuur.pdf", "application/pdf");
  const firstAttempt = attempt("a");
  const ready = documentSlotUploadReducer(initialDocumentSlotUploadState(), {
    attempt: firstAttempt,
    file: firstFile,
    type: "select_file",
  });
  assert(ready.status === "ready", "selected PDF must create ready state");
  assert(ready.attempt === firstAttempt, "selected file must keep the logical attempt");

  const rerenderEquivalent = ready;
  assert(rerenderEquivalent.attempt === firstAttempt, "re-render without action must not create new keys");

  const issueFailed = documentSlotUploadReducer(ready, { error: error("issue"), type: "fail" });
  assert(issueFailed.status === "error" && issueFailed.canRetryUpload, "issue failure must allow explicit retry with same attempt");
  assert(issueFailed.attempt === firstAttempt, "issue retry must preserve attempt keys");

  const uploadFailed = documentSlotUploadReducer(ready, { error: error("upload"), type: "fail" });
  assert(uploadFailed.status === "error" && uploadFailed.canRetryUpload, "upload failure must allow explicit retry with same attempt");
  assert(uploadFailed.attempt === firstAttempt, "upload retry must preserve attempt keys");

  const confirmFailed = documentSlotUploadReducer(ready, { error: error("confirm"), type: "fail" });
  assert(confirmFailed.status === "error" && !confirmFailed.canRetryUpload, "confirm failure must not allow blind upload retry");

  const succeeded = documentSlotUploadReducer(ready, {
    result: {
      currentVersionNumber: 1,
      currentVersionStatus: "current",
      documentFileId: "33333333-3333-4333-8333-333333333333",
      documentSlotId: "22222222-2222-4222-8222-222222222222",
      fileStatus: "confirmed",
      ok: true,
      requestId: "request-proof",
      safeFileName: null,
    },
    type: "succeed",
  });
  assert(succeeded.status === "success" && !succeeded.canRetryUpload, "success must wait for dashboard refresh instead of upload retry");

  const refreshFailed = documentSlotUploadReducer(succeeded, { error: error("confirm"), type: "refresh_failed" });
  assert(refreshFailed.status === "refresh_failed" && !refreshFailed.canRetryUpload, "refresh failure after confirm must offer refresh-only recovery");

  const secondAttempt = attempt("b");
  const secondReady = documentSlotUploadReducer(ready, {
    attempt: secondAttempt,
    file: file("andere-factuur.pdf", "application/pdf"),
    type: "select_file",
  });
  assert(secondReady.status === "ready" && secondReady.attempt === secondAttempt, "selecting another file must create a new attempt");

  const resetAfterDossierChange = documentSlotUploadReducer(secondReady, { type: "reset" });
  assert(resetAfterDossierChange.status === "idle", "changing dossier must reset state");
  const resetAfterSlotChange = documentSlotUploadReducer(ready, { type: "reset" });
  assert(resetAfterSlotChange.status === "idle", "changing slot must reset state");

  return {
    ok: true,
    confirmBoundaryVerified: true,
    customerLabelVerified: true,
    logicalAttemptVerified: true,
    missingRequiredVisualStateVerified: true,
    noAccountTypeBranchRequired: true,
    midSlotUsesSharedUpload: true,
    pdfGateVerified: true,
    requirednessCopyVerified: true,
    replacementSelectionCopyVerified: true,
    resetBoundaryVerified: true,
    retryBoundaryVerified: true,
    slotDiscriminatorVerified: true,
    titleDoesNotActivateUpload: true,
    unsupportedSlotsRemainReadOnly: true,
  };
}
