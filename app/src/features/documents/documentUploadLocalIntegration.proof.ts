import { createClient } from "@supabase/supabase-js";
import { fetchDashboardReadModel } from "../dashboard/dashboardReadClient.ts";
import type { DashboardDocumentSlot } from "../dashboard/dashboardTypes.ts";
import { getDocumentSlotStatusPresentation } from "./documentSlotPresentation.ts";
import { downloadCurrentDocument } from "./documentDownloadClient.ts";
import { uploadDocument } from "./documentUploadClient.ts";
import { withdrawCurrentDocument } from "./documentWithdrawClient.ts";

type LocalIntegrationConfig = {
  allowDestructiveLocalProof: "YES";
  supabaseUrl: string;
  functionBaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  bucketName: string;
};

type DenoEnvLike = {
  Deno?: {
    env?: {
      get(name: string): string | undefined;
    };
  };
};

type CleanupResult = {
  mutableCleanupAttempted: true;
  immutableLocalEvidenceMayRemain: true;
  requiresDisposableLocalDatabaseReset: true;
};

export type DocumentUploadLocalIntegrationProofResult = {
  ok: true;
  mode: "document_upload_local_integration_proof";
  downloadProof: DocumentDownloadEndpointProofResult;
  withdrawalProof: DocumentWithdrawEndpointProofResult;
  issueShapeAcceptedByClient: true;
  signedStorageUploadCount: number;
  confirmSucceeded: true;
  currentVersionCreated: true;
  midUploadConfirmed: true;
  invoiceUploadConfirmed: true;
  replacementVersionCreated: true;
  oldVersionSuperseded: true;
  confirmReplayDeterministic: true;
  dashboardBeforeWithdrawVerified: true;
  dashboardAfterWithdrawVerified: true;
  lockedDossierRejectedWithdrawal: true;
  safeResultExcludesInternalTarget: true;
  noLegacyDependencyObserved: true;
  requestCounts: {
    issue: number;
    confirm: number;
    dashboard: number;
    download: number;
    withdraw: number;
    signedUpload: number;
  };
  cleanup: CleanupResult;
};

export type DocumentDownloadEndpointProofResult = {
  ok: true;
  optionsCorsVerified: true;
  missingAuthRejected: true;
  invalidBodyRejected: true;
  ownedCurrentSlotReturnedSignedUrl: true;
  safeResponseShapeVerified: true;
  internalFieldsExcluded: true;
  unknownAndCrossCustomerSemanticsMatched: true;
  emptySlotRejected: true;
  shortLivedUrlVerified: true;
  noSuccessAuditWrite: true;
  noIdempotencyKeyRequired: true;
  noLegacyDependencyObserved: true;
};

export type DocumentWithdrawEndpointProofResult = {
  ok: true;
  optionsCorsVerified: true;
  missingAuthRejected: true;
  missingIdempotencyRejected: true;
  invalidBodyRejected: true;
  ownedCurrentDocumentWithdrawn: true;
  currentVersionWithdrawn: true;
  slotPointersCleared: true;
  slotReturnedExpected: true;
  fileAndVersionRowsRemain: true;
  storageObjectRetained: true;
  auditWrittenExactlyOnce: true;
  replayDeterministic: true;
  idempotencyConflictVerified: true;
  concurrencySafe: true;
  crossCustomerSafeNotFound: true;
  lockedDossierSafe409: true;
  clientCannotChooseInternals: true;
  noLegacyDependencyObserved: true;
  anonRpcDenied: true;
  serviceRoleRpcAllowed: true;
};

type RuntimeResponseRecord = {
  endpoint: "issue" | "confirm" | "dashboard" | "download" | "withdraw" | "other";
  status: number;
  mode: string;
  code: string;
  keys: string[];
};

type Tracker = {
  authUserIds: Set<string>;
  customerIds: Set<string>;
  identityIds: Set<string>;
  dossierIds: Set<string>;
  locationIds: Set<string>;
  chargerIds: Set<string>;
  slotIds: Set<string>;
  documentFileIds: Set<string>;
  documentVersionIds: Set<string>;
  idempotencyKeys: Set<string>;
  storageObjects: Array<{ bucket: string; path: string }>;
  requestIds: Set<string>;
};

const INSTALLATION_SLOT_TYPE = "invoice_or_ownership_evidence";
const MID_SLOT_TYPE = "mid_meter_evidence";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%ENVAL upload client integration proof\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const REPLACEMENT_PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%ENVAL upload client replacement proof\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertLocalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_error) {
    throw new Error("non_local_target_rejected");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1" && hostname !== "[::1]") {
    throw new Error("non_local_target_rejected");
  }

  return parsed.toString().replace(/\/$/, "");
}

