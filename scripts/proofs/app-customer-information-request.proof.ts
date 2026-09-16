import {
  normalizeCustomerInformationRequest,
} from "../../supabase/functions/api-app-customer-information-request/index.ts";

const CONTAINER = "supabase_db_enval";
const DATABASE = `enval_information_request_${
  crypto.randomUUID().replaceAll("-", "")
}`;
const HASH = "a".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";
const AUTH_WORKFORCE = "a1000000-0000-4000-8000-000000000001";
const AUTH_CUSTOMER_WIDE = "a1000000-0000-4000-8000-000000000002";
const AUTH_CUSTOMER_CASE = "a1000000-0000-4000-8000-000000000003";
const AUTH_CUSTOMER_SECOND = "a1000000-0000-4000-8000-000000000008";
const AUTH_CUSTOMER_THIRD = "a1000000-0000-4000-8000-000000000009";
const AUTH_CUSTOMER_UNCONFIRMED = "a1000000-0000-4000-8000-000000000010";
const AUTH_CUSTOMER_DELETED = "a1000000-0000-4000-8000-000000000011";
const AUTH_CUSTOMER_INACTIVE = "a1000000-0000-4000-8000-000000000012";
const CASE_AUTHORITY_LAPSE = "a3000000-0000-4000-8000-000000000008";
const CASE_AUTHORITY_LAPSE_REF = "CASE-A00000000008";
const AUTH_OTHER = "a1000000-0000-4000-8000-000000000004";
const AUTH_INFO_OTHER_CASE = "a1000000-0000-4000-8000-000000000005";
const AUTH_CORRECTION_ONLY = "a1000000-0000-4000-8000-000000000006";
const AUTH_INFO_EXPIRED = "a1000000-0000-4000-8000-000000000007";
const WORKFORCE_INFO_OTHER_CASE = "a1100000-0000-4000-8000-000000000005";
const WORKFORCE_CORRECTION_ONLY = "a1100000-0000-4000-8000-000000000006";
const WORKFORCE_INFO_EXPIRED = "a1100000-0000-4000-8000-000000000007";
const CUSTOMER_A = "a2000000-0000-4000-8000-000000000001";
const CUSTOMER_B = "a2000000-0000-4000-8000-000000000002";
const CUSTOMER_C = "a2000000-0000-4000-8000-000000000003";
const CUSTOMER_D = "a2000000-0000-4000-8000-000000000004";
const DOSSIER_IDS = [
  "a2500000-0000-4000-8000-000000000001",
  "a2500000-0000-4000-8000-000000000002",
  "a2500000-0000-4000-8000-000000000003",
  "a2500000-0000-4000-8000-000000000004",
  "a2500000-0000-4000-8000-000000000005",
  "a2500000-0000-4000-8000-000000000006",
] as const;
const CASE_IDS = [
  "a3000000-0000-4000-8000-000000000001",
  "a3000000-0000-4000-8000-000000000002",
  "a3000000-0000-4000-8000-000000000003",
  "a3000000-0000-4000-8000-000000000004",
  "a3000000-0000-4000-8000-000000000005",
  "a3000000-0000-4000-8000-000000000006",
  "a3000000-0000-4000-8000-000000000007",
] as const;
const CASE_REFS = [
  "CASE-a00000000001",
  "CASE-A00000000002",
  "CASE-A00000000003",
  "CASE-A00000000004",
  "CASE-B00000000005",
  "CASE-C00000000006",
  "CASE-U00000000007",
] as const;

type CommandResult = Readonly<{ code: number; stdout: string; stderr: string }>;
type JsonObject = Record<string, unknown>;

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
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
    throw new Error(
      (result.stderr || `${name}_failed`).replaceAll(/\s+/g, " "),
    );
  }
  return result.stdout;
}

async function psql(sql: string): Promise<string> {
  return await must("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    DATABASE,
  ], sql);
}

function concurrentPsql(sql: string): Promise<CommandResult> {
  return command("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    DATABASE,
  ], sql);
}

async function json(sql: string): Promise<JsonObject> {
  const output = await psql(sql);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "json_result_missing");
  return JSON.parse(line) as JsonObject;
}

