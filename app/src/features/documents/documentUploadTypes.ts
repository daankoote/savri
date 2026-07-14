export type DocumentUploadStage = "precheck" | "hash" | "issue" | "upload" | "confirm";

export type DocumentUploadAttempt = {
  uploadUrlIdempotencyKey: string;
  confirmIdempotencyKey: string;
};

export type UploadDocumentInput = {
  accessToken: string;
  dossierId: string;
  documentSlotId: string;
  file: Blob;
  originalFileName: string;
  declaredMimeType: string;
  attempt: DocumentUploadAttempt;
};

export type UploadDocumentSuccess = {
  ok: true;
  documentFileId: string;
  documentSlotId: string;
  fileStatus: "confirmed";
  currentVersionNumber: number;
  currentVersionStatus: "current";
  safeFileName: string | null;
  requestId: string;
};

export type DocumentUploadErrorCode =
  | "not_configured"
  | "invalid_input"
  | "hash_failed"
  | "issue_failed"
  | "upload_failed"
  | "confirm_failed"
  | "invalid_response"
  | "service_unavailable";

export type DocumentUploadSafeError = {
  code: DocumentUploadErrorCode;
  message: string;
  stage: DocumentUploadStage;
  retryable: boolean;
  backendCode?: string;
};

export type UploadDocumentResult = UploadDocumentSuccess | { ok: false; error: DocumentUploadSafeError };
