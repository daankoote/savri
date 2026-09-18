import {
  isCorrectionCoverMessage,
  parseCustomerCorrectionHandoffSource,
} from "../../supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
import {
  createHandler as createPublishHandler,
  normalizeCorrectionPublishRequest,
} from "../../supabase/functions/api-app-evidence-review-correction-publish/index.ts";
import {
  normalizeCorrectionSupersedeRequest,
} from "../../supabase/functions/api-app-evidence-review-correction-supersede/index.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (path: string) => Deno.readTextFileSync(new URL(path, ROOT));
const CASE_REF = "CASE-AAAAAAAAAAAA";
const ROUND_REF = "11111111-1111-4111-8111-111111111111";
const AUTH_USER = "22222222-2222-4222-8222-222222222222";
const COVER_MESSAGE = "Controleer regel één.\nCorrigeer regel twee.";
const HASH = "a".repeat(64);
const SUBJECT_REF = `FRS-${"a".repeat(64)}`;
const ITEM_REQUIREMENTS = Object.freeze([{
  subjectRef: SUBJECT_REF,
  responseRequirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT" as const,
}]);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function serviceClient(
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

assert(
  isCorrectionCoverMessage(COVER_MESSAGE) &&
    isCorrectionCoverMessage("Unicode klantbericht 你好") &&
    isCorrectionCoverMessage("a".repeat(1_000)) &&
    isCorrectionCoverMessage("𐐀".repeat(1_000)),
  "valid_cover_message_rejected",
);
for (
  const invalid of [
    null,
    "",
    "   ",
    " bericht",
    "bericht ",
    "---",
    "regel één\r\nregel twee",
    "regel één\tregel twee",
    "a".repeat(1_001),
    "𐐀".repeat(1_001),
  ]
) {
  assert(!isCorrectionCoverMessage(invalid), "invalid_cover_message_accepted");
}

assert(
  normalizeCorrectionPublishRequest({
        caseRef: CASE_REF,
        coverMessage: COVER_MESSAGE,
        itemRequirements: ITEM_REQUIREMENTS,
        roundRef: ROUND_REF,
      })?.coverMessage === COVER_MESSAGE &&
    !normalizeCorrectionPublishRequest({
      caseRef: CASE_REF,
      itemRequirements: ITEM_REQUIREMENTS,
      roundRef: ROUND_REF,
    }) &&
    !normalizeCorrectionPublishRequest({
      caseRef: CASE_REF,
      coverMessage: "\r",
      itemRequirements: ITEM_REQUIREMENTS,
      roundRef: ROUND_REF,
    }),
  "publish_cover_contract_not_fail_closed",
);

assert(
  normalizeCorrectionSupersedeRequest({
        caseRef: CASE_REF,
        coverMessage: "Nieuw bericht voor deze successor.",
        predecessorHandoffRef: "CRH-0123456789ABCDEF",
        itemRequirements: [{
          itemRef: `CCI-${"A".repeat(32)}`,
          responseRequirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT",
        }],
        reason: "REQUIREMENT_CORRECTION",
      })?.coverMessage === "Nieuw bericht voor deze successor." &&
    !normalizeCorrectionSupersedeRequest({
      caseRef: CASE_REF,
      predecessorHandoffRef: "CRH-0123456789ABCDEF",
      itemRequirements: [{
        itemRef: `CCI-${"A".repeat(32)}`,
        responseRequirement: "VALUE_PLUS_DOCUMENT_REPLACEMENT",
      }],
      reason: "REQUIREMENT_CORRECTION",
    }),
  "successor_cover_contract_not_required",
);

let rpcCalls = 0;
let rpcName = "";
let rpcArgs: JsonObject = {};
const handler = createPublishHandler({
  createServiceClient: () =>
    serviceClient(async (name, args) => {
      rpcCalls += 1;
      rpcName = name;
      rpcArgs = args;
      return {
        data: {
          ok: true,
          status: 201,
          code: "published",
          handoff_ref: "CRH-0123456789ABCDEF",
          round_id: ROUND_REF,
          published_at: "2026-09-16T12:00:00.000Z",
        },
      };
    }),
  idempotencyExpiresAt: () => "2030-01-01T00:00:00.000Z",
  requestMeta: async () => ({
    request_id: "cover-proof-request",
    idempotency_key: "cover-proof-key",
    ip_hash: null,
    user_agent_hash: null,
    method: "POST",
    path: "/api-app-evidence-review-correction-publish",
    url: "https://enval.local/publish",
    origin: null,
    timestamp: "2026-09-16T12:00:00.000Z",
    environment: "local",
  }),
  hashPayload: async () => HASH,
  verifyBearer: async () => ({
    ok: true,
    context: {
      authUserId: AUTH_USER,
      emailNormalized: "proof@example.invalid",
    },
  }),
});
const validResponse = await handler(
  new Request("https://enval.local/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      caseRef: CASE_REF,
      coverMessage: COVER_MESSAGE,
      itemRequirements: ITEM_REQUIREMENTS,
      roundRef: ROUND_REF,
    }),
  }),
);
assert(
  validResponse.status === 201 && rpcCalls === 1 &&
    rpcName === "app_evidence_review_correction_publish_v3" &&
    Array.isArray(rpcArgs.p_item_requirements) &&
    rpcArgs.p_cover_message === COVER_MESSAGE,
  "publish_cover_not_bound_to_v3_rpc",
);
const invalidResponse = await handler(
  new Request("https://enval.local/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caseRef: CASE_REF, roundRef: ROUND_REF }),
  }),
);
assert(
  invalidResponse.status === 400 && rpcCalls === 1,
  "invalid_cover_reached_business_rpc",
);

