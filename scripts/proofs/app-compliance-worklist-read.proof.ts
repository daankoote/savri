import {
  buildComplianceWorklistResponse,
  type ComplianceWorklistResponseV1,
} from "../../supabase/functions/_shared/app_compliance_worklist.ts";
import {
  createHandler,
} from "../../supabase/functions/api-app-compliance-worklist/index.ts";
import type {
  PersistedDeliveryYearComplianceSourceEventV1,
} from "../../platform/runtime/compliance/delivery_year_compliance_source_event.ts";
import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const CONTAINER = "supabase_db_enval";
const ACTIVE_DATABASE = "postgres";
const DATABASE = `enval_reg03i_proof_${
  crypto.randomUUID().replaceAll("-", "")
}`;
const MIGRATIONS = [
  "supabase/migrations/20260816150000_app_current_baseline.sql",
  "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql",
  "supabase/migrations/20260817120000_app_compliance_workforce_view.sql",
  "supabase/migrations/20260817160000_app_compliance_source_event_ledger.sql",
  "supabase/migrations/20260817190000_app_compliance_source_event_capture.sql",
  "supabase/migrations/20260817210000_app_compliance_worklist_read.sql",
] as const;
const MIGRATION = MIGRATIONS.at(-1)!;
const AUTH_ADMIN = "c1000000-0000-4000-8000-000000000001";
const AUTH_REVIEWER = "c1000000-0000-4000-8000-000000000002";
const AUTH_NON_WORKFORCE = "c1000000-0000-4000-8000-000000000003";
const AUTH_RECORD_ONLY = "c1000000-0000-4000-8000-000000000004";
const AUTH_NO_SCOPE = "c1000000-0000-4000-8000-000000000005";
const AUTH_LOCATION_ONLY = "c1000000-0000-4000-8000-000000000006";
const AUTH_SUSPENDED = "c1000000-0000-4000-8000-000000000007";
const HASH = "a".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

