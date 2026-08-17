import {
  buildEvidenceReviewWorklistResponse,
  parseAuthorizedEvidenceReviewSourceRows,
  type EvidenceReviewWorklistResponseV1,
} from "../../supabase/functions/_shared/app_evidence_review_worklist.ts";
import {
  createHandler,
} from "../../supabase/functions/api-app-evidence-review-worklist/index.ts";
import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const CONTAINER = "supabase_db_enval";
const ACTIVE_DATABASE = "postgres";
const DATABASE = `enval_review04_proof_${
  crypto.randomUUID().replaceAll("-", "")
}`;
const MIGRATION =
  "supabase/migrations/20260818090000_app_evidence_review_worklist_read.sql";
const AUTH_ADMIN = "d1000000-0000-4000-8000-000000000001";
const AUTH_ADMIN_NO_SCOPE = "d1000000-0000-4000-8000-000000000002";
const AUTH_NO_VIEW = "d1000000-0000-4000-8000-000000000003";
const AUTH_SUSPENDED = "d1000000-0000-4000-8000-000000000004";
const AUTH_NON_WORKFORCE = "d1000000-0000-4000-8000-000000000005";
const AUTH_CUSTOMER_ONLY = "d1000000-0000-4000-8000-000000000006";
const HASH = "a".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

const CASES = Object.freeze({
  unreviewed: "d2000000-0000-4000-8000-000000000001",
  accepted: "d2000000-0000-4000-8000-000000000002",
  correction: "d2000000-0000-4000-8000-000000000003",
  acceptedThenNew: "d2000000-0000-4000-8000-000000000004",
  correctionThenNew: "d2000000-0000-4000-8000-000000000005",
  multiple: "d2000000-0000-4000-8000-000000000006",
  terminal: "d2000000-0000-4000-8000-000000000007",
  wrongScope: "d2000000-0000-4000-8000-000000000008",
});
const CASE_REFS = Object.freeze({
  unreviewed: "REVIEW04-UNREVIEWED",
  accepted: "REVIEW04-ACCEPTED",
  correction: "REVIEW04-CORRECTION",
  acceptedThenNew: "REVIEW04-ACCEPTED-NEW",
  correctionThenNew: "REVIEW04-CORRECTION-NEW",
  multiple: "REVIEW04-MULTIPLE",
  terminal: "REVIEW04-TERMINAL",
  wrongScope: "REVIEW04-WRONG-SCOPE",
});
const VERSION = Object.freeze({
  unreviewed: "d4000000-0000-4000-8000-000000000001",
  accepted: "d4000000-0000-4000-8000-000000000002",
  correction: "d4000000-0000-4000-8000-000000000003",
  acceptedOld: "d4000000-0000-4000-8000-000000000004",
  acceptedNew: "d4000000-0000-4000-8000-000000000005",
  correctionOld: "d4000000-0000-4000-8000-000000000006",
  correctionNew: "d4000000-0000-4000-8000-000000000007",
  multipleA: "d4000000-0000-4000-8000-000000000008",
  multipleB: "d4000000-0000-4000-8000-000000000009",
  terminal: "d4000000-0000-4000-8000-00000000000a",
  wrongScope: "d4000000-0000-4000-8000-00000000000b",
});

