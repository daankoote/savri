import { createDocumentUploadAttempt, uploadDocument } from "./documentUploadClient";
import type { UploadDocumentResult } from "./documentUploadTypes";

export type DocumentUploadClientProofResult = {
  ok: true;
  hashOnceVerified: true;
  hashShapeVerified: true;
  issueContractVerified: true;
  signedUploadVerified: true;
  confirmContractVerified: true;
  failureBoundariesVerified: true;
  safeResultVerified: true;
  logicalAttemptVerified: true;
  noAccountTypeBranchRequired: true;
  noDocumentTypeBranchRequired: true;
  precheckVerified: true;
  noUiImportRequired: true;
};

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

type StorageUploadCall = {
  bucket: string;
  path: string;
  token: string;
  file: Blob;
  options?: { contentType?: string };
};

const DOSSIER_ID = "11111111-1111-4111-8111-111111111111";
const SLOT_ID = "22222222-2222-4222-8222-222222222222";
const FILE_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const HASH_HEX = "aa".repeat(32);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getHeader(init: RequestInit | undefined, key: string): string {
  const headers = init?.headers;
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(key) || "";
  if (Array.isArray(headers)) {
    return headers.find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] || "";
  }
  return String((headers as Record<string, string>)[key] || "");
}

function parseBody(call: FetchCall): Record<string, unknown> {
  return JSON.parse(String(call.init?.body || "{}")) as Record<string, unknown>;
}

function issueBody() {
  return {
    ok: true,
    mode: "upload_url_v1",
    request_id: "request-issue",
    document_file_id: FILE_ID,
    document_slot_id: SLOT_ID,
    status: "issued",
    storage_bucket: "proof-bucket",
    storage_path: "server-issued/proof.pdf",
    signed_upload_url: "not-returned-to-ui",
    upload_token: "server-issued-token",
    expires_at: "2026-07-14T00:00:00.000Z",
    max_size_bytes: 15728640,
    payload_hash: "not-returned-to-ui",
    replayed: false,
  };
}

function confirmBody() {
  return {
    ok: true,
    mode: "upload_confirm_v1",
    request_id: "request-confirm",
    document_slot_id: SLOT_ID,
    document_file_id: FILE_ID,
    document_version_id: VERSION_ID,
    version_number: 1,
    file_status: "confirmed",
    version_status: "current",
    server_sha256: "not-returned-to-ui",
  };
}

function createMockFetch(responses: Response[]) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    const response = responses.shift();
    if (!response) throw new Error("Missing mock response");
    return response;
  }) as typeof fetch;

  return { calls, fetchImpl };
}

function createStorageMock(result: { error: unknown } = { error: null }) {
  const uploads: StorageUploadCall[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          async uploadToSignedUrl(path: string, token: string, file: Blob, options?: { contentType?: string }) {
            uploads.push({ bucket, path, token, file, options });
            return { data: null, error: result.error };
          },
        };
      },
    },
  };

  return { client, uploads };
}

function runtimeConfig() {
  return {
    anonKey: "proof-anon-key",
    uploadUrlEndpointUrl: "http://localhost:54321/functions/v1/api-app-document-upload-url",
    uploadConfirmEndpointUrl: "http://localhost:54321/functions/v1/api-app-document-upload-confirm",
  };
}

function makeDigest(counter: { count: number }) {
  return async () => {
    counter.count += 1;
    return new Uint8Array(Array.from({ length: 32 }, () => 0xaa)).buffer;
  };
}

function file() {
  return new Blob(["proof-pdf-bytes"], { type: "application/pdf" });
}

function input(overrides: Partial<Parameters<typeof uploadDocument>[0]> = {}) {
  return {
    accessToken: "proof-access-token",
    dossierId: DOSSIER_ID,
    documentSlotId: SLOT_ID,
    file: file(),
    originalFileName: "Factuur Installatie.pdf",
    declaredMimeType: "APPLICATION/PDF",
    attempt: {
      uploadUrlIdempotencyKey: "issue-key-proof",
      confirmIdempotencyKey: "confirm-key-proof",
    },
    ...overrides,
  };
}

