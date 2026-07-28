const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const MIGRATION_PATH =
  "supabase/migrations/20260728180000_app_workforce_location_authorization_foundation.sql";
const DATABASE_PREFIX = "enval_wp3l_b_proof_";

const TARGET_TABLES = [
  "app_workforce_identities",
  "app_workforce_identity_states",
  "app_workforce_capability_assignments",
  "app_case_location_relations",
  "app_workforce_scope_assignments",
  "app_workforce_operation_requests",
  "app_workforce_operation_reviews",
] as const;

const GUARD_FUNCTIONS = [
  "app_workforce_identity_requires_initial_state",
  "app_workforce_identity_states_insert_guard",
  "app_workforce_capability_assignments_insert_guard",
  "app_case_location_relations_insert_guard",
  "app_workforce_scope_is_authorized_v1",
  "app_workforce_scope_assignments_insert_guard",
  "app_workforce_operation_requests_insert_guard",
  "app_workforce_operation_reviews_insert_guard",
  "app_workforce_operation_requests_update_guard",
] as const;

const CAPABILITIES = [
  "location.root.create",
  "location.observation.record",
  "location.version.accept.prepare",
  "location.version.accept.approve",
  "location.version.correct.prepare",
  "location.version.correct.approve",
] as const;

const PROTECTED_TABLES = [
  "auth.users",
  "public.app_customers",
  "public.app_customer_identities",
  "public.app_cases",
  "public.app_case_party_roles",
  "public.app_locations",
  "public.app_location_address_observations",
  "public.app_location_versions",
  "public.app_dossier_locations",
  "public.app_audit_events",
  "public.app_idempotency_keys",
] as const;

const WP3J_FUNCTIONS = [
  "app_accept_initial_location_version_v1",
  "app_correct_location_version_v1",
  "app_create_location_root_v1",
  "app_location_write_complete_v1",
  "app_location_write_idempotency_begin_v1",
  "app_location_write_lock_v1",
  "app_record_location_observation_v1",
] as const;

const T0 = "2030-01-01T00:00:00Z";
const T1 = "2030-01-01T01:00:00Z";
const T2 = "2030-01-01T02:00:00Z";
const T25 = "2030-01-01T02:30:00Z";
const T3 = "2030-01-01T03:00:00Z";
const T4 = "2030-01-01T04:00:00Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

class ProofFailure extends Error {}

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function q(value: number): void {
  console.log(`WP3L-B-Q${String(value).padStart(2, "0")}: PASS`);
}

function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 240);
}

async function processOutput(
  command: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const child = new Deno.Command(command, {
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

async function mustCommand(
  command: string,
  args: string[],
  stdin?: string,
): Promise<string> {
  const result = await processOutput(command, args, stdin);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || `${command}_failed`));
  }
  return result.stdout;
}

async function psqlResult(
  database: string,
  statement: string,
): Promise<CommandResult> {
  return await processOutput("docker", [
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
  ], statement);
}

async function psql(database: string, statement: string): Promise<string> {
  const result = await psqlResult(database, statement);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}

async function readOnlyMain(statement: string): Promise<string> {
  return await psql(
    MAIN_DATABASE,
    `begin transaction read only;\n${statement}\nrollback;`,
  );
}

