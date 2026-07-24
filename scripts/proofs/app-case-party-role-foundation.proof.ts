// Local proof for the WP2B-I case and case-party-role foundation.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
//
// The target migration must already be applied to the fixed local ENVAL
// Postgres container. Functional and concurrency fixtures run in a disposable
// local database and are removed by dropping that database in finally.

type ProofResult = {
  id: string;
  status: "PASS" | "FAIL";
  detail: string;
};

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type TableCounts = Map<string, number>;

const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const MIGRATION_PATH =
  "supabase/migrations/20260724110000_app_case_party_role_foundation.sql";
const WP2A_MIGRATION_PATH =
  "supabase/migrations/20260722100000_app_party_foundation.sql";
const PROOF_PATH = "scripts/proofs/app-case-party-role-foundation.proof.ts";

const TARGET_TABLES = ["app_cases", "app_case_party_roles"] as const;
const EXPECTED_UNTRACKED = new Set([
  "deno.lock",
  "scripts/proofs/app-case-party-role-foundation.proof.ts",
  "scripts/proofs/app-connection-write-rpcs.proof.ts",
  "scripts/proofs/app-ean-connection-domain-foundation.proof.ts",
  "scripts/proofs/app-signup-intake-quarantine-schema.proof.ts",
  "scripts/proofs/in-place-baseline-phase0-proof.mjs",
  "scripts/proofs/in-place-baseline-phase0-remote-readonly.sql",
  "scripts/proofs/postgrest-authorized-health.proof.mjs",
  "scripts/proofs/recovery-gate-remote-readonly.sql",
  "supabase/baseline-proposals/wave-1-rollback/001_emergency_drop_wave1_app_objects.sql",
  "supabase/baseline-proposals/wave-1/001_app_identity_audit_idempotency.sql",
  "supabase/baseline-proposals/wave-1/002_app_case_location_foundation.sql",
  "supabase/baseline-proposals/wave-1/003_app_evidence_slots.sql",
  "supabase/baseline-proposals/wave-1/004_app_document_files_versions.sql",
  "supabase/baseline-proposals/wave-1/005_app_document_confirm_withdraw_rpcs.sql",
]);

const PROTECTED_PATHS = [
  "deno.lock",
  "scripts/proofs/app-connection-write-rpcs.proof.ts",
  "scripts/proofs/app-ean-connection-domain-foundation.proof.ts",
  "scripts/proofs/app-signup-intake-quarantine-schema.proof.ts",
  "scripts/proofs/in-place-baseline-phase0-proof.mjs",
  "scripts/proofs/in-place-baseline-phase0-remote-readonly.sql",
  "scripts/proofs/postgrest-authorized-health.proof.mjs",
  "scripts/proofs/recovery-gate-remote-readonly.sql",
  "supabase/baseline-proposals/wave-1-rollback/001_emergency_drop_wave1_app_objects.sql",
  "supabase/baseline-proposals/wave-1/001_app_identity_audit_idempotency.sql",
  "supabase/baseline-proposals/wave-1/002_app_case_location_foundation.sql",
  "supabase/baseline-proposals/wave-1/003_app_evidence_slots.sql",
  "supabase/baseline-proposals/wave-1/004_app_document_files_versions.sql",
  "supabase/baseline-proposals/wave-1/005_app_document_confirm_withdraw_rpcs.sql",
] as const;

const EXPECTED_COLUMNS: Record<string, string[]> = {
  app_cases: [
    "id",
    "customer_id",
    "case_reference",
    "created_at",
    "created_by_actor_type",
    "created_by_actor_ref",
    "source_class",
    "source_ref",
    "request_id",
  ],
  app_case_party_roles: [
    "id",
    "role_claim_id",
    "case_id",
    "party_id",
    "person_profile_version_id",
    "organization_profile_version_id",
    "role_type",
    "claim_status",
    "valid_from",
    "valid_to",
    "recorded_at",
    "recorded_by_actor_type",
    "recorded_by_actor_ref",
    "source_class",
    "source_ref",
    "request_id",
    "decision_at",
    "decided_by_actor_type",
    "decided_by_actor_ref",
    "decision_reason",
    "supersedes_id",
    "supersession_reason",
  ],
};

const results: ProofResult[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function pass(id: string, detail: string): void {
  results.push({ id, status: "PASS", detail });
}

function requireLocalProof(): void {
  assert(
    Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES",
    "destructive_local_proof_not_enabled",
  );
}

function scrub(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/enval_wp2b_proof_[0-9_]+/g, "<proof-database>")
    .split("\n")
    .slice(0, 3)
    .join(" | ");
}

async function command(
  executable: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const process = new Deno.Command(executable, {
    args,
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  if (stdin !== undefined) {
    const writer = process.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }

  const output = await process.output();
  return {
    success: output.success,
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
  };
}

async function mustCommand(
  executable: string,
  args: string[],
  stdin?: string,
): Promise<string> {
  const output = await command(executable, args, stdin);
  if (!output.success) {
    throw new Error(scrub(output.stderr || `${executable}_failed`));
  }
  return output.stdout;
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
    "-U",
    "postgres",
    "-d",
    database,
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
  ], sql);
}

async function psql(database: string, sql: string): Promise<string> {
  const output = await psqlResult(database, sql);
  if (!output.success) {
    throw new Error(scrub(output.stderr || "psql_failed"));
  }
  return output.stdout;
}