function assertSafeSuccess(result: UploadDocumentResult): asserts result is Extract<UploadDocumentResult, { ok: true }> {
  assert(result.ok === true, "upload must succeed");
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("server-issued-token"), "upload token must not be in final result");
  assert(!serialized.includes("server-issued/proof.pdf"), "storage path must not be in final result");
  assert(!serialized.includes("not-returned-to-ui"), "hashes and targets must not be in final result");
}

export async function runDocumentUploadClientProof(): Promise<DocumentUploadClientProofResult> {
  const digestCounter = { count: 0 };
  const storage = createStorageMock();
  const { calls, fetchImpl } = createMockFetch([jsonResponse(issueBody()), jsonResponse(confirmBody())]);

  const success = await uploadDocument(input(), {
    digestImpl: makeDigest(digestCounter),
    fetchImpl,
    runtimeConfig: runtimeConfig(),
    supabaseClient: storage.client as never,
  });

  assertSafeSuccess(success);
  assert(digestCounter.count === 1, "hash must be computed exactly once");
  assert(HASH_HEX.length === 64 && /^[0-9a-f]{64}$/.test(HASH_HEX), "proof hash must be lowercase 64 hex");
  assert(calls.length === 2, "issue and confirm fetch calls expected");

  const issueCall = calls[0];
  assert(String(issueCall.input).endsWith("/api-app-document-upload-url"), "issue endpoint mismatch");
  assert(issueCall.init?.method === "POST", "issue method must be POST");
  assert(getHeader(issueCall.init, "Authorization") === "Bearer proof-access-token", "issue bearer header missing");
  assert(getHeader(issueCall.init, "apikey") === "proof-anon-key", "issue apikey header missing");
  assert(getHeader(issueCall.init, "Content-Type") === "application/json", "issue content type missing");
  assert(getHeader(issueCall.init, "Idempotency-Key") === "issue-key-proof", "issue idempotency key mismatch");
  const issuedPayload = parseBody(issueCall);
  assert(issuedPayload.dossier_id === DOSSIER_ID, "issue dossier_id mismatch");
  assert(issuedPayload.document_slot_id === SLOT_ID, "issue document_slot_id mismatch");
  assert(issuedPayload.file_name === "Factuur Installatie.pdf", "issue filename mismatch");
  assert(issuedPayload.mime_type === "application/pdf", "issue mime type must normalize lowercase");
  assert(issuedPayload.size_bytes === file().size, "issue size mismatch");
  assert(issuedPayload.client_sha256 === HASH_HEX, "issue hash mismatch");
  assert(!("customer_id" in issuedPayload) && !("identity_id" in issuedPayload) && !("account_type" in issuedPayload), "issue payload must not include customer/identity/account type");

  assert(storage.uploads.length === 1, "signed upload must happen once");
  assert(storage.uploads[0].bucket === "proof-bucket", "storage bucket must come from server response");
  assert(storage.uploads[0].path === "server-issued/proof.pdf", "storage path must come from server response");
  assert(storage.uploads[0].token === "server-issued-token", "upload token must come from server response");
  assert(storage.uploads[0].file.size === file().size, "uploaded file bytes must match the selected file size");
  assert(storage.uploads[0].options?.contentType === "application/pdf", "storage content type mismatch");

  const confirmCall = calls[1];
  assert(String(confirmCall.input).endsWith("/api-app-document-upload-confirm"), "confirm endpoint mismatch");
  assert(confirmCall.init?.method === "POST", "confirm method must be POST");
  assert(getHeader(confirmCall.init, "Idempotency-Key") === "confirm-key-proof", "confirm idempotency key mismatch");
  const confirmPayload = parseBody(confirmCall);
  assert(confirmPayload.dossier_id === DOSSIER_ID, "confirm dossier_id mismatch");
  assert(confirmPayload.document_slot_id === SLOT_ID, "confirm document_slot_id mismatch");
  assert(confirmPayload.document_file_id === FILE_ID, "confirm document_file_id mismatch");
  assert(confirmPayload.file_sha256 === HASH_HEX, "confirm must reuse the same hash");

  const issueFailureFetch = createMockFetch([jsonResponse({ ok: false, code: "document_slot_not_uploadable", error: "raw backend safe copy" }, 409)]);
  const issueFailureStorage = createStorageMock();
  const issueFailure = await uploadDocument(input(), {
    digestImpl: makeDigest({ count: 0 }),
    fetchImpl: issueFailureFetch.fetchImpl,
    runtimeConfig: runtimeConfig(),
    supabaseClient: issueFailureStorage.client as never,
  });
  assert(issueFailure.ok === false && issueFailure.error.stage === "issue", "issue failure must return issue-stage error");
  assert(issueFailureStorage.uploads.length === 0, "issue failure must not upload");
  assert(issueFailureFetch.calls.length === 1, "issue failure must not confirm");
  assert(!issueFailure.error.message.includes("raw backend"), "raw backend error body must not be exposed");

  const uploadFailureFetch = createMockFetch([jsonResponse(issueBody())]);
  const uploadFailureStorage = createStorageMock({ error: { message: "raw storage error" } });
  const uploadFailure = await uploadDocument(input(), {
    digestImpl: makeDigest({ count: 0 }),
    fetchImpl: uploadFailureFetch.fetchImpl,
    runtimeConfig: runtimeConfig(),
    supabaseClient: uploadFailureStorage.client as never,
  });
  assert(uploadFailure.ok === false && uploadFailure.error.stage === "upload", "upload failure must return upload-stage error");
  assert(uploadFailureFetch.calls.length === 1, "upload failure must not confirm");
  assert(!uploadFailure.error.message.includes("raw storage"), "raw storage error must not be exposed");

  const confirmFailureFetch = createMockFetch([
    jsonResponse(issueBody()),
    jsonResponse({ ok: false, code: "server_hash_mismatch", error: "raw confirm detail" }, 409),
  ]);
  const confirmFailureStorage = createStorageMock();
  const confirmFailure = await uploadDocument(input(), {
    digestImpl: makeDigest({ count: 0 }),
    fetchImpl: confirmFailureFetch.fetchImpl,
    runtimeConfig: runtimeConfig(),
    supabaseClient: confirmFailureStorage.client as never,
  });
  assert(confirmFailure.ok === false && confirmFailure.error.stage === "confirm", "confirm failure must return confirm-stage error");
  assert(confirmFailureFetch.calls.length === 2, "confirm failure must not re-issue or re-upload");
  assert(confirmFailureStorage.uploads.length === 1, "confirm failure must have only one upload");
  assert(!confirmFailure.error.message.includes("raw confirm"), "raw confirm error must not be exposed");

  const emptyFile = await uploadDocument(input({ file: new Blob([], { type: "application/pdf" }) }), {
    digestImpl: makeDigest({ count: 0 }),
    fetchImpl,
    runtimeConfig: runtimeConfig(),
    supabaseClient: storage.client as never,
  });
  assert(emptyFile.ok === false && emptyFile.error.stage === "precheck", "empty file must reject before hashing/network");

  const invalidInput = await uploadDocument(input({ dossierId: "not-a-uuid" }), {
    digestImpl: makeDigest({ count: 0 }),
    fetchImpl,
    runtimeConfig: runtimeConfig(),
    supabaseClient: storage.client as never,
  });
  assert(invalidInput.ok === false && invalidInput.error.stage === "precheck", "invalid identifiers must reject before network");

  const firstAttempt = createDocumentUploadAttempt();
  const secondAttempt = createDocumentUploadAttempt();
  assert(firstAttempt.uploadUrlIdempotencyKey && firstAttempt.confirmIdempotencyKey, "attempt keys must be generated");
  assert(
    firstAttempt.uploadUrlIdempotencyKey !== secondAttempt.uploadUrlIdempotencyKey &&
      firstAttempt.confirmIdempotencyKey !== secondAttempt.confirmIdempotencyKey,
    "new logical attempts must create different keys",
  );
  assert(
    input({ attempt: firstAttempt }).attempt.uploadUrlIdempotencyKey === firstAttempt.uploadUrlIdempotencyKey,
    "same logical attempt can reuse issue key",
  );

  return {
    ok: true,
    confirmContractVerified: true,
    failureBoundariesVerified: true,
    hashOnceVerified: true,
    hashShapeVerified: true,
    issueContractVerified: true,
    logicalAttemptVerified: true,
    noAccountTypeBranchRequired: true,
    noDocumentTypeBranchRequired: true,
    noUiImportRequired: true,
    precheckVerified: true,
    safeResultVerified: true,
    signedUploadVerified: true,
  };
}
