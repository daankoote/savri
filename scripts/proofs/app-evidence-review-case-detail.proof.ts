import {
  parseEvidenceReviewCaseDetailSource,
  type EvidenceReviewCaseDetailResponseV1,
} from "../../supabase/functions/_shared/app_evidence_review_case_detail.ts";
import {
  createHandler,
} from "../../supabase/functions/api-app-evidence-review-case-detail/index.ts";
import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const CONTAINER = "supabase_db_enval";
const ACTIVE_DATABASE = "postgres";
const DATABASE = `enval_review07_proof_${crypto.randomUUID().replaceAll("-", "")}`;
const MIGRATION =
  "supabase/migrations/20260818180000_app_signup_resolution_provenance_projection.sql";
const CORRECTION_MIGRATION =
  "supabase/migrations/20260818210000_app_evidence_review_correction_details.sql";
const AFFORDANCE_MIGRATION =
  "supabase/migrations/20260818220000_app_evidence_review_case_detail_decide_affordance.sql";
const ROUND_MIGRATION =
  "supabase/migrations/20260818230000_app_evidence_fact_review_rounds.sql";
const CURRENT_ROUND_READ_MIGRATION =
  "supabase/migrations/20260819090000_app_evidence_review_current_round_read.sql";
const OVERALL_STATUS_MIGRATION =
  "supabase/migrations/20260819160000_app_evidence_review_overall_status.sql";
const PUBLISH_AFFORDANCE_MIGRATION =
  "supabase/migrations/20260819210000_app_evidence_review_correction_publish_affordance.sql";
const PILOT_CASE_REF = "CASE-7E4CC75CD19F";
const HASH = "a".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

const AUTH_ADMIN = "e1000000-0000-4000-8000-000000000001";
const AUTH_ADMIN_NO_SCOPE = "e1000000-0000-4000-8000-000000000002";
const AUTH_DECIDE_ONLY = "e1000000-0000-4000-8000-000000000003";
const AUTH_NON_WORKFORCE = "e1000000-0000-4000-8000-000000000004";
const AUTH_CUSTOMER_ONLY = "e1000000-0000-4000-8000-000000000005";
const AUTH_VIEW_DECIDE = "e1000000-0000-4000-8000-000000000006";
const AUTH_INACTIVE = "e1000000-0000-4000-8000-000000000007";
const CUSTOMER = "e2000000-0000-4000-8000-000000000001";
const CASE_A = "e3000000-0000-4000-8000-000000000001";
const CASE_B = "e3000000-0000-4000-8000-000000000002";
const CASE_REF_A = "CASE-A00000000001";
const CASE_REF_B = "CASE-B00000000002";
const PARTY = "e4000000-0000-4000-8000-000000000001";
const PARTY_PROFILE = "e4000000-0000-4000-8000-000000000002";
const LOCATION = "e5000000-0000-4000-8000-000000000001";
const CHARGER = "e5000000-0000-4000-8000-000000000002";
const PROMOTION = "e6000000-0000-4000-8000-000000000001";
const SNAPSHOT = "e6000000-0000-4000-8000-000000000002";
const SNAPSHOT_V2 = "e6000000-0000-4000-8000-000000000003";
const ENERGY_FILE = "e7000000-0000-4000-8000-000000000001";
const INVOICE_FILE = "e7000000-0000-4000-8000-000000000002";
const ENERGY_VERSION = "e8000000-0000-4000-8000-000000000001";
const INVOICE_VERSION = "e8000000-0000-4000-8000-000000000002";
const ENERGY_VERSION_V2 = "e8000000-0000-4000-8000-000000000003";

type CommandResult = { code: number; stdout: string; stderr: string };
class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REVIEW07-Q${String(value).padStart(2, "0")}: PASS`);
}
function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/postgres(?:ql)?:\/\/\S+/gi, "[database]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 500);
}
async function command(
  name: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const child = new Deno.Command(name, {
    args,
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }
  const output = await child.output();
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
  };
}
async function must(name: string, args: string[], stdin?: string): Promise<string> {
  const result = await command(name, args, stdin);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || `${name}_failed`));
  }
  return result.stdout;
}
async function psql(database: string, sql: string): Promise<string> {
  return await must("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
  ], sql);
}
async function dropDatabase(): Promise<void> {
  await must("docker", [
    "exec",
    CONTAINER,
    "dropdb",
    "-U",
    "postgres",
    "--force",
    "--if-exists",
    DATABASE,
  ]);
}

const META: AppRequestMeta = {
  request_id: "review07-proof-request",
  idempotency_key: null,
  ip_hash: null,
  user_agent_hash: null,
  method: "GET",
  path: "/api-app-evidence-review-case-detail",
  url: `https://enval.local/api-app-evidence-review-case-detail?caseRef=${CASE_REF_A}`,
  origin: null,
  timestamp: "2026-08-18T12:00:00.000Z",
  environment: "local",
};