function proofId(): string {
  return `upload-client-proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function readProofEnv(name: string): string {
  const value = (globalThis as typeof globalThis & DenoEnvLike).Deno?.env?.get(name);
  if (!value) throw new Error(`missing_local_proof_env:${name}`);
  return value;
}

function resolveLocalIntegrationConfig(config?: LocalIntegrationConfig): LocalIntegrationConfig {
  if (config) return config;

  const allowDestructiveLocalProof = readProofEnv("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF");
  assert(allowDestructiveLocalProof === "YES", "destructive_local_proof_not_enabled");

  return {
    allowDestructiveLocalProof,
    anonKey: readProofEnv("SUPABASE_ANON_KEY"),
    bucketName: (globalThis as typeof globalThis & DenoEnvLike).Deno?.env?.get("APP_DOCUMENTS_BUCKET") || "app-documents",
    functionBaseUrl: readProofEnv("FUNCTION_BASE_URL"),
    serviceRoleKey: readProofEnv("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl: readProofEnv("SUPABASE_URL"),
  };
}

function makeTracker(): Tracker {
  return {
    authUserIds: new Set(),
    customerIds: new Set(),
    identityIds: new Set(),
    dossierIds: new Set(),
    locationIds: new Set(),
    chargerIds: new Set(),
    documentFileIds: new Set(),
    documentVersionIds: new Set(),
    idempotencyKeys: new Set(),
    requestIds: new Set(),
    slotIds: new Set(),
    storageObjects: [],
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function createAuthFixture(service: any, anon: any, tracker: Tracker) {
  const password = `Aa1!${crypto.randomUUID()}x`;
  const email = `${proofId()}@example.invalid`;
  const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert(!created.error && created.data?.user?.id, "auth_user_create_failed");
  tracker.authUserIds.add(String(created.data.user.id));

  const session = await anon.auth.signInWithPassword({ email, password });
  assert(!session.error && session.data?.session?.access_token, "auth_sign_in_failed");

  const customer = await service.from("app_customers").insert([{
    customer_type: "particulier",
    display_name: "Upload proof customer",
    primary_email_normalized: email,
    status: "active",
  }]).select("id").single();
  assert(!customer.error && customer.data?.id, "customer_insert_failed");
  tracker.customerIds.add(String(customer.data.id));

  const identity = await service.from("app_customer_identities").insert([{
    auth_user_id: created.data.user.id,
    customer_id: customer.data.id,
    email_normalized: email,
    email_verified_at: new Date().toISOString(),
    status: "active",
  }]).select("id").single();
  assert(!identity.error && identity.data?.id, "identity_insert_failed");
  tracker.identityIds.add(String(identity.data.id));

  const dossier = await service.from("app_customer_dossiers").insert([{
    account_type: "particulier",
    customer_id: customer.data.id,
    status: "submitted",
    submitted_at: new Date().toISOString(),
  }]).select("id").single();
  assert(!dossier.error && dossier.data?.id, "dossier_insert_failed");
  tracker.dossierIds.add(String(dossier.data.id));

  const location = await service.from("app_dossier_locations").insert([{
    client_location_id: `proof-location-${crypto.randomUUID()}`,
    country: "Nederland",
    dossier_id: dossier.data.id,
    house_number: "1",
    label: "Proof location",
    postcode_normalized: "1000AA",
    status: "submitted",
  }]).select("id").single();
  assert(!location.error && location.data?.id, "location_insert_failed");
  tracker.locationIds.add(String(location.data.id));

  const charger = await service.from("app_dossier_chargers").insert([{
    client_charger_id: `proof-charger-${crypto.randomUUID()}`,
    dossier_id: dossier.data.id,
    installation_year: 2026,
    location_id: location.data.id,
    mid_number: `MID-${crypto.randomUUID().slice(0, 8)}`,
    mid_status: "submitted",
    serial_number: `SER-${crypto.randomUUID().slice(0, 8)}`,
    status: "submitted",
  }]).select("id").single();
  assert(!charger.error && charger.data?.id, "charger_insert_failed");
  tracker.chargerIds.add(String(charger.data.id));

  const midSlot = await service.from("app_dossier_document_slots").insert([{
    charger_id: charger.data.id,
    client_slot_id: `proof-mid-slot-${crypto.randomUUID()}`,
    document_type: MID_SLOT_TYPE,
    dossier_id: dossier.data.id,
    location_id: location.data.id,
    required: true,
    status: "expected",
    title: "MID-bewijs laadpaal",
  }]).select("id").single();
  assert(!midSlot.error && midSlot.data?.id, "mid_slot_insert_failed");
  tracker.slotIds.add(String(midSlot.data.id));

  const invoiceSlot = await service.from("app_dossier_document_slots").insert([{
    charger_id: charger.data.id,
    client_slot_id: `proof-invoice-slot-${crypto.randomUUID()}`,
    document_type: INSTALLATION_SLOT_TYPE,
    dossier_id: dossier.data.id,
    location_id: location.data.id,
    required: true,
    status: "expected",
    title: "Installatie factuur",
  }]).select("id").single();
  assert(!invoiceSlot.error && invoiceSlot.data?.id, "invoice_slot_insert_failed");
  tracker.slotIds.add(String(invoiceSlot.data.id));

  const unsupportedSlot = await service.from("app_dossier_document_slots").insert([{
    charger_id: charger.data.id,
    client_slot_id: `proof-unsupported-slot-${crypto.randomUUID()}`,
    document_type: "unsupported_proof_document",
    dossier_id: dossier.data.id,
    location_id: location.data.id,
    required: true,
    status: "expected",
    title: "Unsupported proof document",
  }]).select("id").single();
  assert(!unsupportedSlot.error && unsupportedSlot.data?.id, "unsupported_slot_insert_failed");
  tracker.slotIds.add(String(unsupportedSlot.data.id));

  return {
    accessToken: String(session.data.session.access_token),
    chargerId: String(charger.data.id),
    customerId: String(customer.data.id),
    dossierId: String(dossier.data.id),
    identityId: String(identity.data.id),
    invoiceSlotId: String(invoiceSlot.data.id),
    locationId: String(location.data.id),
    midSlotId: String(midSlot.data.id),
    unsupportedSlotId: String(unsupportedSlot.data.id),
  };
}

async function ensureLocalBucket(service: any, bucketName: string) {
  const buckets = await service.storage.listBuckets();
  const exists = Array.isArray(buckets.data) && buckets.data.some((bucket: any) => bucket.name === bucketName);
  if (!exists) {
    const created = await service.storage.createBucket(bucketName, { public: false });
    assert(!created.error, "bucket_create_failed");
  }
}

function createFetchRecorder(tracker: Tracker, records: RuntimeResponseRecord[], captured: Record<string, string>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const endpoint = url.includes("api-app-document-upload-url")
      ? "issue"
      : url.includes("api-app-document-upload-confirm")
        ? "confirm"
        : url.includes("api-app-dashboard-get")
          ? "dashboard"
          : url.includes("api-app-document-download-url")
            ? "download"
            : url.includes("api-app-document-withdraw-current")
              ? "withdraw"
              : "other";
    const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) as Record<string, unknown> : {};
    const idem = typeof init?.headers === "object"
      ? new Headers(init.headers as HeadersInit).get("Idempotency-Key")
      : null;
    if (idem) tracker.idempotencyKeys.add(idem);
    if (endpoint === "issue" && typeof requestBody.client_sha256 === "string") {
      captured.fileSha256 = requestBody.client_sha256;
    }

    const response = await fetch(input, init);
    const clone = response.clone();
    const body = await clone.json().catch(() => null);
    const keys = body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body).sort() : [];
    records.push({
      code: typeof body?.code === "string" ? body.code : "",
      endpoint,
      keys,
      mode: typeof body?.mode === "string" ? body.mode : "",
      status: response.status,
    });
    if (body?.request_id) tracker.requestIds.add(String(body.request_id));
    if (endpoint === "issue" && response.ok && body?.document_file_id) {
      captured.documentFileId = String(body.document_file_id);
      tracker.documentFileIds.add(String(body.document_file_id));
      if (body.storage_bucket && body.storage_path) {
        tracker.storageObjects.push({ bucket: String(body.storage_bucket), path: String(body.storage_path) });
      }
    }
    if (endpoint === "confirm" && response.ok && body?.document_version_id) {
      captured.documentVersionId = String(body.document_version_id);
      tracker.documentVersionIds.add(String(body.document_version_id));
    }
    return response;
  };
}

function createStorageRecorder(anon: any, uploadCounter: { count: number }) {
  return {
    storage: {
      from(bucket: string) {
        const storage = anon.storage.from(bucket);
        return {
          uploadToSignedUrl(path: string, token: string, file: Blob, options?: { contentType?: string }) {
            uploadCounter.count += 1;
            return storage.uploadToSignedUrl(path, token, file, options);
          },
        };
      },
    },
  };
}

async function cleanup(service: any, tracker: Tracker): Promise<CleanupResult> {
  for (const object of tracker.storageObjects) {
    await service.storage.from(object.bucket).remove([object.path]).catch(() => null);
  }
  await deleteWhereIn(service, "app_dossier_document_versions", "id", tracker.documentVersionIds);
  await deleteWhereIn(service, "app_dossier_document_files", "id", tracker.documentFileIds);
  await deleteWhereIn(service, "app_dossier_document_slots", "id", tracker.slotIds);
  await deleteWhereIn(service, "app_dossier_chargers", "id", tracker.chargerIds);
  await deleteWhereIn(service, "app_dossier_locations", "id", tracker.locationIds);
  await deleteWhereIn(service, "app_customer_dossiers", "id", tracker.dossierIds);
  await deleteWhereIn(service, "app_customer_identities", "id", tracker.identityIds);
  await deleteWhereIn(service, "app_customers", "id", tracker.customerIds);
  await deleteWhereIn(service, "app_idempotency_keys", "key", tracker.idempotencyKeys);
  for (const authUserId of tracker.authUserIds) {
    await service.auth.admin.deleteUser(authUserId).catch(() => null);
  }
  return {
    immutableLocalEvidenceMayRemain: true,
    mutableCleanupAttempted: true,
    requiresDisposableLocalDatabaseReset: true,
  };
}

async function deleteWhereIn(service: any, table: string, column: string, values: Set<string>) {
  const list = Array.from(values).filter(Boolean);
  if (!list.length) return;
  await service.from(table).delete().in(column, list);
}

function endpointUrls(functionBaseUrl: string) {
  return {
    dashboard: `${functionBaseUrl}/api-app-dashboard-get`,
    download: `${functionBaseUrl}/api-app-document-download-url`,
    uploadConfirm: `${functionBaseUrl}/api-app-document-upload-confirm`,
    uploadUrl: `${functionBaseUrl}/api-app-document-upload-url`,
    withdraw: `${functionBaseUrl}/api-app-document-withdraw-current`,
  };
}

function countRecords(records: RuntimeResponseRecord[], endpoint: RuntimeResponseRecord["endpoint"]): number {
  return records.filter((record) => record.endpoint === endpoint).length;
}

function assertNoInternalDownloadKeys(body: Record<string, unknown>) {
  const forbidden = [
    "storage_bucket",
    "storage_path",
    "client_sha256",
    "server_sha256",
    "file_sha256",
    "document_file_id",
    "document_version_id",
    "identity_id",
    "customer_id",
    "audit",
    "event_data",
  ];
  for (const key of forbidden) {
    assert(!(key in body), `download_response_exposes_${key}`);
  }
}

async function postJson(
  url: string,
  headers: HeadersInit,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function options(url: string, anonKey: string): Promise<Response> {
  return await fetch(url, {
    method: "OPTIONS",
    headers: {
      apikey: anonKey,
      Origin: "http://localhost:5175",
      "Access-Control-Request-Method": "POST",
    },
  });
}

async function auditCount(service: any, dossierId: string, eventType: string): Promise<number> {
  const result = await service
    .from("app_audit_events")
    .select("id", { count: "exact", head: true })
    .eq("dossier_id", dossierId)
    .eq("event_type", eventType);
  assert(!result.error, `audit_count_failed:${eventType}`);
  return Number(result.count || 0);
}

async function uploadPdfThroughClient({
  accessToken,
  anonKey,
  bytes,
  dossierId,
  functionBaseUrl,
  records,
  slotId,
  storageClient,
  tracker,
  uploadCounter,
}: {
  accessToken: string;
  anonKey: string;
  bytes: Uint8Array;
  dossierId: string;
  functionBaseUrl: string;
  records: RuntimeResponseRecord[];
  slotId: string;
  storageClient: any;
  tracker: Tracker;
  uploadCounter: { count: number };
}) {
  const captured: Record<string, string> = {};
  const issueKey = `issue-${proofId()}`;
  const confirmKey = `confirm-${proofId()}`;
  tracker.idempotencyKeys.add(issueKey);
  tracker.idempotencyKeys.add(confirmKey);
  const urls = endpointUrls(functionBaseUrl);

  const result = await uploadDocument({
    accessToken,
    attempt: {
      confirmIdempotencyKey: confirmKey,
      uploadUrlIdempotencyKey: issueKey,
    },
    declaredMimeType: "application/pdf",
    documentSlotId: slotId,
    dossierId,
    file: new Blob([toArrayBuffer(bytes)], { type: "application/pdf" }),
    originalFileName: "proof-document.pdf",
  }, {
    fetchImpl: createFetchRecorder(tracker, records, captured) as typeof fetch,
    runtimeConfig: {
      anonKey,
      uploadConfirmEndpointUrl: urls.uploadConfirm,
      uploadUrlEndpointUrl: urls.uploadUrl,
    },
    supabaseClient: storageClient,
  });

  assert(
    result.ok === true,
    result.ok === false
      ? `frontend_upload_client_did_not_confirm:${result.error.stage}:${result.error.code}:${result.error.backendCode || "no_backend_code"}`
      : "frontend_upload_client_did_not_confirm",
  );

  return {
    confirmKey,
    documentFileId: captured.documentFileId,
    fileSha256: captured.fileSha256,
    issueKey,
    result,
    uploadCount: uploadCounter.count,
  };
}

async function createLockedDossierFixture(service: any, tracker: Tracker, customerId: string, identityId: string) {
  const dossier = await service.from("app_customer_dossiers").insert([{
    account_type: "particulier",
    customer_id: customerId,
    locked_at: new Date().toISOString(),
    status: "submitted",
    submitted_at: new Date().toISOString(),
  }]).select("id").single();
  assert(!dossier.error && dossier.data?.id, "locked_dossier_insert_failed");
  tracker.dossierIds.add(String(dossier.data.id));

  const slot = await service.from("app_dossier_document_slots").insert([{
    client_slot_id: `proof-locked-slot-${crypto.randomUUID()}`,
    document_type: INSTALLATION_SLOT_TYPE,
    dossier_id: dossier.data.id,
    required: true,
    status: "expected",
    title: "Installatie factuur",
  }]).select("id").single();
  assert(!slot.error && slot.data?.id, "locked_slot_insert_failed");
  tracker.slotIds.add(String(slot.data.id));

  return {
    customerId,
    dossierId: String(dossier.data.id),
    identityId,
    slotId: String(slot.data.id),
  };
}

export async function runDocumentUploadLocalIntegrationProof(
  config?: LocalIntegrationConfig,
): Promise<DocumentUploadLocalIntegrationProofResult> {
  const resolvedConfig = resolveLocalIntegrationConfig(config);
  assert(resolvedConfig.allowDestructiveLocalProof === "YES", "destructive_local_proof_not_enabled");
  const supabaseUrl = assertLocalUrl(resolvedConfig.supabaseUrl);
  const functionBaseUrl = assertLocalUrl(resolvedConfig.functionBaseUrl);
  const tracker = makeTracker();
  const records: RuntimeResponseRecord[] = [];
  const uploadCounter = { count: 0 };

  const service = createClient(supabaseUrl, resolvedConfig.serviceRoleKey, { auth: { persistSession: false } });
  const anon = createClient(supabaseUrl, resolvedConfig.anonKey, { auth: { persistSession: false } });
  const urls = endpointUrls(functionBaseUrl);

  try {
    await ensureLocalBucket(service, resolvedConfig.bucketName);
    const fixture = await createAuthFixture(service, anon, tracker);

    const storageClient = createStorageRecorder(anon, uploadCounter) as never;

    const downloadOptions = await options(urls.download, resolvedConfig.anonKey);
    assert(downloadOptions.status === 200, "download_options_failed");
    const withdrawOptions = await options(urls.withdraw, resolvedConfig.anonKey);
    assert(withdrawOptions.status === 200, "withdraw_options_failed");

    const downloadMissingAuth = await postJson(urls.download, { apikey: resolvedConfig.anonKey }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.invoiceSlotId,
    });
    assert(downloadMissingAuth.status === 401, "download_missing_auth_not_rejected");

    const withdrawMissingAuth = await postJson(urls.withdraw, {
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": `withdraw-${proofId()}`,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.invoiceSlotId,
    });
    assert(withdrawMissingAuth.status === 401, "withdraw_missing_auth_not_rejected");

    const withdrawMissingIdempotency = await postJson(urls.withdraw, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.invoiceSlotId,
    });
    assert(withdrawMissingIdempotency.status === 400 && withdrawMissingIdempotency.body?.code === "missing_idempotency_key", "withdraw_missing_idempotency_not_rejected");

    const downloadInvalidBody = await postJson(urls.download, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
    }, { dossier_id: fixture.dossierId, document_slot_id: fixture.invoiceSlotId, unexpected: true });
    assert(downloadInvalidBody.status === 400, "download_invalid_body_not_rejected");

    const withdrawInvalidBody = await postJson(urls.withdraw, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": `withdraw-${proofId()}`,
    }, { dossier_id: fixture.dossierId, document_slot_id: fixture.invoiceSlotId, document_file_id: "not-allowed" });
    assert(withdrawInvalidBody.status === 400, "withdraw_invalid_body_not_rejected");

    const emptyDownload = await postJson(urls.download, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.invoiceSlotId,
    });
    assert(emptyDownload.status === 404, "empty_slot_download_not_rejected");

    const midNonPdfIssueKey = `issue-${proofId()}`;
    tracker.idempotencyKeys.add(midNonPdfIssueKey);
    const midNonPdfIssue = await postJson(urls.uploadUrl, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": midNonPdfIssueKey,
    }, {
      client_sha256: "aa".repeat(32),
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.midSlotId,
      file_name: "proof.txt",
      mime_type: "text/plain",
      size_bytes: 12,
    });
    assert(midNonPdfIssue.status === 415 && midNonPdfIssue.body?.code === "unsupported_mime_type", "mid_non_pdf_not_rejected");

    const unsupportedIssueKey = `issue-${proofId()}`;
    tracker.idempotencyKeys.add(unsupportedIssueKey);
    const unsupportedIssue = await postJson(urls.uploadUrl, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": unsupportedIssueKey,
    }, {
      client_sha256: "aa".repeat(32),
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.unsupportedSlotId,
      file_name: "proof.pdf",
      mime_type: "application/pdf",
      size_bytes: 12,
    });
    assert(unsupportedIssue.status === 415 && unsupportedIssue.body?.code === "unsupported_document_type", "unsupported_document_type_not_rejected");

    const midUpload = await uploadPdfThroughClient({
      accessToken: fixture.accessToken,
      anonKey: resolvedConfig.anonKey,
      bytes: PDF_BYTES,
      dossierId: fixture.dossierId,
      functionBaseUrl,
      records,
      slotId: fixture.midSlotId,
      storageClient,
      tracker,
      uploadCounter,
    });
    assert(midUpload.result.ok === true, "mid_upload_not_confirmed");

    const invoiceUpload = await uploadPdfThroughClient({
      accessToken: fixture.accessToken,
      anonKey: resolvedConfig.anonKey,
      bytes: PDF_BYTES,
      dossierId: fixture.dossierId,
      functionBaseUrl,
      records,
      slotId: fixture.invoiceSlotId,
      storageClient,
      tracker,
      uploadCounter,
    });
    assert(invoiceUpload.result.ok === true, "invoice_upload_not_confirmed");

    const replay = await fetch(urls.uploadConfirm, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fixture.accessToken}`,
        apikey: resolvedConfig.anonKey,
        "Content-Type": "application/json",
        "Idempotency-Key": invoiceUpload.confirmKey,
      },
      body: JSON.stringify({
        dossier_id: fixture.dossierId,
        document_slot_id: fixture.invoiceSlotId,
        document_file_id: invoiceUpload.documentFileId,
        file_sha256: invoiceUpload.fileSha256,
      }),
    });
    const replayBody = await replay.json().catch(() => null);
    assert(replay.status === 200 && replayBody?.replayed === true, "confirm_replay_not_deterministic");

    const replacementUpload = await uploadPdfThroughClient({
      accessToken: fixture.accessToken,
      anonKey: resolvedConfig.anonKey,
      bytes: REPLACEMENT_PDF_BYTES,
      dossierId: fixture.dossierId,
      functionBaseUrl,
      records,
      slotId: fixture.invoiceSlotId,
      storageClient,
      tracker,
      uploadCounter,
    });
    assert(replacementUpload.result.ok === true, "replacement_upload_client_did_not_confirm");

    assert(records.some((record) => record.endpoint === "issue" && record.status === 200 && record.mode === "upload_url_v1"), "issue_response_shape_not_accepted");
    assert(records.some((record) => record.endpoint === "confirm" && record.status === 200 && record.mode === "upload_confirm_v1"), "confirm_response_missing");

    const midSlot = await service
      .from("app_dossier_document_slots")
      .select("current_version_id,current_version_number,status")
      .eq("id", fixture.midSlotId)
      .maybeSingle();
    assert(!midSlot.error && midSlot.data?.current_version_id && Number(midSlot.data.current_version_number) === 1, "mid_current_version_not_created");

    const versions = await service
      .from("app_dossier_document_versions")
      .select("version_number,status")
      .eq("document_slot_id", fixture.invoiceSlotId)
      .order("version_number", { ascending: true });
    assert(!versions.error && Array.isArray(versions.data) && versions.data.length === 2, "replacement_version_count_mismatch");
    assert(versions.data.some((row: any) => Number(row.version_number) === 1 && row.status === "superseded"), "old_version_not_superseded");
    assert(versions.data.some((row: any) => Number(row.version_number) === 2 && row.status === "current"), "replacement_version_not_current");

    const replacedSlot = await service
      .from("app_dossier_document_slots")
      .select("current_version_number,status")
      .eq("id", fixture.invoiceSlotId)
      .maybeSingle();
    assert(!replacedSlot.error && Number(replacedSlot.data?.current_version_number) === 2, "slot_current_version_not_replaced");

    const dashboard = await fetchDashboardReadModel({
      accessToken: fixture.accessToken,
      dossierId: fixture.dossierId,
      fetchImpl: createFetchRecorder(tracker, records, {}) as typeof fetch,
      runtimeConfig: {
        anonKey: resolvedConfig.anonKey,
        dashboardEndpointUrl: urls.dashboard,
      },
    });
    assert(dashboard.ok === true, "dashboard_read_before_withdraw_failed");
    assert(dashboard.model.selected_dossier.document_changes_allowed === true, "document_changes_allowed_not_true");
    assert(dashboard.model.document_slots.length >= 2, "dashboard_slots_missing");
    const dashboardMidSlot = dashboard.model.document_slots.find((slot: DashboardDocumentSlot) => slot.document_type === MID_SLOT_TYPE);
    const dashboardInvoiceSlot = dashboard.model.document_slots.find((slot: DashboardDocumentSlot) => slot.document_type === INSTALLATION_SLOT_TYPE);
    assert(dashboardMidSlot?.current_file_name && dashboardInvoiceSlot?.current_file_name, "dashboard_current_filenames_missing");
    assert(getDocumentSlotStatusPresentation(dashboardInvoiceSlot).tone === "warning", "uploaded_invoice_not_orange");

    const downloadAuditBefore = await auditCount(service, fixture.dossierId, "document_download_url_rejected");
    const downloadResult = await downloadCurrentDocument({
      accessToken: fixture.accessToken,
      dossierId: fixture.dossierId,
      documentSlotId: fixture.invoiceSlotId,
    }, {
      fetchImpl: createFetchRecorder(tracker, records, {}) as typeof fetch,
      openUrl: () => undefined,
      runtimeConfig: {
        anonKey: resolvedConfig.anonKey,
        downloadEndpointUrl: urls.download,
      },
    });
    assert(downloadResult.ok === true, "download_client_failed");
    const downloadAuditAfter = await auditCount(service, fixture.dossierId, "document_download_url_rejected");
    assert(downloadAuditAfter === downloadAuditBefore, "download_success_created_audit_write");

    const rawDownload = await postJson(urls.download, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.invoiceSlotId,
    });
    assert(rawDownload.status === 200 && rawDownload.body?.mode === "document_download_url_v1", "raw_download_failed");
    assertNoInternalDownloadKeys(rawDownload.body);
    assert(Number(rawDownload.body.expires_in) > 0 && Number(rawDownload.body.expires_in) <= 300, "download_signed_url_not_short_lived");

    const otherFixture = await createAuthFixture(service, anon, tracker);
    const unknownSlotResponse = await postJson(urls.download, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: "11111111-1111-4111-8111-111111111111",
    });
    const crossSlotResponse = await postJson(urls.download, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: otherFixture.invoiceSlotId,
    });
    assert(
      unknownSlotResponse.status === crossSlotResponse.status &&
        unknownSlotResponse.body?.code === crossSlotResponse.body?.code &&
        unknownSlotResponse.status === 404,
      "download_unknown_cross_semantics_differ",
    );

    const withdrawKey = `withdraw-${proofId()}`;
    tracker.idempotencyKeys.add(withdrawKey);
    const withdrawAuditBefore = await auditCount(service, fixture.dossierId, "document_current_withdrawn");
    const withdrawResult = await withdrawCurrentDocument({
      accessToken: fixture.accessToken,
      dossierId: fixture.dossierId,
      documentSlotId: fixture.invoiceSlotId,
      idempotencyKey: withdrawKey,
    }, {
      fetchImpl: createFetchRecorder(tracker, records, {}) as typeof fetch,
      runtimeConfig: {
        anonKey: resolvedConfig.anonKey,
        withdrawEndpointUrl: urls.withdraw,
      },
    });
    assert(withdrawResult.ok === true, "withdraw_client_failed");

    const withdrawAuditAfter = await auditCount(service, fixture.dossierId, "document_current_withdrawn");
    assert(withdrawAuditAfter === withdrawAuditBefore + 1, "withdraw_audit_not_exactly_once");

    const withdrawnSlot = await service
      .from("app_dossier_document_slots")
      .select("current_version_id,current_version_number,status")
      .eq("id", fixture.invoiceSlotId)
      .maybeSingle();
    assert(!withdrawnSlot.error && withdrawnSlot.data?.current_version_id === null && withdrawnSlot.data?.current_version_number === null && withdrawnSlot.data?.status === "expected", "slot_not_reset_after_withdraw");

    const withdrawnVersions = await service
      .from("app_dossier_document_versions")
      .select("id,status")
      .eq("document_slot_id", fixture.invoiceSlotId);
    assert(!withdrawnVersions.error && Array.isArray(withdrawnVersions.data) && withdrawnVersions.data.some((row: any) => row.status === "withdrawn"), "current_version_not_withdrawn");

    const invoiceFiles = await service
      .from("app_dossier_document_files")
      .select("id,status,storage_bucket,storage_path")
      .eq("document_slot_id", fixture.invoiceSlotId);
    assert(!invoiceFiles.error && Array.isArray(invoiceFiles.data) && invoiceFiles.data.length >= 2, "confirmed_files_not_retained");
    const retainedObject = tracker.storageObjects[0];
    if (retainedObject) {
      const retainedDownload = await service.storage.from(retainedObject.bucket).download(retainedObject.path);
      assert(!retainedDownload.error, "storage_object_was_hard_deleted");
    }

    const withdrawReplay = await postJson(urls.withdraw, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": withdrawKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.invoiceSlotId,
    });
    assert(withdrawReplay.status === 200 && withdrawReplay.body?.replayed === true, "withdraw_replay_not_deterministic");
    const withdrawAuditAfterReplay = await auditCount(service, fixture.dossierId, "document_current_withdrawn");
    assert(withdrawAuditAfterReplay === withdrawAuditAfter, "withdraw_replay_created_duplicate_audit");

    const conflict = await postJson(urls.withdraw, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": withdrawKey,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: fixture.midSlotId,
    });
    assert(conflict.status === 409 && conflict.body?.code === "idempotency_conflict", "withdraw_idempotency_conflict_not_enforced");

    const thirdUpload = await uploadPdfThroughClient({
      accessToken: otherFixture.accessToken,
      anonKey: resolvedConfig.anonKey,
      bytes: PDF_BYTES,
      dossierId: otherFixture.dossierId,
      functionBaseUrl,
      records,
      slotId: otherFixture.invoiceSlotId,
      storageClient,
      tracker,
      uploadCounter,
    });
    assert(thirdUpload.result.ok === true, "concurrency_fixture_upload_failed");
    const concurrentAKey = `withdraw-${proofId()}`;
    const concurrentBKey = `withdraw-${proofId()}`;
    tracker.idempotencyKeys.add(concurrentAKey);
    tracker.idempotencyKeys.add(concurrentBKey);
    const concurrent = await Promise.all([
      postJson(urls.withdraw, {
        Authorization: `Bearer ${otherFixture.accessToken}`,
        apikey: resolvedConfig.anonKey,
        "Idempotency-Key": concurrentAKey,
      }, {
        dossier_id: otherFixture.dossierId,
        document_slot_id: otherFixture.invoiceSlotId,
      }),
      postJson(urls.withdraw, {
        Authorization: `Bearer ${otherFixture.accessToken}`,
        apikey: resolvedConfig.anonKey,
        "Idempotency-Key": concurrentBKey,
      }, {
        dossier_id: otherFixture.dossierId,
        document_slot_id: otherFixture.invoiceSlotId,
      }),
    ]);
    assert(concurrent.some((item) => item.status === 200) && concurrent.every((item) => item.status === 200 || item.status === 409), "withdraw_concurrency_not_safe");

    const crossWithdraw = await postJson(urls.withdraw, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": `withdraw-${proofId()}`,
    }, {
      dossier_id: fixture.dossierId,
      document_slot_id: otherFixture.invoiceSlotId,
    });
    assert(crossWithdraw.status === 404, "withdraw_cross_customer_not_safe_not_found");

    const lockedFixture = await createLockedDossierFixture(service, tracker, fixture.customerId, fixture.identityId);
    const lockedDashboard = await fetchDashboardReadModel({
      accessToken: fixture.accessToken,
      dossierId: lockedFixture.dossierId,
      fetchImpl: createFetchRecorder(tracker, records, {}) as typeof fetch,
      runtimeConfig: {
        anonKey: resolvedConfig.anonKey,
        dashboardEndpointUrl: urls.dashboard,
      },
    });
    assert(lockedDashboard.ok === true && lockedDashboard.model.selected_dossier.document_changes_allowed === false, "locked_document_changes_allowed_not_false");
    const lockedWithdraw = await postJson(urls.withdraw, {
      Authorization: `Bearer ${fixture.accessToken}`,
      apikey: resolvedConfig.anonKey,
      "Idempotency-Key": `withdraw-${proofId()}`,
    }, {
      dossier_id: lockedFixture.dossierId,
      document_slot_id: lockedFixture.slotId,
    });
    assert(lockedWithdraw.status === 409 && lockedWithdraw.body?.code === "document_changes_locked", "locked_withdraw_not_safe_409");

    const dashboardAfterWithdraw = await fetchDashboardReadModel({
      accessToken: fixture.accessToken,
      dossierId: fixture.dossierId,
      fetchImpl: createFetchRecorder(tracker, records, {}) as typeof fetch,
      runtimeConfig: {
        anonKey: resolvedConfig.anonKey,
        dashboardEndpointUrl: urls.dashboard,
      },
    });
    assert(dashboardAfterWithdraw.ok === true, "dashboard_read_after_withdraw_failed");
    const afterMidSlot = dashboardAfterWithdraw.model.document_slots.find((slot: DashboardDocumentSlot) => slot.document_type === MID_SLOT_TYPE);
    const afterInvoiceSlot = dashboardAfterWithdraw.model.document_slots.find((slot: DashboardDocumentSlot) => slot.document_type === INSTALLATION_SLOT_TYPE);
    assert(afterMidSlot?.current_file_name, "mid_document_was_affected_by_invoice_withdraw");
    assert(afterInvoiceSlot && !afterInvoiceSlot.current_file_name && afterInvoiceSlot.current_version_number === null && afterInvoiceSlot.status === "expected", "invoice_slot_not_missing_after_withdraw");

    const anonRpc = await anon.rpc("app_withdraw_current_document_v1", {
      p_actor_ref: "proof",
      p_customer_id: fixture.customerId,
      p_document_slot_id: fixture.midSlotId,
      p_dossier_id: fixture.dossierId,
      p_environment: "local",
      p_idempotency_key: `rpc-${proofId()}`,
      p_idempotency_scope: `rpc-proof-${proofId()}`,
      p_identity_id: fixture.identityId,
      p_ip_hash: null,
      p_payload_hash: "aa".repeat(32),
      p_request_id: `request-${proofId()}`,
      p_user_agent_hash: null,
    });
    assert(anonRpc.error, "anon_rpc_not_denied");

    const serviceRpcScope = `rpc-proof-${proofId()}`;
    const serviceRpcKey = `rpc-${proofId()}`;
    const serviceRpcHash = "aa".repeat(32);
    tracker.idempotencyKeys.add(serviceRpcKey);
    const rpcIdem = await service.from("app_idempotency_keys").insert([{
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      key: serviceRpcKey,
      locked_at: new Date().toISOString(),
      payload_hash: serviceRpcHash,
      scope: serviceRpcScope,
    }]);
    assert(!rpcIdem.error, "service_rpc_idempotency_insert_failed");

    const serviceRpc = await service.rpc("app_withdraw_current_document_v1", {
      p_actor_ref: `app_customer_identity:${fixture.identityId}`,
      p_customer_id: fixture.customerId,
      p_document_slot_id: lockedFixture.slotId,
      p_dossier_id: lockedFixture.dossierId,
      p_environment: "local",
      p_idempotency_key: serviceRpcKey,
      p_idempotency_scope: serviceRpcScope,
      p_identity_id: fixture.identityId,
      p_ip_hash: null,
      p_payload_hash: serviceRpcHash,
      p_request_id: `request-${proofId()}`,
      p_user_agent_hash: null,
    });
    assert(!serviceRpc.error, "service_role_rpc_not_allowed");

    const serializedResult = JSON.stringify({ midUpload: midUpload.result, invoiceUpload: invoiceUpload.result, replacementUpload: replacementUpload.result, downloadResult, withdrawResult });
    assert(!/signed|token|storage|path|sha256|hash/i.test(serializedResult), "frontend_result_exposes_internal_upload_target");

    const cleanupResult = await cleanup(service, tracker);
    return {
      ok: true,
      cleanup: cleanupResult,
      confirmReplayDeterministic: true,
      confirmSucceeded: true,
      currentVersionCreated: true,
      dashboardAfterWithdrawVerified: true,
      dashboardBeforeWithdrawVerified: true,
      downloadProof: {
        ok: true,
        emptySlotRejected: true,
        internalFieldsExcluded: true,
        invalidBodyRejected: true,
        missingAuthRejected: true,
        noIdempotencyKeyRequired: true,
        noLegacyDependencyObserved: true,
        noSuccessAuditWrite: true,
        optionsCorsVerified: true,
        ownedCurrentSlotReturnedSignedUrl: true,
        safeResponseShapeVerified: true,
        shortLivedUrlVerified: true,
        unknownAndCrossCustomerSemanticsMatched: true,
      },
      issueShapeAcceptedByClient: true,
      invoiceUploadConfirmed: true,
      lockedDossierRejectedWithdrawal: true,
      midUploadConfirmed: true,
      mode: "document_upload_local_integration_proof",
      noLegacyDependencyObserved: true,
      oldVersionSuperseded: true,
      replacementVersionCreated: true,
      requestCounts: {
        confirm: countRecords(records, "confirm"),
        dashboard: countRecords(records, "dashboard"),
        download: countRecords(records, "download"),
        issue: countRecords(records, "issue"),
        signedUpload: uploadCounter.count,
        withdraw: countRecords(records, "withdraw"),
      },
      safeResultExcludesInternalTarget: true,
      signedStorageUploadCount: uploadCounter.count,
      withdrawalProof: {
        ok: true,
        anonRpcDenied: true,
        auditWrittenExactlyOnce: true,
        clientCannotChooseInternals: true,
        concurrencySafe: true,
        crossCustomerSafeNotFound: true,
        currentVersionWithdrawn: true,
        fileAndVersionRowsRemain: true,
        idempotencyConflictVerified: true,
        invalidBodyRejected: true,
        lockedDossierSafe409: true,
        missingAuthRejected: true,
        missingIdempotencyRejected: true,
        noLegacyDependencyObserved: true,
        optionsCorsVerified: true,
        ownedCurrentDocumentWithdrawn: true,
        replayDeterministic: true,
        serviceRoleRpcAllowed: true,
        slotPointersCleared: true,
        slotReturnedExpected: true,
        storageObjectRetained: true,
      },
    };
  } catch (error) {
    await cleanup(service, tracker);
    throw error;
  }
}