async function expectSqlError(
  database: string,
  sql: string,
  expectedFragments: string[],
): Promise<void> {
  const output = await psqlResult(database, sql);
  assert(!output.success, "expected_sql_failure_missing");
  const combined = `${output.stderr}\n${output.stdout}`;
  assert(
    expectedFragments.some((fragment) => combined.includes(fragment)),
    `unexpected_sql_error:${scrub(combined)}`,
  );
}

async function sha256File(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function protectedHashes(): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const path of PROTECTED_PATHS) {
    hashes.set(path, await sha256File(path));
  }
  return hashes;
}

function equalMaps<K, V>(left: Map<K, V>, right: Map<K, V>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

async function appTableCounts(database: string): Promise<TableCounts> {
  const raw = await psql(database, `
    select table_name || '|' || (
      xpath(
        '/row/c/text()',
        query_to_xml(
          format('select count(*) as c from public.%I', table_name),
          false,
          true,
          ''
        )
      )
    )[1]::text
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name like 'app\\_%' escape '\\'
    order by table_name;
  `);

  const counts = new Map<string, number>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [table, count] = line.split("|");
    counts.set(table, Number(count));
  }
  return counts;
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlUuid(value: string): string {
  return `${sqlText(value)}::uuid`;
}

function caseInsert(id: string, customerId: string, reference: string): string {
  return `
    insert into public.app_cases (
      id, customer_id, case_reference, created_at,
      created_by_actor_type, created_by_actor_ref,
      source_class, source_ref, request_id
    ) values (
      ${sqlUuid(id)}, ${sqlUuid(customerId)}, ${sqlText(reference)},
      '2026-07-24T00:00:00Z'::timestamptz,
      'system', 'local-proof-actor',
      'manual_review', 'local-proof-source', 'local-proof-request'
    );
  `;
}

type RoleInsertArgs = {
  id?: string;
  claimId?: string;
  caseId: string;
  partyId: string;
  personProfileId?: string | null;
  organizationProfileId?: string | null;
  roleType?: string;
  status?: string;
  validFrom?: string;
  validTo?: string | null;
  recordedAt?: string;
  decisionMode?: "auto" | "null" | "present";
  supersedesId?: string | null;
  supersessionReason?: string | null;
};

function roleInsert(args: RoleInsertArgs): string {
  const status = args.status ?? "case_confirmed";
  const decisionMode = args.decisionMode ??
    (status === "asserted" ? "null" : "present");
  const decision = decisionMode === "null"
    ? ["null", "null", "null", "null"]
    : [
      "'2026-07-24T00:05:00Z'::timestamptz",
      "'system'",
      "'local-proof-decider'",
      "'local proof decision'",
    ];

  return `
    insert into public.app_case_party_roles (
      id, role_claim_id, case_id, party_id,
      person_profile_version_id, organization_profile_version_id,
      role_type, claim_status, valid_from, valid_to,
      recorded_at, recorded_by_actor_type, recorded_by_actor_ref,
      source_class, source_ref, request_id,
      decision_at, decided_by_actor_type, decided_by_actor_ref,
      decision_reason, supersedes_id, supersession_reason
    ) values (
      ${sqlUuid(args.id ?? crypto.randomUUID())},
      ${sqlUuid(args.claimId ?? crypto.randomUUID())},
      ${sqlUuid(args.caseId)},
      ${sqlUuid(args.partyId)},
      ${
    args.personProfileId === null || args.personProfileId === undefined
      ? "null"
      : sqlUuid(args.personProfileId)
  },
      ${
    args.organizationProfileId === null ||
      args.organizationProfileId === undefined
      ? "null"
      : sqlUuid(args.organizationProfileId)
  },
      ${sqlText(args.roleType ?? "service_recipient")},
      ${sqlText(status)},
      ${
    sqlText(args.validFrom ?? "2026-01-01T00:00:00Z")
  }::timestamptz,
      ${
    args.validTo === null || args.validTo === undefined
      ? "null"
      : `${sqlText(args.validTo)}::timestamptz`
  },
      ${
    sqlText(args.recordedAt ?? "2026-07-24T00:10:00Z")
  }::timestamptz,
      'system', 'local-proof-recorder',
      'manual_review', 'local-proof-source', 'local-proof-request',
      ${decision[0]}, ${decision[1]}, ${decision[2]}, ${decision[3]},
      ${
    args.supersedesId === null || args.supersedesId === undefined
      ? "null"
      : sqlUuid(args.supersedesId)
  },
      ${
    args.supersessionReason === null ||
      args.supersessionReason === undefined
      ? "null"
      : sqlText(args.supersessionReason)
  }
    );
  `;
}

async function proveSourceAndMainSchema(): Promise<void> {
  const trackedDiff = (await mustCommand("git", ["diff", "--name-only"]))
    .split("\n")
    .filter(Boolean);
  assert(trackedDiff.length === 0, "unexpected_tracked_diff");

  const untracked = new Set(
    (await mustCommand("git", [
      "ls-files",
      "--others",
      "--exclude-standard",
    ])).split("\n").filter(Boolean),
  );
  assert(untracked.size === EXPECTED_UNTRACKED.size, "untracked_scope_changed");
  for (const path of EXPECTED_UNTRACKED) {
    assert(untracked.has(path), `expected_untracked_missing:${path}`);
  }

  const ignored = await mustCommand("git", [
    "check-ignore",
    "-v",
    MIGRATION_PATH,
  ]);
  assert(ignored.endsWith(`\t${MIGRATION_PATH}`), "migration_not_ignored");

  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const createdTables = [
    ...migration.matchAll(/create table public\.([a-z0-9_]+)/g),
  ].map((match) => match[1]);
  const createdFunctions = [
    ...migration.matchAll(
      /create or replace function public\.([a-z0-9_]+)\(\)/g,
    ),
  ].map((match) => match[1]);
  assert(
    createdTables.join(",") === TARGET_TABLES.join(","),
    "migration_table_scope_mismatch",
  );
  assert(
    createdFunctions.join(",") === [
      "app_wp2b_i_immutable_guard",
      "app_case_party_roles_insert_guard",
      "app_case_party_roles_deferred_guard",
    ].join(","),
    "migration_function_scope_mismatch",
  );
  assert(
    !/create\s+(?:or\s+replace\s+)?(?:view|materialized\s+view|procedure)\b/i
      .test(migration),
    "unexpected_schema_object_kind",
  );
  pass("Q01", "source scope is exactly two tables, three focused functions, and one proof");

  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = (await psql(MAIN_DATABASE, `
      select string_agg(column_name, ',' order by ordinal_position)
      from information_schema.columns
      where table_schema = 'public' and table_name = ${sqlText(table)};
    `)).split(",");
    assert(actual.join(",") === expected.join(","), `column_mismatch:${table}`);
  }

  const columnRuleMismatchCount = Number(await psql(MAIN_DATABASE, `
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('app_cases', 'app_case_party_roles')
      and (
        (
          column_name in (
            'id',
            'customer_id',
            'role_claim_id',
            'case_id',
            'party_id',
            'person_profile_version_id',
            'organization_profile_version_id',
            'supersedes_id'
          )
          and udt_name <> 'uuid'
        )
        or
        (
          column_name in (
            'created_at',
            'valid_from',
            'valid_to',
            'recorded_at',
            'decision_at'
          )
          and udt_name <> 'timestamptz'
        )
        or
        (
          column_name not in (
            'id',
            'customer_id',
            'role_claim_id',
            'case_id',
            'party_id',
            'person_profile_version_id',
            'organization_profile_version_id',
            'supersedes_id',
            'created_at',
            'valid_from',
            'valid_to',
            'recorded_at',
            'decision_at'
          )
          and udt_name <> 'text'
        )
        or
        (
          column_name not in (
            'person_profile_version_id',
            'organization_profile_version_id',
            'valid_to',
            'decision_at',
            'decided_by_actor_type',
            'decided_by_actor_ref',
            'decision_reason',
            'supersedes_id',
            'supersession_reason'
          )
          and is_nullable <> 'NO'
        )
        or
        (
          column_name in (
            'person_profile_version_id',
            'organization_profile_version_id',
            'valid_to',
            'decision_at',
            'decided_by_actor_type',
            'decided_by_actor_ref',
            'decision_reason',
            'supersedes_id',
            'supersession_reason'
          )
          and is_nullable <> 'YES'
        )
      );
  `));
  assert(columnRuleMismatchCount === 0, "column_type_or_nullability_mismatch");

  const forbiddenColumnCount = Number(await psql(MAIN_DATABASE, `
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('app_cases', 'app_case_party_roles')
      and (
        column_name in (
          'status',
          'case_type',
          'ean',
          'authority',
          'mandate',
          'evidence_decision',
          'kwh',
          'settlement',
          'updated_at',
          'lifecycle'
        )
        or data_type in ('json', 'jsonb')
      );
  `));
  assert(forbiddenColumnCount === 0, "forbidden_column_present");
  pass("Q02", "exact columns and types exist; forbidden lifecycle/domain columns are absent");

  const inventory = (await psql(MAIN_DATABASE, `
    select
      (select count(*) from information_schema.tables
       where table_schema = 'public'
         and table_name in ('app_cases', 'app_case_party_roles')),
      (select count(*) from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public'
         and t.relname in ('app_cases', 'app_case_party_roles')
         and c.contype = 'f' and c.confdeltype = 'r'),
      (select count(*) from pg_constraint c
       join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public'
         and t.relname in ('app_cases', 'app_case_party_roles')
         and c.contype = 'c'),
      (select count(*) from pg_indexes
       where schemaname = 'public'
         and tablename in ('app_cases', 'app_case_party_roles')),
      (select count(*) from pg_trigger g
       join pg_class t on t.oid = g.tgrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public'
         and t.relname in ('app_cases', 'app_case_party_roles')
         and not g.tgisinternal);
  `)).split("|").map(Number);
  assert(
    inventory.join(",") === "2,6,13,11,4",
    `object_inventory_mismatch:${inventory.join(",")}`,
  );

  const requiredIndexes = Number(await psql(MAIN_DATABASE, `
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'app_cases_case_reference_uidx',
        'app_case_party_roles_root_claim_uidx',
        'app_case_party_roles_direct_successor_uidx',
        'app_case_party_roles_case_id_idx',
        'app_case_party_roles_party_id_idx',
        'app_case_party_roles_role_claim_id_idx',
        'app_case_party_roles_person_profile_version_id_idx',
        'app_case_party_roles_organization_profile_version_id_idx',
        'app_case_party_roles_operational_overlap_idx'
      );
  `));
  assert(requiredIndexes === 9, "required_index_missing");

  const deferredTrigger = await psql(MAIN_DATABASE, `
    select g.tgdeferrable::text || '|' || g.tginitdeferred::text
    from pg_trigger g
    where g.tgname = 'trg_app_case_party_roles_deferred_guard';
  `);
  assert(deferredTrigger === "true|true", "deferred_trigger_not_deferred");
  pass("Q03", "FKs, RESTRICT actions, checks, indexes, and four triggers match inventory");

  const rlsAndPolicies = (await psql(MAIN_DATABASE, `
    select
      (select count(*) from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname in ('app_cases', 'app_case_party_roles')
         and c.relrowsecurity),
      (select count(*) from pg_policies
       where schemaname = 'public'
         and tablename in ('app_cases', 'app_case_party_roles')
         and policyname = 'deny_all');
  `)).split("|").map(Number);
  assert(rlsAndPolicies.join(",") === "2,2", "rls_or_policy_mismatch");

  for (const table of TARGET_TABLES) {
    for (const role of ["anon", "authenticated"]) {
      const privileges = await psql(MAIN_DATABASE, `
        select
          has_table_privilege(${sqlText(role)}, 'public.${table}', 'SELECT'),
          has_table_privilege(${sqlText(role)}, 'public.${table}', 'INSERT'),
          has_table_privilege(${sqlText(role)}, 'public.${table}', 'UPDATE'),
          has_table_privilege(${sqlText(role)}, 'public.${table}', 'DELETE');
      `);
      assert(privileges === "f|f|f|f", `client_privilege_present:${role}:${table}`);
    }
    const servicePrivileges = await psql(MAIN_DATABASE, `
      select
        has_table_privilege('service_role', 'public.${table}', 'SELECT'),
        has_table_privilege('service_role', 'public.${table}', 'INSERT'),
        has_table_privilege('service_role', 'public.${table}', 'UPDATE'),
        has_table_privilege('service_role', 'public.${table}', 'DELETE'),
        has_table_privilege('service_role', 'public.${table}', 'TRUNCATE'),
        has_table_privilege('service_role', 'public.${table}', 'REFERENCES'),
        has_table_privilege('service_role', 'public.${table}', 'TRIGGER');
    `);
    assert(
      servicePrivileges === "t|t|f|f|f|f|f",
      `service_role_privilege_mismatch:${table}`,
    );
  }

  const publicAclCount = Number(await psql(MAIN_DATABASE, `
    select count(*)
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) acl
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('app_cases', 'app_case_party_roles')
      and acl.grantee = 0;
  `));
  assert(publicAclCount === 0, "public_table_privilege_present");
  pass("Q04", "RLS and deny-all policies are active; client roles have no grants");
  pass("Q05", "service_role has exactly SELECT and INSERT on both tables");

  const functionSecurity = await psql(MAIN_DATABASE, `
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'app_wp2b_i_immutable_guard',
        'app_case_party_roles_insert_guard',
        'app_case_party_roles_deferred_guard'
      )
      and not p.prosecdef;
  `);
  assert(functionSecurity === "3", "function_security_mode_mismatch");
  for (
    const signature of [
      "public.app_wp2b_i_immutable_guard()",
      "public.app_case_party_roles_insert_guard()",
      "public.app_case_party_roles_deferred_guard()",
    ]
  ) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert(
        await psql(MAIN_DATABASE, `
          select has_function_privilege(
            ${sqlText(role)}, ${sqlText(signature)}, 'EXECUTE'
          );
        `) === "f",
        `function_execute_present:${role}:${signature}`,
      );
    }
  }
  pass("Q06", "trigger functions are invoker mode and have no client/service execute grant");

  const boundaryFkCount = Number(await psql(MAIN_DATABASE, `
    select count(*)
    from pg_constraint c
    join pg_class source_table on source_table.oid = c.conrelid
    join pg_class target_table on target_table.oid = c.confrelid
    join pg_namespace n on n.oid = source_table.relnamespace
    where n.nspname = 'public'
      and source_table.relname = 'app_case_party_roles'
      and target_table.relname in (
        'app_customer_identities',
        'app_customer_party_relationships',
        'app_customer_dossiers',
        'app_dossier_legal_acceptances'
      );
  `));
  assert(boundaryFkCount === 0, "forbidden_authority_simulation_fk");
  pass("Q07", "Auth, account, dossier, relationship, and legal acceptance cannot substitute role/authority truth");
}

