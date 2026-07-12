// Local destructive proof only for api-app-document-upload-url + upload-confirm.
// Requires explicit ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Refuses non-local Supabase/function targets before fixture mutation.
// May leave immutable document evidence rows in the local database.
// Run only against a disposable local database; reset/drop it after proof.
// Do not import this from endpoint runtime. Do not print keys, tokens,
// signed URLs, upload tokens, raw bytes, PDF text, or storage paths.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type ProofContext = {
  service: any;
  anon: any;
  functionBaseUrl: string;
  anonKey: string;
  primaryToken: string;
  secondaryToken: string;
  primaryCustomerId: string;
  secondaryCustomerId: string;
  tracker: ProofTracker;
};

type HttpResult = { status: number; body: any };

type ProofTracker = {
  authUserIds: Set<string>;
  customerIds: Set<string>;
  identityIds: Set<string>;
  dossierIds: Set<string>;
  slotIds: Set<string>;
  documentFileIds: Set<string>;
  documentVersionIds: Set<string>;
  idempotencyKeys: Set<string>;
  requestIds: Set<string>;
  storageObjects: Array<{ bucket: string; path: string }>;
  bucketExistedBefore: boolean;
  bucketCreatedByProof: boolean;
};

type CleanupReport = {
  bucket_existed_before: boolean;
  bucket_created_by_proof: boolean;
  cleaned_mutable_fixtures: Record<string, number | string>;
  expected_retained_immutable_evidence: Record<string, number | string>;
  immutable_evidence_retained: true;
  requires_disposable_local_database_reset: true;
  notes: string[];
};

type IssuedUpload = {
  documentFileId: string;
  documentSlotId: string;
  bucket: string;
  path: string;
  token: string;
  hash: string;
  size: number;
};

const BUCKET = "app-documents";

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function assert(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
}

function proofId(): string {
  return `confirm-proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function createTracker(bucketExistedBefore: boolean): ProofTracker {
  return {
    authUserIds: new Set(),
    customerIds: new Set(),
    identityIds: new Set(),
    dossierIds: new Set(),
    slotIds: new Set(),
    documentFileIds: new Set(),
    documentVersionIds: new Set(),
    idempotencyKeys: new Set(),
    requestIds: new Set(),
    storageObjects: [],
    bucketExistedBefore,
    bucketCreatedByProof: !bucketExistedBefore,
  };
}

function responseCode(res: HttpResult): string {
  return String(res.body?.code || res.body?.error || res.body?.msg || "no_code");
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = toArrayBuffer(bytes);
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pdfBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4\n%ENVAL ${label}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`);
}

function nonPdfBytes(label: string): Uint8Array {
  return new TextEncoder().encode(`ENVAL ${label} non-pdf bytes`);
}

function assertLocalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    throw new Error("non_local_supabase_target_rejected");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1" && hostname !== "[::1]") {
    throw new Error("non_local_supabase_target_rejected");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("non_local_supabase_target_rejected");
  }

  return parsed.toString().replace(/\/$/, "");
}

function requireDestructiveLocalProofConfig(): { supabaseUrl: string; functionBaseUrl: string } {
  if (Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") !== "YES") {
    throw new Error("destructive_local_proof_not_enabled");
  }

  const supabaseUrl = assertLocalUrl(requireEnv("SUPABASE_URL"));
  const functionBaseUrl = assertLocalUrl(
    Deno.env.get("FUNCTION_BASE_URL")?.trim() || `${supabaseUrl}/functions/v1`,
  );

  return { supabaseUrl, functionBaseUrl };
}

async function request(
  ctx: ProofContext,
  path: string,
  init: RequestInit,
  token = ctx.primaryToken,
): Promise<HttpResult> {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", ctx.anonKey);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${ctx.functionBaseUrl}/${path}`, { ...init, headers });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_e) {
    body = { parse_error: true };
  }
  return { status: res.status, body };
}

async function postJson(
  ctx: ProofContext,
  path: string,
  idempotencyKey: string,
  body: unknown,
  token = ctx.primaryToken,
): Promise<HttpResult> {
  ctx.tracker.idempotencyKeys.add(idempotencyKey);
  return await request(ctx, path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  }, token);
}

async function createAuthUser(
  ctx: { service: any; anon: any },
  email: string,
): Promise<{ userId: string; token: string }> {
  const password = `Aa1!${crypto.randomUUID()}x`;
  const created = await ctx.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user?.id) throw new Error("auth user create failed");

  const session = await ctx.anon.auth.signInWithPassword({ email, password });
  if (session.error || !session.data.session?.access_token) throw new Error("auth sign-in failed");

  return {
    userId: created.data.user.id,
    token: session.data.session.access_token,
  };
}

