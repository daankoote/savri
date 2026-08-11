import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import {
  type AppRequestMeta,
  getAppRequestMeta,
  payloadHash,
} from "./app_foundation.ts";
import { isLocalSupabaseRuntime } from "./local_supabase_runtime.ts";
import {
  downloadPrivateStorageObject,
  isRecord,
  SHA256_RE,
  SIGNUP_QUARANTINE_BUCKET,
  stringField,
  UUID_RE,
} from "./signup_quarantine.ts";

export const SIGNUP_PROMOTION_MODE = "signup_promotion_v1";
export const SIGNUP_PROMOTION_INTERNAL_HEADER =
  "x-enval-signup-promotion-secret";
export const SIGNUP_PROMOTION_DESTINATION_PREFIX =
  "case-evidence/signed-signup/";
export const SIGNUP_PROMOTION_ACTOR_REF = "edge:api-app-signup-promote";

const REQUIRED_LEGAL_ACTIONS = new Set([
  "privacy_notice_read",
  "service_terms_accepted",
  "fee_terms_accepted",
]);

type JsonObject = Record<string, unknown>;

type SourceFile = {
  id: string;
  intake_id: string;
  storage_bucket: string;
  storage_path: string;
  status: string;
  declared_mime_type: string;
  detected_mime_type: string;
  server_size_bytes: number;
  server_sha256: string;
  confirmed_at: string;
  superseded_at: string | null;
  superseded_by_intake_file_id: string | null;
  promoted_evidence_file_id: string | null;
};

type PromotionSource = {
  intakeId: string;
  intakeStatus: "submitted_for_review" | "promoted";
  files: SourceFile[];
};

export type DurableManifestItem = {
  source_intake_file_id: string;
  storage_bucket: string;
  storage_path: string;
  detected_mime_type: string;
  size_bytes: number;
  sha256: string;
};

type CreatedDestination = {
  bucket: string;
  path: string;
};

type PromotionFailureCode =
  | "authentication_required"
  | "authorization_denied"
  | "service_unavailable"
  | "invalid_request"
  | "promotion_not_ready"
  | "source_object_missing"
  | "source_integrity_mismatch"
  | "durable_object_conflict"
  | "durable_prepare_failed"
  | "promotion_conflict"
  | "promotion_in_progress"
  | "promotion_failed";

class PromotionError extends Error {
  constructor(
    readonly status: number,
    readonly code: PromotionFailureCode,
  ) {
    super(code);
    this.name = "PromotionError";
  }
}

