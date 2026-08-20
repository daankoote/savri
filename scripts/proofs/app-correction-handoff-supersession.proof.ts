import {
  CORRECTION_SUPERSESSION_REASONS,
  createHandler,
  normalizeCorrectionSupersedeRequest,
} from "../../supabase/functions/api-app-evidence-review-correction-supersede/index.ts";
import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const MIGRATION =
  "supabase/migrations/20260820210000_app_correction_handoff_supersession.sql";
const ENDPOINT =
  "supabase/functions/api-app-evidence-review-correction-supersede/index.ts";
const HANDOFF_SHARED =
  "supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
const CASE_REF = "CASE-000000000001";
const PREDECESSOR_REF = "CRH-0000000000000001";
const SUCCESSOR_REF = "CRH-0000000000000002";
const ITEM_REF = "CCI-" + "A".repeat(32);
const AUTH_USER = "e2000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const META: AppRequestMeta = {
  request_id: "customer04c3a-proof-request",
  idempotency_key: "customer04c3a-proof-key",
  ip_hash: null,
  user_agent_hash: null,
  method: "POST",
  path: "/api-app-evidence-review-correction-supersede",
  url: "https://enval.local/api-app-evidence-review-correction-supersede",
  origin: null,
  timestamp: "2026-08-20T21:00:00.000Z",
  environment: "local",
};

function client(
  rpc: (
    name: string,
    args: JsonObject,
  ) => Promise<{ data?: unknown; error?: unknown }>,
): ServiceClient {
  return {
    auth: { getUser: async () => ({}) },
    from: () => ({}),
    rpc,
  };
}

function verified() {
  return Promise.resolve({
    ok: true as const,
    context: {
      authUserId: AUTH_USER,
      emailNormalized: "proof@example.invalid",
    },
  });
}

function requestBody(
  requirement = "VALUE_PLUS_DOCUMENT_REPLACEMENT",
  reason = "NEW_EVIDENCE_REQUIRED",
): JsonObject {
  return {
    caseRef: CASE_REF,
    predecessorHandoffRef: PREDECESSOR_REF,
    itemRequirements: [{
      itemRef: ITEM_REF,
      responseRequirement: requirement,
    }],
    reason,
  };
}

async function endpointProof(): Promise<void> {
  assert(
    CORRECTION_SUPERSESSION_REASONS.join("|") ===
      "NEW_EVIDENCE_REQUIRED|REQUIREMENT_CORRECTION|PROCESS_CORRECTION|OTHER",
    "reason_registry_not_closed",
  );
  assert(
    normalizeCorrectionSupersedeRequest(requestBody())?.itemRequirements[0]
      .responseRequirement === "VALUE_PLUS_DOCUMENT_REPLACEMENT",
    "value_plus_document_transition_rejected",
  );
  assert(
    normalizeCorrectionSupersedeRequest({
      ...requestBody("VALUE_CORRECTION", "OTHER"),
      explanation: "Correctie van de administratieve instructie.",
    })?.reason === "OTHER",
    "bounded_other_reason_rejected",
  );
  for (
    const invalid of [
      { ...requestBody(), reason: "FRAUD" },
      { ...requestBody("UNKNOWN") },
      { ...requestBody("VALUE_CORRECTION", "OTHER") },
      {
        ...requestBody(),
        itemRequirements: [
          requestBody().itemRequirements,
        ],
      },
      {
        ...requestBody(),
        itemRequirements: [
          { itemRef: ITEM_REF, responseRequirement: "VALUE_CORRECTION" },
          { itemRef: ITEM_REF, responseRequirement: "MISSING_VALUE" },
        ],
      },
      { ...requestBody(), customerId: AUTH_USER },
    ]
  ) {
    assert(
      normalizeCorrectionSupersedeRequest(invalid) === null,
      "invalid_request_not_fail_closed",
    );
  }

  let rpcName = "";
  let rpcArgs: JsonObject = {};
  const handler = createHandler({
    createServiceClient: () =>
      client(async (name, args) => {
        rpcName = name;
        rpcArgs = args;
        return {
          data: {
            ok: true,
            status: 201,
            code: "superseded",
            predecessor_handoff_ref: PREDECESSOR_REF,
            successor_handoff_ref: SUCCESSOR_REF,
            published_at: "2026-08-20T21:00:00.000Z",
          },
        };
      }),
    idempotencyExpiresAt: () => "2026-08-21T21:00:00.000Z",
    requestMeta: async () => META,
    hashPayload: async () => HASH,
    verifyBearer: verified,
  });
  const response = await handler(
    new Request("https://enval.local/supersede", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody()),
    }),
  );
  const body = await response.json();
  assert(
    response.status === 201 &&
      body?.schemaVersion === "evidence-review-correction-supersede-v1" &&
      body?.predecessorHandoffRef === PREDECESSOR_REF &&
      body?.successorHandoffRef === SUCCESSOR_REF &&
      rpcName === "app_evidence_review_correction_supersede_v1" &&
      rpcArgs.p_auth_user_id === AUTH_USER &&
      rpcArgs.p_case_ref === CASE_REF &&
      rpcArgs.p_predecessor_handoff_ref === PREDECESSOR_REF &&
      !("customer_id" in rpcArgs) &&
      !("workforce_identity_id" in rpcArgs),
    "endpoint_did_not_preserve_server_authority",
  );

  const denied = createHandler({
    createServiceClient: () =>
      client(async () => ({
        data: {
          ok: false,
          status: 403,
          code: "capability_not_authorized",
        },
      })),
    idempotencyExpiresAt: () => "2026-08-21T21:00:00.000Z",
    requestMeta: async () => META,
    hashPayload: async () => HASH,
    verifyBearer: verified,
  });
  const deniedResponse = await denied(
    new Request("https://enval.local/supersede", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody()),
    }),
  );
  assert(
    deniedResponse.status === 403 &&
      (await deniedResponse.json())?.code === "capability_not_authorized",
    "authorization_failure_not_customer_safe",
  );
}