async function insertAppIdentity(
  ctx: ProofContext,
  service: any,
  userId: string,
  accountType: "particulier" | "zakelijk",
  email: string,
): Promise<{ customerId: string }> {
  const customer = await service.from("app_customers").insert([{
    customer_type: accountType,
    display_name: email,
    primary_email_normalized: email,
    status: "active",
  }]).select("id").single();
  if (customer.error || !customer.data?.id) throw new Error("customer insert failed");
  ctx.tracker.customerIds.add(String(customer.data.id));

  const identity = await service.from("app_customer_identities").insert([{
    customer_id: customer.data.id,
    auth_user_id: userId,
    email_normalized: email,
    email_verified_at: new Date().toISOString(),
    status: "active",
  }]).select("id").single();
  if (identity.error || !identity.data?.id) throw new Error("identity insert failed");
  ctx.tracker.identityIds.add(String(identity.data.id));

  return { customerId: String(customer.data.id) };
}

async function createDossierAndSlot(
  ctx: ProofContext,
  customerId = ctx.primaryCustomerId,
  slotStatus = "expected",
): Promise<{ dossierId: string; slotId: string }> {
  const dossier = await ctx.service.from("app_customer_dossiers").insert([{
    customer_id: customerId,
    account_type: customerId === ctx.secondaryCustomerId ? "zakelijk" : "particulier",
    status: "submitted",
    submitted_at: new Date().toISOString(),
  }]).select("id").single();
  if (dossier.error || !dossier.data?.id) throw new Error("dossier insert failed");
  ctx.tracker.dossierIds.add(String(dossier.data.id));

  const slot = await ctx.service.from("app_dossier_document_slots").insert([{
    dossier_id: dossier.data.id,
    client_slot_id: `proof-slot-${crypto.randomUUID()}`,
    document_type: "invoice_or_ownership_evidence",
    status: slotStatus,
    required: true,
    title: "Factuur installatie",
  }]).select("id").single();
  if (slot.error || !slot.data?.id) throw new Error("slot insert failed");
  ctx.tracker.slotIds.add(String(slot.data.id));

  return { dossierId: String(dossier.data.id), slotId: String(slot.data.id) };
}

async function createContext(): Promise<ProofContext> {
  const { supabaseUrl, functionBaseUrl } = requireDestructiveLocalProofConfig();
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const buckets = await service.storage.listBuckets();
  const bucketExistedBefore = Array.isArray(buckets.data) && buckets.data.some((bucket: any) => bucket.name === BUCKET);
  const tracker = createTracker(bucketExistedBefore);
  if (!bucketExistedBefore) {
    const created = await service.storage.createBucket(BUCKET, { public: false });
    if (created.error) throw new Error("proof bucket create failed");
  }

  const emailA = `${proofId()}@example.invalid`;
  const emailB = `${proofId()}@example.invalid`;
  const primary = await createAuthUser({ service, anon }, emailA);
  const secondary = await createAuthUser({ service, anon }, emailB);
  tracker.authUserIds.add(primary.userId);
  tracker.authUserIds.add(secondary.userId);

  const ctx: ProofContext = {
    service,
    anon,
    functionBaseUrl,
    anonKey,
    primaryToken: primary.token,
    secondaryToken: secondary.token,
    primaryCustomerId: "",
    secondaryCustomerId: "",
    tracker,
  };

  const primaryIdentity = await insertAppIdentity(ctx, service, primary.userId, "particulier", emailA);
  const secondaryIdentity = await insertAppIdentity(ctx, service, secondary.userId, "zakelijk", emailB);
  ctx.primaryCustomerId = primaryIdentity.customerId;
  ctx.secondaryCustomerId = secondaryIdentity.customerId;
  return ctx;
}

function setToArray(values: Set<string>): string[] {
  return Array.from(values).filter(Boolean);
}

async function deleteWhereIn(ctx: ProofContext, table: string, column: string, values: Set<string>): Promise<void> {
  const ids = setToArray(values);
  if (!ids.length) return;
  try {
    await ctx.service.from(table).delete().in(column, ids);
  } catch (_e) {
    // Cleanup is best-effort; final scoped counts report any remaining rows.
  }
}

async function countWhereIn(ctx: ProofContext, table: string, column: string, values: Set<string>): Promise<number | string> {
  const ids = setToArray(values);
  if (!ids.length) return 0;
  const result = await ctx.service.from(table).select("id", { count: "exact", head: true }).in(column, ids);
  if (result.error) return "count_failed";
  return Number(result.count || 0);
}

async function storageObjectExists(ctx: ProofContext, bucket: string, path: string): Promise<boolean> {
  const lastSlash = path.lastIndexOf("/");
  const prefix = lastSlash >= 0 ? path.slice(0, lastSlash) : "";
  const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
  const listed = await ctx.service.storage.from(bucket).list(prefix, { limit: 100 });
  if (listed.error || !Array.isArray(listed.data)) return true;
  return listed.data.some((entry: any) => entry.name === name);
}

