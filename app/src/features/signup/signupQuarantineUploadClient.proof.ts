import {
  removeSignupDocument,
  uploadSignupDocument,
} from "./signupQuarantineUploadClient.ts";
import { clearSignupIntakeSession } from "./signupIntakeCapabilityStore.ts";

type FetchCall = { url: string; init?: RequestInit };

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function storageMock() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
}

export async function runSignupQuarantineUploadClientProof(): Promise<void> {
  const sessionStorage = storageMock();
  const localStorage = storageMock();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { sessionStorage, localStorage },
  });
  clearSignupIntakeSession();

  const calls: FetchCall[] = [];
  const responses = [
    response({
      ok: true,
      mode: "signup_intake_start_v1",
      intake_reference: "11111111-1111-4111-8111-111111111111",
      management_capability: "manage-proof-secret",
      capability_expires_at: "2099-01-01T00:00:00.000Z",
    }, 201),
    response({
      ok: true,
      mode: "signup_upload_url_v1",
      file_reference: "22222222-2222-4222-8222-222222222222",
      client_slot_id: "doc_energy_location_a",
      revision_number: 1,
      storage_bucket: "app-documents",
      storage_path: "signup-quarantine/private-proof/document.pdf",
      signed_upload_url: "private-proof-url",
      upload_token: "signed-storage-token",
      quarantine_upload_capability: "file-proof-secret",
    }, 201),
    response({
      ok: true,
      mode: "signup_upload_confirm_v1",
      file_reference: "22222222-2222-4222-8222-222222222222",
      file_status: "confirmed_quarantine",
      revision_number: 1,
    }),
    response({
      ok: true,
      mode: "signup_upload_url_v1",
      file_reference: "33333333-3333-4333-8333-333333333333",
      client_slot_id: "doc_energy_location_a",
      revision_number: 2,
      storage_bucket: "app-documents",
      storage_path: "signup-quarantine/private-proof/replacement.pdf",
      signed_upload_url: "private-proof-url-2",
      upload_token: "signed-storage-token-2",
      quarantine_upload_capability: "file-proof-secret-2",
    }, 201),
    response({
      ok: true,
      mode: "signup_upload_confirm_v1",
      file_reference: "33333333-3333-4333-8333-333333333333",
      file_status: "confirmed_quarantine",
      revision_number: 2,
    }),
    response({ ok: true, mode: "signup_upload_remove_v1", removed: true }),
  ];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected_fetch");
    return next;
  }) as typeof fetch;
  const uploads: Array<{ bucket: string; path: string; token: string }> = [];
  const supabaseClient = {
    storage: {
      from(bucket: string) {
        return {
          async uploadToSignedUrl(path: string, token: string) {
            uploads.push({ bucket, path, token });
            return { data: {}, error: null };
          },
        };
      },
    },
  };
  const dependencies = {
    authSession: null,
    fetchImpl,
    supabaseClient: supabaseClient as never,
    digestImpl: async () => new Uint8Array(Array.from({ length: 32 }, () => 0xaa)).buffer,
    runtimeConfig: {
      anonKey: "proof-anon-key",
      startEndpointUrl: "http://127.0.0.1/functions/v1/api-app-signup-intake-start",
      issueEndpointUrl: "http://127.0.0.1/functions/v1/api-app-signup-upload-url",
      confirmEndpointUrl: "http://127.0.0.1/functions/v1/api-app-signup-upload-confirm",
    },
  };
  const file = new File(["%PDF-1.7 proof"], "factuur.pdf", { type: "application/pdf" });
  const input = {
    accountType: "zakelijk" as const,
    email: "proof@example.invalid",
    clientSlotId: "doc_energy_location_a",
    documentType: "energy_bill_or_contract" as const,
    file,
  };

  const first = await uploadSignupDocument(input, dependencies);
  assert(first.ok && first.receipt.status === "confirmed_quarantine" && first.receipt.revisionNumber === 1,
    "first_confirmation_missing");
  assert(calls.map((call) => call.url.split("/").pop()).join("|") ===
    "api-app-signup-intake-start|api-app-signup-upload-url|api-app-signup-upload-confirm", "stage_order_invalid");
  const startBody = JSON.parse(String(calls[0]?.init?.body || "{}"));
  assert(
    Object.keys(startBody).sort().join("|") === "account_type|email" &&
      startBody.account_type === input.accountType && startBody.email === input.email,
    "frontend_intake_start_request_shape_invalid",
  );
  assert(uploads.length === 1 && uploads[0].bucket === "app-documents", "signed_upload_missing");
  assert(sessionStorage.getItem("enval.signup.intake.v1")?.includes("manage-proof-secret"), "manage_capability_not_in_session_storage");
  assert(localStorage.length === 0, "capability_written_to_local_storage");
  assert(!JSON.stringify(first).includes("proof-secret") && !JSON.stringify(first).includes("storage_path"), "unsafe_upload_result");

  const replacement = await uploadSignupDocument(input, dependencies);
  assert(replacement.ok && replacement.receipt.revisionNumber === 2, "replacement_receipt_missing");
  assert(calls.filter((call) => call.url.endsWith("api-app-signup-intake-start")).length === 1,
    "same_session_started_second_intake");
  assert(Number(uploads.length) === 2, "replacement_signed_upload_missing");

  const removed = await removeSignupDocument({
    accountType: input.accountType,
    email: input.email,
    clientSlotId: input.clientSlotId,
  }, dependencies);
  assert(removed, "remove_failed");
  const removeBody = JSON.parse(String(calls[calls.length - 1]?.init?.body || "{}"));
  assert(removeBody.operation === "remove" && removeBody.client_slot_id === input.clientSlotId,
    "remove_scope_invalid");

  const idempotencyKeys = calls.map((call) => new Headers(call.init?.headers).get("Idempotency-Key"));
  assert(idempotencyKeys.every(Boolean) && new Set(idempotencyKeys).size === idempotencyKeys.length,
    "idempotency_attempt_keys_invalid");

  const aborted = await uploadSignupDocument({ ...input, signal: AbortSignal.abort() }, dependencies);
  assert(!aborted.ok && aborted.aborted, "abort_boundary_missing");
}
