import {
  parseCustomerCorrectionHandoffSource,
} from "../../supabase/functions/_shared/app_evidence_review_correction_handoff.ts";
import {
  createHandler as createPublishHandler,
  normalizeCorrectionPublishRequest,
} from "../../supabase/functions/api-app-evidence-review-correction-publish/index.ts";
import {
  createHandler as createCustomerReadHandler,
} from "../../supabase/functions/api-app-customer-correction-handoff/index.ts";
import type {
  AppRequestMeta,
} from "../../supabase/functions/_shared/app_foundation.ts";
import type {
  JsonObject,
  ServiceClient,
} from "../../supabase/functions/_shared/app_workforce_authorization.ts";

const CONTAINER = "supabase_db_enval";
const ACTIVE_DATABASE = "postgres";
const DATABASE = `enval_review19_proof_${crypto.randomUUID().replaceAll("-", "")}`;
const DUMP_FILE = `/tmp/${DATABASE}.dump`;
const MIGRATION =
  "supabase/migrations/20260819190000_app_evidence_review_correction_handoff.sql";
const PILOT_CASE_REF = "CASE-7E4CC75CD19F";
const CASE_REF = `CASE-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const ROUND_REF = "e1000000-0000-4000-8000-000000000001";
const AUTH_USER = "e2000000-0000-4000-8000-000000000001";
const OTHER_AUTH_USER = "e2000000-0000-4000-8000-000000000002";
const OTHER_CUSTOMER = "e3000000-0000-4000-8000-000000000001";
const OTHER_CASE = "e4000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const STALE_HASH = "b".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";

type CommandResult = { code: number; stdout: string; stderr: string };
class ProofFailure extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}

function scrub(value: string): string {
  return value
    .replaceAll(/postgres(?:ql)?:\/\/\S+/gi, "[database]")
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 600);
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
  await must("docker", [
    "exec",
    CONTAINER,
    "rm",
    "-f",
    DUMP_FILE,
  ]);
}

const META: AppRequestMeta = {
  request_id: "review19-proof-request",
  idempotency_key: "review19-proof-key",
  ip_hash: null,
  user_agent_hash: null,
  method: "POST",
  path: "/api-app-evidence-review-correction-publish",
  url: "https://enval.local/api-app-evidence-review-correction-publish",
  origin: null,
  timestamp: "2026-08-19T19:00:00.000Z",
  environment: "local",
};

function serviceClient(
  rpc: (name: string, args: JsonObject) => Promise<{ data?: unknown; error?: unknown }>,
): ServiceClient {
  return {
    auth: { getUser: async () => ({}) },
    from: () => ({}),
    rpc,
  };
}

function verified() {
  return Promise.resolve({
    ok: true as const,
    context: { authUserId: AUTH_USER, emailNormalized: "proof@example.invalid" },
  });
}

async function body(response: Response): Promise<JsonObject> {
  return await response.json() as JsonObject;
}

async function endpointProof(): Promise<void> {
  const migration = await Deno.readTextFile(MIGRATION);
  assert(
    migration.includes("evidence.review.correction.publish") &&
      migration.includes("app_evidence_review_correction_handoffs") &&
      migration.includes("app_evidence_review_correction_publish_v1") &&
      migration.includes("app_customer_correction_handoff_read_v1") &&
      migration.includes("app_evidence_review_overall_status_v1") &&
      migration.includes("WAITING_CUSTOMER") &&
      migration.includes("enable row level security") &&
      migration.includes("before update or delete") &&
      migration.includes("correction_bundle") &&
      migration.includes("bundle_sha256") &&
      migration.includes("app_workforce_authorize_v1") &&
      migration.includes("app_customer_access_grants") &&
      !migration.includes("email_normalized"),
    "migration_boundary_missing",
  );

  assert(
    normalizeCorrectionPublishRequest({ caseRef: CASE_REF, roundRef: ROUND_REF }) &&
      !normalizeCorrectionPublishRequest({
        caseRef: CASE_REF,
        roundRef: ROUND_REF,
        items: [],
      }) &&
      !normalizeCorrectionPublishRequest({
        caseRef: CASE_REF,
        roundRef: ROUND_REF,
        correctionInstruction: "client supplied",
      }),
    "client_bundle_input_not_denied",
  );

  let rpcCalls = 0;
  const publish = createPublishHandler({
    createServiceClient: () => serviceClient(async (name, args) => {
      rpcCalls += 1;
      assert(name === "app_evidence_review_correction_publish_v1", "publish_rpc_changed");
      assert(
        Object.keys(args).sort().join("|") === [
          "p_auth_user_id",
          "p_case_ref",
          "p_idempotency_expires_at",
          "p_idempotency_key",
          "p_payload_sha256",
          "p_request_id",
          "p_round_id",
        ].sort().join("|") && !("items" in args),
        "publish_rpc_input_widened",
      );
      return {
        data: {
          ok: true,
          status: 201,
          code: "published",
          handoff_id: "e5000000-0000-4000-8000-000000000001",
          handoff_ref: "CRH-0123456789ABCDEF",
          round_id: ROUND_REF,
          bundle_sha256: HASH,
          published_at: "2026-08-19T19:00:00.000Z",
        },
      };
    }),
    idempotencyExpiresAt: () => EXPIRES,
    requestMeta: async () => META,
    hashPayload: async (value) => {
      const serialized = JSON.stringify(value);
      assert(
        serialized.includes(CASE_REF) && serialized.includes(ROUND_REF) &&
          !serialized.includes("items") &&
          !serialized.includes("correctionInstruction"),
        "client_bundle_reached_hash",
      );
      return HASH;
    },
    verifyBearer: verified,
  });
  const published = await publish(new Request(META.url, {
    method: "POST",
    headers: {
      authorization: "Bearer proof",
      "content-type": "application/json",
      "idempotency-key": META.idempotency_key!,
    },
    body: JSON.stringify({ caseRef: CASE_REF, roundRef: ROUND_REF }),
  }));
  const publishedBody = await body(published);
  assert(
    published.status === 201 && publishedBody.result === "PUBLISHED" &&
      publishedBody.handoffRef === "CRH-0123456789ABCDEF" &&
      !("bundle_sha256" in publishedBody) && !("handoff_id" in publishedBody) &&
      rpcCalls === 1,
    "publish_endpoint_contract_invalid",
  );

  const invalid = await publish(new Request(META.url, {
    method: "POST",
    headers: {
      authorization: "Bearer proof",
      "content-type": "application/json",
      "idempotency-key": META.idempotency_key!,
    },
    body: JSON.stringify({
      caseRef: CASE_REF,
      roundRef: ROUND_REF,
      items: [{ correctionInstruction: "client supplied" }],
    }),
  }));
  assert(invalid.status === 400 && rpcCalls === 1, "client_items_not_rejected");

  let clientCreated = 0;
  const tenantDenied = createPublishHandler({
    createServiceClient: () => {
      clientCreated += 1;
      return serviceClient(async () => ({}));
    },
    requestMeta: async () => new Response("safe", { status: 503 }),
  });
  const tenantDeniedResponse = await tenantDenied(new Request(META.url, {
    method: "POST",
  }));
  assert(
    tenantDeniedResponse.status === 503 && clientCreated === 0,
    "tenant_gate_not_first",
  );

  const safeSource = {
    ok: true,
    status: 200,
    code: "ok",
    case_ref: CASE_REF,
    handoff: {
      handoff_ref: "CRH-0123456789ABCDEF",
      published_at: "2026-08-19T19:00:00.000Z",
      items: [{
        document_label: "Energiedocument",
        fact_label: "Energieleverancier",
        current_value: "Vorige leverancier",
        correction_reason: "INCORRECT_INFORMATION",
        correction_reason_label: "Gegeven onjuist",
        correction_instruction: "foute invoer",
      }],
    },
  };
  const parsed = parseCustomerCorrectionHandoffSource(safeSource);
  assert(
    parsed?.handoff?.items[0]?.documentLabel === "Energiedocument" &&
      parsed.handoff.items[0].factLabel === "Energieleverancier" &&
      parsed.handoff.items[0].correctionReasonLabel === "Gegeven onjuist" &&
      parsed.handoff.items[0].correctionInstruction === "foute invoer" &&
      !JSON.stringify(parsed).includes("subject_ref") &&
      !JSON.stringify(parsed).includes("manifest") &&
      !JSON.stringify(parsed).includes("reviewer") &&
      !JSON.stringify(parsed).includes("policy"),
    "customer_safe_parser_invalid",
  );
  assert(
    parseCustomerCorrectionHandoffSource({
      ok: true,
      status: 200,
      code: "not_available",
      case_ref: CASE_REF,
      handoff: null,
    })?.handoff === null &&
      !parseCustomerCorrectionHandoffSource({
        ...safeSource,
        handoff: { ...safeSource.handoff, subject_ref: `FRS-${HASH}` },
      }),
    "customer_empty_or_internal_field_contract_invalid",
  );

  const customerRead = createCustomerReadHandler({
    createServiceClient: () => serviceClient(async (name, args) => {
      assert(name === "app_customer_correction_handoff_read_v1", "read_rpc_changed");
      assert(
        Object.keys(args).sort().join("|") === "p_auth_user_id|p_case_ref",
        "read_rpc_input_widened",
      );
      return { data: safeSource };
    }),
    requestMeta: async () => ({ ...META, method: "GET", idempotency_key: null }),
    verifyBearer: verified,
  });
  const readResponse = await customerRead(new Request(
    `https://enval.local/api-app-customer-correction-handoff?caseRef=${CASE_REF}`,
    { headers: { authorization: "Bearer proof" } },
  ));
  const readBody = await body(readResponse);
  assert(
    readResponse.status === 200 && readBody.caseRef === CASE_REF &&
      JSON.stringify(readBody) === JSON.stringify(parsed),
    "customer_read_endpoint_contract_invalid",
  );

  const noAuth = createCustomerReadHandler({
    createServiceClient: () => serviceClient(async () => {
      throw new ProofFailure("rpc_reached_without_auth");
    }),
    requestMeta: async () => ({ ...META, method: "GET", idempotency_key: null }),
    verifyBearer: async () => ({
      ok: false,
      status: 401,
      code: "invalid_authorization",
      message: "Niet geautoriseerd.",
    }),
  });
  const noAuthResponse = await noAuth(new Request(
    `https://enval.local/api-app-customer-correction-handoff?caseRef=${CASE_REF}`,
  ));
  assert(noAuthResponse.status === 401, "customer_unauthenticated_not_denied");

  console.log("REVIEW19_ENDPOINT_Q01_Q09=PASS");
}

