import { useCallback, useEffect, useReducer, useRef } from "react";
import { createDocumentUploadAttempt, uploadDocument } from "./documentUploadClient.ts";
import type {
  DocumentUploadAttempt,
  DocumentUploadSafeError,
  UploadDocumentResult,
} from "./documentUploadTypes.ts";
import {
  documentSlotRequirednessLabel as presentationRequirednessLabel,
  getDocumentSlotDefinition,
  INVOICE_DOCUMENT_TYPE,
  MID_DOCUMENT_TYPE,
  PDF_DOCUMENT_ACCEPT,
} from "./documentSlotPresentation.ts";

export const INSTALLATION_INVOICE_DOCUMENT_TYPE = INVOICE_DOCUMENT_TYPE;
export const MID_METER_DOCUMENT_TYPE = MID_DOCUMENT_TYPE;
export const INSTALLATION_INVOICE_CUSTOMER_LABEL = "Installatie- of aanschaffactuur laadpaal";
export const PDF_UPLOAD_ACCEPT = PDF_DOCUMENT_ACCEPT;

export type DocumentSlotUploadState =
  | { status: "idle"; file: null; attempt: null; error: null; result: null; canRetryUpload: false }
  | { status: "ready"; file: File; attempt: DocumentUploadAttempt; error: null; result: null; canRetryUpload: true }
  | { status: "uploading"; file: File; attempt: DocumentUploadAttempt; error: null; result: null; canRetryUpload: false }
  | { status: "success"; file: File; attempt: DocumentUploadAttempt; error: null; result: Extract<UploadDocumentResult, { ok: true }>; canRetryUpload: false }
  | { status: "error"; file: File | null; attempt: DocumentUploadAttempt | null; error: DocumentUploadSafeError; result: null; canRetryUpload: boolean }
  | { status: "refresh_failed"; file: File; attempt: DocumentUploadAttempt; error: DocumentUploadSafeError; result: Extract<UploadDocumentResult, { ok: true }>; canRetryUpload: false };

type DocumentSlotUploadAction =
  | { type: "select_file"; file: File; attempt: DocumentUploadAttempt }
  | { type: "reject_file"; error: DocumentUploadSafeError }
  | { type: "start" }
  | { type: "fail"; error: DocumentUploadSafeError }
  | { type: "succeed"; result: Extract<UploadDocumentResult, { ok: true }> }
  | { type: "refresh_failed"; error: DocumentUploadSafeError }
  | { type: "reset" };

type UseDocumentSlotUploadInput = {
  accessToken: string | null;
  dossierId: string | null;
  documentSlotId: string;
  onRefreshSelectedDossier: () => Promise<boolean>;
};

function safeLocalError(message: string, retryable = false): DocumentUploadSafeError {
  return {
    code: "invalid_input",
    message,
    retryable,
    stage: "precheck",
  };
}

export function isInstallationInvoiceDocumentType(documentType: string): boolean {
  return documentType === INSTALLATION_INVOICE_DOCUMENT_TYPE;
}

export function customerDocumentSlotTitle(documentType: string, fallbackTitle: string): string {
  return getDocumentSlotDefinition(documentType)?.customerTitle || fallbackTitle;
}

export function documentSlotRequirednessLabel(required: boolean): "Optioneel" | null {
  return presentationRequirednessLabel(required);
}

export function documentSlotVisualState(
  required: boolean,
  currentFileName: string | null,
): "has_current" | "missing_required" | "missing_optional" {
  if (currentFileName) return "has_current";
  return required ? "missing_required" : "missing_optional";
}

export function isMissingRequiredDocument(required: boolean, currentFileName: string | null): boolean {
  return documentSlotVisualState(required, currentFileName) === "missing_required";
}

export function documentReplacementSelectionLabel(selectedFileName: string | null): string {
  return selectedFileName || "Geen nieuw bestand geselecteerd";
}

export function canUseInstallationInvoiceUpload(documentType: string, hasAuthenticatedDossierScope: boolean): boolean {
  return hasAuthenticatedDossierScope && (isInstallationInvoiceDocumentType(documentType) || documentType === MID_METER_DOCUMENT_TYPE);
}

export function isPdfUploadFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  const type = file.type.trim().toLowerCase();
  return name.endsWith(".pdf") && (!type || type === "application/pdf");
}