type CommandResult = { code: number; stdout: string; stderr: string };
class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REVIEW04-Q${String(value).padStart(2, "0")}: PASS`);
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
async function must(name: string, args: string[], stdin?: string) {
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
  request_id: "review04-proof-request",
  idempotency_key: null,
  ip_hash: null,
  user_agent_hash: null,
  method: "GET",
  path: "/api-app-evidence-review-worklist",
  url: "https://enval.local/api-app-evidence-review-worklist",
  origin: null,
  timestamp: "2026-08-18T12:00:00.000Z",
  environment: "local",
};

function sourceRow(
  overrides: Partial<JsonObject> = {},
): JsonObject {
  return {
    case_ref: CASE_REFS.unreviewed,
    lifecycle_state: "submitted_for_review",
    evidence_version_ref: VERSION.unreviewed,
    version_number: 1,
    evidence_created_at: "2026-08-18T10:00:00.000Z",
    current_decision: null,
    current_decided_at: null,
    has_earlier_decision: false,
    ...overrides,
  };
}
function rpcSuccess(rows: readonly JsonObject[]): JsonObject {
  return { ok: true, status: 200, code: "ok", source_rows: rows };
}
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
    verifyBearer: async () =>
      options.auth === false
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
    now: () => "2026-08-18T12:00:00.000Z",
  });
}
async function responseJson(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

async function endpointProof(): Promise<void> {
  const nonGet = await endpoint(rpcSuccess([]))(
    new Request("https://enval.local/api-app-evidence-review-worklist", {
      method: "POST",
    }),
  );
  assert(nonGet.status === 405, "non_get_not_denied");
  q(1);

  let gatedRpcCalls = 0;
  const tenantFailure = new Response("{}", { status: 503 });
  const gated = await endpoint(rpcSuccess([]), {
    tenantFailure,
    onRpc: () => gatedRpcCalls++,
  })(new Request("https://enval.local/api-app-evidence-review-worklist"));
  assert(gated === tenantFailure && gatedRpcCalls === 0, "tenant_gate_not_first");
  q(2);

  const noAuth = await endpoint(rpcSuccess([]), { auth: false })(
    new Request("https://enval.local/api-app-evidence-review-worklist"),
  );
  const filtered = await endpoint(rpcSuccess([]))(
    new Request(
      "https://enval.local/api-app-evidence-review-worklist?caseId=other",
    ),
  );
  assert(noAuth.status === 401 && filtered.status === 400, "input_gate_failed");
  q(3);

  const empty = await endpoint(rpcSuccess([]))(
    new Request("https://enval.local/api-app-evidence-review-worklist"),
  );
  const emptyBody = await responseJson(
    empty,
  ) as unknown as EvidenceReviewWorklistResponseV1;
  assert(
    empty.status === 200 && emptyBody.caseCount === 0 &&
      emptyBody.cases.length === 0 &&
      emptyBody.schemaVersion === "evidence-review-worklist-v1",
    "empty_contract_invalid",
  );
  q(4);

  const parsed = parseAuthorizedEvidenceReviewSourceRows(rpcSuccess([
    sourceRow(),
    sourceRow({
      evidence_version_ref: VERSION.accepted,
      current_decision: "ACCEPTED",
      current_decided_at: "2026-08-18T10:10:00.000Z",
    }),
    sourceRow({
      case_ref: CASE_REFS.correction,
      evidence_version_ref: VERSION.correction,
      current_decision: "CORRECTION_REQUIRED",
      current_decided_at: "2026-08-18T10:20:00.000Z",
    }),
    sourceRow({
      case_ref: CASE_REFS.acceptedThenNew,
      evidence_version_ref: VERSION.acceptedNew,
      version_number: 2,
      evidence_created_at: "2026-08-18T10:30:00.000Z",
      has_earlier_decision: true,
    }),
    sourceRow({
      case_ref: CASE_REFS.correctionThenNew,
      evidence_version_ref: VERSION.correctionNew,
      version_number: 2,
      evidence_created_at: "2026-08-18T10:40:00.000Z",
      has_earlier_decision: true,
    }),
    sourceRow({
      case_ref: CASE_REFS.multiple,
      evidence_version_ref: VERSION.multipleA,
      evidence_created_at: "2026-08-18T10:50:00.000Z",
    }),
    sourceRow({
      case_ref: CASE_REFS.multiple,
      evidence_version_ref: VERSION.multipleB,
      evidence_created_at: "2026-08-18T11:00:00.000Z",
    }),
  ]));
  assert(parsed, "valid_source_rejected");
  const projected = buildEvidenceReviewWorklistResponse(
    "2026-08-18T12:00:00.000Z",
    parsed,
  );
  assert(projected && projected.caseCount === 5, "case_projection_invalid");
  const currentCorrection = projected.cases.find((item) =>
    item.caseRef === CASE_REFS.correction
  );
  const acceptedThenNew = projected.cases.find((item) =>
    item.caseRef === CASE_REFS.acceptedThenNew
  );
  const correctionThenNew = projected.cases.find((item) =>
    item.caseRef === CASE_REFS.correctionThenNew
  );
  const multiple = projected.cases.find((item) =>
    item.caseRef === CASE_REFS.multiple
  );
  assert(
    currentCorrection?.attentionReasons.join("|") === "CORRECTION_REQUIRED" &&
      acceptedThenNew?.attentionReasons.join("|") ===
        "UNREVIEWED_EVIDENCE|NEW_EVIDENCE_VERSION_AFTER_REVIEW" &&
      correctionThenNew?.attentionReasons.join("|") ===
        "UNREVIEWED_EVIDENCE|NEW_EVIDENCE_VERSION_AFTER_REVIEW" &&
      !correctionThenNew.attentionReasons.includes("CORRECTION_REQUIRED") &&
      multiple?.unresolvedEvidenceCount === 2 &&
      multiple.evidenceRefs.length === 2,
    "attention_semantics_invalid",
  );
  q(5);

  const projectedAgain = buildEvidenceReviewWorklistResponse(
    "2026-08-18T12:00:00.000Z",
    [...parsed].reverse(),
  );
  assert(
    JSON.stringify(projected) === JSON.stringify(projectedAgain),
    "ordering_not_deterministic",
  );
  const safeJson = JSON.stringify(projected);
  for (
    const forbidden of [
      "customerDisplayLabel",
      "storage_path",
      "storagePath",
      "service_role",
      "policy_version",
      "lastAutomaticCheck",
      "sourceUnavailable",
      "rerun",
      "PASS",
      "FAIL",
    ]
  ) assert(!safeJson.includes(forbidden), `unsafe_response:${forbidden}`);
  q(6);

  const malformed = parseAuthorizedEvidenceReviewSourceRows(rpcSuccess([
    sourceRow({ storage_path: "private/path" }),
  ]));
  assert(malformed === null, "unknown_source_field_allowed");
  for (
    const code of [
      "authenticated_actor_not_verified",
      "workforce_identity_missing",
      "workforce_identity_inactive",
      "capability_not_authorized",
      "authorization_changed",
    ]
  ) {
    const denied = await endpoint({ ok: false, status: 403, code })(
      new Request("https://enval.local/api-app-evidence-review-worklist"),
    );
    const body = await responseJson(denied);
    assert(
      denied.status === 403 && body.code === code &&
        !JSON.stringify(body).includes("workforce_identity_id"),
      `unsafe_denial:${code}`,
    );
  }
  q(7);

  const source = await Deno.readTextFile(MIGRATION);
  assert(
    source.includes("public.app_workforce_authorize_v1(") &&
      source.includes("'evidence.review.view'") &&
      source.includes("scope_event.case_id") &&
      source.includes("lifecycle_state = 'submitted_for_review'") &&
      !source.includes("grant execute on function public.app_workforce_authorize_v1") &&
      !source.includes("customer_display") &&
      !source.includes("check_execution") && !source.includes("review_task"),
    "bounded_read_source_missing",
  );
  q(8);
  console.log("EVIDENCE_REVIEW_WORKLIST_ENDPOINT=PASS");
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
  for (const path of migrations) {
    await psql(DATABASE, await Deno.readTextFile(path));
  }
}

async function activeFingerprint(): Promise<string> {
  return await psql(ACTIVE_DATABASE, `begin read only;
    select concat_ws('|',
      (select count(*) from supabase_migrations.schema_migrations),
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
async function readRpc(authUserId: string): Promise<JsonObject> {
  const output = await psql(DATABASE, `begin;
    set local role service_role;
    select public.app_evidence_review_worklist_source_read_v1(
      '${authUserId}'
    )::text;
    rollback;`);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "rpc_output_missing");
  return JSON.parse(line) as JsonObject;
}