async function activeFingerprint(): Promise<string> {
  return await psql(ACTIVE_DATABASE, `begin read only;
    with pilot as (
      select id from public.app_cases where case_reference='${PILOT_CASE_REF}'
    )
    select concat_ws('|',
      (select count(*) from public.app_customers),
      (select count(*) from public.app_cases),
      (select count(*) from public.app_evidence_review_rounds),
      (select count(*) from public.app_evidence_review_correction_handoffs),
      (select count(*) from public.app_customer_access_grants),
      (select count(*) from public.app_workforce_scope_assignments),
      (select count(*) from public.app_audit_events),
      (select count(*) from public.app_idempotency_keys),
      (select count(*) from public.app_evidence_review_correction_handoffs h
       join pilot on pilot.id=h.case_id)
    ); rollback;`);
}

async function setupDatabase(): Promise<void> {
  await must("docker", [
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    ACTIVE_DATABASE,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--schema=public",
    "--schema=auth",
    "--schema=extensions",
    "--schema=storage",
    "--exclude-table-data=public.app_workforce_tenant_scope_assignments",
    `--file=${DUMP_FILE}`,
  ]);
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
  await psql(DATABASE, "drop schema public cascade;");
  await must("docker", [
    "exec",
    CONTAINER,
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "--no-owner",
    "--no-privileges",
    DUMP_FILE,
  ]);
  await psql(DATABASE, `
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    grant usage on schema public to service_role, anon, authenticated;
    grant execute on function public.app_evidence_review_correction_publish_v1(
      uuid,text,uuid,text,text,text,timestamptz
    ) to service_role;
    grant execute on function public.app_customer_correction_handoff_read_v1(
      uuid,text
    ) to service_role;
  `);
}

