import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCurrentAuthSession,
  getSupabaseBrowserClient,
} from "../auth/authClient.ts";
import { resolveAuthRuntimeConfig } from "../auth/authRuntimeConfig.ts";
import {
  createUploadIdempotencyKey,
  isJsonRecord,
  jsonNumberField,
  jsonStringField,
  parseJsonResponse,
  postUploadJson,
  putSignedUpload,
  sha256HexFromBlob,
} from "../documents/documentUploadTransport.ts";
import {
  readSignupIntakeStartAttempt,
  readSignupIntakeSession,
  type SignupIntakeSession,
  writeSignupIntakeSession,
  writeSignupIntakeStartAttempt,
} from "./signupIntakeCapabilityStore.ts";
import type { AccountType, DocumentType } from "./signupTypes.ts";

type RuntimeConfig = {
  anonKey: string;
  startEndpointUrl: string;
  issueEndpointUrl: string;
  confirmEndpointUrl: string;
};

export type SignupQuarantineReceipt = {
  fileReference: string;
  revisionNumber: number;
  status: "confirmed_quarantine";
};

export type SignupQuarantineResult =
  | { ok: true; receipt: SignupQuarantineReceipt }
  | { ok: false; aborted: boolean };

type Dependencies = {
  authSession?: {
    accessToken: string;
    email: string;
    verified: boolean;
  } | null;
  fetchImpl?: typeof fetch;
  runtimeConfig?: RuntimeConfig;
  supabaseClient?: Pick<SupabaseClient, "storage">;
  digestImpl?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

function runtimeConfig(value?: RuntimeConfig): RuntimeConfig | null {
  if (value) return value;
  const auth = resolveAuthRuntimeConfig();
  if (!auth.ok) return null;
  const suffix = "/api-app-dashboard-get";
  if (!auth.dashboardEndpointUrl.endsWith(suffix)) return null;
  const base = auth.dashboardEndpointUrl.slice(0, -suffix.length);
  return {
    anonKey: auth.anonKey,
    startEndpointUrl: `${base}/api-app-signup-intake-start`,
    issueEndpointUrl: `${base}/api-app-signup-upload-url`,
    confirmEndpointUrl: `${base}/api-app-signup-upload-confirm`,
  };
}

function sameSignupBasis(session: SignupIntakeSession, accountType: AccountType, email: string): boolean {
  return session.accountType === accountType && session.email === email.trim().toLowerCase();
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  const parsed = await parseJsonResponse(response);
  return parsed.ok && isJsonRecord(parsed.body) ? parsed.body : null;
}

async function ensureIntake(
  accountType: AccountType,
  email: string,
  config: RuntimeConfig,
  fetchImpl: typeof fetch,
  injectedAuthSession?: Dependencies["authSession"],
  signal?: AbortSignal,
): Promise<SignupIntakeSession | null> {
  const currentSession = injectedAuthSession === undefined
    ? await getCurrentAuthSession()
    : null;
  const verifiedAccountEmail = injectedAuthSession?.verified &&
      injectedAuthSession.email
    ? injectedAuthSession.email.trim().toLowerCase()
    : currentSession?.user.email &&
        (currentSession.user.email_confirmed_at ||
          currentSession.user.confirmed_at)
    ? currentSession.user.email.trim().toLowerCase()
    : "";
  const authenticatedAccessToken = injectedAuthSession?.verified
    ? injectedAuthSession.accessToken
    : currentSession?.access_token || "";
  const normalizedEmail = verifiedAccountEmail || email.trim().toLowerCase();
  const existing = readSignupIntakeSession();
  if (existing && sameSignupBasis(existing, accountType, normalizedEmail)) {
    return existing;
  }
  if (!normalizedEmail) return null;
  const pending = readSignupIntakeStartAttempt();
  const startIdempotencyKey = pending?.accountType === accountType && pending.email === normalizedEmail
    ? pending.idempotencyKey
    : createUploadIdempotencyKey();
  writeSignupIntakeStartAttempt({ accountType, email: normalizedEmail, idempotencyKey: startIdempotencyKey });
  const response = await postUploadJson({
    endpointUrl: config.startEndpointUrl,
    anonKey: config.anonKey,
    accessToken: verifiedAccountEmail && authenticatedAccessToken
      ? authenticatedAccessToken
      : config.anonKey,
    idempotencyKey: startIdempotencyKey,
    body: { account_type: accountType, email: normalizedEmail },
    fetchImpl,
    signal,
  });
  const body = await safeJson(response);
  if (!response.ok || !body || body.ok !== true) return null;
  const session: SignupIntakeSession = {
    intakeReference: jsonStringField(body, "intake_reference"),
    managementCapability: jsonStringField(body, "management_capability"),
    accountType,
    email: normalizedEmail,
    expiresAt: jsonStringField(body, "capability_expires_at"),
  };
  if (!UUID_RE.test(session.intakeReference) || !session.managementCapability ||
    !session.expiresAt || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  writeSignupIntakeSession(session);
  writeSignupIntakeStartAttempt(null);
  return session;
}

export async function uploadSignupDocument(input: {
  accountType: AccountType;
  email: string;
  clientSlotId: string;
  documentType: DocumentType;
  file: File;
  signal?: AbortSignal;
}, dependencies: Dependencies = {}): Promise<SignupQuarantineResult> {
  const config = runtimeConfig(dependencies.runtimeConfig);
  const supabaseClient = dependencies.supabaseClient ?? getSupabaseBrowserClient();
  if (!config || !supabaseClient || input.signal?.aborted) return { ok: false, aborted: !!input.signal?.aborted };
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  try {
    const clientSha256 = await sha256HexFromBlob(input.file, dependencies.digestImpl);
    if (!clientSha256 || !SHA256_RE.test(clientSha256) || input.signal?.aborted) {
      return { ok: false, aborted: !!input.signal?.aborted };
    }
    const intake = await ensureIntake(
      input.accountType,
      input.email,
      config,
      fetchImpl,
      dependencies.authSession,
      input.signal,
    );
    if (!intake || input.signal?.aborted) return { ok: false, aborted: !!input.signal?.aborted };
    const issue = await postUploadJson({
      endpointUrl: config.issueEndpointUrl,
      anonKey: config.anonKey,
      accessToken: config.anonKey,
      idempotencyKey: createUploadIdempotencyKey(),
      body: {
        operation: "issue",
        intake_reference: intake.intakeReference,
        management_capability: intake.managementCapability,
        client_slot_id: input.clientSlotId,
        document_type: input.documentType,
        file_name: input.file.name,
        mime_type: "application/pdf",
        size_bytes: input.file.size,
        client_sha256: clientSha256,
      },
      fetchImpl,
      signal: input.signal,
    });
    const issued = await safeJson(issue);
    if (!issue.ok || !issued || issued.ok !== true || input.signal?.aborted) return { ok: false, aborted: !!input.signal?.aborted };
    const fileReference = jsonStringField(issued, "file_reference");
    const revisionNumber = jsonNumberField(issued, "revision_number");
    const bucket = jsonStringField(issued, "storage_bucket");
    const path = jsonStringField(issued, "storage_path");
    const signedUploadToken = jsonStringField(issued, "upload_token");
    const fileCapability = jsonStringField(issued, "quarantine_upload_capability");
    if (!UUID_RE.test(fileReference) || !revisionNumber || !bucket || !path || !signedUploadToken || !fileCapability) {
      return { ok: false, aborted: false };
    }
    const upload = await putSignedUpload({
      supabaseClient,
      bucket,
      path,
      uploadToken: signedUploadToken,
      file: input.file,
      contentType: "application/pdf",
    });
    if (!upload.ok || input.signal?.aborted) return { ok: false, aborted: !!input.signal?.aborted };
    const confirm = await postUploadJson({
      endpointUrl: config.confirmEndpointUrl,
      anonKey: config.anonKey,
      accessToken: config.anonKey,
      idempotencyKey: createUploadIdempotencyKey(),
      body: {
        intake_reference: intake.intakeReference,
        file_reference: fileReference,
        quarantine_upload_capability: fileCapability,
      },
      fetchImpl,
      signal: input.signal,
    });
    const confirmed = await safeJson(confirm);
    if (!confirm.ok || !confirmed || confirmed.ok !== true ||
      jsonStringField(confirmed, "file_status") !== "confirmed_quarantine") {
      return { ok: false, aborted: !!input.signal?.aborted };
    }
    return { ok: true, receipt: { fileReference, revisionNumber, status: "confirmed_quarantine" } };
  } catch (error) {
    return { ok: false, aborted: input.signal?.aborted || (error instanceof DOMException && error.name === "AbortError") };
  }
}

export async function removeSignupDocument(input: {
  accountType: AccountType;
  email: string;
  clientSlotId: string;
  signal?: AbortSignal;
}, dependencies: Dependencies = {}): Promise<boolean> {
  const config = runtimeConfig(dependencies.runtimeConfig);
  if (!config) return false;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  try {
    const intake = readSignupIntakeSession();
    if (!intake || !sameSignupBasis(intake, input.accountType, input.email)) return true;
    if (input.signal?.aborted) return false;
    const response = await postUploadJson({
      endpointUrl: config.issueEndpointUrl,
      anonKey: config.anonKey,
      accessToken: config.anonKey,
      idempotencyKey: createUploadIdempotencyKey(),
      body: {
        operation: "remove",
        intake_reference: intake.intakeReference,
        management_capability: intake.managementCapability,
        client_slot_id: input.clientSlotId,
      },
      fetchImpl,
      signal: input.signal,
    });
    const body = await safeJson(response);
    return response.ok && body?.ok === true;
  } catch (_error) {
    return false;
  }
}