async function cleanup(ctx: ProofContext): Promise<CleanupReport> {
  const notes: string[] = [];
  const storageByBucket = new Map<string, string[]>();
  for (const object of ctx.tracker.storageObjects) {
    const paths = storageByBucket.get(object.bucket) || [];
    paths.push(object.path);
    storageByBucket.set(object.bucket, paths);
  }

  for (const [bucket, paths] of storageByBucket) {
    await ctx.service.storage.from(bucket).remove(paths).catch(() => null);
  }

  await deleteWhereIn(ctx, "app_audit_events", "idempotency_key", ctx.tracker.idempotencyKeys);
  await deleteWhereIn(ctx, "app_audit_events", "request_id", ctx.tracker.requestIds);
  await deleteWhereIn(ctx, "app_idempotency_keys", "key", ctx.tracker.idempotencyKeys);

  await deleteWhereIn(ctx, "app_dossier_document_versions", "id", ctx.tracker.documentVersionIds);
  await deleteWhereIn(ctx, "app_dossier_document_files", "id", ctx.tracker.documentFileIds);
  await deleteWhereIn(ctx, "app_dossier_document_slots", "id", ctx.tracker.slotIds);
  await deleteWhereIn(ctx, "app_customer_dossiers", "id", ctx.tracker.dossierIds);
  await deleteWhereIn(ctx, "app_customer_identities", "id", ctx.tracker.identityIds);
  await deleteWhereIn(ctx, "app_customers", "id", ctx.tracker.customerIds);

  for (const id of ctx.tracker.authUserIds) {
    await ctx.service.auth.admin.deleteUser(id).catch(() => null);
  }

  if (ctx.tracker.bucketCreatedByProof) {
    await ctx.service.storage.emptyBucket(BUCKET).catch(() => null);
    await ctx.service.storage.deleteBucket(BUCKET).catch(() => null);
  }

  const remainingStorageObjects = await Promise.all(
    ctx.tracker.storageObjects.map((object) => storageObjectExists(ctx, object.bucket, object.path)),
  );

  const authRemaining: number[] = await Promise.all(setToArray(ctx.tracker.authUserIds).map(async (id) => {
    const user = await ctx.service.auth.admin.getUserById(id).catch(() => ({ data: null, error: true }));
    return user?.data?.user?.id ? 1 : 0;
  }));

  const bucketList = await ctx.service.storage.listBuckets();
  const bucketExists = Array.isArray(bucketList.data) && bucketList.data.some((bucket: any) => bucket.name === BUCKET);

  const cleaned_mutable_fixtures = {
    auth_users: authRemaining.reduce((sum, value) => sum + value, 0),
    app_customer_identities: await countWhereIn(ctx, "app_customer_identities", "id", ctx.tracker.identityIds),
    app_audit_events: await countWhereIn(ctx, "app_audit_events", "idempotency_key", ctx.tracker.idempotencyKeys),
    app_idempotency_keys: await countWhereIn(ctx, "app_idempotency_keys", "key", ctx.tracker.idempotencyKeys),
    proof_storage_objects: remainingStorageObjects.filter(Boolean).length,
    app_documents_bucket_exists: bucketExists ? "yes" : "no",
  };

  const expected_retained_immutable_evidence = {
    app_customers: await countWhereIn(ctx, "app_customers", "id", ctx.tracker.customerIds),
    app_customer_dossiers: await countWhereIn(ctx, "app_customer_dossiers", "id", ctx.tracker.dossierIds),
    app_dossier_document_slots: await countWhereIn(ctx, "app_dossier_document_slots", "id", ctx.tracker.slotIds),
    app_dossier_document_files: await countWhereIn(ctx, "app_dossier_document_files", "id", ctx.tracker.documentFileIds),
    app_dossier_document_versions: await countWhereIn(ctx, "app_dossier_document_versions", "id", ctx.tracker.documentVersionIds),
  };

  notes.push("Immutable customer/dossier/slot/file/version proof evidence is expected to remain under normal service-role runtime contracts.");
  notes.push("Remove retained immutable proof evidence only by resetting or dropping the disposable local proof database outside runtime endpoint contracts.");

  return {
    bucket_existed_before: ctx.tracker.bucketExistedBefore,
    bucket_created_by_proof: ctx.tracker.bucketCreatedByProof,
    cleaned_mutable_fixtures,
    expected_retained_immutable_evidence,
    immutable_evidence_retained: true,
    requires_disposable_local_database_reset: true,
    notes,
  };
}