async function rpc(
  authUserId: string,
  requestId: string,
  idempotencyKey: string,
): Promise<JsonObject> {
  const roundRef = await psql(DATABASE, `begin read only;
    select r.id::text from public.app_evidence_review_rounds r
    join public.app_cases c on c.id=r.case_id
    where c.case_reference='${CASE_REF}'; rollback;`);
  assert(/^[0-9a-f-]{36}$/i.test(roundRef), "fixture_round_missing");
  const output = await psql(DATABASE, `begin;
    set local role service_role;
    select public.app_evidence_review_correction_publish_v1(
      '${authUserId}', '${CASE_REF}',
      '${roundRef}',
      '${requestId}', '${idempotencyKey}', '${HASH}', '${EXPIRES}'
    )::text;
    commit;`);
  const line = output.split("\n").find((value) => value.startsWith("{"));
  assert(line, "publish_rpc_output_missing");
  return JSON.parse(line) as JsonObject;
}

async function databaseProof(): Promise<void> {
  const before = await activeFingerprint();
  try {
    await setupDatabase();
    const migrationPresent = await psql(DATABASE, `select concat_ws('|',
      to_regclass('public.app_evidence_review_correction_handoffs') is not null,
      has_function_privilege('service_role',
        'public.app_evidence_review_correction_publish_v1(uuid,text,uuid,text,text,text,timestamptz)',
        'EXECUTE'),
      has_function_privilege('service_role',
        'public.app_customer_correction_handoff_read_v1(uuid,text)','EXECUTE'),
      has_table_privilege('anon','public.app_evidence_review_correction_handoffs','SELECT'),
      has_table_privilege('authenticated','public.app_evidence_review_correction_handoffs','INSERT'),
      has_table_privilege('service_role','public.app_evidence_review_correction_handoffs','INSERT'),
      (select relrowsecurity from pg_catalog.pg_class
       where oid='public.app_evidence_review_correction_handoffs'::regclass)
    );`);
    assert(migrationPresent === "t|t|t|f|f|f|t", "handoff_acl_invalid");

    await psql(DATABASE, `begin;
      set local session_replication_role=replica;
      update public.app_cases set case_reference='${CASE_REF}'
      where case_reference='${PILOT_CASE_REF}';
      set local session_replication_role=origin;
      insert into auth.users (
        id,email,email_confirmed_at,created_at,updated_at
      ) values
        ('${AUTH_USER}','review19-customer@example.invalid',clock_timestamp(),
         clock_timestamp(),clock_timestamp()),
        ('${OTHER_AUTH_USER}','review19-other@example.invalid',clock_timestamp(),
         clock_timestamp(),clock_timestamp());
      insert into public.app_customer_access_grants (
        auth_user_id,customer_id,granted_case_id,access_basis,source_class,
        source_ref,request_id
      ) select '${AUTH_USER}',case_row.customer_id,case_row.id,
        'signed_service_recipient','app_signup_promotion',
        'review19-proof-access','review19-proof-access'
      from public.app_cases case_row where case_row.case_reference='${CASE_REF}';
      insert into public.app_customers (id,customer_type)
      values ('${OTHER_CUSTOMER}','particulier');
      insert into public.app_cases (
        id,customer_id,case_reference,created_at,created_by_actor_type,
        created_by_actor_ref,source_class,source_ref,request_id
      ) values (
        '${OTHER_CASE}','${OTHER_CUSTOMER}','CASE-OTHER0000001',clock_timestamp(),
        'system','proof:review19','proof','review19-other','review19-other-case'
      );
      insert into public.app_customer_access_grants (
        auth_user_id,customer_id,granted_case_id,access_basis,source_class,
        source_ref,request_id
      ) values (
        '${OTHER_AUTH_USER}','${OTHER_CUSTOMER}','${OTHER_CASE}',
        'signed_service_recipient','app_signup_promotion',
        'review19-other-access','review19-other-access'
      );
      commit;`);

    const authority = await psql(DATABASE, `begin read only;
      with first_admin as (
        select i.auth_user_id
        from public.app_workforce_identities i
        join lateral (
          select state from public.app_workforce_identity_states s
          where s.workforce_identity_id=i.id
          order by s.effective_at desc,s.recorded_at desc limit 1
        ) state on state.state='active'
        join lateral (
          select seniority from public.app_workforce_seniority_assignments s
          where s.workforce_identity_id=i.id
          order by s.effective_at desc,s.recorded_at desc limit 1
        ) seniority on seniority.seniority='admin'
        order by i.created_at,i.id limit 1
      ), fixture as (
        select id from public.app_cases where case_reference='${CASE_REF}'
      )
      select concat_ws('|',
        (select minimum_seniority='reviewer'
         from public.app_workforce_policy_requirements requirement
         join public.app_workforce_policy_activations activation
           on activation.policy_version_id=requirement.policy_version_id
         where requirement.capability_code='evidence.review.correction.publish'
         order by activation.effective_at desc limit 1),
        (select (public.app_workforce_authorize_v1(
          first_admin.auth_user_id,'evidence.review.correction.publish',
          fixture.id,null,clock_timestamp())->>'ok')::boolean
         from first_admin,fixture),
        (select (public.app_workforce_authorize_v1(
          first_admin.auth_user_id,'case.assignment.manage',null,null,
          clock_timestamp())->>'ok')::boolean from first_admin)
      ); rollback;`);
    assert(authority === "t|t|t", `publish_authority_invalid:${authority}`);

    const noHandoff = await psql(DATABASE, `begin read only;
      select public.app_customer_correction_handoff_read_v1(
        '${AUTH_USER}','${CASE_REF}'
      )->>'code'; rollback;`);
    assert(noHandoff === "not_available", "correction_truth_leaked_before_publish");

    const allAccepted = await psql(DATABASE, `begin;
      set local session_replication_role=replica;
      update public.app_evidence_review_rounds set outcome='ALL_FACTS_ACCEPTED'
      where case_id=(select id from public.app_cases where case_reference='${CASE_REF}');
      update public.app_evidence_review_round_subject_decisions set
        disposition='ACCEPTED',correction_reason=null,correction_instruction=null
      where round_id=(select id from public.app_evidence_review_rounds
        where case_id=(select id from public.app_cases where case_reference='${CASE_REF}'));
      set local session_replication_role=origin;
      select concat_ws('|',
        (public.app_evidence_review_correction_publish_v1(
          (select auth_user_id from public.app_workforce_identities i
           join public.app_workforce_scope_assignments s
             on s.workforce_identity_id=i.id
           where s.capability_code='evidence.review.correction.publish'
             and s.case_id=(select id from public.app_cases
               where case_reference='${CASE_REF}')
             and s.event_type='granted' order by s.effective_at desc limit 1),
          '${CASE_REF}',(select id from public.app_evidence_review_rounds
            where case_id=(select id from public.app_cases
              where case_reference='${CASE_REF}')),
          'review19-all-accepted','review19-all-accepted','${HASH}','${EXPIRES}'
        )->>'code'),
        (select count(*) from public.app_evidence_review_correction_handoffs),
        public.app_evidence_review_overall_status_v1(
          (select id from public.app_cases where case_reference='${CASE_REF}'),
          (select manifest_version from public.app_evidence_review_rounds
           where case_id=(select id from public.app_cases
             where case_reference='${CASE_REF}')),
          (select manifest_hash from public.app_evidence_review_rounds
           where case_id=(select id from public.app_cases
             where case_reference='${CASE_REF}'))
        )
      ); rollback;`);
    assert(
      allAccepted === "correction_handoff_not_eligible|0|REVIEW_COMPLETE",
      `all_accepted_not_denied:${allAccepted}`,
    );

    const stale = await psql(DATABASE, `begin;
      set local session_replication_role=replica;
      update public.app_evidence_review_rounds set manifest_hash='${STALE_HASH}'
      where case_id=(select id from public.app_cases where case_reference='${CASE_REF}');
      set local session_replication_role=origin;
      select concat_ws('|',
        (public.app_evidence_review_correction_publish_v1(
          (select auth_user_id from public.app_workforce_identities i
           join public.app_workforce_scope_assignments s
             on s.workforce_identity_id=i.id
           where s.capability_code='evidence.review.correction.publish'
             and s.case_id=(select id from public.app_cases
               where case_reference='${CASE_REF}')
             and s.event_type='granted' order by s.effective_at desc limit 1),
          '${CASE_REF}',(select id from public.app_evidence_review_rounds
            where case_id=(select id from public.app_cases
              where case_reference='${CASE_REF}')),
          'review19-stale','review19-stale','${HASH}','${EXPIRES}'
        )->>'code'),
        (select count(*) from public.app_evidence_review_correction_handoffs),
        public.app_evidence_review_overall_status_v1(
          (select id from public.app_cases where case_reference='${CASE_REF}'),
          'fact-review-manifest-v1',
          (public.app_evidence_fact_review_manifest_v1(
            (select id from public.app_cases where case_reference='${CASE_REF}')
          )->>'manifest_hash')
        )
      ); rollback;`);
    assert(stale === "stale_review_round|0|TO_REVIEW", `stale_not_denied:${stale}`);

    const adminAuth = await psql(DATABASE, `begin read only;
      select i.auth_user_id::text
      from public.app_workforce_identities i
      join public.app_workforce_scope_assignments s
        on s.workforce_identity_id=i.id
      join public.app_cases c on c.id=s.case_id
      where s.capability_code='evidence.review.correction.publish'
        and s.event_type='granted' and c.case_reference='${CASE_REF}'
      order by s.effective_at desc limit 1; rollback;`);
    assert(/^[0-9a-f-]{36}$/i.test(adminAuth), "publisher_missing");
    const [left, right] = await Promise.all([
      rpc(adminAuth, "review19-concurrent-a", "review19-concurrent-a"),
      rpc(adminAuth, "review19-concurrent-b", "review19-concurrent-b"),
    ]);
    const codes = [left.code, right.code].sort().join("|");
    assert(
      codes === "already_published|published" &&
        left.handoff_ref === right.handoff_ref,
      `concurrent_publish_invalid:${codes}`,
    );
    const retry = await rpc(
      adminAuth,
      "review19-concurrent-a",
      "review19-concurrent-a",
    );
    assert(
      retry.handoff_ref === left.handoff_ref &&
        ["published", "already_published"].includes(String(retry.code)),
      "exact_retry_not_idempotent",
    );

    const state = await psql(DATABASE, `begin read only;
      with fixture as (
        select id from public.app_cases where case_reference='${CASE_REF}'
      ), manifest as (
        select public.app_evidence_fact_review_manifest_v1(fixture.id) body
        from fixture
      )
      select concat_ws('|',
        (select count(*) from public.app_evidence_review_correction_handoffs),
        (select count(*) from public.app_evidence_review_correction_handoffs h,
          fixture where h.case_id=fixture.id),
        (select public.app_evidence_review_overall_status_v1(
          fixture.id,manifest.body->>'manifest_version',
          manifest.body->>'manifest_hash') from fixture,manifest),
        (public.app_customer_correction_handoff_read_v1(
          '${AUTH_USER}','${CASE_REF}')->>'code'),
        (public.app_customer_correction_handoff_read_v1(
          '${OTHER_AUTH_USER}','${CASE_REF}')->>'code'),
        (public.app_customer_correction_handoff_read_v1(
          '${adminAuth}','${CASE_REF}')->>'code')
      ); rollback;`);
    assert(
      state === "1|1|WAITING_CUSTOMER|ok|customer_case_access_denied|customer_case_access_denied",
      `handoff_state_invalid:${state}`,
    );
    const safeRead = await psql(DATABASE, `begin read only;
      select public.app_customer_correction_handoff_read_v1(
        '${AUTH_USER}','${CASE_REF}'
      )::text; rollback;`);
    const safe = JSON.parse(safeRead.split("\n").find((line) => line.startsWith("{"))!);
    const serialized = JSON.stringify(safe);
    assert(
      safe.handoff?.items?.length === 1 &&
        safe.handoff.items[0].document_label === "Energiedocument" &&
        safe.handoff.items[0].fact_label === "Energieleverancier" &&
        safe.handoff.items[0].correction_reason === "INCORRECT_INFORMATION" &&
        safe.handoff.items[0].correction_reason_label === "Gegeven onjuist" &&
        safe.handoff.items[0].correction_instruction === "foute invoer" &&
        !serialized.includes("subject_ref") && !serialized.includes("manifest_hash") &&
        !serialized.includes("reviewer") && !serialized.includes("policy") &&
        !serialized.includes("bundle_sha256"),
      "customer_safe_bundle_invalid",
    );

    const immutable = await psql(DATABASE, `do $$
      begin
        begin
          update public.app_evidence_review_correction_handoffs
          set published_at=clock_timestamp();
          raise exception 'update unexpectedly succeeded';
        exception when others then
          if sqlerrm='update unexpectedly succeeded' then raise; end if;
        end;
        begin
          delete from public.app_evidence_review_correction_handoffs;
          raise exception 'delete unexpectedly succeeded';
        exception when others then
          if sqlerrm='delete unexpectedly succeeded' then raise; end if;
        end;
      end;
    $$;
    select count(*) from public.app_evidence_review_correction_handoffs;`);
    assert(immutable === "1", "handoff_mutability_guard_failed");

    console.log("REVIEW19_DATABASE_Q10_Q24=PASS");
  } finally {
    await dropDatabase();
  }
  assert(await activeFingerprint() === before, "active_tenant_changed_by_proof");
}

async function main(): Promise<void> {
  await endpointProof();
  if (Deno.args.includes("--source-only")) return;
  await databaseProof();
  console.log("EVIDENCE_REVIEW_CORRECTION_HANDOFF_Q01_Q24=PASS");
}

main().catch((error) => {
  console.error(`REVIEW19_PROOF=FAIL:${scrub(String(error?.message ?? error))}`);
  Deno.exit(1);
});