async function reject(database: string, statement: string): Promise<void> {
  const result = await psqlResult(
    database,
    `begin;\n${statement}\ncommit;`,
  );
  assert(result.code !== 0, "expected_database_rejection");
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function protectedFingerprint(): Promise<string> {
  const counts = PROTECTED_TABLES.map((table) =>
    `(select count(*) from ${table})`
  ).join(" || '|' || ");
  const functionNames = WP3J_FUNCTIONS
    .map((name) => `'${name}'`)
    .join(",");
  return await readOnlyMain(`
    select (${counts})::text || '|' || coalesce((
      select pg_catalog.string_agg(
        p.proname || ':' || md5(p.prosrc),
        ',' order by p.proname
      )
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${functionNames})
    ), '');
  `);
}

async function targetCounts(database: string): Promise<string> {
  return await psql(
    database,
    `select ${
      TARGET_TABLES.map((table) => `(select count(*) from public.${table})`)
        .join(" || '|' || ")
    };`,
  );
}

async function publicTableInventory(database: string): Promise<string> {
  return await psql(
    database,
    `select pg_catalog.string_agg(table_name, ',' order by table_name)
     from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE';`,
  );
}

async function dropProofDatabase(database: string): Promise<void> {
  await mustCommand("docker", [
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

async function createFreshProofDatabase(
  database: string,
  migration: string,
): Promise<void> {
  await mustCommand("docker", [
    "exec",
    CONTAINER,
    "createdb",
    "-U",
    "postgres",
    "-T",
    "template0",
    database,
  ]);

  const rawSchema = await mustCommand("docker", [
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
  const schema = rawSchema
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === "SET log_min_messages TO 'fatal'") return false;
      if (trimmed.startsWith("ALTER DEFAULT PRIVILEGES ")) return false;
      if (/^(?:GRANT|REVOKE)\b/.test(trimmed)) {
        return /\bpublic\./.test(trimmed) ||
          /\bON SCHEMA public\b/.test(trimmed);
      }
      return true;
    })
    .join("\n");
  await psql(database, schema);
  assert(await targetCounts(database) === "0|0|0|0|0|0|0", "schema_copy_data");

  const inventory = await publicTableInventory(database);
  await psql(
    database,
    `
      drop table public.app_workforce_operation_reviews cascade;
      drop table public.app_workforce_operation_requests cascade;
      drop table public.app_workforce_scope_assignments cascade;
      drop table public.app_case_location_relations cascade;
      drop table public.app_workforce_capability_assignments cascade;
      drop table public.app_workforce_identity_states cascade;
      drop table public.app_workforce_identities cascade;
      drop function if exists public.app_workforce_identity_requires_initial_state();
      drop function if exists public.app_workforce_identity_states_insert_guard();
      drop function if exists public.app_workforce_capability_assignments_insert_guard();
      drop function if exists public.app_case_location_relations_insert_guard();
      drop function if exists public.app_workforce_scope_is_authorized_v1(
        uuid, uuid, text, uuid, uuid, timestamptz
      );
      drop function if exists public.app_workforce_scope_assignments_insert_guard();
      drop function if exists public.app_workforce_operation_requests_insert_guard();
      drop function if exists public.app_workforce_operation_reviews_insert_guard();
      drop function if exists public.app_workforce_operation_requests_update_guard();
    `,
  );

  const apply = await processOutput("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-qAt",
    "--single-transaction",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
  ], migration);
  assert(apply.code === 0, `fresh_apply:${scrub(apply.stderr)}`);
  assert(
    await publicTableInventory(database) === inventory,
    "fresh_apply_table_inventory",
  );
  assert(await targetCounts(database) === "0|0|0|0|0|0|0", "fresh_apply_rows");
}

const CUSTOMER_1 = uuid(1);
const CUSTOMER_2 = uuid(2);
const CASE_1 = uuid(10);
const CASE_2 = uuid(11);
const LOCATION_1 = uuid(20);
const LOCATION_2 = uuid(21);
const OBSERVATION_INITIAL = uuid(30);
const OBSERVATION_CORRECTION = uuid(31);
const OBSERVATION_OTHER = uuid(32);
const VERSION_1 = uuid(40);
const CUSTOMER_AUTH = uuid(90);
const CUSTOMER_IDENTITY = uuid(91);

const MAKER = uuid(100);
const CHECKER = uuid(101);
const OTHER_CHECKER = uuid(102);
const LIFECYCLE = uuid(103);
const REVOKED_IDENTITY = uuid(104);
const EXPIRED_IDENTITY = uuid(105);
const REVOKED_CAP_IDENTITY = uuid(106);
const AUTH_ONLY = uuid(107);
const WORKFORCE = [
  MAKER,
  CHECKER,
  OTHER_CHECKER,
  LIFECYCLE,
  REVOKED_IDENTITY,
  EXPIRED_IDENTITY,
  REVOKED_CAP_IDENTITY,
] as const;

const RELATION_1 = uuid(300);
const RELATION_1_CHAIN = uuid(301);
const RELATION_2 = uuid(302);
const RELATION_2_CHAIN = uuid(303);
const TEMP_RELATION = uuid(304);
const TEMP_RELATION_CHAIN = uuid(305);

const MAKER_ACCEPT_CAP = uuid(400);
const MAKER_ACCEPT_CHAIN = uuid(401);
const MAKER_CORRECT_CAP = uuid(402);
const MAKER_CORRECT_CHAIN = uuid(403);
const CHECKER_ACCEPT_CAP = uuid(404);
const CHECKER_ACCEPT_CHAIN = uuid(405);
const CHECKER_CORRECT_CAP = uuid(406);
const CHECKER_CORRECT_CHAIN = uuid(407);
const OTHER_ACCEPT_CAP = uuid(408);
const OTHER_ACCEPT_CHAIN = uuid(409);
const ROOT_CAP = uuid(410);
const ROOT_CAP_CHAIN = uuid(411);
const OBSERVATION_CAP = uuid(412);
const OBSERVATION_CAP_CHAIN = uuid(413);
const EXPIRED_CAP = uuid(414);
const EXPIRED_CAP_CHAIN = uuid(415);
const REVOKABLE_CAP = uuid(416);
const REVOKABLE_CAP_CHAIN = uuid(417);
const LIFECYCLE_CAP = uuid(418);
const LIFECYCLE_CAP_CHAIN = uuid(419);
const REVOKED_IDENTITY_CAP = uuid(420);
const REVOKED_IDENTITY_CAP_CHAIN = uuid(421);

const MAKER_ACCEPT_SCOPE = uuid(500);
const MAKER_ACCEPT_SCOPE_CHAIN = uuid(501);
const MAKER_CORRECT_SCOPE = uuid(502);
const MAKER_CORRECT_SCOPE_CHAIN = uuid(503);
const CHECKER_ACCEPT_SCOPE = uuid(504);
const CHECKER_ACCEPT_SCOPE_CHAIN = uuid(505);
const CHECKER_CORRECT_SCOPE = uuid(506);
const CHECKER_CORRECT_SCOPE_CHAIN = uuid(507);
const OTHER_ACCEPT_SCOPE = uuid(508);
const OTHER_ACCEPT_SCOPE_CHAIN = uuid(509);
const OTHER_WRONG_SCOPE = uuid(510);
const OTHER_WRONG_SCOPE_CHAIN = uuid(511);
const ROOT_SCOPE = uuid(512);
const ROOT_SCOPE_CHAIN = uuid(513);
const EXPIRED_SCOPE = uuid(514);
const EXPIRED_SCOPE_CHAIN = uuid(515);
const REVOKABLE_SCOPE = uuid(516);
const REVOKABLE_SCOPE_CHAIN = uuid(517);
const LIFECYCLE_SCOPE = uuid(518);
const LIFECYCLE_SCOPE_CHAIN = uuid(519);
const REVOKED_IDENTITY_SCOPE = uuid(520);
const REVOKED_IDENTITY_SCOPE_CHAIN = uuid(521);

function capability(
  id: string,
  chain: string,
  identity: string,
  code: string,
  request: string,
  validUntil: string | null = null,
): string {
  return `insert into public.app_workforce_capability_assignments (
    id, assignment_id, workforce_identity_id, capability_code, event_type,
    effective_at, valid_until, recorded_at, decision_ref,
    recorded_by_actor_ref, request_id
  ) values (
    '${id}', '${chain}', '${identity}', '${code}', 'granted',
    '${T0}', ${validUntil ? `'${validUntil}'` : "null"}, '${T0}',
    'decision:${request}', 'actor:proof', '${request}'
  );`;
}

function scope(
  id: string,
  chain: string,
  identity: string,
  capabilityId: string,
  code: string,
  caseId: string,
  locationId: string | null,
  relationId: string | null,
  request: string,
  validUntil: string | null = null,
): string {
  return `insert into public.app_workforce_scope_assignments (
    id, scope_assignment_id, workforce_identity_id,
    capability_assignment_id, capability_code, case_id, location_id,
    case_location_relation_id, event_type, effective_at, valid_until,
    recorded_at, decision_ref, recorded_by_actor_ref, request_id
  ) values (
    '${id}', '${chain}', '${identity}', '${capabilityId}', '${code}',
    '${caseId}', ${locationId ? `'${locationId}'` : "null"},
    ${relationId ? `'${relationId}'` : "null"}, 'granted', '${T0}',
    ${validUntil ? `'${validUntil}'` : "null"}, '${T0}',
    'decision:${request}', 'actor:proof', '${request}'
  );`;
}

function operationRequest(
  id: string,
  type: "initial_location_acceptance" | "location_correction",
  maker: string,
  makerScope: string,
  request: string,
  idempotency: string,
  hash = HASH_A,
  caseId = CASE_1,
  locationId = LOCATION_1,
): string {
  const correction = type === "location_correction";
  return `insert into public.app_workforce_operation_requests (
    id, operation_type, case_id, location_id, observation_id,
    predecessor_version_id, maker_workforce_identity_id,
    maker_scope_assignment_id, maker_capability_code, payload_hash,
    payload_contract_version, request_id, idempotency_key, created_at
  ) values (
    '${id}', '${type}', '${caseId}', '${locationId}',
    '${correction ? OBSERVATION_CORRECTION : OBSERVATION_INITIAL}',
    ${correction ? `'${VERSION_1}'` : "null"}, '${maker}', '${makerScope}',
    '${
    correction
      ? "location.version.correct.prepare"
      : "location.version.accept.prepare"
  }',
    '${hash}',
    '${correction ? "location_correction_v1" : "location_acceptance_v1"}',
    '${request}', '${idempotency}', '${T1}'
  );`;
}

function review(
  id: string,
  operationId: string,
  checker: string,
  checkerScope: string,
  capabilityCode: string,
  outcome: "approved" | "rejected",
  request: string,
  idempotency: string,
  hash = HASH_A,
): string {
  return `insert into public.app_workforce_operation_reviews (
    id, operation_request_id, outcome, reviewed_payload_hash,
    checker_workforce_identity_id, checker_scope_assignment_id,
    checker_capability_code, reviewed_at, recorded_at, decision_ref,
    reason_ref, request_id, idempotency_key
  ) values (
    '${id}', '${operationId}', '${outcome}', '${hash}', '${checker}',
    '${checkerScope}', '${capabilityCode}', '${T2}', '${T2}',
    'decision:${request}', ${
    outcome === "rejected" ? "'reason:rejected'" : "null"
  },
    '${request}', '${idempotency}'
  );`;
}

function executeRequest(
  operationId: string,
  executionRequest: string,
  resultRef: string,
  type: "initial" | "correction" = "initial",
): string {
  return `update public.app_workforce_operation_requests
    set execution_status = 'executed',
        executed_at = '${T3}',
        execution_request_id = '${executionRequest}',
        wp3j_rpc_name = '${
    type === "initial"
      ? "app_accept_initial_location_version_v1"
      : "app_correct_location_version_v1"
  }',
        wp3j_result_code = 'authorization_eligible',
        wp3j_result_ref = '${resultRef}'
    where id = '${operationId}';`;
}

async function createFixtures(database: string): Promise<void> {
  const authRows = [
    CUSTOMER_AUTH,
    AUTH_ONLY,
    ...WORKFORCE.map((identity) => uuid(Number(identity.slice(-12)) + 1000)),
  ].map((id) => `('${id}')`).join(",");

  const identityRows = WORKFORCE.map((identity) => {
    const auth = uuid(Number(identity.slice(-12)) + 1000);
    return `('${identity}', '${auth}', 'actor:bootstrap-proof',
      'decision:bootstrap-proof', 'identity:${identity.slice(-3)}')`;
  }).join(",");
  const stateRows = WORKFORCE.map((identity, index) =>
    `('${uuid(200 + index)}', '${identity}', 'active',
      '2029-12-31T00:00:00Z', '2029-12-31T00:00:00Z',
      'decision:initial-active', 'actor:proof',
      'state:initial:${identity.slice(-3)}')`
  ).join(",");

  await psql(
    database,
    `begin;
      insert into auth.users (id) values ${authRows};
      insert into public.app_customers (id, customer_type)
        values ('${CUSTOMER_1}', 'particulier'), ('${CUSTOMER_2}', 'zakelijk');
      insert into public.app_customer_identities (
        id, customer_id, auth_user_id, email_normalized
      ) values (
        '${CUSTOMER_IDENTITY}', '${CUSTOMER_1}', '${CUSTOMER_AUTH}',
        'proof-fixture@invalid.example'
      );
      insert into public.app_cases (
        id, customer_id, case_reference, created_at, created_by_actor_type,
        created_by_actor_ref, source_class, source_ref, request_id
      ) values
        ('${CASE_1}', '${CUSTOMER_1}', 'CASEPROOF001', '${T0}', 'system',
         'actor:proof', 'proof', 'source:case:1', 'case:1'),
        ('${CASE_2}', '${CUSTOMER_2}', 'CASEPROOF002', '${T0}', 'system',
         'actor:proof', 'proof', 'source:case:2', 'case:2');
      insert into public.app_locations (
        id, created_at, created_by_actor_ref, created_from_request_id,
        creation_basis
      ) values
        ('${LOCATION_1}', '${T0}', 'actor:proof', 'location:1',
         'manual_migration_review'),
        ('${LOCATION_2}', '${T0}', 'actor:proof', 'location:2',
         'manual_migration_review');
      insert into public.app_location_address_observations (
        id, location_id, observation_kind, descriptor_kind, observed_at,
        recorded_at, recorded_by_actor_ref, recorded_from_request_id,
        country_code, site_reference
      ) values
        ('${OBSERVATION_INITIAL}', '${LOCATION_1}', 'manual_observed',
         'site_reference', '${T0}', '${T0}', 'actor:proof',
         'observation:initial', 'NL', 'site:initial'),
        ('${OBSERVATION_CORRECTION}', '${LOCATION_1}', 'manual_observed',
         'site_reference', '${T1}', '${T1}', 'actor:proof',
         'observation:correction', 'NL', 'site:correction'),
        ('${OBSERVATION_OTHER}', '${LOCATION_2}', 'manual_observed',
         'site_reference', '${T0}', '${T0}', 'actor:proof',
         'observation:other', 'NL', 'site:other');
      insert into public.app_location_versions (
        id, location_id, accepted_from_observation_id, valid_from,
        recorded_at, accepted_at, accepted_by_actor_ref,
        accepted_from_request_id, acceptance_decision_ref, descriptor_kind,
        country_code, site_reference
      ) values (
        '${VERSION_1}', '${LOCATION_1}', '${OBSERVATION_INITIAL}', '${T0}',
        '${T0}', '${T0}', 'actor:proof', 'version:1', 'decision:version:1',
        'site_reference', 'NL', 'site:initial'
      );
      insert into public.app_parties (
        id, party_kind, source_type, source_reference_type,
        source_reference_id, request_id, actor_type, actor_ref,
        recorded_at, created_at
      ) values (
        '${uuid(60)}', 'natural_person', 'proof', 'opaque', 'party:1',
        'party:1', 'system', 'actor:proof', '${T0}', '${T0}'
      );
      insert into public.app_party_person_versions (
        id, party_id, full_name, valid_from, source_type,
        source_reference_type, source_reference_id, request_id, actor_type,
        actor_ref, recorded_at
      ) values (
        '${uuid(61)}', '${uuid(60)}', 'Proof Fixture', '2030-01-01',
        'proof', 'opaque', 'profile:1', 'profile:1', 'system',
        'actor:proof', '${T0}'
      );
      insert into public.app_case_party_roles (
        id, role_claim_id, case_id, party_id, person_profile_version_id,
        role_type, claim_status, valid_from, recorded_at,
        recorded_by_actor_type, recorded_by_actor_ref, source_class,
        source_ref, request_id
      ) values (
        '${uuid(62)}', '${uuid(63)}', '${CASE_1}', '${uuid(60)}',
        '${uuid(61)}', 'case_contact', 'asserted', '${T0}', '${T0}',
        'system', 'actor:proof', 'proof', 'case-role:1', 'case-role:1'
      );
      insert into public.app_workforce_identities (
        id, auth_user_id, created_by_actor_ref, creation_decision_ref,
        request_id
      ) values ${identityRows};
      insert into public.app_workforce_identity_states (
        id, workforce_identity_id, state, effective_at, recorded_at,
        decision_ref, recorded_by_actor_ref, request_id
      ) values ${stateRows};
    commit;`,
  );

  await psql(
    database,
    `begin;
      insert into public.app_case_location_relations (
        id, relation_id, case_id, location_id, event_type, effective_at,
        recorded_at, decision_ref, recorded_by_actor_ref, request_id
      ) values
        ('${RELATION_1}', '${RELATION_1_CHAIN}', '${CASE_1}', '${LOCATION_1}',
         'linked', '${T0}', '${T0}', 'decision:relation:1',
         'actor:proof', 'relation:1'),
        ('${RELATION_2}', '${RELATION_2_CHAIN}', '${CASE_2}', '${LOCATION_2}',
         'linked', '${T0}', '${T0}', 'decision:relation:2',
         'actor:proof', 'relation:2');
      ${
      capability(
        MAKER_ACCEPT_CAP,
        MAKER_ACCEPT_CHAIN,
        MAKER,
        CAPABILITIES[2],
        "cap:maker:accept",
      )
    }
      ${
      capability(
        MAKER_CORRECT_CAP,
        MAKER_CORRECT_CHAIN,
        MAKER,
        CAPABILITIES[4],
        "cap:maker:correct",
      )
    }
      ${
      capability(
        CHECKER_ACCEPT_CAP,
        CHECKER_ACCEPT_CHAIN,
        CHECKER,
        CAPABILITIES[3],
        "cap:checker:accept",
      )
    }
      ${
      capability(
        CHECKER_CORRECT_CAP,
        CHECKER_CORRECT_CHAIN,
        CHECKER,
        CAPABILITIES[5],
        "cap:checker:correct",
      )
    }
      ${
      capability(
        OTHER_ACCEPT_CAP,
        OTHER_ACCEPT_CHAIN,
        OTHER_CHECKER,
        CAPABILITIES[3],
        "cap:other:accept",
      )
    }
      ${
      capability(ROOT_CAP, ROOT_CAP_CHAIN, MAKER, CAPABILITIES[0], "cap:root")
    }
      ${
      capability(
        OBSERVATION_CAP,
        OBSERVATION_CAP_CHAIN,
        MAKER,
        CAPABILITIES[1],
        "cap:observation",
      )
    }
      ${
      capability(
        EXPIRED_CAP,
        EXPIRED_CAP_CHAIN,
        EXPIRED_IDENTITY,
        CAPABILITIES[1],
        "cap:expired",
        T2,
      )
    }
      ${
      capability(
        REVOKABLE_CAP,
        REVOKABLE_CAP_CHAIN,
        REVOKED_CAP_IDENTITY,
        CAPABILITIES[1],
        "cap:revokable",
      )
    }
      ${
      capability(
        LIFECYCLE_CAP,
        LIFECYCLE_CAP_CHAIN,
        LIFECYCLE,
        CAPABILITIES[1],
        "cap:lifecycle",
      )
    }
      ${
      capability(
        REVOKED_IDENTITY_CAP,
        REVOKED_IDENTITY_CAP_CHAIN,
        REVOKED_IDENTITY,
        CAPABILITIES[1],
        "cap:revoked-identity",
      )
    }
      ${
      scope(
        MAKER_ACCEPT_SCOPE,
        MAKER_ACCEPT_SCOPE_CHAIN,
        MAKER,
        MAKER_ACCEPT_CAP,
        CAPABILITIES[2],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:maker:accept",
      )
    }
      ${
      scope(
        MAKER_CORRECT_SCOPE,
        MAKER_CORRECT_SCOPE_CHAIN,
        MAKER,
        MAKER_CORRECT_CAP,
        CAPABILITIES[4],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:maker:correct",
      )
    }
      ${
      scope(
        CHECKER_ACCEPT_SCOPE,
        CHECKER_ACCEPT_SCOPE_CHAIN,
        CHECKER,
        CHECKER_ACCEPT_CAP,
        CAPABILITIES[3],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:checker:accept",
      )
    }
      ${
      scope(
        CHECKER_CORRECT_SCOPE,
        CHECKER_CORRECT_SCOPE_CHAIN,
        CHECKER,
        CHECKER_CORRECT_CAP,
        CAPABILITIES[5],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:checker:correct",
      )
    }
      ${
      scope(
        OTHER_ACCEPT_SCOPE,
        OTHER_ACCEPT_SCOPE_CHAIN,
        OTHER_CHECKER,
        OTHER_ACCEPT_CAP,
        CAPABILITIES[3],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:other:accept",
      )
    }
      ${
      scope(
        OTHER_WRONG_SCOPE,
        OTHER_WRONG_SCOPE_CHAIN,
        OTHER_CHECKER,
        OTHER_ACCEPT_CAP,
        CAPABILITIES[3],
        CASE_2,
        LOCATION_2,
        RELATION_2,
        "scope:other:wrong",
      )
    }
      ${
      scope(
        ROOT_SCOPE,
        ROOT_SCOPE_CHAIN,
        MAKER,
        ROOT_CAP,
        CAPABILITIES[0],
        CASE_1,
        null,
        null,
        "scope:root",
      )
    }
      ${
      scope(
        EXPIRED_SCOPE,
        EXPIRED_SCOPE_CHAIN,
        EXPIRED_IDENTITY,
        EXPIRED_CAP,
        CAPABILITIES[1],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:expired",
        T2,
      )
    }
      ${
      scope(
        REVOKABLE_SCOPE,
        REVOKABLE_SCOPE_CHAIN,
        REVOKED_CAP_IDENTITY,
        REVOKABLE_CAP,
        CAPABILITIES[1],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:revokable",
      )
    }
      ${
      scope(
        LIFECYCLE_SCOPE,
        LIFECYCLE_SCOPE_CHAIN,
        LIFECYCLE,
        LIFECYCLE_CAP,
        CAPABILITIES[1],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:lifecycle",
      )
    }
      ${
      scope(
        REVOKED_IDENTITY_SCOPE,
        REVOKED_IDENTITY_SCOPE_CHAIN,
        REVOKED_IDENTITY,
        REVOKED_IDENTITY_CAP,
        CAPABILITIES[1],
        CASE_1,
        LOCATION_1,
        RELATION_1,
        "scope:revoked-identity",
      )
    }
    commit;`,
  );
}

async function catalogProof(
  database: string,
  migration: string,
): Promise<void> {
  const tableList = TARGET_TABLES.map((name) => `'${name}'`).join(",");
  assert(
    await psql(
      database,
      `select count(*) from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE'
         and table_name in (${tableList});`,
    ) === "7",
    "target_table_manifest",
  );
  q(1);

  assert(
    await psql(
      database,
      `select count(*) from information_schema.tables
       where table_schema='public' and table_type='BASE TABLE'
         and (
           table_name like 'app_workforce%'
           or table_name like '%rbac%'
           or table_name like '%permission%'
         )
         and table_name not in (${tableList});`,
    ) === "0",
    "eighth_authorization_table",
  );
  q(2);

  assert(
    await psql(
      database,
      `select count(*) from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname in (${tableList})
         and c.relrowsecurity;`,
    ) === "7",
    "rls_manifest",
  );
  q(3);

  assert(
    await psql(
      database,
      `select count(*) from pg_catalog.pg_policy p
       join pg_catalog.pg_class c on c.oid=p.polrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relname in (${tableList})
         and p.polname='deny_all'
         and p.polroles = array[
           (select oid from pg_catalog.pg_roles where rolname='anon'),
           (select oid from pg_catalog.pg_roles where rolname='authenticated')
         ]::oid[]
         and pg_catalog.pg_get_expr(p.polqual,p.polrelid)='false'
         and pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)='false';`,
    ) === "7",
    "deny_all_policy_manifest",
  );
  q(4);

  assert(
    await psql(
      database,
      `select count(*) from information_schema.table_privileges
       where table_schema='public' and table_name in (${tableList})
         and grantee in ('PUBLIC','anon','authenticated');`,
    ) === "0",
    "browser_table_privileges",
  );
  q(5);

  assert(
    await psql(
      database,
      `select count(*) || '|' ||
              count(*) filter (where privilege_type in ('SELECT','INSERT'))
       from information_schema.table_privileges
       where table_schema='public' and table_name in (${tableList})
         and grantee='service_role';`,
    ) === "14|14",
    "service_role_privileges",
  );
  q(6);

  const functionList = GUARD_FUNCTIONS.map((name) => `'${name}'`).join(",");
  assert(
    await psql(
      database,
      `select count(*) from pg_catalog.pg_proc p
       join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in (${functionList})
         and (
           (
             not p.prosecdef
             and p.proconfig = array['search_path=pg_catalog, public']
           )
           or (
             p.prosecdef
             and p.proconfig = array['search_path=""']
           )
         )
         and not has_function_privilege(
           'anon', p.oid, 'EXECUTE'
         )
         and not has_function_privilege(
           'authenticated', p.oid, 'EXECUTE'
         )
         and not has_function_privilege(
           'service_role', p.oid, 'EXECUTE'
         );`,
    ) === String(GUARD_FUNCTIONS.length),
    "guard_security",
  );
  q(7);

  assert(
    !/insert\s+into\s+public\.app_workforce_(?:identities|capability_assignments|scope_assignments)\s*\([^;]*\)\s*values/is
      .test(migration) &&
      !/@/.test(
        migration.replaceAll(
          "TKV ALIGNMENT GUARD — INTERNAL ARCHITECTURE, NOT REGULATORY ACCEPTANCE",
          "",
        ),
      ) &&
      !/perform\s+public\.app_(?:accept_initial|correct)_location_version_v1/is
        .test(migration),
    "migration_population_or_wp3j_call",
  );
  q(8);
}

async function behaviorProof(database: string): Promise<void> {
  await createFixtures(database);

  const serviceRoleRequest = uuid(599);
  await psql(
    database,
    `begin;
     set local role service_role;
     ${
      operationRequest(
        serviceRoleRequest,
        "initial_location_acceptance",
        MAKER,
        MAKER_ACCEPT_SCOPE,
        "operation:service-role-trigger",
        "idem:service-role-trigger",
      )
    }
     ${
      review(
        uuid(598),
        serviceRoleRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:service-role-trigger",
        "idem:review:service-role-trigger",
      )
    }
     rollback;`,
  );

  const makerAuth = uuid(Number(MAKER.slice(-12)) + 1000);
  assert(
    await psql(
      database,
      `select count(*) from public.app_workforce_identities identity_root
       join auth.users auth_user on auth_user.id=identity_root.auth_user_id
       join public.app_workforce_identity_states state_event
         on state_event.workforce_identity_id=identity_root.id
       where identity_root.id='${MAKER}'
         and identity_root.auth_user_id='${makerAuth}'
         and identity_root.workforce_ref =
             'app_workforce_identity:' || identity_root.id::text
         and state_event.state='active';`,
    ) === "1",
    "auth_workforce_binding",
  );
  q(9);

  await reject(
    database,
    `insert into public.app_workforce_identities (
       id, auth_user_id, created_by_actor_ref, creation_decision_ref,
       request_id
     ) values (
       '${uuid(600)}', '${makerAuth}', 'actor:proof', 'decision:duplicate',
       'identity:duplicate'
     );`,
  );
  q(10);

  assert(
    await psql(
      database,
      `select
         (select count(*) from public.app_customer_identities
          where auth_user_id='${CUSTOMER_AUTH}') || '|' ||
         (select count(*) from public.app_workforce_identities
          where auth_user_id='${CUSTOMER_AUTH}') || '|' ||
         public.app_workforce_scope_is_authorized_v1(
           '${AUTH_ONLY}', '${uuid(999)}', 'location.root.create',
           '${CASE_1}', null, '${T1}'
         );`,
    ) === "1|0|false",
    "customer_identity_inheritance",
  );
  q(11);

  assert(
    await psql(
      database,
      `select
         (select count(*) from public.app_case_party_roles
          where case_id='${CASE_1}') || '|' ||
         (select count(*) from public.app_workforce_capability_assignments c
          join public.app_case_party_roles r on false
          where r.case_id='${CASE_1}');`,
    ) === "1|0",
    "case_role_inheritance",
  );
  q(12);

  assert(
    await psql(
      database,
      `select count(*) from pg_catalog.pg_constraint fk
       join pg_catalog.pg_class child on child.oid=fk.conrelid
       join pg_catalog.pg_class parent on parent.oid=fk.confrelid
       where fk.contype='f'
         and child.relname in (${TARGET_TABLES.map((v) => `'${v}'`).join(",")})
         and (
           parent.relname like '%representation%'
           or parent.relname like '%mandate%'
           or parent.relname='app_case_party_roles'
           or parent.relname='app_customer_identities'
         );`,
    ) === "0",
    "representation_inheritance",
  );
  q(13);

  assert(
    await psql(
      database,
      `select pg_catalog.string_agg(distinct capability_code, ','
       order by capability_code)
       from public.app_workforce_capability_assignments;`,
    ) === [...CAPABILITIES].sort().join(","),
    "capability_vocabulary_accept",
  );
  q(14);

  for (const [index, invalid] of ["*", "admin", "location.unknown"].entries()) {
    await reject(
      database,
      capability(
        uuid(610 + index * 2),
        uuid(611 + index * 2),
        MAKER,
        invalid,
        `cap:invalid:${index}`,
      ),
    );
  }
  q(15);

  await psql(
    database,
    `insert into public.app_workforce_identity_states (
       id, workforce_identity_id, state, effective_at, recorded_at,
       decision_ref, reason_ref, recorded_by_actor_ref, request_id,
       supersedes_state_id
     ) values
       ('${uuid(620)}','${LIFECYCLE}','suspended','${T1}','${T1}',
        'decision:suspend','reason:suspend','actor:proof','state:suspend',
        '${uuid(203)}'),
       ('${uuid(621)}','${LIFECYCLE}','active','${T2}','${T2}',
        'decision:reactivate',null,'actor:proof','state:reactivate',
        '${uuid(620)}');`,
  );
  assert(
    await psql(
      database,
      `select pg_catalog.string_agg(state, '>' order by effective_at)
       from public.app_workforce_identity_states
       where workforce_identity_id='${LIFECYCLE}';`,
    ) === "active>suspended>active",
    "lifecycle_history",
  );
  await reject(
    database,
    `update public.app_workforce_identity_states
     set decision_ref='decision:rewrite' where id='${uuid(620)}';`,
  );
  await reject(
    database,
    `delete from public.app_workforce_identity_states
     where id='${uuid(620)}';`,
  );
  q(16);

  await reject(
    database,
    `insert into public.app_workforce_identity_states (
       id, workforce_identity_id, state, effective_at, recorded_at,
       decision_ref, recorded_by_actor_ref, request_id
     ) values (
       '${uuid(622)}','${LIFECYCLE}','active','${T3}','${T3}',
       'decision:second-root','actor:proof','state:second-root'
     );`,
  );
  await reject(
    database,
    `insert into public.app_workforce_identity_states (
       id, workforce_identity_id, state, effective_at, recorded_at,
       decision_ref, recorded_by_actor_ref, request_id, supersedes_state_id
     ) values (
       '${uuid(623)}','${LIFECYCLE}','active','${T3}','${T3}',
       'decision:active-active','actor:proof','state:active-active',
       '${uuid(621)}'
     );`,
  );
  q(17);

  assert(
    await psql(
      database,
      `select public.app_workforce_scope_is_authorized_v1(
         '${LIFECYCLE}','${LIFECYCLE_SCOPE}','${CAPABILITIES[1]}',
         '${CASE_1}','${LOCATION_1}','2030-01-01T01:30:00Z'
       );`,
    ) === "f",
    "suspended_authorization",
  );
  q(18);

  await psql(
    database,
    `insert into public.app_workforce_identity_states (
       id, workforce_identity_id, state, effective_at, recorded_at,
       decision_ref, reason_ref, recorded_by_actor_ref, request_id,
       supersedes_state_id
     ) values (
       '${uuid(624)}','${REVOKED_IDENTITY}','revoked','${T1}','${T1}',
       'decision:revoke','reason:revoke','actor:proof','state:revoke',
       '${uuid(204)}'
     );`,
  );
  assert(
    await psql(
      database,
      `select public.app_workforce_scope_is_authorized_v1(
         '${REVOKED_IDENTITY}','${REVOKED_IDENTITY_SCOPE}',
         '${CAPABILITIES[1]}','${CASE_1}','${LOCATION_1}','${T2}'
       );`,
    ) === "f",
    "revoked_authorization",
  );
  q(19);

  await reject(
    database,
    capability(
      uuid(625),
      uuid(626),
      uuid(9999),
      CAPABILITIES[1],
      "cap:missing-identity",
    ),
  );
  q(20);

  await psql(
    database,
    `insert into public.app_workforce_capability_assignments (
       id, assignment_id, workforce_identity_id, capability_code,
       event_type, effective_at, recorded_at, decision_ref, reason_ref,
       recorded_by_actor_ref, request_id, supersedes_assignment_event_id
     ) values (
       '${uuid(627)}','${REVOKABLE_CAP_CHAIN}','${REVOKED_CAP_IDENTITY}',
       '${CAPABILITIES[1]}','revoked','${T2}','${T2}',
       'decision:cap-revoke','reason:cap-revoke','actor:proof',
       'cap:revoke','${REVOKABLE_CAP}'
     );`,
  );
  assert(
    await psql(
      database,
      `select
       public.app_workforce_scope_is_authorized_v1(
         '${EXPIRED_IDENTITY}','${EXPIRED_SCOPE}','${CAPABILITIES[1]}',
         '${CASE_1}','${LOCATION_1}','${T3}'
       ) || '|' ||
       public.app_workforce_scope_is_authorized_v1(
         '${REVOKED_CAP_IDENTITY}','${REVOKABLE_SCOPE}','${CAPABILITIES[1]}',
         '${CASE_1}','${LOCATION_1}','${T3}'
       );`,
    ) === "false|false",
    "expired_revoked_capability",
  );
  q(21);

  await reject(
    database,
    capability(
      uuid(628),
      uuid(629),
      MAKER,
      CAPABILITIES[2],
      "cap:overlap",
      T4,
    ),
  );
  q(22);

  await reject(
    database,
    `insert into public.app_case_location_relations (
       id, relation_id, case_id, location_id, event_type, effective_at,
       recorded_at, decision_ref, recorded_by_actor_ref, request_id
     ) values (
       '${uuid(630)}','${uuid(631)}','${uuid(9998)}','${LOCATION_1}',
       'linked','${T0}','${T0}','decision:bad-relation','actor:proof',
       'relation:bad-case'
     );`,
  );
  await reject(
    database,
    `insert into public.app_case_location_relations (
       id, relation_id, case_id, location_id, event_type, effective_at,
       recorded_at, decision_ref, recorded_by_actor_ref, request_id
     ) values (
       '${uuid(632)}','${uuid(633)}','${CASE_1}','${uuid(9997)}',
       'linked','${T0}','${T0}','decision:bad-relation','actor:proof',
       'relation:bad-location'
     );`,
  );
  q(23);

  assert(
    await psql(
      database,
      `select count(*) from information_schema.columns
       where table_schema='public' and table_name='app_case_location_relations'
         and (
           column_name like '%owner%'
           or column_name like '%ean%'
           or column_name like '%authority%'
           or column_name like '%dossier%'
           or column_name like '%address%'
         );`,
    ) === "0",
    "relation_no_inference_columns",
  );
  q(24);

  await psql(
    database,
    `insert into public.app_case_location_relations (
       id, relation_id, case_id, location_id, event_type, effective_at,
       valid_until, recorded_at, decision_ref, recorded_by_actor_ref,
       request_id
     ) values (
       '${TEMP_RELATION}','${TEMP_RELATION_CHAIN}','${CASE_1}','${LOCATION_2}',
       'linked','${T0}','${T4}','${T0}','decision:temp-link',
       'actor:proof','relation:temp'
     );`,
  );
  await reject(
    database,
    `insert into public.app_case_location_relations (
       id, relation_id, case_id, location_id, event_type, effective_at,
       recorded_at, decision_ref, recorded_by_actor_ref, request_id
     ) values (
       '${uuid(634)}','${uuid(635)}','${CASE_1}','${LOCATION_2}',
       'linked','${T1}','${T1}','decision:overlap','actor:proof',
       'relation:overlap'
     );`,
  );
  await psql(
    database,
    `insert into public.app_case_location_relations (
       id, relation_id, case_id, location_id, event_type, effective_at,
       recorded_at, decision_ref, reason_ref, recorded_by_actor_ref,
       request_id, supersedes_relation_event_id
     ) values (
       '${uuid(636)}','${TEMP_RELATION_CHAIN}','${CASE_1}','${LOCATION_2}',
       'unlinked','${T2}','${T2}','decision:unlink','reason:unlink',
       'actor:proof','relation:unlink','${TEMP_RELATION}'
     );`,
  );
  assert(
    await psql(
      database,
      `select not exists (
         select 1 from public.app_case_location_relations root
         where root.id='${TEMP_RELATION}' and root.effective_at <= '${T3}'
           and (root.valid_until is null or '${T3}' < root.valid_until)
           and not exists (
             select 1 from public.app_case_location_relations ended
             where ended.relation_id=root.relation_id
               and ended.event_type='unlinked'
               and ended.effective_at <= '${T3}'
           )
       );`,
    ) === "t",
    "relation_temporal_rules",
  );
  q(25);

  await reject(
    database,
    scope(
      uuid(637),
      uuid(638),
      MAKER,
      uuid(9996),
      CAPABILITIES[1],
      CASE_1,
      LOCATION_1,
      RELATION_1,
      "scope:missing-cap",
    ),
  );
  q(26);

  await reject(
    database,
    scope(
      uuid(639),
      uuid(640),
      MAKER,
      OBSERVATION_CAP,
      CAPABILITIES[1],
      CASE_1,
      LOCATION_2,
      RELATION_1,
      "scope:wrong-relation",
    ),
  );
  q(27);

  assert(
    await psql(
      database,
      `select public.app_workforce_scope_is_authorized_v1(
         '${MAKER}','${uuid(9995)}','${CAPABILITIES[1]}',
         '${CASE_1}','${LOCATION_1}','${T1}'
       );`,
    ) === "f",
    "capability_without_scope",
  );
  q(28);

  assert(
    await psql(
      database,
      `select public.app_workforce_scope_is_authorized_v1(
         '${REVOKED_CAP_IDENTITY}','${REVOKABLE_SCOPE}','${CAPABILITIES[1]}',
         '${CASE_1}','${LOCATION_1}','${T3}'
       );`,
    ) === "f",
    "scope_without_valid_capability",
  );
  q(29);

  await reject(
    database,
    operationRequest(
      uuid(641),
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:wrong-case",
      "idem:wrong-case",
      HASH_A,
      CASE_2,
      LOCATION_1,
    ),
  );
  q(30);

  await reject(
    database,
    operationRequest(
      uuid(642),
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:wrong-location",
      "idem:wrong-location",
      HASH_A,
      CASE_1,
      LOCATION_2,
    ),
  );
  q(31);

  assert(
    await psql(
      database,
      `select public.app_workforce_scope_is_authorized_v1(
         '${MAKER}','${ROOT_SCOPE}','${CAPABILITIES[0]}',
         '${CASE_1}',null,'${T1}'
       );`,
    ) === "t",
    "root_create_case_scope",
  );
  await reject(
    database,
    scope(
      uuid(643),
      uuid(644),
      MAKER,
      ROOT_CAP,
      CAPABILITIES[0],
      CASE_1,
      LOCATION_1,
      RELATION_1,
      "scope:root-too-broad",
    ),
  );
  await reject(
    database,
    scope(
      uuid(645),
      uuid(646),
      MAKER,
      OBSERVATION_CAP,
      CAPABILITIES[1],
      CASE_1,
      null,
      null,
      "scope:nonroot-case-only",
    ),
  );
  q(32);

  const initialRequest = uuid(700);
  const correctionRequest = uuid(701);
  await psql(
    database,
    operationRequest(
      initialRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:initial",
      "idem:initial",
    ) +
      operationRequest(
        correctionRequest,
        "location_correction",
        MAKER,
        MAKER_CORRECT_SCOPE,
        "operation:correction",
        "idem:correction",
      ),
  );
  assert(
    await psql(
      database,
      `select pg_catalog.string_agg(operation_type, ',' order by operation_type)
       from public.app_workforce_operation_requests
       where id in ('${initialRequest}','${correctionRequest}');`,
    ) === "initial_location_acceptance,location_correction",
    "operation_vocabulary",
  );
  await reject(
    database,
    `insert into public.app_workforce_operation_requests (
       operation_type
     ) values ('unknown');`,
  );
  q(33);

  await reject(
    database,
    `update public.app_workforce_operation_requests
     set payload_hash='${HASH_B}' where id='${initialRequest}';`,
  );
  await reject(
    database,
    `delete from public.app_workforce_operation_requests
     where id='${initialRequest}';`,
  );
  q(34);

  await reject(
    database,
    operationRequest(
      uuid(702),
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:changed-same-key",
      "idem:initial",
      HASH_B,
    ),
  );
  await psql(
    database,
    operationRequest(
      uuid(703),
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:changed-new-key",
      "idem:changed-new",
      HASH_B,
    ),
  );
  q(35);

  const hashReviewRequest = uuid(704);
  await psql(
    database,
    operationRequest(
      hashReviewRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:hash-review",
      "idem:hash-review",
    ),
  );
  await reject(
    database,
    review(
      uuid(705),
      hashReviewRequest,
      CHECKER,
      CHECKER_ACCEPT_SCOPE,
      CAPABILITIES[3],
      "approved",
      "review:wrong-hash",
      "idem:review:wrong-hash",
      HASH_B,
    ),
  );
  await psql(
    database,
    review(
      uuid(706),
      hashReviewRequest,
      CHECKER,
      CHECKER_ACCEPT_SCOPE,
      CAPABILITIES[3],
      "approved",
      "review:right-hash",
      "idem:review:right-hash",
    ),
  );
  q(36);

  const selfRequest = uuid(707);
  await psql(
    database,
    operationRequest(
      selfRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:self",
      "idem:self",
    ),
  );
  await reject(
    database,
    review(
      uuid(708),
      selfRequest,
      MAKER,
      MAKER_ACCEPT_SCOPE,
      CAPABILITIES[3],
      "approved",
      "review:self",
      "idem:review:self",
    ),
  );
  q(37);

  const noCapabilityRequest = uuid(709);
  await psql(
    database,
    operationRequest(
      noCapabilityRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:no-checker-cap",
      "idem:no-checker-cap",
    ),
  );
  await reject(
    database,
    review(
      uuid(710),
      noCapabilityRequest,
      AUTH_ONLY,
      uuid(9994),
      CAPABILITIES[3],
      "approved",
      "review:no-cap",
      "idem:review:no-cap",
    ),
  );
  q(38);

  const wrongScopeRequest = uuid(711);
  await psql(
    database,
    operationRequest(
      wrongScopeRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:wrong-checker-scope",
      "idem:wrong-checker-scope",
    ),
  );
  await reject(
    database,
    review(
      uuid(712),
      wrongScopeRequest,
      OTHER_CHECKER,
      OTHER_WRONG_SCOPE,
      CAPABILITIES[3],
      "approved",
      "review:wrong-scope",
      "idem:review:wrong-scope",
    ),
  );
  q(39);

  const oneReviewRequest = uuid(713);
  await psql(
    database,
    operationRequest(
      oneReviewRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:one-review",
      "idem:one-review",
    ) +
      review(
        uuid(714),
        oneReviewRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:one",
        "idem:review:one",
      ),
  );
  await reject(
    database,
    review(
      uuid(715),
      oneReviewRequest,
      OTHER_CHECKER,
      OTHER_ACCEPT_SCOPE,
      CAPABILITIES[3],
      "rejected",
      "review:two",
      "idem:review:two",
    ),
  );
  q(40);

  const rejectedRequest = uuid(716);
  await psql(
    database,
    operationRequest(
      rejectedRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:rejected",
      "idem:rejected",
    ) +
      review(
        uuid(717),
        rejectedRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "rejected",
        "review:rejected",
        "idem:review:rejected",
      ),
  );
  await reject(
    database,
    executeRequest(rejectedRequest, "execution:rejected", "result:rejected"),
  );
  q(41);

  const executedRequest = uuid(718);
  await psql(
    database,
    operationRequest(
      executedRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:execute-once",
      "idem:execute-once",
    ) +
      review(
        uuid(719),
        executedRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:execute-once",
        "idem:review:execute-once",
      ) +
      executeRequest(
        executedRequest,
        "execution:once",
        "result:once",
      ),
  );
  await reject(
    database,
    executeRequest(executedRequest, "execution:twice", "result:twice"),
  );
  assert(
    await psql(
      database,
      `select count(*) from public.app_workforce_operation_requests
       where id='${executedRequest}' and execution_status='executed';`,
    ) === "1",
    "execute_once",
  );
  q(42);

  const makerBlocked = uuid(720);
  await psql(
    database,
    operationRequest(
      makerBlocked,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:maker-blocked",
      "idem:maker-blocked",
    ) +
      review(
        uuid(721),
        makerBlocked,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:maker-blocked",
        "idem:review:maker-blocked",
      ),
  );
  for (const [index, state] of ["suspended", "revoked"].entries()) {
    await reject(
      database,
      `insert into public.app_workforce_identity_states (
         id, workforce_identity_id, state, effective_at, recorded_at,
         decision_ref, reason_ref, recorded_by_actor_ref, request_id,
         supersedes_state_id
       ) values (
         '${uuid(722 + index)}','${MAKER}','${state}','${T25}','${T25}',
         'decision:maker-${state}','reason:maker-${state}','actor:proof',
         'state:maker:${state}','${uuid(200)}'
       );
       ${
        executeRequest(
          makerBlocked,
          `execution:maker:${state}`,
          `result:maker:${state}`,
        )
      }`,
    );
  }
  q(43);

  const checkerBlocked = uuid(724);
  await psql(
    database,
    operationRequest(
      checkerBlocked,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:checker-blocked",
      "idem:checker-blocked",
    ) +
      review(
        uuid(725),
        checkerBlocked,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:checker-blocked",
        "idem:review:checker-blocked",
      ),
  );
  for (const [index, state] of ["suspended", "revoked"].entries()) {
    await reject(
      database,
      `insert into public.app_workforce_identity_states (
         id, workforce_identity_id, state, effective_at, recorded_at,
         decision_ref, reason_ref, recorded_by_actor_ref, request_id,
         supersedes_state_id
       ) values (
         '${uuid(726 + index)}','${CHECKER}','${state}','${T25}','${T25}',
         'decision:checker-${state}','reason:checker-${state}','actor:proof',
         'state:checker:${state}','${uuid(201)}'
       );
       ${
        executeRequest(
          checkerBlocked,
          `execution:checker:${state}`,
          `result:checker:${state}`,
        )
      }`,
    );
  }
  q(44);

  const endRequest = uuid(728);
  await psql(
    database,
    operationRequest(
      endRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:end-authority",
      "idem:end-authority",
    ) +
      review(
        uuid(729),
        endRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:end-authority",
        "idem:review:end-authority",
      ),
  );
  await reject(
    database,
    `insert into public.app_workforce_capability_assignments (
       id, assignment_id, workforce_identity_id, capability_code,
       event_type, effective_at, recorded_at, decision_ref, reason_ref,
       recorded_by_actor_ref, request_id, supersedes_assignment_event_id
     ) values (
       '${uuid(730)}','${MAKER_ACCEPT_CHAIN}','${MAKER}','${CAPABILITIES[2]}',
       'revoked','${T25}','${T25}','decision:end-cap','reason:end-cap',
       'actor:proof','cap:end','${MAKER_ACCEPT_CAP}'
     );
     ${executeRequest(endRequest, "execution:end-cap", "result:end-cap")}`,
  );
  await reject(
    database,
    `insert into public.app_workforce_scope_assignments (
       id, scope_assignment_id, workforce_identity_id,
       capability_assignment_id, capability_code, case_id, location_id,
       case_location_relation_id, event_type, effective_at, recorded_at,
       decision_ref, reason_ref, recorded_by_actor_ref, request_id,
       supersedes_scope_event_id
     ) values (
       '${uuid(731)}','${MAKER_ACCEPT_SCOPE_CHAIN}','${MAKER}',
       '${MAKER_ACCEPT_CAP}','${CAPABILITIES[2]}','${CASE_1}','${LOCATION_1}',
       '${RELATION_1}','revoked','${T25}','${T25}','decision:end-scope',
       'reason:end-scope','actor:proof','scope:end','${MAKER_ACCEPT_SCOPE}'
     );
     ${executeRequest(endRequest, "execution:end-scope", "result:end-scope")}`,
  );
  await reject(
    database,
    `insert into public.app_case_location_relations (
       id, relation_id, case_id, location_id, event_type, effective_at,
       recorded_at, decision_ref, reason_ref, recorded_by_actor_ref,
       request_id, supersedes_relation_event_id
     ) values (
       '${uuid(732)}','${RELATION_1_CHAIN}','${CASE_1}','${LOCATION_1}',
       'unlinked','${T25}','${T25}','decision:end-relation',
       'reason:end-relation','actor:proof','relation:end','${RELATION_1}'
     );
     ${
      executeRequest(
        endRequest,
        "execution:end-relation",
        "result:end-relation",
      )
    }`,
  );
  q(45);

  const reviewRaceRequest = uuid(733);
  await psql(
    database,
    operationRequest(
      reviewRaceRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:review-race",
      "idem:review-race",
    ),
  );
  const reviewRace = await Promise.all([
    psqlResult(
      database,
      review(
        uuid(734),
        reviewRaceRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:race:a",
        "idem:review:race:a",
      ),
    ),
    psqlResult(
      database,
      review(
        uuid(735),
        reviewRaceRequest,
        OTHER_CHECKER,
        OTHER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "rejected",
        "review:race:b",
        "idem:review:race:b",
      ),
    ),
  ]);
  assert(
    reviewRace.filter((result) => result.code === 0).length === 1 &&
      await psql(
          database,
          `select count(*) from public.app_workforce_operation_reviews
         where operation_request_id='${reviewRaceRequest}';`,
        ) === "1",
    "review_race",
  );
  q(46);

  const executionRaceRequest = uuid(736);
  await psql(
    database,
    operationRequest(
      executionRaceRequest,
      "initial_location_acceptance",
      MAKER,
      MAKER_ACCEPT_SCOPE,
      "operation:execution-race",
      "idem:execution-race",
    ) +
      review(
        uuid(737),
        executionRaceRequest,
        CHECKER,
        CHECKER_ACCEPT_SCOPE,
        CAPABILITIES[3],
        "approved",
        "review:execution-race",
        "idem:review:execution-race",
      ),
  );
  const executionRace = await Promise.all([
    psqlResult(
      database,
      executeRequest(
        executionRaceRequest,
        "execution:race:a",
        "result:race:a",
      ),
    ),
    psqlResult(
      database,
      executeRequest(
        executionRaceRequest,
        "execution:race:b",
        "result:race:b",
      ),
    ),
  ]);
  assert(
    executionRace.filter((result) => result.code === 0).length === 1 &&
      await psql(
          database,
          `select count(*) from public.app_workforce_operation_requests
         where id='${executionRaceRequest}' and execution_status='executed';`,
        ) === "1",
    "execution_race",
  );
  q(47);
}

async function main(): Promise<void> {
  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const migrationHash = await sha256Text(migration);
  const protectedBefore = await protectedFingerprint();
  assert(
    await readOnlyMain(`select current_database() || '|' ||
      current_setting('transaction_read_only');`) === "postgres|on",
    "main_read_only_gate",
  );
  assert(
    await readOnlyMain(
      `select ${
        TARGET_TABLES.map((table) => `(select count(*) from public.${table})`)
          .join(" || '|' || ")
      };`,
    ) === "0|0|0|0|0|0|0",
    "main_target_rows_before",
  );

  const database = DATABASE_PREFIX +
    crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  let created = false;
  try {
    await createFreshProofDatabase(database, migration);
    created = true;
    await catalogProof(database, migration);
    await behaviorProof(database);
    assert(
      await sha256Text(await Deno.readTextFile(MIGRATION_PATH)) ===
        migrationHash,
      "migration_changed_during_proof",
    );
  } finally {
    if (created) await dropProofDatabase(database);
  }

  assert(
    await protectedFingerprint() === protectedBefore,
    "main_protected_fingerprint_changed",
  );
  assert(
    await readOnlyMain(
      `select ${
        TARGET_TABLES.map((table) => `(select count(*) from public.${table})`)
          .join(" || '|' || ")
      };`,
    ) === "0|0|0|0|0|0|0",
    "main_target_rows_after",
  );
  assert(
    await readOnlyMain(
      `select count(*) from pg_catalog.pg_database
       where datname like '${DATABASE_PREFIX}%';`,
    ) === "0",
    "disposable_database_remains",
  );
  q(48);
  console.log("app-workforce-location-authorization-foundation-proof-ok");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`proof-failed:${scrub(message)}`);
  Deno.exit(1);
}
