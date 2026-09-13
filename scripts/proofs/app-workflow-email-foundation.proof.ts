const CONTAINER = "supabase_db_enval";
const DATABASE = `enval_workflow_email_${
  crypto.randomUUID().replaceAll("-", "")
}`;
const MIGRATION =
  "supabase/migrations/20260913161612_app_workflow_email_foundation_v1.sql";
const AUTH_WORKFORCE = "b1000000-0000-4000-8000-000000000001";
const AUTH_CUSTOMER = "b1000000-0000-4000-8000-000000000002";
const CUSTOMER = "b2000000-0000-4000-8000-000000000001";
const DOSSIER = "b2500000-0000-4000-8000-000000000001";
const CASE = "b3000000-0000-4000-8000-000000000001";
const CASE_REF = "CASE-B00000000001";
const HASH = "a".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

type CommandResult = Readonly<{ code: number; stdout: string; stderr: string }>;
type JsonObject = Record<string, unknown>;

function assert(value: unknown, label: string): asserts value {
  if (!value) throw new Error(label);
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
      (result.stderr || `${name}_failed`).replaceAll(/\s+/gu, " "),
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

async function json(sql: string): Promise<JsonObject> {
  const output = await psql(sql);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "json_result_missing");
  return JSON.parse(line) as JsonObject;
}

async function setup(): Promise<void> {
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
  for (const path of migrations) await psql(await Deno.readTextFile(path));
}

async function seedRealInformationRequest(): Promise<string> {
  await psql(`
    insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
    values
      ('${AUTH_WORKFORCE}','workflow.workforce@example.invalid',now(),now(),now()),
      ('${AUTH_CUSTOMER}','workflow.customer@example.invalid',now(),now(),now());
    insert into public.app_customers (id,customer_type,status)
    values ('${CUSTOMER}','particulier','active');
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values ('${DOSSIER}','${CUSTOMER}','WF-MAIL-1','particulier','submitted',now());
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      '${CASE}','${CUSTOMER}','${CASE_REF}',now(),'system','workflow-proof',
      'app_customer_dossier','${DOSSIER}','workflow-proof-case'
    );
    insert into public.app_customer_identities (
      id,customer_id,auth_user_id,email_normalized,email_verified_at,status
    ) values (
      'b4000000-0000-4000-8000-000000000001','${CUSTOMER}',
      '${AUTH_CUSTOMER}','workflow.customer@example.invalid',now(),'active'
    );
    insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values (
      '${AUTH_CUSTOMER}','${CUSTOMER}','${CASE}','signed_case_contact',
      'app_signup_promotion','workflow-proof','workflow-proof-grant'
    );
  `);
  const bootstrap = await json(
    `select public.app_workforce_first_admin_bootstrap_v1(
    '${AUTH_WORKFORCE}','local','enval','workflow-bootstrap','workflow-bootstrap',
    '${HASH}','${EXPIRES}','decision:workflow-bootstrap'
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
        and assignment.capability_code='customer.information_request.manage'
        and assignment.event_type='granted'
        and assignment.supersedes_assignment_event_id is null
    )
    insert into public.app_workforce_scope_assignments (
      scope_assignment_id,workforce_identity_id,capability_assignment_id,
      capability_code,case_id,location_id,case_location_relation_id,event_type,
      effective_at,decision_ref,recorded_by_actor_ref,request_id
    )
    select gen_random_uuid(),identity.id,capability.id,capability.capability_code,
      '${CASE}',null,null,'granted',now(),'workflow-proof-scope','workflow-proof',
      'workflow-proof-scope'
    from identity,capability;
  `);
  const created = await json(
    `select public.app_customer_information_request_create_v1(
    '${AUTH_WORKFORCE}','${CASE_REF}','Welke toelichting kunt u geven?',
    'workflow-request','workflow-request','${HASH}','${EXPIRES}'
  )::text;`,
  );
  assert(
    created.ok === true && created.code === "created",
    "real_request_create_failed",
  );
  const request = created.request as JsonObject;
  assert(typeof request.request_ref === "string", "request_reference_missing");
  return request.request_ref;
}

function enqueueSql(requestRef: string, organization = "ENVAL") {
  const dedupeRequestRef = requestRef.toLowerCase();
  return `select public.app_workflow_email_enqueue_v1(
    'information_request_created_customer',
    'information-request-created-customer-nl-v1',
    '${requestRef}','customer','${AUTH_CUSTOMER}',
    'workflow.customer@example.invalid',
    jsonb_build_object(
      'organization_name','${organization}',
      'application_label','Aanvraag WF-MAIL-1',
      'action_url','http://127.0.0.1:5175/dashboard/aanvragen/${CASE_REF}'
    ),
    'information-request:${dedupeRequestRef}:customer:${AUTH_CUSTOMER}'
  )::text;`;
}

