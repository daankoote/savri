const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const MIGRATION_PATH =
  "supabase/migrations/20260728140000_app_location_write_rpcs.sql";
const PROOF_PATH = "scripts/proofs/app-location-write-rpcs.proof.ts";

const PUBLIC_RPCS = [
  "app_create_location_root_v1",
  "app_record_location_observation_v1",
  "app_accept_initial_location_version_v1",
  "app_correct_location_version_v1",
] as const;

const HELPERS = [
  "app_location_write_idempotency_begin_v1",
  "app_location_write_lock_v1",
  "app_location_write_complete_v1",
] as const;

const FOUNDATION_TABLES = [
  "app_locations",
  "app_location_address_observations",
  "app_location_versions",
] as const;

const REQUIRED_WRITE_TABLES = [
  ...FOUNDATION_TABLES,
  "app_audit_events",
  "app_idempotency_keys",
] as const;

const WP3J_FUNCTION_SIGNATURES = [
  "public.app_create_location_root_v1(text,text,text,text,text,text,timestamp with time zone)",
  "public.app_record_location_observation_v1(uuid,text,text,timestamp with time zone,text,text,timestamp with time zone,timestamp with time zone,text,text,integer,text,text,text,text,text,text,text,text,text,timestamp with time zone)",
  "public.app_accept_initial_location_version_v1(uuid,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,text,text,text,timestamp with time zone)",
  "public.app_correct_location_version_v1(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,text,text,text,text,timestamp with time zone)",
  "public.app_location_write_idempotency_begin_v1(text,text,text,timestamp with time zone,text,text,text)",
  "public.app_location_write_lock_v1(text)",
  "public.app_location_write_complete_v1(text,text,text,uuid,text,text,text,jsonb,jsonb)",
] as const;

const EXPECTED_MIGRATION_SHA256 =
  "171490e672a500d303ca097b8aececda8da7f98ae2411cc5e13cd1cb43a48593";

const PROTECTED_UNTRACKED = [
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

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const EXPIRES = "2099-01-01T00:00:00Z";
const ACTOR_TYPE = "system";
const ACTOR_REF = "wp3j-proof-actor";

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type JsonResponse = {
  ok?: boolean;
  status?: number;
  code?: string;
  location_id?: string;
  observation_id?: string;
  version_id?: string;
  acceptance_decision_ref?: string;
};

class ProofFailure extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ProofFailure(message);
}

function pass(number: number): void {
  console.log(`WP3J-Q${String(number).padStart(2, "0")}: PASS`);
}

function scrub(value: string): string {
  const scrubbed = value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/enval_wp3j_proof_[a-z0-9_]+/gi, "<proof-database>")
    .replace(/(password|token|secret)=\S+/gi, "$1=<redacted>");
  const lines = scrubbed.split("\n");
  const failures = lines.filter((line) =>
    /\b(?:ERROR|FATAL|DETAIL|CONTEXT):/i.test(line)
  );
  return (failures.length > 0 ? failures.slice(-3) : lines.slice(0, 3))
    .join(" | ");
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

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlNullableText(value: string | null): string {
  return value === null ? "null" : sqlText(value);
}

function sqlNullableTime(value: string | null): string {
  return value === null ? "null" : `${sqlText(value)}::timestamptz`;
}

function sqlUuid(value: string): string {
  return `${sqlText(value)}::uuid`;
}

function parseResponse(raw: string): JsonResponse {
  try {
    return JSON.parse(raw) as JsonResponse;
  } catch {
    throw new ProofFailure("invalid_json_response");
  }
}

async function call(
  database: string,
  statement: string,
): Promise<JsonResponse> {
  return parseResponse(await psql(database, statement));
}

function rootCall(
  key: string,
  hash = HASH_A,
  basis = "customer_declaration",
  request = `request-${key}`,
): string {
  return `
    select public.app_create_location_root_v1(
      ${sqlText(basis)},
      ${sqlText(ACTOR_TYPE)},
      ${sqlText(ACTOR_REF)},
      ${sqlText(request)},
      ${sqlText(key)},
      ${sqlText(hash)},
      ${sqlText(EXPIRES)}::timestamptz
    )::text;
  `;
}

type ObservationCall = {
  locationId: string;
  key: string;
  hash?: string;
  request?: string;
  kind?: string;
  descriptor?: "site_reference" | "postal_address";
  site?: string | null;
  country?: string;
  postalCode?: string | null;
  houseNumber?: number | null;
  street?: string | null;
  city?: string | null;
  payloadHash?: string | null;
  retrievedAt?: string | null;
  freshUntil?: string | null;
};

function observationCall(options: ObservationCall): string {
  const descriptor = options.descriptor ?? "site_reference";
  const postal = descriptor === "postal_address";
  const number = options.houseNumber === undefined
    ? (postal ? 1 : null)
    : options.houseNumber;
  return `
    select public.app_record_location_observation_v1(
      ${sqlUuid(options.locationId)},
      ${sqlText(options.kind ?? "manual_observed")},
      ${sqlText(descriptor)},
      '2026-01-01T00:00:00Z'::timestamptz,
      null,
      ${sqlNullableText(options.payloadHash ?? null)},
      ${sqlNullableTime(options.retrievedAt ?? null)},
      ${sqlNullableTime(options.freshUntil ?? null)},
      ${sqlText(options.country ?? "NL")},
      ${sqlNullableText(options.postalCode ?? (postal ? "1234AB" : null))},
      ${number === null ? "null" : String(number)},
      null,
      ${sqlNullableText(options.street ?? (postal ? "Proofstraat" : null))},
      ${sqlNullableText(options.city ?? (postal ? "Proefstad" : null))},
      ${
    sqlNullableText(
      options.site === undefined ? "wp3j-proof-site" : options.site,
    )
  },
      ${sqlText(ACTOR_TYPE)},
      ${sqlText(ACTOR_REF)},
      ${sqlText(options.request ?? `request-${options.key}`)},
      ${sqlText(options.key)},
      ${sqlText(options.hash ?? HASH_A)},
      ${sqlText(EXPIRES)}::timestamptz
    )::text;
  `;
}