function sourceEvidence(overrides: Partial<JsonObject> = {}): JsonObject {
  return {
    evidence_file_ref: ENERGY_FILE,
    evidence_version_ref: ENERGY_VERSION,
    kind: "energy_bill_or_contract",
    mime_type: "application/pdf",
    uploaded_at: "2026-08-18T10:00:00.000Z",
    sha256_present: true,
    review_status: "PENDING",
    decided_at: null,
    correction_reason: null,
    correction_instruction: null,
    canonical_facts: [
      { category: "PARTY_NAME", value: "Declared Person", truth_class: "CUSTOMER_CONFIRMED", review_reason: null },
      { category: "EAN", value: "871234567890123456", truth_class: "REVIEW_REQUIRED", review_reason: "USER_OVERRIDE" },
    ],
    ...overrides,
  };
}
function sourceSubject(
  evidenceVersionRef: string,
  evidenceKind: string,
  suffix: string,
): JsonObject {
  const invoice = evidenceKind === "installation_invoice";
  return {
    subject_ref: `FRS-${suffix.repeat(64)}`,
    subject_kind: "FACT",
    evidence_version_ref: evidenceVersionRef,
    evidence_kind: evidenceKind,
    fact_key: invoice ? "chargerBrand" : "electricityEan",
    fact_category: invoice ? "CHARGER_BRAND" : "EAN",
    fact_label: invoice ? "Merk" : "EAN",
    scope_ref: `FRSCOPE-${suffix.repeat(64)}`,
    value: invoice ? "Brand" : "871234567890123456",
    value_status: "PRESENT",
    required: true,
    truth_class: "REVIEW_REQUIRED",
    review_reason: "USER_OVERRIDE",
    review_reason_authority: "CUSTOMER_SIGNED_RESOLUTION",
    reviewer_suggestion: "NONE",
  };
}
function rpcSuccess(evidence: readonly JsonObject[] = [sourceEvidence()]): JsonObject {
  const reviewSubjects = evidence.map((item, index) =>
    sourceSubject(
      String(item.evidence_version_ref),
      String(item.kind),
      String((index % 9) + 1),
    )
  );
  return {
    ok: true,
    status: 200,
    code: "ok",
    as_of: "2026-08-18T12:00:00.000Z",
    case_context: {
      can_decide: true,
      can_publish_correction: true,
      case_ref: CASE_REF_A,
      lifecycle_state: "submitted_for_review",
      party_display_name: "Declared Person",
      party_truth_class: "DECLARED",
      delivery_address: "Declared Address",
      delivery_address_truth_class: "DECLARED",
    },
    evidence,
    review_manifest_version: "fact-review-manifest-v1",
    review_manifest_hash: "b".repeat(64),
    review_subjects: reviewSubjects,
    current_review_round: null,
    overall_review_status: "TO_REVIEW",
  };
}
function mockClient(
  rpc: (name: string, args: JsonObject) => Promise<{ data?: unknown; error?: unknown }>,
): ServiceClient {
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({}),
    rpc,
  };
}
function endpoint(
  data: JsonObject,
  options: {
    auth?: boolean;
    tenantFailure?: Response;
    onRpc?: (name: string, args: JsonObject) => void;
  } = {},
) {
  const client = mockClient(async (name, args) => {
    options.onRpc?.(name, args);
    if (name === "app_customer_information_request_workforce_read_v1") {
      return {
        data: {
          ok: true,
          status: 200,
          code: "ok",
          can_manage: true,
          request: null,
          history: [],
        },
      };
    }
    return { data };
  });
  return createHandler({
    createServiceClient: () => client,
    requestMeta: async () => options.tenantFailure ?? META,
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
          authUserId: AUTH_ADMIN,
          emailNormalized: "proof@example.invalid",
        },
      },
  });
}
async function responseJson(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

async function endpointProof(): Promise<void> {
  const url = `https://enval.local/api-app-evidence-review-case-detail?caseRef=${CASE_REF_A}`;
  const nonGet = await endpoint(rpcSuccess())(new Request(url, { method: "POST" }));
  assert(nonGet.status === 405, "non_get_not_denied");
  q(1);

  let gatedRpcCalls = 0;
  const tenantFailure = new Response("{}", { status: 503 });
  const gated = await endpoint(rpcSuccess(), {
    tenantFailure,
    onRpc: () => gatedRpcCalls++,
  })(new Request(url));
  assert(gated === tenantFailure && gatedRpcCalls === 0, "tenant_gate_not_first");
  q(2);

  const noAuth = await endpoint(rpcSuccess(), { auth: false })(new Request(url));
  const malformedUrls = [
    "https://enval.local/api-app-evidence-review-case-detail",
    `https://enval.local/api-app-evidence-review-case-detail?caseRef=${CASE_REF_A}&caseRef=${CASE_REF_B}`,
    `https://enval.local/api-app-evidence-review-case-detail?caseRef=${CASE_REF_A}&tenant=other`,
    "https://enval.local/api-app-evidence-review-case-detail?caseRef=invalid",
  ];
  assert(noAuth.status === 401, "no_auth_not_denied");
  for (const malformedUrl of malformedUrls) {
    const response = await endpoint(rpcSuccess())(new Request(malformedUrl));
    assert(response.status === 400, "case_selector_not_fail_closed");
  }
  q(3);

  let rpcCalls = 0;
  const success = await endpoint(rpcSuccess([
    sourceEvidence(),
    sourceEvidence({
      evidence_file_ref: INVOICE_FILE,
      evidence_version_ref: INVOICE_VERSION,
      kind: "installation_invoice",
      uploaded_at: "2026-08-18T10:01:00.000Z",
      canonical_facts: [
        { category: "CHARGER_BRAND", value: "Brand", truth_class: "CUSTOMER_CONFIRMED", review_reason: null },
        { category: "MID", value: "MID-DECLARED", truth_class: "REVIEW_REQUIRED", review_reason: "DOCUMENT_CONFLICT_RESOLVED" },
      ],
    }),
  ]), {
    onRpc: (name, args) => {
      rpcCalls += 1;
      assert(
        args.p_auth_user_id === AUTH_ADMIN && args.p_case_ref === CASE_REF_A &&
          Object.keys(args).sort().join("|") === "p_auth_user_id|p_case_ref",
        "rpc_contract_invalid",
      );
      assert(
        name === "app_evidence_review_case_detail_read_v7" ||
          name === "app_customer_information_request_workforce_read_v1",
        "rpc_name_invalid",
      );
    },
  })(new Request(url));
  const body = await responseJson(success) as unknown as EvidenceReviewCaseDetailResponseV1;
  assert(
    success.status === 200 && rpcCalls === 2 &&
      body.schemaVersion === "evidence-review-case-detail-v6" &&
      body.case.caseRef === CASE_REF_A &&
      body.case.canPublishCorrection === true &&
      body.case.partyDisplayNameTruth === "DECLARED" &&
      body.case.deliveryAddressTruth === "DECLARED" &&
      body.evidence.length === 2 &&
      body.reviewManifestVersion === "fact-review-manifest-v1" &&
      body.reviewManifestHash === "b".repeat(64) &&
      body.reviewSubjects.length === 2 &&
      body.currentReviewRound === null &&
      body.overallReviewStatus === "TO_REVIEW" &&
      body.informationRequest.canManage === true &&
      body.informationRequest.request === null &&
      body.evidence.every((item) => item.reviewStatus === "PENDING") &&
      body.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) =>
          Boolean(fact.reviewReason) &&
          fact.reviewReasonAuthority === "CUSTOMER_SIGNED_RESOLUTION"
        ) &&
      body.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "CUSTOMER_CONFIRMED")
        .every((fact) => !("reviewReason" in fact)),
    "response_contract_invalid",
  );
  q(4);

  const safeJson = JSON.stringify(body);
  for (const forbidden of [
    "storage_path",
    "storagePath",
    "signed_url",
    "service_role",
    "reviewerId",
    "reviewer_id",
    "workforce_identity_id",
    "auth_user_id",
    "customer_id",
    "email",
    "phone",
    "parserVersion",
    "rawObservation",
    "correctionLineage",
    "original_filename",
  ]) assert(!safeJson.includes(forbidden), `unsafe_response:${forbidden}`);
  q(5);

  const malformed = parseEvidenceReviewCaseDetailSource({
    ...rpcSuccess(),
    storage_path: "private/path",
  });
  const prematureWaiting = parseEvidenceReviewCaseDetailSource({
    ...rpcSuccess(),
    overall_review_status: "WAITING_CUSTOMER",
  });
  const supportingCustomerConfirmedNone = rpcSuccess([sourceEvidence({
    evidence_file_ref: INVOICE_FILE,
    evidence_version_ref: INVOICE_VERSION,
    kind: "installation_invoice",
    canonical_facts: [{
      category: "PARTY_NAME",
      value: "Declared Person",
      truth_class: "CUSTOMER_CONFIRMED",
      review_reason: null,
    }],
  })]);
  supportingCustomerConfirmedNone.review_subjects = [{
    ...sourceSubject(INVOICE_VERSION, "installation_invoice", "8"),
    fact_key: "partyName",
    fact_category: "PARTY_NAME",
    fact_label: "Naam",
    required: false,
    truth_class: "CUSTOMER_CONFIRMED",
    review_reason: null,
    review_reason_authority: null,
    reviewer_suggestion: "NONE",
  }];
  const supportingCustomerConfirmedAccept = structuredClone(
    supportingCustomerConfirmedNone,
  );
  (supportingCustomerConfirmedAccept.review_subjects as JsonObject[])[0]
    .reviewer_suggestion = "ACCEPT";
  const primaryCustomerConfirmedNone = rpcSuccess();
  primaryCustomerConfirmedNone.review_subjects = [{
    ...sourceSubject(ENERGY_VERSION, "energy_bill_or_contract", "7"),
    fact_key: "partyName",
    fact_category: "PARTY_NAME",
    fact_label: "Naam",
    truth_class: "CUSTOMER_CONFIRMED",
    review_reason: null,
    review_reason_authority: null,
    reviewer_suggestion: "NONE",
  }];
  const unknownSupportingKind = structuredClone(
    supportingCustomerConfirmedNone,
  );
  (unknownSupportingKind.evidence as JsonObject[])[0].kind = "other_document";
  (unknownSupportingKind.review_subjects as JsonObject[])[0].evidence_kind =
    "other_document";
  const wrongDisposition = structuredClone(supportingCustomerConfirmedNone);
  (wrongDisposition.review_subjects as JsonObject[])[0].truth_class =
    "REVIEW_REQUIRED";
  const missingSuggestion = structuredClone(supportingCustomerConfirmedNone);
  delete (missingSuggestion.review_subjects as JsonObject[])[0]
    .reviewer_suggestion;
  const extraSubjectField = structuredClone(supportingCustomerConfirmedNone);
  (extraSubjectField.review_subjects as JsonObject[])[0].source_authority =
    "supporting";
  assert(
    malformed === null && prematureWaiting === null &&
      parseEvidenceReviewCaseDetailSource(
          supportingCustomerConfirmedNone,
        )?.reviewSubjects[0]?.reviewerSuggestion === "NONE" &&
      parseEvidenceReviewCaseDetailSource(
          supportingCustomerConfirmedAccept,
        )?.reviewSubjects[0]?.reviewerSuggestion === "ACCEPT" &&
      parseEvidenceReviewCaseDetailSource(primaryCustomerConfirmedNone) ===
        null &&
      parseEvidenceReviewCaseDetailSource(unknownSupportingKind) === null &&
      parseEvidenceReviewCaseDetailSource(wrongDisposition) === null &&
      parseEvidenceReviewCaseDetailSource(missingSuggestion) === null &&
      parseEvidenceReviewCaseDetailSource(extraSubjectField) === null,
    "supporting_subject_or_fail_closed_contract_invalid",
  );
  for (const code of [
    "authenticated_actor_not_verified",
    "workforce_identity_missing",
    "workforce_identity_inactive",
    "capability_not_authorized",
    "case_scope_denied",
    "authorization_changed",
  ]) {
    const denied = await endpoint({ ok: false, status: 403, code })(new Request(url));
    const deniedBody = await responseJson(denied);
    assert(
      denied.status === 403 && deniedBody.code === code &&
        !JSON.stringify(deniedBody).includes("workforce_identity_id"),
      `unsafe_denial:${code}`,
    );
  }
  q(6);

  const source = await Deno.readTextFile(MIGRATION);
  const correctionSource = await Deno.readTextFile(CORRECTION_MIGRATION);
  const affordanceSource = await Deno.readTextFile(AFFORDANCE_MIGRATION);
  const roundSource = await Deno.readTextFile(ROUND_MIGRATION);
  const currentRoundReadSource = await Deno.readTextFile(
    CURRENT_ROUND_READ_MIGRATION,
  );
  const overallStatusSource = await Deno.readTextFile(
    OVERALL_STATUS_MIGRATION,
  );
  const publishAffordanceSource = await Deno.readTextFile(
    PUBLISH_AFFORDANCE_MIGRATION,
  );
  assert(
    source.includes("public.app_workforce_authorize_v1(") &&
      source.includes("'evidence.review.view'") &&
      source.includes("app_evidence_review_decisions") &&
      source.includes("canonical_snapshot #> '{canonical_facts,facts}'") &&
      source.includes("grant execute on function public.app_evidence_review_case_detail_read_v1") &&
      correctionSource.includes("app_evidence_review_case_detail_read_v2") &&
      correctionSource.includes("correction_instruction") &&
      affordanceSource.includes("app_evidence_review_case_detail_read_v3") &&
      affordanceSource.includes("'evidence.review.decide'") &&
      affordanceSource.includes("app_workforce_authorize_v1") &&
      !affordanceSource.includes("grant execute on function public.app_workforce_authorize_v1") &&
      !source.includes("grant execute on function public.app_workforce_authorize_v1") &&
      !/\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i.test(
        source.replace(/^\s*--.*$/gm, ""),
      ) &&
      !source.includes("signed_url") && !source.includes("storage_path',") &&
      !source.includes("check_execution") && !source.includes("review_task") &&
      roundSource.includes("app_evidence_review_case_detail_read_v4") &&
      roundSource.includes("app_evidence_fact_review_manifest_v1") &&
      roundSource.includes("app_evidence_review_round_finalize_v1") &&
      !roundSource.includes("check_execution") &&
      !roundSource.includes("fraud_suspicion") &&
      currentRoundReadSource.includes("app_evidence_review_case_detail_read_v5") &&
      currentRoundReadSource.includes("app_evidence_review_case_detail_read_v4") &&
      currentRoundReadSource.includes("current_review_round") &&
      currentRoundReadSource.includes("app_evidence_review_rounds") &&
      currentRoundReadSource.includes(
        "app_evidence_review_round_subject_decisions",
      ) &&
      !currentRoundReadSource.includes("grant select") &&
      !currentRoundReadSource.includes("app_workforce_authorize_v1") &&
      overallStatusSource.includes("app_evidence_review_overall_status_v1") &&
      overallStatusSource.includes("app_evidence_review_case_detail_read_v6") &&
      overallStatusSource.includes("app_evidence_review_case_detail_read_v5") &&
      overallStatusSource.includes("'overall_review_status'") &&
      overallStatusSource.includes("return 'CORRECTION_REQUIRED'") &&
      !overallStatusSource.includes("return 'WAITING_CUSTOMER'") &&
      publishAffordanceSource.includes(
        "app_evidence_review_case_detail_read_v7",
      ) &&
      publishAffordanceSource.includes(
        "'evidence.review.correction.publish'",
      ) &&
      publishAffordanceSource.includes("app_workforce_authorize_v1") &&
      publishAffordanceSource.includes("can_publish_correction") &&
      !publishAffordanceSource.includes(
        "grant execute on function public.app_workforce_authorize_v1",
      ),
    "bounded_read_source_missing",
  );
  q(7);
  console.log("EVIDENCE_REVIEW_CASE_DETAIL_ENDPOINT=PASS");
}