async function seedProofDatabase(database: string) {
  const ids = {
    customer: crypto.randomUUID(),
    person1: crypto.randomUUID(),
    person2: crypto.randomUUID(),
    person3: crypto.randomUUID(),
    organization: crypto.randomUUID(),
    personProfile1: crypto.randomUUID(),
    personProfile2: crypto.randomUUID(),
    personProfile3: crypto.randomUUID(),
    organizationProfile: crypto.randomUUID(),
  };

  await psql(database, `
    insert into public.app_customers (id) values (${sqlUuid(ids.customer)});

    insert into public.app_parties (
      id, party_kind, source_type, source_reference_type,
      source_reference_id, request_id, actor_type, actor_ref
    ) values
      (${sqlUuid(ids.person1)}, 'natural_person', 'manual_review', 'local_proof', 'p1', 'r1', 'system', 'proof'),
      (${sqlUuid(ids.person2)}, 'natural_person', 'manual_review', 'local_proof', 'p2', 'r2', 'system', 'proof'),
      (${sqlUuid(ids.person3)}, 'natural_person', 'manual_review', 'local_proof', 'p3', 'r3', 'system', 'proof'),
      (${sqlUuid(ids.organization)}, 'organization', 'manual_review', 'local_proof', 'o1', 'r4', 'system', 'proof');

    insert into public.app_party_person_versions (
      id, party_id, full_name, valid_from, valid_to,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values
      (${sqlUuid(ids.personProfile1)}, ${sqlUuid(ids.person1)}, 'Proof Person', '2020-01-01', '2030-01-01', 'manual_review', 'local_proof', 'pv1', 'r5', 'system', 'proof'),
      (${sqlUuid(ids.personProfile2)}, ${sqlUuid(ids.person2)}, 'Proof Person', '2020-01-01', '2030-01-01', 'manual_review', 'local_proof', 'pv2', 'r6', 'system', 'proof'),
      (${sqlUuid(ids.personProfile3)}, ${sqlUuid(ids.person3)}, 'Proof Person', '2020-01-01', '2030-01-01', 'manual_review', 'local_proof', 'pv3', 'r7', 'system', 'proof');

    insert into public.app_party_organization_versions (
      id, party_id, legal_name, organization_classification,
      valid_from, valid_to, source_type, source_reference_type,
      source_reference_id, request_id, actor_type, actor_ref
    ) values (
      ${sqlUuid(ids.organizationProfile)}, ${sqlUuid(ids.organization)},
      'Proof Organization', 'business', '2020-01-01', '2030-01-01',
      'manual_review', 'local_proof', 'ov1', 'r8', 'system', 'proof'
    );
  `);

  return ids;
}

