const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const DATABASE_PREFIX = "enval_wp3p_proof_";
const MIGRATION =
  "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql";

class ProofFailure extends Error {}
type CommandResult = { code: number; stdout: string; stderr: string };

function assert(value: boolean, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`WP3P-Q${String(value).padStart(2, "0")}: PASS`);
}
function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 260);
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
  const result = await psqlResult(database, `begin;\n${sql}\ncommit;`);
  assert(result.code !== 0, "expected_rejection");
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
async function createDatabase(database: string, migration: string) {
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
  const raw = await must("docker", [
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    MAIN_DATABASE,
    "--schema-only",
    "--no-owner",
  ]);
  const schema = raw.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (trimmed === "SET log_min_messages TO 'fatal'") return false;
    if (trimmed.startsWith("ALTER DEFAULT PRIVILEGES ")) return false;
    if (/^(GRANT|REVOKE)\b/.test(trimmed)) return false;
    return true;
  }).join("\n");
  await psql(database, schema);
  const applied = await psqlResult(database, migration);
  assert(applied.code === 0, `migration_apply:${scrub(applied.stderr)}`);
}

const AUTH_ADMIN = "81000000-0000-4000-8000-000000000001";
const AUTH_REVIEWER = "81000000-0000-4000-8000-000000000002";
const AUTH_LIFECYCLE = "81000000-0000-4000-8000-000000000003";
const CUSTOMER = "82000000-0000-4000-8000-000000000001";
const CASE = "83000000-0000-4000-8000-000000000001";
const OTHER_CASE = "83000000-0000-4000-8000-000000000002";
const LOCATION_A = "84000000-0000-4000-8000-000000000001";
const LOCATION_B = "84000000-0000-4000-8000-000000000002";
const OBS_A = "85000000-0000-4000-8000-000000000001";
const OBS_B = "85000000-0000-4000-8000-000000000002";
const REL_A = "86000000-0000-4000-8000-000000000001";
const REL_B = "86000000-0000-4000-8000-000000000002";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

function call(
  functionName: string,
  args: string,
): string {
  return `(select public.${functionName}(${args}))`;
}