async function setupDatabase(): Promise<void> {
  await must("docker", [
    "exec",
    CONTAINER,
    "createdb",
    "-U",
    "postgres",
    "-T",
    "template0",
    DATABASE,
  ]);
  await psql(DATABASE, `
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create table auth.users (
      instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255),
      email varchar(255), encrypted_password varchar(255),
      email_confirmed_at timestamptz, invited_at timestamptz,
      confirmation_token varchar(255), confirmation_sent_at timestamptz,
      recovery_token varchar(255), recovery_sent_at timestamptz,
      email_change_token_new varchar(255), email_change varchar(255),
      email_change_sent_at timestamptz, last_sign_in_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
      created_at timestamptz, updated_at timestamptz, phone text,
      phone_confirmed_at timestamptz, phone_change text,
      phone_change_token text, phone_change_sent_at timestamptz,
      confirmed_at timestamptz generated always as (
        least(email_confirmed_at, phone_confirmed_at)
      ) stored,
      email_change_token_current text,
      email_change_confirm_status smallint default 0,
      banned_until timestamptz, reauthentication_token text,
      reauthentication_sent_at timestamptz,
      is_sso_user boolean default false not null,
      deleted_at timestamptz, is_anonymous boolean default false not null
    );
  `);
  const migrations: string[] = [];
  for await (const entry of Deno.readDir("supabase/migrations")) {
    if (entry.isFile && entry.name.endsWith(".sql")) {
      migrations.push(`supabase/migrations/${entry.name}`);
    }
  }
  migrations.sort();
  for (const path of migrations) await psql(DATABASE, await Deno.readTextFile(path));
}

async function activeFingerprint(): Promise<string> {
  return await psql(ACTIVE_DATABASE, `begin read only;
    select concat_ws('|',
      (select count(*) from public.app_customers),
      (select count(*) from public.app_cases),
      (select count(*) from public.app_evidence_files),
      (select count(*) from public.app_evidence_versions),
      (select count(*) from public.app_evidence_review_decisions),
      (to_regclass('public.app_evidence_review_rounds') is not null),
      (to_regclass('public.app_evidence_review_round_subject_decisions') is not null),
      (select count(*) from public.app_workforce_identities),
      (select count(*) from public.app_workforce_scope_assignments),
      (select count(*) from public.app_audit_events),
      (select count(*) from public.app_idempotency_keys)
    ); rollback;`);
}