function source(
  coverMessage: string | null,
  publicationHash: string | null,
) {
  return {
    ok: true,
    status: 200,
    code: "ok",
    case_ref: CASE_REF,
    handoff: {
      bundle_version: 4,
      cover_message: coverMessage,
      current_replacement_candidates: [],
      customer_publication_snapshot_sha256: publicationHash,
      fact_projections: [],
      handoff_ref: "CRH-0123456789ABCDEF",
      published_at: "2026-09-16T12:00:00.000Z",
      signer_authority: { status: "unavailable" },
      items: [{
        item_ref: `CCI-${"A".repeat(32)}`,
        document_label: "Energiedocument",
        fact_key: "energySupplier",
        fact_label: "Energieleverancier",
        current_value: "Vorige leverancier",
        correction_reason: "INCORRECT_INFORMATION",
        correction_reason_label: "Gegeven onjuist",
        correction_instruction: "Corrigeer de leverancier.",
        response_requirement: "VALUE_CORRECTION",
      }],
    },
  };
}
assert(
  parseCustomerCorrectionHandoffSource(source(COVER_MESSAGE, HASH))?.handoff
        ?.coverMessage === COVER_MESSAGE &&
    parseCustomerCorrectionHandoffSource(source(null, null))?.handoff
        ?.coverMessage === null &&
    !parseCustomerCorrectionHandoffSource(source(COVER_MESSAGE, null)) &&
    !parseCustomerCorrectionHandoffSource({
      ...source(COVER_MESSAGE, HASH),
      handoff: {
        ...source(COVER_MESSAGE, HASH).handoff,
        actor_ref: "internal",
      },
    }),
  "customer_publication_projection_not_strict",
);

const migration = read(
  "supabase/migrations/20260916120526_correction_cover_message_v1.sql",
);
const workforceUi = read(
  "app/src/features/evidence-review/EvidenceReviewCaseDetailPage.tsx",
);
const customerUi = read(
  "app/src/features/dashboard/CustomerCorrectionHandoffPanel.tsx",
);
const coverMessageField = workforceUi.split(
  "<span>Bericht aan klant</span>",
)[1]?.split("/>")[0] ?? "";
assert(
  migration.includes("evidence-review-correction-handoff-bundle-v3") &&
    migration.includes("app_correction_customer_publication_snapshot_v1") &&
    migration.includes("app_customer_correction_handoff_read_v6") &&
    migration.includes("from public, anon, authenticated, service_role") &&
    !migration.includes("app_workflow_email_") &&
    !migration.includes("recipient") && !migration.includes("provider"),
  "migration_snapshot_or_no_mail_boundary_missing",
);
assert(
  workforceUi.includes("Bericht aan klant") &&
    !coverMessageField.includes("maxLength") &&
    customerUi.split('aria-label="Bericht bij correcties"').length === 2 &&
    !workforceUi.includes("style={{") && !customerUi.includes("style={{"),
  "existing_ui_primitives_not_reused",
);

console.log("CORRECTION_COVER_MESSAGE_V1_PURE=PASS");