export function documentSlotUploadReducer(
  state: DocumentSlotUploadState,
  action: DocumentSlotUploadAction,
): DocumentSlotUploadState {
  switch (action.type) {
    case "select_file":
      return {
        status: "ready",
        file: action.file,
        attempt: action.attempt,
        error: null,
        result: null,
        canRetryUpload: true,
      };
    case "reject_file":
      return {
        status: "error",
        file: null,
        attempt: null,
        error: action.error,
        result: null,
        canRetryUpload: false,
      };
    case "start":
      if (!state.file || !state.attempt || state.status === "success" || state.status === "refresh_failed") return state;
      return {
        status: "uploading",
        file: state.file,
        attempt: state.attempt,
        error: null,
        result: null,
        canRetryUpload: false,
      };
    case "fail":
      return {
        status: "error",
        file: state.file,
        attempt: state.attempt,
        error: action.error,
        result: null,
        canRetryUpload: Boolean(state.file && state.attempt && action.error.stage !== "confirm"),
      };
    case "succeed":
      if (!state.file || !state.attempt) return state;
      return {
        status: "success",
        file: state.file,
        attempt: state.attempt,
        error: null,
        result: action.result,
        canRetryUpload: false,
      };
    case "refresh_failed":
      if (!state.file || !state.attempt || !state.result) return state;
      return {
        status: "refresh_failed",
        file: state.file,
        attempt: state.attempt,
        error: action.error,
        result: state.result,
        canRetryUpload: false,
      };
    case "reset":
      return initialDocumentSlotUploadState();
    default:
      return state;
  }
}

export function initialDocumentSlotUploadState(): DocumentSlotUploadState {
  return {
    status: "idle",
    file: null,
    attempt: null,
    error: null,
    result: null,
    canRetryUpload: false,
  };
}

export function useDocumentSlotUpload({
  accessToken,
  dossierId,
  documentSlotId,
  onRefreshSelectedDossier,
}: UseDocumentSlotUploadInput) {
  const [state, dispatch] = useReducer(documentSlotUploadReducer, undefined, initialDocumentSlotUploadState);
  const startedAttemptRef = useRef<string | null>(null);
  const latestRefreshRef = useRef(onRefreshSelectedDossier);

  useEffect(() => {
    latestRefreshRef.current = onRefreshSelectedDossier;
  }, [onRefreshSelectedDossier]);

  useEffect(() => {
    startedAttemptRef.current = null;
    dispatch({ type: "reset" });
  }, [dossierId, documentSlotId]);

  function selectFile(file: File | null) {
    if (!file) {
      dispatch({ type: "reset" });
      return;
    }

    if (!isPdfUploadFile(file)) {
      dispatch({
        type: "reject_file",
        error: safeLocalError("Alleen PDF-bestanden worden nu ondersteund."),
      });
      return;
    }

    dispatch({
      type: "select_file",
      attempt: createDocumentUploadAttempt(),
      file,
    });
  }

  const runUpload = useCallback(async (
    file: File | null,
    attempt: DocumentUploadAttempt | null,
  ): Promise<UploadDocumentResult | null> => {
    if (!accessToken || !dossierId || !file || !attempt) return null;

    dispatch({ type: "start" });
    const result = await uploadDocument({
      accessToken,
      attempt,
      declaredMimeType: file.type || "application/pdf",
      documentSlotId,
      dossierId,
      file,
      originalFileName: file.name,
    });

    if (!result.ok) {
      dispatch({ type: "fail", error: result.error });
      return result;
    }

    dispatch({ type: "succeed", result });
    const refreshed = await latestRefreshRef.current();
    if (refreshed) {
      startedAttemptRef.current = null;
      dispatch({ type: "reset" });
      return result;
    }

    dispatch({
      type: "refresh_failed",
      error: {
        code: "service_unavailable",
        message: "Upload ontvangen, maar het dashboard kon niet worden bijgewerkt.",
        retryable: true,
        stage: "confirm",
      },
    });
    return result;
  }, [accessToken, dossierId, documentSlotId]);

  useEffect(() => {
    if (state.status !== "ready" || !state.canRetryUpload) return;
    const attemptKey = `${state.attempt.uploadUrlIdempotencyKey}:${state.attempt.confirmIdempotencyKey}`;
    if (startedAttemptRef.current === attemptKey) return;
    startedAttemptRef.current = attemptKey;
    void runUpload(state.file, state.attempt);
  }, [runUpload, state]);

  async function retryUpload(): Promise<UploadDocumentResult | null> {
    if (state.status !== "error" || !state.canRetryUpload) return null;
    const attemptKey = state.attempt
      ? `${state.attempt.uploadUrlIdempotencyKey}:${state.attempt.confirmIdempotencyKey}`
      : null;
    startedAttemptRef.current = attemptKey;
    return await runUpload(state.file, state.attempt);
  }

  function markRefreshFailed() {
    dispatch({
      type: "refresh_failed",
      error: {
        code: "service_unavailable",
        message: "Upload ontvangen, maar het dashboard kon niet worden bijgewerkt.",
        retryable: true,
        stage: "confirm",
      },
    });
  }

  function reset() {
    dispatch({ type: "reset" });
  }

  return {
    markRefreshFailed,
    reset,
    retryUpload,
    selectFile,
    state,
  };
}