async function proofFingerprint(): Promise<string> {
  return await psql(DATABASE, `select concat_ws('|',
    (select count(*) from public.app_customers),
    (select count(*) from public.app_cases),
    (select count(*) from public.app_case_lifecycle_events),
    (select count(*) from public.app_evidence_files),
    (select count(*) from public.app_evidence_versions),
      (select count(*) from public.app_evidence_review_decisions),
      (select count(*) from public.app_evidence_review_rounds),
      (select count(*) from public.app_evidence_review_round_subject_decisions),
    (select count(*) from public.app_workforce_identities),
    (select count(*) from public.app_workforce_scope_assignments),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
}

async function readRpc(
  database: string,
  authUserId: string,
  caseRef: string,
): Promise<JsonObject> {
  const output = await psql(database, `begin;
    set local role service_role;
    select public.app_evidence_review_case_detail_read_v7(
      '${authUserId}', '${caseRef}'
    )::text;
    rollback;`);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "rpc_output_missing");
  return JSON.parse(line) as JsonObject;
}

async function finalizeRpc(
  database: string,
  authUserId: string,
  caseRef: string,
  manifestVersion: string,
  manifestHash: string,
  decisions: readonly JsonObject[],
  requestId: string,
  idempotencyKey: string,
  payloadSha256 = HASH,
): Promise<JsonObject> {
  const payload = JSON.stringify(decisions).replaceAll("'", "''");
  const output = await psql(database, `begin;
    set local role service_role;
    select public.app_evidence_review_round_finalize_v1(
      '${authUserId}', '${caseRef}', '${manifestVersion}', '${manifestHash}',
      '${payload}'::jsonb, '${requestId}', '${idempotencyKey}',
      '${payloadSha256}', '${EXPIRES}'
    )::text;
    commit;`);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "finalizer_output_missing");
  return JSON.parse(line) as JsonObject;
}

async function databaseProof(): Promise<void> {
  await setupDatabase();
  const acl = await psql(DATABASE, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.app_evidence_review_case_detail_read_v7(uuid,text)','EXECUTE'),
    has_function_privilege('anon',
      'public.app_evidence_review_case_detail_read_v7(uuid,text)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.app_evidence_review_case_detail_read_v7(uuid,text)','EXECUTE'),
    has_function_privilege('service_role',
      'public.app_evidence_review_case_detail_read_v6(uuid,text)','EXECUTE'),
    has_function_privilege('service_role',
      'public.app_workforce_authorize_v1(uuid,text,uuid,uuid,timestamptz)',
      'EXECUTE')
  );`);
  assert(acl === "t|f|f|f|f", `rpc_acl_invalid:${acl}`);
  q(8);

  await psql(DATABASE, `
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_ADMIN}','admin@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_ADMIN_NO_SCOPE}','noscope@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_DECIDE_ONLY}','decide@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NON_WORKFORCE}','outside@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_CUSTOMER_ONLY}','customer@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_VIEW_DECIDE}','view-decide@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_INACTIVE}','inactive@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());
    insert into public.app_customers (id,customer_type)
    values ('${CUSTOMER}','particulier');
    insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values (
      '${AUTH_CUSTOMER_ONLY}','${CUSTOMER}',null,'bound_customer_identity',
      'app_customer_identity','proof:customer','review07-customer-access'
    );
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values
      ('${CASE_A}','${CUSTOMER}','${CASE_REF_A}','2026-01-18T08:00:00Z',
       'system','proof:review07','proof','review07:a','review07-case:a'),
      ('${CASE_B}','${CUSTOMER}','${CASE_REF_B}','2026-01-18T08:00:00Z',
       'system','proof:review07','proof','review07:b','review07-case:b');
    insert into public.app_case_lifecycle_events (
      case_id,promotion_id,lifecycle_state,event_at,actor_type,actor_ref,
      source_class,source_ref,request_id,event_data
    ) values
      ('${CASE_A}',null,'submitted_for_review','2026-01-18T08:01:00Z','system',
       'proof:review07','proof','review07:a','review07-lifecycle:a','{}'),
      ('${CASE_B}',null,'submitted_for_review','2026-01-18T08:01:00Z','system',
       'proof:review07','proof','review07:b','review07-lifecycle:b','{}');
  `);

  const bootstrap = await psql(DATABASE, `select
    public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','review07-bootstrap','review07-bootstrap',
      '${HASH}','${EXPIRES}','decision:review07-bootstrap'
    )->>'ok';`);
  assert(bootstrap === "true", "admin_bootstrap_failed");
  for (const [auth, seniority, suffix] of [
    [AUTH_ADMIN_NO_SCOPE, "admin", "admin-no-scope"],
    [AUTH_DECIDE_ONLY, "reviewer", "decide-only"],
    [AUTH_VIEW_DECIDE, "reviewer", "view-decide"],
    [AUTH_INACTIVE, "reviewer", "inactive"],
  ]) {
    const created = await psql(DATABASE, `select
      public.app_workforce_member_manage_v1(
        '${AUTH_ADMIN}','review07-member-${suffix}',
        'review07-member-${suffix}','${HASH}','${EXPIRES}','create',
        '${auth}',null,'${seniority}',clock_timestamp(),
        'decision:review07-${suffix}',null
      )->>'ok';`);
    assert(created === "true", `member_create_failed:${suffix}`);
  }
  const identities = await psql(DATABASE, `select concat_ws('|',
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_ADMIN}'),
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_DECIDE_ONLY}'),
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_VIEW_DECIDE}'),
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_INACTIVE}')
  );`);
  const [adminIdentity, decideIdentity, viewDecideIdentity, inactiveIdentity] =
    identities.split("|");
  assert(
    adminIdentity && decideIdentity && viewDecideIdentity && inactiveIdentity,
    "identity_missing",
  );

  const viewGrant = await psql(DATABASE, `select
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review07-view-grant','review07-view-grant','${HASH}',
      '${EXPIRES}','grant','${adminIdentity}','evidence.review.view','${CASE_A}',
      null,null,null,clock_timestamp(),null,'decision:review07-view',null
    )->>'ok';`);
  const decideGrant = await psql(DATABASE, `select
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review07-decide-grant','review07-decide-grant','${HASH}',
      '${EXPIRES}','grant','${decideIdentity}','evidence.review.decide','${CASE_A}',
      null,null,null,clock_timestamp(),null,'decision:review07-decide',null
    )->>'ok';`);
  const adminOtherCaseDecideGrant = await psql(DATABASE, `select
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review13-admin-other-decide','review13-admin-other-decide','${HASH}',
      '${EXPIRES}','grant','${adminIdentity}','evidence.review.decide','${CASE_B}',
      null,null,null,clock_timestamp(),null,'decision:review13-other-case',null
    )->>'ok';`);
  const viewDecideGrants = await psql(DATABASE, `select concat_ws('|',
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review13-view-decide-view','review13-view-decide-view','${HASH}',
      '${EXPIRES}','grant','${viewDecideIdentity}','evidence.review.view','${CASE_A}',
      null,null,null,clock_timestamp(),null,'decision:review13-view',null
    )->>'ok',
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review13-view-decide-decide','review13-view-decide-decide','${HASH}',
      '${EXPIRES}','grant','${viewDecideIdentity}','evidence.review.decide','${CASE_A}',
      null,null,null,clock_timestamp(),null,'decision:review13-decide',null
    )->>'ok'
  );`);
  assert(
    viewGrant === "true" && decideGrant === "true" &&
      adminOtherCaseDecideGrant === "true" && viewDecideGrants === "true|true",
    "scope_grant_failed",
  );
  const inactiveViewGrant = await psql(DATABASE, `select
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review13-inactive-view','review13-inactive-view','${HASH}',
      '${EXPIRES}','grant','${inactiveIdentity}','evidence.review.view','${CASE_A}',
      null,null,null,clock_timestamp(),null,'decision:review13-inactive-view',null
    )->>'ok';`);
  assert(inactiveViewGrant === "true", "inactive_scope_grant_failed");
  await psql(DATABASE, `insert into public.app_workforce_capability_assignments (
    assignment_id,workforce_identity_id,capability_code,event_type,effective_at,
    valid_until,decision_ref,reason_ref,recorded_by_actor_ref,request_id,
    supersedes_assignment_event_id
  ) select assignment_id,workforce_identity_id,capability_code,'revoked',
    clock_timestamp(),null,'decision:review07','view_removed','proof:review07',
    'review07-decide-only-view-revoke',id
  from public.app_workforce_capability_assignments
  where workforce_identity_id='${decideIdentity}'
    and capability_code='evidence.review.view'
    and event_type='granted' and supersedes_assignment_event_id is null;`);
  await psql(DATABASE, `insert into public.app_workforce_identity_states (
    workforce_identity_id,state,effective_at,decision_ref,reason_ref,
    recorded_by_actor_ref,request_id,supersedes_state_id
  ) select workforce_identity_id,'suspended',clock_timestamp(),
    'decision:review13','proof_suspension','proof:review13',
    'review13-suspend',id
  from public.app_workforce_identity_states
  where workforce_identity_id='${inactiveIdentity}'
    and supersedes_state_id is null;`);
  q(9);

  await psql(DATABASE, `begin;
    set local session_replication_role = replica;
    insert into public.app_parties (
      id,party_kind,source_type,source_reference_type,source_reference_id,
      request_id,actor_type,actor_ref
    ) values ('${PARTY}','natural_person','signed_signup_intake',
      'proof','review07-party','review07-party','system','proof:review07');
    insert into public.app_party_person_versions (
      id,party_id,full_name,valid_from,source_type,source_reference_type,
      source_reference_id,request_id,actor_type,actor_ref
    ) values ('${PARTY_PROFILE}','${PARTY}','Declared Person','2026-01-18',
      'signed_signup_intake','proof','review07-party-profile',
      'review07-party-profile','system','proof:review07');
    insert into public.app_case_party_roles (
      case_id,party_id,person_profile_version_id,organization_profile_version_id,
      role_type,claim_status,valid_from,recorded_at,recorded_by_actor_type,
      recorded_by_actor_ref,source_class,source_ref,request_id
    ) values ('${CASE_A}','${PARTY}','${PARTY_PROFILE}',null,
      'service_recipient','asserted','2026-01-18T08:00:00Z',
      '2026-01-18T08:00:00Z','system','proof:review07',
      'signed_signup_intake','review07-party','review07-party-role');
    insert into public.app_locations (
      id,created_at,created_by_actor_ref,created_from_request_id,creation_basis
    ) values ('${LOCATION}','2026-01-18T08:00:00Z','proof:review07',
      'review07-promotion:location:location-1','customer_declaration');
    insert into public.app_location_address_observations (
      location_id,observation_kind,descriptor_kind,observed_at,recorded_at,
      recorded_by_actor_ref,recorded_from_request_id,source_ref_sha256,
      country_code,declared_address_text
    ) values ('${LOCATION}','customer_declared','unstructured_postal_address',
      '2026-01-18T08:00:00Z','2026-01-18T08:00:00Z','proof:review07',
      'review07-address','${HASH}','NL','Declared Address');
    insert into public.app_case_location_relations (
      relation_id,case_id,location_id,event_type,effective_at,recorded_at,
      decision_ref,reason_ref,recorded_by_actor_ref,request_id
    ) values (gen_random_uuid(),'${CASE_A}','${LOCATION}','linked',
      '2026-01-18T08:00:00Z','2026-01-18T08:00:00Z','signed_signup_intake',
      null,'proof:review07','review07-case-location');
    insert into public.app_chargers (
      id,promotion_id,case_id,location_id,source_ref_sha256,created_at,
      created_by_actor_ref,created_from_request_id
    ) values ('${CHARGER}','${PROMOTION}','${CASE_A}','${LOCATION}',
      encode(extensions.digest('charger-1','sha256'),'hex'),
      '2026-01-18T08:00:00Z','proof:review07','review07-charger');
    insert into public.app_signup_signing_snapshots (
      id,intake_id,schema_version,canonical_snapshot,canonical_snapshot_sha256,
      created_at
    ) values ('${SNAPSHOT}',gen_random_uuid(),'signup-signing-runtime-snapshot-v1',
      jsonb_build_object('canonical_facts',jsonb_build_object(
        'schema_version','canonical-signing-facts-v1','facts',jsonb_build_array(
          jsonb_build_object('fact_id','party','fact_key','partyName','label','Naam',
            'value','Declared Person','resolution_state','confirmed','required',true),
          jsonb_build_object('fact_id','address','fact_key','structuredAddress','label','Adres',
            'value','Declared Address','resolution_state','review_required','required',true,
            'location_id','location-1'),
          jsonb_build_object('fact_id','ean','fact_key','electricityEan','label','EAN',
            'value','871234567890123456','resolution_state','review_required','required',true,
            'location_id','location-1'),
          jsonb_build_object('fact_id','supplier','fact_key','energySupplier','label','Leverancier',
            'value','Declared Supplier','resolution_state','review_required','required',true,
            'location_id','location-1'),
          jsonb_build_object('fact_id','brand','fact_key','chargerBrand','label','Merk',
            'value','Declared Brand','resolution_state','confirmed','required',true,
            'location_id','location-1','charger_id','charger-1'),
          jsonb_build_object('fact_id','model','fact_key','chargerModel','label','Model',
            'value','Declared Model','resolution_state','confirmed','required',true,
            'location_id','location-1','charger_id','charger-1'),
          jsonb_build_object('fact_id','mid','fact_key','midNumber','label','MID',
            'value','','resolution_state','review_required','required',true,
            'location_id','location-1','charger_id','charger-1'),
          jsonb_build_object('fact_id','serial','fact_key','serialNumber','label','Serienummer',
            'value','SERIAL-DECLARED','resolution_state','review_required','required',true,
            'location_id','location-1','charger_id','charger-1')
        ))), '${HASH}', '2026-01-18T08:00:00Z');
    insert into public.app_signup_promotions (
      id,intake_id,customer_id,identity_id,service_recipient_party_id,
      contact_party_id,case_id,signing_snapshot_id,mandate_id,
      signature_evidence_id,account_type,source_signing_sha256,
      promotion_payload_sha256,request_payload_sha256,request_id,
      idempotency_key,actor_type,actor_ref,environment,promoted_at
    ) values ('${PROMOTION}',gen_random_uuid(),'${CUSTOMER}',gen_random_uuid(),
      '${PARTY}','${PARTY}','${CASE_A}','${SNAPSHOT}',gen_random_uuid(),
      gen_random_uuid(),'particulier','${HASH}','${HASH}','${HASH}',
      'review07-promotion','review07-promotion','system','proof:review07','local',
      '2026-01-18T08:00:00Z');
    insert into public.app_evidence_files (
      id,case_id,promotion_id,document_type,source_class,source_ref,created_at,
      created_by_actor_ref,request_id
    ) values
      ('${ENERGY_FILE}','${CASE_A}','${PROMOTION}','energy_bill_or_contract',
       'signup_quarantine_file',gen_random_uuid()::text,'2026-01-18T09:00:00Z',
       'proof:review07','review07-energy'),
      ('${INVOICE_FILE}','${CASE_A}','${PROMOTION}','installation_invoice',
       'signup_quarantine_file',gen_random_uuid()::text,'2026-01-18T09:01:00Z',
       'proof:review07','review07-invoice');
    insert into public.app_evidence_versions (
      id,evidence_file_id,version_number,source_intake_file_id,storage_bucket,
      storage_path,detected_mime_type,size_bytes,sha256,status,
      source_confirmed_at,created_at,request_id,idempotency_key
    ) values
      ('${ENERGY_VERSION}','${ENERGY_FILE}',1,gen_random_uuid(),'proof-private',
       'energy.pdf','application/pdf',100,'${HASH}','confirmed_awaiting_review',
       '2026-01-18T09:00:00Z','2026-01-18T09:00:00Z',
       'review07-energy','review07-energy'),
      ('${INVOICE_VERSION}','${INVOICE_FILE}',1,gen_random_uuid(),'proof-private',
       'invoice.pdf','application/pdf',100,'${HASH}','confirmed_awaiting_review',
       '2026-01-18T09:01:00Z','2026-01-18T09:01:00Z',
       'review07-invoice','review07-invoice');
    insert into public.app_evidence_declaration_contexts (
      evidence_file_id,promotion_id,source_slot_ref_sha256,location_id,charger_id,
      association_basis,created_at,created_by_actor_ref,created_from_request_id
    ) values
      ('${ENERGY_FILE}','${PROMOTION}','${HASH}','${LOCATION}',null,
       'single_declared_location','2026-01-18T09:00:00Z','proof:review07','review07-energy-context'),
      ('${INVOICE_FILE}','${PROMOTION}','${HASH}','${LOCATION}','${CHARGER}',
       'single_declared_charger','2026-01-18T09:01:00Z','proof:review07','review07-invoice-context');
    commit;
  `);
  q(10);

  const before = await proofFingerprint();
  const allowed = await readRpc(DATABASE, AUTH_ADMIN, CASE_REF_A);
  const response = parseEvidenceReviewCaseDetailSource(allowed);
  assert(
    response && response.case.caseRef === CASE_REF_A &&
      response.case.lifecycle === "submitted_for_review" &&
      response.case.canDecide === false &&
      response.case.partyDisplayName === "Declared Person" &&
      response.case.deliveryAddress === "Declared Address" &&
      response.evidence.length === 2 &&
      response.evidence.every((item) => item.reviewStatus === "PENDING") &&
      response.reviewManifestVersion === "fact-review-manifest-v1" &&
      /^[0-9a-f]{64}$/.test(response.reviewManifestHash) &&
      response.reviewSubjects.length === 10 &&
      response.currentReviewRound === null &&
      response.overallReviewStatus === "TO_REVIEW",
    "authorized_projection_invalid",
  );
  const energy = response.evidence.find((item) => item.kind === "energy_bill_or_contract");
  const invoice = response.evidence.find((item) => item.kind === "installation_invoice");
  assert(
    energy?.canonicalFacts.map((fact) => fact.category).join("|") ===
      "ADDRESS|EAN|ENERGY_SUPPLIER|PARTY_NAME" &&
      invoice?.canonicalFacts.map((fact) => fact.category).join("|") ===
        "ADDRESS|CHARGER_BRAND|CHARGER_MODEL|PARTY_NAME|SERIAL" &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) => fact.reviewReason === "GENERIC_REVIEW_REQUIRED") &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) => !("reviewReasonAuthority" in fact)) &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "CUSTOMER_CONFIRMED")
        .every((fact) => !("reviewReason" in fact)) &&
      new Set(response.reviewSubjects.map((subject) => subject.subjectRef)).size ===
        10 &&
      response.reviewSubjects.every((subject) =>
        subject.subjectKind === "FACT" &&
        /^FRS-[0-9a-f]{64}$/.test(subject.subjectRef) &&
        /^FRSCOPE-[0-9a-f]{64}$/.test(subject.scopeRef)
      ) &&
      response.reviewSubjects.filter((subject) =>
        subject.truthClass === "CUSTOMER_CONFIRMED"
      ).every((subject) => subject.reviewerSuggestion === "ACCEPT") &&
      response.reviewSubjects.filter((subject) =>
        subject.truthClass === "REVIEW_REQUIRED"
      ).every((subject) => subject.reviewerSuggestion === "NONE") &&
      response.reviewSubjects.some((subject) =>
        subject.factKey === "midNumber" &&
        subject.valueStatus === "REQUIRED_MISSING" && subject.value === null &&
        subject.required &&
        subject.reviewReason === "REQUIRED_INFORMATION_MISSING" &&
        subject.reviewReasonAuthority === "SERVER_REQUIRED_SLOT"
      ),
    "canonical_fact_projection_invalid",
  );
  q(11);
  assert(
    before === await proofFingerprint(),
    "historical_read_changed_database_state",
  );

  const acceptedDecision = await psql(DATABASE, `select
    public.app_evidence_review_decide_v2(
      '${AUTH_DECIDE_ONLY}','${ENERGY_VERSION}','ACCEPTED',null,null,
      'review12-detail-accepted','review12-detail-accepted','${HASH}',
      '${EXPIRES}'
    )->>'ok';`);
  const correctionDecision = await psql(DATABASE, `select
    public.app_evidence_review_decide_v2(
      '${AUTH_DECIDE_ONLY}','${INVOICE_VERSION}','CORRECTION_REQUIRED',
      'WRONG_DOCUMENT','Lever de juiste installatiefactuur aan.',
      'review12-detail-correction','review12-detail-correction',
      '${"b".repeat(64)}','${EXPIRES}'
    )->>'ok';`);
  const decidedProjection = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_ADMIN, CASE_REF_A),
  );
  const acceptedEvidence = decidedProjection?.evidence.find((item) =>
    item.evidenceVersionRef === ENERGY_VERSION
  );
  const correctionEvidence = decidedProjection?.evidence.find((item) =>
    item.evidenceVersionRef === INVOICE_VERSION
  );
  assert(
    acceptedDecision === "true" && correctionDecision === "true" &&
      acceptedEvidence?.reviewStatus === "ACCEPTED" &&
      !("correctionReason" in acceptedEvidence) &&
      correctionEvidence?.reviewStatus === "CORRECTION_REQUIRED" &&
      correctionEvidence.correctionReason === "WRONG_DOCUMENT" &&
      correctionEvidence.correctionInstruction ===
        "Lever de juiste installatiefactuur aan.",
    "review12_correction_projection_invalid",
  );

  await psql(
    DATABASE,
    `begin;
    set local session_replication_role = replica;
    insert into public.app_signup_signing_snapshots (
      id,intake_id,schema_version,canonical_snapshot,canonical_snapshot_sha256,
      created_at
    ) values ('${SNAPSHOT_V2}',gen_random_uuid(),
      'signup-signing-runtime-snapshot-v1',jsonb_build_object(
        'canonical_facts',jsonb_build_object(
          'schema_version','canonical-signing-facts-v2','facts',jsonb_build_array(
            jsonb_build_object('fact_id','party-v2','fact_key','partyName',
              'label','Naam','value','Declared Person','resolution_state',
              'review_required','required',true,'resolution_provenance',
              jsonb_build_object('review_reason','PROBABLE_IDENTITY_MATCH')),
            jsonb_build_object('fact_id','address-v2','fact_key','structuredAddress',
              'label','Adres','value','Declared Address','resolution_state',
              'review_required','required',true,'location_id','location-1',
              'resolution_provenance',jsonb_build_object(
                'review_reason','PROBABLE_ADDRESS_MATCH')),
            jsonb_build_object('fact_id','ean-v2','fact_key','electricityEan',
              'label','EAN','value','871234567890123456','resolution_state',
              'review_required','required',true,'location_id','location-1',
              'resolution_provenance',jsonb_build_object(
                'review_reason','USER_OVERRIDE')),
            jsonb_build_object('fact_id','supplier-v2','fact_key','energySupplier',
              'label','Leverancier','value','Declared Supplier','resolution_state',
              'review_required','required',true,'location_id','location-1',
              'resolution_provenance',jsonb_build_object(
                'review_reason','USER_SUPPLIED_WITHOUT_DOCUMENT')),
            jsonb_build_object('fact_id','mid-v2','fact_key','midNumber',
              'label','MID','value','MID-DECLARED','resolution_state',
              'review_required','required',true,'location_id','location-1',
              'charger_id','charger-1','resolution_provenance',
              jsonb_build_object('review_reason','DOCUMENT_CONFLICT_RESOLVED')),
            jsonb_build_object('fact_id','brand-v2','fact_key','chargerBrand',
              'label','Merk','value','Declared Brand','resolution_state',
              'confirmed','required',true,'location_id','location-1',
              'charger_id','charger-1','resolution_provenance',
              jsonb_build_object('review_reason',null))
          )
        )
      ), '${"b".repeat(64)}', '2026-01-18T08:00:01Z');
    update public.app_signup_promotions
      set signing_snapshot_id='${SNAPSHOT_V2}' where id='${PROMOTION}';
    commit;
  `,
  );
  const projectedV2 = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_ADMIN, CASE_REF_A),
  );
  const projectedReasons = new Set(
    projectedV2?.evidence.flatMap((item) =>
      item.canonicalFacts.flatMap((fact) =>
        fact.reviewReason ? [fact.reviewReason] : []
      )
    ),
  );
  assert(
    projectedV2 && [
      "USER_OVERRIDE",
      "USER_SUPPLIED_WITHOUT_DOCUMENT",
      "DOCUMENT_CONFLICT_RESOLVED",
      "PROBABLE_IDENTITY_MATCH",
      "PROBABLE_ADDRESS_MATCH",
      ].every((reason) => projectedReasons.has(reason as never)) &&
      projectedV2.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) =>
          fact.reviewReasonAuthority === "CUSTOMER_SIGNED_RESOLUTION"
        ) &&
      projectedV2.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "CUSTOMER_CONFIRMED")
        .every((fact) => !("reviewReason" in fact)),
    "v2_review_reason_projection_invalid",
  );
  const postFixtureBaseline = await proofFingerprint();

  const adminNoScope = await readRpc(DATABASE, AUTH_ADMIN_NO_SCOPE, CASE_REF_A);
  const wrongCase = await readRpc(DATABASE, AUTH_ADMIN, CASE_REF_B);
  const decideOnly = await readRpc(DATABASE, AUTH_DECIDE_ONLY, CASE_REF_A);
  const viewDecide = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_VIEW_DECIDE, CASE_REF_A),
  );
  const nonWorkforce = await readRpc(DATABASE, AUTH_NON_WORKFORCE, CASE_REF_A);
  const customerOnly = await readRpc(DATABASE, AUTH_CUSTOMER_ONLY, CASE_REF_A);
  const inactive = await readRpc(DATABASE, AUTH_INACTIVE, CASE_REF_A);
  assert(
    adminNoScope.code === "case_scope_denied" &&
      wrongCase.code === "case_scope_denied" &&
      decideOnly.code === "capability_not_authorized" &&
      viewDecide?.case.canDecide === true &&
      viewDecide.case.canPublishCorrection === false &&
      projectedV2?.case.canPublishCorrection === false &&
      nonWorkforce.code === "workforce_identity_missing" &&
      customerOnly.code === "workforce_identity_missing" &&
      inactive.code === "workforce_identity_inactive",
    "authorization_matrix_invalid",
  );
  q(12);

  const after = await proofFingerprint();
  assert(postFixtureBaseline === after, "read_rpc_changed_database_state");
  const definition = await psql(DATABASE, `select pg_get_functiondef(
    'public.app_evidence_review_case_detail_read_v7(uuid,text)'::regprocedure
  );`);
  const publishGrant = await psql(DATABASE, `select
    public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','review20-publish-grant','review20-publish-grant','${HASH}',
      '${EXPIRES}','grant','${viewDecideIdentity}',
      'evidence.review.correction.publish','${CASE_A}',null,null,null,
      clock_timestamp(),null,'decision:review20-publish',null
    )->>'ok';`);
  const viewDecidePublish = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_VIEW_DECIDE, CASE_REF_A),
  );
  assert(
    definition.includes("app_evidence_review_case_detail_read_v6") &&
      definition.includes("app_workforce_authorize_v1") &&
      definition.includes("evidence.review.correction.publish") &&
      definition.includes("can_publish_correction") &&
      !/\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i.test(definition) &&
      publishGrant === "true" &&
      viewDecidePublish?.case.canDecide === true &&
      viewDecidePublish.case.canPublishCorrection === true,
    "read_function_contains_write_or_publish_authority_invalid",
  );
  q(13);

  const deterministicV2 = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_VIEW_DECIDE, CASE_REF_A),
  );
  assert(
    projectedV2 && deterministicV2 &&
      projectedV2.currentReviewRound === null &&
      deterministicV2.currentReviewRound === null &&
      projectedV2.overallReviewStatus === "TO_REVIEW" &&
      deterministicV2.overallReviewStatus === "TO_REVIEW" &&
      response.reviewManifestHash !== projectedV2.reviewManifestHash &&
      projectedV2.reviewManifestHash === deterministicV2.reviewManifestHash &&
      projectedV2.reviewSubjects.map((subject) => subject.subjectRef).join("|") ===
        deterministicV2.reviewSubjects.map((subject) => subject.subjectRef).join("|") &&
      projectedV2.reviewSubjects.length === 10 &&
      projectedV2.reviewSubjects.some((subject) =>
        subject.valueStatus === "REQUIRED_MISSING" && subject.required
      ) &&
      projectedV2.reviewSubjects.every((subject) =>
        [
          "partyName",
          "structuredAddress",
          "electricityEan",
          "energySupplier",
          "chargerBrand",
          "chargerModel",
          "midNumber",
          "serialNumber",
        ].includes(subject.factKey)
      ),
    "manifest_determinism_or_applicability_invalid",
  );
  q(14);

  const manifest = projectedV2;
  const decisions = manifest.reviewSubjects.map((subject, index): JsonObject =>
    index === 0 || subject.valueStatus === "REQUIRED_MISSING"
      ? {
        subjectRef: subject.subjectRef,
        disposition: "CORRECTION_REQUIRED",
        correctionReason: "INCORRECT_INFORMATION",
        correctionInstruction: "Controleer en corrigeer dit gegeven.",
      }
      : { subjectRef: subject.subjectRef, disposition: "ACCEPTED" }
  );
  const acceptedRequiredMissing = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    manifest.reviewSubjects.map((subject) => ({
      subjectRef: subject.subjectRef,
      disposition: "ACCEPTED",
    })),
    "review15-required-missing-accept",
    "review15-required-missing-accept",
  );
  assert(
    acceptedRequiredMissing.ok === false &&
      acceptedRequiredMissing.code === "internal_error",
    "required_missing_acceptance_not_rejected_by_database",
  );
  const missing = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions.slice(1),
    "review15-missing",
    "review15-missing",
  );
  const duplicate = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    [...decisions, decisions[0]],
    "review15-duplicate",
    "review15-duplicate",
  );
  const extra = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    [...decisions, {
      subjectRef: `FRS-${"f".repeat(64)}`,
      disposition: "ACCEPTED",
    }],
    "review15-extra",
    "review15-extra",
  );
  const documentReason = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions.map((decision, index) => index === 0
      ? {
        ...decision,
        correctionReason: "WRONG_DOCUMENT",
      }
      : decision),
    "review15-document-reason",
    "review15-document-reason",
  );
  const missingInstruction = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions.map((decision, index) => index === 0
      ? {
        subjectRef: decision.subjectRef,
        disposition: "CORRECTION_REQUIRED",
        correctionReason: "MISSING_INFORMATION",
      }
      : decision),
    "review15-missing-instruction",
    "review15-missing-instruction",
  );
  const adminBypass = await finalizeRpc(
    DATABASE,
    AUTH_ADMIN,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions,
    "review15-admin-bypass",
    "review15-admin-bypass",
  );
  const wrongScope = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_B,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions,
    "review15-wrong-scope",
    "review15-wrong-scope",
  );
  const rejectedCounts = await psql(DATABASE, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds),
    (select count(*) from public.app_evidence_review_round_subject_decisions)
  );`);
  assert(
    missing.code === "manifest_subjects_mismatch" &&
      duplicate.code === "duplicate_subject" &&
      extra.code === "manifest_subjects_mismatch" &&
      documentReason.code === "invalid_decisions" &&
      missingInstruction.code === "invalid_decisions" &&
      adminBypass.code === "case_scope_denied" &&
      wrongScope.code === "case_scope_denied" && rejectedCounts === "0|0",
    `invalid_round_not_fail_closed:${[
      missing.code,
      duplicate.code,
      extra.code,
      documentReason.code,
      missingInstruction.code,
      adminBypass.code,
      wrongScope.code,
      rejectedCounts,
    ].join("|")}`,
  );
  q(15);

  const concurrent = await Promise.all([
    finalizeRpc(
      DATABASE,
      AUTH_VIEW_DECIDE,
      CASE_REF_A,
      manifest.reviewManifestVersion,
      manifest.reviewManifestHash,
      decisions,
      "review15-concurrent-a",
      "review15-concurrent-a",
    ),
    finalizeRpc(
      DATABASE,
      AUTH_VIEW_DECIDE,
      CASE_REF_A,
      manifest.reviewManifestVersion,
      manifest.reviewManifestHash,
      decisions,
      "review15-concurrent-b",
      "review15-concurrent-b",
    ),
  ]);
  const roundRefs = new Set(concurrent.map((result) => result.round_id));
  const expectedCorrectionDecisions = decisions.filter((decision) =>
    decision.disposition === "CORRECTION_REQUIRED"
  ).length;
  const finalizedCounts = await psql(DATABASE, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds),
    (select count(*) from public.app_evidence_review_round_subject_decisions),
    (select count(*) from public.app_evidence_review_rounds
      where outcome='CORRECTIONS_REQUIRED'),
    (select count(*) from public.app_evidence_review_round_subject_decisions
      where disposition='CORRECTION_REQUIRED'
        and correction_reason='INCORRECT_INFORMATION'
        and correction_instruction='Controleer en corrigeer dit gegeven.'),
    (select count(*) from public.app_audit_events
      where event_type='evidence_fact_review_round_finalized')
  );`);
  const exactRetry = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions,
    "review15-concurrent-a",
    "review15-concurrent-a",
  );
  const equivalentRetry = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions,
    "review15-equivalent-retry",
    "review15-equivalent-retry",
  );
  const conflict = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions.map((decision) => ({
      subjectRef: decision.subjectRef,
      disposition: "ACCEPTED",
    })),
    "review15-conflict",
    "review15-conflict",
    "c".repeat(64),
  );
  const correctionProjection = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_ADMIN, CASE_REF_A),
  );
  const correctionRound = correctionProjection?.currentReviewRound;
  const correctionDecisionProjection = correctionRound?.decisions.find((decision) =>
    decision.disposition === "CORRECTION_REQUIRED"
  );
  assert(
    concurrent.every((result) => result.ok === true) && roundRefs.size === 1 &&
      new Set(concurrent.map((result) => result.code)).has("finalized") &&
      finalizedCounts === `1|10|1|${expectedCorrectionDecisions}|1` &&
      exactRetry.round_id === concurrent[0].round_id &&
      equivalentRetry.code === "already_finalized" &&
      equivalentRetry.round_id === concurrent[0].round_id &&
      conflict.code === "review_round_conflict" &&
      correctionProjection?.case.canDecide === false &&
      correctionProjection?.overallReviewStatus === "CORRECTION_REQUIRED" &&
      correctionRound?.roundRef === concurrent[0].round_id &&
      correctionRound?.manifestVersion === manifest.reviewManifestVersion &&
      correctionRound?.manifestHash === manifest.reviewManifestHash &&
      correctionRound?.outcome === "CORRECTIONS_REQUIRED" &&
      correctionRound?.decisions.length === manifest.reviewSubjects.length &&
      new Set(correctionRound?.decisions.map((decision) => decision.subjectRef))
          .size === manifest.reviewSubjects.length &&
      correctionDecisionProjection?.correctionReason ===
        "INCORRECT_INFORMATION" &&
      correctionDecisionProjection.correctionInstruction ===
        "Controleer en corrigeer dit gegeven.",
    "atomic_concurrency_or_idempotency_invalid",
  );
  q(16);

  await psql(DATABASE, `begin;
    set local session_replication_role = replica;
    insert into public.app_evidence_versions (
    id,evidence_file_id,version_number,source_intake_file_id,storage_bucket,
    storage_path,detected_mime_type,size_bytes,sha256,status,
    source_confirmed_at,created_at,request_id,idempotency_key
  ) values (
    '${ENERGY_VERSION_V2}','${ENERGY_FILE}',2,gen_random_uuid(),'proof-private',
    'energy-v2.pdf','application/pdf',101,'${"d".repeat(64)}',
    'confirmed_awaiting_review','2026-01-18T10:00:00Z',
    '2026-01-18T10:00:00Z','review15-energy-v2','review15-energy-v2'
  );
  commit;`);
  const manifestAfterEvidence = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_VIEW_DECIDE, CASE_REF_A),
  );
  assert(manifestAfterEvidence, "new_evidence_manifest_missing");
  const oldEnergySubjects = new Set(
    manifest.reviewSubjects.filter((subject) =>
      subject.evidenceVersionRef === ENERGY_VERSION
    ).map((subject) => subject.subjectRef),
  );
  const newEnergySubjects = manifestAfterEvidence.reviewSubjects.filter((subject) =>
    subject.evidenceVersionRef === ENERGY_VERSION_V2
  );
  const stale = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifest.reviewManifestVersion,
    manifest.reviewManifestHash,
    decisions,
    "review15-stale",
    "review15-stale",
  );
  const preSecondRound = await psql(DATABASE, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds),
    (select count(*) from public.app_evidence_review_round_subject_decisions)
  );`);
  const acceptedDecisions = manifestAfterEvidence.reviewSubjects.map((subject) =>
    subject.valueStatus === "REQUIRED_MISSING"
      ? {
        subjectRef: subject.subjectRef,
        disposition: "CORRECTION_REQUIRED",
        correctionReason: "MISSING_INFORMATION",
        correctionInstruction: "Vul dit verplichte gegeven aan.",
      }
      : {
        subjectRef: subject.subjectRef,
        disposition: "ACCEPTED",
      }
  );
  const secondRound = await finalizeRpc(
    DATABASE,
    AUTH_VIEW_DECIDE,
    CASE_REF_A,
    manifestAfterEvidence.reviewManifestVersion,
    manifestAfterEvidence.reviewManifestHash,
    acceptedDecisions,
    "review15-second-round",
    "review15-second-round",
    "e".repeat(64),
  );
  const secondRoundCounts = await psql(DATABASE, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds),
    (select count(*) from public.app_evidence_review_round_subject_decisions),
    (select count(*) from public.app_evidence_review_rounds
      where outcome='ALL_FACTS_ACCEPTED'),
    (select count(*) from public.app_evidence_review_round_subject_decisions
      where round_id='${concurrent[0].round_id}')
  );`);
  const acceptedProjection = parseEvidenceReviewCaseDetailSource(
    await readRpc(DATABASE, AUTH_ADMIN, CASE_REF_A),
  );
  const acceptedRound = acceptedProjection?.currentReviewRound;
  assert(
    manifestAfterEvidence.reviewManifestHash !== manifest.reviewManifestHash &&
      manifestAfterEvidence.currentReviewRound === null &&
      manifestAfterEvidence.overallReviewStatus === "TO_REVIEW" &&
      newEnergySubjects.length === 4 &&
      newEnergySubjects.every((subject) => !oldEnergySubjects.has(subject.subjectRef)) &&
      stale.code === "stale_review_manifest" && preSecondRound === "1|10" &&
      secondRound.code === "finalized" &&
      secondRound.outcome === "CORRECTIONS_REQUIRED" &&
      secondRoundCounts === "2|20|0|10" &&
      acceptedRound?.roundRef === secondRound.round_id &&
      acceptedProjection?.overallReviewStatus === "CORRECTION_REQUIRED" &&
      acceptedRound?.outcome === "CORRECTIONS_REQUIRED" &&
      acceptedRound?.decisions.length ===
        acceptedProjection?.reviewSubjects.length &&
      acceptedRound?.decisions.every((decision) => {
        const subject = acceptedProjection?.reviewSubjects.find((candidate) =>
          candidate.subjectRef === decision.subjectRef
        );
        return subject?.valueStatus === "REQUIRED_MISSING"
          ? decision.disposition === "CORRECTION_REQUIRED"
          : decision.disposition === "ACCEPTED";
      }),
    "new_evidence_history_or_no_carry_forward_invalid",
  );
  q(17);

  await psql(DATABASE, `do $$
  begin
    begin
      update public.app_evidence_review_rounds set outcome='ALL_FACTS_ACCEPTED'
      where id='${concurrent[0].round_id}';
      raise exception 'round update unexpectedly allowed';
    exception when others then
      if sqlerrm = 'round update unexpectedly allowed' then raise; end if;
    end;
    begin
      delete from public.app_evidence_review_round_subject_decisions
      where round_id='${concurrent[0].round_id}';
      raise exception 'subject delete unexpectedly allowed';
    exception when others then
      if sqlerrm = 'subject delete unexpectedly allowed' then raise; end if;
    end;
  end $$;`);
  const immutableCounts = await psql(DATABASE, `select concat_ws('|',
    (select count(*) from public.app_evidence_review_rounds),
    (select count(*) from public.app_evidence_review_round_subject_decisions)
  );`);
  assert(immutableCounts === "2|20", "review_round_history_mutable");
  q(18);
}