type CommandResult = { code: number; stdout: string; stderr: string };
type RpcData = JsonObject;

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REG03I-Q${String(value).padStart(2, "0")}: PASS`);
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
async function must(
  name: string,
  args: string[],
  stdin?: string,
): Promise<string> {
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
  request_id: "reg03i-proof-request",
  idempotency_key: null,
  ip_hash: null,
  user_agent_hash: null,
  method: "GET",
  path: "/api-app-compliance-worklist",
  url: "https://enval.local/api-app-compliance-worklist",
  origin: null,
  timestamp: "2027-02-15T12:00:00.000Z",
  environment: "local",
};

function sourceEvent(
  eventKind: PersistedDeliveryYearComplianceSourceEventV1["event_kind"],
  occurredAt: string,
  overrides: Partial<PersistedDeliveryYearComplianceSourceEventV1> = {},
): PersistedDeliveryYearComplianceSourceEventV1 {
  const common = {
    source_contract_version: "delivery-year-compliance-source-event-v1",
    event_schema_version: "delivery-year-compliance-event-v1",
    event_id: `proof:${eventKind.toLowerCase()}`,
    delivery_year: 2026,
    event_kind: eventKind,
    occurred_at: occurredAt,
    regulated_actor_kind: eventKind ===
        "VERIFICATION_RESULT_REGISTERED_IN_REV"
      ? "VERIFIER" as const
      : "INBOEKER" as const,
    recorded_at: occurredAt,
    recorder_kind: "WORKFORCE" as const,
    recorder_reference: "workforce:proof",
    evidence_reference: `evidence:${eventKind.toLowerCase()}`,
    evidence_sha256: HASH,
    evidence_version_id: null,
    verification_result_reference: null,
    statement_reference: null,
    findings_report_reference: null,
  };
  const variants = {
    INBOOKING_COMPLETED: {
      provenance_kind: "REV_INBOOKING_COMPLETION" as const,
    },
    VERIFICATION_STATEMENT_POSSESSED: {
      provenance_kind: "VERIFIER_STATEMENT_ARTIFACT" as const,
      verification_result_reference: "verification:positive",
      statement_reference: "statement:positive",
    },
    FINDINGS_REPORT_RECEIVED: {
      provenance_kind: "VERIFIER_FINDINGS_ARTIFACT" as const,
      verification_result_reference: "verification:findings",
      findings_report_reference: "findings:report",
    },
    STATEMENT_SUBMITTED_TO_NEA: {
      provenance_kind: "NEA_SUBMISSION_CONFIRMATION" as const,
      statement_reference: "statement:positive",
    },
    VERIFICATION_RESULT_REGISTERED_IN_REV: {
      provenance_kind: "VERIFIER_REV_REGISTRATION_CONFIRMATION" as const,
      verification_result_reference: "verification:positive",
    },
  }[eventKind];
  return Object.freeze({
    ...common,
    ...variants,
    ...overrides,
  }) as PersistedDeliveryYearComplianceSourceEventV1;
}

const POSITIVE_EVENTS = Object.freeze([
  sourceEvent("INBOOKING_COMPLETED", "2027-02-01T10:00:00.000Z"),
  sourceEvent(
    "VERIFICATION_STATEMENT_POSSESSED",
    "2027-03-10T10:00:00.000Z",
  ),
  sourceEvent("STATEMENT_SUBMITTED_TO_NEA", "2027-04-10T10:00:00.000Z"),
  sourceEvent(
    "VERIFICATION_RESULT_REGISTERED_IN_REV",
    "2027-04-11T10:00:00.000Z",
  ),
]);
const FINDINGS_EVENTS = Object.freeze([
  sourceEvent("INBOOKING_COMPLETED", "2027-02-01T10:00:00.000Z"),
  sourceEvent("FINDINGS_REPORT_RECEIVED", "2027-03-10T10:00:00.000Z"),
]);

function rpcSuccess(
  events: readonly PersistedDeliveryYearComplianceSourceEventV1[],
): RpcData {
  return {
    ok: true,
    status: 200,
    code: "ok",
    delivery_year: 2026,
    source_events: events,
  };
}

function mockClient(
  rpc: (
    name: string,
    args: JsonObject,
  ) => Promise<{ data?: unknown; error?: unknown }>,
): ServiceClient {
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => ({}),
    rpc,
  };
}

function endpoint(
  data: RpcData,
  options: {
    now?: string;
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
    now: () => options.now ?? "2027-02-15T12:00:00.000Z",
  });
}

async function jsonResponse(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

async function endpointProof(): Promise<void> {
  const post = await endpoint(rpcSuccess([]))(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
      {
        method: "POST",
      },
    ),
  );
  assert(post.status === 405, "non_get_not_denied");
  q(1);

  let tenantRpcCalls = 0;
  const tenantFailure = new Response(
    JSON.stringify({ code: "service_unavailable" }),
    {
      status: 503,
    },
  );
  const tenantDenied = await endpoint(rpcSuccess([]), {
    tenantFailure,
    onRpc: () => tenantRpcCalls++,
  })(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
    ),
  );
  assert(
    tenantDenied === tenantFailure && tenantRpcCalls === 0,
    "tenant_gate_not_first",
  );
  q(2);

  const noAuth = await endpoint(rpcSuccess([]), { auth: false })(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
    ),
  );
  assert(noAuth.status === 401, "verified_auth_not_required");
  q(3);

  const beforeLead = await endpoint(rpcSuccess([]), {
    now: "2026-06-01T12:00:00.000Z",
  })(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
    ),
  );
  const beforeBody = await jsonResponse(
    beforeLead,
  ) as unknown as ComplianceWorklistResponseV1;
  assert(
    beforeLead.status === 200 && beforeBody.sourceEventCount === 0 &&
      beforeBody.evidenceStatus === "NO_ACCEPTED_SOURCE_FACTS_RECORDED" &&
      beforeBody.activeAttention.length === 0 &&
      beforeBody.milestones.length === 0,
    "zero_event_before_lead_invalid",
  );
  q(4);

  const insideLead = await endpoint(rpcSuccess([]), {
    now: "2027-02-15T12:00:00.000Z",
  })(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
    ),
  );
  const insideBody = await jsonResponse(
    insideLead,
  ) as unknown as ComplianceWorklistResponseV1;
  assert(
    insideBody.asOf === "2027-02-15T12:00:00.000Z" &&
      insideBody.activeAttention.some((item) =>
        item.actionKind === "INBOOKING_CUTOFF_ATTENTION"
      ),
    "zero_event_inside_lead_invalid",
  );
  q(5);

  let invalidRpcCalls = 0;
  for (
    const query of [
      "deliveryYear=2027",
      "deliveryYear=2026.0",
      "deliveryYear=2026&asOf=2027-01-01T00:00:00Z",
      "deliveryYear=2026&tenantId=other",
      "deliveryYear=2026&deliveryYear=2026",
      "",
    ]
  ) {
    const response = await endpoint(rpcSuccess([]), {
      onRpc: () => invalidRpcCalls++,
    })(new Request(`https://enval.local/api-app-compliance-worklist?${query}`));
    assert(
      response.status === 400 || response.status === 422,
      "invalid_query_allowed",
    );
  }
  assert(invalidRpcCalls === 0, "invalid_query_reached_database");
  q(6);

  for (
    const code of [
      "workforce_identity_missing",
      "workforce_identity_inactive",
      "seniority_not_authorized",
      "capability_not_authorized",
      "tenant_scope_denied",
    ]
  ) {
    const response = await endpoint({ ok: false, status: 403, code })(
      new Request(
        "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
      ),
    );
    const body = await jsonResponse(response);
    assert(
      response.status === 403 && body.code === code &&
        !JSON.stringify(body).includes("workforce_identity_id"),
      `unsafe_authorization_failure:${code}`,
    );
  }
  q(7);

  const positive = buildComplianceWorklistResponse(
    2026,
    "2027-05-02T12:00:00.000Z",
    POSITIVE_EVENTS,
  );
  assert(
    positive.ok && positive.value.sourceEventCount === 4 &&
      positive.value.activeAttention.length === 0 &&
      positive.value.milestones.some((item) =>
        item.actionKind === "YEAR_END_OPERATIONAL_ATTENTION"
      ),
    "positive_pipeline_invalid",
  );
  q(8);

  const findings = buildComplianceWorklistResponse(
    2026,
    "2027-04-02T12:00:00.000Z",
    FINDINGS_EVENTS,
  );
  assert(
    findings.ok &&
      findings.value.activeAttention.some((item) =>
        item.actionKind === "FINDINGS_REPORT_ATTENTION"
      ) &&
      !findings.value.activeAttention.some((item) =>
        item.actionKind === "STATEMENT_SUBMISSION_ATTENTION"
      ) &&
      findings.value.milestones.some((item) =>
        item.actionKind === "YEAR_END_OPERATIONAL_ATTENTION"
      ),
    "findings_pipeline_invalid",
  );
  q(9);

  const unknownVersion = sourceEvent(
    "INBOOKING_COMPLETED",
    "2027-02-01T10:00:00.000Z",
    {
      event_schema_version:
        "unknown-event-version" as PersistedDeliveryYearComplianceSourceEventV1[
          "event_schema_version"
        ],
    },
  );
  const invalid = buildComplianceWorklistResponse(
    2026,
    "2027-02-15T12:00:00.000Z",
    [unknownVersion],
  );
  const conflict = buildComplianceWorklistResponse(
    2026,
    "2027-02-15T12:00:00.000Z",
    [
      sourceEvent("INBOOKING_COMPLETED", "2027-02-01T10:00:00.000Z"),
      sourceEvent("INBOOKING_COMPLETED", "2027-02-02T10:00:00.000Z", {
        event_id: "proof:inbooking:conflict",
      }),
    ],
  );
  assert(!invalid.ok && !conflict.ok, "corrupt_or_conflicting_replay_allowed");
  q(10);

  const safeJson = JSON.stringify(positive.ok ? positive.value : {});
  for (
    const forbidden of [
      "evidence_sha256",
      "evidence_reference",
      "recorder_reference",
      "policyVersion",
      "leadTimeDays",
      "CURRENT_TENANT_DATA_PLANE",
      AUTH_ADMIN,
      HASH,
    ]
  ) assert(!safeJson.includes(forbidden), `unsafe_response_field:${forbidden}`);
  assert(
    !safeJson.includes("compliant") && !safeJson.includes("nothing_happened"),
    "external_reality_overclaimed",
  );
  q(11);

  const migration = await Deno.readTextFile(MIGRATION);
  assert(
    migration.includes("public.app_workforce_authorize_v1(") &&
      migration.includes("'compliance.delivery_year.view'") &&
      migration.includes("'CURRENT_TENANT_DATA_PLANE'") &&
      !migration.includes(
        "grant execute on function public.app_workforce_authorize_v1",
      ),
    "central_evaluator_not_hard_bound",
  );
  q(12);
  console.log("COMPLIANCE_WORKLIST_ENDPOINT=PASS");
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
  await psql(
    DATABASE,
    `
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
  `,
  );
  for (const path of MIGRATIONS) {
    await psql(DATABASE, await Deno.readTextFile(path));
  }
}

