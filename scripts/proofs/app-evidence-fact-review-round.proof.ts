import type { AppRequestMeta } from
  "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";
import {
  createHandler,
  normalizeEvidenceFactReviewRoundRequest,
} from "../../supabase/functions/api-app-evidence-review-round-finalize/index.ts";

class ProofFailure extends Error {}
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REVIEW15-ENDPOINT-Q${String(value).padStart(2, "0")}: PASS`);
}

const AUTH_USER = "f1000000-0000-4000-8000-000000000001";
const CASE_REF = "CASE-A00000000001";
const MANIFEST_HASH = "a".repeat(64);
const SUBJECT_A = `FRS-${"1".repeat(64)}`;
const SUBJECT_B = `FRS-${"2".repeat(64)}`;
const ROUND_ID = "f2000000-0000-4000-8000-000000000001";
const ENDPOINT_URL = "https://enval.local/api-app-evidence-review-round-finalize";
const META: AppRequestMeta = {
  request_id: "review15-endpoint-request",
  idempotency_key: "review15-endpoint-key",
  ip_hash: null,
  user_agent_hash: null,
  method: "POST",
  path: "/api-app-evidence-review-round-finalize",
  url: ENDPOINT_URL,
  origin: null,
  timestamp: "2026-08-18T12:00:00.000Z",
  environment: "local",
};

const requestBody = {
  caseRef: CASE_REF,
  manifestVersion: "fact-review-manifest-v1",
  manifestHash: MANIFEST_HASH,
  decisions: [
    {
      subjectRef: SUBJECT_B,
      disposition: "CORRECTION_REQUIRED",
      correctionReason: "INCORRECT_INFORMATION",
      correctionInstruction: "  Controleer de waarde.  ",
    },
    { subjectRef: SUBJECT_A, disposition: "ACCEPTED" },
  ],
};

const normalized = normalizeEvidenceFactReviewRoundRequest(requestBody);
assert(
  normalized && normalized.decisions.length === 2 &&
    normalized.decisions[0].subjectRef === SUBJECT_A &&
    normalized.decisions[1].subjectRef === SUBJECT_B &&
    normalized.decisions[1].disposition === "CORRECTION_REQUIRED" &&
    normalized.decisions[1].correctionInstruction === "Controleer de waarde.",
  "normalized_round_invalid",
);
q(1);

for (const invalid of [
  { ...requestBody, decisions: [] },
  { ...requestBody, decisions: [requestBody.decisions[0], requestBody.decisions[0]] },
  {
    ...requestBody,
    decisions: [{
      subjectRef: SUBJECT_A,
      disposition: "CORRECTION_REQUIRED",
      correctionReason: "WRONG_DOCUMENT",
      correctionInstruction: "Verkeerd document.",
    }],
  },
  {
    ...requestBody,
    decisions: [{
      subjectRef: SUBJECT_A,
      disposition: "CORRECTION_REQUIRED",
      correctionReason: "MISSING_INFORMATION",
    }],
  },
  {
    ...requestBody,
    reviewerWorkforceIdentityId: AUTH_USER,
  },
  { ...requestBody, tenantId: "other" },
  { ...requestBody, manifestHash: "client-value-hash" },
]) {
  assert(
    normalizeEvidenceFactReviewRoundRequest(invalid) === null,
    "invalid_round_allowed",
  );
}
q(2);

function mockClient(
  rpc: (name: string, args: JsonObject) => Promise<{
    data?: unknown;
    error?: unknown;
  }>,
): ServiceClient {
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({}),
    rpc,
  };
}

function handler(options: {
  auth?: boolean;
  client?: ServiceClient | null;
  tenantFailure?: Response;
  onHash?: (value: unknown) => void;
}) {
  return createHandler({
    createServiceClient: () => options.client ?? null,
    idempotencyExpiresAt: () => "2030-01-01T00:00:00.000Z",
    requestMeta: async () => options.tenantFailure ?? META,
    hashPayload: async (value) => {
      options.onHash?.(value);
      return "b".repeat(64);
    },
    verifyBearer: async () => options.auth === false
      ? {
        ok: false,
        status: 401,
        code: "missing_authorization",
        message: "Niet geautoriseerd.",
      }
      : {
        ok: true,
        context: {
          authUserId: AUTH_USER,
          emailNormalized: "proof@example.invalid",
        },
      },
  });
}

function request(body: unknown = requestBody): Request {
  return new Request(ENDPOINT_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer proof",
      "Content-Type": "application/json",
      "Idempotency-Key": "review15-endpoint-key",
    },
    body: JSON.stringify(body),
  });
}

const nonPost = await handler({})(new Request(ENDPOINT_URL));
assert(nonPost.status === 405, "non_post_not_denied");
q(3);

let gatedCalls = 0;
const tenantFailure = new Response("{}", { status: 503 });
const gatedClient = mockClient(async () => {
  gatedCalls += 1;
  return {};
});
const gated = await handler({ client: gatedClient, tenantFailure })(request());
assert(gated === tenantFailure && gatedCalls === 0, "tenant_gate_not_first");
q(4);

const noAuth = await handler({ client: gatedClient, auth: false })(request());
assert(noAuth.status === 401 && gatedCalls === 0, "auth_not_fail_closed");
q(5);

let rpcCalls = 0;
let capturedHash: unknown = null;
const successClient = mockClient(async (name, args) => {
  rpcCalls += 1;
  assert(
    name === "app_evidence_review_round_finalize_v1" &&
      Object.keys(args).sort().join("|") === [
        "p_auth_user_id",
        "p_case_ref",
        "p_decisions",
        "p_idempotency_expires_at",
        "p_idempotency_key",
        "p_manifest_hash",
        "p_manifest_version",
        "p_payload_sha256",
        "p_request_id",
      ].sort().join("|") &&
      args.p_auth_user_id === AUTH_USER && args.p_case_ref === CASE_REF &&
      args.p_manifest_version === "fact-review-manifest-v1" &&
      args.p_manifest_hash === MANIFEST_HASH &&
      Array.isArray(args.p_decisions) &&
      !("reviewer_workforce_identity_id" in args) && !("tenant_id" in args) &&
      !("role" in args) && !("capability" in args) &&
      !("client_timestamp" in args) && !("value_hash" in args),
    "private_rpc_contract_invalid",
  );
  return {
    data: {
      ok: true,
      status: 201,
      code: "finalized",
      round_id: ROUND_ID,
      manifest_version: "fact-review-manifest-v1",
      manifest_hash: MANIFEST_HASH,
      outcome: "CORRECTIONS_REQUIRED",
      finalized_at: "2026-08-18T12:00:00.000Z",
    },
  };
});
const success = await handler({
  client: successClient,
  onHash: (value) => capturedHash = value,
})(request());
const successBody = await success.json() as JsonObject;
assert(
  success.status === 201 && rpcCalls === 1 &&
    successBody.schemaVersion === "evidence-fact-review-round-finalization-v1" &&
    successBody.caseRef === CASE_REF && successBody.roundRef === ROUND_ID &&
    successBody.manifestHash === MANIFEST_HASH &&
    successBody.outcome === "CORRECTIONS_REQUIRED" &&
    successBody.result === "FINALIZED" &&
    JSON.stringify(capturedHash).includes(AUTH_USER) &&
    !JSON.stringify(capturedHash).includes("reviewerWorkforceIdentityId"),
  "success_response_invalid",
);
q(6);

const invalidRequest = await handler({ client: successClient })(request({
  ...requestBody,
  decisions: [{
    subjectRef: SUBJECT_A,
    disposition: "CORRECTION_REQUIRED",
    correctionReason: "UNREADABLE_DOCUMENT",
    correctionInstruction: "Onleesbaar.",
  }],
}));
assert(invalidRequest.status === 400 && rpcCalls === 1, "invalid_called_rpc");
q(7);

for (const code of [
  "capability_not_authorized",
  "case_scope_denied",
  "stale_review_manifest",
  "manifest_subjects_mismatch",
  "review_round_conflict",
]) {
  const deniedClient = mockClient(async () => ({
    data: { ok: false, status: code.includes("authorized") ? 403 : 409, code },
  }));
  const response = await handler({ client: deniedClient })(request());
  const body = await response.json();
  assert(
    response.status === (code.includes("authorized") || code === "case_scope_denied"
      ? 403
      : 409) &&
      !JSON.stringify(body).includes("workforce_identity_id") &&
      !JSON.stringify(body).includes("service_role"),
    `unsafe_failure:${code}`,
  );
}
q(8);

const replayClient = mockClient(async () => ({
  data: {
    ok: true,
    status: 200,
    code: "already_finalized",
    round_id: ROUND_ID,
    manifest_version: "fact-review-manifest-v1",
    manifest_hash: MANIFEST_HASH,
    outcome: "CORRECTIONS_REQUIRED",
    finalized_at: "2026-08-18T12:00:00.000Z",
  },
}));
const replay = await handler({ client: replayClient })(request());
const replayBody = await replay.json() as JsonObject;
assert(
  replay.status === 200 && replayBody.result === "ALREADY_FINALIZED" &&
    replayBody.roundRef === ROUND_ID,
  "idempotent_response_invalid",
);
q(9);

const source = await Deno.readTextFile(
  new URL(
    "../../supabase/functions/api-app-evidence-review-round-finalize/index.ts",
    import.meta.url,
  ),
);
const migration = await Deno.readTextFile(
  new URL(
    "../../supabase/migrations/20260818230000_app_evidence_fact_review_rounds.sql",
    import.meta.url,
  ),
);
assert(
  source.includes("app_evidence_review_round_finalize_v1") &&
    source.includes("requireVerifiedSupabaseAuthUser") &&
    !source.includes("SUPABASE_SERVICE_ROLE_KEY") &&
    !source.includes("reviewerWorkforceIdentityId:") &&
    migration.includes("app_workforce_authorize_v1") &&
    migration.includes("'evidence.review.decide'") &&
    migration.includes("pg_advisory_xact_lock") &&
    migration.includes("app_location_write_idempotency_begin_v1") &&
    migration.includes("app_evidence_review_idempotency_complete_v1"),
  "authority_or_transaction_source_invalid",
);
q(10);

assert(
  migration.includes("enable row level security") &&
    migration.includes("create policy deny_all") &&
    migration.includes("from public, anon, authenticated") &&
    migration.includes("subject_kind = 'FACT'") &&
    !migration.includes("CheckExecution") &&
    !migration.includes("FRAUD_SUSPICION"),
  "rls_or_deferred_scope_invalid",
);
q(11);

assert(
  !source.includes("setInterval") && !source.includes("setTimeout") &&
    !source.includes("localStorage") && !source.includes("sessionStorage") &&
    source.split("serviceClient.rpc(").length - 1 === 1,
  "latency_or_server_draft_boundary_invalid",
);
q(12);

console.log("EVIDENCE_FACT_REVIEW_ROUND_ENDPOINT_Q01_Q12=PASS");