type AcceptanceCall = {
  locationId: string;
  observationId: string;
  key: string;
  decisionRef: string;
  hash?: string;
  validFrom?: string;
  validTo?: string | null;
  request?: string;
};

function acceptanceCall(options: AcceptanceCall): string {
  return `
    select public.app_accept_initial_location_version_v1(
      ${sqlUuid(options.locationId)},
      ${sqlUuid(options.observationId)},
      ${sqlText(options.validFrom ?? "2026-01-01T00:00:00Z")}::timestamptz,
      ${sqlNullableTime(options.validTo ?? null)},
      '2026-07-01T00:00:00Z'::timestamptz,
      ${sqlText(options.decisionRef)},
      ${sqlText(ACTOR_TYPE)},
      ${sqlText(ACTOR_REF)},
      ${sqlText(options.request ?? `request-${options.key}`)},
      ${sqlText(options.key)},
      ${sqlText(options.hash ?? HASH_A)},
      ${sqlText(EXPIRES)}::timestamptz
    )::text;
  `;
}

type CorrectionCall = {
  locationId: string;
  observationId: string;
  predecessorId: string;
  key: string;
  decisionRef: string;
  reason: string;
  hash?: string;
  validFrom?: string;
  validTo?: string | null;
  request?: string;
};

function correctionCall(options: CorrectionCall): string {
  return `
    select public.app_correct_location_version_v1(
      ${sqlUuid(options.locationId)},
      ${sqlUuid(options.observationId)},
      ${sqlUuid(options.predecessorId)},
      ${sqlText(options.validFrom ?? "2026-01-01T00:00:00Z")}::timestamptz,
      ${sqlNullableTime(options.validTo ?? null)},
      '2026-07-01T00:00:00Z'::timestamptz,
      ${sqlText(options.decisionRef)},
      ${sqlText(options.reason)},
      ${sqlText(ACTOR_TYPE)},
      ${sqlText(ACTOR_REF)},
      ${sqlText(options.request ?? `request-${options.key}`)},
      ${sqlText(options.key)},
      ${sqlText(options.hash ?? HASH_A)},
      ${sqlText(EXPIRES)}::timestamptz
    )::text;
  `;
}

async function createRoot(database: string, key: string): Promise<string> {
  const response = await call(database, rootCall(key));
  assert(response.ok === true && response.location_id, "root_fixture_failed");
  return response.location_id;
}

async function createObservation(
  database: string,
  locationId: string,
  key: string,
): Promise<string> {
  const response = await call(
    database,
    observationCall({ locationId, key }),
  );
  assert(
    response.ok === true && response.observation_id,
    "observation_fixture_failed",
  );
  return response.observation_id;
}

async function acceptInitial(
  database: string,
  locationId: string,
  observationId: string,
  key: string,
  decisionRef: string,
  validTo: string | null = null,
): Promise<string> {
  const response = await call(
    database,
    acceptanceCall({
      locationId,
      observationId,
      key,
      decisionRef,
      validTo,
    }),
  );
  assert(
    response.ok === true && response.version_id,
    "acceptance_fixture_failed",
  );
  return response.version_id;
}

async function sha256File(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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

async function protectedHashes(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const path of PROTECTED_UNTRACKED) {
    result.set(path, await sha256File(path));
  }
  return result;
}

async function migrationFunctionBodyHashes(
  migration: string,
): Promise<Map<string, string>> {
  const targetNames = new Set<string>([...PUBLIC_RPCS, ...HELPERS]);
  const hashes = new Map<string, string>();
  const functionPattern =
    /create function public\.([a-z0-9_]+)\([\s\S]*?\)\nreturns (?:jsonb|void)\nlanguage plpgsql\n(?:security definer\n)?set search_path = ''\nas \$\$\n([\s\S]*?)\n\$\$;/g;

  for (const match of migration.matchAll(functionPattern)) {
    const [, name, body] = match;
    if (targetNames.has(name)) {
      hashes.set(name, await sha256Text(body.trim()));
    }
  }

  assert(hashes.size === 7, "migration_function_source_inventory_mismatch");
  for (const name of targetNames) {
    assert(hashes.has(name), "migration_function_source_missing");
  }
  return hashes;
}

function mapsEqual<K, V>(left: Map<K, V>, right: Map<K, V>): boolean {
  return left.size === right.size &&
    [...left].every(([key, value]) => right.get(key) === value);
}

async function mainCounts(): Promise<Map<string, number>> {
  const raw = await readOnlyMain(`
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
      and (
        table_name like 'app\\_%' escape '\\'
        or table_name like 'evidence\\_%' escape '\\'
      )
    order by table_name;
  `);
  const result = new Map<string, number>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [name, count] = line.split("|");
    result.set(name, Number(count));
  }
  return result;
}

async function wp3jFunctionCount(database: string): Promise<string> {
  return await psql(
    database,
    `
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'app_create_location_root_v1',
        'app_record_location_observation_v1',
        'app_accept_initial_location_version_v1',
        'app_correct_location_version_v1',
        'app_location_write_idempotency_begin_v1',
        'app_location_write_lock_v1',
        'app_location_write_complete_v1'
      ]);
  `,
  );
}

async function publicTableInventory(database: string): Promise<string> {
  return await psql(
    database,
    `
    select pg_catalog.string_agg(table_name, ',' order by table_name)
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE';
  `,
  );
}

async function foundationSchemaHash(database: string): Promise<string> {
  const schema = await mustCommand("docker", [
    "exec",
    CONTAINER,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    database,
    "--schema-only",
    "--no-owner",
    "--no-privileges",
    "--table=public.app_locations",
    "--table=public.app_location_address_observations",
    "--table=public.app_location_versions",
  ]);
  const stableSchema = schema
    .split("\n")
    .filter((line) => !/^\\(?:un)?restrict\b/.test(line))
    .join("\n")
    .trim();
  return await sha256Text(stableSchema);
}