async function seedIdentity(
  authUserId: string,
  identityId: string,
): Promise<void> {
  await psql(
    DATABASE,
    `begin;
    insert into public.app_workforce_identities (
      id,auth_user_id,created_by_actor_ref,creation_decision_ref,request_id
    ) values (
      '${identityId}','${authUserId}','proof:reg03i','proof:reg03i',
      'identity:${identityId}'
    );
    insert into public.app_workforce_identity_states (
      workforce_identity_id,state,effective_at,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_state_id
    ) values (
      '${identityId}','active','2026-01-01T00:00:00Z','proof:reg03i',null,
      'proof:reg03i','state:${identityId}',null
    );
    insert into public.app_workforce_seniority_assignments (
      assignment_id,workforce_identity_id,seniority,effective_at,
      decision_ref,reason_ref,recorded_by_actor_ref,request_id,
      supersedes_seniority_assignment_id
    ) values (
      gen_random_uuid(),'${identityId}','reviewer','2026-01-01T00:00:00Z',
      'proof:reg03i',null,'proof:reg03i','seniority:${identityId}',null
    );
    commit;
  `,
  );
}

async function grantCapability(
  identityId: string,
  capability: string,
): Promise<void> {
  await psql(
    DATABASE,
    `
    insert into public.app_workforce_capability_assignments (
      assignment_id,workforce_identity_id,capability_code,event_type,
      effective_at,valid_until,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_assignment_event_id
    ) values (
      gen_random_uuid(),'${identityId}','${capability}','granted',
      '2026-01-02T00:00:00Z',null,'proof:reg03i',null,
      'proof:reg03i','capability:${identityId}:${capability}',null
    );
  `,
  );
}