async function runFunctionalProof(
  database: string,
  ids: Awaited<ReturnType<typeof seedProofDatabase>>,
): Promise<void> {
  const basicCase = crypto.randomUUID();
  await psql(database, caseInsert(basicCase, ids.customer, "WP2B-001"));
  const basicRole = crypto.randomUUID();
  await psql(database, roleInsert({
    id: basicRole,
    caseId: basicCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
  }));
  pass("Q08", "minimal case and confirmed natural-person service recipient insert");

  await expectSqlError(
    database,
    caseInsert(crypto.randomUUID(), ids.customer, "SHORT"),
    ["app_cases_case_reference_chk"],
  );
  await expectSqlError(
    database,
    caseInsert(crypto.randomUUID(), ids.customer, " WP2B-002 "),
    ["app_cases_case_reference_chk"],
  );
  await expectSqlError(
    database,
    caseInsert(crypto.randomUUID(), ids.customer, "X".repeat(65)),
    ["app_cases_case_reference_chk"],
  );
  await expectSqlError(
    database,
    caseInsert(crypto.randomUUID(), ids.customer, "WP2B-001"),
    ["app_cases_case_reference_uidx"],
  );
  pass("Q09", "case reference trim, 8-64 length, and global uniqueness enforced");

  const profileCase = crypto.randomUUID();
  await psql(database, caseInsert(profileCase, ids.customer, "WP2B-010"));
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
  }), ["require exactly one profile version", "profile_xor"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    organizationProfileId: ids.organizationProfile,
  }), ["natural_person roles require only", "profile_xor"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile2,
  }), ["person profile version must belong"]);
  pass("Q10", "profile XOR and same-party profile ownership enforced");

  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.organization,
    personProfileId: ids.personProfile1,
  }), ["person profile version must belong", "natural_person roles require only"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.organization,
    organizationProfileId: ids.organizationProfile,
    roleType: "case_contact",
  }), ["case_contact requires a natural_person"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    organizationProfileId: ids.organizationProfile,
  }), ["organization profile version must belong", "organization roles require only"]);
  pass("Q11", "natural-person/organization subtype and case-contact boundaries enforced");

  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    roleType: "representative",
  }), ["app_case_party_roles_role_type_chk"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    status: "approved",
  }), ["app_case_party_roles_claim_status_chk"]);
  pass("Q12", "role and claim-status vocabularies are closed and exact");

  await expectSqlError(database, `
    insert into public.app_cases (
      id, customer_id, case_reference, created_at,
      created_by_actor_type, created_by_actor_ref,
      source_class, source_ref, request_id
    ) values (
      ${sqlUuid(crypto.randomUUID())}, ${sqlUuid(ids.customer)}, 'WP2B-011',
      '2026-07-24T00:00:00Z', 'browser', 'proof',
      'manual_review', 'proof', 'proof'
    );
  `, ["app_cases_created_by_actor_type_chk"]);
  await expectSqlError(database, `
    insert into public.app_cases (
      id, customer_id, case_reference, created_at,
      created_by_actor_type, created_by_actor_ref,
      source_class, source_ref, request_id
    ) values (
      ${sqlUuid(crypto.randomUUID())}, ${sqlUuid(ids.customer)}, 'WP2B-012',
      '2026-07-24T00:00:00Z', 'system', 'proof',
      ' ', 'proof', 'proof'
    );
  `, ["app_cases_provenance_not_blank_chk"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
  }).replace(
    "'system', 'local-proof-recorder'",
    "'browser', 'local-proof-recorder'",
  ), ["invalid recorded_by_actor_type"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
  }).replace(
    "'manual_review', 'local-proof-source', 'local-proof-request'",
    "' ', 'local-proof-source', 'local-proof-request'",
  ), ["provenance references must be nonblank"]);
  pass("Q34", "WP2A actor vocabulary and nonblank provenance are enforced");

  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    status: "asserted",
    decisionMode: "present",
  }), ["asserted app_case_party_roles require null decision metadata"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    status: "case_confirmed",
    decisionMode: "null",
  }), ["decided app_case_party_roles require complete decision metadata"]);
  pass("Q13", "asserted and decided metadata rules are enforced");

  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    validFrom: "2027-01-01T00:00:00Z",
    validTo: "2027-01-01T00:00:00Z",
  }), ["app_case_party_roles_valid_range_chk"]);
  await expectSqlError(database, roleInsert({
    caseId: profileCase,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    validFrom: "2027-01-02T00:00:00Z",
    validTo: "2027-01-01T00:00:00Z",
  }), ["app_case_party_roles_valid_range_chk"]);
  pass("Q14", "invalid half-open temporal intervals are rejected");

  const boundaryCase = crypto.randomUUID();
  await psql(database, caseInsert(boundaryCase, ids.customer, "WP2B-020"));
  await psql(database, `
    begin;
    ${
    roleInsert({
      caseId: boundaryCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
      validTo: "2027-01-01T00:00:00Z",
    })
  }
    ${
    roleInsert({
      caseId: boundaryCase,
      partyId: ids.person2,
      personProfileId: ids.personProfile2,
      validFrom: "2027-01-01T00:00:00Z",
      validTo: "2028-01-01T00:00:00Z",
    })
  }
    commit;
  `);
  pass("Q15", "boundary-touching service-recipient intervals do not overlap");

  const rootCase = crypto.randomUUID();
  const rootClaim = crypto.randomUUID();
  await psql(database, caseInsert(rootCase, ids.customer, "WP2B-030"));
  await psql(database, roleInsert({
    caseId: rootCase,
    claimId: rootClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
  }));
  await expectSqlError(database, roleInsert({
    caseId: rootCase,
    claimId: rootClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
  }), ["app_case_party_roles_root_claim_uidx"]);
  pass("Q16", "at most one root exists per role claim");

  const successorId = crypto.randomUUID();
  const rootIdBeforeSuccessor = await psql(database, `
    select id from public.app_case_party_roles
    where role_claim_id = ${sqlUuid(rootClaim)} and supersedes_id is null;
  `);
  await expectSqlError(database, roleInsert({
    caseId: rootCase,
    claimId: rootClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    status: "disputed",
    recordedAt: "2026-07-24T00:20:00Z",
    supersedesId: rootIdBeforeSuccessor,
  }), ["app_case_party_roles_supersession_reason_chk"]);
  await expectSqlError(database, roleInsert({
    caseId: rootCase,
    partyId: ids.person2,
    personProfileId: ids.personProfile2,
    supersessionReason: "root cannot have a supersession reason",
  }), ["app_case_party_roles_supersession_reason_chk"]);
  await psql(database, roleInsert({
    id: successorId,
    caseId: rootCase,
    claimId: rootClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    status: "disputed",
    recordedAt: "2026-07-24T00:20:00Z",
    supersedesId: rootIdBeforeSuccessor,
    supersessionReason: "claim disputed",
  }));
  const rootId = await psql(database, `
    select supersedes_id from public.app_case_party_roles
    where id = ${sqlUuid(successorId)};
  `);
  await expectSqlError(database, roleInsert({
    caseId: rootCase,
    claimId: rootClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    status: "rejected",
    recordedAt: "2026-07-24T00:30:00Z",
    supersedesId: rootId,
    supersessionReason: "second successor",
  }), ["predecessor must be terminal", "direct_successor"]);
  pass("Q17", "one direct successor is allowed and a nonterminal predecessor is rejected");

  const preserveCase = crypto.randomUUID();
  const otherCase = crypto.randomUUID();
  const preserveClaim = crypto.randomUUID();
  const preserveRoot = crypto.randomUUID();
  await psql(database, `
    ${caseInsert(preserveCase, ids.customer, "WP2B-040")}
    ${caseInsert(otherCase, ids.customer, "WP2B-041")}
    ${
    roleInsert({
      id: preserveRoot,
      caseId: preserveCase,
      claimId: preserveClaim,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
    })
  }
  `);
  await expectSqlError(database, roleInsert({
    caseId: otherCase,
    claimId: preserveClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    recordedAt: "2026-07-24T00:20:00Z",
    supersedesId: preserveRoot,
    supersessionReason: "wrong case",
  }), ["successor must preserve chain, case, party, and role"]);
  await expectSqlError(database, roleInsert({
    caseId: preserveCase,
    claimId: preserveClaim,
    partyId: ids.person2,
    personProfileId: ids.personProfile2,
    recordedAt: "2026-07-24T00:20:00Z",
    supersedesId: preserveRoot,
    supersessionReason: "wrong party",
  }), ["successor must preserve chain, case, party, and role"]);
  await expectSqlError(database, roleInsert({
    caseId: preserveCase,
    claimId: crypto.randomUUID(),
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    recordedAt: "2026-07-24T00:20:00Z",
    supersedesId: preserveRoot,
    supersessionReason: "wrong claim",
  }), ["successor must preserve chain, case, party, and role"]);
  await expectSqlError(database, roleInsert({
    caseId: preserveCase,
    claimId: preserveClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    roleType: "case_contact",
    recordedAt: "2026-07-24T00:20:00Z",
    supersedesId: preserveRoot,
    supersessionReason: "wrong role",
  }), ["successor must preserve chain, case, party, and role"]);
  pass("Q18", "successors preserve claim, case, party, and role");

  await expectSqlError(database, roleInsert({
    caseId: preserveCase,
    claimId: preserveClaim,
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    recordedAt: "2026-07-24T00:10:00Z",
    supersedesId: preserveRoot,
    supersessionReason: "nonincreasing time",
  }), ["successor recorded_at must increase"]);
  const selfReferenceId = crypto.randomUUID();
  await expectSqlError(database, roleInsert({
    id: selfReferenceId,
    caseId: preserveCase,
    claimId: crypto.randomUUID(),
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    supersedesId: selfReferenceId,
    supersessionReason: "self reference",
  }), ["predecessor does not exist"]);
  const absentCyclePredecessor = crypto.randomUUID();
  await expectSqlError(database, roleInsert({
    id: crypto.randomUUID(),
    caseId: preserveCase,
    claimId: crypto.randomUUID(),
    partyId: ids.person1,
    personProfileId: ids.personProfile1,
    supersedesId: absentCyclePredecessor,
    supersessionReason: "cycle seed",
  }), ["predecessor does not exist"]);
  pass("Q19", "recorded_at must increase; self/cycle construction is rejected");

  await expectSqlError(
    database,
    `update public.app_cases set case_reference = 'WP2B-999' where id = ${sqlUuid(basicCase)};`,
    ["app_cases rows are immutable"],
  );
  await expectSqlError(
    database,
    `delete from public.app_cases where id = ${sqlUuid(basicCase)};`,
    ["app_cases rows are immutable"],
  );
  await expectSqlError(
    database,
    `update public.app_case_party_roles set claim_status = 'rejected' where id = ${sqlUuid(basicRole)};`,
    ["app_case_party_roles rows are immutable"],
  );
  await expectSqlError(
    database,
    `delete from public.app_case_party_roles where id = ${sqlUuid(basicRole)};`,
    ["app_case_party_roles rows are immutable"],
  );
  pass("Q20", "UPDATE and DELETE are rejected on both immutable tables");

  const nonOperationalCase = crypto.randomUUID();
  await psql(
    database,
    caseInsert(nonOperationalCase, ids.customer, "WP2B-050"),
  );
  await psql(database, `
    begin;
    ${
    roleInsert({
      caseId: nonOperationalCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
    })
  }
    ${
    roleInsert({
      caseId: nonOperationalCase,
      partyId: ids.person2,
      personProfileId: ids.personProfile2,
      status: "asserted",
    })
  }
    ${
    roleInsert({
      caseId: nonOperationalCase,
      partyId: ids.person2,
      personProfileId: ids.personProfile2,
      status: "disputed",
    })
  }
    ${
    roleInsert({
      caseId: nonOperationalCase,
      partyId: ids.person3,
      personProfileId: ids.personProfile3,
      status: "rejected",
    })
  }
    commit;
  `);
  pass("Q21", "asserted, disputed, and rejected rows are nonoperational");

  const contactCase = crypto.randomUUID();
  await psql(database, caseInsert(contactCase, ids.customer, "WP2B-060"));
  await psql(database, `
    begin;
    ${
    roleInsert({
      caseId: contactCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
      roleType: "case_contact",
    })
  }
    ${
    roleInsert({
      caseId: contactCase,
      partyId: ids.person2,
      personProfileId: ids.personProfile2,
      roleType: "case_contact",
    })
  }
    commit;
  `);
  pass("Q22", "multiple overlapping case contacts for different parties are allowed");

  await expectSqlError(database, `
    begin;
    ${
    roleInsert({
      caseId: contactCase,
      partyId: ids.person3,
      personProfileId: ids.personProfile3,
      roleType: "case_contact",
    })
  }
    ${
    roleInsert({
      caseId: contactCase,
      partyId: ids.person3,
      personProfileId: ids.personProfile3,
      roleType: "case_contact",
    })
  }
    commit;
  `, ["overlapping operational case roles"]);
  pass("Q23", "same-party/same-role operational overlap is rejected");

  const dualRoleCase = crypto.randomUUID();
  await psql(database, caseInsert(dualRoleCase, ids.customer, "WP2B-070"));
  await psql(database, `
    begin;
    ${
    roleInsert({
      caseId: dualRoleCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
      roleType: "service_recipient",
    })
  }
    ${
    roleInsert({
      caseId: dualRoleCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
      roleType: "case_contact",
    })
  }
    commit;
  `);
  pass("Q24", "one natural person may be service recipient and case contact");

  const overlapCase = crypto.randomUUID();
  await psql(database, caseInsert(overlapCase, ids.customer, "WP2B-080"));
  await expectSqlError(database, `
    begin;
    ${
    roleInsert({
      caseId: overlapCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
    })
  }
    ${
    roleInsert({
      caseId: overlapCase,
      partyId: ids.organization,
      organizationProfileId: ids.organizationProfile,
    })
  }
    commit;
  `, ["overlapping operational service_recipients"]);
  pass("Q25", "only one overlapping operational service recipient is allowed per case");

  const correctionCase = crypto.randomUUID();
  const oldClaim = crypto.randomUUID();
  const oldRoot = crypto.randomUUID();
  await psql(database, `
    ${caseInsert(correctionCase, ids.customer, "WP2B-090")}
    ${
    roleInsert({
      id: oldRoot,
      claimId: oldClaim,
      caseId: correctionCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
    })
  }
  `);
  await psql(database, `
    begin;
    ${
    roleInsert({
      claimId: oldClaim,
      caseId: correctionCase,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
      status: "disputed",
      validTo: "2027-01-01T00:00:00Z",
      recordedAt: "2026-07-24T00:20:00Z",
      supersedesId: oldRoot,
      supersessionReason: "incorrect party",
    })
  }
    ${
    roleInsert({
      caseId: correctionCase,
      partyId: ids.person2,
      personProfileId: ids.personProfile2,
      validFrom: "2027-01-01T00:00:00Z",
    })
  }
    commit;
  `);
  pass("Q26", "old claim closure and a new party claim succeed atomically");

  const laterProfile = crypto.randomUUID();
  await psql(database, `
    insert into public.app_party_person_versions (
      id, party_id, full_name, valid_from, valid_to,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref, supersedes_person_version_id
    ) values (
      ${sqlUuid(laterProfile)}, ${sqlUuid(ids.person1)}, 'Later Proof Profile',
      '2020-01-01', '2030-01-01',
      'manual_review', 'local_proof', 'later', 'later-request',
      'system', 'proof', ${sqlUuid(ids.personProfile1)}
    );
  `);
  assert(
    await psql(database, `
      select person_profile_version_id = ${sqlUuid(ids.personProfile1)}
      from public.app_case_party_roles where id = ${sqlUuid(basicRole)};
    `) === "t",
    "historical_profile_anchor_changed",
  );
  pass("Q27", "later party-profile versions do not rewrite historical role truth");

  assert(
    Number(await psql(database, `
      select count(*)
      from information_schema.tables
      where table_schema = 'public'
        and table_name ~ '(authority|mandate)';
    `)) === 0,
    "authority_or_mandate_table_created",
  );
  pass("Q28", "case role, representation authority, and mandate remain separate objects");
}

