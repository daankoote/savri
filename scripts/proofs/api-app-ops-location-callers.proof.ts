import {
  createHandler as createRootHandler,
} from "../../supabase/functions/api-app-ops-location-root-create/index.ts";
import {
  createHandler as createObservationHandler,
} from "../../supabase/functions/api-app-ops-location-observation-record/index.ts";
import {
  createHandler as createAcceptHandler,
} from "../../supabase/functions/api-app-ops-location-version-accept/index.ts";
import {
  createHandler as createCorrectHandler,
} from "../../supabase/functions/api-app-ops-location-version-correct/index.ts";

const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const DATABASE_PREFIX = "enval_wp3n_proof_";
const MIGRATION =
  "supabase/migrations/20260728220000_app_workforce_location_operation_bridge_rpcs.sql";
const PRODUCT_FILES = [
  MIGRATION,
  "supabase/functions/_shared/app_workforce_authorization.ts",
  "supabase/functions/api-app-ops-location-root-create/index.ts",
  "supabase/functions/api-app-ops-location-observation-record/index.ts",
  "supabase/functions/api-app-ops-location-version-accept/index.ts",
  "supabase/functions/api-app-ops-location-version-correct/index.ts",
  "scripts/proofs/api-app-ops-location-callers.proof.ts",
] as const;

