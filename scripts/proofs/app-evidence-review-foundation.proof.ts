const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const DATABASE_PREFIX = "enval_review02_proof_";
const MIGRATION =
  "supabase/migrations/20260817230000_app_evidence_review_foundation.sql";

class ProofFailure extends Error {}
type CommandResult = { code: number; stdout: string; stderr: string };

function assert(value: boolean, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REVIEW02-Q${String(value).padStart(2, "0")}: PASS`);
}
function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 360);
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
async function activeFingerprint() {
  const base = await psql(MAIN_DATABASE, `begin read only;
    with current_state as (
      select distinct on (workforce_identity_id)
        workforce_identity_id, state
      from public.app_workforce_identity_states
      where effective_at <= clock_timestamp()
      order by workforce_identity_id, effective_at desc, recorded_at desc
    ), current_seniority as (
      select distinct on (workforce_identity_id)
        workforce_identity_id, seniority
      from public.app_workforce_seniority_assignments
      where effective_at <= clock_timestamp()
      order by workforce_identity_id, effective_at desc, recorded_at desc
    )
    select concat_ws('|',
      (select count(*) from supabase_migrations.schema_migrations),
      (select count(*) from public.app_customers),
      (select count(*) from public.app_cases),
      (select count(*) from public.app_evidence_versions),
      (select count(*) from public.app_workforce_identities),
      (select count(*) from public.app_workforce_identities identity
        join current_state state
          on state.workforce_identity_id=identity.id and state.state='active'
        join current_seniority seniority
          on seniority.workforce_identity_id=identity.id
         and seniority.seniority='admin'),
      (select count(*) from public.app_delivery_year_compliance_source_events)
    ); rollback;`);
  const reviewTable = await psql(
    MAIN_DATABASE,
    "select (to_regclass('public.app_evidence_review_decisions') is not null)::text;",
  );
  const reviewCount = reviewTable === "true"
    ? await psql(
      MAIN_DATABASE,
      "begin read only; select count(*) from public.app_evidence_review_decisions; rollback;",
    )
    : "absent";
  return `${base}|${reviewCount}`;
}

const source = await Deno.readTextFile(MIGRATION);
assert(
  source.includes("app_evidence_review_decisions") &&
    source.includes("'ACCEPTED', 'CORRECTION_REQUIRED'") &&
    source.includes("evidence.review.view") &&
    source.includes("evidence.review.decide") &&
    source.includes("scope_kind = 'case'") &&
    source.includes("app_workforce_authorize_v1") &&
    source.includes("app_evidence_review_decide_v1") &&
    source.includes("app_evidence_review_state_v1") &&
    source.includes("before update or delete") &&
    source.includes("for all to anon, authenticated using (false)") &&
    !source.includes("app_review_tasks") &&
    !source.includes("check_execution") &&
    !source.includes("worklist") &&
    !source.includes("IN_REVIEW") &&
    !source.includes("ESCALATED"),
  "bounded_source_contract_missing",
);
console.log("EVIDENCE_REVIEW_FOUNDATION_SOURCE=PASS");

if (Deno.args.includes("--source-only")) Deno.exit(0);

const AUTH_ADMIN = "b1000000-0000-4000-8000-000000000001";
const AUTH_REVIEWER = "b1000000-0000-4000-8000-000000000002";
const AUTH_MEMBER = "b1000000-0000-4000-8000-000000000003";
const AUTH_NO_CAP = "b1000000-0000-4000-8000-000000000004";
const AUTH_NON_WORKFORCE = "b1000000-0000-4000-8000-000000000005";
const CUSTOMER = "b2000000-0000-4000-8000-000000000001";
const CASE_A = "b3000000-0000-4000-8000-000000000001";
const CASE_B = "b3000000-0000-4000-8000-000000000002";
const EVIDENCE_FILE_A = "b4000000-0000-4000-8000-000000000001";
const EVIDENCE_FILE_B = "b4000000-0000-4000-8000-000000000002";
const EVIDENCE_FILE_OTHER = "b4000000-0000-4000-8000-000000000003";
const EVIDENCE_A_V1 = "b5000000-0000-4000-8000-000000000001";
const EVIDENCE_A_V2 = "b5000000-0000-4000-8000-000000000002";
const EVIDENCE_B_V1 = "b5000000-0000-4000-8000-000000000003";
const EVIDENCE_OTHER = "b5000000-0000-4000-8000-000000000004";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

const database = `${DATABASE_PREFIX}${crypto.randomUUID().replaceAll("-", "")}`;
const before = await activeFingerprint();
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
  await psql(database, `
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
  const migrationPaths: string[] = [];
  for await (const entry of Deno.readDir("supabase/migrations")) {
    if (entry.isFile && entry.name.endsWith(".sql")) {
      migrationPaths.push(`supabase/migrations/${entry.name}`);
    }
  }
  migrationPaths.sort();
  for (const path of migrationPaths) {
    await psql(database, await Deno.readTextFile(path));
  }

  const catalog = await psql(database, `
    select count(*) || '|' || string_agg(
      capability_code || '=' || floor_seniority || '/' ||
      default_seniority || '/' || scope_kind,
      ',' order by capability_code
    ) from public.app_workforce_capability_catalog;
  `);
  assert(
    catalog.startsWith("13|") &&
      catalog.includes("evidence.review.view=member/member/case") &&
      catalog.includes("evidence.review.decide=member/reviewer/case"),
    `capability_catalog_invalid:${catalog}`,
  );
  const policy = await psql(database, `
    select policy.policy_ref || '|' || count(requirement.*)
    from public.app_workforce_policy_activations activation
    join public.app_workforce_policy_versions policy
      on policy.id=activation.policy_version_id
    join public.app_workforce_policy_requirements requirement
      on requirement.policy_version_id=policy.id
    group by activation.id,policy.id
    order by activation.effective_at desc,activation.recorded_at desc limit 1;
  `);
  assert(policy === "enval_default_v4|13", "default_policy_invalid");
  q(1);

  const security = await psql(database, `
    select (
      (select relrowsecurity from pg_class
       where oid='public.app_evidence_review_decisions'::regclass)
      and not has_table_privilege(
        'anon','public.app_evidence_review_decisions','INSERT'
      )
      and not has_table_privilege(
        'authenticated','public.app_evidence_review_decisions','INSERT'
      )
      and not has_table_privilege(
        'service_role','public.app_evidence_review_decisions','INSERT'
      )
      and has_table_privilege(
        'service_role','public.app_evidence_review_decisions','SELECT'
      )
      and has_function_privilege(
        'service_role',
        'public.app_evidence_review_decide_v1(uuid,uuid,text,text,text,text,timestamptz)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.app_evidence_review_decide_v1(uuid,uuid,text,text,text,text,timestamptz)',
        'EXECUTE'
      )
    )::text;
  `);
  assert(security === "true", "browser_or_service_direct_write_present");
  q(2);

  await psql(database, `
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_ADMIN}','admin@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_REVIEWER}','reviewer@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_MEMBER}','member@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NO_CAP}','nocap@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp()),
      ('${AUTH_NON_WORKFORCE}','external@example.invalid',clock_timestamp(),clock_timestamp(),clock_timestamp());
    insert into public.app_customers (id,customer_type)
    values ('${CUSTOMER}','particulier');
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values
      ('${CASE_A}','${CUSTOMER}','REVIEW02CASEA',clock_timestamp(),'system',
       'actor:proof','proof','review02-case-a','review02-case-a'),
      ('${CASE_B}','${CUSTOMER}','REVIEW02CASEB',clock_timestamp(),'system',
       'actor:proof','proof','review02-case-b','review02-case-b');
    set session_replication_role = replica;
    insert into public.app_evidence_files (
      id,case_id,promotion_id,document_type,source_class,source_ref,
      created_at,created_by_actor_ref,request_id
    ) values
      ('${EVIDENCE_FILE_A}','${CASE_A}','b6000000-0000-4000-8000-000000000001',
       'energy_bill','signup_quarantine_file','proof:a',clock_timestamp(),
       'actor:proof','evidence-file:a'),
      ('${EVIDENCE_FILE_B}','${CASE_A}','b6000000-0000-4000-8000-000000000002',
       'installation_invoice','signup_quarantine_file','proof:b',clock_timestamp(),
       'actor:proof','evidence-file:b'),
      ('${EVIDENCE_FILE_OTHER}','${CASE_B}','b6000000-0000-4000-8000-000000000003',
       'energy_bill','signup_quarantine_file','proof:other',clock_timestamp(),
       'actor:proof','evidence-file:other');
    insert into public.app_evidence_versions (
      id,evidence_file_id,version_number,source_intake_file_id,
      storage_bucket,storage_path,detected_mime_type,size_bytes,sha256,status,
      source_confirmed_at,created_at,request_id,idempotency_key
    ) values
      ('${EVIDENCE_A_V1}','${EVIDENCE_FILE_A}',1,
       'b7000000-0000-4000-8000-000000000001','proof','a-v1.pdf',
       'application/pdf',100,'${HASH_A}','confirmed_awaiting_review',
       clock_timestamp(),clock_timestamp(),'evidence:a:v1','evidence:a:v1'),
      ('${EVIDENCE_A_V2}','${EVIDENCE_FILE_A}',2,
       'b7000000-0000-4000-8000-000000000002','proof','a-v2.pdf',
       'application/pdf',101,'${HASH_B}','confirmed_awaiting_review',
       clock_timestamp(),clock_timestamp(),'evidence:a:v2','evidence:a:v2'),
      ('${EVIDENCE_B_V1}','${EVIDENCE_FILE_B}',1,
       'b7000000-0000-4000-8000-000000000003','proof','b-v1.pdf',
       'application/pdf',102,'${HASH_C}','confirmed_awaiting_review',
       clock_timestamp(),clock_timestamp(),'evidence:b:v1','evidence:b:v1'),
      ('${EVIDENCE_OTHER}','${EVIDENCE_FILE_OTHER}',1,
       'b7000000-0000-4000-8000-000000000004','proof','other-v1.pdf',
       'application/pdf',103,'${HASH_A}','confirmed_awaiting_review',
       clock_timestamp(),clock_timestamp(),'evidence:other','evidence:other');
    set session_replication_role = origin;
  `);

  const bootstrap = await psql(database, `
    select public.app_workforce_first_admin_bootstrap_v1(
      '${AUTH_ADMIN}','local','enval','review02-bootstrap','review02-bootstrap',
      '${HASH_A}','${EXPIRES}','decision:review02-bootstrap'
    )->>'ok';
  `);
  assert(bootstrap === "true", "admin_bootstrap_failed");
  for (const [auth, seniority, suffix] of [
    [AUTH_REVIEWER, "reviewer", "reviewer"],
    [AUTH_MEMBER, "member", "member"],
    [AUTH_NO_CAP, "reviewer", "no-cap"],
  ]) {
    const created = await psql(database, `
      select public.app_workforce_member_manage_v1(
        '${AUTH_ADMIN}','review02-member-${suffix}','review02-member-${suffix}',
        '${HASH_A}','${EXPIRES}','create','${auth}',null,'${seniority}',
        clock_timestamp(),'decision:review02-${suffix}',null
      )->>'ok';
    `);
    assert(created === "true", `member_create_failed:${suffix}`);
  }
  const identities = await psql(database, `
    select concat_ws('|',
      (select id from public.app_workforce_identities where auth_user_id='${AUTH_ADMIN}'),
      (select id from public.app_workforce_identities where auth_user_id='${AUTH_REVIEWER}'),
      (select id from public.app_workforce_identities where auth_user_id='${AUTH_MEMBER}'),
      (select id from public.app_workforce_identities where auth_user_id='${AUTH_NO_CAP}')
    );
  `);
  const [adminIdentity, reviewerIdentity, memberIdentity, noCapIdentity] =
    identities.split("|");
  assert(
    [adminIdentity, reviewerIdentity, memberIdentity, noCapIdentity].every(Boolean),
    "workforce_identity_missing",
  );
  q(3);

  let assignmentCounter = 0;
  async function grantCase(
    identity: string,
    capability: string,
    caseId: string,
  ) {
    assignmentCounter += 1;
    const result = await psql(database, `
      select public.app_workforce_case_assignment_manage_v1(
        '${AUTH_ADMIN}','review02-assign-${assignmentCounter}',
        'review02-assign-${assignmentCounter}','${HASH_A}','${EXPIRES}',
        'grant','${identity}','${capability}','${caseId}',null,null,null,
        clock_timestamp(),null,'decision:review02-assign',null
      )->>'ok';
    `);
    assert(result === "true", `scope_assignment_failed:${assignmentCounter}`);
  }
  await grantCase(adminIdentity, "evidence.review.view", CASE_A);
  await grantCase(adminIdentity, "evidence.review.decide", CASE_A);
  await grantCase(adminIdentity, "evidence.review.decide", CASE_B);
  await grantCase(reviewerIdentity, "evidence.review.view", CASE_A);
  await grantCase(reviewerIdentity, "evidence.review.decide", CASE_A);
  await grantCase(memberIdentity, "evidence.review.view", CASE_A);
  await grantCase(noCapIdentity, "evidence.review.decide", CASE_A);
  q(4);

  const pending = await psql(database, `
    select public.app_evidence_review_state_v1(
      '${AUTH_MEMBER}','${EVIDENCE_A_V1}'
    )->>'review_state';
  `);
  assert(pending === "PENDING", "pending_not_derived_from_absence");
  q(5);

  const acceptedRaw = await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_ADMIN}','${EVIDENCE_A_V1}','ACCEPTED','review02-accept-a1',
      'review02-accept-a1','${HASH_A}','${EXPIRES}'
    );
  `);
  const accepted = JSON.parse(acceptedRaw);
  assert(
    accepted.ok === true && accepted.review_state === "ACCEPTED" &&
      typeof accepted.review_decision_id === "string",
    "admin_accept_failed",
  );
  const replay = JSON.parse(await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_ADMIN}','${EVIDENCE_A_V1}','ACCEPTED','review02-accept-a1',
      'review02-accept-a1','${HASH_A}','${EXPIRES}'
    );
  `));
  assert(
    replay.ok === true &&
      replay.review_decision_id === accepted.review_decision_id,
    "identical_retry_not_idempotent",
  );
  q(6);

  const conflicting = JSON.parse(await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_ADMIN}','${EVIDENCE_A_V1}','CORRECTION_REQUIRED',
      'review02-conflict-a1','review02-conflict-a1','${HASH_B}','${EXPIRES}'
    );
  `));
  assert(
    conflicting.ok === false && conflicting.status === 409 &&
      conflicting.code === "evidence_already_decided",
    "conflicting_decision_not_denied",
  );
  q(7);

  const correction = JSON.parse(await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_REVIEWER}','${EVIDENCE_B_V1}','CORRECTION_REQUIRED',
      'review02-correction-b1','review02-correction-b1','${HASH_C}','${EXPIRES}'
    );
  `));
  assert(
    correction.ok === true &&
      correction.review_state === "CORRECTION_REQUIRED",
    "reviewer_correction_failed",
  );
  const states = await psql(database, `
    select concat_ws('|',
      public.app_evidence_review_state_v1(
        '${AUTH_MEMBER}','${EVIDENCE_A_V1}'
      )->>'review_state',
      public.app_evidence_review_state_v1(
        '${AUTH_MEMBER}','${EVIDENCE_A_V2}'
      )->>'review_state',
      public.app_evidence_review_state_v1(
        '${AUTH_MEMBER}','${EVIDENCE_B_V1}'
      )->>'review_state'
    );
  `);
  assert(
    states === "ACCEPTED|PENDING|CORRECTION_REQUIRED",
    `version_state_invalid:${states}`,
  );
  q(8);

  const noAuth = await psql(database, `
    select public.app_evidence_review_decide_v1(
      null,'${EVIDENCE_A_V2}','ACCEPTED','review02-no-auth',
      'review02-no-auth','${HASH_A}','${EXPIRES}'
    )->>'ok';
  `);
  const nonWorkforce = await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_NON_WORKFORCE}','${EVIDENCE_A_V2}','ACCEPTED',
      'review02-non-workforce','review02-non-workforce','${HASH_A}','${EXPIRES}'
    )->>'code';
  `);
  const insufficient = await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_MEMBER}','${EVIDENCE_A_V2}','ACCEPTED','review02-member-denied',
      'review02-member-denied','${HASH_A}','${EXPIRES}'
    )->>'code';
  `);
  assert(
    noAuth === "false" && nonWorkforce === "workforce_identity_missing" &&
      insufficient === "seniority_not_authorized",
    "principal_or_seniority_failure_not_closed",
  );
  q(9);

  const noCapGrant = await psql(database, `
    select id || '|' || assignment_id
    from public.app_workforce_capability_assignments
    where workforce_identity_id='${noCapIdentity}'
      and capability_code='evidence.review.decide'
      and event_type='granted'
      and supersedes_assignment_event_id is null;
  `);
  const [noCapGrantId, noCapChainId] = noCapGrant.split("|");
  await psql(database, `
    insert into public.app_workforce_capability_assignments (
      assignment_id,workforce_identity_id,capability_code,event_type,
      effective_at,valid_until,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_assignment_event_id
    ) values (
      '${noCapChainId}','${noCapIdentity}','evidence.review.decide','revoked',
      clock_timestamp(),null,'decision:no-cap','proof_revoke','actor:proof',
      'review02-no-cap-revoke','${noCapGrantId}'
    );
  `);
  const noCapability = await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_NO_CAP}','${EVIDENCE_A_V2}','ACCEPTED','review02-no-cap',
      'review02-no-cap','${HASH_A}','${EXPIRES}'
    )->>'code';
  `);
  const wrongScope = await psql(database, `
    select public.app_evidence_review_decide_v1(
      '${AUTH_REVIEWER}','${EVIDENCE_OTHER}','ACCEPTED','review02-wrong-scope',
      'review02-wrong-scope','${HASH_A}','${EXPIRES}'
    )->>'code';
  `);
  assert(
    noCapability === "capability_not_authorized" &&
      wrongScope === "case_scope_denied",
    "capability_or_scope_failure_not_closed",
  );
  q(10);

  await reject(database, `
    set local role authenticated;
    insert into public.app_evidence_review_decisions (
      evidence_version_id,case_id,decision,reviewer_workforce_identity_id,
      reviewer_scope_assignment_id,capability_code,
      authorization_policy_version_id,payload_sha256,request_id,
      idempotency_key,decided_at
    ) values (
      '${EVIDENCE_A_V2}','${CASE_A}','ACCEPTED','${adminIdentity}',
      'b8000000-0000-4000-8000-000000000001','evidence.review.decide',
      '00000000-0000-4000-8000-000000003301','${HASH_A}',
      'browser-direct','browser-direct',clock_timestamp()
    );
  `);
  await reject(database, `
    update public.app_evidence_review_decisions
    set decision='CORRECTION_REQUIRED'
    where evidence_version_id='${EVIDENCE_A_V1}';
  `);
  await reject(database, `
    delete from public.app_evidence_review_decisions
    where evidence_version_id='${EVIDENCE_A_V1}';
  `);
  q(11);

  const provenance = await psql(database, `
    select count(*)
    from public.app_evidence_review_decisions decision
    join public.app_evidence_versions evidence
      on evidence.id=decision.evidence_version_id
    join public.app_workforce_identities reviewer
      on reviewer.id=decision.reviewer_workforce_identity_id
    join public.app_workforce_scope_assignments scope
      on scope.id=decision.reviewer_scope_assignment_id
    join public.app_workforce_policy_versions policy
      on policy.id=decision.authorization_policy_version_id
    where decision.capability_code='evidence.review.decide'
      and decision.payload_sha256 ~ '^[0-9a-f]{64}$'
      and decision.request_id<>'' and decision.idempotency_key<>''
      and scope.case_id=decision.case_id;
  `);
  assert(provenance === "2", "review_audit_provenance_incomplete");
  q(12);

  const isolation = await psql(database, `
    select concat_ws('|',
      (select count(*) from public.app_evidence_versions),
      (select count(*) from public.app_location_versions),
      (select count(*) from public.app_delivery_year_compliance_source_events),
      (select count(*) from public.app_case_party_roles),
      (select count(*) from public.app_evidence_review_decisions),
      (select count(*) from public.app_evidence_review_decisions
       where evidence_version_id='${EVIDENCE_A_V1}' and decision='ACCEPTED')
    );
  `);
  assert(isolation === "4|0|0|0|2|1", `semantic_isolation_failed:${isolation}`);
  q(13);

  const closedValues = await psql(database, `
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conname='app_evidence_review_decisions_value_chk';
  `);
  assert(
    closedValues.includes("ACCEPTED") &&
      closedValues.includes("CORRECTION_REQUIRED") &&
      !closedValues.includes("PENDING"),
    "decision_contract_not_closed",
  );
  q(14);

  console.log("EVIDENCE_REVIEW_FOUNDATION_Q01_Q14=PASS");
  console.log("PENDING_DERIVED_FROM_ABSENCE=PASS");
  console.log("V1_ACCEPTED_V2_PENDING=PASS");
  console.log("BROWSER_DIRECT_MUTATION_DENIED=PASS");
  console.log("SEMANTIC_ISOLATION=PASS");
} catch (error) {
  console.error(
    `REVIEW02_PROOF_FAIL=${scrub(error instanceof Error ? error.message : String(error))}`,
  );
  Deno.exitCode = 1;
} finally {
  await dropDatabase(database);
  const after = await activeFingerprint();
  if (before !== after) {
    console.error("ACTIVE_TENANT_UNCHANGED=FAIL");
    Deno.exitCode = 1;
  } else if (!Deno.exitCode) {
    console.log("ACTIVE_TENANT_UNCHANGED=PASS");
    console.log("PERSISTENT_TEST_FIXTURES_LEFT=NO");
  }
}