async function catalogFunctionBodyHashes(
  database: string,
): Promise<Map<string, string>> {
  const raw = await psql(
    database,
    `
    select p.proname || '|' ||
      pg_catalog.encode(
        extensions.digest(
          pg_catalog.btrim(p.prosrc, E' \\n\\r\\t'),
          'sha256'
        ),
        'hex'
      )
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'app_create_location_root_v1',
        'app_record_location_observation_v1',
        'app_accept_initial_location_version_v1',
        'app_correct_location_version_v1',
        'app_location_write_idempotency_begin_v1',
        'app_location_write_lock_v1',
        'app_location_write_complete_v1'
      ])
    order by p.proname;
  `,
  );
  const hashes = new Map<string, string>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [name, hash] = line.split("|");
    hashes.set(name, hash);
  }
  return hashes;
}

async function applyFreshMigration(
  database: string,
  migration: string,
): Promise<void> {
  const result = await processOutput("docker", [
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

  if (result.code !== 0) {
    const lineMatch = result.stderr.match(/:<stdin>:(\d+):/);
    const lineNumber = lineMatch ? Number(lineMatch[1]) : 0;
    const statement = lineNumber > 0
      ? migration.split("\n")[lineNumber - 1]?.trim()
      : "statement_unknown";
    throw new ProofFailure(
      `fresh_apply_failed_at_line_${lineNumber}:${scrub(statement)}:${
        scrub(result.stderr || "psql_failed")
      }`,
    );
  }
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

  try {
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
    // postgres is intentionally not a cluster superuser/extension owner in the
    // local stack. Preserve public ACLs (including all WP3J RPC ACLs), but omit
    // unrelated non-public extension ACLs and default-privilege restoration.
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

    assert(
      await wp3jFunctionCount(database) === "7",
      "schema_copy_wp3j_function_inventory_mismatch",
    );
    assert(
      await psql(
        database,
        `
        select count(*)
        from information_schema.tables
        where table_schema = 'public'
          and table_type = 'BASE TABLE'
          and table_name = any(array[
            'app_locations',
            'app_location_address_observations',
            'app_location_versions',
            'app_audit_events',
            'app_idempotency_keys'
          ]);
      `,
      ) === String(REQUIRED_WRITE_TABLES.length),
      "fresh_schema_required_table_missing",
    );
    assert(
      await psql(
        database,
        `
        select
          (select count(*) from public.app_locations) || '|' ||
          (select count(*) from public.app_location_address_observations) ||
          '|' ||
          (select count(*) from public.app_location_versions) || '|' ||
          (select count(*) from public.app_audit_events) || '|' ||
          (select count(*) from public.app_idempotency_keys);
      `,
      ) === "0|0|0|0|0",
      "schema_copy_contained_business_data",
    );

    const tablesBefore = await publicTableInventory(database);
    const foundationBefore = await foundationSchemaHash(database);

    await psql(
      database,
      WP3J_FUNCTION_SIGNATURES
        .map((signature) => `drop function ${signature};`)
        .join("\n"),
    );
    assert(
      await wp3jFunctionCount(database) === "0",
      "wp3j_functions_remain_before_fresh_apply",
    );

    const migration = await Deno.readTextFile(MIGRATION_PATH);
    assert(
      await sha256Text(migration) === EXPECTED_MIGRATION_SHA256,
      "fresh_apply_migration_hash_mismatch",
    );
    const expectedFunctionHashes = await migrationFunctionBodyHashes(migration);

    await applyFreshMigration(database, migration);

    assert(
      await wp3jFunctionCount(database) === "7",
      "fresh_apply_function_inventory_mismatch",
    );
    const actualFunctionHashes = await catalogFunctionBodyHashes(database);
    assert(
      mapsEqual(expectedFunctionHashes, actualFunctionHashes),
      "fresh_apply_function_source_mismatch",
    );
    assert(
      await publicTableInventory(database) === tablesBefore,
      "fresh_apply_table_inventory_changed",
    );
    assert(
      await foundationSchemaHash(database) === foundationBefore,
      "fresh_apply_foundation_schema_changed",
    );
    assert(
      await psql(
        database,
        `
        select
          (select count(*) from public.app_locations) || '|' ||
          (select count(*) from public.app_location_address_observations) ||
          '|' ||
          (select count(*) from public.app_location_versions) || '|' ||
          (select count(*) from public.app_audit_events) || '|' ||
          (select count(*) from public.app_idempotency_keys);
      `,
      ) === "0|0|0|0|0",
      "fresh_apply_wrote_business_data",
    );
    assert(
      await sha256File(MIGRATION_PATH) === EXPECTED_MIGRATION_SHA256,
      "migration_changed_during_fresh_apply",
    );
    for (const signature of WP3J_FUNCTION_SIGNATURES) {
      assert(
        await psql(
          database,
          `select pg_catalog.to_regprocedure(${
            sqlText(signature)
          }) is not null;`,
        ) === "t",
        "fresh_apply_exact_signature_missing",
      );
    }
  } catch (error) {
    try {
      await dropProofDatabase(database);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "proof_database_create_and_cleanup_failed",
      );
    }
    throw error;
  }
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

async function proveCatalog(database: string): Promise<void> {
  const rpcNames = await psql(
    database,
    `
    select pg_catalog.string_agg(p.proname, ',' order by p.proname)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'app_create_location_root_v1',
        'app_record_location_observation_v1',
        'app_accept_initial_location_version_v1',
        'app_correct_location_version_v1'
      ]);
  `,
  );
  assert(
    rpcNames === [...PUBLIC_RPCS].sort().join(","),
    "public_rpc_inventory_mismatch",
  );
  pass(1);

  const migration = await Deno.readTextFile(MIGRATION_PATH);
  assert(!/\bcreate\s+table\b/i.test(migration), "migration_created_table");
  assert(
    !/\b(?:alter|drop|truncate|rename)\s+table\b/i.test(migration),
    "migration_changed_table",
  );
  pass(2);

  assert(
    await psql(
      database,
      `
      select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any(array[
          'app_create_location_root_v1',
          'app_record_location_observation_v1',
          'app_accept_initial_location_version_v1',
          'app_correct_location_version_v1'
        ])
        and p.prosecdef
        and p.proconfig = array['search_path=""'];
    `,
    ) === "4",
    "rpc_security_configuration_mismatch",
  );
  pass(3);

  for (const rpc of PUBLIC_RPCS) {
    assert(
      await psql(
        database,
        `
        select pg_catalog.has_function_privilege(
          'service_role',
          p.oid,
          'EXECUTE'
        )
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = ${sqlText(rpc)};
      `,
      ) === "t",
      "service_role_execute_missing",
    );
  }
  pass(4);

  for (const rpc of PUBLIC_RPCS) {
    assert(
      await psql(
        database,
        `
        select count(*)
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            p.proacl,
            pg_catalog.acldefault('f', p.proowner)
          )
        ) acl
        where n.nspname = 'public'
          and p.proname = ${sqlText(rpc)}
          and acl.grantee = 0
          and acl.privilege_type = 'EXECUTE';
      `,
      ) === "0",
      "public_execute_present",
    );
    for (const role of ["anon", "authenticated"]) {
      assert(
        await psql(
          database,
          `
          select pg_catalog.has_function_privilege(
            ${sqlText(role)},
            p.oid,
            'EXECUTE'
          )
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = ${sqlText(rpc)};
        `,
        ) === "f",
        "browser_execute_present",
      );
    }
  }
  pass(5);

  assert(
    await psql(
      database,
      `
      select count(*)
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = any(array[
          'app_location_write_idempotency_begin_v1',
          'app_location_write_lock_v1',
          'app_location_write_complete_v1'
        ]);
    `,
    ) === "3",
    "helper_inventory_mismatch",
  );
  for (const helper of HELPERS) {
    assert(
      await psql(
        database,
        `
        select count(*)
        from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            p.proacl,
            pg_catalog.acldefault('f', p.proowner)
          )
        ) acl
        where n.nspname = 'public'
          and p.proname = ${sqlText(helper)}
          and acl.grantee = 0
          and acl.privilege_type = 'EXECUTE';
      `,
      ) === "0",
      "helper_public_execute_present",
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert(
        await psql(
          database,
          `
          select pg_catalog.has_function_privilege(
            ${sqlText(role)},
            p.oid,
            'EXECUTE'
          )
          from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = ${sqlText(helper)};
        `,
        ) === "f",
        "helper_execute_too_broad",
      );
    }
  }
  pass(6);

  assert(
    await psql(
      database,
      `
      select count(*)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any(array[
          'app_locations',
          'app_location_address_observations',
          'app_location_versions'
        ])
        and c.relrowsecurity;
    `,
    ) === "3",
    "foundation_rls_changed",
  );
  assert(
    await psql(
      database,
      `
      select count(*)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = any(array[
          'app_locations',
          'app_location_address_observations',
          'app_location_versions'
        ])
        and grantee = 'service_role'
        and privilege_type in ('SELECT', 'INSERT');
    `,
    ) === "6",
    "foundation_grants_changed",
  );
  assert(
    await psql(
      database,
      `
      select count(*)
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = any(array[
          'app_locations',
          'app_location_address_observations',
          'app_location_versions'
        ])
        and (
          grantee in ('PUBLIC', 'anon', 'authenticated')
          or (
            grantee = 'service_role'
            and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
          )
        );
    `,
    ) === "0",
    "foundation_grants_broadened",
  );
  pass(7);
}

async function proveSequentialBehavior(database: string): Promise<void> {
  const rootKey = "q08-root";
  const rootResponse = await call(database, rootCall(rootKey));
  assert(
    rootResponse.ok === true && rootResponse.location_id,
    "root_success_failed",
  );
  const locationA = rootResponse.location_id;
  assert(
    await psql(
      database,
      `
      select
        (select count(*) from public.app_locations where id = ${
        sqlUuid(locationA)
      })
        || '|' ||
        (select count(*) from public.app_audit_events
          where idempotency_key = ${sqlText(rootKey)}
            and event_type = 'location_root_created')
        || '|' ||
        (select count(*) from public.app_idempotency_keys
          where key = ${sqlText(rootKey)}
            and response_status = 201
            and response_body is not null);
    `,
    ) === "1|1|1",
    "root_atomic_write_mismatch",
  );
  pass(8);

  const rootReplay = await call(database, rootCall(rootKey));
  assert(
    JSON.stringify(rootReplay) === JSON.stringify(rootResponse),
    "root_replay_changed",
  );
  assert(
    await psql(
          database,
          `
      select count(*) from public.app_locations
      where id = ${sqlUuid(locationA)};
    `,
        ) === "1" &&
      await psql(
          database,
          `
        select count(*) from public.app_audit_events
        where idempotency_key = ${sqlText(rootKey)};
      `,
        ) === "1",
    "root_replay_added_rows",
  );
  pass(9);

  const rootConflict = await call(database, rootCall(rootKey, HASH_B));
  assert(rootConflict.code === "idempotency_conflict", "root_conflict_missing");
  pass(10);

  const rootColumns = await psql(
    database,
    `
    select pg_catalog.string_agg(column_name, ',' order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'app_locations';
  `,
  );
  assert(
    rootColumns ===
      "id,created_at,created_by_actor_ref,created_from_request_id,creation_basis",
    "root_forbidden_field_present",
  );
  pass(11);

  assert(
    await psql(
      database,
      `
      select count(*)
      from public.app_audit_events
      where idempotency_key = ${sqlText(rootKey)}
        and (
          event_data ?| array[
            'address', 'postal_code', 'street', 'city', 'email', 'phone',
            'payload', 'provider_id', 'storage_path', 'secret'
          ]
          or event_data::text ~* '(postal|street|city|email|phone|storage|secret)'
        );
    `,
    ) === "0",
    "root_audit_not_minimal",
  );
  pass(12);

  const observationKey = "q13-observation";
  const observationResponse = await call(
    database,
    observationCall({ locationId: locationA, key: observationKey }),
  );
  assert(
    observationResponse.ok === true && observationResponse.observation_id,
    "observation_success_failed",
  );
  const observationA = observationResponse.observation_id;
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_address_observations
      where id = ${sqlUuid(observationA)};
    `,
    ) === "1",
    "observation_count_mismatch",
  );
  pass(13);

  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where accepted_from_observation_id = ${sqlUuid(observationA)};
    `,
    ) === "0",
    "observation_auto_accepted",
  );
  pass(14);

  const observationReplay = await call(
    database,
    observationCall({ locationId: locationA, key: observationKey }),
  );
  assert(
    JSON.stringify(observationReplay) === JSON.stringify(observationResponse),
    "observation_replay_changed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_address_observations
      where id = ${sqlUuid(observationA)};
    `,
    ) === "1",
    "observation_replay_added_row",
  );
  pass(15);

  const observationConflict = await call(
    database,
    observationCall({
      locationId: locationA,
      key: observationKey,
      hash: HASH_B,
    }),
  );
  assert(
    observationConflict.code === "idempotency_conflict",
    "observation_conflict_missing",
  );
  pass(16);

  const missingLocation = "10000000-0000-4000-8000-000000000017";
  const missingKey = "q17-missing-location";
  const missingResponse = await call(
    database,
    observationCall({ locationId: missingLocation, key: missingKey }),
  );
  assert(
    missingResponse.code === "location_not_found",
    "missing_location_wrong",
  );
  assert(
    await psql(
      database,
      `
      select
        (select count(*) from public.app_audit_events
          where idempotency_key = ${sqlText(missingKey)}
            and event_type = 'location_observation_record_rejected')
        || '|' ||
        (select count(*) from public.app_idempotency_keys
          where key = ${sqlText(missingKey)}
            and response_status = 404);
    `,
    ) === "1|1",
    "missing_location_reject_not_atomic",
  );
  pass(17);

  const invalidKey = "q18-invalid-descriptor";
  const observationsBeforeInvalid = Number(
    await psql(
      database,
      "select count(*) from public.app_location_address_observations;",
    ),
  );
  const invalidObservation = await call(
    database,
    observationCall({
      locationId: locationA,
      key: invalidKey,
      descriptor: "site_reference",
      site: null,
    }),
  );
  assert(
    invalidObservation.code === "invalid_input",
    "invalid_descriptor_wrong",
  );
  assert(
    Number(
      await psql(
        database,
        "select count(*) from public.app_location_address_observations;",
      ),
    ) === observationsBeforeInvalid,
    "invalid_descriptor_left_row",
  );
  pass(18);

  const acceptanceKey = "q19-acceptance";
  const acceptanceResponse = await call(
    database,
    acceptanceCall({
      locationId: locationA,
      observationId: observationA,
      key: acceptanceKey,
      decisionRef: "decision-q19",
      validTo: "2027-01-01T00:00:00Z",
    }),
  );
  assert(
    acceptanceResponse.ok === true && acceptanceResponse.version_id,
    "initial_acceptance_failed",
  );
  const versionA = acceptanceResponse.version_id;
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where id = ${sqlUuid(versionA)}
        and supersedes_version_id is null;
    `,
    ) === "1",
    "initial_version_shape_mismatch",
  );
  pass(19);

  const acceptanceReplay = await call(
    database,
    acceptanceCall({
      locationId: locationA,
      observationId: observationA,
      key: acceptanceKey,
      decisionRef: "decision-q19",
      validTo: "2027-01-01T00:00:00Z",
    }),
  );
  assert(
    JSON.stringify(acceptanceReplay) === JSON.stringify(acceptanceResponse),
    "acceptance_replay_changed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where accepted_from_observation_id = ${sqlUuid(observationA)};
    `,
    ) === "1",
    "acceptance_replay_added_version",
  );
  pass(20);

  const locationB = await createRoot(database, "q21-root-b");
  const observationB = await createObservation(
    database,
    locationB,
    "q21-observation-b",
  );
  const crossObservation = await call(
    database,
    acceptanceCall({
      locationId: locationA,
      observationId: observationB,
      key: "q21-cross-observation",
      decisionRef: "decision-q21",
    }),
  );
  assert(
    crossObservation.code === "observation_location_mismatch",
    "cross_root_observation_accepted",
  );
  pass(21);

  const observationAgain = await call(
    database,
    acceptanceCall({
      locationId: locationA,
      observationId: observationA,
      key: "q22-observation-again",
      decisionRef: "decision-q22",
    }),
  );
  assert(
    observationAgain.code === "observation_already_accepted",
    "observation_reaccepted",
  );
  pass(22);

  const decisionConflict = await call(
    database,
    acceptanceCall({
      locationId: locationB,
      observationId: observationB,
      key: "q23-decision-conflict",
      decisionRef: "decision-q19",
    }),
  );
  assert(decisionConflict.code === "decision_ref_conflict", "decision_reused");
  pass(23);

  assert(
    await psql(
      database,
      `
      select count(*)
      from public.app_audit_events
      where idempotency_key = ${sqlText(acceptanceKey)}
        and (
          event_data ?| array[
            'address', 'postal_code', 'street', 'city', 'email', 'phone',
            'payload', 'provider_id', 'storage_path', 'secret',
            'correction_reason'
          ]
          or event_data::text ~* '(postal|street|city|email|phone|storage|secret)'
        );
    `,
    ) === "0",
    "acceptance_audit_not_minimal",
  );
  pass(24);

  const correctionObservation = await createObservation(
    database,
    locationA,
    "q25-correction-observation",
  );
  const predecessorBefore = await psql(
    database,
    `
    select pg_catalog.md5(pg_catalog.row_to_json(v)::text)
    from public.app_location_versions v
    where id = ${sqlUuid(versionA)};
  `,
  );
  const correctionKey = "q25-correction";
  const correctionResponse = await call(
    database,
    correctionCall({
      locationId: locationA,
      observationId: correctionObservation,
      predecessorId: versionA,
      key: correctionKey,
      decisionRef: "decision-q25",
      reason: "synthetic correction",
      validFrom: "2027-01-01T00:00:00Z",
    }),
  );
  assert(
    correctionResponse.ok === true && correctionResponse.version_id,
    "correction_failed",
  );
  const versionB = correctionResponse.version_id;
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where id = ${sqlUuid(versionB)}
        and supersedes_version_id = ${sqlUuid(versionA)};
    `,
    ) === "1",
    "successor_shape_mismatch",
  );
  pass(25);

  const predecessorAfter = await psql(
    database,
    `
    select pg_catalog.md5(pg_catalog.row_to_json(v)::text)
    from public.app_location_versions v
    where id = ${sqlUuid(versionA)};
  `,
  );
  assert(predecessorAfter === predecessorBefore, "predecessor_mutated");
  pass(26);

  const correctionReplay = await call(
    database,
    correctionCall({
      locationId: locationA,
      observationId: correctionObservation,
      predecessorId: versionA,
      key: correctionKey,
      decisionRef: "decision-q25",
      reason: "synthetic correction",
      validFrom: "2027-01-01T00:00:00Z",
    }),
  );
  assert(
    JSON.stringify(correctionReplay) === JSON.stringify(correctionResponse),
    "correction_replay_changed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where supersedes_version_id = ${sqlUuid(versionA)};
    `,
    ) === "1",
    "correction_replay_added_successor",
  );
  pass(27);

  const observationB2 = await createObservation(
    database,
    locationB,
    "q28-observation",
  );
  const crossPredecessor = await call(
    database,
    correctionCall({
      locationId: locationB,
      observationId: observationB2,
      predecessorId: versionB,
      key: "q28-cross-predecessor",
      decisionRef: "decision-q28",
      reason: "synthetic correction",
    }),
  );
  assert(
    crossPredecessor.code === "version_location_mismatch",
    "cross_root_predecessor_accepted",
  );
  pass(28);

  const secondSuccessorObservation = await createObservation(
    database,
    locationA,
    "q29-observation",
  );
  const secondSuccessor = await call(
    database,
    correctionCall({
      locationId: locationA,
      observationId: secondSuccessorObservation,
      predecessorId: versionA,
      key: "q29-second-successor",
      decisionRef: "decision-q29",
      reason: "synthetic correction",
    }),
  );
  assert(
    secondSuccessor.code === "version_already_superseded",
    "second_successor_accepted",
  );
  pass(29);

  const missingReasonObservation = await createObservation(
    database,
    locationA,
    "q30-observation",
  );
  const missingReason = await call(
    database,
    correctionCall({
      locationId: locationA,
      observationId: missingReasonObservation,
      predecessorId: versionB,
      key: "q30-missing-reason",
      decisionRef: "decision-q30",
      reason: "",
    }),
  );
  assert(missingReason.code === "invalid_input", "missing_reason_accepted");
  pass(30);

  const temporalRoot = await createRoot(database, "q31-root");
  const temporalObservationA = await createObservation(
    database,
    temporalRoot,
    "q31-observation-a",
  );
  const temporalVersionA = await acceptInitial(
    database,
    temporalRoot,
    temporalObservationA,
    "q31-initial",
    "decision-q31-initial",
    "2027-01-01T00:00:00Z",
  );
  const temporalObservationB = await createObservation(
    database,
    temporalRoot,
    "q31-observation-b",
  );
  await psql(
    database,
    `
    insert into public.app_location_versions (
      location_id, accepted_from_observation_id, valid_from, valid_to,
      recorded_at, accepted_at, accepted_by_actor_ref,
      accepted_from_request_id, acceptance_decision_ref, descriptor_kind,
      country_code, postal_code, house_number, house_number_addition,
      street, city, site_reference, supersedes_version_id, correction_reason
    )
    select
      ${sqlUuid(temporalRoot)}, id,
      '2028-01-01T00:00:00Z'::timestamptz,
      '2029-01-01T00:00:00Z'::timestamptz,
      pg_catalog.clock_timestamp(),
      '2026-07-01T00:00:00Z'::timestamptz,
      ${sqlText(ACTOR_REF)}, 'q31-direct', 'decision-q31-direct',
      descriptor_kind, country_code, postal_code, house_number,
      house_number_addition, street, city, site_reference, null, null
    from public.app_location_address_observations
    where id = ${sqlUuid(temporalObservationB)};
  `,
  );
  const overlapObservation = await createObservation(
    database,
    temporalRoot,
    "q31-overlap-observation",
  );
  const overlap = await call(
    database,
    correctionCall({
      locationId: temporalRoot,
      observationId: overlapObservation,
      predecessorId: temporalVersionA,
      key: "q31-overlap",
      decisionRef: "decision-q31-overlap",
      reason: "synthetic correction",
      validFrom: "2028-06-01T00:00:00Z",
      validTo: "2028-07-01T00:00:00Z",
    }),
  );
  assert(overlap.code === "temporal_conflict", "overlap_accepted");
  pass(31);

  const touchingObservation = await createObservation(
    database,
    temporalRoot,
    "q32-touching-observation",
  );
  const touching = await call(
    database,
    correctionCall({
      locationId: temporalRoot,
      observationId: touchingObservation,
      predecessorId: temporalVersionA,
      key: "q32-touching",
      decisionRef: "decision-q32-touching",
      reason: "synthetic correction",
      validFrom: "2029-01-01T00:00:00Z",
      validTo: "2030-01-01T00:00:00Z",
    }),
  );
  assert(touching.ok === true, "touching_rejected");
  pass(32);

  await psql(
    database,
    `
    create function public.wp3j_unexpected_failure()
    returns trigger language plpgsql set search_path = '' as $$
    begin
      raise exception 'wp3j unexpected failure';
    end;
    $$;
    create trigger wp3j_unexpected_failure_trigger
    after insert on public.app_locations
    for each row execute function public.wp3j_unexpected_failure();
  `,
  );
  const unexpectedKey = "q33-unexpected";
  const unexpected = await psqlResult(database, rootCall(unexpectedKey));
  assert(unexpected.code !== 0, "unexpected_error_was_committed");
  await psql(
    database,
    `
    drop trigger wp3j_unexpected_failure_trigger on public.app_locations;
    drop function public.wp3j_unexpected_failure();
  `,
  );
  assert(
    await psql(
      database,
      `
      select
        (select count(*) from public.app_idempotency_keys
          where key = ${sqlText(unexpectedKey)})
        || '|' ||
        (select count(*) from public.app_audit_events
          where idempotency_key = ${sqlText(unexpectedKey)});
    `,
    ) === "0|0",
    "unexpected_error_left_residue",
  );
  pass(33);

  const missingReplay = await call(
    database,
    observationCall({ locationId: missingLocation, key: missingKey }),
  );
  assert(
    JSON.stringify(missingReplay) === JSON.stringify(missingResponse),
    "controlled_reject_replay_changed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_audit_events
      where idempotency_key = ${sqlText(missingKey)};
    `,
    ) === "1",
    "controlled_reject_replay_added_audit",
  );
  pass(34);
}

