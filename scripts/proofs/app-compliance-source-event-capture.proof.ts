import {
  type CaptureHandlerDependencies,
  createHandler,
  normalizeComplianceCaptureRequest,
} from "../../supabase/functions/api-app-compliance-source-event/index.ts";
import {
  applyDeliveryYearComplianceEvent,
  createInitialDeliveryYearComplianceStateV1,
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  type DeliveryYearComplianceEventV1,
} from "../../platform/runtime/compliance/delivery_year_compliance.ts";
import {
  buildComplianceActionPlan,
  ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
} from "../../platform/runtime/compliance/compliance_action_plan.ts";
import {
  projectComplianceWorklist,
} from "../../platform/runtime/compliance/compliance_worklist.ts";
import {
  mapComplianceSourceEventToReg02,
} from "../../platform/runtime/compliance/delivery_year_compliance_source_event.ts";

const CONTAINER = "supabase_db_enval";
const ACTIVE_DATABASE = "postgres";
const DATABASE = `enval_reg03h_proof_${
  crypto.randomUUID().replaceAll("-", "")
}`;
const MIGRATIONS = [
  "supabase/migrations/20260816150000_app_current_baseline.sql",
  "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql",
  "supabase/migrations/20260817120000_app_compliance_workforce_view.sql",
  "supabase/migrations/20260817160000_app_compliance_source_event_ledger.sql",
  "supabase/migrations/20260817190000_app_compliance_source_event_capture.sql",
] as const;

const AUTH_ADMIN = "a8000000-0000-4000-8000-000000000001";
const AUTH_REVIEWER = "a8000000-0000-4000-8000-000000000002";
const AUTH_MEMBER = "a8000000-0000-4000-8000-000000000003";
const AUTH_NO_CAP = "a8000000-0000-4000-8000-000000000004";
const AUTH_NO_SCOPE = "a8000000-0000-4000-8000-000000000005";
const AUTH_RECORD_ONLY = "a8000000-0000-4000-8000-000000000006";
const AUTH_NON_WORKFORCE = "a8000000-0000-4000-8000-000000000007";
const EVIDENCE_VERSION = "a9000000-0000-4000-8000-000000000001";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const HASH_E = "e".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

type CommandResult = { code: number; stdout: string; stderr: string };
type Json = Record<string, unknown>;

class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

function q(value: number): void {
  console.log(`REG03H-Q${String(value).padStart(2, "0")}: PASS`);
}

function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/postgres(?:ql)?:\/\/\S+/gi, "[database]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 400);
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
  const result = await child.output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
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