async function architectureProof(): Promise<void> {
  const migration = await Deno.readTextFile(MIGRATION);
  const endpoint = await Deno.readTextFile(ENDPOINT);
  const handoffShared = await Deno.readTextFile(HANDOFF_SHARED);
  assert(
    migration.includes("'evidence.review.correction.supersede'") &&
      migration.includes("floor_seniority = 'admin'") &&
      migration.includes("default_seniority = 'admin'") &&
      migration.includes("app_workforce_authorize_v1(") &&
      migration.includes("'evidence.review.correction.supersede',") &&
      migration.includes("v_case.id,") &&
      migration.includes("publisher_scope_assignment_id"),
    "central_admin_exact_case_authority_missing",
  );
  assert(
    migration.includes("add column supersedes_handoff_id uuid") &&
      migration.includes(
        "app_evidence_review_correction_handoffs_predecessor_uidx",
      ) &&
      migration.includes(
        "app_evidence_review_correction_handoff_lineage_guard_v1",
      ) &&
      migration.includes(
        "predecessor_item.value - 'response_requirement'",
      ) &&
      migration.includes("new.case_id <> v_predecessor.case_id") &&
      migration.includes("new.round_id <> v_predecessor.round_id") &&
      !migration.includes("set superseded") &&
      !migration.includes("current boolean") &&
      !migration.includes(
        "update public.app_evidence_review_correction_handoffs",
      ),
    "append_only_lineage_or_item_set_guard_missing",
  );
  assert(
    migration.includes("NEW_EVIDENCE_REQUIRED") &&
      migration.includes("REQUIREMENT_CORRECTION") &&
      migration.includes("PROCESS_CORRECTION") &&
      migration.includes("supersession_reason = 'OTHER'") &&
      migration.includes("between 1 and 500"),
    "immutable_reason_contract_missing",
  );
  assert(
    migration.includes(
      "app_evidence_review_current_correction_handoff_v1",
    ) &&
      migration.includes("successor.supersedes_handoff_id = handoff.id") &&
      migration.includes(
        "create or replace function public.app_customer_correction_handoff_read_v2",
      ) &&
      migration.includes(
        "create or replace function public.app_customer_correction_prepare_v1",
      ) &&
      migration.includes(
        "create or replace function public.app_evidence_review_overall_status_v1",
      ) &&
      migration.includes("return 'WAITING_CUSTOMER'"),
    "current_tail_read_prepare_status_cutover_missing",
  );
  assert(
    migration.includes("app_location_write_idempotency_begin_v1") &&
      migration.includes("app_evidence_review_idempotency_complete_v1") &&
      migration.includes("pg_advisory_xact_lock") &&
      migration.includes("correction_handoff_not_current") &&
      migration.includes("correction_handoff_answered") &&
      migration.includes(
        "app_evidence_review_correction_handoffs_predecessor_uidx",
      ),
    "idempotency_concurrency_or_stale_guard_missing",
  );
  assert(
    handoffShared.includes("VALUE_CORRECTION") &&
      handoffShared.includes("MISSING_VALUE") &&
      handoffShared.includes("DOCUMENT_REPLACEMENT") &&
      handoffShared.includes("VALUE_PLUS_DOCUMENT_REPLACEMENT") &&
      endpoint.includes("CUSTOMER_CORRECTION_RESPONSE_REQUIREMENTS") &&
      !migration.includes("fraud") && !migration.includes("authenticity"),
    "response_requirement_registry_not_reused",
  );
  assert(
    !migration.includes("app_evidence_review_decisions (") &&
      !migration.includes("app_evidence_review_customer_submissions (") &&
      !migration.includes("app_signup_signing_snapshots (") &&
      !endpoint.includes("storage") && !endpoint.includes("parser"),
    "supersession_created_customer_review_or_evidence_truth",
  );
}

await endpointProof();
await architectureProof();

console.log("SUPERSESSION_APPEND_ONLY=PASS");
console.log("SUPERSESSION_AUTH_ADMIN_EXACT_CASE=PASS");
console.log("SUPERSESSION_REASON_CLOSED_REQUIRED=PASS");
console.log("SUPERSESSION_SAME_ITEM_SET=PASS");
console.log("SUPERSESSION_RESPONSE_REQUIREMENTS_CLOSED=PASS");
console.log("SUPERSESSION_CURRENT_TAIL_DERIVED=PASS");
console.log("SUPERSESSION_STALE_CUSTOMER_CONTEXT_DENIED=PASS");
console.log("SUPERSESSION_IDEMPOTENCY_CONCURRENCY=PASS");
console.log("SUPERSESSION_NO_CUSTOMER_OR_REVIEW_TRUTH=PASS");
console.log("CUSTOMER04C3A_Q01_Q09=PASS");
