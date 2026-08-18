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
function rpcSuccess(evidence: readonly JsonObject[] = [sourceEvidence()]): JsonObject {
  return {
    ok: true,
    status: 200,
    code: "ok",
    as_of: "2026-08-18T12:00:00.000Z",
    case_context: {
      can_decide: true,
      case_ref: CASE_REF_A,
      lifecycle_state: "submitted_for_review",
      party_display_name: "Declared Person",
      party_truth_class: "DECLARED",
      delivery_address: "Declared Address",
      delivery_address_truth_class: "DECLARED",
    },
    evidence,
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
        name === "app_evidence_review_case_detail_read_v3" &&
          args.p_auth_user_id === AUTH_ADMIN && args.p_case_ref === CASE_REF_A &&
          Object.keys(args).sort().join("|") === "p_auth_user_id|p_case_ref",
        "rpc_contract_invalid",
      );
    },
  })(new Request(url));
  const body = await responseJson(success) as unknown as EvidenceReviewCaseDetailResponseV1;
  assert(
    success.status === 200 && rpcCalls === 1 &&
      body.schemaVersion === "evidence-review-case-detail-v1" &&
      body.case.caseRef === CASE_REF_A &&
      body.case.partyDisplayNameTruth === "DECLARED" &&
      body.case.deliveryAddressTruth === "DECLARED" &&
      body.evidence.length === 2 &&
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
    "reviewer",
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
  assert(malformed === null, "unknown_source_field_allowed");
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
      !source.includes("check_execution") && !source.includes("review_task"),
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
    select public.app_evidence_review_case_detail_read_v3(
      '${authUserId}', '${caseRef}'
    )::text;
    rollback;`);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "rpc_output_missing");
  return JSON.parse(line) as JsonObject;
}

async function databaseProof(): Promise<void> {
  await setupDatabase();
  const acl = await psql(DATABASE, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.app_evidence_review_case_detail_read_v3(uuid,text)','EXECUTE'),
    has_function_privilege('anon',
      'public.app_evidence_review_case_detail_read_v3(uuid,text)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.app_evidence_review_case_detail_read_v3(uuid,text)','EXECUTE'),
    has_function_privilege('service_role',
      'public.app_workforce_authorize_v1(uuid,text,uuid,uuid,timestamptz)',
      'EXECUTE')
  );`);
  assert(acl === "t|f|f|f", `rpc_acl_invalid:${acl}`);
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
            'value','MID-DECLARED','resolution_state','review_required','required',true,
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
      response.evidence.every((item) => item.reviewStatus === "PENDING"),
    "authorized_projection_invalid",
  );
  const energy = response.evidence.find((item) => item.kind === "energy_bill_or_contract");
  const invoice = response.evidence.find((item) => item.kind === "installation_invoice");
  assert(
    energy?.canonicalFacts.map((fact) => fact.category).join("|") ===
      "ADDRESS|EAN|ENERGY_SUPPLIER|PARTY_NAME" &&
      invoice?.canonicalFacts.map((fact) => fact.category).join("|") ===
        "ADDRESS|CHARGER_BRAND|CHARGER_MODEL|MID|PARTY_NAME|SERIAL" &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) => fact.reviewReason === "GENERIC_REVIEW_REQUIRED") &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "REVIEW_REQUIRED")
        .every((fact) => !("reviewReasonAuthority" in fact)) &&
      response.evidence.flatMap((item) => item.canonicalFacts)
        .filter((fact) => fact.truthClass === "CUSTOMER_CONFIRMED")
        .every((fact) => !("reviewReason" in fact)),
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
      nonWorkforce.code === "workforce_identity_missing" &&
      customerOnly.code === "workforce_identity_missing" &&
      inactive.code === "workforce_identity_inactive",
    "authorization_matrix_invalid",
  );
  q(12);

  const after = await proofFingerprint();
  assert(postFixtureBaseline === after, "read_rpc_changed_database_state");
  const definition = await psql(DATABASE, `select pg_get_functiondef(
    'public.app_evidence_review_case_detail_read_v3(uuid,text)'::regprocedure
  );`);
  assert(
    definition.includes("app_evidence_review_case_detail_read_v2") &&
      definition.includes("app_workforce_authorize_v1") &&
      definition.includes("'evidence.review.decide'") &&
      !/\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i.test(definition),
    "read_function_contains_write_or_parallel_auth",
  );
  q(13);
}

async function activePilotProof(): Promise<void> {
  const migrationState = await psql(ACTIVE_DATABASE, `begin read only;
    with active_versions(version) as (values
      ('20260816150000'),('20260816160000'),('20260817120000'),
      ('20260817160000'),('20260817190000'),('20260817210000'),
      ('20260817230000'),('20260818090000'),('20260818120000'),
      ('20260818150000'),('20260818180000'),('20260818210000'),
      ('20260818220000')
    )
    select concat_ws('|',
      (select count(*) from supabase_migrations.schema_migrations
       where version='20260818220000'),
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
      !!response.case.partyDisplayName && !!response.case.deliveryAddress &&
      response.evidence.length === 2 &&
      response.evidence.every((item) => item.reviewStatus === "PENDING") &&
      await psql(ACTIVE_DATABASE, `begin read only;
        select count(*) from public.app_evidence_review_decisions decision
        join public.app_cases case_row on case_row.id=decision.case_id
        where case_row.case_reference='${PILOT_CASE_REF}'; rollback;`) === "0",
    "active_pilot_projection_invalid",
  );
  const kinds = response.evidence.map((item) => item.kind).sort().join("|");
  const categories = new Set(
    response.evidence.flatMap((item) => item.canonicalFacts.map((fact) => fact.category)),
  );
  assert(
    kinds === "energy_bill_or_contract|installation_invoice" &&
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
  q(14);
  console.log("EVIDENCE_REVIEW_CASE_DETAIL_Q01_Q14=PASS");
  console.log("PRIVATE_CASE_DETAIL_RPC=PASS");
  console.log("PILOT_CASE_READ=PASS");
  console.log("PILOT_CAN_DECIDE=PASS");
  console.log("CURRENT_EVIDENCE_COUNT=2");
  console.log("BOTH_REVIEW_STATUS=PENDING");
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