async function setup() {
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
  await psql(`
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
    await psql(await Deno.readTextFile(path));
  }
}

async function seed() {
  await psql(`
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_WORKFORCE}','workforce@example.invalid',now(),now(),now()),
      ('${AUTH_CUSTOMER_WIDE}','customer-wide@example.invalid',now(),now(),now()),
      ('${AUTH_CUSTOMER_CASE}','customer-case@example.invalid',now(),now(),now()),
      ('${AUTH_OTHER}','other@example.invalid',now(),now(),now()),
      ('${AUTH_INFO_OTHER_CASE}','info-other-case@example.invalid',now(),now(),now()),
      ('${AUTH_CORRECTION_ONLY}','correction-only@example.invalid',now(),now(),now()),
      ('${AUTH_INFO_EXPIRED}','info-expired@example.invalid',now(),now(),now());
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_CUSTOMER_SECOND}','customer-second@example.invalid',now(),now(),now()),
      ('${AUTH_CUSTOMER_THIRD}','customer-third@example.invalid',now(),now(),now()),
      ('${AUTH_CUSTOMER_UNCONFIRMED}','customer-unconfirmed@example.invalid',null,now(),now()),
      ('${AUTH_CUSTOMER_DELETED}','customer-deleted@example.invalid',now(),now(),now()),
      ('${AUTH_CUSTOMER_INACTIVE}','customer-inactive@example.invalid',now(),now(),now());
    update auth.users set deleted_at=now()
    where id='${AUTH_CUSTOMER_DELETED}';
    insert into public.app_customers (id,customer_type,status) values
      ('${CUSTOMER_A}','particulier','active'),
      ('${CUSTOMER_B}','zakelijk','active'),
      ('${CUSTOMER_C}','vve','active'),
      ('${CUSTOMER_D}','particulier','inactive');
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values
      ('${
    DOSSIER_IDS[0]
  }','${CUSTOMER_A}','INFO-A1','particulier','submitted',now()),
      ('${
    DOSSIER_IDS[1]
  }','${CUSTOMER_A}','INFO-A2','particulier','submitted',now()),
      ('${
    DOSSIER_IDS[2]
  }','${CUSTOMER_A}','INFO-A3','particulier','submitted',now()),
      ('${
    DOSSIER_IDS[3]
  }','${CUSTOMER_A}','INFO-A4','particulier','submitted',now()),
      ('${
    DOSSIER_IDS[4]
  }','${CUSTOMER_B}','INFO-B5','zakelijk','submitted',now()),
      ('${DOSSIER_IDS[5]}','${CUSTOMER_C}','INFO-C6','vve','submitted',now());
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values (
      'a2500000-0000-4000-8000-000000000008','${CUSTOMER_A}',
      'INFO-A8','particulier','submitted',now()
    );
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values
      ('${CASE_IDS[0]}','${CUSTOMER_A}','${
    CASE_REFS[0]
  }',now(),'system','proof','app_customer_dossier','${
    DOSSIER_IDS[0]
  }','case-a1'),
      ('${CASE_IDS[1]}','${CUSTOMER_A}','${
    CASE_REFS[1]
  }',now(),'system','proof','app_customer_dossier','${
    DOSSIER_IDS[1]
  }','case-a2'),
      ('${CASE_IDS[2]}','${CUSTOMER_A}','${
    CASE_REFS[2]
  }',now(),'system','proof','app_customer_dossier','${
    DOSSIER_IDS[2]
  }','case-a3'),
      ('${CASE_IDS[3]}','${CUSTOMER_A}','${
    CASE_REFS[3]
  }',now(),'system','proof','app_customer_dossier','${
    DOSSIER_IDS[3]
  }','case-a4'),
      ('${CASE_IDS[4]}','${CUSTOMER_B}','${
    CASE_REFS[4]
  }',now(),'system','proof','app_customer_dossier','${
    DOSSIER_IDS[4]
  }','case-b5'),
      ('${CASE_IDS[5]}','${CUSTOMER_C}','${
    CASE_REFS[5]
  }',now(),'system','proof','app_customer_dossier','${
    DOSSIER_IDS[5]
  }','case-c6'),
      ('${CASE_IDS[6]}','${CUSTOMER_A}','${
    CASE_REFS[6]
  }',now(),'system','proof','unsupported','unsupported','case-u7');
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      '${CASE_AUTHORITY_LAPSE}','${CUSTOMER_A}','${CASE_AUTHORITY_LAPSE_REF}',
      now(),'system','proof','app_customer_dossier',
      'a2500000-0000-4000-8000-000000000008','case-a8'
    );
    insert into public.app_customer_identities (
      id,customer_id,auth_user_id,email_normalized,email_verified_at,status
    ) values
      ('a4000000-0000-4000-8000-000000000001','${CUSTOMER_A}',
       '${AUTH_CUSTOMER_WIDE}','customer-wide@example.invalid',now(),'active'),
      ('a4000000-0000-4000-8000-000000000002','${CUSTOMER_B}',
       '${AUTH_CUSTOMER_CASE}','customer-case@example.invalid',now(),'active'),
      ('a4000000-0000-4000-8000-000000000008','${CUSTOMER_A}',
       '${AUTH_CUSTOMER_SECOND}','customer-second@example.invalid',now(),'active'),
      ('a4000000-0000-4000-8000-000000000009','${CUSTOMER_A}',
       '${AUTH_CUSTOMER_THIRD}','customer-third@example.invalid',now(),'active'),
      ('a4000000-0000-4000-8000-000000000010','${CUSTOMER_A}',
       '${AUTH_CUSTOMER_UNCONFIRMED}','customer-unconfirmed@example.invalid',now(),'active'),
      ('a4000000-0000-4000-8000-000000000011','${CUSTOMER_A}',
       '${AUTH_CUSTOMER_DELETED}','customer-deleted@example.invalid',now(),'active'),
      ('a4000000-0000-4000-8000-000000000012','${CUSTOMER_A}',
       '${AUTH_CUSTOMER_INACTIVE}','customer-inactive@example.invalid',now(),'inactive');
    insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values
      ('${AUTH_CUSTOMER_WIDE}','${CUSTOMER_A}',null,
       'bound_customer_identity','app_customer_identity','proof-wide','grant-wide'),
      ('${AUTH_CUSTOMER_CASE}','${CUSTOMER_B}','${CASE_IDS[4]}',
       'signed_case_contact','app_signup_promotion','proof-case','grant-case'),
      ('${AUTH_CUSTOMER_CASE}','${CUSTOMER_C}','${CASE_IDS[5]}',
       'signed_case_contact','app_signup_promotion','proof-context',
       'grant-context'),
      ('${AUTH_CUSTOMER_SECOND}','${CUSTOMER_A}',null,
       'bound_customer_identity','app_customer_identity','proof-second',
       'grant-second'),
      ('${AUTH_CUSTOMER_THIRD}','${CUSTOMER_A}',null,
       'bound_customer_identity','app_customer_identity','proof-third',
       'grant-third'),
      ('${AUTH_CUSTOMER_UNCONFIRMED}','${CUSTOMER_A}',null,
       'bound_customer_identity','app_customer_identity','proof-unconfirmed',
       'grant-unconfirmed'),
      ('${AUTH_CUSTOMER_DELETED}','${CUSTOMER_A}',null,
       'bound_customer_identity','app_customer_identity','proof-deleted',
       'grant-deleted'),
      ('${AUTH_CUSTOMER_INACTIVE}','${CUSTOMER_A}',null,
       'bound_customer_identity','app_customer_identity','proof-inactive',
       'grant-inactive');
  `);
  const bootstrap = await json(
    `select public.app_workforce_first_admin_bootstrap_v1(
    '${AUTH_WORKFORCE}','local','enval','info-bootstrap','info-bootstrap',
    '${HASH}','${EXPIRES}','decision:info-bootstrap'
  )::text;`,
  );
  assert(bootstrap.ok === true, "workforce_bootstrap_failed");
  await psql(`
    with identity as (
      select id from public.app_workforce_identities
      where auth_user_id='${AUTH_WORKFORCE}'
    ), capability as (
      select assignment.id,assignment.capability_code
      from public.app_workforce_capability_assignments assignment,identity
      where assignment.workforce_identity_id=identity.id
        and assignment.capability_code in (
          'customer.information_request.manage',
          'evidence.review.correction.publish','evidence.review.decide',
          'evidence.review.view'
        ) and assignment.event_type='granted'
        and assignment.supersedes_assignment_event_id is null
    ), cases as (
      select unnest(array[
        '${CASE_IDS[0]}'::uuid,'${CASE_IDS[1]}'::uuid,
        '${CASE_IDS[2]}'::uuid,'${CASE_IDS[3]}'::uuid,
        '${CASE_IDS[4]}'::uuid,'${CASE_IDS[5]}'::uuid,
        '${CASE_IDS[6]}'::uuid,'${CASE_AUTHORITY_LAPSE}'::uuid
      ]) case_id
    )
    insert into public.app_workforce_scope_assignments (
      scope_assignment_id,workforce_identity_id,capability_assignment_id,
      capability_code,case_id,location_id,case_location_relation_id,event_type,
      effective_at,decision_ref,recorded_by_actor_ref,request_id
    )
    select gen_random_uuid(),identity.id,capability.id,capability.capability_code,
      cases.case_id,null,null,'granted',now(),'proof-scope','proof',
      'info-scope-' || md5(cases.case_id::text || capability.capability_code)
    from identity,cases,capability;

    begin;
    insert into public.app_workforce_identities (
      id,auth_user_id,created_by_actor_ref,creation_decision_ref,request_id
    ) values
      ('${WORKFORCE_INFO_OTHER_CASE}','${AUTH_INFO_OTHER_CASE}',
       'proof','proof','identity-info-other-case'),
      ('${WORKFORCE_CORRECTION_ONLY}','${AUTH_CORRECTION_ONLY}',
       'proof','proof','identity-correction-only'),
      ('${WORKFORCE_INFO_EXPIRED}','${AUTH_INFO_EXPIRED}',
       'proof','proof','identity-info-expired');
    insert into public.app_workforce_identity_states (
      workforce_identity_id,state,effective_at,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_state_id
    ) values
      ('${WORKFORCE_INFO_OTHER_CASE}','active','2026-09-11T00:00:00Z',
       'proof',null,'proof','state-info-other-case',null),
      ('${WORKFORCE_CORRECTION_ONLY}','active','2026-09-11T00:00:00Z',
       'proof',null,'proof','state-correction-only',null),
      ('${WORKFORCE_INFO_EXPIRED}','active','2026-09-11T00:00:00Z',
       'proof',null,'proof','state-info-expired',null);
    insert into public.app_workforce_seniority_assignments (
      assignment_id,workforce_identity_id,seniority,effective_at,
      decision_ref,reason_ref,recorded_by_actor_ref,request_id,
      supersedes_seniority_assignment_id
    ) values
      (gen_random_uuid(),'${WORKFORCE_INFO_OTHER_CASE}','reviewer',
       '2026-09-11T00:00:00Z','proof',null,'proof',
       'seniority-info-other-case',null),
      (gen_random_uuid(),'${WORKFORCE_CORRECTION_ONLY}','reviewer',
       '2026-09-11T00:00:00Z','proof',null,'proof',
       'seniority-correction-only',null),
      (gen_random_uuid(),'${WORKFORCE_INFO_EXPIRED}','reviewer',
       '2026-09-11T00:00:00Z','proof',null,'proof',
       'seniority-info-expired',null);
    insert into public.app_workforce_capability_assignments (
      id,assignment_id,workforce_identity_id,capability_code,event_type,
      effective_at,valid_until,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_assignment_event_id
    ) values
      ('a1300000-0000-4000-8000-000000000005',
       'a1200000-0000-4000-8000-000000000005',
       '${WORKFORCE_INFO_OTHER_CASE}','customer.information_request.manage',
       'granted','2026-09-11T00:01:00Z',null,'proof',null,'proof',
       'capability-info-other-case',null),
      ('a1300000-0000-4000-8000-000000000006',
       'a1200000-0000-4000-8000-000000000006',
       '${WORKFORCE_CORRECTION_ONLY}','evidence.review.correction.publish',
       'granted','2026-09-11T00:01:00Z',null,'proof',null,'proof',
       'capability-correction-only',null),
      ('a1300000-0000-4000-8000-000000000007',
       'a1200000-0000-4000-8000-000000000007',
       '${WORKFORCE_INFO_EXPIRED}','customer.information_request.manage',
       'granted','2026-09-11T00:01:00Z',null,'proof',null,'proof',
       'capability-info-expired',null);
    insert into public.app_workforce_scope_assignments (
      scope_assignment_id,workforce_identity_id,capability_assignment_id,
      capability_code,case_id,location_id,case_location_relation_id,event_type,
      effective_at,valid_until,decision_ref,reason_ref,
      recorded_by_actor_ref,request_id,supersedes_scope_event_id
    ) values
      (gen_random_uuid(),'${WORKFORCE_INFO_OTHER_CASE}',
       'a1300000-0000-4000-8000-000000000005',
       'customer.information_request.manage','${CASE_IDS[1]}',null,null,
       'granted','2026-09-11T00:02:00Z',null,'proof',null,'proof',
       'scope-info-other-case',null),
      (gen_random_uuid(),'${WORKFORCE_CORRECTION_ONLY}',
       'a1300000-0000-4000-8000-000000000006',
       'evidence.review.correction.publish','${CASE_IDS[0]}',null,null,
       'granted','2026-09-11T00:02:00Z',null,'proof',null,'proof',
       'scope-correction-only',null),
      (gen_random_uuid(),'${WORKFORCE_INFO_EXPIRED}',
       'a1300000-0000-4000-8000-000000000007',
       'customer.information_request.manage','${CASE_IDS[0]}',null,null,
       'granted','2026-09-11T00:02:00Z','2026-09-11T01:00:00Z',
       'proof',null,'proof','scope-info-expired',null);
    commit;
  `);
}

function createSql(
  caseRef: string,
  suffix: string,
  question = "Welke toelichting kunt u geven?",
) {
  return `select public.app_customer_information_request_create_v1(
    '${AUTH_WORKFORCE}','${caseRef}','${question}',
    'create-${suffix}','create-${suffix}','${HASH}','${EXPIRES}',
    jsonb_build_object(
      'organization_name','ENVAL',
      'portal_origin','http://127.0.0.1:5175'
    )
  )::text;`;
}

async function runProof() {
  assert(
    !normalizeCustomerInformationRequest({
      action: "create",
      caseRef: CASE_REFS[0],
      question: "regel een\nregel twee",
    }) &&
      !normalizeCustomerInformationRequest({
        action: "respond",
        caseRef: CASE_REFS[0],
        requestRef: "IRQ-0123456789ABCDEF",
        answer: "antwoord",
        authUserId: AUTH_CUSTOMER_WIDE,
      }),
    "edge_input_authority_not_fail_closed",
  );
  const acl = await psql(`select concat_ws('|',
    has_function_privilege('service_role','public.app_customer_information_request_customer_read_v1(uuid,text)','EXECUTE'),
    has_function_privilege('anon','public.app_customer_information_request_customer_read_v1(uuid,text)','EXECUTE'),
    has_function_privilege('authenticated','public.app_customer_information_request_customer_read_v1(uuid,text)','EXECUTE'),
    has_function_privilege('service_role','public.app_customer_information_request_create_v1(uuid,text,text,text,text,text,timestamptz,jsonb)','EXECUTE'),
    has_function_privilege('anon','public.app_customer_information_request_create_v1(uuid,text,text,text,text,text,timestamptz,jsonb)','EXECUTE'),
    has_function_privilege('service_role','public.app_customer_information_request_history_projection_v1(uuid,uuid)','EXECUTE'),
    has_function_privilege('anon','public.app_customer_information_request_history_projection_v1(uuid,uuid)','EXECUTE'),
    has_function_privilege('authenticated','public.app_customer_information_request_history_projection_v1(uuid,uuid)','EXECUTE'),
    has_function_privilege('service_role','public.app_customer_information_request_projection_v1(uuid)','EXECUTE'),
    has_function_privilege('anon','public.app_customer_information_request_projection_v1(uuid)','EXECUTE'),
    has_function_privilege('authenticated','public.app_customer_information_request_projection_v1(uuid)','EXECUTE'),
    has_table_privilege('anon','public.app_customer_information_requests','SELECT'),
    has_table_privilege('authenticated','public.app_customer_information_responses','SELECT'),
    has_table_privilege('anon','public.app_workflow_email_dispatches','SELECT'),
    has_table_privilege('service_role','public.app_workflow_email_dispatches','SELECT'),
    has_function_privilege('service_role','public.app_customer_information_request_email_notify_v1(text,uuid,text,text,jsonb)','EXECUTE')
  );`);
  assert(
    acl === "t|f|f|t|f|f|f|f|f|f|f|f|f|f|f|f",
    `acl_invalid:${acl}`,
  );
  const [anonHistoryDirect, authenticatedReadDirect] = await Promise.all([
    concurrentPsql(`set role anon;
      select public.app_customer_information_request_history_projection_v1(
        '${CASE_IDS[0]}','${CUSTOMER_A}'
      );`),
    concurrentPsql(`set role authenticated;
      select public.app_customer_information_request_customer_read_v1(
        '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[0]}'
      );`),
  ]);
  assert(
    anonHistoryDirect.code !== 0 &&
      anonHistoryDirect.stderr.includes("permission denied for function") &&
      authenticatedReadDirect.code !== 0 &&
      authenticatedReadDirect.stderr.includes("permission denied for function"),
    "direct_browser_function_access_allowed",
  );

  const scopeContract = await psql(`select concat_ws('|',
    (select count(*) from pg_constraint
     where conrelid='public.app_workforce_scope_assignments'::regclass
       and conname='app_workforce_scope_assignments_capability_chk'
       and convalidated
       and pg_get_constraintdef(oid) like '%customer.information_request.manage%'),
    (select count(*) from pg_constraint
     where conrelid='public.app_workforce_scope_assignments'::regclass
       and conname='app_workforce_scope_assignments_shape_chk'
       and convalidated
       and pg_get_constraintdef(oid) like '%customer.information_request.manage%'),
    (select count(*) from public.app_workforce_scope_assignments
     where capability_code='customer.information_request.manage'
       and case_id is not null and location_id is null
       and case_location_relation_id is null),
    (select count(*) from public.app_workforce_scope_assignments
     where capability_code<>'customer.information_request.manage')
  );`);
  assert(
    scopeContract === "1|1|10|25",
    `scope_contract_invalid:${scopeContract}`,
  );

  const invalidScopes = await psql(`do $$ begin
    begin
      insert into public.app_workforce_scope_assignments (
        scope_assignment_id,workforce_identity_id,capability_assignment_id,
        capability_code,case_id,event_type,effective_at,decision_ref,
        recorded_by_actor_ref,request_id
      ) select gen_random_uuid(),identity.id,capability.id,
        'unknown.customer.capability','${CASE_IDS[0]}','granted',now(),
        'invalid-unknown-scope','proof','invalid-unknown-scope'
      from public.app_workforce_identities identity
      join public.app_workforce_capability_assignments capability
        on capability.workforce_identity_id=identity.id
       and capability.capability_code='customer.information_request.manage'
       and capability.event_type='granted'
      where identity.auth_user_id='${AUTH_WORKFORCE}';
      raise exception 'unknown_scope_was_allowed';
    exception when check_violation then null; end;
    begin
      insert into public.app_workforce_scope_assignments (
        scope_assignment_id,workforce_identity_id,capability_assignment_id,
        capability_code,case_id,event_type,effective_at,decision_ref,
        recorded_by_actor_ref,request_id
      ) values (
        gen_random_uuid(),'${WORKFORCE_INFO_OTHER_CASE}',gen_random_uuid(),
        'customer.information_request.manage','${CASE_IDS[0]}','granted',now(),
        'invalid-loose-scope','proof','invalid-loose-scope'
      );
      raise exception 'loose_scope_was_allowed';
    exception when check_violation or foreign_key_violation then null; end;
  end $$;
  select 'denied';`);
  assert(invalidScopes === "denied", "invalid_scope_not_rejected");

  const authorityMatrix = await psql(`select concat_ws('|',
    (public.app_workforce_authorize_v1('${AUTH_WORKFORCE}',
      'customer.information_request.manage','${
    CASE_IDS[0]
  }',null,now())->>'ok'),
    (public.app_workforce_authorize_v1('${AUTH_INFO_OTHER_CASE}',
      'customer.information_request.manage','${
    CASE_IDS[0]
  }',null,now())->>'ok'),
    (public.app_workforce_authorize_v1('${AUTH_INFO_OTHER_CASE}',
      'customer.information_request.manage','${
    CASE_IDS[1]
  }',null,now())->>'ok'),
    (public.app_workforce_authorize_v1('${AUTH_CORRECTION_ONLY}',
      'customer.information_request.manage','${
    CASE_IDS[0]
  }',null,now())->>'ok'),
    (public.app_workforce_authorize_v1('${AUTH_INFO_EXPIRED}',
      'customer.information_request.manage','${
    CASE_IDS[0]
  }',null,now())->>'ok'),
    (public.app_workforce_authorize_v1('${AUTH_INFO_OTHER_CASE}',
      'evidence.review.correction.publish','${CASE_IDS[1]}',null,now())->>'ok'),
    (public.app_workforce_authorize_v1('${AUTH_WORKFORCE}',
      'evidence.review.correction.publish','${CASE_IDS[0]}',null,now())->>'ok')
  );`);
  assert(
    authorityMatrix === "true|false|true|false|false|false|true",
    `authority_matrix_invalid:${authorityMatrix}`,
  );

  const writesBeforeUnsupported = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const unsupportedCreate = await json(createSql(CASE_REFS[6], "unsupported"));
  const unsupportedRead = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[6]}'
  )::text;`,
  );
  const unsupportedRespond = await json(
    `select public.app_customer_information_request_respond_v1(
    '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[6]}','IRQ-0123456789ABCDEF',
    'Dit antwoord mag niet worden opgeslagen.','respond-unsupported',
    'respond-unsupported','${HASH}','${EXPIRES}'
  )::text;`,
  );
  const writesAfterUnsupported = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  assert(
    unsupportedCreate.status === 404 && unsupportedRead.status === 404 &&
      unsupportedRespond.status === 404 &&
      writesAfterUnsupported === writesBeforeUnsupported,
    "unsupported_case_lineage_not_fail_closed",
  );

  const writesBeforeAuthorityDenials = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const wrongCaseCreate = await json(
    `select public.app_customer_information_request_create_v1(
      '${AUTH_INFO_OTHER_CASE}','${CASE_REFS[0]}','Niet opslaan.',
      'deny-wrong-case','deny-wrong-case','${HASH}','${EXPIRES}'
    )::text;`,
  );
  const correctionOnlyCreate = await json(
    `select public.app_customer_information_request_create_v1(
      '${AUTH_CORRECTION_ONLY}','${CASE_REFS[0]}','Niet opslaan.',
      'deny-correction-only','deny-correction-only','${HASH}','${EXPIRES}'
    )::text;`,
  );
  const expiredCreate = await json(
    `select public.app_customer_information_request_create_v1(
      '${AUTH_INFO_EXPIRED}','${CASE_REFS[0]}','Niet opslaan.',
      'deny-expired','deny-expired','${HASH}','${EXPIRES}'
    )::text;`,
  );
  const writesAfterAuthorityDenials = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  assert(
    wrongCaseCreate.ok !== true && correctionOnlyCreate.ok !== true &&
      expiredCreate.ok !== true &&
      writesAfterAuthorityDenials === writesBeforeAuthorityDenials,
    "workforce_authority_denial_wrote_state",
  );

  const created = await json(createSql(CASE_REFS[0], "a1"));
  assert(created.ok === true && created.code === "created", "create_failed");
  const request = created.request as JsonObject;
  const requestRef = String(request.request_ref);
  const replay = await json(createSql(CASE_REFS[0], "a1"));
  assert(
    replay.code === "created" && replay.request &&
      (replay.request as JsonObject).request_ref === requestRef,
    "create_retry_not_idempotent",
  );
  const deniedWithdraw = await json(
    `select public.app_customer_information_request_transition_v1(
      '${AUTH_INFO_OTHER_CASE}','${CASE_REFS[0]}','${requestRef}','WITHDRAW',
      'deny-withdraw','deny-withdraw','${HASH}','${EXPIRES}'
    )::text;`,
  );
  assert(deniedWithdraw.ok !== true, "withdraw_without_exact_scope_allowed");
  const second = await json(createSql(CASE_REFS[0], "a1-second"));
  assert(
    second.code === "information_request_already_active",
    "second_active_allowed",
  );
  const createdMail = await psql(`select concat_ws('|',
    count(*),
    count(distinct recipient_ref),
    string_agg(recipient_ref::text,',' order by recipient_ref),
    min(template_key),
    min(frozen_subject),
    bool_and(frozen_body = E'Beste klant,\n\nENVAL heeft een vraag over uw aanvraag.\n\nAanvraag: INFO-A1\nDossiernummer: ${
    CASE_REFS[0]
  }\n\nBekijk en beantwoord de vraag in uw klantportaal:\nhttp://127.0.0.1:5175/dashboard/aanvragen/${
    CASE_REFS[0]
  }\n\nMet vriendelijke groet,\nENVAL'),
    bool_and(frozen_body not like '%Welke toelichting%'),
    bool_and(template_variables ?& array[
      'organization_name','application_label','case_reference','action_url'
    ] and (
      select count(*)=4
      from pg_catalog.jsonb_object_keys(template_variables)
    )),
    bool_and(template_variables->>'case_reference'='${CASE_REFS[0]}')
  ) from public.app_workflow_email_intents
  where event_type='information_request_created_customer'
    and business_event_ref='${requestRef}';`);
  assert(
    createdMail ===
      `3|3|${AUTH_CUSTOMER_WIDE},${AUTH_CUSTOMER_SECOND},${AUTH_CUSTOMER_THIRD}|information-request-created-customer-nl-v2|Er staat een vraag voor u klaar|t|t|t|t`,
    `created_recipient_or_template_invalid:${createdMail}`,
  );
  const mismatchedCaseReference = await concurrentPsql(`select
    public.app_workflow_email_enqueue_v1(
      'information_request_created_customer',
      'information-request-created-customer-nl-v2',
      'IRQ-FFFFFFFFFFFFFFF1','customer','${AUTH_CUSTOMER_WIDE}',
      'customer-wide@proof.invalid',jsonb_build_object(
        'organization_name','ENVAL','application_label','INFO-A1',
        'case_reference','${CASE_REFS[1]}','action_url',
        'http://127.0.0.1:5175/dashboard/aanvragen/${CASE_REFS[0]}'
      ),'information-request:case-reference-mismatch'
    );`);
  assert(
    mismatchedCaseReference.code !== 0 &&
      mismatchedCaseReference.stderr.includes(
        "workflow_email_template_variables_invalid",
      ),
    "mismatched_case_reference_not_rejected",
  );
  const extraV2Variable = await concurrentPsql(`select
    public.app_workflow_email_enqueue_v1(
      'information_request_created_customer',
      'information-request-created-customer-nl-v2',
      'IRQ-FFFFFFFFFFFFFFF2','customer','${AUTH_CUSTOMER_WIDE}',
      'customer-wide@proof.invalid',jsonb_build_object(
        'organization_name','ENVAL','application_label','INFO-A1',
        'case_reference','${CASE_REFS[0]}','action_url',
        'http://127.0.0.1:5175/dashboard/aanvragen/${CASE_REFS[0]}',
        'question','mag niet mee'
      ),'information-request:extra-v2-variable'
    );`);
  assert(
    extraV2Variable.code !== 0 &&
      extraV2Variable.stderr.includes(
        "workflow_email_template_variables_invalid",
      ),
    "extra_v2_template_variable_not_rejected",
  );

  const wideRead = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[0]}'
  )::text;`,
  );
  const activeTerminal = await psql(`select concat_ws('|',
    information_request.terminal_action is null,
    information_request.terminal_at is null,
    response.id is null
  )
  from public.app_customer_information_requests information_request
  left join public.app_customer_information_responses response
    on response.information_request_id=information_request.id
  where information_request.request_reference='${requestRef}';`);
  const caseDenied = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_CUSTOMER_CASE}','${CASE_REFS[0]}'
  )::text;`,
  );
  const otherDenied = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_OTHER}','${CASE_REFS[0]}'
  )::text;`,
  );
  assert(
    wideRead.ok === true && (wideRead.request as JsonObject).state === "OPEN" &&
      (wideRead.request as JsonObject).terminal_at === null &&
      Array.isArray(wideRead.history) && wideRead.history.length === 0 &&
      activeTerminal === "t|t|t" && caseDenied.status === 404 &&
      otherDenied.status === 404,
    "r7_read_authority_invalid",
  );

  const answered = await json(
    `select public.app_customer_information_request_respond_v1(
    '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[0]}','${requestRef}',
    'Dit is het antwoord.','respond-a1','respond-a1','${HASH}','${EXPIRES}',
    jsonb_build_object(
      'organization_name','ENVAL',
      'portal_origin','http://127.0.0.1:5175'
    )
  )::text;`,
  );
  const answerReplay = await json(
    `select public.app_customer_information_request_respond_v1(
    '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[0]}','${requestRef}',
    'Dit is het antwoord.','respond-a1','respond-a1','${HASH}','${EXPIRES}',
    jsonb_build_object(
      'organization_name','ENVAL',
      'portal_origin','http://127.0.0.1:5175'
    )
  )::text;`,
  );
  assert(
    answered.code === "answered" && answerReplay.code === "answered" &&
      (answered.request as JsonObject).state === "ANSWERED" &&
      (answered.request as JsonObject).terminal_at === null,
    "respond_or_retry_failed",
  );
  const answeredTerminal = await psql(`select concat_ws('|',
    information_request.terminal_action is null,
    information_request.terminal_at is null,
    response.id is not null
  )
  from public.app_customer_information_requests information_request
  left join public.app_customer_information_responses response
    on response.information_request_id=information_request.id
  where information_request.request_reference='${requestRef}';`);
  assert(answeredTerminal === "t|t|t", "answered_terminal_at_not_null");
  const answeredMail = await psql(`select concat_ws('|',
    count(*),min(recipient_ref::text),min(frozen_subject),
    bool_and(frozen_body = E'Beste medewerker,\n\nDe klant heeft uw vraag over deze aanvraag beantwoord.\n\nAanvraag: INFO-A1\nDossiernummer: ${
    CASE_REFS[0]
  }\n\nBekijk het antwoord in Dossierbeheer:\nhttp://127.0.0.1:5175/beheer/dossiers/${
    CASE_REFS[0]
  }\n\nDit is een automatische melding van ENVAL.'),
    bool_and(frozen_body not like '%Dit is het antwoord%'),
    bool_and(frozen_body not like '%Welke toelichting%'),
    bool_and(template_variables->>'case_reference'='${CASE_REFS[0]}'
      and (select count(*)=4
        from pg_catalog.jsonb_object_keys(template_variables)))
  ) from public.app_workflow_email_intents
  where event_type='information_request_answered_workforce'
    and business_event_ref='${requestRef}';`);
  assert(
    answeredMail ===
      `1|${AUTH_WORKFORCE}|Uw vraag is beantwoord|t|t|t|t`,
    `answer_creator_recipient_invalid:${answeredMail}`,
  );
  const deniedResolve = await json(
    `select public.app_customer_information_request_transition_v1(
      '${AUTH_CORRECTION_ONLY}','${CASE_REFS[0]}','${requestRef}','RESOLVE',
      'deny-resolve','deny-resolve','${HASH}','${EXPIRES}'
    )::text;`,
  );
  assert(deniedResolve.ok !== true, "resolve_without_exact_scope_allowed");
  const resolved = await json(
    `select public.app_customer_information_request_transition_v1(
    '${AUTH_WORKFORCE}','${CASE_REFS[0]}','${requestRef}','RESOLVE',
    'resolve-a1','resolve-a1','${HASH}','${EXPIRES}'
  )::text;`,
  );
  const resolveReplay = await json(
    `select public.app_customer_information_request_transition_v1(
    '${AUTH_WORKFORCE}','${CASE_REFS[0]}','${requestRef}','RESOLVE',
    'resolve-a1','resolve-a1','${HASH}','${EXPIRES}'
  )::text;`,
  );
  assert(
    resolved.code === "resolved" && resolveReplay.code === "resolved",
    "resolve_retry_failed",
  );
  const writesBeforeResolvedHistory = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const resolvedCustomerHistory = await json(
    `select public.app_customer_information_request_customer_read_v1(
      '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[0]}'
    )::text;`,
  );
  const resolvedWorkforceHistory = await json(
    `select public.app_customer_information_request_workforce_read_v1(
      '${AUTH_WORKFORCE}','${CASE_REFS[0]}'
    )::text;`,
  );
  const deniedWorkforceHistory = await json(
    `select public.app_customer_information_request_workforce_read_v1(
      '${AUTH_INFO_OTHER_CASE}','${CASE_REFS[0]}'
    )::text;`,
  );
  const writesAfterResolvedHistory = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const resolvedHistory = resolvedCustomerHistory.history as JsonObject[];
  const workforceResolvedHistory = resolvedWorkforceHistory
    .history as JsonObject[];
  const resolvedHistoryTimes = await psql(`select concat_ws('|',
    (history.entry->>'asked_at')::timestamptz=information_request.created_at,
    (history.entry->>'answered_at')::timestamptz=response.responded_at,
    (history.entry->>'terminal_at')::timestamptz=information_request.terminal_at
  )
  from public.app_customer_information_requests information_request
  join public.app_customer_information_responses response
    on response.information_request_id=information_request.id
  cross join lateral (
    select public.app_customer_information_request_history_projection_v1(
      information_request.case_id,
      information_request.target_customer_id
    )->0 as entry
  ) history
  where information_request.request_reference='${requestRef}';`);
  assert(
    resolvedCustomerHistory.request === null && resolvedHistory.length === 1 &&
      resolvedHistory[0].outcome === "RESOLVED" &&
      resolvedHistory[0].question === "Welke toelichting kunt u geven?" &&
      resolvedHistory[0].answer === "Dit is het antwoord." &&
      typeof resolvedHistory[0].asked_at === "string" &&
      typeof resolvedHistory[0].answered_at === "string" &&
      typeof resolvedHistory[0].terminal_at === "string" &&
      resolvedHistoryTimes === "t|t|t" &&
      workforceResolvedHistory.length === 1 &&
      workforceResolvedHistory[0].request_ref ===
        resolvedHistory[0].request_ref &&
      workforceResolvedHistory[0].outcome === resolvedHistory[0].outcome &&
      workforceResolvedHistory[0].question === resolvedHistory[0].question &&
      workforceResolvedHistory[0].answer === resolvedHistory[0].answer &&
      workforceResolvedHistory[0].asked_at === resolvedHistory[0].asked_at &&
      workforceResolvedHistory[0].answered_at ===
        resolvedHistory[0].answered_at &&
      workforceResolvedHistory[0].terminal_at ===
        resolvedHistory[0].terminal_at &&
      deniedWorkforceHistory.ok !== true &&
      writesAfterResolvedHistory === writesBeforeResolvedHistory,
    "resolved_history_contract_or_authority_invalid",
  );
  const storedProvenance = await psql(`select concat_ws('|',
    created_scope.capability_code,
    (created_scope.case_id=request_row.case_id)::text,
    terminal_scope.capability_code,
    (terminal_scope.case_id=request_row.case_id)::text
  )
  from public.app_customer_information_requests request_row
  join public.app_workforce_scope_assignments created_scope
    on created_scope.id=request_row.created_by_scope_assignment_id
  join public.app_workforce_scope_assignments terminal_scope
    on terminal_scope.id=request_row.terminal_scope_assignment_id
  where request_row.request_reference='${requestRef}';`);
  assert(
    storedProvenance ===
      "customer.information_request.manage|true|customer.information_request.manage|true",
    `stored_scope_provenance_invalid:${storedProvenance}`,
  );

  const withdrawCreated = await json(createSql(CASE_REFS[1], "a2"));
  const withdrawRef = String(
    (withdrawCreated.request as JsonObject).request_ref,
  );
  const withdrawn = await json(
    `select public.app_customer_information_request_transition_v1(
    '${AUTH_WORKFORCE}','${CASE_REFS[1]}','${withdrawRef}','WITHDRAW',
    'withdraw-a2','withdraw-a2','${HASH}','${EXPIRES}',
    jsonb_build_object(
      'organization_name','ENVAL',
      'portal_origin','http://127.0.0.1:5175'
    )
  )::text;`,
  );
  assert(withdrawn.code === "withdrawn", "withdraw_failed");
  const preDeliveryWithdraw = await psql(`select concat_ws('|',
    (select count(*) from public.app_workflow_email_intents
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${withdrawRef}'),
    (select count(*) from public.app_workflow_email_deliveries delivery
      join public.app_workflow_email_intents intent on intent.id=delivery.intent_id
      where intent.event_type='information_request_created_customer'
        and intent.business_event_ref='${withdrawRef}'
        and delivery.status='cancelled'),
    (select outcome from public.app_workflow_email_dispatches
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${withdrawRef}')
  );`);
  assert(
    preDeliveryWithdraw === "0|3|cancelled_before_delivery",
    `pre_delivery_withdraw_invalid:${preDeliveryWithdraw}`,
  );
  const withdrawnCustomerHistory = await json(
    `select public.app_customer_information_request_customer_read_v1(
      '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[1]}'
    )::text;`,
  );
  const withdrawnHistory = withdrawnCustomerHistory.history as JsonObject[];
  const withdrawnHistoryTimes = await psql(`select concat_ws('|',
    (history.entry->>'asked_at')::timestamptz=information_request.created_at,
    (history.entry->>'terminal_at')::timestamptz=information_request.terminal_at
  )
  from public.app_customer_information_requests information_request
  cross join lateral (
    select public.app_customer_information_request_history_projection_v1(
      information_request.case_id,
      information_request.target_customer_id
    )->0 as entry
  ) history
  where information_request.request_reference='${withdrawRef}';`);
  assert(
    withdrawnCustomerHistory.request === null &&
      withdrawnHistory.length === 1 &&
      withdrawnHistory[0].outcome === "WITHDRAWN" &&
      withdrawnHistory[0].question === "Welke toelichting kunt u geven?" &&
      withdrawnHistory[0].answer === null &&
      withdrawnHistory[0].answered_at === null &&
      typeof withdrawnHistory[0].terminal_at === "string" &&
      withdrawnHistoryTimes === "t|t",
    "withdrawn_history_contract_invalid",
  );

  const lockDefinition = await psql(`select position(
    'FOR UPDATE OF DELIVERY' in upper(pg_get_functiondef(
      'public.app_customer_information_request_email_notify_v1(text,uuid,text,text,jsonb)'::regprocedure
    ))) > 0;`);
  assert(lockDefinition === "t", "withdraw_delivery_lock_missing");

  const withdrawRaceCreated = await json(
    createSql(CASE_REFS[1], "withdraw-race"),
  );
  const raceRef = String(
    (withdrawRaceCreated.request as JsonObject).request_ref,
  );
  await psql(`begin;
    set local session_replication_role=replica;
    update public.app_workflow_email_deliveries
    set next_attempt_at='2030-01-01T00:00:00Z';
    with ranked as (
      select delivery.id,row_number() over(order by intent.recipient_ref) as n
      from public.app_workflow_email_deliveries delivery
      join public.app_workflow_email_intents intent on intent.id=delivery.intent_id
      where intent.event_type='information_request_created_customer'
        and intent.business_event_ref='${raceRef}'
    )
    update public.app_workflow_email_deliveries delivery
    set status=case when ranked.n=1 then 'queued' else 'cancelled' end,
        next_attempt_at=case when ranked.n=1 then now() else delivery.next_attempt_at end,
        cancelled_at=case when ranked.n=1 then null else now() end,
        updated_at=now()
    from ranked where delivery.id=ranked.id;
    set local session_replication_role=origin;
    commit;`);

  const advisoryKey = 726551901;
  const worker = concurrentPsql(`begin;
    select
      claim->'delivery'->>'delivery_id' as delivery_id,
      claim->'delivery'->>'lease_token' as lease_token
    from (select public.app_workflow_email_claim_v1() claim) claimed
    \\gset
    select pg_advisory_lock(${advisoryKey});
    select pg_sleep(2);
    select public.app_workflow_email_complete_v1(
      :'delivery_id'::uuid, :'lease_token'::uuid, 'provider_accepted',
      'proof:withdraw-race', null
    );
    select pg_advisory_unlock(${advisoryKey});
    commit;`);

  let workerHasDeliveryLock = false;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (
      await psql(`select not pg_try_advisory_lock(${advisoryKey});`) === "t"
    ) {
      workerHasDeliveryLock = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (!workerHasDeliveryLock) {
    const workerFailure = await worker;
    throw new Error(
      `worker_claim_lock_not_observed:${
        workerFailure.stderr || workerFailure.stdout
      }`,
    );
  }

  const concurrentWithdraw = concurrentPsql(`select
    public.app_customer_information_request_transition_v1(
      '${AUTH_WORKFORCE}','${CASE_REFS[1]}','${raceRef}','WITHDRAW',
      'withdraw-race','withdraw-race','${HASH}','${EXPIRES}',
      jsonb_build_object(
        'organization_name','ENVAL',
        'portal_origin','http://127.0.0.1:5175'
      )
    )::text;`);
  const [workerResult, withdrawResult] = await Promise.all([
    worker,
    concurrentWithdraw,
  ]);
  assert(
    workerResult.code === 0,
    `concurrent_worker_failed:${workerResult.stderr}`,
  );
  assert(
    withdrawResult.code === 0 &&
      withdrawResult.stdout.includes('"code": "withdrawn"'),
    `concurrent_withdraw_failed:${
      withdrawResult.stderr || withdrawResult.stdout
    }`,
  );
  const raceState = await psql(`select concat_ws('|',
    (select terminal_action from public.app_customer_information_requests
      where request_reference='${raceRef}'),
    (select count(*) from public.app_workflow_email_deliveries delivery
      join public.app_workflow_email_intents intent on intent.id=delivery.intent_id
      where intent.business_event_ref='${raceRef}'
        and intent.event_type='information_request_created_customer'
        and delivery.status='provider_accepted'),
    (select count(*) from public.app_workflow_email_intents
      where business_event_ref='${raceRef}'
        and event_type='information_request_withdrawn_customer')
  );`);
  assert(
    raceState === "WITHDRAWN|1|1",
    `concurrent_claim_withdraw_not_serialized:${raceState}`,
  );

  await psql(`
    with workforce as (
      select id from public.app_workforce_identities where auth_user_id='${AUTH_WORKFORCE}'
    ), scope as (
      select assignment.id
      from public.app_workforce_scope_assignments assignment,workforce
      where assignment.workforce_identity_id=workforce.id
        and assignment.case_id='${CASE_IDS[2]}'
        and assignment.capability_code='evidence.review.decide'
        and assignment.event_type='granted' limit 1
    )
    insert into public.app_evidence_review_rounds (
      id,case_id,manifest_version,manifest_hash,outcome,
      reviewer_workforce_identity_id,reviewer_scope_assignment_id,
      capability_code,authorization_policy_version_id,payload_sha256,
      request_id,idempotency_key,finalized_at
    ) select 'a5000000-0000-4000-8000-000000000001','${CASE_IDS[2]}',
      'fact-review-manifest-v1','${HASH}','CORRECTIONS_REQUIRED',workforce.id,
      scope.id,'evidence.review.decide','00000000-0000-4000-8000-000000003601',
      '${HASH}','round-a3','round-a3',now() from workforce,scope;
    with workforce as (
      select id from public.app_workforce_identities where auth_user_id='${AUTH_WORKFORCE}'
    ), scope as (
      select assignment.id from public.app_workforce_scope_assignments assignment,workforce
      where assignment.workforce_identity_id=workforce.id
        and assignment.case_id='${CASE_IDS[2]}'
        and assignment.capability_code='evidence.review.correction.publish'
        and assignment.event_type='granted' limit 1
    )
    insert into public.app_evidence_review_correction_handoffs (
      id,handoff_reference,case_id,round_id,manifest_version,manifest_hash,
      target_customer_id,correction_bundle,bundle_sha256,
      publisher_workforce_identity_id,publisher_scope_assignment_id,
      capability_code,authorization_policy_version_id,payload_sha256,
      request_id,idempotency_key,published_at
    ) select 'a6000000-0000-4000-8000-000000000001','CRH-0000000000000001',
      '${CASE_IDS[2]}','a5000000-0000-4000-8000-000000000001',
      'fact-review-manifest-v1','${HASH}','${CUSTOMER_A}',
      '{"schema_version":"evidence-review-correction-handoff-bundle-v3","customer_publication":{"schema_version":"correction-customer-publication-v1","cover_message":"Controleer de gevraagde correcties."},"items":[{}]}',
      '${HASH}',workforce.id,scope.id,'evidence.review.correction.publish',
      '00000000-0000-4000-8000-000000003601','${HASH}',
      'handoff-a3','handoff-a3',now() from workforce,scope;
  `);
  const requestBlocked = await json(createSql(CASE_REFS[2], "a3"));
  assert(
    requestBlocked.code === "correction_handoff_active",
    "correction_did_not_block_request",
  );

  const requestBeforeCorrection = await json(createSql(CASE_REFS[3], "a4"));
  assert(
    requestBeforeCorrection.code === "created",
    "request_for_correction_guard_failed",
  );
  const correctionRpcBlocked = await json(`select
    public.app_evidence_review_correction_publish_v2(
      '${AUTH_WORKFORCE}','${CASE_REFS[3]}',gen_random_uuid(),
      'Controleer de gevraagde correcties.',
      'handoff-a4-rpc','handoff-a4-rpc','${HASH}','${EXPIRES}'
    )::text;`);
  const correctionRpcUnauthorized = await json(`select
    public.app_evidence_review_correction_publish_v2(
      '${AUTH_CORRECTION_ONLY}','${CASE_REFS[3]}',gen_random_uuid(),
      'Controleer de gevraagde correcties.',
      'handoff-a4-denied','handoff-a4-denied','${HASH}','${EXPIRES}'
    )::text;`);
  assert(
    correctionRpcBlocked.status === 409 &&
      correctionRpcBlocked.code === "information_request_active" &&
      correctionRpcUnauthorized.code === "case_scope_denied",
    "correction_rpc_conflict_or_authority_mapping_invalid",
  );
  const correctionBlocked = await psql(`do $$ begin
    begin
      insert into public.app_evidence_review_correction_handoffs (
        id,handoff_reference,case_id,round_id,manifest_version,manifest_hash,
        target_customer_id,correction_bundle,bundle_sha256,
        publisher_workforce_identity_id,publisher_scope_assignment_id,
        capability_code,authorization_policy_version_id,payload_sha256,
        request_id,idempotency_key,published_at
      ) select gen_random_uuid(),'CRH-0000000000000002','${CASE_IDS[3]}',
        gen_random_uuid(),'fact-review-manifest-v1','${HASH}','${CUSTOMER_A}',
        '{"schema_version":"evidence-review-correction-handoff-bundle-v3","customer_publication":{"schema_version":"correction-customer-publication-v1","cover_message":"Controleer de gevraagde correcties."},"items":[{}]}',
        '${HASH}',identity.id,scope.id,'evidence.review.correction.publish',
        '00000000-0000-4000-8000-000000003601','${HASH}',
        'handoff-a4','handoff-a4',now()
      from public.app_workforce_identities identity
      join public.app_workforce_scope_assignments scope
        on scope.workforce_identity_id=identity.id
       and scope.case_id='${CASE_IDS[3]}'
       and scope.capability_code='evidence.review.correction.publish'
       and scope.event_type='granted'
      where identity.auth_user_id='${AUTH_WORKFORCE}';
      raise exception 'correction_was_allowed';
    exception when check_violation then
      if sqlerrm <> 'customer_information_request_active' then raise; end if;
    end;
  end $$; select 'denied';`);
  assert(correctionBlocked === "denied", "request_did_not_block_correction");

  const deliveredRequestRef = String(
    (requestBeforeCorrection.request as JsonObject).request_ref,
  );
  await psql(`with ranked as (
    select delivery.id,row_number() over (order by intent.recipient_ref) as n
    from public.app_workflow_email_deliveries delivery
    join public.app_workflow_email_intents intent on intent.id=delivery.intent_id
    where intent.event_type='information_request_created_customer'
      and intent.business_event_ref='${deliveredRequestRef}'
  )
  update public.app_workflow_email_deliveries delivery
  set status=case ranked.n
        when 1 then 'provider_accepted'
        when 2 then 'processing'
        else 'ambiguous_failure' end,
      attempt_count=1,
      lease_token=case when ranked.n=2 then gen_random_uuid() else null end,
      leased_at=case when ranked.n=2 then now() else null end,
      leased_until=case when ranked.n=2 then now()+interval '5 minutes' else null end,
      provider_reference=case when ranked.n=1 then 'mailpit:accepted-a4' else null end,
      provider_accepted_at=case when ranked.n=1 then now() else null end,
      safe_error_class=case when ranked.n=3 then 'provider_ambiguous' else null end,
      next_attempt_at=case when ranked.n=3 then now()+interval '1 day'
        else delivery.next_attempt_at end,
      updated_at=now()
  from ranked where delivery.id=ranked.id;`);
  const deliveredWithdraw = await json(
    `select public.app_customer_information_request_transition_v1(
      '${AUTH_WORKFORCE}','${CASE_REFS[3]}','${deliveredRequestRef}','WITHDRAW',
      'withdraw-a4-delivered','withdraw-a4-delivered','${HASH}','${EXPIRES}',
      jsonb_build_object(
        'organization_name','ENVAL',
        'portal_origin','http://127.0.0.1:5175'
      )
    )::text;`,
  );
  const deliveredWithdrawReplay = await json(
    `select public.app_customer_information_request_transition_v1(
      '${AUTH_WORKFORCE}','${CASE_REFS[3]}','${deliveredRequestRef}','WITHDRAW',
      'withdraw-a4-delivered','withdraw-a4-delivered','${HASH}','${EXPIRES}',
      jsonb_build_object(
        'organization_name','ENVAL',
        'portal_origin','http://127.0.0.1:5175'
      )
    )::text;`,
  );
  const deliveredWithdrawState = await psql(`select concat_ws('|',
    (select count(*) from public.app_workflow_email_intents
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${deliveredRequestRef}'),
    (select count(distinct recipient_ref) from public.app_workflow_email_intents
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${deliveredRequestRef}'),
    (select outcome from public.app_workflow_email_dispatches
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${deliveredRequestRef}'),
    (select bool_and(frozen_subject='De vraag is ingetrokken')
      from public.app_workflow_email_intents
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${deliveredRequestRef}'),
    (select bool_and(frozen_body = E'Beste klant,\n\nENVAL heeft de vraag over uw aanvraag ingetrokken. U hoeft hierop niet meer te reageren.\n\nAanvraag: INFO-A4\nDossiernummer: ${
    CASE_REFS[3]
  }\n\nBekijk de actuele status in uw klantportaal:\nhttp://127.0.0.1:5175/dashboard/aanvragen/${
    CASE_REFS[3]
  }\n\nMet vriendelijke groet,\nENVAL')
      from public.app_workflow_email_intents
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${deliveredRequestRef}'),
    (select bool_and(template_variables->>'case_reference'='${CASE_REFS[3]}'
      and (select count(*)=4
        from pg_catalog.jsonb_object_keys(template_variables)))
      from public.app_workflow_email_intents
      where event_type='information_request_withdrawn_customer'
        and business_event_ref='${deliveredRequestRef}'),
    (select string_agg(delivery.status,',' order by delivery.status)
      from public.app_workflow_email_deliveries delivery
      join public.app_workflow_email_intents intent on intent.id=delivery.intent_id
      where intent.event_type='information_request_created_customer'
        and intent.business_event_ref='${deliveredRequestRef}')
  );`);
  assert(
    deliveredWithdraw.code === "withdrawn" &&
      deliveredWithdrawReplay.code === "withdrawn" &&
      deliveredWithdrawState ===
        "3|3|enqueued|t|t|t|ambiguous_failure,processing,provider_accepted",
    `delivered_withdraw_matrix_invalid:${deliveredWithdrawState}`,
  );

  const concurrent = await Promise.all([
    json(createSql(CASE_REFS[4], "race-one")),
    json(createSql(CASE_REFS[4], "race-two")),
  ]);
  assert(
    concurrent.filter((value) => value.code === "created").length === 1 &&
      concurrent.filter((value) =>
          value.code === "information_request_already_active"
        ).length === 1,
    "concurrent_create_not_serialized",
  );
  const raceCreated = concurrent.find((value) => value.code === "created");
  assert(raceCreated?.request, "concurrent_request_missing");
  const raceRequestRef = String(
    (raceCreated.request as JsonObject).request_ref,
  );

  const contextCreated = await json(createSql(CASE_REFS[5], "context-c6"));
  assert(contextCreated.code === "created", "context_request_create_failed");
  const contextRequestRef = String(
    (contextCreated.request as JsonObject).request_ref,
  );
  const contextRead = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_CUSTOMER_CASE}','${CASE_REFS[5]}'
  )::text;`,
  );
  const contextAnswered = await json(
    `select public.app_customer_information_request_respond_v1(
    '${AUTH_CUSTOMER_CASE}','${CASE_REFS[5]}','${contextRequestRef}',
    'Antwoord voor nevencontext.','respond-c6','respond-c6','${HASH}',
    '${EXPIRES}'
  )::text;`,
  );
  assert(
    contextRead.ok === true && contextAnswered.code === "answered",
    "multi_context_r7_denied",
  );
  const contextResolved = await json(
    `select public.app_customer_information_request_transition_v1(
    '${AUTH_WORKFORCE}','${CASE_REFS[5]}','${contextRequestRef}','RESOLVE',
    'resolve-c6','resolve-c6','${HASH}','${EXPIRES}'
  )::text;`,
  );
  assert(contextResolved.code === "resolved", "context_resolve_failed");

  const caseScopedRead = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_CUSTOMER_CASE}','${CASE_REFS[4]}'
  )::text;`,
  );
  assert(caseScopedRead.ok === true, "case_scoped_r7_denied");
  await psql(`insert into public.app_customer_access_grants (
    auth_user_id,customer_id,granted_case_id,access_basis,source_class,
    source_ref,request_id
  ) values (
    '${AUTH_CUSTOMER_CASE}','${CUSTOMER_D}',null,'bound_customer_identity',
    'app_customer_identity','stale-context','grant-stale-context'
  );`);
  const writesBeforeStale = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const staleRead = await json(
    `select public.app_customer_information_request_customer_read_v1(
    '${AUTH_CUSTOMER_CASE}','${CASE_REFS[4]}'
  )::text;`,
  );
  const staleRespond = await json(
    `select public.app_customer_information_request_respond_v1(
    '${AUTH_CUSTOMER_CASE}','${CASE_REFS[4]}','${raceRequestRef}',
    'Dit antwoord mag niet worden opgeslagen.','respond-stale',
    'respond-stale','${HASH}','${EXPIRES}'
  )::text;`,
  );
  const writesAfterStale = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  assert(
    staleRead.status === 404 && staleRespond.status === 404 &&
      writesAfterStale === writesBeforeStale,
    "stale_grant_not_fail_closed",
  );

  const counts = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_customer_information_requests where case_id='${
    CASE_IDS[4]
  }'),
    (select count(*) from public.app_audit_events where event_type='customer_information_request_created'),
    (select count(*) from public.app_audit_events where event_type='customer_information_request_answered'),
    (select count(*) from public.app_audit_events where event_type='customer_information_request_resolved'),
    (select count(*) from public.app_audit_events where event_type='customer_information_request_withdrawn')
  );`);
  assert(counts === "6|2|1|6|2|2|3", `write_counts_invalid:${counts}`);

  await psql(`insert into public.app_customer_information_requests (
    id,request_reference,case_id,target_customer_id,question_text,
    created_by_workforce_identity_id,created_by_scope_assignment_id,
    capability_code,authorization_policy_version_id,payload_sha256,
    request_id,idempotency_key,created_at,terminal_action,terminal_at,
    terminal_by_workforce_identity_id,terminal_scope_assignment_id,
    terminal_policy_version_id,terminal_payload_sha256,terminal_request_id,
    terminal_idempotency_key
  )
  select
    gen_random_uuid(),
    'IRQ-' || pg_catalog.upper(pg_catalog.lpad(pg_catalog.to_hex(series.n),16,'0')),
    source.case_id,source.target_customer_id,
    'Historische vraag ' || series.n::text,
    source.created_by_workforce_identity_id,
    source.created_by_scope_assignment_id,source.capability_code,
    source.authorization_policy_version_id,source.payload_sha256,
    'history-request-' || series.n::text,
    'history-key-' || series.n::text,
    source.created_at + interval '1 day',
    'WITHDRAWN',source.created_at + interval '1 day 1 minute',
    source.terminal_by_workforce_identity_id,
    source.terminal_scope_assignment_id,source.terminal_policy_version_id,
    source.terminal_payload_sha256,
    'history-terminal-' || series.n::text,
    'history-terminal-key-' || series.n::text
  from public.app_customer_information_requests source
  cross join pg_catalog.generate_series(1,51) series(n)
  where source.request_reference='${withdrawRef}';`);
  const historyReadCountsBefore = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const limitedHistoryRead = await json(
    `select public.app_customer_information_request_customer_read_v1(
      '${AUTH_CUSTOMER_WIDE}','${CASE_REFS[1]}'
    )::text;`,
  );
  const historyReadCountsAfter = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_audit_events),
    (select count(*) from public.app_idempotency_keys)
  );`);
  const limitedHistory = limitedHistoryRead.history as JsonObject[];
  assert(
    limitedHistory.length === 50 &&
      limitedHistory[0].request_ref === "IRQ-0000000000000033" &&
      limitedHistory[49].request_ref === "IRQ-0000000000000002" &&
      limitedHistory.every((entry) => entry.outcome === "WITHDRAWN") &&
      limitedHistory.every((entry) => typeof entry.terminal_at === "string") &&
      historyReadCountsAfter === historyReadCountsBefore,
    "history_limit_order_or_zero_write_invalid",
  );

  const authorityLapseCreated = await json(
    createSql(CASE_AUTHORITY_LAPSE_REF, "authority-lapse"),
  );
  const authorityLapseRef = String(
    (authorityLapseCreated.request as JsonObject).request_ref,
  );
  await psql(`insert into public.app_workforce_capability_assignments (
    id,assignment_id,workforce_identity_id,capability_code,event_type,
    effective_at,valid_until,decision_ref,reason_ref,recorded_by_actor_ref,
    request_id,supersedes_assignment_event_id
  )
  select gen_random_uuid(),granted.assignment_id,
    granted.workforce_identity_id,granted.capability_code,'revoked',
    now(),null,'proof-authority-lapse','proof-authority-lapse','proof',
    'proof-authority-lapse',granted.id
  from public.app_workforce_capability_assignments granted
  join public.app_workforce_identities identity
    on identity.id=granted.workforce_identity_id
  where identity.auth_user_id='${AUTH_WORKFORCE}'
    and granted.capability_code='customer.information_request.manage'
    and granted.event_type='granted'
    and granted.supersedes_assignment_event_id is null
    and not exists (
      select 1 from public.app_workforce_capability_assignments revoked
      where revoked.assignment_id=granted.assignment_id
        and revoked.event_type='revoked'
    );`);
  const authorityLapseAnswered = await json(
    `select public.app_customer_information_request_respond_v1(
      '${AUTH_CUSTOMER_WIDE}','${CASE_AUTHORITY_LAPSE_REF}',
      '${authorityLapseRef}','Antwoord zonder ontvangerfallback.',
      'respond-authority-lapse','respond-authority-lapse','${HASH}','${EXPIRES}',
      jsonb_build_object(
        'organization_name','ENVAL',
        'portal_origin','http://127.0.0.1:5175'
      )
    )::text;`,
  );
  const authorityLapseMail = await psql(`select concat_ws('|',
    (select count(*) from public.app_workflow_email_intents
      where event_type='information_request_answered_workforce'
        and business_event_ref='${authorityLapseRef}'),
    (select outcome from public.app_workflow_email_dispatches
      where event_type='information_request_answered_workforce'
        and business_event_ref='${authorityLapseRef}'),
    (select reason_code from public.app_workflow_email_dispatches
      where event_type='information_request_answered_workforce'
        and business_event_ref='${authorityLapseRef}'),
    (public.app_workforce_authorize_v1(
      '${AUTH_WORKFORCE}','evidence.review.correction.publish',
      '${CASE_AUTHORITY_LAPSE}',null,now()
    )->>'ok')
  );`);
  assert(
    authorityLapseAnswered.code === "answered" &&
      authorityLapseMail ===
        "0|no_delivery|recipient_unavailable|true",
    `creator_authority_lapse_fallback_invalid:${authorityLapseMail}`,
  );
  console.log("CUSTOMER_INFORMATION_REQUEST_DB_Q01_Q10=PASS");
  console.log("CUSTOMER_INFORMATION_REQUEST_HISTORY=PASS");
  console.log("INFORMATION_REQUEST_EMAIL_DB_Q01_Q12=PASS");
  console.log("INFORMATION_REQUEST_UNEXPECTED_WRITES=0");
}

try {
  await setup();
  await seed();
  await runProof();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  Deno.exitCode = 1;
} finally {
  try {
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
    console.log("CUSTOMER_INFORMATION_REQUEST_CLEANUP=PASS");
  } catch (error) {
    console.error(`cleanup_failed:${String(error)}`);
    Deno.exitCode = 1;
  }
}