async function runConcurrencyProof(
  database: string,
  ids: Awaited<ReturnType<typeof seedProofDatabase>>,
): Promise<void> {
  const caseId = crypto.randomUUID();
  await psql(database, caseInsert(caseId, ids.customer, "WP2B-100"));

  const sql1 = `
    begin;
    ${
    roleInsert({
      caseId,
      partyId: ids.person1,
      personProfileId: ids.personProfile1,
    })
  }
    select pg_sleep(1);
    commit;
  `;
  const sql2 = `
    begin;
    ${
    roleInsert({
      caseId,
      partyId: ids.person2,
      personProfileId: ids.personProfile2,
    })
  }
    select pg_sleep(1);
    commit;
  `;

  const startedAt = performance.now();
  const [first, second] = await Promise.all([
    psqlResult(database, sql1),
    psqlResult(database, sql2),
  ]);
  const elapsedMs = performance.now() - startedAt;
  const succeeded = [first, second].filter((result) => result.success);
  const failed = [first, second].filter((result) => !result.success);
  assert(succeeded.length === 1, "concurrency_expected_exactly_one_commit");
  assert(failed.length === 1, "concurrency_expected_exactly_one_rejection");
  assert(
    `${failed[0].stderr}\n${failed[0].stdout}`.includes(
      "overlapping operational service_recipients",
    ),
    "concurrency_wrong_rejection",
  );
  assert(elapsedMs >= 1800, "concurrency_transactions_were_not_serialized");
  assert(
    await psql(database, `
      select count(*) from public.app_case_party_roles
      where case_id = ${sqlUuid(caseId)};
    `) === "1",
    "concurrency_committed_row_count_mismatch",
  );

  const guardSource = await psql(database, `
    select pg_get_functiondef(
      'public.app_case_party_roles_insert_guard()'::regprocedure
    );
  `);
  assert(
    guardSource.includes("pg_advisory_xact_lock") &&
      guardSource.includes("hashtextextended(new.case_id::text"),
    "deterministic_case_advisory_lock_missing",
  );
  pass("Q29", "concurrent overlapping service recipients allow exactly one commit");
  pass("Q30", "deterministic case advisory lock serializes and prevents write skew");
}