function response(
  status: number,
  body: JsonObject,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(error: PromotionError): Response {
  return response(error.status, {
    ok: false,
    mode: SIGNUP_PROMOTION_MODE,
    code: error.code,
  });
}

function safeStage(stage: string, requestId: string): void {
  console.info(JSON.stringify({
    component: "api-app-signup-promote",
    stage,
    request_id: requestId,
  }));
}

async function digestBytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

async function equalSecret(left: string, right: string): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([
    digestBytes(left),
    digestBytes(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index] ^ rightDigest[index];
  }
  return difference === 0 && left.length === right.length;
}

function bearerToken(req: Request): string {
  const authorization = req.headers.get("authorization")?.trim() || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function requireInternalAuthorization(req: Request): Promise<void> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const configuredSecret =
    Deno.env.get("APP_SIGNUP_PROMOTION_INTERNAL_SECRET")?.trim() || "";
  const localRuntime = isLocalSupabaseRuntime(supabaseUrl);
  const expectedInternalSecret = configuredSecret ||
    (localRuntime ? serviceRoleKey : "");
  const incomingInternalSecret =
    req.headers.get(SIGNUP_PROMOTION_INTERNAL_HEADER)?.trim() || "";
  const incomingBearer = bearerToken(req);

  if (!serviceRoleKey || !expectedInternalSecret) {
    throw new PromotionError(503, "service_unavailable");
  }
  if (!incomingInternalSecret || !incomingBearer) {
    throw new PromotionError(401, "authentication_required");
  }
  const [secretMatches, bearerMatches] = await Promise.all([
    equalSecret(incomingInternalSecret, expectedInternalSecret),
    equalSecret(incomingBearer, serviceRoleKey),
  ]);
  if (!secretMatches || !bearerMatches) {
    throw new PromotionError(403, "authorization_denied");
  }
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

async function parseInternalRequest(req: Request): Promise<string> {
  let body: unknown;
  try {
    body = await req.json();
  } catch (_error) {
    throw new PromotionError(400, "invalid_request");
  }
  if (!isRecord(body) || Object.keys(body).length !== 1) {
    throw new PromotionError(400, "invalid_request");
  }
  const intakeId = stringField(body, "intake_reference").toLowerCase();
  if (!UUID_RE.test(intakeId)) {
    throw new PromotionError(400, "invalid_request");
  }
  return intakeId;
}

function rows(value: unknown): JsonObject[] {
  return Array.isArray(value) && value.every(isRecord)
    ? value as JsonObject[]
    : [];
}

function exactSourcePath(intakeId: string, fileId: string): string {
  return `signup-quarantine/${intakeId}/${fileId}/document.pdf`;
}

export function durableDestinationPath(
  intakeId: string,
  sourceFileId: string,
): string {
  if (!UUID_RE.test(intakeId) || !UUID_RE.test(sourceFileId)) {
    throw new PromotionError(400, "invalid_request");
  }
  return `${SIGNUP_PROMOTION_DESTINATION_PREFIX}${intakeId}/${sourceFileId}/document.pdf`;
}

async function loadPromotionSource(
  SB: any,
  intakeId: string,
): Promise<PromotionSource> {
  const intakeResult = await SB.from("app_signup_intakes")
    .select("id,status,finalized_at,promotion_case_id,promoted_at")
    .eq("id", intakeId).maybeSingle();
  const intake = isRecord(intakeResult.data) ? intakeResult.data : null;
  const intakeStatus = stringField(intake || {}, "status");
  if (
    intakeResult.error || !intake ||
    !["submitted_for_review", "promoted"].includes(intakeStatus) ||
    !stringField(intake, "finalized_at")
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }

  const [
    snapshotResult,
    mandateResult,
    signatureResult,
    acceptanceResult,
    manageResult,
    auditResult,
  ] = await Promise.all([
    SB.from("app_signup_signing_snapshots")
      .select("id,intake_id,canonical_snapshot")
      .eq("intake_id", intakeId),
    SB.from("app_signup_mandates")
      .select("id,intake_id,snapshot_id,authority_review_status")
      .eq("intake_id", intakeId),
    SB.from("app_signup_signature_evidence")
      .select("id,intake_id,snapshot_id,mandate_id,challenge_id,finalized_at")
      .eq("intake_id", intakeId),
    SB.from("app_signup_legal_acceptances")
      .select("id,intake_id,snapshot_id,action_type")
      .eq("intake_id", intakeId),
    SB.from("app_signup_intake_capabilities")
      .select("id,consumed_at,invalidated_at")
      .eq("intake_id", intakeId)
      .eq("capability_type", "intake_manage")
      .is("intake_file_id", null),
    SB.from("app_intake_audit_events")
      .select("id,event_data")
      .eq("event_type", "signup_signing_finalized")
      .eq("event_data->>intake_reference", intakeId),
  ]);
  if (
    snapshotResult.error || mandateResult.error || signatureResult.error ||
    acceptanceResult.error || manageResult.error || auditResult.error
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }

  const snapshots = rows(snapshotResult.data);
  const mandates = rows(mandateResult.data);
  const signatures = rows(signatureResult.data);
  const acceptances = rows(acceptanceResult.data);
  const manageCapabilities = rows(manageResult.data);
  const audits = rows(auditResult.data);
  if (
    snapshots.length !== 1 || mandates.length !== 1 ||
    signatures.length !== 1 ||
    acceptances.length !== 3 || manageCapabilities.length !== 1 ||
    audits.length !== 1
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }
  const snapshot = snapshots[0];
  const mandate = mandates[0];
  const signature = signatures[0];
  const manageCapability = manageCapabilities[0];
  const legalActions = new Set(
    acceptances.map((item) => stringField(item, "action_type")),
  );
  if (
    legalActions.size !== 3 ||
    [...REQUIRED_LEGAL_ACTIONS].some((action) => !legalActions.has(action)) ||
    stringField(mandate, "snapshot_id") !== stringField(snapshot, "id") ||
    stringField(signature, "snapshot_id") !== stringField(snapshot, "id") ||
    stringField(signature, "mandate_id") !== stringField(mandate, "id") ||
    stringField(signature, "finalized_at") !==
      stringField(intake, "finalized_at") ||
    !stringField(manageCapability, "consumed_at") ||
    stringField(manageCapability, "invalidated_at")
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }

  const challengeId = stringField(signature, "challenge_id");
  const challengeResult = await SB.from("app_signup_signing_challenges")
    .select("id,intake_id,delivery_status,consumed_at,replaced_at")
    .eq("id", challengeId).eq("intake_id", intakeId);
  const challenges = rows(challengeResult.data);
  if (
    challengeResult.error || challenges.length !== 1 ||
    stringField(challenges[0], "delivery_status") !== "delivered" ||
    !stringField(challenges[0], "consumed_at") ||
    stringField(challenges[0], "replaced_at")
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }

  const canonicalSnapshot = isRecord(snapshot.canonical_snapshot)
    ? snapshot.canonical_snapshot
    : null;
  const requiredReferences = canonicalSnapshot?.required_file_references;
  if (
    !Array.isArray(requiredReferences) || requiredReferences.length === 0 ||
    requiredReferences.length > 100 ||
    requiredReferences.some((value) =>
      typeof value !== "string" || !UUID_RE.test(value)
    ) ||
    new Set(requiredReferences).size !== requiredReferences.length
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }
  const requiredFileIds = [...requiredReferences].map(String).sort();
  const fileResult = await SB.from("app_signup_intake_files")
    .select(
      "id,intake_id,storage_bucket,storage_path,status,declared_mime_type,detected_mime_type," +
        "server_size_bytes,server_sha256,confirmed_at,superseded_at," +
        "superseded_by_intake_file_id,promoted_evidence_file_id",
    )
    .eq("intake_id", intakeId).in("id", requiredFileIds);
  const sourceFiles = rows(fileResult.data);
  if (fileResult.error || sourceFiles.length !== requiredFileIds.length) {
    throw new PromotionError(409, "promotion_not_ready");
  }

  const expectedFileStatus = intakeStatus === "promoted"
    ? "promoted"
    : "confirmed_quarantine";
  const normalizedFiles: SourceFile[] = sourceFiles.map((file) => ({
    id: stringField(file, "id"),
    intake_id: stringField(file, "intake_id"),
    storage_bucket: stringField(file, "storage_bucket"),
    storage_path: stringField(file, "storage_path"),
    status: stringField(file, "status"),
    declared_mime_type: stringField(file, "declared_mime_type").toLowerCase(),
    detected_mime_type: stringField(file, "detected_mime_type").toLowerCase(),
    server_size_bytes: Number(file.server_size_bytes),
    server_sha256: stringField(file, "server_sha256").toLowerCase(),
    confirmed_at: stringField(file, "confirmed_at"),
    superseded_at: stringField(file, "superseded_at") || null,
    superseded_by_intake_file_id:
      stringField(file, "superseded_by_intake_file_id") || null,
    promoted_evidence_file_id: stringField(file, "promoted_evidence_file_id") ||
      null,
  })).sort((left, right) => left.id.localeCompare(right.id));

  if (
    normalizedFiles.some((file) =>
      file.intake_id !== intakeId || file.status !== expectedFileStatus ||
      file.storage_bucket !== SIGNUP_QUARANTINE_BUCKET ||
      file.storage_path !== exactSourcePath(intakeId, file.id) ||
      file.declared_mime_type !== "application/pdf" ||
      file.detected_mime_type !== "application/pdf" ||
      !Number.isInteger(file.server_size_bytes) ||
      file.server_size_bytes <= 0 ||
      !SHA256_RE.test(file.server_sha256) || !file.confirmed_at ||
      file.superseded_at !== null ||
      file.superseded_by_intake_file_id !== null ||
      (intakeStatus === "promoted" && !file.promoted_evidence_file_id)
    )
  ) {
    throw new PromotionError(409, "promotion_not_ready");
  }
  return {
    intakeId,
    intakeStatus: intakeStatus as PromotionSource["intakeStatus"],
    files: normalizedFiles,
  };
}

function matchesSource(
  stored: {
    sizeBytes: number;
    detectedMimeType: string;
    serverSha256: string;
  },
  source: SourceFile,
): boolean {
  return stored.sizeBytes === source.server_size_bytes &&
    stored.detectedMimeType === source.detected_mime_type &&
    stored.serverSha256 === source.server_sha256;
}

function isStorageCreateConflict(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const status = Number(error.statusCode ?? error.status);
  const message = stringField(error, "message").toLowerCase();
  return status === 409 || message.includes("already exists") ||
    message.includes("duplicate");
}

async function prepareDurableManifest(
  SB: any,
  source: PromotionSource,
  created: CreatedDestination[],
): Promise<DurableManifestItem[]> {
  const manifest: DurableManifestItem[] = [];
  for (const file of source.files) {
    const sourceObject = await downloadPrivateStorageObject(
      SB,
      file.storage_bucket,
      file.storage_path,
    );
    if (!sourceObject.ok) {
      throw new PromotionError(409, "source_object_missing");
    }
    if (!matchesSource(sourceObject, file)) {
      throw new PromotionError(409, "source_integrity_mismatch");
    }

    const destinationBucket = SIGNUP_QUARANTINE_BUCKET;
    const destinationPath = durableDestinationPath(source.intakeId, file.id);
    let destinationObject = await downloadPrivateStorageObject(
      SB,
      destinationBucket,
      destinationPath,
    );
    if (destinationObject.ok && !matchesSource(destinationObject, file)) {
      throw new PromotionError(409, "durable_object_conflict");
    }
    if (!destinationObject.ok) {
      const blob = new Blob([sourceObject.bytes], {
        type: file.detected_mime_type,
      });
      const uploadResult = await SB.storage.from(destinationBucket).upload(
        destinationPath,
        blob,
        {
          cacheControl: "3600",
          contentType: file.detected_mime_type,
          upsert: false,
        },
      );
      if (!uploadResult.error) {
        created.push({ bucket: destinationBucket, path: destinationPath });
      }
      const retryDelays = uploadResult.error
        ? [0, 50, 150, 300, 600, 1_200]
        : [0];
      for (const delayMs of retryDelays) {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        destinationObject = await downloadPrivateStorageObject(
          SB,
          destinationBucket,
          destinationPath,
        );
        if (destinationObject.ok) break;
      }
      if (!destinationObject.ok) {
        if (isStorageCreateConflict(uploadResult.error)) {
          throw new PromotionError(409, "promotion_in_progress");
        }
        throw new PromotionError(503, "durable_prepare_failed");
      }
      if (!matchesSource(destinationObject, file)) {
        throw new PromotionError(409, "durable_object_conflict");
      }
    }
    manifest.push({
      source_intake_file_id: file.id,
      storage_bucket: destinationBucket,
      storage_path: destinationPath,
      detected_mime_type: destinationObject.detectedMimeType,
      size_bytes: destinationObject.sizeBytes,
      sha256: destinationObject.serverSha256,
    });
  }
  return manifest;
}

async function cleanupCreatedDestinations(
  SB: any,
  intakeId: string,
  created: CreatedDestination[],
  meta: AppRequestMeta,
): Promise<void> {
  if (created.length === 0) return;
  safeStage("cleanup_attempted", meta.request_id);
  const promotion = await SB.from("app_signup_promotions")
    .select("id", { count: "exact", head: true })
    .eq("intake_id", intakeId);
  if (!promotion.error && Number(promotion.count) > 0) return;

  let cleanupFailed = false;
  for (const destination of created) {
    const linked = await SB.from("app_evidence_versions")
      .select("id", { count: "exact", head: true })
      .eq("storage_bucket", destination.bucket)
      .eq("storage_path", destination.path);
    if (linked.error || Number(linked.count) > 0) {
      cleanupFailed = cleanupFailed || !!linked.error;
      continue;
    }
    const removed = await SB.storage.from(destination.bucket).remove([
      destination.path,
    ]);
    if (removed.error) cleanupFailed = true;
  }
  if (cleanupFailed) safeStage("cleanup_failed", meta.request_id);
}

function safeRpcResult(value: unknown): JsonObject | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") return null;
  return value;
}

export async function handleSignupPromotion(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return errorResponse(new PromotionError(405, "invalid_request"));
  }

  let meta: AppRequestMeta;
  try {
    await requireInternalAuthorization(req);
    meta = await getAppRequestMeta(req);
    if (
      !meta.idempotency_key || meta.idempotency_key.length > 200 ||
      /\s/.test(meta.idempotency_key) || meta.request_id.length > 96
    ) {
      throw new PromotionError(400, "invalid_request");
    }
  } catch (error) {
    return errorResponse(
      error instanceof PromotionError
        ? error
        : new PromotionError(500, "service_unavailable"),
    );
  }

  const SB = serviceClient();
  if (!SB) return errorResponse(new PromotionError(503, "service_unavailable"));
  let intakeId = "";
  const created: CreatedDestination[] = [];
  let cleanupOnFailure = true;
  try {
    intakeId = await parseInternalRequest(req);
    const source = await loadPromotionSource(SB, intakeId);
    safeStage("source_validated", meta.request_id);
    const manifest = await prepareDurableManifest(SB, source, created);
    safeStage("durable_prepared", meta.request_id);

    const requestPayloadSha256 = await payloadHash({
      intake_id: intakeId,
      durable_files: manifest,
    });
    const rpcResult = await SB.rpc("app_promote_signed_signup_v1", {
      p_request: {
        intake_id: intakeId,
        request_id: meta.request_id,
        idempotency_key: meta.idempotency_key,
        request_payload_sha256: requestPayloadSha256,
        actor_ref: SIGNUP_PROMOTION_ACTOR_REF,
        environment: meta.environment,
        durable_files: manifest,
      },
    });
    const rpc = safeRpcResult(rpcResult.data);
    if (rpcResult.error || !rpc) {
      throw new PromotionError(409, "promotion_failed");
    }
    if (rpc.ok !== true) {
      const code = stringField(rpc, "code");
      cleanupOnFailure = code !== "promotion_in_progress";
      throw new PromotionError(
        Number(rpc.status) === 409 ? 409 : 422,
        code === "promotion_conflict"
          ? "promotion_conflict"
          : code === "promotion_in_progress"
          ? "promotion_in_progress"
          : "promotion_failed",
      );
    }
    safeStage("promotion_committed", meta.request_id);
    return response(Number(rpc.status) === 201 ? 201 : 200, {
      ok: true,
      mode: SIGNUP_PROMOTION_MODE,
      status: "promoted",
      replayed: rpc.replayed === true,
      promotion_reference: stringField(rpc, "promotion_reference"),
      case_reference: stringField(rpc, "case_reference"),
    });
  } catch (error) {
    if (intakeId && cleanupOnFailure) {
      await cleanupCreatedDestinations(SB, intakeId, created, meta);
    }
    if (error instanceof PromotionError) {
      return errorResponse(error);
    }
    return errorResponse(new PromotionError(500, "service_unavailable"));
  }
}