async function databaseProof(): Promise<number> {
  await setupDatabase();
  const acl = await psql(DATABASE, `select concat_ws('|',
    has_function_privilege('service_role',
      'public.app_evidence_review_worklist_source_read_v1(uuid)','EXECUTE'),
    has_function_privilege('anon',
      'public.app_evidence_review_worklist_source_read_v1(uuid)','EXECUTE'),
    has_function_privilege('authenticated',
      'public.app_evidence_review_worklist_source_read_v1(uuid)','EXECUTE'),
    has_function_privilege('service_role',
      'public.app_workforce_authorize_v1(uuid,text,uuid,uuid,timestamptz)',
      'EXECUTE'),
    has_table_privilege('authenticated',
      'public.app_evidence_review_decisions','SELECT')
  );`);
  assert(acl === "t|f|f|f|f", `rpc_acl_invalid:${acl}`);
  q(9);

  await psql(DATABASE, `
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_ADMIN}','admin@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_ADMIN_NO_SCOPE}','noscope@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NO_VIEW}','noview@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_SUSPENDED}','suspended@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NON_WORKFORCE}','outside@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_CUSTOMER_ONLY}','customer@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());
    insert into public.app_customers (id,customer_type)
    values ('d5000000-0000-4000-8000-000000000001','particulier');
    insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values (
      '${AUTH_CUSTOMER_ONLY}','d5000000-0000-4000-8000-000000000001',null,
      'bound_customer_identity','app_customer_identity','proof:customer',
      'review04-customer-access'
    );
  `);
  const caseEntries = Object.entries(CASES) as [keyof typeof CASES, string][];
  for (const [name, caseId] of caseEntries) {
    const state = name === "terminal" ? "rejected" : "submitted_for_review";
    await psql(DATABASE, `
      insert into public.app_cases (
        id,customer_id,case_reference,created_at,created_by_actor_type,
        created_by_actor_ref,source_class,source_ref,request_id
      ) values (
        '${caseId}','d5000000-0000-4000-8000-000000000001',
        '${CASE_REFS[name]}','2026-01-18T08:00:00Z','system','proof:review04',
        'proof','review04:${name}','review04-case:${name}'
      );
      insert into public.app_case_lifecycle_events (
        case_id,promotion_id,lifecycle_state,event_at,actor_type,actor_ref,
        source_class,source_ref,request_id,event_data
      ) values (
        '${caseId}',null,'${state}','2026-01-18T08:01:00Z','system',
        'proof:review04','proof','review04:${name}',
        'review04-lifecycle:${name}','{}'
      );
    `);
  }

  const bootstrap = await psql(DATABASE, `select
    public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','review04-bootstrap','review04-bootstrap',
      '${HASH}','${EXPIRES}','decision:review04-bootstrap'
    )->>'ok';`);
  assert(bootstrap === "true", "admin_bootstrap_failed");
  for (const [auth, seniority, suffix] of [
    [AUTH_ADMIN_NO_SCOPE, "admin", "admin-no-scope"],
    [AUTH_NO_VIEW, "reviewer", "no-view"],
    [AUTH_SUSPENDED, "reviewer", "suspended"],
  ]) {
    const created = await psql(DATABASE, `select
      public.app_workforce_member_manage_v1(
        '${AUTH_ADMIN}','review04-member-${suffix}',
        'review04-member-${suffix}','${HASH}','${EXPIRES}','create',
        '${auth}',null,'${seniority}',clock_timestamp(),
        'decision:review04-${suffix}',null
      )->>'ok';`);
    assert(created === "true", `member_create_failed:${suffix}`);
  }
  const identityRows = await psql(DATABASE, `select concat_ws('|',
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_ADMIN}'),
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_ADMIN_NO_SCOPE}'),
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_NO_VIEW}'),
    (select id from public.app_workforce_identities where auth_user_id='${AUTH_SUSPENDED}')
  );`);
  const [adminIdentity, , noViewIdentity, suspendedIdentity] =
    identityRows.split("|");
  assert(adminIdentity && noViewIdentity && suspendedIdentity, "identity_missing");

  let assignment = 0;
  async function grantCase(
    identityId: string,
    capability: "evidence.review.view" | "evidence.review.decide",
    caseId: string,
  ): Promise<void> {
    assignment += 1;
    const result = await psql(DATABASE, `select
      public.app_workforce_case_assignment_manage_v1(
        '${AUTH_ADMIN}','review04-assignment-${assignment}',
        'review04-assignment-${assignment}','${HASH}','${EXPIRES}','grant',
        '${identityId}','${capability}','${caseId}',null,null,null,
        clock_timestamp(),null,'decision:review04-assignment',null
      )->>'ok';`);
    assert(result === "true", `assignment_failed:${assignment}`);
  }
  for (const caseId of Object.values(CASES).slice(0, 7)) {
    await grantCase(adminIdentity, "evidence.review.view", caseId);
  }
  for (
    const caseId of [
      CASES.accepted,
      CASES.correction,
      CASES.acceptedThenNew,
      CASES.correctionThenNew,
    ]
  ) await grantCase(adminIdentity, "evidence.review.decide", caseId);
  await grantCase(noViewIdentity, "evidence.review.decide", CASES.unreviewed);
  await grantCase(suspendedIdentity, "evidence.review.view", CASES.unreviewed);

  await psql(DATABASE, `
    insert into public.app_workforce_capability_assignments (
      assignment_id,workforce_identity_id,capability_code,event_type,
      effective_at,valid_until,decision_ref,reason_ref,recorded_by_actor_ref,
      request_id,supersedes_assignment_event_id
    ) select assignment_id,workforce_identity_id,capability_code,'revoked',
      clock_timestamp(),null,'decision:review04','view_removed','proof:review04',
      'review04-no-view-revoke',id
    from public.app_workforce_capability_assignments
    where workforce_identity_id='${noViewIdentity}'
      and capability_code='evidence.review.view'
      and event_type='granted' and supersedes_assignment_event_id is null;
    insert into public.app_workforce_identity_states (
      workforce_identity_id,state,effective_at,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_state_id
    ) select workforce_identity_id,'suspended',clock_timestamp(),
      'decision:review04','proof_suspension','proof:review04',
      'review04-suspend',id
    from public.app_workforce_identity_states
    where workforce_identity_id='${suspendedIdentity}'
      and supersedes_state_id is null;
  `);

  const files = [
    ["01", CASES.unreviewed, VERSION.unreviewed, 1, "2026-01-18T09:01:00Z"],
    ["02", CASES.accepted, VERSION.accepted, 1, "2026-01-18T09:02:00Z"],
    ["03", CASES.correction, VERSION.correction, 1, "2026-01-18T09:03:00Z"],
    ["04", CASES.acceptedThenNew, VERSION.acceptedOld, 1, "2026-01-18T09:04:00Z"],
    ["04", CASES.acceptedThenNew, VERSION.acceptedNew, 2, "2026-01-18T09:05:00Z"],
    ["05", CASES.correctionThenNew, VERSION.correctionOld, 1, "2026-01-18T09:06:00Z"],
    ["05", CASES.correctionThenNew, VERSION.correctionNew, 2, "2026-01-18T09:07:00Z"],
    ["06", CASES.multiple, VERSION.multipleA, 1, "2026-01-18T09:08:00Z"],
    ["07", CASES.multiple, VERSION.multipleB, 1, "2026-01-18T09:09:00Z"],
    ["08", CASES.terminal, VERSION.terminal, 1, "2026-01-18T09:10:00Z"],
    ["09", CASES.wrongScope, VERSION.wrongScope, 1, "2026-01-18T09:11:00Z"],
  ] as const;
  const insertedFiles = new Set<string>();
  for (const [fileSuffix, caseId, versionId, number, createdAt] of files) {
    const fileId = `d3000000-0000-4000-8000-0000000000${fileSuffix}`;
    if (!insertedFiles.has(fileId)) {
      insertedFiles.add(fileId);
      await psql(DATABASE, `begin;
      set local session_replication_role = replica;
      insert into public.app_evidence_files (
        id,case_id,promotion_id,document_type,source_class,source_ref,
        created_at,created_by_actor_ref,request_id
      ) values (
        '${fileId}','${caseId}',gen_random_uuid(),'energy_bill',
        'signup_quarantine_file','proof:${fileSuffix}','${createdAt}',
        'proof:review04','review04-file:${fileSuffix}'
      );
      commit;`);
    }
    await psql(DATABASE, `begin;
    set local session_replication_role = replica;
    insert into public.app_evidence_versions (
      id,evidence_file_id,version_number,source_intake_file_id,storage_bucket,
      storage_path,detected_mime_type,size_bytes,sha256,status,
      source_confirmed_at,created_at,request_id,idempotency_key
    ) values (
      '${versionId}','${fileId}',${number},gen_random_uuid(),'proof-private',
      'private-${fileSuffix}-v${number}.pdf','application/pdf',100,'${HASH}',
      'confirmed_awaiting_review','${createdAt}','${createdAt}',
      'review04-version:${fileSuffix}:${number}',
      'review04-version:${fileSuffix}:${number}'
    );
    commit;`);
  }
  for (const [versionId, decision, suffix] of [
    [VERSION.accepted, "ACCEPTED", "accepted"],
    [VERSION.correction, "CORRECTION_REQUIRED", "correction"],
    [VERSION.acceptedOld, "ACCEPTED", "accepted-old"],
    [VERSION.correctionOld, "CORRECTION_REQUIRED", "correction-old"],
  ]) {
    const result = await psql(DATABASE, `select
      public.app_evidence_review_decide_v1(
        '${AUTH_ADMIN}','${versionId}','${decision}',
        'review04-decision-${suffix}','review04-decision-${suffix}',
        '${HASH}','${EXPIRES}'
      )->>'ok';`);
    assert(result === "true", `decision_failed:${suffix}`);
  }
  q(10);

  const before = await proofFingerprint();
  const allowed = await readRpc(AUTH_ADMIN);
  const rows = parseAuthorizedEvidenceReviewSourceRows(allowed);
  assert(rows, "authorized_source_invalid");
  const response = buildEvidenceReviewWorklistResponse(
    "2026-08-18T12:00:00.000Z",
    rows,
  );
  assert(response && response.caseCount === 5, "authorized_case_count_invalid");
  const refs = response.cases.map((item) => item.caseRef);
  assert(
    !refs.includes(CASE_REFS.accepted) &&
      !refs.includes(CASE_REFS.terminal) &&
      !refs.includes(CASE_REFS.wrongScope),
    "accepted_terminal_or_wrong_scope_visible",
  );
  q(11);

  const adminEmpty = await readRpc(AUTH_ADMIN_NO_SCOPE);
  const customerOnly = await readRpc(AUTH_CUSTOMER_ONLY);
  const nonWorkforce = await readRpc(AUTH_NON_WORKFORCE);
  const noView = await readRpc(AUTH_NO_VIEW);
  const suspended = await readRpc(AUTH_SUSPENDED);
  assert(
    adminEmpty.ok === true && Array.isArray(adminEmpty.source_rows) &&
      adminEmpty.source_rows.length === 0 &&
      customerOnly.code === "workforce_identity_missing" &&
      nonWorkforce.code === "workforce_identity_missing" &&
      noView.code === "capability_not_authorized" &&
      suspended.code === "workforce_identity_inactive",
    `authorization_matrix_invalid:${
      [customerOnly.code, nonWorkforce.code, noView.code, suspended.code].join("|")
    }`,
  );
  q(12);

  const after = await proofFingerprint();
  assert(before === after, "read_rpc_changed_database_state");
  const definition = await psql(DATABASE, `select pg_get_functiondef(
    'public.app_evidence_review_worklist_source_read_v1(uuid)'::regprocedure
  );`);
  assert(
    definition.includes("app_workforce_authorize_v1") &&
      !/\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i.test(definition),
    "read_function_contains_write_or_parallel_auth",
  );
  q(13);

  const activeCountRaw = await psql(ACTIVE_DATABASE, `begin read only;
    with first_admin as (
      select identity_row.auth_user_id,identity_row.id
      from public.app_workforce_identities identity_row
      join lateral (
        select state
        from public.app_workforce_identity_states state_event
        where state_event.workforce_identity_id=identity_row.id
          and state_event.effective_at <= clock_timestamp()
        order by state_event.effective_at desc,state_event.recorded_at desc
        limit 1
      ) state on state.state='active'
      join lateral (
        select seniority
        from public.app_workforce_seniority_assignments seniority_event
        where seniority_event.workforce_identity_id=identity_row.id
          and seniority_event.effective_at <= clock_timestamp()
        order by seniority_event.effective_at desc,seniority_event.recorded_at desc
        limit 1
      ) seniority on seniority.seniority='admin'
      order by identity_row.created_at,identity_row.id limit 1
    ), candidate as (
      select distinct scope_event.case_id,first_admin.auth_user_id
      from first_admin
      join public.app_workforce_scope_assignments scope_event
        on scope_event.workforce_identity_id=first_admin.id
       and scope_event.capability_code='evidence.review.view'
       and scope_event.location_id is null
    )
    select count(*) filter (where (
      public.app_workforce_authorize_v1(
        auth_user_id,'evidence.review.view',case_id,null,clock_timestamp()
      )->>'ok')::boolean)
    from candidate;
    rollback;`);
  const activeCount = Number(activeCountRaw);
  assert(Number.isInteger(activeCount) && activeCount >= 0, "active_count_invalid");
  q(14);
  console.log("EVIDENCE_REVIEW_WORKLIST_READ_Q01_Q14=PASS");
  console.log("PRIVATE_AUTHORIZED_READ_RPC=PASS");
  console.log("DATABASE_WRITES_ON_GET=0");
  console.log(`FIRST_ADMIN_AUTHORIZED_CASE_COUNT=${activeCount}`);
  console.log("PERSISTENT_TEST_FIXTURES_LEFT=NO");
  console.log("DETERMINISTIC_ENDPOINT_CHECK=PASS");
  return activeCount;
}

const endpointOnly = Deno.args.includes("--endpoint-only");
let activeBefore: string | null = null;
try {
  await endpointProof();
  if (!endpointOnly) {
    activeBefore = await activeFingerprint();
    await databaseProof();
  }
} catch (error) {
  console.error(
    `EVIDENCE_REVIEW_WORKLIST_READ=FAIL\n${
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
      }
    } catch (error) {
      console.error(`PROOF_CLEANUP=FAIL:${scrub(String(error))}`);
      Deno.exitCode = 1;
    }
  }
}