async function createProofDatabase(database: string): Promise<void> {
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
  await psql(database, `
    create table public.app_customers (
      id uuid primary key default gen_random_uuid()
    );
  `);
  await psql(database, await Deno.readTextFile(WP2A_MIGRATION_PATH));
  await psql(database, await Deno.readTextFile(MIGRATION_PATH));
}

async function dropProofDatabase(database: string): Promise<void> {
  const output = await command("docker", [
    "exec",
    CONTAINER,
    "dropdb",
    "-U",
    "postgres",
    "--if-exists",
    "--force",
    database,
  ]);
  if (!output.success) {
    throw new Error(scrub(output.stderr || "proof_database_cleanup_failed"));
  }
}

async function main(): Promise<void> {
  requireLocalProof();
  const startHead = await mustCommand("git", ["rev-parse", "HEAD"]);
  assert(
    startHead === "1e4fe26781796c9f624eb42d186c39fb98271218",
    "unexpected_head",
  );

  const hashesBefore = await protectedHashes();
  const countsBefore = await appTableCounts(MAIN_DATABASE);
  await proveSourceAndMainSchema();

  assert(
    countsBefore.get("app_cases") === 0 &&
      countsBefore.get("app_case_party_roles") === 0,
    "target_tables_not_empty_before_proof",
  );

  const proofDatabase = `enval_wp2b_proof_${
    Date.now().toString().replaceAll("-", "_")
  }`;
  try {
    await createProofDatabase(proofDatabase);
    const ids = await seedProofDatabase(proofDatabase);
    await runFunctionalProof(proofDatabase, ids);
    await runConcurrencyProof(proofDatabase, ids);
  } finally {
    await dropProofDatabase(proofDatabase);
  }

  const countsAfter = await appTableCounts(MAIN_DATABASE);
  const hashesAfter = await protectedHashes();
  assert(equalMaps(countsBefore, countsAfter), "protected_app_row_counts_changed");
  assert(equalMaps(hashesBefore, hashesAfter), "protected_file_hash_changed");
  pass("Q31", "all existing app-table row counts and protected hashes are unchanged");
  assert(
    countsAfter.get("app_cases") === 0 &&
      countsAfter.get("app_case_party_roles") === 0,
    "target_proof_rows_not_zero",
  );
  pass("Q32", "disposable proof database removed; both target tables remain empty");
  pass("Q33", "all activity used only the fixed local Docker Postgres container");

  results.sort((left, right) => left.id.localeCompare(right.id));
  for (const result of results) {
    console.log(`${result.id} ${result.status} ${result.detail}`);
  }
  assert(results.length === 34, `unexpected_result_count:${results.length}`);
  assert(
    results.every((result) => result.status === "PASS"),
    "wp2b_foundation_proof_failed",
  );
  console.log("app-case-party-role-foundation-proof-ok");
}

await main();
