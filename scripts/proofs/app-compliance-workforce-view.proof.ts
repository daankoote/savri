const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const DATABASE_PREFIX = "enval_reg03e_proof_";
const BASELINE = "supabase/migrations/20260816150000_app_current_baseline.sql";
const WORKFORCE_MIGRATION =
  "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql";
const COMPLIANCE_MIGRATION =
  "supabase/migrations/20260817120000_app_compliance_workforce_view.sql";
const COMPLIANCE_SOURCES = [
  [
    "platform/runtime/compliance/delivery_year_compliance.ts",
    "adba336076e81179dbf3f766f33848f827a9b65049569a105de8507411a985d2",
  ],
  [
    "platform/runtime/compliance/compliance_action_plan.ts",
    "90ea0c08b8c38fd6256815012d75372854ed7224395cd786df791aba9abb5c42",
  ],
  [
    "platform/runtime/compliance/compliance_worklist.ts",
    "22ee88385fdde1a3a32168a8fbd6ae5a5e17d881bcd7c8b2c032f40c479f1a4d",
  ],
] as const;

class ProofFailure extends Error {}
type CommandResult = { code: number; stdout: string; stderr: string };

function assert(value: boolean, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REG03E-Q${String(value).padStart(2, "0")}: PASS`);
}
function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 300);
}
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
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
async function must(name: string, args: string[], stdin?: string) {
  const result = await command(name, args, stdin);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || `${name}_failed`));
  }
  return result.stdout;
}
async function psqlResult(database: string, sql: string) {
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
async function psql(database: string, sql: string) {
  const result = await psqlResult(database, sql);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}
async function reject(database: string, sql: string) {
  const result = await psqlResult(database, `begin;\n${sql}\nrollback;`);
  assert(result.code !== 0, "expected_rejection");
}
async function sha256(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function dropDatabase(database: string) {
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

const AUTH_ADMIN = "a1000000-0000-4000-8000-000000000001";
const AUTH_REVIEWER = "a1000000-0000-4000-8000-000000000002";
const AUTH_MEMBER = "a1000000-0000-4000-8000-000000000003";
const CUSTOMER = "a2000000-0000-4000-8000-000000000001";
const CASE = "a3000000-0000-4000-8000-000000000001";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";
const TENANT_SCOPE = "CURRENT_TENANT_DATA_PLANE";

const database = `${DATABASE_PREFIX}${crypto.randomUUID().replaceAll("-", "")}`;
try {
  await must("docker", [
    "exec",
    CONTAINER,
    "createdb",
    "-U",
    "postgres",
    "-T",
    "template0",
    database,
  ]);
  await psql(
    database,
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
  for (const path of [BASELINE, WORKFORCE_MIGRATION, COMPLIANCE_MIGRATION]) {
    await psql(database, await Deno.readTextFile(path));
  }

  const catalogue = await psql(
    database,
    `
    select count(*) || '|' || string_agg(
      capability_code || '=' || floor_seniority || '/' ||
      default_seniority || '/' || scope_kind,
      ',' order by capability_code
    ) from public.app_workforce_capability_catalog;
  `,
  );
  assert(
    catalogue ===
      "10|case.assignment.manage=admin/admin/global," +
        "compliance.delivery_year.view=member/reviewer/tenant_wide," +
        "location.observation.record=member/member/case_location," +
        "location.root.create=member/member/case," +
        "location.version.accept.approve=member/reviewer/case_location," +
        "location.version.accept.prepare=member/member/case_location," +
        "location.version.correct.approve=member/reviewer/case_location," +
        "location.version.correct.prepare=member/member/case_location," +
        "workforce.member.manage=admin/admin/global," +
        "workforce.policy.manage=admin/admin/global",
    `catalogue_not_exact:${catalogue}`,
  );
  q(1);

  const policyHistory = await psql(
    database,
    `
    select string_agg(
      policy_ref || '=' || canonical_sha256 || '/' || requirement_count,
      ',' order by policy_ref
    ) from (
      select policy.policy_ref, policy.canonical_sha256,
        count(requirement.*)::text requirement_count
      from public.app_workforce_policy_versions policy
      join public.app_workforce_policy_requirements requirement
        on requirement.policy_version_id=policy.id
      group by policy.id
    ) history;
  `,
  );
  assert(
    policyHistory ===
      "enval_default_v1=3f5a5ff0f429d57a1f3ae1a10af3f43cc8b7bf8d1234f58ee48e87e2686ca963/9," +
        "enval_default_v2=5bd21618d05b45fa959bde1f2a530629bce380923952057c95bcb3153d1fa7eb/10",
    "policy_history_not_deterministic",
  );
  const activePolicy = await psql(
    database,
    `
    select policy.policy_ref || '|' || requirement.minimum_seniority
    from public.app_workforce_policy_activations activation
    join public.app_workforce_policy_versions policy
      on policy.id=activation.policy_version_id
    join public.app_workforce_policy_requirements requirement
      on requirement.policy_version_id=policy.id
     and requirement.capability_code='compliance.delivery_year.view'
    order by activation.effective_at desc, activation.recorded_at desc limit 1;
  `,
  );
  assert(
    activePolicy === "enval_default_v2|reviewer",
    "default_policy_invalid",
  );
  q(2);

  const security = await psql(
    database,
    `
    select (
      (select count(*) from information_schema.role_table_grants
       where table_schema='public'
         and table_name='app_workforce_tenant_scope_assignments'
         and grantee in ('anon','authenticated')) = 0
      and not has_table_privilege(
        'service_role','public.app_workforce_tenant_scope_assignments','INSERT'
      )
      and not has_function_privilege(
        'authenticated',
        'public.app_workforce_authorize_v1(uuid,text,text,uuid,uuid,timestamptz)',
        'EXECUTE'
      )
      and (select relrowsecurity from pg_class
        where oid='public.app_workforce_tenant_scope_assignments'::regclass)
    )::text;
  `,
  );
  assert(security === "true", "browser_or_service_bypass_present");
  await reject(
    database,
    `
    insert into public.app_workforce_capability_catalog (
      capability_code,catalogue_version,floor_seniority,
      default_seniority,scope_kind
    ) values ('custom.capability','pilot_v1','member','member','global');
  `,
  );
  q(3);

  await psql(
    database,
    `
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_ADMIN}','admin@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_REVIEWER}','reviewer@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_MEMBER}','member@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());
    insert into public.app_customers (id,customer_type)
    values ('${CUSTOMER}','particulier');
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      '${CASE}','${CUSTOMER}','REG03ECASE',clock_timestamp(),'system',
      'actor:proof','proof','reg03e-case','reg03e-case'
    );
  `,
  );
  const bootstrap = await psql(
    database,
    `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','bootstrap:reg03e',
      'bootstrap-key-reg03e','${HASH_A}','${EXPIRES}',
      'decision:reg03e-bootstrap'
    )->>'ok';
  `,
  );
  assert(bootstrap === "true", "bootstrap_failed");
  const adminShape = await psql(
    database,
    `
    select seniority.seniority || '|' ||
      count(distinct capability.id) || '|' || count(distinct scope.id)
    from public.app_workforce_identities identity
    join public.app_workforce_seniority_assignments seniority
      on seniority.workforce_identity_id=identity.id
    join public.app_workforce_capability_assignments capability
      on capability.workforce_identity_id=identity.id
     and capability.event_type='granted'
    left join public.app_workforce_tenant_scope_assignments scope
      on scope.workforce_identity_id=identity.id and scope.event_type='granted'
    where identity.auth_user_id='${AUTH_ADMIN}'
    group by seniority.seniority;
  `,
  );
  assert(adminShape === "admin|10|1", "first_admin_shape_invalid");
  const adminAllowed = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_ADMIN}','compliance.delivery_year.view','${TENANT_SCOPE}',
      null,null,clock_timestamp()
    )->>'ok';
  `,
  );
  assert(adminAllowed === "true", "admin_default_denied");
  q(4);

  for (
    const [auth, seniority, suffix] of [
      [AUTH_REVIEWER, "reviewer", "reviewer"],
      [AUTH_MEMBER, "member", "member"],
    ]
  ) {
    const created = await psql(
      database,
      `
      select public.app_workforce_member_manage_v1(
        '${AUTH_ADMIN}','member:${suffix}','member-key-${suffix}',
        '${HASH_A}','${EXPIRES}','create','${auth}',null,'${seniority}',
        clock_timestamp(),'decision:${suffix}',null
      )->>'ok';
    `,
    );
    assert(created === "true", `create_${suffix}_failed`);
  }
  const reviewerAllowed = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','compliance.delivery_year.view','${TENANT_SCOPE}',
      null,null,clock_timestamp()
    )->>'ok';
  `,
  );
  const memberDenied = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_MEMBER}','compliance.delivery_year.view','${TENANT_SCOPE}',
      null,null,clock_timestamp()
    )->>'code';
  `,
  );
  assert(reviewerAllowed === "true", "reviewer_default_denied");
  assert(memberDenied === "seniority_not_authorized", "member_default_allowed");
  q(5);

  const missingScope = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','compliance.delivery_year.view',
      null,null,clock_timestamp()
    )->>'code';
  `,
  );
  const wrongScope = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','compliance.delivery_year.view','OTHER_TENANT',
      null,null,clock_timestamp()
    )->>'code';
  `,
  );
  assert(missingScope === "tenant_scope_denied", "missing_scope_allowed");
  assert(wrongScope === "tenant_scope_denied", "wrong_scope_allowed");
  q(6);

  const identities = await psql(
    database,
    `
    select
      (select id from public.app_workforce_identities
       where auth_user_id='${AUTH_REVIEWER}') || '|' ||
      (select id from public.app_workforce_identities
       where auth_user_id='${AUTH_MEMBER}');
  `,
  );
  const [reviewerIdentity, memberIdentity] = identities.split("|");
  assert(!!reviewerIdentity && !!memberIdentity, "identity_refs_missing");
  const memberCaseGrant = await psql(
    database,
    `
    select public.app_workforce_case_assignment_manage_v1(
      '${AUTH_ADMIN}','assign:member-case','assign-key-member-case',
      '${HASH_A}','${EXPIRES}','grant','${memberIdentity}',
      'location.root.create','${CASE}',null,null,null,
      clock_timestamp(),null,'decision:member-case',null
    )->>'ok';
  `,
  );
  assert(memberCaseGrant === "true", "case_scope_fixture_failed");
  const caseCannotGrantCompliance = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_MEMBER}','compliance.delivery_year.view','${TENANT_SCOPE}',
      null,null,clock_timestamp()
    )->>'code';
  `,
  );
  const tenantCannotGrantCase = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','location.root.create','${TENANT_SCOPE}',
      '${CASE}',null,clock_timestamp()
    )->>'code';
  `,
  );
  assert(
    caseCannotGrantCompliance === "seniority_not_authorized",
    "case_scope_promoted_to_compliance",
  );
  assert(
    tenantCannotGrantCase === "invalid_input",
    "tenant_scope_promoted_to_case",
  );
  q(7);

  const invalidComplianceShape = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','compliance.delivery_year.view','${TENANT_SCOPE}',
      '${CASE}',null,clock_timestamp()
    )->>'code';
  `,
  );
  const legacyEntry = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','compliance.delivery_year.view',
      null,null,clock_timestamp()
    )->>'code';
  `,
  );
  assert(invalidComplianceShape === "invalid_input", "case_input_accepted");
  assert(
    legacyEntry === "tenant_scope_denied",
    "implicit_global_scope_accepted",
  );
  q(8);

  const reviewerCapability = await psql(
    database,
    `
    select id || '|' || assignment_id
    from public.app_workforce_capability_assignments
    where workforce_identity_id='${reviewerIdentity}'
      and capability_code='compliance.delivery_year.view'
      and event_type='granted' order by effective_at desc limit 1;
  `,
  );
  const [capabilityEvent, capabilityChain] = reviewerCapability.split("|");
  await psql(
    database,
    `
    insert into public.app_workforce_capability_assignments (
      assignment_id,workforce_identity_id,capability_code,event_type,
      effective_at,valid_until,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_assignment_event_id
    ) values (
      '${capabilityChain}','${reviewerIdentity}',
      'compliance.delivery_year.view','revoked',clock_timestamp(),null,
      'decision:proof-revoke','proof_revoke','actor:proof',
      'proof-revoke-reviewer-capability','${capabilityEvent}'
    );
  `,
  );
  const absentCapability = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','compliance.delivery_year.view','${TENANT_SCOPE}',
      null,null,clock_timestamp()
    )->>'code';
  `,
  );
  assert(
    absentCapability === "capability_not_authorized",
    "capability_not_required",
  );
  q(9);

  const requirements = await psql(
    database,
    `
    select jsonb_object_agg(
      capability_code,
      case when capability_code='compliance.delivery_year.view'
        then 'member' else default_seniority end
    )::text from public.app_workforce_capability_catalog;
  `,
  );
  const policyCreate = await psql(
    database,
    `
    select public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:member-create','policy-key-member-create',
      '${HASH_B}','${EXPIRES}','create',null,'member_compliance_v1',true,
      ${sqlLiteral(requirements)}::jsonb,null,'decision:member-policy'
    );
  `,
  );
  const policyId = JSON.parse(policyCreate).policy_version_id;
  assert(!!policyId, "member_policy_create_failed");
  const policyActivate = await psql(
    database,
    `
    select public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:member-activate','policy-key-member-activate',
      '${HASH_B}','${EXPIRES}','activate','${policyId}',null,null,null,
      clock_timestamp(),'decision:member-policy-activate'
    )->>'ok';
  `,
  );
  assert(policyActivate === "true", "member_policy_activation_failed");
  const memberAllowed = await psql(
    database,
    `
    select public.app_workforce_authorize_v1(
      '${AUTH_MEMBER}','compliance.delivery_year.view','${TENANT_SCOPE}',
      null,null,clock_timestamp()
    )->>'ok';
  `,
  );
  assert(memberAllowed === "true", "member_policy_variant_denied");
  q(10);

  const oldNine = await psql(
    database,
    `
    select count(*) || '|' || string_agg(
      capability_code || '=' || floor_seniority || '/' ||
      default_seniority || '/' || scope_kind,
      ',' order by capability_code
    ) from public.app_workforce_capability_catalog
    where capability_code <> 'compliance.delivery_year.view';
  `,
  );
  assert(
    oldNine ===
      "9|case.assignment.manage=admin/admin/global," +
        "location.observation.record=member/member/case_location," +
        "location.root.create=member/member/case," +
        "location.version.accept.approve=member/reviewer/case_location," +
        "location.version.accept.prepare=member/member/case_location," +
        "location.version.correct.approve=member/reviewer/case_location," +
        "location.version.correct.prepare=member/member/case_location," +
        "workforce.member.manage=admin/admin/global," +
        "workforce.policy.manage=admin/admin/global",
    "existing_capabilities_changed",
  );
  q(11);

  await reject(
    database,
    `
    update public.app_workforce_policy_versions
    set policy_ref='rewritten' where policy_ref='enval_default_v1';
  `,
  );
  await reject(
    database,
    `
    update public.app_audit_events set event_type='rewritten'
    where request_id='reg03e-default-policy-v2';
  `,
  );
  const weakRequirements = JSON.parse(requirements);
  weakRequirements["workforce.policy.manage"] = "member";
  await reject(
    database,
    `
    select public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:weak','policy-key-weak','${HASH_B}',
      '${EXPIRES}','create',null,'weak_policy_v1',true,
      ${sqlLiteral(JSON.stringify(weakRequirements))}::jsonb,
      null,'decision:weak-policy'
    );
  `,
  );
  q(12);

  const adminState = await psql(
    database,
    `
    select state.state || '|' || seniority.seniority || '|' ||
      count(distinct identity.id)
    from public.app_workforce_identities identity
    join lateral (
      select state from public.app_workforce_identity_states
      where workforce_identity_id=identity.id
      order by effective_at desc,recorded_at desc limit 1
    ) state on true
    join lateral (
      select seniority from public.app_workforce_seniority_assignments
      where workforce_identity_id=identity.id
      order by effective_at desc,recorded_at desc limit 1
    ) seniority on true
    where identity.auth_user_id='${AUTH_ADMIN}'
    group by state.state,seniority.seniority;
  `,
  );
  assert(adminState === "active|admin|1", "first_admin_state_changed");
  q(13);

  for (const [path, expected] of COMPLIANCE_SOURCES) {
    assert(await sha256(path) === expected, `compliance_truth_changed:${path}`);
  }
  const mutationTargets = await psql(
    database,
    `
    select count(*) from public.app_audit_events
    where event_type like 'compliance%' or scope_type like 'compliance%';
  `,
  );
  assert(mutationTargets === "0", "compliance_truth_write_introduced");
  q(14);

  const exactScope = await psql(
    database,
    `
    select count(*) || '|' || bool_and(
      scope_kind='TENANT_WIDE'
      and tenant_scope_ref='CURRENT_TENANT_DATA_PLANE'
      and capability_code='compliance.delivery_year.view'
    ) from public.app_workforce_tenant_scope_assignments
    where event_type='granted';
  `,
  );
  assert(/^\d+\|true$/.test(exactScope), "tenant_scope_not_closed");
  q(15);

  const API_SURFACE = await psql(
    database,
    `
    select count(*) from pg_proc function
    join pg_namespace namespace on namespace.oid=function.pronamespace
    where namespace.nspname='public'
      and function.proname like '%compliance%';
  `,
  );
  assert(API_SURFACE === "0", "compliance_api_added");
  q(16);

  console.log("COMPLIANCE_WORKFORCE_VIEW_Q01_Q16=PASS");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`REG03E_PROOF_FAIL=${scrub(message)}`);
  Deno.exitCode = 1;
} finally {
  await dropDatabase(database);
}
