import type { AppRequestMeta } from "../../supabase/functions/_shared/app_foundation.ts";
import { normalizeCorrectionReplacementWithdrawRequest } from "../../supabase/functions/_shared/app_customer_correction_replacement.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";
import { createHandler } from "../../supabase/functions/api-app-customer-correction-upload-remove/index.ts";

const ROOT = new URL("../../", import.meta.url);
const MIGRATION = Deno.readTextFileSync(
  new URL(
    "supabase/migrations/20260823120000_app_customer_correction_candidate_selection.sql",
    ROOT,
  ),
);
const CASE_REF = "CASE-000000000001";
const TARGET_REF = `CRT-${"A".repeat(32)}`;
const CANDIDATE_REF = `CRC-${"B".repeat(32)}`;
const AUTH_USER = "e2000000-0000-4000-8000-000000000001";
const HASH = "c".repeat(64);

function invariant(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

const META: AppRequestMeta = {
  request_id: "customer04c3c9e-withdraw",
  idempotency_key: "customer04c3c9e-withdraw-idem",
  ip_hash: null,
  user_agent_hash: null,
  method: "POST",
  path: "/api-app-customer-correction-upload-remove",
  url: "https://enval.local/api-app-customer-correction-upload-remove",
  origin: null,
  timestamp: "2026-08-23T12:00:00.000Z",
  environment: "local",
};

invariant(
  normalizeCorrectionReplacementWithdrawRequest({
    caseRef: CASE_REF,
    replacementTargetRef: TARGET_REF,
    candidateRef: CANDIDATE_REF,
  }).ok,
  "valid_withdraw_rejected",
);
invariant(
  !normalizeCorrectionReplacementWithdrawRequest({
    caseRef: CASE_REF,
    replacementTargetRef: TARGET_REF,
    candidateRef: CANDIDATE_REF,
    storagePath: "customer-corrections/not-authority.pdf",
  }).ok,
  "storage_path_accepted",
);

let rpcName = "";
let rpcArgs: JsonObject = {};
const serviceClient: ServiceClient = {
  auth: { getUser: async () => ({}) },
  from: () => ({}),
  rpc: async (name, args) => {
    rpcName = name;
    rpcArgs = args;
    return {
      data: {
        ok: true,
        status: 200,
        code: "withdrawn",
        replacement_target_ref: TARGET_REF,
        candidate_ref: CANDIDATE_REF,
      },
    };
  },
};
const handler = createHandler({
  createServiceClient: () => serviceClient,
  requestMeta: async () => META,
  hashPayload: async () => HASH,
  verifyBearer: async () => ({
    ok: true as const,
    context: {
      authUserId: AUTH_USER,
      emailNormalized: "proof@example.invalid",
    },
  }),
});
const response = await handler(
  new Request(META.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      caseRef: CASE_REF,
      replacementTargetRef: TARGET_REF,
      candidateRef: CANDIDATE_REF,
    }),
  }),
);
const body = await response.json();
invariant(
  response.status === 200 && body.status === "withdrawn" &&
    rpcName === "app_customer_correction_replacement_withdraw_v1" &&
    rpcArgs.p_auth_user_id === AUTH_USER &&
    rpcArgs.p_replacement_target_ref === TARGET_REF &&
    rpcArgs.p_candidate_ref === CANDIDATE_REF &&
    !("storage_path" in rpcArgs),
  "withdraw_endpoint_authority_failed",
);

for (
  const required of [
    "app_customer_correction_replacement_candidate_events",
    "event_type in ('SELECTED', 'WITHDRAWN')",
    "generated always as identity",
    "trg_app_customer_correction_candidate_select_on_confirm",
    "app_customer_correction_replacement_resolution_v2",
    "legacy_latest_confirmed",
    "explicit_selection_event",
    "app_customer_correction_replacement_withdraw_v1",
    "pg_advisory_xact_lock",
    "already_withdrawn",
    "replacement_candidate_not_current",
    "enable row level security",
    "create policy deny_all",
    "before update or delete",
  ]
) invariant(MIGRATION.includes(required), `migration_missing:${required}`);
invariant(
  !MIGRATION.includes("delete from public.app_customer_correction") &&
    !MIGRATION.includes(
      "update public.app_customer_correction_replacement_candidates",
    ),
  "withdrawal_mutates_history",
);

console.log("CORRECTION_WITHDRAWAL_ENDPOINT=PASS");
console.log("CANDIDATE_SELECTION_EVENT_MODEL=PASS");
console.log("WITHDRAWAL_APPEND_ONLY=PASS");