async function psqlResult(
  database: string,
  sql: string,
): Promise<CommandResult> {
  return await command("docker", [
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

async function psql(database: string, sql: string): Promise<string> {
  const result = await psqlResult(database, sql);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}

async function dropDatabase(database: string): Promise<void> {
  await must("docker", [
    "exec",
    CONTAINER,
    "dropdb",
    "-U",
    "postgres",
    "--force",
    "--if-exists",
    database,
  ]);
}

async function activeFingerprint(): Promise<string> {
  return await psql(
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
    )
    select concat_ws('|',
      (select count(*) from supabase_migrations.schema_migrations),
      (select count(*) from public.app_workforce_capability_catalog),
      (select count(*) from public.app_delivery_year_compliance_source_events),
      (select count(*) from public.app_workforce_identities identity
        join current_state state on state.workforce_identity_id=identity.id
          and state.state='active'
        join current_seniority seniority
          on seniority.workforce_identity_id=identity.id
          and seniority.seniority='admin'),
      (select count(*) from public.app_audit_events),
      (select count(*) from public.app_idempotency_keys)
    ); rollback;`,
  );
}

function body(overrides: Json = {}): Json {
  return {
    deliveryYear: 2026,
    eventKind: "INBOOKING_COMPLETED",
    occurredAt: "2026-01-01T10:00:00Z",
    evidenceSha256: HASH_A,
    evidenceVersionId: null,
    evidenceVersionNumber: null,
    externalReference: "rev:inbooking:2026",
    verificationResultReference: null,
    statementReference: null,
    findingsReportReference: null,
    ...overrides,
  };
}

function request(payload: Json, key = "reg03h-endpoint-key"): Request {
  return new Request("https://enval.local/api-app-compliance-source-event", {
    method: "POST",
    headers: {
      authorization: "Bearer proof-token",
      "content-type": "application/json",
      "idempotency-key": key,
    },
    body: JSON.stringify(payload),
  });
}

async function endpointProof(): Promise<void> {
  const calls: Array<{ name: string; args: Json }> = [];
  let serviceCreates = 0;
  let authChecks = 0;
  const serviceClient = {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (_table: string) => ({}),
    rpc: async (name: string, args: Json) => {
      calls.push({ name, args });
      return {
        data: {
          ok: true,
          status: 201,
          code: "ok",
          source_event_id: "ab000000-0000-4000-8000-000000000001",
          delivery_year: 2026,
          event_kind: "INBOOKING_COMPLETED",
          occurred_at: "2026-01-01T10:00:00Z",
          recorded_at: "2026-08-17T10:00:00Z",
          idempotency_status: "recorded",
          policy_version_id: "must-not-leak",
          actor_ref: "must-not-leak",
        },
      };
    },
  };
  const dependencies: Partial<CaptureHandlerDependencies> = {
    createServiceClient: () => {
      serviceCreates += 1;
      return serviceClient;
    },
    idempotencyExpiresAt: () => EXPIRES,
    requestMeta: async (req) => ({
      request_id: req.headers.get("x-request-id") || "reg03h-request",
      idempotency_key: req.headers.get("idempotency-key"),
      ip_hash: null,
      user_agent_hash: null,
      method: req.method,
      path: "/api-app-compliance-source-event",
      url: req.url,
      origin: null,
      timestamp: "2026-08-17T10:00:00Z",
      environment: "local",
    }),
    hashPayload: async () => HASH_A,
    verifyBearer: async () => {
      authChecks += 1;
      return {
        ok: true,
        context: {
          authUserId: AUTH_REVIEWER,
          emailNormalized: "proof@example.invalid",
        },
      };
    },
  };
  const handler = createHandler(dependencies);
  const response = await handler(request(body()));
  const responseBody = await response.json() as Json;
  assert(
    response.status === 201 && calls.length === 1 &&
      calls[0].name === "app_compliance_source_event_capture_v1" &&
      (calls[0].args.p_payload as Json).event_kind ===
        "INBOOKING_COMPLETED" &&
      !(calls[0].args.p_payload as Json).regulated_actor_kind &&
      Object.keys(responseBody).sort().join("|") ===
        "deliveryYear|eventKind|idempotencyStatus|occurredAt|ok|recordedAt|sourceEventId" &&
      !JSON.stringify(responseBody).includes("must-not-leak"),
    "endpoint_safe_contract_failed",
  );

  const unknown = await handler(request({ ...body(), tenantId: "other" }));
  assert(
    unknown.status === 400 && calls.length === 1,
    "browser_target_accepted",
  );
  const actor = await handler(
    request({ ...body(), regulatedActor: "VERIFIER" }),
  );
  assert(actor.status === 400 && calls.length === 1, "actor_override_accepted");

  const noAuthHandler = createHandler({
    ...dependencies,
    verifyBearer: async () => ({
      ok: false,
      status: 401,
      code: "missing_authorization",
      message: "Niet geautoriseerd.",
    }),
  });
  const noAuth = await noAuthHandler(request(body()));
  assert(
    noAuth.status === 401 && calls.length === 1,
    "missing_auth_reached_rpc",
  );

  const gateHandler = createHandler({
    ...dependencies,
    requestMeta: async () =>
      new Response(JSON.stringify({ ok: false, code: "service_unavailable" }), {
        status: 503,
      }),
  });
  const createsBeforeGate = serviceCreates;
  const authBeforeGate = authChecks;
  const gated = await gateHandler(request(body()));
  assert(
    gated.status === 503 && serviceCreates === createsBeforeGate &&
      authChecks === authBeforeGate && calls.length === 1,
    "tenant_gate_not_first",
  );
  assert(
    normalizeComplianceCaptureRequest(body()) !== null,
    "valid_body_rejected",
  );
  q(1);
}

function json(value: Json): string {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

async function capture(
  authUserId: string | null,
  key: string,
  payloadHash: string,
  payload: Json,
): Promise<Json> {
  const auth = authUserId === null ? "null" : `'${authUserId}'::uuid`;
  const output = await psql(
    DATABASE,
    `select public.app_compliance_source_event_capture_v1(
      ${auth}, 'request:${key}', '${key}', '${payloadHash}',
      '${EXPIRES}', ${json(payload)}
    )::text;`,
  );
  return JSON.parse(output) as Json;
}

function dbPayload(overrides: Json = {}): Json {
  return {
    delivery_year: 2026,
    event_kind: "INBOOKING_COMPLETED",
    occurred_at: "2026-01-01T10:00:00Z",
    evidence_sha256: HASH_A,
    evidence_version_id: null,
    evidence_version_number: null,
    external_reference: "rev:inbooking:2026",
    verification_result_reference: null,
    statement_reference: null,
    findings_report_reference: null,
    ...overrides,
  };
}

async function authorize(
  authUserId: string,
  capability: string,
  tenantScope: string | null,
): Promise<Json> {
  const scope = tenantScope === null ? "null" : `'${tenantScope}'`;
  const output = await psql(
    DATABASE,
    `select public.app_workforce_authorize_v1(
    '${authUserId}', '${capability}', ${scope}, null, null,
    clock_timestamp()
  )::text;`,
  );
  return JSON.parse(output) as Json;
}

async function seedIdentity(
  authUserId: string,
  identityId: string,
  seniority: "member" | "reviewer",
  suffix: string,
): Promise<void> {
  await psql(
    DATABASE,
    `begin;
    insert into public.app_workforce_identities (
      id,auth_user_id,created_by_actor_ref,creation_decision_ref,request_id
    ) values (
      '${identityId}','${authUserId}','proof:reg03h','proof:reg03h',
      'identity:${suffix}'
    );
    insert into public.app_workforce_identity_states (
      workforce_identity_id,state,effective_at,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_state_id
    ) values (
      '${identityId}','active','2026-01-01T00:00:00Z','proof:reg03h',null,
      'proof:reg03h','state:${suffix}',null
    );
    insert into public.app_workforce_seniority_assignments (
      assignment_id,workforce_identity_id,seniority,effective_at,
      decision_ref,reason_ref,recorded_by_actor_ref,request_id,
      supersedes_seniority_assignment_id
    ) values (
      gen_random_uuid(),'${identityId}','${seniority}',
      '2026-01-01T00:00:00Z','proof:reg03h',null,'proof:reg03h',
      'seniority:${suffix}',null
    );
    commit;`,
  );
}

async function grantCapability(
  identityId: string,
  capability: string,
  suffix: string,
): Promise<void> {
  await psql(
    DATABASE,
    `insert into public.app_workforce_capability_assignments (
    assignment_id,workforce_identity_id,capability_code,event_type,
    effective_at,valid_until,decision_ref,reason_ref,
    recorded_by_actor_ref,request_id,supersedes_assignment_event_id
  ) values (
    gen_random_uuid(),'${identityId}','${capability}','granted',
    '2026-01-02T00:00:00Z',null,'proof:reg03h',null,
    'proof:reg03h','capability:${suffix}',null
  );`,
  );
}

async function databaseProof(): Promise<void> {
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
    `create schema extensions;
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
    );`,
  );
  for (const path of MIGRATIONS) {
    await psql(DATABASE, await Deno.readTextFile(path));
  }

  const catalogue = await psql(
    DATABASE,
    `select count(*) || '|' ||
    string_agg(capability_code,',' order by capability_code)
    from public.app_workforce_capability_catalog;`,
  );
  assert(
    catalogue ===
      "11|case.assignment.manage,compliance.delivery_year.record," +
        "compliance.delivery_year.view,location.observation.record," +
        "location.root.create,location.version.accept.approve," +
        "location.version.accept.prepare,location.version.correct.approve," +
        "location.version.correct.prepare,workforce.member.manage," +
        "workforce.policy.manage",
    `capability_catalogue_invalid:${catalogue}`,
  );
  const defaultRequirement = await psql(
    DATABASE,
    `select
    policy.policy_ref || '|' || requirement.minimum_seniority || '|' ||
    (select count(*) from public.app_workforce_policy_requirements all_req
      where all_req.policy_version_id=policy.id)
    from public.app_workforce_policy_activations activation
    join public.app_workforce_policy_versions policy
      on policy.id=activation.policy_version_id
    join public.app_workforce_policy_requirements requirement
      on requirement.policy_version_id=policy.id
      and requirement.capability_code='compliance.delivery_year.record'
    order by activation.effective_at desc,activation.recorded_at desc limit 1;`,
  );
  assert(
    defaultRequirement === "enval_default_v3|reviewer|11",
    "default_policy_invalid",
  );
  q(2);

  const security = await psql(
    DATABASE,
    `select (
    not has_table_privilege(
      'service_role','public.app_delivery_year_compliance_source_events','INSERT'
    ) and not has_table_privilege(
      'authenticated','public.app_delivery_year_compliance_source_events','INSERT'
    ) and not has_function_privilege(
      'authenticated',
      'public.app_compliance_source_event_capture_v1(uuid,text,text,text,timestamptz,jsonb)',
      'EXECUTE'
    ) and has_function_privilege(
      'service_role',
      'public.app_compliance_source_event_capture_v1(uuid,text,text,text,timestamptz,jsonb)',
      'EXECUTE'
    )
  )::text;`,
  );
  assert(security === "true", "capture_acl_invalid");
  q(3);

  await psql(
    DATABASE,
    `insert into auth.users (
    id,email,email_confirmed_at,created_at,updated_at
  ) values
    ('${AUTH_ADMIN}','admin@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
    ('${AUTH_REVIEWER}','reviewer@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
    ('${AUTH_MEMBER}','member@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
    ('${AUTH_NO_CAP}','nocap@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
    ('${AUTH_NO_SCOPE}','noscope@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
    ('${AUTH_RECORD_ONLY}','record@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
    ('${AUTH_NON_WORKFORCE}','external@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());`,
  );
  const bootstrapped = await psql(
    DATABASE,
    `select
    public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','bootstrap:reg03h',
      'bootstrap-key-reg03h','${HASH_A}','${EXPIRES}',
      'decision:reg03h-bootstrap'
    )->>'ok';`,
  );
  assert(bootstrapped === "true", "admin_bootstrap_failed");

  const reviewerIdentity = "b8000000-0000-4000-8000-000000000002";
  const memberIdentity = "b8000000-0000-4000-8000-000000000003";
  const noCapIdentity = "b8000000-0000-4000-8000-000000000004";
  const noScopeIdentity = "b8000000-0000-4000-8000-000000000005";
  const recordOnlyIdentity = "b8000000-0000-4000-8000-000000000006";
  await seedIdentity(AUTH_REVIEWER, reviewerIdentity, "reviewer", "reviewer");
  await seedIdentity(AUTH_MEMBER, memberIdentity, "member", "member");
  await seedIdentity(AUTH_NO_CAP, noCapIdentity, "reviewer", "nocap");
  await seedIdentity(AUTH_NO_SCOPE, noScopeIdentity, "reviewer", "noscope");
  await seedIdentity(
    AUTH_RECORD_ONLY,
    recordOnlyIdentity,
    "reviewer",
    "recordonly",
  );
  await psql(
    DATABASE,
    `select public.app_workforce_reconcile_capabilities_v1(
    '${reviewerIdentity}',clock_timestamp(),'proof:reg03h',
    'proof:reviewer-reconcile','reconcile:reviewer'
  );`,
  );
  await grantCapability(
    memberIdentity,
    "compliance.delivery_year.record",
    "member-record",
  );
  await grantCapability(
    noCapIdentity,
    "compliance.delivery_year.view",
    "nocap-view",
  );
  await grantCapability(
    noScopeIdentity,
    "compliance.delivery_year.record",
    "noscope-record",
  );
  await grantCapability(
    recordOnlyIdentity,
    "compliance.delivery_year.record",
    "recordonly-record",
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
    null,'proof:reg03h','scope_removed','proof:reg03h','scope:noscope:revoke',id
  from public.app_workforce_tenant_scope_assignments
  where workforce_identity_id='${noScopeIdentity}'
    and capability_code='compliance.delivery_year.record'
    and event_type='granted';`,
  );

  const unauthenticated = await capture(null, "unauth", HASH_A, dbPayload());
  const nonWorkforce = await capture(
    AUTH_NON_WORKFORCE,
    "nonworkforce",
    HASH_A,
    dbPayload(),
  );
  const noCapability = await capture(AUTH_NO_CAP, "nocap", HASH_A, dbPayload());
  const noScope = await capture(AUTH_NO_SCOPE, "noscope", HASH_A, dbPayload());
  assert(
    unauthenticated.ok === false &&
      nonWorkforce.code === "workforce_identity_missing" &&
      noCapability.code === "capability_not_authorized" &&
      noScope.code === "tenant_scope_denied",
    "authorization_denials_invalid",
  );
  const wrongTenant = await authorize(
    AUTH_REVIEWER,
    "compliance.delivery_year.record",
    "OTHER_TENANT_DATA_PLANE",
  );
  const missingTenant = await authorize(
    AUTH_REVIEWER,
    "compliance.delivery_year.record",
    null,
  );
  assert(
    wrongTenant.code === "tenant_scope_denied" &&
      missingTenant.code === "tenant_scope_denied",
    "tenant_scope_not_explicit",
  );
  q(4);

  const memberDefault = await authorize(
    AUTH_MEMBER,
    "compliance.delivery_year.record",
    "CURRENT_TENANT_DATA_PLANE",
  );
  const reviewerAllowed = await authorize(
    AUTH_REVIEWER,
    "compliance.delivery_year.record",
    "CURRENT_TENANT_DATA_PLANE",
  );
  const adminAllowed = await authorize(
    AUTH_ADMIN,
    "compliance.delivery_year.record",
    "CURRENT_TENANT_DATA_PLANE",
  );
  const viewOnlyRecord = await authorize(
    AUTH_NO_CAP,
    "compliance.delivery_year.record",
    "CURRENT_TENANT_DATA_PLANE",
  );
  const recordOnlyLocation = await psql(
    DATABASE,
    `select
    public.app_workforce_authorize_v1(
      '${AUTH_RECORD_ONLY}','location.root.create',
      'b9000000-0000-4000-8000-000000000001',null,clock_timestamp()
    )->>'code';`,
  );
  assert(
    memberDefault.code === "seniority_not_authorized" &&
      reviewerAllowed.ok === true && adminAllowed.ok === true &&
      viewOnlyRecord.code === "capability_not_authorized" &&
      recordOnlyLocation === "capability_not_authorized",
    "capability_or_seniority_isolation_failed",
  );
  q(5);

  const lowerPolicy = {
    "case.assignment.manage": "admin",
    "compliance.delivery_year.record": "member",
    "compliance.delivery_year.view": "reviewer",
    "location.observation.record": "member",
    "location.root.create": "member",
    "location.version.accept.approve": "reviewer",
    "location.version.accept.prepare": "member",
    "location.version.correct.approve": "reviewer",
    "location.version.correct.prepare": "member",
    "workforce.member.manage": "admin",
    "workforce.policy.manage": "admin",
  };
  const createdPolicy = JSON.parse(
    await psql(
      DATABASE,
      `select
    public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:member:create','policy-member-create','${HASH_B}',
      '${EXPIRES}','create',null,'proof_member_record_v1',true,
      ${json(lowerPolicy)},null,'proof:member-record'
    )::text;`,
    ),
  ) as Json;
  assert(createdPolicy.ok === true, "member_policy_create_failed");
  const policyId = String(createdPolicy.policy_version_id);
  const activatedPolicy = JSON.parse(
    await psql(
      DATABASE,
      `select
    public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:member:activate','policy-member-activate','${HASH_C}',
      '${EXPIRES}','activate','${policyId}',null,null,null,
      clock_timestamp(),'proof:member-record'
    )::text;`,
    ),
  ) as Json;
  const memberVariant = await authorize(
    AUTH_MEMBER,
    "compliance.delivery_year.record",
    "CURRENT_TENANT_DATA_PLANE",
  );
  const unrelatedFloor = await psql(
    DATABASE,
    `select
    public.app_workforce_authorize_v1(
      '${AUTH_MEMBER}','workforce.member.manage',null,null,clock_timestamp()
    )->>'code';`,
  );
  assert(
    activatedPolicy.ok === true && memberVariant.ok === true &&
      unrelatedFloor === "seniority_not_authorized",
    "member_policy_variant_or_floor_failed",
  );
  q(6);

  await psql(
    DATABASE,
    `alter table public.app_evidence_versions
      drop constraint app_evidence_versions_evidence_file_id_fkey;
    alter table public.app_evidence_versions
      drop constraint app_evidence_versions_source_intake_file_id_fkey;
    insert into public.app_evidence_versions (
      id,evidence_file_id,version_number,source_intake_file_id,
      storage_bucket,storage_path,detected_mime_type,size_bytes,sha256,status,
      source_confirmed_at,created_at,request_id,idempotency_key
    ) values (
      '${EVIDENCE_VERSION}',gen_random_uuid(),1,gen_random_uuid(),
      'private-evidence','proof/reg03h','application/pdf',128,'${HASH_B}',
      'confirmed_awaiting_review','2026-01-01T00:00:00Z',
      '2026-01-01T00:00:00Z','evidence:proof','evidence-proof-key'
    );`,
  );

  const captures = [
    ["inbooking", HASH_A, dbPayload()],
    [
      "statement",
      HASH_B,
      dbPayload({
        event_kind: "VERIFICATION_STATEMENT_POSSESSED",
        occurred_at: "2026-01-02T10:00:00Z",
        evidence_sha256: HASH_B,
        evidence_version_id: EVIDENCE_VERSION,
        evidence_version_number: 1,
        external_reference: null,
        verification_result_reference: "verification-result:2026:positive",
        statement_reference: "statement:2026:001",
      }),
    ],
    [
      "submission",
      HASH_C,
      dbPayload({
        event_kind: "STATEMENT_SUBMITTED_TO_NEA",
        occurred_at: "2026-01-03T10:00:00Z",
        evidence_sha256: HASH_C,
        external_reference: "nea:submission:2026",
        statement_reference: "statement:2026:001",
      }),
    ],
    [
      "rev",
      HASH_D,
      dbPayload({
        event_kind: "VERIFICATION_RESULT_REGISTERED_IN_REV",
        occurred_at: "2026-01-04T10:00:00Z",
        evidence_sha256: HASH_D,
        external_reference: "rev:verification:2026",
        verification_result_reference: "verification-result:2026:positive",
      }),
    ],
    [
      "findings",
      HASH_B,
      dbPayload({
        delivery_year: 2027,
        event_kind: "FINDINGS_REPORT_RECEIVED",
        occurred_at: "2026-02-01T10:00:00Z",
        evidence_sha256: HASH_B,
        evidence_version_id: EVIDENCE_VERSION,
        evidence_version_number: 1,
        external_reference: null,
        verification_result_reference: "verification-result:2027:findings",
        findings_report_reference: "findings:2027:001",
      }),
    ],
  ] as const;
  for (const [key, hash, payload] of captures) {
    const result = await capture(AUTH_REVIEWER, key, hash, payload);
    assert(result.ok === true, `valid_capture_failed:${key}:${result.code}`);
  }
  const kinds = await psql(
    DATABASE,
    `select count(distinct event_kind) || '|' ||
    string_agg(distinct event_kind,',' order by event_kind)
    from public.app_delivery_year_compliance_source_events;`,
  );
  assert(
    kinds === "5|FINDINGS_REPORT_RECEIVED,INBOOKING_COMPLETED," +
        "STATEMENT_SUBMITTED_TO_NEA,VERIFICATION_RESULT_REGISTERED_IN_REV," +
        "VERIFICATION_STATEMENT_POSSESSED",
    "five_event_capture_incomplete",
  );
  q(7);

  const badProvenance = await capture(
    AUTH_REVIEWER,
    "badprov",
    HASH_E,
    dbPayload({
      delivery_year: 2028,
      event_kind: "VERIFICATION_STATEMENT_POSSESSED",
      evidence_sha256: HASH_E,
      evidence_version_id: null,
      evidence_version_number: null,
      external_reference: "internal:workflow:ready",
      verification_result_reference: "verification-result:2028:positive",
      statement_reference: "statement:2028:001",
    }),
  );
  const badEvidenceHash = await capture(
    AUTH_REVIEWER,
    "badhash",
    HASH_E,
    dbPayload({
      delivery_year: 2028,
      event_kind: "FINDINGS_REPORT_RECEIVED",
      evidence_sha256: HASH_E,
      evidence_version_id: EVIDENCE_VERSION,
      evidence_version_number: 1,
      external_reference: null,
      verification_result_reference: "verification-result:2028:findings",
      findings_report_reference: "findings:2028:001",
    }),
  );
  const unknownField = await capture(AUTH_REVIEWER, "unknown", HASH_A, {
    ...dbPayload({ delivery_year: 2028 }),
    regulated_actor_kind: "VERIFIER",
  });
  assert(
    badProvenance.code === "provenance_rejected" &&
      badEvidenceHash.code === "evidence_mismatch" &&
      unknownField.code === "invalid_input",
    "provenance_or_actor_override_not_closed",
  );
  q(8);

  const retryPayload = dbPayload({
    delivery_year: 2029,
    external_reference: "rev:inbooking:2029",
  });
  const retryA = await capture(AUTH_REVIEWER, "retry", HASH_A, retryPayload);
  const retryB = await capture(AUTH_REVIEWER, "retry", HASH_A, retryPayload);
  const conflictingRetry = await capture(
    AUTH_REVIEWER,
    "retry",
    HASH_C,
    { ...retryPayload, external_reference: "rev:inbooking:2029:other" },
  );
  assert(
    retryA.ok === true && JSON.stringify(retryA) === JSON.stringify(retryB) &&
      conflictingRetry.code === "idempotency_conflict" &&
      await psql(
          DATABASE,
          `select count(*) from
        public.app_delivery_year_compliance_source_events
        where delivery_year=2029 and event_kind='INBOOKING_COMPLETED';`,
        ) === "1",
    "idempotency_contract_failed",
  );
  q(9);

  const positive2030 = await capture(
    AUTH_REVIEWER,
    "positive2030",
    HASH_B,
    dbPayload({
      delivery_year: 2030,
      event_kind: "VERIFICATION_STATEMENT_POSSESSED",
      evidence_sha256: HASH_B,
      evidence_version_id: EVIDENCE_VERSION,
      evidence_version_number: 1,
      external_reference: null,
      verification_result_reference: "verification-result:2030:positive",
      statement_reference: "statement:2030:001",
    }),
  );
  const findings2030 = await capture(
    AUTH_REVIEWER,
    "findings2030",
    HASH_B,
    dbPayload({
      delivery_year: 2030,
      event_kind: "FINDINGS_REPORT_RECEIVED",
      evidence_sha256: HASH_B,
      evidence_version_id: EVIDENCE_VERSION,
      evidence_version_number: 1,
      external_reference: null,
      verification_result_reference: "verification-result:2030:findings",
      findings_report_reference: "findings:2030:001",
    }),
  );
  assert(
    positive2030.ok === true &&
      findings2030.code === "compliance_fact_conflict",
    "positive_findings_conflict_not_denied",
  );
  q(10);

  const actorAudit = await psql(
    DATABASE,
    `select (
    (select count(*) from public.app_delivery_year_compliance_source_events
      where recorder_kind='WORKFORCE'
        and recorder_reference like 'app_workforce_identity:%') = 7
    and (select regulated_actor_kind from
      public.app_delivery_year_compliance_source_events
      where delivery_year=2026
        and event_kind='VERIFICATION_RESULT_REGISTERED_IN_REV')='VERIFIER'
    and (select count(*) from public.app_audit_events
      where event_type='compliance_source_event_recorded'
        and actor_type='workforce'
        and authorization_policy_version_id is not null
        and idempotency_key is not null
        and request_id is not null) = 7
  )::text;`,
  );
  assert(actorAudit === "true", "recorder_or_policy_audit_missing");
  q(11);

  const mutation = await psqlResult(
    DATABASE,
    `update
    public.app_delivery_year_compliance_source_events set delivery_year=2040;
    delete from public.app_delivery_year_compliance_source_events;`,
  );
  assert(mutation.code !== 0, "immutable_events_mutated");
  const persistedShape = await psql(
    DATABASE,
    `select count(*) || '|' ||
    count(evidence_version_id) || '|' ||
    count(distinct evidence_sha256) || '|' ||
    (select count(*) from information_schema.tables
      where table_schema='public' and table_name like '%worklist%')
    from public.app_delivery_year_compliance_source_events;`,
  );
  assert(
    persistedShape === "7|3|4|0",
    `persistence_shape_invalid:${persistedShape}`,
  );
  q(12);

  const rows = JSON.parse(
    await psql(
      DATABASE,
      `select jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source_contract_version',source_contract_version,
      'event_schema_version',event_schema_version,
      'event_id',event_id,
      'delivery_year',delivery_year,
      'event_kind',event_kind,
      'occurred_at',to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'regulated_actor_kind',regulated_actor_kind,
      'recorded_at',to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'recorder_kind',recorder_kind,
      'recorder_reference',recorder_reference,
      'provenance_kind',provenance_kind,
      'evidence_reference',evidence_reference,
      'evidence_sha256',evidence_sha256,
      'evidence_version_id',evidence_version_id,
      'verification_result_reference',verification_result_reference,
      'statement_reference',statement_reference,
      'findings_report_reference',findings_report_reference
    ) order by occurred_at,event_id
  )::text from public.app_delivery_year_compliance_source_events
  where delivery_year=2026;`,
    ),
  ) as Json[];
  const initial = createInitialDeliveryYearComplianceStateV1(2026);
  assert(initial.ok, "reg02_initial_failed");
  let state = initial.value;
  for (const row of rows) {
    const mapped = mapComplianceSourceEventToReg02(row);
    if (!mapped.ok) {
      throw new ProofFailure(`source_mapping_failed:${mapped.code}`);
    }
    const applied = applyDeliveryYearComplianceEvent(state, mapped.value);
    assert(applied.ok && !applied.idempotent, "reg02_replay_failed");
    state = applied.value;
  }
  assert(
    state.appliedEvents.length === 4 &&
      state.inbooking.status === "COMPLETED" &&
      state.verificationOutcome.status === "STATEMENT_POSSESSED" &&
      state.statementSubmission.status === "SUBMITTED" &&
      state.verifierRevRegistration.status === "REGISTERED",
    "reg02_state_invalid",
  );
  const plan = buildComplianceActionPlan(
    state,
    DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
    "2027-05-01T12:00:00Z",
    ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  );
  assert(plan.ok, "reg03b_replay_failed");
  const worklist = projectComplianceWorklist(plan.value);
  assert(worklist.ok, "reg03d_replay_failed");
  q(13);
}

if (Deno.args.includes("--endpoint-only")) {
  try {
    await endpointProof();
    console.log("COMPLIANCE_SOURCE_EVENT_CAPTURE_ENDPOINT=PASS");
  } catch (error) {
    console.error(
      `COMPLIANCE_SOURCE_EVENT_CAPTURE_ENDPOINT=FAIL\n${
        scrub(
          error instanceof Error ? error.message : String(error),
        )
      }`,
    );
    Deno.exitCode = 1;
  }
} else {
  const before = await activeFingerprint();
  try {
    await endpointProof();
    await databaseProof();
    console.log("COMPLIANCE_SOURCE_EVENT_CAPTURE_Q01_Q13=PASS");
    console.log("DETERMINISTIC_ENDPOINT_CHECK=PASS");
    console.log("PERSISTENT_TEST_FIXTURES_LEFT=NO");
  } catch (error) {
    console.error(
      `COMPLIANCE_SOURCE_EVENT_CAPTURE=FAIL\n${
        scrub(
          error instanceof Error ? error.message : String(error),
        )
      }`,
    );
    Deno.exitCode = 1;
  } finally {
    try {
      await dropDatabase(DATABASE);
    } catch (_error) {
      console.error("PROOF_DATABASE_CLEANUP=FAIL");
      Deno.exitCode = 1;
    }
    const after = await activeFingerprint();
    if (before !== after) {
      console.error("ACTIVE_TENANT_DATABASE_UNCHANGED=FAIL");
      Deno.exitCode = 1;
    } else if (!Deno.exitCode) {
      console.log("ACTIVE_TENANT_DATABASE_UNCHANGED=PASS");
    }
  }
}