const database = `${DATABASE_PREFIX}${crypto.randomUUID().replaceAll("-", "")}`;
const migration = await Deno.readTextFile(MIGRATION);
try {
  await createDatabase(database, migration);
  const catalogue = await psql(database, `
    select count(*) || '|' || string_agg(capability_code, ',' order by capability_code)
    from public.app_workforce_capability_catalog;
  `);
  assert(
    catalogue ===
      "9|case.assignment.manage,location.observation.record,location.root.create," +
        "location.version.accept.approve,location.version.accept.prepare," +
        "location.version.correct.approve,location.version.correct.prepare," +
        "workforce.member.manage,workforce.policy.manage",
    "catalogue_not_exact",
  );
  q(1);

  const policy = await psql(database, `
    select count(*) || '|' || bool_and(v.require_distinct_maker_checker) || '|' ||
      (select count(*) from public.app_workforce_policy_requirements)
    from public.app_workforce_policy_versions v;
  `);
  assert(policy === "1|true|9", "default_policy_invalid");
  const defaultRequirements = await psql(database, `
    select string_agg(
      requirement.capability_code || '=' || requirement.minimum_seniority,
      ',' order by requirement.capability_code
    )
    from public.app_workforce_policy_requirements requirement;
  `);
  assert(
    defaultRequirements ===
      "case.assignment.manage=admin,location.observation.record=member," +
        "location.root.create=member,location.version.accept.approve=reviewer," +
        "location.version.accept.prepare=member," +
        "location.version.correct.approve=reviewer," +
        "location.version.correct.prepare=member,workforce.member.manage=admin," +
        "workforce.policy.manage=admin",
    "default_policy_requirements_invalid",
  );
  q(2);

  const acl = await psql(database, `
    select count(*) from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (
        'app_workforce_capability_catalog', 'app_workforce_policy_versions',
        'app_workforce_policy_requirements', 'app_workforce_policy_activations',
        'app_workforce_seniority_assignments'
      ) and grantee in ('anon','authenticated');
  `);
  assert(acl === "0", "browser_acl_present");
  const directServiceWrites = await psql(database, `
    select count(*) from information_schema.role_table_grants
    where table_schema='public'
      and table_name in (
        'app_workforce_identities', 'app_workforce_identity_states',
        'app_workforce_capability_assignments', 'app_case_location_relations',
        'app_workforce_scope_assignments', 'app_workforce_operation_requests',
        'app_workforce_operation_reviews'
      )
      and grantee='service_role' and privilege_type='INSERT';
  `);
  assert(directServiceWrites === "0", "service_role_direct_write_bypass_present");
  const adminRpcAcl = await psql(database, `
    select
      count(*) filter (where grantee='service_role') || '|' ||
      count(*) filter (where grantee in ('PUBLIC','anon','authenticated'))
    from information_schema.routine_privileges
    where routine_schema='public' and privilege_type='EXECUTE'
      and routine_name in (
        'app_workforce_first_admin_bootstrap_v1',
        'app_workforce_member_manage_v1',
        'app_workforce_policy_manage_v1',
        'app_workforce_case_assignment_manage_v1'
      );
  `);
  assert(adminRpcAcl === "4|0", "admin_rpc_acl_invalid");
  q(3);

  await psql(database, `
    insert into auth.users (id, email_confirmed_at) values
      ('${AUTH_ADMIN}', clock_timestamp()),
      ('${AUTH_REVIEWER}', clock_timestamp()),
      ('${AUTH_LIFECYCLE}', clock_timestamp());
    insert into public.app_customers (id, customer_type)
      values ('${CUSTOMER}', 'particulier');
    insert into public.app_cases (
      id, customer_id, case_reference, created_at, created_by_actor_type,
      created_by_actor_ref, source_class, source_ref, request_id
    ) values
      ('${CASE}','${CUSTOMER}','WP3PCASE1',clock_timestamp(),'system',
       'actor:proof','proof','case:1','case:1'),
      ('${OTHER_CASE}','${CUSTOMER}','WP3PCASE2',clock_timestamp(),'system',
       'actor:proof','proof','case:2','case:2');
    insert into public.app_locations (
      id, created_at, created_by_actor_ref, created_from_request_id,
      creation_basis
    ) values
      ('${LOCATION_A}',clock_timestamp(),'actor:proof','loc:a','manual_migration_review'),
      ('${LOCATION_B}',clock_timestamp(),'actor:proof','loc:b','manual_migration_review');
    insert into public.app_location_address_observations (
      id, location_id, observation_kind, descriptor_kind, observed_at,
      recorded_at, recorded_by_actor_ref, recorded_from_request_id,
      country_code, site_reference
    ) values
      ('${OBS_A}','${LOCATION_A}','manual_observed','site_reference',
       clock_timestamp(),clock_timestamp(),'actor:proof','obs:a','NL','a'),
      ('${OBS_B}','${LOCATION_B}','manual_observed','site_reference',
       clock_timestamp(),clock_timestamp(),'actor:proof','obs:b','NL','b');
    insert into public.app_case_location_relations (
      id, relation_id, case_id, location_id, event_type, effective_at,
      recorded_at, decision_ref, recorded_by_actor_ref, request_id
    ) values
      ('${REL_A}','${REL_A}','${CASE}','${LOCATION_A}','linked',
       clock_timestamp(),clock_timestamp(),'relation:a','actor:proof','relation:a'),
      ('${REL_B}','${REL_B}','${CASE}','${LOCATION_B}','linked',
       clock_timestamp(),clock_timestamp(),'relation:b','actor:proof','relation:b');
  `);

  const wrongEnvironment = await psql(database, `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','unknown','enval','bootstrap:wrong-env',
      'bootstrap-key-wrong-env','${HASH_A}','${EXPIRES}',
      'decision:wrong-env'
    )->>'code';
  `);
  const wrongProject = await psql(database, `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','other','bootstrap:wrong-project',
      'bootstrap-key-wrong-project','${HASH_A}','${EXPIRES}',
      'decision:wrong-project'
    )->>'code';
  `);
  assert(
    wrongEnvironment === "bootstrap_precondition_failed" &&
      wrongProject === "bootstrap_precondition_failed",
    "bootstrap_target_mismatch_allowed",
  );
  const bootstrap = await psql(database, `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','bootstrap:1','bootstrap-key-1',
      '${HASH_A}','${EXPIRES}','decision:bootstrap'
    )->>'ok';
  `);
  assert(bootstrap === "true", "bootstrap_failed");
  const bootstrapState = await psql(database, `
    select s.seniority || '|' || count(c.*)
    from public.app_workforce_identities i
    join public.app_workforce_seniority_assignments s
      on s.workforce_identity_id=i.id
    join public.app_workforce_capability_assignments c
      on c.workforce_identity_id=i.id and c.event_type='granted'
    where i.auth_user_id='${AUTH_ADMIN}' group by s.seniority;
  `);
  assert(bootstrapState === "admin|9", "bootstrap_admin_shape_invalid");
  const bootstrapReplay = await psql(database, `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','bootstrap:1','bootstrap-key-1',
      '${HASH_A}','${EXPIRES}','decision:bootstrap'
    )->>'ok';
  `);
  assert(bootstrapReplay === "true", "bootstrap_not_idempotent");
  q(4);

  const secondBootstrap = await psql(database, `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_REVIEWER}','local','enval','bootstrap:2','bootstrap-key-2',
      '${HASH_B}','${EXPIRES}','decision:bootstrap-2'
    )->>'code';
  `);
  assert(secondBootstrap === "bootstrap_precondition_failed", "bootstrap_not_closed");
  q(5);

  const member = await psql(database, `
    select public.app_workforce_member_manage_v1(
      '${AUTH_ADMIN}','member:1','member-key-1','${HASH_A}','${EXPIRES}',
      'create','${AUTH_REVIEWER}',null,'reviewer',clock_timestamp(),
      'decision:member',null
    )->>'ok';
  `);
  assert(member === "true", "member_create_failed");
  const lifecycleCreate = await psql(database, `
    select public.app_workforce_member_manage_v1(
      '${AUTH_ADMIN}','member:lifecycle:create','member-key-lifecycle-create',
      '${HASH_A}','${EXPIRES}','create','${AUTH_LIFECYCLE}',null,'member',
      clock_timestamp(),'decision:lifecycle-create',null
    )->>'ok';
  `);
  assert(lifecycleCreate === "true", "lifecycle_create_failed");
  const lifecycleIdentity = await psql(database, `
    select id from public.app_workforce_identities
    where auth_user_id='${AUTH_LIFECYCLE}';
  `);
  for (const [action, seniority, reason] of [
    ["change_seniority", "reviewer", "reason:promotion"],
    ["suspend", null, "reason:suspend"],
    ["activate", null, null],
    ["revoke", null, "reason:revoke"],
  ] as const) {
    const lifecycleResult = await psql(database, `
      select public.app_workforce_member_manage_v1(
        '${AUTH_ADMIN}','member:lifecycle:${action}',
        'member-key-lifecycle-${action}','${HASH_A}','${EXPIRES}',
        '${action}',null,'${lifecycleIdentity}',
        ${seniority === null ? "null" : `'${seniority}'`},clock_timestamp(),
        'decision:lifecycle-${action}',
        ${reason === null ? "null" : `'${reason}'`}
      )->>'ok';
    `);
    assert(lifecycleResult === "true", `lifecycle_${action}_failed`);
  }
  const lifecycleShape = await psql(database, `
    select
      (select count(*) from public.app_workforce_identity_states
       where workforce_identity_id='${lifecycleIdentity}') || '|' ||
      (select count(*) from public.app_workforce_seniority_assignments
       where workforce_identity_id='${lifecycleIdentity}') || '|' ||
      (select count(*) from public.app_audit_events
       where scope_id='${lifecycleIdentity}' and event_type in (
         'workforce_identity_created','workforce_seniority_changed',
         'workforce_identity_suspended','workforce_identity_activated',
         'workforce_identity_revoked'
       ));
  `);
  assert(lifecycleShape === "4|2|5", "lifecycle_history_incomplete");
  q(6);

  const identities = await psql(database, `
    select
      (select id from public.app_workforce_identities where auth_user_id='${AUTH_ADMIN}') || '|' ||
      (select id from public.app_workforce_identities where auth_user_id='${AUTH_REVIEWER}');
  `);
  const [adminIdentity, reviewerIdentity] = identities.split("|");
  assert(!!adminIdentity && !!reviewerIdentity, "identity_refs_missing");

  let assignmentCounter = 0;
  async function grant(
    identity: string,
    capability: string,
    location: string,
    relation: string,
  ) {
    assignmentCounter += 1;
    const result = await psql(database, `
      select public.app_workforce_case_assignment_manage_v1(
        '${AUTH_ADMIN}','assign:${assignmentCounter}','assign-key-${assignmentCounter}',
        '${HASH_A}','${EXPIRES}','grant','${identity}','${capability}',
        '${CASE}','${location}','${relation}',null,clock_timestamp(),null,
        'decision:assign',null
      )->>'ok';
    `);
    assert(result === "true", `assignment_failed_${assignmentCounter}`);
  }
  await grant(adminIdentity, "location.version.accept.prepare", LOCATION_A, REL_A);
  await grant(adminIdentity, "location.version.accept.approve", LOCATION_A, REL_A);
  await grant(reviewerIdentity, "location.version.accept.approve", LOCATION_A, REL_A);
  await grant(adminIdentity, "location.version.accept.prepare", LOCATION_B, REL_B);
  await grant(adminIdentity, "location.version.accept.approve", LOCATION_B, REL_B);
  q(7);

  const prepareA = await psql(database, `
    select public.app_ops_location_accept_prepare_v1(
      '${AUTH_ADMIN}','prepare:a','prepare-key-a','${HASH_A}','${EXPIRES}',
      jsonb_build_object(
        'case_id','${CASE}','location_id','${LOCATION_A}',
        'observation_id','${OBS_A}','operation_payload_hash','${HASH_B}'
      )
    );
  `);
  const requestA = JSON.parse(prepareA).operation_request_id;
  assert(!!requestA, "default_prepare_failed");
  const selfDenied = await psql(database, `
    select public.app_ops_location_accept_review_v1(
      '${AUTH_ADMIN}','review:self','review-key-self','${HASH_A}','${EXPIRES}',
      jsonb_build_object(
        'operation_request_id','${requestA}','outcome','approved',
        'reviewed_payload_hash','${HASH_B}','decision_ref','decision:self',
        'reason_ref',null
      )
    )->>'code';
  `);
  assert(selfDenied === "self_approval_forbidden", "default_self_approval_allowed");
  const checkerApproved = await psql(database, `
    select public.app_ops_location_accept_review_v1(
      '${AUTH_REVIEWER}','review:b','review-key-b','${HASH_A}','${EXPIRES}',
      jsonb_build_object(
        'operation_request_id','${requestA}','outcome','approved',
        'reviewed_payload_hash','${HASH_B}','decision_ref','decision:b',
        'reason_ref',null
      )
    )->>'ok';
  `);
  assert(checkerApproved === "true", "default_checker_rejected");
  q(8);

  const requirements = await psql(database, `
    select jsonb_object_agg(capability_code, default_seniority)::text
    from public.app_workforce_capability_catalog;
  `);
  const soloPolicy = await psql(database, `
    select public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:create','policy-key-create','${HASH_C}','${EXPIRES}',
      'create',null,'solo_v1',false,${sqlLiteral(requirements)}::jsonb,
      null,'decision:solo-policy'
    );
  `);
  const soloPolicyId = JSON.parse(soloPolicy).policy_version_id;
  assert(!!soloPolicyId, "solo_policy_create_failed");
  const activated = await psql(database, `
    select public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:activate','policy-key-activate','${HASH_C}','${EXPIRES}',
      'activate','${soloPolicyId}',null,null,null,clock_timestamp(),
      'decision:solo-activate'
    )->>'ok';
  `);
  assert(activated === "true", "solo_policy_activation_failed");
  q(9);

  const prepareB = await psql(database, `
    select public.app_ops_location_accept_prepare_v1(
      '${AUTH_ADMIN}','prepare:solo','prepare-key-solo','${HASH_A}','${EXPIRES}',
      jsonb_build_object(
        'case_id','${CASE}','location_id','${LOCATION_B}',
        'observation_id','${OBS_B}','operation_payload_hash','${HASH_C}'
      )
    );
  `);
  const requestB = JSON.parse(prepareB).operation_request_id;
  const soloApproved = await psql(database, `
    select public.app_ops_location_accept_review_v1(
      '${AUTH_ADMIN}','review:solo','review-key-solo','${HASH_A}','${EXPIRES}',
      jsonb_build_object(
        'operation_request_id','${requestB}','outcome','approved',
        'reviewed_payload_hash','${HASH_C}','decision_ref','decision:solo',
        'reason_ref',null
      )
    )->>'ok';
  `);
  assert(soloApproved === "true", "solo_review_rejected");
  const soloExecuted = await psql(database, `
    select public.app_ops_location_accept_execute_v1(
      '${AUTH_ADMIN}','execute:solo','execute-key-solo','${HASH_A}','${EXPIRES}',
      jsonb_build_object(
        'operation_request_id','${requestB}',
        'operation_payload_hash','${HASH_C}',
        'case_id','${CASE}','location_id','${LOCATION_B}',
        'observation_id','${OBS_B}',
        'valid_from','2026-08-16T00:00:00Z','valid_to',null,
        'accepted_at','2026-08-16T00:00:01Z',
        'acceptance_decision_ref','decision:solo-accept'
      )
    )->>'ok';
  `);
  assert(soloExecuted === "true", "solo_execute_failed");
  q(10);

  const outsideScope = await psql(database, `
    select public.app_workforce_authorize_v1(
      '${AUTH_ADMIN}','location.version.accept.prepare',
      '${OTHER_CASE}','${LOCATION_B}',clock_timestamp()
    )->>'code';
  `);
  assert(outsideScope === "location_scope_denied", "scope_floor_bypassed");
  const reviewerPolicy = await psql(database, `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}','workforce.policy.manage',null,null,clock_timestamp()
    )->>'code';
  `);
  assert(
    reviewerPolicy === "seniority_not_authorized" ||
      reviewerPolicy === "capability_not_authorized",
    "admin_floor_bypassed",
  );
  await psql(database, `
    update auth.users
    set email_confirmed_at = null
    where id = '${AUTH_REVIEWER}';
  `);
  const unverified = await psql(database, `
    select public.app_workforce_authorize_v1(
      '${AUTH_REVIEWER}', 'location.version.accept.approve',
      '${CASE}', '${LOCATION_A}', clock_timestamp()
    )->>'code';
  `);
  assert(
    unverified === "authenticated_actor_not_verified",
    "unverified_actor_allowed",
  );
  await psql(database, `
    update auth.users set email_confirmed_at = clock_timestamp()
    where id = '${AUTH_REVIEWER}';
  `);
  const adminCapability = await psql(database, `
    select id || '|' || assignment_id
    from public.app_workforce_capability_assignments
    where workforce_identity_id='${adminIdentity}'
      and capability_code='location.observation.record'
      and event_type='granted' order by effective_at desc limit 1;
  `);
  const [adminCapabilityEvent, adminCapabilityChain] = adminCapability.split("|");
  await psql(database, `
    insert into public.app_workforce_capability_assignments (
      assignment_id, workforce_identity_id, capability_code, event_type,
      effective_at, valid_until, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_assignment_event_id
    ) values (
      '${adminCapabilityChain}','${adminIdentity}',
      'location.observation.record','revoked',clock_timestamp(),null,
      'decision:capability-proof','reason:capability-proof','actor:proof',
      'capability-proof:revoke','${adminCapabilityEvent}'
    );
  `);
  const withoutCapability = await psql(database, `
    select public.app_workforce_authorize_v1(
      '${AUTH_ADMIN}', 'location.observation.record',
      '${CASE}', '${LOCATION_A}', clock_timestamp()
    )->>'code';
  `);
  assert(withoutCapability === "capability_not_authorized", "capability_floor_bypassed");
  q(11);

  await reject(database, `
    update public.app_workforce_policy_versions
    set require_distinct_maker_checker=true where id='${soloPolicyId}';
  `);
  const weakRequirements = {
    ...JSON.parse(requirements),
    "workforce.policy.manage": "member",
  };
  await reject(database, `
    select public.app_workforce_policy_manage_v1(
      '${AUTH_ADMIN}','policy:weak','policy-key-weak','${HASH_C}','${EXPIRES}',
      'create',null,'weak_v1',false,
      ${sqlLiteral(JSON.stringify(weakRequirements))}::jsonb,
      null,'decision:weak-policy'
    );
  `);
  await reject(database, `
    update public.app_audit_events
    set event_type='rewritten'
    where event_type='workforce_bootstrap_completed';
  `);
  q(12);

  const audit = await psql(database, `
    select count(*)
    from public.app_audit_events event
    where event.authorization_policy_version_id='${soloPolicyId}'
      and event.event_type in (
        'workforce_policy_activated',
        'ops_location_accept_prepared',
        'ops_location_accept_reviewed',
        'ops_location_accept_executed'
      );
  `);
  assert(Number(audit) >= 4, "policy_version_audit_missing");
  const rowPolicies = await psql(database, `
    select count(*)
    from public.app_workforce_operation_requests request
    join public.app_workforce_operation_reviews review
      on review.operation_request_id=request.id
    where request.id='${requestB}'
      and request.authorization_policy_version_id='${soloPolicyId}'
      and review.authorization_policy_version_id='${soloPolicyId}';
  `);
  assert(rowPolicies === "1", "operation_policy_context_missing");
  q(13);

  const customerAccess = await psql(database, `
    select count(*) from public.app_customer_access_grants;
  `);
  assert(customerAccess === "0", "customer_access_changed");
  q(14);

  console.log("WORKFORCE_POLICY_FOUNDATION_Q01_Q14=PASS");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`WP3P_PROOF_FAIL=${scrub(message)}`);
  Deno.exitCode = 1;
} finally {
  await dropDatabase(database);
}