async function activePilotProof(): Promise<void> {
  const migrationState = await psql(ACTIVE_DATABASE, `begin read only;
    with active_versions(version) as (values
      ('20260816150000'),('20260816160000'),('20260817120000'),
      ('20260817160000'),('20260817190000'),('20260817210000'),
      ('20260817230000'),('20260818090000'),('20260818120000'),
      ('20260818150000'),('20260818180000'),('20260818210000'),
      ('20260818220000'),('20260818230000'),('20260819090000'),
      ('20260819120000'),('20260819123000'),('20260819160000')
    )
    select concat_ws('|',
      (select count(*) from supabase_migrations.schema_migrations
       where version='20260819160000'),
      (select count(*) from active_versions expected
       where not exists (select 1 from supabase_migrations.schema_migrations ledger
         where ledger.version=expected.version))
    ); rollback;`);
  assert(migrationState === "1|0", `active_migration_state_invalid:${migrationState}`);

  const activeBefore = await activeFingerprint();
  const adminAndScope = await psql(ACTIVE_DATABASE, `begin read only;
    with first_admin as (
      select identity_row.auth_user_id,identity_row.id
      from public.app_workforce_identities identity_row
      join lateral (
        select state from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id=identity_row.id
          and state_event.effective_at <= clock_timestamp()
        order by state_event.effective_at desc,state_event.recorded_at desc limit 1
      ) state on state.state='active'
      join lateral (
        select seniority from public.app_workforce_seniority_assignments seniority_event
        where seniority_event.workforce_identity_id=identity_row.id
          and seniority_event.effective_at <= clock_timestamp()
        order by seniority_event.effective_at desc,seniority_event.recorded_at desc limit 1
      ) seniority on seniority.seniority='admin'
      order by identity_row.created_at,identity_row.id limit 1
    ), pilot as (
      select id from public.app_cases where case_reference='${PILOT_CASE_REF}'
    )
    select first_admin.auth_user_id::text || '|' || pilot.id::text
    from first_admin cross join pilot
    where (public.app_workforce_authorize_v1(
      first_admin.auth_user_id,'evidence.review.view',pilot.id,null,clock_timestamp()
    )->>'ok')::boolean;
    rollback;`);
  const [activeAdmin, pilotCaseId] = adminAndScope.split("|");
  assert(activeAdmin && pilotCaseId, "active_pilot_scope_missing");

  const result = await readRpc(ACTIVE_DATABASE, activeAdmin, PILOT_CASE_REF);
  const response = parseEvidenceReviewCaseDetailSource(result);
  assert(
    response && response.case.caseRef === PILOT_CASE_REF &&
      response.case.lifecycle === "submitted_for_review" &&
      response.case.canDecide === true &&
      response.case.canPublishCorrection === true &&
      !!response.case.partyDisplayName && !!response.case.deliveryAddress &&
      response.evidence.length === 2 &&
      response.evidence.every((item) => item.reviewStatus === "PENDING") &&
      response.reviewManifestVersion === "fact-review-manifest-v1" &&
      response.reviewSubjects.length === 10 &&
      response.overallReviewStatus === "WAITING_CUSTOMER" &&
      response.currentReviewRound?.outcome === "CORRECTIONS_REQUIRED" &&
      response.currentReviewRound.decisions.length === 10 &&
      new Set(response.reviewSubjects.map((subject) => subject.subjectRef)).size ===
        10 &&
      await psql(ACTIVE_DATABASE, `begin read only;
        select concat_ws('|',
          (select count(*) from public.app_evidence_review_decisions decision
            join public.app_cases case_row on case_row.id=decision.case_id
            where case_row.case_reference='${PILOT_CASE_REF}'),
          (select count(*) from public.app_evidence_review_rounds round_row
            join public.app_cases case_row on case_row.id=round_row.case_id
            where case_row.case_reference='${PILOT_CASE_REF}'),
          (select count(*)
            from public.app_evidence_review_round_subject_decisions subject
            join public.app_evidence_review_rounds round_row
              on round_row.id=subject.round_id
            join public.app_cases case_row on case_row.id=round_row.case_id
            where case_row.case_reference='${PILOT_CASE_REF}'),
          (select count(*)
            from public.app_evidence_review_correction_handoffs handoff
            join public.app_cases case_row on case_row.id=handoff.case_id
            where case_row.case_reference='${PILOT_CASE_REF}')
        ); rollback;`) === "0|1|10|1",
    "active_pilot_projection_invalid",
  );
  const pilotCorrection = response.currentReviewRound?.decisions.find(
    (decision) => decision.disposition === "CORRECTION_REQUIRED",
  );
  const pilotCorrectionSubject = response.reviewSubjects.find((subject) =>
    subject.subjectRef === pilotCorrection?.subjectRef
  );
  const kinds = response.evidence.map((item) => item.kind).sort().join("|");
  const categories = new Set(
    response.evidence.flatMap((item) => item.canonicalFacts.map((fact) => fact.category)),
  );
  assert(
    kinds === "energy_bill_or_contract|installation_invoice" &&
      pilotCorrection?.disposition === "CORRECTION_REQUIRED" &&
      pilotCorrection.correctionReason === "INCORRECT_INFORMATION" &&
      pilotCorrection.correctionInstruction === "foute invoer" &&
      pilotCorrectionSubject?.evidenceKind === "energy_bill_or_contract" &&
      pilotCorrectionSubject.factLabel === "Energieleverancier" &&
      [
        "PARTY_NAME",
        "ADDRESS",
        "EAN",
        "ENERGY_SUPPLIER",
        "CHARGER_BRAND",
        "CHARGER_MODEL",
        "MID",
        "SERIAL",
      ].every((category) => categories.has(category as never)) &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) => fact.reviewReason === "GENERIC_REVIEW_REQUIRED") &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) => !("reviewReasonAuthority" in fact)) &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "CUSTOMER_CONFIRMED")
        .every((fact) => !("reviewReason" in fact)),
    "active_pilot_fact_categories_invalid",
  );

  const unassigned = await psql(ACTIVE_DATABASE, `begin read only;
    with first_admin as (
      select identity_row.auth_user_id,identity_row.id
      from public.app_workforce_identities identity_row
      join lateral (
        select state from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id=identity_row.id
        order by state_event.effective_at desc,state_event.recorded_at desc limit 1
      ) state on state.state='active'
      join lateral (
        select seniority from public.app_workforce_seniority_assignments seniority_event
        where seniority_event.workforce_identity_id=identity_row.id
        order by seniority_event.effective_at desc,seniority_event.recorded_at desc limit 1
      ) seniority on seniority.seniority='admin'
      order by identity_row.created_at,identity_row.id limit 1
    )
    select case_row.case_reference
    from public.app_cases case_row cross join first_admin
    where case_row.case_reference <> '${PILOT_CASE_REF}'
      and not (public.app_workforce_authorize_v1(
        first_admin.auth_user_id,'evidence.review.view',case_row.id,null,
        clock_timestamp()
      )->>'ok')::boolean
      and case_row.case_reference ~* '^CASE-([0-9a-f]{12}|[0-9a-f-]{36})$'
    order by case_row.created_at,case_row.id limit 1;
    rollback;`);
  assert(unassigned, "active_unassigned_case_missing");
  const denied = await readRpc(ACTIVE_DATABASE, activeAdmin, unassigned);
  assert(denied.code === "case_scope_denied", "active_unassigned_case_not_denied");

  const activeAfter = await activeFingerprint();
  assert(activeBefore === activeAfter, "active_pilot_read_changed_database_state");
  q(19);
  console.log("EVIDENCE_REVIEW_CASE_DETAIL_Q01_Q19=PASS");
  console.log("PRIVATE_CASE_DETAIL_RPC=PASS");
  console.log("PILOT_CASE_READ=PASS");
  console.log("PILOT_CAN_DECIDE=PASS");
  console.log("CURRENT_EVIDENCE_COUNT=2");
  console.log("LEGACY_EVIDENCE_REVIEW_STATUS=PENDING");
  console.log(`PILOT_FACT_SUBJECT_COUNT=${response.reviewSubjects.length}`);
  console.log("PILOT_OVERALL_REVIEW_STATUS=WAITING_CUSTOMER");
  console.log("PILOT_FACT_ROUND_COUNT=1");
  console.log("PILOT_FACT_SUBJECT_DECISION_COUNT=10");
  console.log("PILOT_CORRECTION_BUNDLE_UNCHANGED=PASS");
  console.log("UNASSIGNED_CASE_DENIED=PASS");
  console.log("DATABASE_WRITES_ON_GET=0");
  console.log("EXPECTED_SERVER_CALL_COUNT=1");
  console.log("PARSER_RAW_OBSERVATIONS_RETURNED=NO");
  console.log("PARSER_CORRECTION_LINEAGE_CLAIMED=NO");
  console.log("DETERMINISTIC_ENDPOINT_CHECK=PASS");
}