async function issueUploadUrl(
  ctx: ProofContext,
  dossierId: string,
  slotId: string,
  bytes: Uint8Array,
  key = `issue-${proofId()}`,
  fileName = "invoice.pdf",
  mimeType = "application/pdf",
  includeClientSha = true,
): Promise<{ issued: IssuedUpload; response: HttpResult; key: string }> {
  const hash = await sha256Hex(bytes);
  const body: Record<string, unknown> = {
    dossier_id: dossierId,
    document_slot_id: slotId,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
  };
  if (includeClientSha) body.client_sha256 = hash;
  const response = await postJson(ctx, "api-app-document-upload-url", key, body);

  assert(response.status === 200 && response.body?.ok === true, `upload-url issue failed: ${response.status}:${responseCode(response)}`);
  assert(response.body?.document_file_id, "upload-url response missing file id");
  assert(response.body?.storage_bucket && response.body?.storage_path && response.body?.upload_token, "upload-url response missing upload target");
  ctx.tracker.documentFileIds.add(String(response.body.document_file_id));
  if (response.body?.request_id) ctx.tracker.requestIds.add(String(response.body.request_id));
  ctx.tracker.storageObjects.push({
    bucket: String(response.body.storage_bucket),
    path: String(response.body.storage_path),
  });

  return {
    key,
    response,
    issued: {
      documentFileId: String(response.body.document_file_id),
      documentSlotId: String(response.body.document_slot_id),
      bucket: String(response.body.storage_bucket),
      path: String(response.body.storage_path),
      token: String(response.body.upload_token),
      hash,
      size: bytes.byteLength,
    },
  };
}

async function uploadSigned(ctx: ProofContext, issued: IssuedUpload, bytes: Uint8Array): Promise<void> {
  const input = toArrayBuffer(bytes);
  const blob = new Blob([input], { type: "application/pdf" });
  const uploaded = await ctx.anon.storage.from(issued.bucket).uploadToSignedUrl(issued.path, issued.token, blob, {
    contentType: "application/pdf",
  });
  if (uploaded.error) throw new Error("signed upload failed");
}

async function confirmUpload(
  ctx: ProofContext,
  dossierId: string,
  slotId: string,
  fileId: string,
  hash: string,
  key = `confirm-${proofId()}`,
  token = ctx.primaryToken,
): Promise<HttpResult> {
  return await postJson(ctx, "api-app-document-upload-confirm", key, {
    dossier_id: dossierId,
    document_slot_id: slotId,
    document_file_id: fileId,
    file_sha256: hash,
  }, token);
}

async function assertSingleCurrentVersion(ctx: ProofContext, slotId: string, expectedFileId: string, expectedVersionNumber: number) {
  const versions = await ctx.service
    .from("app_dossier_document_versions")
    .select("id,status,version_number,document_file_id,replaced_by_version_id")
    .eq("document_slot_id", slotId);
  if (versions.error) throw new Error("version select failed");

  const rows = Array.isArray(versions.data) ? versions.data : [];
  for (const row of rows) {
    if (row?.id) ctx.tracker.documentVersionIds.add(String(row.id));
  }
  const current = rows.filter((row: any) => row.status === "current");
  assert(current.length === 1, "expected exactly one current version");
  assert(String(current[0].document_file_id) === expectedFileId, "current version file mismatch");
  assert(Number(current[0].version_number) === expectedVersionNumber, "current version number mismatch");
  return rows;
}

async function assertConfirmSideEffects(ctx: ProofContext, issued: IssuedUpload, versionNumber: number) {
  const fileRow = await ctx.service
    .from("app_dossier_document_files")
    .select("status,server_sha256,stored_size_bytes,detected_mime_type,confirmed_at,confirmed_request_id")
    .eq("id", issued.documentFileId)
    .single();
  assert(fileRow.data?.status === "confirmed", "file was not confirmed");
  assert(fileRow.data?.server_sha256 === issued.hash, "server hash mismatch in file row");
  assert(Number(fileRow.data?.stored_size_bytes) === issued.size, "stored size mismatch in file row");

  const rows = await assertSingleCurrentVersion(ctx, issued.documentSlotId, issued.documentFileId, versionNumber);
  const slotRow = await ctx.service
    .from("app_dossier_document_slots")
    .select("current_version_id,current_version_number,file_sha256")
    .eq("id", issued.documentSlotId)
    .single();
  const current = rows.find((row: any) => row.status === "current");
  assert(slotRow.data?.current_version_id === current?.id, "slot current pointer mismatch");
  assert(Number(slotRow.data?.current_version_number) === versionNumber, "slot current version number mismatch");
  assert(slotRow.data?.file_sha256 === issued.hash, "slot file hash mismatch");
}

async function assertAuditAndIdempotency(ctx: ProofContext, requestId: string, key: string, expectedStatus: number) {
  ctx.tracker.requestIds.add(requestId);
  ctx.tracker.idempotencyKeys.add(key);
  const audit = await ctx.service
    .from("app_audit_events")
    .select("id")
    .eq("request_id", requestId);
  assert(!audit.error && Array.isArray(audit.data) && audit.data.length >= 1, "audit row missing");

  const idem = await ctx.service
    .from("app_idempotency_keys")
    .select("response_status,response_body")
    .eq("key", key)
    .maybeSingle();
  assert(!idem.error && Number(idem.data?.response_status) === expectedStatus, "idempotency response status mismatch");
}