async function runProof(): Promise<void> {
  const requestRef = await seedRealInformationRequest();
  const acl = await psql(`select concat_ws('|',
    has_function_privilege('service_role','public.app_workflow_email_enqueue_v1(text,text,text,text,uuid,text,jsonb,text)','EXECUTE'),
    has_function_privilege('anon','public.app_workflow_email_claim_v1()','EXECUTE'),
    has_function_privilege('authenticated','public.app_workflow_email_claim_v1()','EXECUTE'),
    has_function_privilege('service_role','public.app_workflow_email_claim_v1()','EXECUTE'),
    has_function_privilege('service_role','public.app_workflow_email_complete_v1(uuid,uuid,text,text,text)','EXECUTE'),
    has_table_privilege('anon','public.app_workflow_email_intents','SELECT'),
    has_table_privilege('authenticated','public.app_workflow_email_deliveries','SELECT'),
    has_table_privilege('service_role','public.app_workflow_email_delivery_attempts','SELECT')
  );`);
  assert(acl === "f|f|f|t|t|f|f|f", `acl_invalid:${acl}`);

  const businessBefore = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_cases),
    (select count(*) from public.app_customer_access_grants),
    (select count(*) from public.app_audit_events)
  );`);
  const concurrent = await Promise.all([
    command("docker", [
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
    ], enqueueSql(requestRef)),
    command("docker", [
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
    ], enqueueSql(requestRef)),
  ]);
  assert(
    concurrent.every((result) => result.code === 0),
    "concurrent_enqueue_failed",
  );
  const concurrentResults = concurrent.map((result) =>
    JSON.parse(
      result.stdout.split("\n").find((line) => line.startsWith("{")) || "{}",
    )
  ) as JsonObject[];
  assert(
    concurrentResults.filter((result) => result.created === true).length ===
        1 &&
      concurrentResults.filter((result) => result.created === false).length ===
        1,
    "concurrent_enqueue_not_deduplicated",
  );
  const replay = await json(enqueueSql(requestRef));
  assert(
    replay.created === false,
    "enqueue_replay_invalid",
  );
  const frozen = await psql(`select concat_ws('|',
    count(*),
    min(frozen_subject),
    min(frozen_body),
    min(provider_idempotency_key)
  ) from public.app_workflow_email_intents;`);
  const expectedBody = [
    "Beste klant,",
    "",
    "ENVAL heeft een vraag over Aanvraag WF-MAIL-1.",
    "",
    "Bekijk en beantwoord de vraag in uw klantportaal:",
    `http://127.0.0.1:5175/dashboard/aanvragen/${CASE_REF}`,
    "",
    "Met vriendelijke groet,",
    "ENVAL",
  ].join("\n");
  const parts = frozen.split("|");
  assert(
    parts[0] === "1" && parts[1] === "Er staat een vraag voor u klaar" &&
      parts[2] === expectedBody &&
      /^workflow-email-v1:[0-9a-f]{64}$/u.test(parts[3]),
    "frozen_template_invalid",
  );
  assert(!parts[2].includes("Welke toelichting"), "question_text_leaked");

  const conflict = await command("docker", [
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
  ], enqueueSql(requestRef, "Andere organisatie"));
  assert(
    conflict.code !== 0 &&
      conflict.stderr.includes("workflow_email_dedupe_conflict"),
    "dedupe_payload_conflict_not_rejected",
  );

  const invalidTemplate = await command(
    "docker",
    [
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
    ],
    enqueueSql(requestRef).replace(
      "'application_label','Aanvraag WF-MAIL-1'",
      "'application_label','Aanvraag WF-MAIL-1','question','verboden'",
    ).replace(
      `information-request:${requestRef}`,
      `information-request-extra:${requestRef}`,
    ),
  );
  assert(
    invalidTemplate.code !== 0 &&
      invalidTemplate.stderr.includes(
        "workflow_email_template_variables_invalid",
      ),
    "extra_template_variable_not_rejected",
  );
  const wrongTypeTemplate = await command(
    "docker",
    [
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
    ],
    enqueueSql(requestRef).replace(
      "'organization_name','ENVAL'",
      "'organization_name',42",
    ).replace(
      `information-request:${requestRef.toLowerCase()}`,
      `information-request-type:${requestRef.toLowerCase()}`,
    ),
  );
  assert(
    wrongTypeTemplate.code !== 0 &&
      wrongTypeTemplate.stderr.includes(
        "workflow_email_template_variables_invalid",
      ),
    "non_string_template_variable_not_rejected",
  );

  const claimOne = await json(`set role service_role;
    select public.app_workflow_email_claim_v1()::text; reset role;`);
  const claimTwo = await json(`set role service_role;
    select public.app_workflow_email_claim_v1()::text; reset role;`);
  const deliveryOne = claimOne.delivery as JsonObject;
  assert(
    typeof deliveryOne.delivery_id === "string" &&
      claimTwo.delivery === null &&
      deliveryOne.body === expectedBody &&
      deliveryOne.provider_idempotency_key === parts[3],
    "single_lease_or_frozen_claim_invalid",
  );

  await psql(`update public.app_workflow_email_deliveries
    set leased_at=now()-interval '10 minutes', leased_until=now()-interval '5 minutes'
    where id='${deliveryOne.delivery_id}';`);
  const recovered = await json(`set role service_role;
    select public.app_workflow_email_claim_v1()::text; reset role;`);
  assert(recovered.delivery === null, "lease_recovery_backoff_missing");
  const recoveredState = await psql(`select concat_ws('|',status,attempt_count,
    safe_error_class,(next_attempt_at > updated_at)::text)
    from public.app_workflow_email_deliveries;`);
  assert(
    recoveredState === "ambiguous_failure|1|lease_expired|true",
    `lease_recovery_invalid:${recoveredState}`,
  );

  for (let attempt = 2; attempt <= 5; attempt += 1) {
    await psql(`update public.app_workflow_email_deliveries
      set next_attempt_at=now()-interval '1 second';`);
    const claimed = await json(`set role service_role;
      select public.app_workflow_email_claim_v1()::text; reset role;`);
    const delivery = claimed.delivery as JsonObject;
    assert(
      delivery.body === expectedBody &&
        delivery.provider_idempotency_key === parts[3],
      `retry_frozen_payload_changed_${attempt}`,
    );
    const completed = await json(`set role service_role;
      select public.app_workflow_email_complete_v1(
        '${delivery.delivery_id}','${delivery.lease_token}',
        'retryable_failure',null,'transport_unavailable'
      )::text; reset role;`);
    assert(
      completed.status ===
        (attempt === 5 ? "permanent_failure" : "retryable_failure"),
      `bounded_retry_invalid_${attempt}`,
    );
  }
  const attempts = await psql(
    `select concat_ws('|',count(*),min(attempt_number),
    max(attempt_number),count(distinct delivery_id))
    from public.app_workflow_email_delivery_attempts;`,
  );
  assert(attempts === "5|1|5|1", `attempt_ledger_invalid:${attempts}`);
  const afterLimit = await json(`set role service_role;
    select public.app_workflow_email_claim_v1()::text; reset role;`);
  assert(afterLimit.delivery === null, "attempt_limit_not_enforced");

  const mutationDenied = await command("docker", [
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
  ], `update public.app_workflow_email_intents set frozen_subject='changed';`);
  assert(
    mutationDenied.code !== 0 &&
      mutationDenied.stderr.includes("workflow_email_record_immutable"),
    "intent_immutability_not_enforced",
  );

  const businessAfter = await psql(`select concat_ws('|',
    (select count(*) from public.app_customer_information_requests),
    (select count(*) from public.app_customer_information_responses),
    (select count(*) from public.app_cases),
    (select count(*) from public.app_customer_access_grants),
    (select count(*) from public.app_audit_events)
  );`);
  assert(
    businessAfter === businessBefore,
    "workflow_email_wrote_business_state",
  );

  const directDenial = await psql(`set role anon;
    select has_table_privilege(current_user,'public.app_workflow_email_intents','SELECT');
    reset role;`);
  assert(directDenial === "f", "anon_direct_access_allowed");
  const rls = await psql(
    `select concat_ws('|',relrowsecurity,relforcerowsecurity)
    from pg_class where oid='public.app_workflow_email_intents'::regclass;`,
  );
  assert(rls === "t|t", "rls_not_forced");

  console.log("WORKFLOW_EMAIL_FOUNDATION_DB_Q01_Q14=PASS");
  console.log("WORKFLOW_EMAIL_FOUNDATION_UNEXPECTED_WRITES=0");
}

try {
  await setup();
  assert(await Deno.stat(MIGRATION).then(() => true), "migration_missing");
  await runProof();
} finally {
  await command("docker", [
    "exec",
    CONTAINER,
    "dropdb",
    "-U",
    "postgres",
    "--if-exists",
    "--force",
    DATABASE,
  ]);
}