async function readRpc(
  authUserId: string,
  fixtureSql = "",
): Promise<RpcData> {
  const output = await psql(
    DATABASE,
    `begin;
    ${fixtureSql}
    set local role service_role;
    select public.app_compliance_worklist_source_events_read_v1(
      '${authUserId}', 2026
    )::text;
    rollback;`,
  );
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "read_rpc_output_missing");
  return JSON.parse(line) as RpcData;
}

function fixtureInsert(
  events: readonly PersistedDeliveryYearComplianceSourceEventV1[],
): string {
  return events.map((event) => `
    insert into public.app_delivery_year_compliance_source_events (
      source_contract_version,event_schema_version,event_id,delivery_year,
      event_kind,occurred_at,regulated_actor_kind,recorded_at,recorder_kind,
      recorder_reference,provenance_kind,evidence_reference,evidence_sha256,
      evidence_version_id,verification_result_reference,statement_reference,
      findings_report_reference
    ) values (
      '${event.source_contract_version}','${event.event_schema_version}',
      '${event.event_id}',${event.delivery_year},'${event.event_kind}',
      '${event.occurred_at}','${event.regulated_actor_kind}',
      '${event.recorded_at}','${event.recorder_kind}',
      '${event.recorder_reference}','${event.provenance_kind}',
      '${event.evidence_reference}','${event.evidence_sha256}',null,
      ${
    event.verification_result_reference
      ? `'${event.verification_result_reference}'`
      : "null"
  },
      ${event.statement_reference ? `'${event.statement_reference}'` : "null"},
      ${
    event.findings_report_reference
      ? `'${event.findings_report_reference}'`
      : "null"
  }
    );`).join("\n");
}