async function main() {
  const ctx = await createContext();
  const passed: string[] = [];
  const http: Record<string, string> = {};

  try {
    const options = await fetch(`${ctx.functionBaseUrl}/api-app-document-upload-confirm`, {
      method: "OPTIONS",
      headers: {
        apikey: ctx.anonKey,
        Origin: "http://localhost:5175",
        "Access-Control-Request-Method": "POST",
      },
    });
    assert(options.status === 200, `OPTIONS failed: ${options.status}`);
    passed.push("confirm OPTIONS/CORS succeeds through gateway");

    const noIdem = await request(ctx, "api-app-document-upload-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert(noIdem.status === 400 && responseCode(noIdem) === "missing_idempotency_key", "missing idempotency did not reject");
    passed.push("confirm missing Idempotency-Key rejects");

    const invalidJson = await request(ctx, "api-app-document-upload-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `badjson-${proofId()}` },
      body: "{",
    });
    assert(invalidJson.status === 400 && responseCode(invalidJson) === "invalid_json", "invalid JSON did not reject");
    passed.push("confirm invalid JSON rejects");

    const base = await createDossierAndSlot(ctx);

    const missingAuth = await request(ctx, "api-app-document-upload-confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": `noauth-${proofId()}` },
      body: JSON.stringify({
        dossier_id: base.dossierId,
        document_slot_id: base.slotId,
        document_file_id: crypto.randomUUID(),
        file_sha256: "0".repeat(64),
      }),
    }, "");
    assert(missingAuth.status === 401, "missing auth did not reject");
    passed.push("missing gateway Authorization rejects");

    const cross = await confirmUpload(ctx, base.dossierId, base.slotId, crypto.randomUUID(), "0".repeat(64), `cross-${proofId()}`, ctx.secondaryToken);
    assert(cross.status === 404, "cross-customer dossier access did not reject");
    passed.push("cross-customer dossier access rejects");

    const validCase = await createDossierAndSlot(ctx);
    const validBytes = pdfBytes("valid-one");
    const issueKey = `issue-valid-${proofId()}`;
    const issued = await issueUploadUrl(ctx, validCase.dossierId, validCase.slotId, validBytes, issueKey);
    assert(issued.response.body?.mode === "upload_url_v1", "upload-url did not return mode upload_url_v1");
    passed.push("upload-url valid issue succeeds through gateway");

    const issueReplay = await postJson(ctx, "api-app-document-upload-url", issueKey, {
      dossier_id: validCase.dossierId,
      document_slot_id: validCase.slotId,
      file_name: "invoice.pdf",
      mime_type: "application/pdf",
      size_bytes: validBytes.byteLength,
      client_sha256: issued.issued.hash,
    });
    assert(issueReplay.status === 200 && issueReplay.body?.replayed === true, "upload-url same-key replay failed");
    passed.push("upload-url same-key replay succeeds");

    const issueConflict = await postJson(ctx, "api-app-document-upload-url", issueKey, {
      dossier_id: validCase.dossierId,
      document_slot_id: validCase.slotId,
      file_name: "invoice-other.pdf",
      mime_type: "application/pdf",
      size_bytes: validBytes.byteLength,
      client_sha256: issued.issued.hash,
    });
    assert(issueConflict.status === 409 && responseCode(issueConflict) === "idempotency_conflict", "upload-url conflict failed");
    passed.push("upload-url idempotency conflict rejects");

    const activeConflict = await postJson(ctx, "api-app-document-upload-url", `active-${proofId()}`, {
      dossier_id: validCase.dossierId,
      document_slot_id: validCase.slotId,
      file_name: "invoice.pdf",
      mime_type: "application/pdf",
      size_bytes: validBytes.byteLength,
      client_sha256: issued.issued.hash,
    });
    assert(activeConflict.status === 409 && responseCode(activeConflict) === "active_upload_exists", "active upload conflict failed");
    passed.push("upload-url active-upload conflict rejects");

    await uploadSigned(ctx, issued.issued, validBytes);
    const confirmKey = `confirm-valid-${proofId()}`;
    const valid = await confirmUpload(ctx, validCase.dossierId, validCase.slotId, issued.issued.documentFileId, issued.issued.hash, confirmKey);
    assert(valid.status === 200 && valid.body?.ok === true && valid.body?.mode === "upload_confirm_v1", `valid confirm failed: ${valid.status}:${responseCode(valid)}`);
    if (valid.body?.request_id) ctx.tracker.requestIds.add(String(valid.body.request_id));
    if (valid.body?.document_version_id) ctx.tracker.documentVersionIds.add(String(valid.body.document_version_id));
    assert(valid.body?.version_number === 1, "valid confirm did not create version 1");
    await assertConfirmSideEffects(ctx, issued.issued, 1);
    await assertAuditAndIdempotency(ctx, String(valid.body.request_id), confirmKey, 200);
    passed.push("upload-url -> signed upload -> confirm creates confirmed file/version/current slot");

    const replay = await confirmUpload(ctx, validCase.dossierId, validCase.slotId, issued.issued.documentFileId, issued.issued.hash, confirmKey);
    assert(replay.status === 200 && replay.body?.replayed === true && replay.body?.document_version_id === valid.body.document_version_id, "confirm replay failed");
    passed.push("confirm same-key replay returns stored response");

    const confirmConflict = await confirmUpload(ctx, validCase.dossierId, validCase.slotId, issued.issued.documentFileId, "3".repeat(64), confirmKey);
    assert(confirmConflict.status === 409 && responseCode(confirmConflict) === "idempotency_conflict", "confirm idempotency conflict failed");
    passed.push("confirm same-key different payload returns idempotency_conflict");

    await ctx.service.from("app_dossier_document_slots").update({ status: "needs_review" }).eq("id", validCase.slotId);
    const replaceBytes = pdfBytes("valid-two");
    const replace = await issueUploadUrl(ctx, validCase.dossierId, validCase.slotId, replaceBytes, `issue-replace-${proofId()}`);
    await uploadSigned(ctx, replace.issued, replaceBytes);
    const replaceConfirm = await confirmUpload(ctx, validCase.dossierId, validCase.slotId, replace.issued.documentFileId, replace.issued.hash, `confirm-replace-${proofId()}`);
    assert(replaceConfirm.status === 200 && replaceConfirm.body?.version_number === 2, "replacement confirm failed");
    if (replaceConfirm.body?.request_id) ctx.tracker.requestIds.add(String(replaceConfirm.body.request_id));
    if (replaceConfirm.body?.document_version_id) ctx.tracker.documentVersionIds.add(String(replaceConfirm.body.document_version_id));
    const replacementRows = await assertSingleCurrentVersion(ctx, validCase.slotId, replace.issued.documentFileId, 2);
    const oldVersion = replacementRows.find((row: any) => row.version_number === 1);
    const newVersion = replacementRows.find((row: any) => row.version_number === 2);
    assert(oldVersion?.status === "superseded" && oldVersion.replaced_by_version_id === newVersion?.id, "replacement did not supersede v1");
    passed.push("replacement creates v2 current and supersedes v1");

    const missingCase = await createDossierAndSlot(ctx);
    const missingBytes = pdfBytes("missing-object");
    const missingIssue = await issueUploadUrl(ctx, missingCase.dossierId, missingCase.slotId, missingBytes, `issue-missing-${proofId()}`);
    const missing = await confirmUpload(ctx, missingCase.dossierId, missingCase.slotId, missingIssue.issued.documentFileId, missingIssue.issued.hash, `confirm-missing-${proofId()}`);
    assert(missing.status === 409 && responseCode(missing) === "stored_object_missing", "missing storage object failed");
    passed.push("confirm missing storage rejects nonterminal");

    const issuedHashCase = await createDossierAndSlot(ctx);
    const issuedHashBytes = pdfBytes("issued-hash-mismatch");
    const issuedHash = await issueUploadUrl(ctx, issuedHashCase.dossierId, issuedHashCase.slotId, issuedHashBytes, `issue-issued-mm-${proofId()}`);
    const issuedMismatch = await confirmUpload(ctx, issuedHashCase.dossierId, issuedHashCase.slotId, issuedHash.issued.documentFileId, "1".repeat(64), `confirm-issued-mm-${proofId()}`);
    assert(issuedMismatch.status === 409 && responseCode(issuedMismatch) === "issued_client_hash_mismatch", "issued client hash mismatch failed");
    passed.push("confirm client hash mismatch rejects terminal");

    const serverCase = await createDossierAndSlot(ctx);
    const serverBytes = pdfBytes("server-hash-mismatch");
    const serverIssue = await issueUploadUrl(ctx, serverCase.dossierId, serverCase.slotId, serverBytes, `issue-server-mm-${proofId()}`, "invoice.pdf", "application/pdf", false);
    await uploadSigned(ctx, serverIssue.issued, serverBytes);
    const serverMismatch = await confirmUpload(ctx, serverCase.dossierId, serverCase.slotId, serverIssue.issued.documentFileId, "2".repeat(64), `confirm-server-mm-${proofId()}`);
    assert(serverMismatch.status === 409 && responseCode(serverMismatch) === "server_hash_mismatch", "server hash mismatch failed");
    passed.push("confirm server hash mismatch rejects terminal");

    const sizeCase = await createDossierAndSlot(ctx);
    const sizeBytes = pdfBytes("size-mismatch");
    const sizeIssue = await issueUploadUrl(ctx, sizeCase.dossierId, sizeCase.slotId, sizeBytes, `issue-size-${proofId()}`);
    await uploadSigned(ctx, sizeIssue.issued, pdfBytes("different-size"));
    const sizeMismatch = await confirmUpload(ctx, sizeCase.dossierId, sizeCase.slotId, sizeIssue.issued.documentFileId, sizeIssue.issued.hash, `confirm-size-${proofId()}`);
    assert(sizeMismatch.status === 409 && responseCode(sizeMismatch) === "stored_size_mismatch", "size mismatch failed");
    passed.push("confirm stored size mismatch rejects terminal");

    const mimeCase = await createDossierAndSlot(ctx);
    const badMimeBytes = nonPdfBytes("mime-mismatch");
    const mimeIssue = await issueUploadUrl(ctx, mimeCase.dossierId, mimeCase.slotId, badMimeBytes, `issue-mime-${proofId()}`, "invoice.pdf", "application/pdf", false);
    await uploadSigned(ctx, mimeIssue.issued, badMimeBytes);
    const badMimeHash = await sha256Hex(badMimeBytes);
    const mimeMismatch = await confirmUpload(ctx, mimeCase.dossierId, mimeCase.slotId, mimeIssue.issued.documentFileId, badMimeHash, `confirm-mime-${proofId()}`);
    assert(mimeMismatch.status === 415 && responseCode(mimeMismatch) === "stored_mime_mismatch", "MIME mismatch failed");
    passed.push("confirm MIME mismatch rejects terminal");

    const concurrentSame = await createDossierAndSlot(ctx);
    const concurrentSameBytes = pdfBytes("concurrent-same");
    const concurrentSameIssue = await issueUploadUrl(ctx, concurrentSame.dossierId, concurrentSame.slotId, concurrentSameBytes, `issue-same-${proofId()}`);
    await uploadSigned(ctx, concurrentSameIssue.issued, concurrentSameBytes);
    const sameKey = `confirm-same-${proofId()}`;
    const sameResponses = await Promise.all([
      confirmUpload(ctx, concurrentSame.dossierId, concurrentSame.slotId, concurrentSameIssue.issued.documentFileId, concurrentSameIssue.issued.hash, sameKey),
      confirmUpload(ctx, concurrentSame.dossierId, concurrentSame.slotId, concurrentSameIssue.issued.documentFileId, concurrentSameIssue.issued.hash, sameKey),
    ]);
    for (const res of sameResponses) {
      if (res.body?.request_id) ctx.tracker.requestIds.add(String(res.body.request_id));
      if (res.body?.document_version_id) ctx.tracker.documentVersionIds.add(String(res.body.document_version_id));
    }
    const sameStatuses = sameResponses.map((res) => `${res.status}:${responseCode(res)}`).sort();
    const sameVersions = await ctx.service.from("app_dossier_document_versions").select("id").eq("document_file_id", concurrentSameIssue.issued.documentFileId);
    assert(Array.isArray(sameVersions.data) && sameVersions.data.length === 1, "same-key concurrent created duplicate version");
    assert(sameResponses.some((res) => res.status === 200), "same-key concurrent has no success response");
    assert(sameResponses.every((res) => res.status === 200 || (res.status === 409 && responseCode(res) === "request_in_progress")), "same-key concurrent unexpected response");
    http.concurrent_same_key = sameStatuses.join(",");
    passed.push("concurrent same-key confirm creates one version and explicit safe responses");

    const concurrentDiff = await createDossierAndSlot(ctx);
    const concurrentDiffBytes = pdfBytes("concurrent-diff");
    const concurrentDiffIssue = await issueUploadUrl(ctx, concurrentDiff.dossierId, concurrentDiff.slotId, concurrentDiffBytes, `issue-diff-${proofId()}`);
    await uploadSigned(ctx, concurrentDiffIssue.issued, concurrentDiffBytes);
    const diffResponses = await Promise.all([
      confirmUpload(ctx, concurrentDiff.dossierId, concurrentDiff.slotId, concurrentDiffIssue.issued.documentFileId, concurrentDiffIssue.issued.hash, `confirm-diff-a-${proofId()}`),
      confirmUpload(ctx, concurrentDiff.dossierId, concurrentDiff.slotId, concurrentDiffIssue.issued.documentFileId, concurrentDiffIssue.issued.hash, `confirm-diff-b-${proofId()}`),
    ]);
    for (const res of diffResponses) {
      if (res.body?.request_id) ctx.tracker.requestIds.add(String(res.body.request_id));
      if (res.body?.document_version_id) ctx.tracker.documentVersionIds.add(String(res.body.document_version_id));
    }
    const diffStatuses = diffResponses.map((res) => `${res.status}:${responseCode(res)}`).sort();
    const diffVersions = await ctx.service.from("app_dossier_document_versions").select("id,status").eq("document_file_id", concurrentDiffIssue.issued.documentFileId);
    assert(diffResponses.filter((res) => res.status === 200).length === 1, "different-key concurrent did not have exactly one success");
    assert(diffResponses.filter((res) => res.status === 409 && responseCode(res) === "document_file_already_confirmed").length === 1, "different-key concurrent did not have deterministic already-confirmed");
    assert(diffResponses.every((res) => res.status !== 500), "different-key concurrent returned 500");
    assert(Array.isArray(diffVersions.data) && diffVersions.data.length === 1, "different-key concurrent created duplicate version");
    http.concurrent_different_key = diffStatuses.join(",");
    passed.push("concurrent different-key confirm returns one 200 and one deterministic 409");

    const signingCase = await createDossierAndSlot(ctx);
    const signingBytes = pdfBytes("signing-compensation");
    if (ctx.tracker.bucketCreatedByProof) {
      await ctx.service.storage.emptyBucket(BUCKET).catch(() => null);
      await ctx.service.storage.deleteBucket(BUCKET).catch(() => null);
      const signingKey = `issue-signfail-${proofId()}`;
      const signingFailure = await postJson(ctx, "api-app-document-upload-url", signingKey, {
        dossier_id: signingCase.dossierId,
        document_slot_id: signingCase.slotId,
        file_name: "invoice.pdf",
        mime_type: "application/pdf",
        size_bytes: signingBytes.byteLength,
        client_sha256: await sha256Hex(signingBytes),
      });
      assert(signingFailure.status === 500 && responseCode(signingFailure) === "service_unavailable", "signing compensation did not return safe failure");
      const abandoned = await ctx.service
        .from("app_dossier_document_files")
        .select("id,status")
        .eq("issued_idempotency_key", signingKey);
      assert(Array.isArray(abandoned.data) && abandoned.data.some((row: any) => row.status === "abandoned"), "signing failure did not abandon issued file");
      for (const row of abandoned.data || []) {
        if (row?.id) ctx.tracker.documentFileIds.add(String(row.id));
      }
      await ctx.service.storage.createBucket(BUCKET, { public: false }).catch(() => null);
      passed.push("upload-url signing failure compensates by abandoning file");
    } else {
      passed.push("upload-url signing compensation skipped to preserve pre-existing local bucket");
    }

    const rpcProof = await ctx.service.rpc("app_reject_document_upload_v1", {
      p_dossier_id: validCase.dossierId,
      p_document_slot_id: validCase.slotId,
      p_document_file_id: issued.issued.documentFileId,
      p_customer_id: ctx.primaryCustomerId,
      p_identity_id: crypto.randomUUID(),
      p_actor_ref: `app_customer_identity:${crypto.randomUUID()}`,
      p_request_id: `rpc-proof-${proofId()}`,
      p_idempotency_scope: `rpc-proof:${proofId()}`,
      p_idempotency_key: `rpc-proof-${proofId()}`,
      p_payload_hash: "0".repeat(64),
      p_ip_hash: null,
      p_user_agent_hash: null,
      p_environment: "local",
      p_response_status: 409,
      p_error_code: "rpc_identity_mismatch",
      p_error_message: "Controleer de aanvraag.",
      p_stage: "rpc_identity_mismatch",
      p_reject_policy: "nonterminal",
      p_rejection_reason: "rpc_identity_mismatch",
      p_event_data: {},
    });
    assert(rpcProof.error, "reject RPC identity mismatch did not fail");
    passed.push("reject RPC independently rejects identity/customer mismatch");

    const rpcMeta = await ctx.service.rpc("app_confirm_document_upload_v1", {
      p_dossier_id: validCase.dossierId,
      p_document_slot_id: validCase.slotId,
      p_document_file_id: issued.issued.documentFileId,
      p_customer_id: ctx.primaryCustomerId,
      p_identity_id: crypto.randomUUID(),
      p_actor_ref: `app_customer_identity:${crypto.randomUUID()}`,
      p_request_id: `rpc-proof-${proofId()}`,
      p_idempotency_scope: `rpc-proof:${proofId()}`,
      p_idempotency_key: `rpc-proof-${proofId()}`,
      p_payload_hash: "0".repeat(64),
      p_ip_hash: null,
      p_user_agent_hash: null,
      p_environment: "local",
      p_detected_mime_type: "application/pdf",
      p_stored_size_bytes: issued.issued.size,
      p_server_sha256: issued.issued.hash,
    });
    assert(rpcMeta.error, "confirm RPC identity mismatch did not fail");
    passed.push("confirm RPC independently rejects identity/customer mismatch");

    const safeCounts = await Promise.all([
      ctx.service.from("app_dossier_document_files").select("id", { count: "exact", head: true }),
      ctx.service.from("app_dossier_document_versions").select("id", { count: "exact", head: true }),
      ctx.service.from("app_audit_events").select("id", { count: "exact", head: true }),
      ctx.service.from("app_idempotency_keys").select("id", { count: "exact", head: true }),
    ]);

    const cleanupResult = await cleanup(ctx);

    console.log(JSON.stringify({
      ok: true,
      mode: "upload_confirm_v1_gateway_chain_proof",
      passed,
      http,
      cleanup: cleanupResult,
      safe_counts_present: {
        app_dossier_document_files: typeof safeCounts[0].count === "number",
        app_dossier_document_versions: typeof safeCounts[1].count === "number",
        app_audit_events: typeof safeCounts[2].count === "number",
        app_idempotency_keys: typeof safeCounts[3].count === "number",
      },
    }, null, 2));
  } catch (error) {
    const cleanupResult = await cleanup(ctx);
    throw new Error(`${error instanceof Error ? error.message : String(error)} | cleanup=${JSON.stringify(cleanupResult)}`);
  }
}

await main();