async function proveConcurrency(database: string): Promise<void> {
  const sameKey = "q35-concurrent-same";
  const [sameA, sameB] = await Promise.all([
    psqlResult(database, rootCall(sameKey, HASH_A, "source_observation")),
    psqlResult(database, rootCall(sameKey, HASH_A, "source_observation")),
  ]);
  assert(sameA.code === 0 && sameB.code === 0, "same_key_process_failed");
  const sameResponseA = parseResponse(sameA.stdout);
  const sameResponseB = parseResponse(sameB.stdout);
  assert(
    sameResponseA.ok === true &&
      JSON.stringify(sameResponseA) === JSON.stringify(sameResponseB),
    "same_key_concurrency_inconsistent",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_locations
      where id = ${sqlUuid(sameResponseA.location_id!)};
    `,
    ) === "1",
    "same_key_created_multiple_roots",
  );
  pass(35);

  const differentKey = "q36-concurrent-different";
  const [differentA, differentB] = await Promise.all([
    psqlResult(
      database,
      rootCall(differentKey, HASH_A, "customer_declaration"),
    ),
    psqlResult(database, rootCall(differentKey, HASH_B, "source_observation")),
  ]);
  assert(
    differentA.code === 0 && differentB.code === 0,
    "different_payload_process_failed",
  );
  const differentResponses = [
    parseResponse(differentA.stdout),
    parseResponse(differentB.stdout),
  ];
  assert(
    differentResponses.filter((response) => response.ok === true).length ===
        1 &&
      differentResponses.filter((response) =>
          response.code === "idempotency_conflict"
        ).length === 1,
    "different_payload_concurrency_wrong",
  );
  pass(36);

  const acceptRoot = await createRoot(database, "q37-root");
  const acceptObservation = await createObservation(
    database,
    acceptRoot,
    "q37-observation",
  );
  const [acceptA, acceptB] = await Promise.all([
    psqlResult(
      database,
      acceptanceCall({
        locationId: acceptRoot,
        observationId: acceptObservation,
        key: "q37-accept-a",
        decisionRef: "decision-q37-a",
      }),
    ),
    psqlResult(
      database,
      acceptanceCall({
        locationId: acceptRoot,
        observationId: acceptObservation,
        key: "q37-accept-b",
        decisionRef: "decision-q37-b",
      }),
    ),
  ]);
  assert(
    acceptA.code === 0 && acceptB.code === 0,
    "accept_race_process_failed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where accepted_from_observation_id = ${sqlUuid(acceptObservation)};
    `,
    ) === "1",
    "accept_race_created_multiple_versions",
  );
  pass(37);

  const decisionRootA = await createRoot(database, "q38-root-a");
  const decisionRootB = await createRoot(database, "q38-root-b");
  const decisionObservationA = await createObservation(
    database,
    decisionRootA,
    "q38-observation-a",
  );
  const decisionObservationB = await createObservation(
    database,
    decisionRootB,
    "q38-observation-b",
  );
  const sharedDecision = "decision-q38-shared";
  const [decisionA, decisionB] = await Promise.all([
    psqlResult(
      database,
      acceptanceCall({
        locationId: decisionRootA,
        observationId: decisionObservationA,
        key: "q38-accept-a",
        decisionRef: sharedDecision,
      }),
    ),
    psqlResult(
      database,
      acceptanceCall({
        locationId: decisionRootB,
        observationId: decisionObservationB,
        key: "q38-accept-b",
        decisionRef: sharedDecision,
      }),
    ),
  ]);
  assert(
    decisionA.code === 0 && decisionB.code === 0,
    "decision_race_process_failed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where acceptance_decision_ref = ${sqlText(sharedDecision)};
    `,
    ) === "1",
    "decision_race_created_multiple_versions",
  );
  pass(38);

  const correctionRoot = await createRoot(database, "q39-root");
  const correctionInitialObservation = await createObservation(
    database,
    correctionRoot,
    "q39-initial-observation",
  );
  const correctionPredecessor = await acceptInitial(
    database,
    correctionRoot,
    correctionInitialObservation,
    "q39-initial",
    "decision-q39-initial",
  );
  const correctionObservationA = await createObservation(
    database,
    correctionRoot,
    "q39-observation-a",
  );
  const correctionObservationB = await createObservation(
    database,
    correctionRoot,
    "q39-observation-b",
  );
  const [correctionA, correctionB] = await Promise.all([
    psqlResult(
      database,
      correctionCall({
        locationId: correctionRoot,
        observationId: correctionObservationA,
        predecessorId: correctionPredecessor,
        key: "q39-correction-a",
        decisionRef: "decision-q39-a",
        reason: "synthetic correction",
      }),
    ),
    psqlResult(
      database,
      correctionCall({
        locationId: correctionRoot,
        observationId: correctionObservationB,
        predecessorId: correctionPredecessor,
        key: "q39-correction-b",
        decisionRef: "decision-q39-b",
        reason: "synthetic correction",
      }),
    ),
  ]);
  assert(
    correctionA.code === 0 && correctionB.code === 0,
    "correction_race_process_failed",
  );
  assert(
    await psql(
      database,
      `
      select count(*) from public.app_location_versions
      where supersedes_version_id = ${sqlUuid(correctionPredecessor)};
    `,
    ) === "1",
    "correction_race_created_multiple_successors",
  );
  pass(39);

  const independentRootA = await createRoot(database, "q40-root-a");
  const independentRootB = await createRoot(database, "q40-root-b");
  const independentInitialObservationA = await createObservation(
    database,
    independentRootA,
    "q40-initial-observation-a",
  );
  const independentInitialObservationB = await createObservation(
    database,
    independentRootB,
    "q40-initial-observation-b",
  );
  const independentPredecessorA = await acceptInitial(
    database,
    independentRootA,
    independentInitialObservationA,
    "q40-initial-a",
    "decision-q40-initial-a",
  );
  const independentPredecessorB = await acceptInitial(
    database,
    independentRootB,
    independentInitialObservationB,
    "q40-initial-b",
    "decision-q40-initial-b",
  );
  const independentObservationA = await createObservation(
    database,
    independentRootA,
    "q40-observation-a",
  );
  const independentObservationB = await createObservation(
    database,
    independentRootB,
    "q40-observation-b",
  );
  const [independentA, independentB] = await Promise.all([
    psqlResult(
      database,
      correctionCall({
        locationId: independentRootA,
        observationId: independentObservationA,
        predecessorId: independentPredecessorA,
        key: "q40-correction-a",
        decisionRef: "decision-q40-a",
        reason: "synthetic correction",
      }),
    ),
    psqlResult(
      database,
      correctionCall({
        locationId: independentRootB,
        observationId: independentObservationB,
        predecessorId: independentPredecessorB,
        key: "q40-correction-b",
        decisionRef: "decision-q40-b",
        reason: "synthetic correction",
      }),
    ),
  ]);
  assert(
    independentA.code === 0 &&
      independentB.code === 0 &&
      parseResponse(independentA.stdout).ok === true &&
      parseResponse(independentB.stdout).ok === true,
    "different_root_writes_failed",
  );
  pass(40);

  const lockRoot = await createRoot(database, "q41-root");
  const lockFailure = await psqlResult(
    database,
    `
    begin;
    select public.app_location_write_lock_v1(
      ${sqlText(`location:${lockRoot}`)}
    );
    do $$ begin raise exception 'wp3j lock rollback'; end $$;
    commit;
  `,
  );
  assert(lockFailure.code !== 0, "lock_exception_missing");
  const lockObservation = await psqlResult(
    database,
    `
    set statement_timeout = '2s';
    ${observationCall({ locationId: lockRoot, key: "q41-retry" })}
  `,
  );
  assert(
    lockObservation.code === 0 &&
      parseResponse(lockObservation.stdout).ok === true,
    "lock_not_released",
  );
  pass(41);
}

async function verifyRepoScope(): Promise<void> {
  assert(
    await mustCommand("git", ["diff", "--name-only"]) === "",
    "tracked_worktree_changed",
  );
  assert(
    await mustCommand("git", ["diff", "--cached", "--name-only"]) === "",
    "index_not_empty",
  );
  const untracked = new Set(
    (await mustCommand("git", [
      "ls-files",
      "--others",
      "--exclude-standard",
    ])).split("\n").filter(Boolean),
  );
  const expected = new Set<string>([...PROTECTED_UNTRACKED, PROOF_PATH]);
  assert(untracked.size === expected.size, "untracked_scope_changed");
  for (const path of expected) {
    assert(untracked.has(path), "expected_untracked_missing");
  }
  const ignored = await mustCommand("git", [
    "check-ignore",
    "-v",
    MIGRATION_PATH,
  ]);
  assert(ignored.endsWith(`\t${MIGRATION_PATH}`), "migration_not_ignored");
}

async function run(): Promise<void> {
  await verifyRepoScope();
  assert(
    await sha256File(MIGRATION_PATH) === EXPECTED_MIGRATION_SHA256,
    "migration_start_hash_mismatch",
  );

  const container = await mustCommand("docker", [
    "ps",
    "--filter",
    `name=^/${CONTAINER}$`,
    "--format",
    "{{.Names}}",
  ]);
  assert(container === CONTAINER, "local_container_missing");

  const countsBefore = await mainCounts();
  const hashesBefore = await protectedHashes();
  for (const table of FOUNDATION_TABLES) {
    assert(countsBefore.get(table) === 0, "main_foundation_not_empty");
  }
  assert(
    countsBefore.get("app_dossier_locations") === 44,
    "main_dossier_location_count_changed",
  );

  const database = `enval_wp3j_proof_${Date.now()}_${
    Math.floor(Math.random() * 1_000_000)
  }`;
  let databaseCreated = false;
  let proofSucceeded = false;

  try {
    await createProofDatabase(database);
    databaseCreated = true;
    await proveCatalog(database);
    await proveSequentialBehavior(database);
    await proveConcurrency(database);
    proofSucceeded = true;
  } finally {
    if (databaseCreated) {
      await dropProofDatabase(database);
    }
  }

  assert(proofSucceeded, "proof_did_not_complete");
  assert(
    await readOnlyMain(`
      select count(*) from pg_catalog.pg_database
      where datname = ${sqlText(database)};
    `) === "0",
    "proof_database_left_behind",
  );

  const countsAfter = await mainCounts();
  const hashesAfter = await protectedHashes();
  assert(mapsEqual(countsBefore, countsAfter), "main_counts_changed");
  assert(mapsEqual(hashesBefore, hashesAfter), "protected_hashes_changed");
  for (const table of FOUNDATION_TABLES) {
    assert(countsAfter.get(table) === 0, "main_foundation_rows_changed");
  }
  assert(
    countsAfter.get("app_dossier_locations") === 44,
    "main_dossier_location_count_changed_after",
  );
  assert(
    await sha256File(MIGRATION_PATH) === EXPECTED_MIGRATION_SHA256,
    "migration_end_hash_mismatch",
  );
  await verifyRepoScope();
  pass(42);
  console.log("app-location-write-rpcs-proof-ok");
}

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? scrub(error.message) : "unknown";
  console.error(`app-location-write-rpcs-proof-failed:${message}`);
  Deno.exit(1);
}