async function databaseFingerprint(database: string): Promise<string> {
  return await psql(
    database,
    `begin read only; select concat_ws('|',
    (select count(*) from public.app_delivery_year_compliance_source_events),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys),
    (select count(*) from public.app_workforce_identities),
    (select count(*) from public.app_workforce_capability_assignments),
    (select count(*) from public.app_workforce_tenant_scope_assignments),
    (select count(*) from public.app_workforce_policy_versions),
    (select count(*) from public.app_customers),
    (select count(*) from public.app_cases),
    (select count(*) from public.app_signup_signature_evidence)
  ); rollback;`,
  );
}

async function databaseProof(): Promise<void> {
  await setupDatabase();
  const acl = await psql(
    DATABASE,
    `select concat_ws('|',
    has_function_privilege('service_role',
      'public.app_compliance_worklist_source_events_read_v1(uuid,integer)',
      'EXECUTE'),
    has_function_privilege('anon',
      'public.app_compliance_worklist_source_events_read_v1(uuid,integer)',
      'EXECUTE'),
    has_function_privilege('authenticated',
      'public.app_compliance_worklist_source_events_read_v1(uuid,integer)',
      'EXECUTE'),
    has_function_privilege('service_role',
      'public.app_workforce_authorize_v1(uuid,text,text,uuid,uuid,timestamptz)',
      'EXECUTE'),
    has_table_privilege('authenticated',
      'public.app_delivery_year_compliance_source_events','SELECT')
  );`,
  );
  assert(acl === "t|f|f|f|f", `rpc_acl_invalid:${acl}`);
  q(13);

  await psql(
    DATABASE,
    `insert into auth.users (
      id,email,email_confirmed_at,created_at,updated_at
    ) values
      ('${AUTH_ADMIN}','admin@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_REVIEWER}','reviewer@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NON_WORKFORCE}','outside@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_RECORD_ONLY}','record@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NO_SCOPE}','noscope@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_LOCATION_ONLY}','location@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_SUSPENDED}','suspended@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());`,
  );
  const bootstrap = await psql(
    DATABASE,
    `select
    public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','bootstrap:reg03i','bootstrap-reg03i',
      '${HASH}','${EXPIRES}','decision:reg03i-bootstrap'
    )->>'ok';`,
  );
  assert(bootstrap === "true", "admin_bootstrap_failed");

  const identities = [
    [AUTH_REVIEWER, "d1000000-0000-4000-8000-000000000002"],
    [AUTH_RECORD_ONLY, "d1000000-0000-4000-8000-000000000004"],
    [AUTH_NO_SCOPE, "d1000000-0000-4000-8000-000000000005"],
    [AUTH_LOCATION_ONLY, "d1000000-0000-4000-8000-000000000006"],
    [AUTH_SUSPENDED, "d1000000-0000-4000-8000-000000000007"],
  ] as const;
  for (const [auth, identity] of identities) {
    await seedIdentity(auth, identity);
  }
  await psql(
    DATABASE,
    `select public.app_workforce_reconcile_capabilities_v1(
    'd1000000-0000-4000-8000-000000000002',clock_timestamp(),
    'proof:reg03i','proof:reviewer','reconcile:reviewer'
  );`,
  );
  await grantCapability(
    "d1000000-0000-4000-8000-000000000004",
    "compliance.delivery_year.record",
  );
  await grantCapability(
    "d1000000-0000-4000-8000-000000000005",
    "compliance.delivery_year.view",
  );
  await grantCapability(
    "d1000000-0000-4000-8000-000000000006",
    "location.root.create",
  );
  await grantCapability(
    "d1000000-0000-4000-8000-000000000007",
    "compliance.delivery_year.view",
  );
  await psql(
    DATABASE,
    `insert into public.app_workforce_identity_states (
      workforce_identity_id,state,effective_at,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_state_id
    ) select workforce_identity_id,'suspended','2026-01-03T00:00:00Z',
      'proof:reg03i','proof_suspension','proof:reg03i','state:suspended',id
    from public.app_workforce_identity_states
    where workforce_identity_id='d1000000-0000-4000-8000-000000000007'
      and supersedes_state_id is null;`,
  );
  await psql(
    DATABASE,
    `insert into public.app_workforce_tenant_scope_assignments (
      scope_assignment_id,workforce_identity_id,capability_assignment_id,
      capability_code,scope_kind,tenant_scope_ref,event_type,effective_at,
      valid_until,decision_ref,reason_ref,recorded_by_actor_ref,request_id,
      supersedes_scope_event_id
    ) select scope_assignment_id,workforce_identity_id,capability_assignment_id,
      capability_code,scope_kind,tenant_scope_ref,'revoked',clock_timestamp(),
      null,'proof:reg03i','scope_removed','proof:reg03i','scope:noscope:revoke',id
    from public.app_workforce_tenant_scope_assignments
    where workforce_identity_id='d1000000-0000-4000-8000-000000000005'
      and capability_code='compliance.delivery_year.view'
      and event_type='granted';`,
  );
  await psql(
    DATABASE,
    `insert into public.app_customers (id,customer_type)
      values ('e1000000-0000-4000-8000-000000000001','particulier');
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      'e2000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000001','REG03ICASE',
      clock_timestamp(),'system','proof:reg03i','proof','reg03i-case',
      'reg03i-case'
    );
    insert into public.app_workforce_scope_assignments (
      scope_assignment_id,workforce_identity_id,capability_assignment_id,
      capability_code,case_id,location_id,case_location_relation_id,
      event_type,effective_at,valid_until,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_scope_event_id
    ) select gen_random_uuid(),assignment.workforce_identity_id,assignment.id,
      assignment.capability_code,'e2000000-0000-4000-8000-000000000001',
      null,null,'granted','2026-01-02T00:01:00Z',null,'proof:reg03i',null,
      'proof:reg03i','scope:location-only',null
    from public.app_workforce_capability_assignments assignment
    where assignment.workforce_identity_id=
      'd1000000-0000-4000-8000-000000000006'
      and assignment.capability_code='location.root.create'
      and assignment.event_type='granted';`,
  );

  const before = await databaseFingerprint(DATABASE);
  const allowed = await readRpc(AUTH_REVIEWER);
  assert(
    allowed.ok === true && Array.isArray(allowed.source_events) &&
      allowed.source_events.length === 0,
    "authorized_zero_read_failed",
  );
  q(14);

  const denials = await Promise.all([
    readRpc(AUTH_NON_WORKFORCE),
    readRpc(AUTH_RECORD_ONLY),
    readRpc(AUTH_NO_SCOPE),
    readRpc(AUTH_LOCATION_ONLY),
    readRpc(AUTH_SUSPENDED),
  ]);
  assert(
    denials.map((value) => value.code).join("|") ===
      "workforce_identity_missing|capability_not_authorized|tenant_scope_denied|capability_not_authorized|workforce_identity_inactive",
    `authorization_denials_invalid:${
      denials.map((value) => value.code).join("|")
    }`,
  );
  q(15);

  const positiveData = await readRpc(
    AUTH_REVIEWER,
    fixtureInsert(POSITIVE_EVENTS),
  );
  const positiveResponse = await endpoint(positiveData, {
    now: "2027-05-02T12:00:00.000Z",
  })(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
    ),
  );
  const positiveBody = await jsonResponse(
    positiveResponse,
  ) as unknown as ComplianceWorklistResponseV1;
  assert(
    positiveResponse.status === 200 && positiveBody.sourceEventCount === 4 &&
      positiveBody.activeAttention.length === 0 &&
      positiveBody.milestones.length === 1,
    "local_positive_endpoint_failed",
  );
  q(16);

  const findingsData = await readRpc(
    AUTH_REVIEWER,
    fixtureInsert(FINDINGS_EVENTS),
  );
  const findingsResponse = await endpoint(findingsData, {
    now: "2027-04-02T12:00:00.000Z",
  })(
    new Request(
      "https://enval.local/api-app-compliance-worklist?deliveryYear=2026",
    ),
  );
  const findingsBody = await jsonResponse(
    findingsResponse,
  ) as unknown as ComplianceWorklistResponseV1;
  assert(
    findingsResponse.status === 200 && findingsBody.sourceEventCount === 2 &&
      findingsBody.activeAttention.some((item) =>
        item.actionKind === "FINDINGS_REPORT_ATTENTION"
      ) && findingsBody.milestones.length === 1,
    "local_findings_endpoint_failed",
  );
  q(17);

  const after = await databaseFingerprint(DATABASE);
  assert(before === after, "read_rpc_changed_database_state");
  assert(
    await psql(
      DATABASE,
      "select count(*) from public.app_delivery_year_compliance_source_events;",
    ) === "0",
    "persistent_fixture_left",
  );
  q(18);

  const activeReady = await psql(
    ACTIVE_DATABASE,
    `begin read only;
    with current_state as (
      select distinct on (workforce_identity_id) workforce_identity_id,state
      from public.app_workforce_identity_states
      where effective_at <= clock_timestamp()
      order by workforce_identity_id,effective_at desc,recorded_at desc
    ), current_seniority as (
      select distinct on (workforce_identity_id) workforce_identity_id,seniority
      from public.app_workforce_seniority_assignments
      where effective_at <= clock_timestamp()
      order by workforce_identity_id,effective_at desc,recorded_at desc
    ), active_admin as (
      select identity.auth_user_id
      from public.app_workforce_identities identity
      join current_state state on state.workforce_identity_id=identity.id
        and state.state='active'
      join current_seniority seniority
        on seniority.workforce_identity_id=identity.id
        and seniority.seniority='admin'
    ) select count(*) || '|' || count(*) filter (where (
      public.app_compliance_worklist_source_events_read_v1(
        auth_user_id,2026
      )->>'ok')::boolean)
    from active_admin; rollback;`,
  );
  assert(activeReady === "1|1", `active_first_admin_not_ready:${activeReady}`);
  q(19);

  const functionDefinition = await psql(
    DATABASE,
    `select
    pg_get_functiondef(
      'public.app_compliance_worklist_source_events_read_v1(uuid,integer)'::regprocedure
    );`,
  );
  assert(
    functionDefinition.includes("app_workforce_authorize_v1") &&
      !/\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b/i.test(
        functionDefinition,
      ),
    "rpc_not_read_only_or_parallel_evaluator",
  );
  q(20);
  console.log("COMPLIANCE_WORKLIST_READ_Q01_Q20=PASS");
  console.log("PRIVATE_AUTHORIZED_READ_RPC=PASS");
  console.log("DATABASE_WRITES_ON_GET=0");
  console.log("FIRST_ADMIN_WORKLIST_VIEW_READY=YES");
  console.log("PERSISTENT_TEST_FIXTURES_LEFT=NO");
  console.log("DETERMINISTIC_ENDPOINT_CHECK=PASS");
}

const endpointOnly = Deno.args.includes("--endpoint-only");
let activeBefore: string | null = null;
try {
  await endpointProof();
  if (!endpointOnly) {
    activeBefore = await databaseFingerprint(ACTIVE_DATABASE);
    await databaseProof();
  }
} catch (error) {
  console.error(
    `COMPLIANCE_WORKLIST_READ=FAIL\n${
      scrub(error instanceof Error ? error.message : String(error))
    }`,
  );
  Deno.exitCode = 1;
} finally {
  if (!endpointOnly) {
    try {
      await dropDatabase();
      const activeAfter = await databaseFingerprint(ACTIVE_DATABASE);
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