const PUBLIC_RPCS = [
  "app_ops_location_root_create_v1",
  "app_ops_location_observation_record_v1",
  "app_ops_location_accept_prepare_v1",
  "app_ops_location_accept_review_v1",
  "app_ops_location_accept_execute_v1",
  "app_ops_location_correct_prepare_v1",
  "app_ops_location_correct_review_v1",
  "app_ops_location_correct_execute_v1",
] as const;
const PRIVATE_RESOLVER = "app_ops_location_authorization_resolve_v1";
const WP3L_TABLES = [
  "app_workforce_identities",
  "app_workforce_identity_states",
  "app_workforce_capability_assignments",
  "app_case_location_relations",
  "app_workforce_scope_assignments",
  "app_workforce_operation_requests",
  "app_workforce_operation_reviews",
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
  ...WP3L_TABLES.map((name) => `public.${name}`),
] as const;
const BASE_FUNCTIONS = [
  "app_accept_initial_location_version_v1",
  "app_correct_location_version_v1",
  "app_create_location_root_v1",
  "app_location_write_complete_v1",
  "app_location_write_idempotency_begin_v1",
  "app_location_write_lock_v1",
  "app_record_location_observation_v1",
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

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const EXPIRES = "2030-01-01T00:00:00Z";
const T0 = "2025-01-01T00:00:00Z";
const T1 = "2025-02-01T00:00:00Z";

class ProofFailure extends Error {}
type CommandResult = { code: number; stdout: string; stderr: string };

function assert(value: boolean, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(number: number): void {
  console.log(`WP3N-Q${String(number).padStart(2, "0")}: PASS`);
}
function uuid(number: number): string {
  return `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
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
async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
async function protectedFingerprint(): Promise<string> {
  const counts = PROTECTED_TABLES.map((table) =>
    `(select count(*) from ${table})`
  ).join(" || '|' || ");
  const names = BASE_FUNCTIONS.map(sqlLiteral).join(",");
  return await readOnlyMain(`
    select (${counts})::text || '|' || coalesce((
      select pg_catalog.string_agg(
        p.proname || ':' || md5(pg_catalog.pg_get_functiondef(p.oid)),
        ',' order by p.proname
      )
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (${names})
    ), '');
  `);
}
async function dropDatabase(database: string): Promise<void> {
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
async function createFreshDatabase(
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
  const raw = await mustCommand("docker", [
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

  const signature = "(uuid,text,text,text,timestamptz,jsonb)";
  await psql(
    database,
    [
      ...PUBLIC_RPCS.map((name) =>
        `drop function if exists public.${name}${signature};`
      ),
      `drop function if exists public.${PRIVATE_RESOLVER}
        (uuid,text,uuid,uuid,timestamptz);`,
    ].join("\n"),
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
}

const CUSTOMER_1 = uuid(1);
const CUSTOMER_2 = uuid(2);
const CASE_1 = uuid(10);
const CASE_2 = uuid(11);
const LOCATION_ACCEPT = uuid(20);
const LOCATION_CORRECT = uuid(21);
const LOCATION_RACE = uuid(22);
const LOCATION_STALE = uuid(23);
const OBS_ACCEPT = uuid(30);
const OBS_ACCEPT_REJECT = uuid(31);
const OBS_CORRECT_BASE = uuid(32);
const OBS_CORRECT_NEW = uuid(33);
const OBS_CORRECT_REJECT = uuid(34);
const OBS_RACE = uuid(35);
const VERSION_BASE = uuid(40);
const AUTH_CUSTOMER_ONLY = uuid(80);
const AUTH_MAKER = uuid(81);
const AUTH_CHECKER = uuid(82);
const AUTH_OTHER = uuid(83);
const AUTH_SUSPENDED = uuid(84);
const AUTH_REVOKED = uuid(85);
const AUTH_NO_CAP = uuid(86);
const AUTH_EXPIRED = uuid(87);
const AUTH_NO_SCOPE = uuid(88);
const AUTH_STALE_RELATION = uuid(89);
const MAKER = uuid(100);
const CHECKER = uuid(101);
const OTHER = uuid(102);
const SUSPENDED = uuid(103);
const REVOKED = uuid(104);
const NO_CAP = uuid(105);
const EXPIRED = uuid(106);
const NO_SCOPE = uuid(107);
const STALE_RELATION_IDENTITY = uuid(108);

type Grant = {
  identity: string;
  auth: string;
  capability: string;
  caseId: string;
  locationId: string | null;
  relationId: string | null;
  suffix: number;
  expired?: boolean;
  capabilityOnly?: boolean;
};

function capabilitySql(grant: Grant): string {
  const id = uuid(300 + grant.suffix);
  const chain = uuid(400 + grant.suffix);
  const capabilityStatement = `
    insert into public.app_workforce_capability_assignments (
      id, assignment_id, workforce_identity_id, capability_code, event_type,
      effective_at, valid_until, recorded_at, decision_ref,
      recorded_by_actor_ref, request_id
    ) values (
      '${id}', '${chain}', '${grant.identity}', '${grant.capability}',
      'granted', '${T0}', ${grant.expired ? `'${T1}'` : "null"}, '${T0}',
      'decision:cap:${grant.suffix}', 'actor:proof', 'cap:${grant.suffix}'
    );`;
  if (grant.capabilityOnly) return capabilityStatement;
  return `${capabilityStatement}
    insert into public.app_workforce_scope_assignments (
      id, scope_assignment_id, workforce_identity_id,
      capability_assignment_id, capability_code, case_id, location_id,
      case_location_relation_id, event_type, effective_at, valid_until,
      recorded_at, decision_ref, recorded_by_actor_ref, request_id
    ) values (
      '${uuid(500 + grant.suffix)}', '${uuid(600 + grant.suffix)}',
      '${grant.identity}', '${id}', '${grant.capability}', '${grant.caseId}',
      ${grant.locationId ? `'${grant.locationId}'` : "null"},
      ${grant.relationId ? `'${grant.relationId}'` : "null"},
      'granted', '${T0}', ${grant.expired ? `'${T1}'` : "null"}, '${T0}',
      'decision:scope:${grant.suffix}', 'actor:proof',
      'scope:${grant.suffix}'
    );`;
}

const REL_ACCEPT = uuid(200);
const REL_CORRECT = uuid(201);
const REL_RACE = uuid(202);
const REL_STALE = uuid(203);
const grants: Grant[] = [
  {
    identity: MAKER,
    auth: AUTH_MAKER,
    capability: "location.root.create",
    caseId: CASE_1,
    locationId: null,
    relationId: null,
    suffix: 1,
  },
  ...[
    ["location.observation.record", LOCATION_ACCEPT, REL_ACCEPT, 2],
    ["location.version.accept.prepare", LOCATION_ACCEPT, REL_ACCEPT, 3],
    ["location.version.correct.prepare", LOCATION_CORRECT, REL_CORRECT, 4],
  ].map(([capability, locationId, relationId, suffix]) => ({
    identity: MAKER,
    auth: AUTH_MAKER,
    capability: String(capability),
    caseId: CASE_1,
    locationId: String(locationId),
    relationId: String(relationId),
    suffix: Number(suffix),
  })),
  ...[
    ["location.version.accept.approve", LOCATION_ACCEPT, REL_ACCEPT, 6],
    ["location.version.correct.approve", LOCATION_CORRECT, REL_CORRECT, 7],
  ].map(([capability, locationId, relationId, suffix]) => ({
    identity: CHECKER,
    auth: AUTH_CHECKER,
    capability: String(capability),
    caseId: CASE_1,
    locationId: String(locationId),
    relationId: String(relationId),
    suffix: Number(suffix),
  })),
  {
    identity: OTHER,
    auth: AUTH_OTHER,
    capability: "location.version.accept.approve",
    caseId: CASE_1,
    locationId: LOCATION_RACE,
    relationId: REL_RACE,
    suffix: 9,
  },
  {
    identity: EXPIRED,
    auth: AUTH_EXPIRED,
    capability: "location.observation.record",
    caseId: CASE_1,
    locationId: LOCATION_ACCEPT,
    relationId: REL_ACCEPT,
    suffix: 10,
    expired: true,
  },
  {
    identity: NO_SCOPE,
    auth: AUTH_NO_SCOPE,
    capability: "location.observation.record",
    caseId: CASE_2,
    locationId: LOCATION_STALE,
    relationId: REL_ACCEPT,
    suffix: 11,
    capabilityOnly: true,
  },
  {
    identity: STALE_RELATION_IDENTITY,
    auth: AUTH_STALE_RELATION,
    capability: "location.observation.record",
    caseId: CASE_1,
    locationId: LOCATION_STALE,
    relationId: REL_STALE,
    suffix: 12,
  },
  {
    identity: MAKER,
    auth: AUTH_MAKER,
    capability: "location.version.accept.approve",
    caseId: CASE_1,
    locationId: LOCATION_ACCEPT,
    relationId: REL_ACCEPT,
    suffix: 13,
  },
];

async function fixtures(database: string): Promise<void> {
  const identities = [
    [MAKER, AUTH_MAKER],
    [CHECKER, AUTH_CHECKER],
    [OTHER, AUTH_OTHER],
    [SUSPENDED, AUTH_SUSPENDED],
    [REVOKED, AUTH_REVOKED],
    [NO_CAP, AUTH_NO_CAP],
    [EXPIRED, AUTH_EXPIRED],
    [NO_SCOPE, AUTH_NO_SCOPE],
    [STALE_RELATION_IDENTITY, AUTH_STALE_RELATION],
  ];
  const authRows = [
    AUTH_CUSTOMER_ONLY,
    ...identities.map(([, auth]) => auth),
  ].map((id) => `('${id}')`).join(",");
  const identityRows = identities.map(([id, auth], index) =>
    `('${id}','${auth}','actor:proof','decision:identity',
      'identity:${index}')`
  ).join(",");
  const stateRows = identities.map(([id], index) =>
    `('${uuid(700 + index)}','${id}','active','${T0}','${T0}',
      'decision:active','actor:proof','state:${index}')`
  ).join(",");

  await psql(
    database,
    `begin;
      insert into auth.users (id) values ${authRows};
      insert into public.app_customers (id, customer_type) values
        ('${CUSTOMER_1}','particulier'),('${CUSTOMER_2}','zakelijk');
      insert into public.app_cases (
        id, customer_id, case_reference, created_at, created_by_actor_type,
        created_by_actor_ref, source_class, source_ref, request_id
      ) values
        ('${CASE_1}','${CUSTOMER_1}','WP3NCASE1','${T0}','system',
         'actor:proof','proof','case:1','case:1'),
        ('${CASE_2}','${CUSTOMER_2}','WP3NCASE2','${T0}','system',
         'actor:proof','proof','case:2','case:2');
      insert into public.app_locations (
        id, created_at, created_by_actor_ref, created_from_request_id,
        creation_basis
      ) values
        ('${LOCATION_ACCEPT}','${T0}','actor:proof','loc:accept',
         'manual_migration_review'),
        ('${LOCATION_CORRECT}','${T0}','actor:proof','loc:correct',
         'manual_migration_review'),
        ('${LOCATION_RACE}','${T0}','actor:proof','loc:race',
         'manual_migration_review'),
        ('${LOCATION_STALE}','${T0}','actor:proof','loc:stale',
         'manual_migration_review');
      insert into public.app_location_address_observations (
        id, location_id, observation_kind, descriptor_kind, observed_at,
        recorded_at, recorded_by_actor_ref, recorded_from_request_id,
        country_code, site_reference
      ) values
        ('${OBS_ACCEPT}','${LOCATION_ACCEPT}','manual_observed',
         'site_reference','${T0}','${T0}','actor:proof','obs:a','NL','a'),
        ('${OBS_ACCEPT_REJECT}','${LOCATION_ACCEPT}','manual_observed',
         'site_reference','${T1}','${T1}','actor:proof','obs:ar','NL','ar'),
        ('${OBS_CORRECT_BASE}','${LOCATION_CORRECT}','manual_observed',
         'site_reference','${T0}','${T0}','actor:proof','obs:cb','NL','cb'),
        ('${OBS_CORRECT_NEW}','${LOCATION_CORRECT}','manual_observed',
         'site_reference','${T1}','${T1}','actor:proof','obs:cn','NL','cn'),
        ('${OBS_CORRECT_REJECT}','${LOCATION_CORRECT}','manual_observed',
         'site_reference','${T1}','${T1}','actor:proof','obs:cr','NL','cr'),
        ('${OBS_RACE}','${LOCATION_RACE}','manual_observed',
         'site_reference','${T0}','${T0}','actor:proof','obs:r','NL','r');
      insert into public.app_location_versions (
        id, location_id, accepted_from_observation_id, valid_from,
        recorded_at, accepted_at, accepted_by_actor_ref,
        accepted_from_request_id, acceptance_decision_ref, descriptor_kind,
        country_code, site_reference
      ) values (
        '${VERSION_BASE}','${LOCATION_CORRECT}','${OBS_CORRECT_BASE}',
        '${T0}','${T0}','${T0}','actor:proof','version:base',
        'decision:base','site_reference','NL','cb'
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
        ('${REL_ACCEPT}','${uuid(210)}','${CASE_1}','${LOCATION_ACCEPT}',
         'linked','${T0}','${T0}','decision:ra','actor:proof','rel:a'),
        ('${REL_CORRECT}','${uuid(211)}','${CASE_1}','${LOCATION_CORRECT}',
         'linked','${T0}','${T0}','decision:rc','actor:proof','rel:c'),
        ('${REL_RACE}','${uuid(212)}','${CASE_1}','${LOCATION_RACE}',
         'linked','${T0}','${T0}','decision:rr','actor:proof','rel:r'),
        ('${REL_STALE}','${uuid(213)}','${CASE_1}','${LOCATION_STALE}',
         'linked','${T0}','${T0}','decision:rs','actor:proof','rel:s');
      ${grants.map(capabilitySql).join("\n")}
      insert into public.app_workforce_scope_assignments (
        id, scope_assignment_id, workforce_identity_id,
        capability_assignment_id, capability_code, case_id, location_id,
        case_location_relation_id, event_type, effective_at, recorded_at,
        decision_ref, recorded_by_actor_ref, request_id
      ) values
        ('${uuid(550)}','${uuid(650)}','${MAKER}','${uuid(303)}',
         'location.version.accept.prepare','${CASE_1}','${LOCATION_RACE}',
         '${REL_RACE}','granted','${T0}','${T0}','decision:scope:race-maker',
         'actor:proof','scope:race-maker'),
        ('${uuid(551)}','${uuid(651)}','${CHECKER}','${uuid(306)}',
         'location.version.accept.approve','${CASE_1}','${LOCATION_RACE}',
         '${REL_RACE}','granted','${T0}','${T0}',
         'decision:scope:race-checker','actor:proof','scope:race-checker');
      insert into public.app_workforce_identity_states (
        id, workforce_identity_id, state, effective_at, recorded_at,
        decision_ref, reason_ref, recorded_by_actor_ref, request_id,
        supersedes_state_id
      ) values
        ('${uuid(720)}','${SUSPENDED}','suspended','${T1}','${T1}',
         'decision:suspended','reason:suspended','actor:proof',
         'state:suspended','${uuid(703)}'),
        ('${uuid(721)}','${REVOKED}','revoked','${T1}','${T1}',
         'decision:revoked','reason:revoked','actor:proof',
         'state:revoked','${uuid(704)}');
      insert into public.app_case_location_relations (
        id, relation_id, case_id, location_id, event_type, effective_at,
        recorded_at, decision_ref, reason_ref, recorded_by_actor_ref,
        request_id, supersedes_relation_event_id
      ) values (
        '${uuid(722)}','${uuid(213)}','${CASE_1}','${LOCATION_STALE}',
        'unlinked','${T1}','${T1}','decision:unlink','reason:unlink',
        'actor:proof','rel:unlink','${REL_STALE}'
      );
    commit;`,
  );
}

function bridgeCall(
  name: string,
  auth: string,
  request: string,
  key: string,
  payload: Record<string, unknown>,
  hash = HASH_A,
): string {
  return `select public.${name}(
    '${auth}'::uuid, ${sqlLiteral(request)}, ${sqlLiteral(key)},
    '${hash}', '${EXPIRES}'::timestamptz,
    ${sqlLiteral(JSON.stringify(payload))}::jsonb
  );`;
}
async function call(
  database: string,
  name: string,
  auth: string,
  request: string,
  key: string,
  payload: Record<string, unknown>,
  hash = HASH_A,
): Promise<Record<string, unknown>> {
  const raw = await psql(
    database,
    bridgeCall(name, auth, request, key, payload, hash),
  );
  const parsed = JSON.parse(raw);
  assert(!!parsed && typeof parsed === "object", "bridge_response_shape");
  return parsed;
}
function code(response: Record<string, unknown>): string {
  return String(response.code || "");
}
function operationBusiness(
  kind: "accept" | "correct",
  locationId: string,
  observationId: string,
  predecessor?: string,
): Record<string, unknown> {
  return {
    case_id: CASE_1,
    location_id: locationId,
    observation_id: observationId,
    ...(predecessor ? { predecessor_version_id: predecessor } : {}),
    valid_from: T0,
    valid_to: null,
    accepted_at: T1,
    acceptance_decision_ref: `decision:${kind}:${observationId.slice(-4)}`,
    ...(kind === "correct" ? { correction_reason: "bounded correction" } : {}),
  };
}
async function operationHash(value: Record<string, unknown>): Promise<string> {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  return await sha256(canonical);
}

async function handlerProof(): Promise<void> {
  const fakeClient = (authError: boolean, calls: string[]) => ({
    auth: {
      getUser: async () =>
        authError ? { error: new Error("invalid") } : {
          data: {
            user: {
              id: AUTH_MAKER,
              email: "proof@invalid.example",
              email_confirmed_at: T0,
            },
          },
        },
    },
    from: () => ({}),
    rpc: async (name: string) => {
      calls.push(name);
      return { data: { ok: true, status: 200, code: "ok" } };
    },
  });
  const dependencies = (client: ReturnType<typeof fakeClient>) => ({
    createServiceClient: () => client,
    idempotencyExpiresAt: () => EXPIRES,
  });
  const validRoot = JSON.stringify({
    action: "execute",
    case_id: CASE_1,
    creation_basis: "source_observation",
  });

  const noBearer = await createRootHandler(
    dependencies(fakeClient(false, [])),
  )(
    new Request("http://local/root", {
      method: "POST",
      headers: { "Idempotency-Key": "handler:no-bearer" },
      body: validRoot,
    }),
  );
  assert(
    noBearer.status === 401 &&
      (await noBearer.json()).code === "authentication_required",
    "handler_no_bearer",
  );
  q(13);

  const invalid = await createRootHandler(
    dependencies(fakeClient(true, [])),
  )(
    new Request("http://local/root", {
      method: "POST",
      headers: {
        "Authorization": "Bearer invalid",
        "Idempotency-Key": "handler:invalid",
      },
      body: validRoot,
    }),
  );
  assert(
    invalid.status === 401 &&
      (await invalid.json()).code === "authentication_required",
    "handler_invalid_bearer",
  );
  q(14);

  const calls: string[] = [];
  const client = fakeClient(false, calls);
  const authHeaders = {
    "Authorization": "Bearer valid",
    "Idempotency-Key": "handler:mapping",
  };
  await createRootHandler(dependencies(client))(
    new Request("http://local/root", {
      method: "POST",
      headers: authHeaders,
      body: validRoot,
    }),
  );
  await createObservationHandler(dependencies(client))(
    new Request("http://local/observation", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        action: "execute",
        case_id: CASE_1,
        location_id: LOCATION_ACCEPT,
        observation_kind: "manual_observed",
        descriptor_kind: "site_reference",
        observed_at: T0,
        source_ref_sha256: null,
        source_payload_sha256: null,
        source_retrieved_at: null,
        fresh_until: null,
        country_code: "NL",
        postal_code: null,
        house_number: null,
        house_number_addition: null,
        street: null,
        city: null,
        site_reference: "bounded",
      }),
    }),
  );
  const business = operationBusiness(
    "accept",
    LOCATION_ACCEPT,
    OBS_ACCEPT,
  );
  await createAcceptHandler(dependencies(client))(
    new Request("http://local/accept", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ action: "prepare", ...business }),
    }),
  );
  const correction = operationBusiness(
    "correct",
    LOCATION_CORRECT,
    OBS_CORRECT_NEW,
    VERSION_BASE,
  );
  await createCorrectHandler(dependencies(client))(
    new Request("http://local/correct", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ action: "prepare", ...correction }),
    }),
  );
  assert(
    calls.join(",") === [
      "app_ops_location_root_create_v1",
      "app_ops_location_observation_record_v1",
      "app_ops_location_accept_prepare_v1",
      "app_ops_location_correct_prepare_v1",
    ].join(","),
    "handler_fixed_mapping",
  );
}

async function catalogAndSourceProof(
  database: string,
  migration: string,
): Promise<void> {
  for (const path of PRODUCT_FILES) {
    await Deno.stat(path);
  }
  for (const path of PRODUCT_FILES) {
    const tracked = await processOutput(
      "git",
      ["ls-files", "--error-unmatch", path],
    );
    assert(tracked.code !== 0, `target_already_tracked:${path}`);
  }
  assert(PRODUCT_FILES.length === 7, "seven_new_files");
  q(1);

  const names = PUBLIC_RPCS.map(sqlLiteral).join(",");
  assert(
    await psql(
      database,
      `select count(*) from pg_proc p join pg_namespace n
       on n.oid=p.pronamespace where n.nspname='public'
       and p.proname in (${names});`,
    ) === "8",
    "public_rpc_count",
  );
  q(2);
  assert(
    await psql(
      database,
      `select count(*) from pg_proc p join pg_namespace n
       on n.oid=p.pronamespace where n.nspname='public'
       and p.proname='${PRIVATE_RESOLVER}'
       and not has_function_privilege(
         'service_role', p.oid, 'EXECUTE'
       );`,
    ) === "1",
    "private_resolver_privilege",
  );
  q(3);

  const product = await Promise.all(
    PRODUCT_FILES.slice(0, 6).map((path) => Deno.readTextFile(path)),
  );
  const combined = product.join("\n");
  assert(
    !/create\s+table|create\s+role|create\s+policy|generic.{0,20}(role|permission|resource)/i
      .test(migration),
    "unexpected_schema_surface",
  );
  q(4);
  assert(
    await psql(
      database,
      `select count(*) from pg_proc p join pg_namespace n
       on n.oid=p.pronamespace where n.nspname='public'
       and p.proname in (${names}) and p.prosecdef
       and pg_catalog.array_to_string(p.proconfig, ',')
         in ('search_path=', 'search_path=""');`,
    ) === "8",
    "rpc_security",
  );
  q(5);
  assert(
    await psql(
      database,
      `select count(*) from pg_proc p join pg_namespace n
       on n.oid=p.pronamespace where n.nspname='public'
       and p.proname in (${names})
       and has_function_privilege('service_role',p.oid,'EXECUTE')
       and not has_function_privilege('anon',p.oid,'EXECUTE')
       and not has_function_privilege('authenticated',p.oid,'EXECUTE');`,
    ) === "8",
    "rpc_grants",
  );
  q(6);
  assert(
    await psql(
      database,
      `select count(*) from pg_proc p join pg_namespace n
       on n.oid=p.pronamespace where n.nspname='public'
       and p.proname='${PRIVATE_RESOLVER}'
       and not has_function_privilege('service_role',p.oid,'EXECUTE')
       and not has_function_privilege('anon',p.oid,'EXECUTE')
       and not has_function_privilege('authenticated',p.oid,'EXECUTE');`,
    ) === "1",
    "private_grants",
  );
  q(7);
  assert(
    PRODUCT_FILES.filter((path) =>
          path.startsWith("supabase/functions/api-app-ops-location-")
        ).length === 4 &&
      await psql(
          database,
          `select count(*) from pg_proc p join pg_namespace n
           on n.oid=p.pronamespace where n.nspname='public'
           and p.proname like 'app_ops_location_%'
           and p.proname not in (${names},'${PRIVATE_RESOLVER}');`,
        ) === "0",
    "four_callers",
  );
  q(8);
  assert(
    /execute:\s*"app_ops_location_root_create_v1"/.test(combined) &&
      /prepare:\s*"app_ops_location_accept_prepare_v1"/.test(combined) &&
      /review:\s*"app_ops_location_correct_review_v1"/.test(combined),
    "action_allowlists",
  );
  q(9);
  assert(
    !/rpc\s*\(\s*(body|payload|input).{0,30}(rpc|function)/is.test(combined),
    "caller_selected_rpc",
  );
  q(10);
  const shared = await Deno.readTextFile(PRODUCT_FILES[1]);
  assert(
    !/\.from\(\s*["']app_workforce_|app_case_location_relations/.test(shared),
    "edge_authorization_join",
  );
  q(11);
  assert(
    !/insert\s+into\s+(auth\.users|public\.app_workforce_identities|public\.app_workforce_capability_assignments|public\.app_workforce_scope_assignments)/i
      .test(combined) &&
      !/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}/i
        .test(combined),
    "bootstrap_or_pii",
  );
  q(12);
}

async function behaviorProof(database: string): Promise<void> {
  const observationPayload = {
    case_id: CASE_1,
    location_id: LOCATION_ACCEPT,
    observation_kind: "manual_observed",
    descriptor_kind: "site_reference",
    observed_at: T1,
    source_ref_sha256: null,
    source_payload_sha256: null,
    source_retrieved_at: null,
    fresh_until: null,
    country_code: "NL",
    postal_code: null,
    house_number: null,
    house_number_addition: null,
    street: null,
    city: null,
    site_reference: "proof-observation",
  };
  const authOnly = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_CUSTOMER_ONLY,
    "q15",
    "q15",
    observationPayload,
  );
  assert(code(authOnly) === "workforce_identity_missing", "customer_only");
  q(15);
  const suspended = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_SUSPENDED,
    "q16",
    "q16",
    observationPayload,
  );
  assert(code(suspended) === "workforce_identity_inactive", "suspended");
  q(16);
  const revoked = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_REVOKED,
    "q17",
    "q17",
    observationPayload,
  );
  assert(code(revoked) === "workforce_identity_inactive", "revoked");
  q(17);
  const noCap = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_NO_CAP,
    "q18a",
    "q18a",
    observationPayload,
  );
  const expired = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_EXPIRED,
    "q18b",
    "q18b",
    observationPayload,
  );
  assert(
    code(noCap) === "capability_not_authorized" &&
      code(expired) === "capability_not_authorized",
    "capability_denial",
  );
  q(18);
  const noScope = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_NO_SCOPE,
    "q19",
    "q19",
    observationPayload,
  );
  const noScopeResolver = JSON.parse(
    await psql(
      database,
      `select public.${PRIVATE_RESOLVER}(
        '${AUTH_NO_SCOPE}','location.observation.record','${CASE_1}',
        '${LOCATION_ACCEPT}',pg_catalog.clock_timestamp()
      );`,
    ),
  ) as Record<string, unknown>;
  assert(
    code(noScope) === "location_scope_denied",
    `scope_denial:${code(noScope)}:${code(noScopeResolver)}`,
  );
  q(19);
  const wrongCase = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_MAKER,
    "q20",
    "q20",
    { ...observationPayload, case_id: CASE_2 },
  );
  assert(code(wrongCase) === "location_scope_denied", "wrong_case");
  q(20);
  const wrongLocation = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_MAKER,
    "q21",
    "q21",
    { ...observationPayload, location_id: LOCATION_CORRECT },
  );
  assert(code(wrongLocation) === "location_scope_denied", "wrong_location");
  q(21);
  const staleRelation = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_STALE_RELATION,
    "q22",
    "q22",
    { ...observationPayload, location_id: LOCATION_STALE },
  );
  assert(
    code(staleRelation) === "case_location_relation_missing",
    "relation_missing",
  );
  q(22);

  const rootBefore = Number(
    await psql(database, "select count(*) from public.app_locations;"),
  );
  const rootPayload = {
    case_id: CASE_1,
    creation_basis: "source_observation",
  };
  const root = await call(
    database,
    PUBLIC_RPCS[0],
    AUTH_MAKER,
    "q23-root",
    "q23-root",
    rootPayload,
  );
  assert(root.ok === true, "root_scope");
  q(23);
  assert(
    Number(
          await psql(database, "select count(*) from public.app_locations;"),
        ) ===
        rootBefore + 1 &&
      await psql(
          database,
          `select count(*) from public.app_case_location_relations
           where location_id='${root.location_id}' and case_id='${CASE_1}';`,
        ) === "1",
    "root_relation_atomic",
  );
  q(24);

  await psql(
    database,
    `create function public.wp3n_proof_relation_failure()
     returns trigger language plpgsql as $$
     begin raise exception 'proof relation failure'; end; $$;
     create trigger wp3n_proof_relation_failure
     before insert on public.app_case_location_relations
     for each row execute function public.wp3n_proof_relation_failure();`,
  );
  const failBefore = Number(
    await psql(database, "select count(*) from public.app_locations;"),
  );
  const rootFail = await call(
    database,
    PUBLIC_RPCS[0],
    AUTH_MAKER,
    "q25-root",
    "q25-root",
    rootPayload,
    HASH_B,
  );
  await psql(
    database,
    `drop trigger wp3n_proof_relation_failure
       on public.app_case_location_relations;
     drop function public.wp3n_proof_relation_failure();`,
  );
  assert(
    code(rootFail) === "internal_error" &&
      Number(
          await psql(database, "select count(*) from public.app_locations;"),
        ) === failBefore &&
      await psql(
          database,
          `select count(*) from public.app_audit_events
           where request_id='q25-root';`,
        ) === "0",
    "relation_failure_rollback",
  );
  q(25);
  const rootReplay = await call(
    database,
    PUBLIC_RPCS[0],
    AUTH_MAKER,
    "q23-root",
    "q23-root",
    rootPayload,
  );
  assert(
    JSON.stringify(rootReplay) === JSON.stringify(root) &&
      Number(
          await psql(database, "select count(*) from public.app_locations;"),
        ) === failBefore,
    "root_replay",
  );
  q(26);

  const observationBefore = Number(
    await psql(
      database,
      "select count(*) from public.app_location_address_observations;",
    ),
  );
  const observation = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_MAKER,
    "q27-observation",
    "q27-observation",
    observationPayload,
  );
  assert(observation.ok === true, "observation_capability");
  q(27);
  assert(
    observation.location_id === LOCATION_ACCEPT,
    "observation_scope_relation",
  );
  q(28);
  assert(
    Number(
      await psql(
        database,
        "select count(*) from public.app_location_versions;",
      ),
    ) === 1,
    "observation_not_accepted",
  );
  q(29);
  const observationReplay = await call(
    database,
    PUBLIC_RPCS[1],
    AUTH_MAKER,
    "q27-observation",
    "q27-observation",
    observationPayload,
  );
  assert(
    JSON.stringify(observationReplay) === JSON.stringify(observation) &&
      Number(
          await psql(
            database,
            "select count(*) from public.app_location_address_observations;",
          ),
        ) === observationBefore + 1,
    "observation_replay",
  );
  q(30);

  const acceptBusiness = operationBusiness(
    "accept",
    LOCATION_ACCEPT,
    OBS_ACCEPT,
  );
  const acceptHash = await operationHash(acceptBusiness);
  const preparePayload = {
    ...acceptBusiness,
    operation_payload_hash: acceptHash,
  };
  const versionsBeforePrepare = await psql(
    database,
    "select count(*) from public.app_location_versions;",
  );
  const prepare = await call(
    database,
    PUBLIC_RPCS[2],
    AUTH_MAKER,
    "accept:prepare",
    "accept:prepare",
    preparePayload,
  );
  assert(prepare.ok === true, "accept_prepare_capability");
  q(31);
  const acceptRequest = String(prepare.operation_request_id);
  assert(
    await psql(
      database,
      `select count(*) from public.app_workforce_operation_requests
       where id='${acceptRequest}' and payload_hash='${acceptHash}';`,
    ) === "1",
    "accept_prepare_request",
  );
  q(32);
  assert(
    await psql(
      database,
      "select count(*) from public.app_location_versions;",
    ) === versionsBeforePrepare,
    "prepare_called_wp3j",
  );
  q(33);

  const reviewBase = {
    operation_request_id: acceptRequest,
    outcome: "approved",
    reviewed_payload_hash: acceptHash,
    decision_ref: "decision:accept-review",
    reason_ref: null,
  };
  const selfReview = await call(
    database,
    PUBLIC_RPCS[3],
    AUTH_MAKER,
    "accept:self",
    "accept:self",
    reviewBase,
  );
  assert(code(selfReview) === "self_approval_forbidden", "self_review");
  const wrongHashReview = await call(
    database,
    PUBLIC_RPCS[3],
    AUTH_CHECKER,
    "accept:wrong-hash",
    "accept:wrong-hash",
    { ...reviewBase, reviewed_payload_hash: HASH_B },
  );
  assert(code(wrongHashReview) === "payload_hash_mismatch", "review_hash");
  const review = await call(
    database,
    PUBLIC_RPCS[3],
    AUTH_CHECKER,
    "accept:review",
    "accept:review",
    reviewBase,
  );
  assert(review.ok === true, "accept_review_capability");
  q(34);
  q(35);
  q(36);
  assert(
    await psql(
      database,
      `select count(*) from public.app_workforce_operation_reviews
       where operation_request_id='${acceptRequest}';`,
    ) === "1",
    "one_review",
  );
  q(37);
  assert(
    await psql(
      database,
      "select count(*) from public.app_location_versions;",
    ) === versionsBeforePrepare,
    "review_called_wp3j",
  );
  q(38);

  const executePayload = {
    operation_request_id: acceptRequest,
    ...acceptBusiness,
    operation_payload_hash: acceptHash,
  };
  const wrongExecutor = await call(
    database,
    PUBLIC_RPCS[4],
    AUTH_CHECKER,
    "accept:wrong-executor",
    "accept:wrong-executor",
    executePayload,
  );
  assert(code(wrongExecutor) === "four_eyes_required", "original_maker");
  q(39);
  const noReviewPrepare = await call(
    database,
    PUBLIC_RPCS[2],
    AUTH_MAKER,
    "accept:no-review:prepare",
    "accept:no-review:prepare",
    {
      ...operationBusiness(
        "accept",
        LOCATION_ACCEPT,
        OBS_ACCEPT_REJECT,
      ),
      operation_payload_hash: HASH_C,
    },
    HASH_B,
  );
  const noReviewExecute = await call(
    database,
    PUBLIC_RPCS[4],
    AUTH_MAKER,
    "accept:no-review:execute",
    "accept:no-review:execute",
    {
      operation_request_id: noReviewPrepare.operation_request_id,
      ...operationBusiness(
        "accept",
        LOCATION_ACCEPT,
        OBS_ACCEPT_REJECT,
      ),
      operation_payload_hash: HASH_C,
    },
    HASH_C,
  );
  assert(
    code(noReviewExecute) === "operation_review_missing",
    "execute_without_review",
  );
  q(40);

  const execute = await call(
    database,
    PUBLIC_RPCS[4],
    AUTH_MAKER,
    "accept:execute",
    "accept:execute",
    executePayload,
  );
  assert(execute.ok === true, "execution_revalidation");
  q(41);
  assert(
    await psql(
      database,
      `select wp3j_rpc_name from public.app_workforce_operation_requests
       where id='${acceptRequest}';`,
    ) === "app_accept_initial_location_version_v1",
    "exact_accept_rpc",
  );
  q(42);

  const rejectReview = await call(
    database,
    PUBLIC_RPCS[3],
    AUTH_CHECKER,
    "accept:reject:review",
    "accept:reject:review",
    {
      operation_request_id: noReviewPrepare.operation_request_id,
      outcome: "approved",
      reviewed_payload_hash: HASH_C,
      decision_ref: "decision:accept-reject-review",
      reason_ref: null,
    },
    HASH_B,
  );
  assert(rejectReview.ok === true, "reject_setup_review");
  const rejectExecute = await call(
    database,
    PUBLIC_RPCS[4],
    AUTH_MAKER,
    "accept:reject:execute",
    "accept:reject:execute",
    {
      operation_request_id: noReviewPrepare.operation_request_id,
      ...operationBusiness(
        "accept",
        LOCATION_ACCEPT,
        OBS_ACCEPT_REJECT,
      ),
      operation_payload_hash: HASH_C,
    },
    HASH_B,
  );
  assert(
    ["location_business_rejected", "concurrent_write_conflict"].includes(
      code(rejectExecute),
    ) &&
      await psql(
          database,
          `select execution_status
           from public.app_workforce_operation_requests
           where id='${noReviewPrepare.operation_request_id}';`,
        ) === "pending",
    "wp3j_reject_pending",
  );
  q(43);
  assert(
    await psql(
      database,
      `select count(*) from public.app_workforce_operation_requests
       where id='${acceptRequest}' and execution_status='executed'
       and wp3j_result_ref in (
         select id::text from public.app_location_versions
         where location_id='${LOCATION_ACCEPT}'
       );`,
    ) === "1",
    "accept_atomic_execution",
  );
  q(44);
  const executeReplay = await call(
    database,
    PUBLIC_RPCS[4],
    AUTH_MAKER,
    "accept:execute",
    "accept:execute",
    executePayload,
  );
  assert(
    JSON.stringify(executeReplay) === JSON.stringify(execute),
    "accept_execute_replay",
  );
  q(45);

  const correctBusiness = operationBusiness(
    "correct",
    LOCATION_CORRECT,
    OBS_CORRECT_NEW,
    VERSION_BASE,
  );
  const correctHash = await operationHash(correctBusiness);
  const invalidCorrection = await call(
    database,
    PUBLIC_RPCS[5],
    AUTH_MAKER,
    "correct:invalid",
    "correct:invalid",
    {
      ...correctBusiness,
      location_id: LOCATION_ACCEPT,
      operation_payload_hash: correctHash,
    },
  );
  assert(code(invalidCorrection) === "invalid_input", "correction_binding");
  q(46);
  const correctPrepare = await call(
    database,
    PUBLIC_RPCS[5],
    AUTH_MAKER,
    "correct:prepare",
    "correct:prepare",
    { ...correctBusiness, operation_payload_hash: correctHash },
  );
  const correctRequest = String(correctPrepare.operation_request_id);
  assert(
    correctPrepare.ok === true &&
      await psql(
          database,
          `select count(*) from public.app_workforce_operation_requests
           where id='${correctRequest}' and execution_status='pending';`,
        ) === "1",
    "correction_prepare",
  );
  q(47);
  const correctReview = await call(
    database,
    PUBLIC_RPCS[6],
    AUTH_CHECKER,
    "correct:review",
    "correct:review",
    {
      operation_request_id: correctRequest,
      outcome: "approved",
      reviewed_payload_hash: correctHash,
      decision_ref: "decision:correct-review",
      reason_ref: null,
    },
  );
  assert(correctReview.ok === true, "correction_review");
  q(48);
  assert(
    await psql(
      database,
      `select reviewed_payload_hash
       from public.app_workforce_operation_reviews
       where operation_request_id='${correctRequest}';`,
    ) === correctHash,
    "correction_review_hash",
  );
  q(49);
  const correctPayload = {
    operation_request_id: correctRequest,
    ...correctBusiness,
    operation_payload_hash: correctHash,
  };
  const correctExecute = await call(
    database,
    PUBLIC_RPCS[7],
    AUTH_MAKER,
    "correct:execute",
    "correct:execute",
    correctPayload,
  );
  assert(correctExecute.ok === true, "correction_revalidation");
  q(50);
  assert(
    await psql(
      database,
      `select wp3j_rpc_name from public.app_workforce_operation_requests
       where id='${correctRequest}';`,
    ) === "app_correct_location_version_v1",
    "exact_correction_rpc",
  );
  q(51);

  const rejectCorrectBusiness = operationBusiness(
    "correct",
    LOCATION_CORRECT,
    OBS_CORRECT_REJECT,
    VERSION_BASE,
  );
  const rejectCorrectHash = await operationHash(rejectCorrectBusiness);
  const rejectCorrectPrepare = await call(
    database,
    PUBLIC_RPCS[5],
    AUTH_MAKER,
    "correct:reject:prepare",
    "correct:reject:prepare",
    {
      ...rejectCorrectBusiness,
      operation_payload_hash: rejectCorrectHash,
    },
    HASH_B,
  );
  await call(
    database,
    PUBLIC_RPCS[6],
    AUTH_CHECKER,
    "correct:reject:review",
    "correct:reject:review",
    {
      operation_request_id: rejectCorrectPrepare.operation_request_id,
      outcome: "approved",
      reviewed_payload_hash: rejectCorrectHash,
      decision_ref: "decision:correct-reject-review",
      reason_ref: null,
    },
    HASH_B,
  );
  const rejectCorrectExecute = await call(
    database,
    PUBLIC_RPCS[7],
    AUTH_MAKER,
    "correct:reject:execute",
    "correct:reject:execute",
    {
      operation_request_id: rejectCorrectPrepare.operation_request_id,
      ...rejectCorrectBusiness,
      operation_payload_hash: rejectCorrectHash,
    },
    HASH_B,
  );
  assert(
    code(rejectCorrectExecute) === "location_business_rejected" &&
      await psql(
          database,
          `select execution_status
           from public.app_workforce_operation_requests
           where id='${rejectCorrectPrepare.operation_request_id}';`,
        ) === "pending",
    "correction_reject",
  );
  q(52);
  assert(
    await psql(
      database,
      `select count(*) from public.app_location_versions
       where supersedes_version_id='${VERSION_BASE}'
       and id::text='${correctExecute.version_id}';`,
    ) === "1",
    "immutable_successor",
  );
  q(53);
  const correctReplay = await call(
    database,
    PUBLIC_RPCS[7],
    AUTH_MAKER,
    "correct:execute",
    "correct:execute",
    correctPayload,
  );
  assert(
    JSON.stringify(correctReplay) === JSON.stringify(correctExecute),
    "correction_replay",
  );
  q(54);

  const conflict = await call(
    database,
    PUBLIC_RPCS[0],
    AUTH_MAKER,
    "q23-root-conflict",
    "q23-root",
    rootPayload,
    HASH_C,
  );
  assert(code(conflict) === "idempotency_conflict", "payload_conflict");
  q(55);
  assert(
    Number(
      await psql(
        database,
        `select count(*) from public.app_idempotency_keys
         where key='accept:execute' and payload_hash='${HASH_A}';`,
      ),
    ) >= 2,
    "caller_wp3j_idempotency_correlation",
  );
  q(56);
  assert(
    Number(
          await psql(
            database,
            `select count(*) from public.app_audit_events
         where request_id='accept:execute'
         and event_data->>'business_outcome'='ok';`,
          ),
        ) >= 1 &&
      await psql(
          database,
          `select count(*) from public.app_audit_events
           where event_data::text ~* '(email|jwt|full_name)';`,
        ) === "0",
    "audit_correlation_no_pii",
  );
  q(57);
  const safeBodies = [
    authOnly,
    suspended,
    wrongCase,
    staleRelation,
    conflict,
    rejectCorrectExecute,
  ].map((value) => JSON.stringify(value)).join(" ");
  assert(
    !/(constraint|select |insert |jwt|auth_user_id|public\.|app_workforce_)/i
      .test(
        safeBodies,
      ),
    "safe_error_leak",
  );
  q(58);

  const raceBusiness = operationBusiness(
    "accept",
    LOCATION_RACE,
    OBS_RACE,
  );
  const raceHash = await operationHash(raceBusiness);
  const racePrepare = await call(
    database,
    PUBLIC_RPCS[2],
    AUTH_MAKER,
    "race:prepare",
    "race:prepare",
    { ...raceBusiness, operation_payload_hash: raceHash },
    HASH_C,
  );
  const raceRequest = String(racePrepare.operation_request_id);
  const reviews = await Promise.all([
    psqlResult(
      database,
      bridgeCall(
        PUBLIC_RPCS[3],
        AUTH_CHECKER,
        "race:review:a",
        "race:review:a",
        {
          operation_request_id: raceRequest,
          outcome: "approved",
          reviewed_payload_hash: raceHash,
          decision_ref: "decision:race:a",
          reason_ref: null,
        },
        HASH_C,
      ),
    ),
    psqlResult(
      database,
      bridgeCall(
        PUBLIC_RPCS[3],
        AUTH_OTHER,
        "race:review:b",
        "race:review:b",
        {
          operation_request_id: raceRequest,
          outcome: "approved",
          reviewed_payload_hash: raceHash,
          decision_ref: "decision:race:b",
          reason_ref: null,
        },
        HASH_C,
      ),
    ),
  ]);
  assert(
    reviews.every((result) => result.code === 0) &&
      await psql(
          database,
          `select count(*) from public.app_workforce_operation_reviews
           where operation_request_id='${raceRequest}';`,
        ) === "1",
    "review_race",
  );
  q(59);

  const raceExecutePayload = {
    operation_request_id: raceRequest,
    ...raceBusiness,
    operation_payload_hash: raceHash,
  };
  const executions = await Promise.all([
    psqlResult(
      database,
      bridgeCall(
        PUBLIC_RPCS[4],
        AUTH_MAKER,
        "race:execute",
        "race:execute",
        raceExecutePayload,
        HASH_C,
      ),
    ),
    psqlResult(
      database,
      bridgeCall(
        PUBLIC_RPCS[4],
        AUTH_MAKER,
        "race:execute",
        "race:execute",
        raceExecutePayload,
        HASH_C,
      ),
    ),
  ]);
  assert(
    executions.every((result) => result.code === 0) &&
      await psql(
          database,
          `select count(*) from public.app_workforce_operation_requests
           where id='${raceRequest}' and execution_status='executed';`,
        ) === "1" &&
      await psql(
          database,
          `select count(*) from public.app_location_versions
           where location_id='${LOCATION_RACE}';`,
        ) === "1",
    "execution_race",
  );
  q(60);

  const revokeLocation = String(root.location_id);
  const revokeObservation = uuid(900);
  const revokeRelationEvent = await psql(
    database,
    `select id from public.app_case_location_relations
     where relation_id='${root.relation_id}';`,
  );
  await psql(
    database,
    `insert into public.app_location_address_observations (
       id, location_id, observation_kind, descriptor_kind, observed_at,
       recorded_at, recorded_by_actor_ref, recorded_from_request_id,
       country_code, site_reference
     ) values (
       '${revokeObservation}','${revokeLocation}','manual_observed',
       'site_reference','${T1}','${T1}','actor:proof','obs:revoke',
       'NL','revoke'
     );
     insert into public.app_workforce_scope_assignments (
       id, scope_assignment_id, workforce_identity_id,
       capability_assignment_id, capability_code, case_id, location_id,
       case_location_relation_id, event_type, effective_at, recorded_at,
       decision_ref, recorded_by_actor_ref, request_id
     ) values
       ('${uuid(560)}','${uuid(660)}','${MAKER}','${uuid(303)}',
        'location.version.accept.prepare','${CASE_1}','${revokeLocation}',
        '${revokeRelationEvent}','granted',pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp(),'decision:scope:revoke-maker',
        'actor:proof','scope:revoke-maker'),
       ('${uuid(561)}','${uuid(661)}','${CHECKER}','${uuid(306)}',
        'location.version.accept.approve','${CASE_1}','${revokeLocation}',
        '${revokeRelationEvent}','granted',pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp(),'decision:scope:revoke-checker',
        'actor:proof','scope:revoke-checker');`,
  );
  const revokeBusiness = operationBusiness(
    "accept",
    revokeLocation,
    revokeObservation,
  );
  const revokeHash = await operationHash(revokeBusiness);
  const revokePrepare = await call(
    database,
    PUBLIC_RPCS[2],
    AUTH_MAKER,
    "revoke:prepare",
    "revoke:prepare",
    { ...revokeBusiness, operation_payload_hash: revokeHash },
    HASH_B,
  );
  const revokeRequest = String(revokePrepare.operation_request_id);
  await call(
    database,
    PUBLIC_RPCS[3],
    AUTH_CHECKER,
    "revoke:review",
    "revoke:review",
    {
      operation_request_id: revokeRequest,
      outcome: "approved",
      reviewed_payload_hash: revokeHash,
      decision_ref: "decision:revoke-review",
      reason_ref: null,
    },
    HASH_B,
  );
  const revocationSql = `begin;
    insert into public.app_workforce_identity_states (
      workforce_identity_id, state, effective_at, decision_ref, reason_ref,
      recorded_by_actor_ref, request_id, supersedes_state_id
    ) values (
      '${MAKER}','suspended',pg_catalog.clock_timestamp(),
      'decision:race-revoke','reason:race-revoke','actor:proof',
      'state:race-revoke','${uuid(700)}'
    );
    select pg_catalog.pg_sleep(0.4);
    commit;`;
  const revokeProcess = psqlResult(database, revocationSql);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const executionDuringRevoke = psqlResult(
    database,
    bridgeCall(
      PUBLIC_RPCS[4],
      AUTH_MAKER,
      "revoke:execute",
      "revoke:execute",
      {
        operation_request_id: revokeRequest,
        ...revokeBusiness,
        operation_payload_hash: revokeHash,
      },
      HASH_B,
    ),
  );
  const [revokeResult, executionResult] = await Promise.all([
    revokeProcess,
    executionDuringRevoke,
  ]);
  assert(
    revokeResult.code === 0 && executionResult.code === 0 &&
      code(JSON.parse(executionResult.stdout)) === "authorization_changed" &&
      await psql(
          database,
          `select execution_status
           from public.app_workforce_operation_requests
           where id='${revokeRequest}';`,
        ) === "pending" &&
      await psql(
          database,
          `select count(*) from public.app_location_versions
           where location_id='${revokeLocation}';`,
        ) === "0",
    "revocation_execution_lock_order",
  );
  q(61);
}

async function main(): Promise<void> {
  const migration = await Deno.readTextFile(MIGRATION);
  const migrationHash = await sha256(migration);
  const protectedBefore = await protectedFingerprint();
  assert(
    await readOnlyMain(
      `select current_database() || '|' ||
       current_setting('transaction_read_only');`,
    ) === "postgres|on",
    "main_read_only_gate",
  );
  assert(
    await readOnlyMain(
      `select ${
        WP3L_TABLES.map((table) => `(select count(*) from public.${table})`)
          .join(" || '|' || ")
      };`,
    ) === "0|0|0|0|0|0|0",
    "main_wp3l_not_empty_before",
  );

  const database = DATABASE_PREFIX +
    crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  let created = false;
  try {
    await createFreshDatabase(database, migration);
    created = true;
    await catalogAndSourceProof(database, migration);
    await handlerProof();
    await fixtures(database);
    await behaviorProof(database);
    assert(
      await sha256(await Deno.readTextFile(MIGRATION)) === migrationHash &&
        await psql(
            database,
            `select count(*) from pg_proc p join pg_namespace n
             on n.oid=p.pronamespace where n.nspname='public'
             and p.proname like 'app_ops_location_%';`,
          ) === "9",
      "fresh_apply_fingerprint",
    );
    q(62);
  } finally {
    if (created) await dropDatabase(database);
  }

  assert(
    await protectedFingerprint() === protectedBefore &&
      await readOnlyMain(
          `select ${
            WP3L_TABLES.map((table) => `(select count(*) from public.${table})`)
              .join(" || '|' || ")
          };`,
        ) === "0|0|0|0|0|0|0",
    "protected_state_changed",
  );
  q(63);
  assert(
    await readOnlyMain(
      `select count(*) from pg_database
       where datname like '${DATABASE_PREFIX}%';`,
    ) === "0",
    "proof_database_remains",
  );
  q(64);
  console.log("api-app-ops-location-callers-proof-ok");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`proof-failed:${scrub(message)}`);
  Deno.exit(1);
}