const endpointOnly = Deno.args.includes("--endpoint-only");
const disposableOnly = Deno.args.includes("--disposable-only");
let activeBefore: string | null = null;
try {
  await endpointProof();
  if (!endpointOnly) {
    activeBefore = await activeFingerprint();
    await databaseProof();
    if (disposableOnly) {
      console.log("EVIDENCE_REVIEW_CASE_DETAIL_DISPOSABLE=PASS");
    } else {
      await activePilotProof();
    }
  }
} catch (error) {
  console.error(
    `EVIDENCE_REVIEW_CASE_DETAIL=FAIL\n${
      scrub(error instanceof Error ? error.message : String(error))
    }`,
  );
  Deno.exitCode = 1;
} finally {
  if (!endpointOnly) {
    try {
      await dropDatabase();
      const activeAfter = await activeFingerprint();
      if (activeBefore !== activeAfter) {
        console.error("ACTIVE_TENANT_DATABASE_UNCHANGED=FAIL");
        Deno.exitCode = 1;
      } else if (!Deno.exitCode) {
        console.log("ACTIVE_TENANT_DATABASE_UNCHANGED=PASS");
        console.log("FIRST_ADMIN_STATE_PRESERVED=PASS");
        console.log("PILOT_CASE_SCOPE_PRESERVED=PASS");
        console.log("EVIDENCE_TRUTH_UNCHANGED=PASS");
      }
    } catch (error) {
      console.error(`PROOF_CLEANUP=FAIL:${scrub(String(error))}`);
      Deno.exitCode = 1;
    }
  }
}
