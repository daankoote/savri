const MIGRATION_PATH =
  "supabase/migrations/20260728100000_app_location_foundation.sql";
const PROOF_PATH = "scripts/proofs/app-location-foundation.proof.ts";
const CONTAINER = "supabase_db_enval";
const DATABASE = "postgres";

const TARGET_TABLES = [
  "app_locations",
  "app_location_address_observations",
  "app_location_versions",
] as const;

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

const ROOT_COLUMNS = [
  "id|uuid|NO|gen_random_uuid()",
  "created_at|timestamp with time zone|NO|clock_timestamp()",
  "created_by_actor_ref|text|NO|",
  "created_from_request_id|text|NO|",
  "creation_basis|text|NO|",
];

const OBSERVATION_COLUMNS = [
  "id|uuid|NO|gen_random_uuid()",
  "location_id|uuid|NO|",
  "observation_kind|text|NO|",
  "descriptor_kind|text|NO|",
  "observed_at|timestamp with time zone|NO|",
  "recorded_at|timestamp with time zone|NO|clock_timestamp()",
  "recorded_by_actor_ref|text|NO|",
  "recorded_from_request_id|text|NO|",
  "source_ref_sha256|text|YES|",
  "source_payload_sha256|text|YES|",
  "source_retrieved_at|timestamp with time zone|YES|",
  "fresh_until|timestamp with time zone|YES|",
  "country_code|text|NO|",
  "postal_code|text|YES|",
  "house_number|integer|YES|",
  "house_number_addition|text|YES|",
  "street|text|YES|",
  "city|text|YES|",
  "site_reference|text|YES|",
];

const VERSION_COLUMNS = [
  "id|uuid|NO|gen_random_uuid()",
  "location_id|uuid|NO|",
  "accepted_from_observation_id|uuid|NO|",
  "valid_from|timestamp with time zone|NO|",
  "valid_to|timestamp with time zone|YES|",
  "recorded_at|timestamp with time zone|NO|clock_timestamp()",
  "accepted_at|timestamp with time zone|NO|",
  "accepted_by_actor_ref|text|NO|",
  "accepted_from_request_id|text|NO|",
  "acceptance_decision_ref|text|NO|",
  "descriptor_kind|text|NO|",
  "country_code|text|NO|",
  "postal_code|text|YES|",
  "house_number|integer|YES|",
  "house_number_addition|text|YES|",
  "street|text|YES|",
  "city|text|YES|",
  "site_reference|text|YES|",
  "supersedes_version_id|uuid|YES|",
  "correction_reason|text|YES|",
];

const HASH = "a".repeat(64);
const ROOT_A = "10000000-0000-4000-8000-000000000001";
const ROOT_B = "10000000-0000-4000-8000-000000000002";
const OBS_A = "20000000-0000-4000-8000-000000000001";
const OBS_B = "20000000-0000-4000-8000-000000000002";
const OBS_C = "20000000-0000-4000-8000-000000000003";
const VERSION_A = "30000000-0000-4000-8000-000000000001";
const VERSION_B = "30000000-0000-4000-8000-000000000002";
const VERSION_C = "30000000-0000-4000-8000-000000000003";

class ProofFailure extends Error {}

function assert(condition: boolean): asserts condition {
  if (!condition) throw new ProofFailure("proof assertion failed");
}

function pass(number: number): void {
  console.log(`WP3G-Q${String(number).padStart(2, "0")}: PASS`);
}

async function processOutput(
  command: string,
  args: string[],
  stdin?: string,
): Promise<{ code: number; stdout: string }> {
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
  };
}

async function command(command: string, args: string[]): Promise<string> {
  const result = await processOutput(command, args);
  assert(result.code === 0);
  return result.stdout;
}

async function psql(statement: string): Promise<string> {
  const result = await processOutput("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-q",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
  ], statement);
  assert(result.code === 0);
  return result.stdout;
}

async function expectSqlFailure(statement: string): Promise<void> {
  const result = await processOutput("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-q",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
  ], `begin;\n${statement}\ncommit;\n`);
  assert(result.code !== 0);
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function root(
  id = ROOT_A,
  basis = "customer_declaration",
  actor = "synthetic-actor",
  request = "synthetic-request",
): string {
  return `
    insert into public.app_locations (
      id, created_by_actor_ref, created_from_request_id, creation_basis
    ) values (
      ${sqlLiteral(id)}, ${sqlLiteral(actor)}, ${sqlLiteral(request)},
      ${sqlLiteral(basis)}
    );`;
}

type ObservationOptions = {
  id?: string;
  locationId?: string;
  kind?: string;
  descriptor?: "postal_address" | "site_reference";
  sourceRef?: string | null;
  payload?: string | null;
  retrieved?: string | null;
  freshUntil?: string | null;
  postalCode?: string | null;
  houseNumber?: number | null;
  addition?: string | null;
  street?: string | null;
  city?: string | null;
  site?: string | null;
  actor?: string;
  request?: string;
};

function observation(options: ObservationOptions = {}): string {
  const descriptor = options.descriptor ?? "site_reference";
  const kind = options.kind ?? "customer_declared";
  const payloadRequired = [
    "document_parsed",
    "pdok_observed",
    "bag_observed",
    "provider_observed",
  ].includes(kind);
  const retrievedRequired = [
    "pdok_observed",
    "bag_observed",
    "provider_observed",
  ].includes(kind);
  const value = (input: string | null | undefined): string =>
    input === null || input === undefined ? "null" : sqlLiteral(input);
  const postal = descriptor === "postal_address";
  return `
    insert into public.app_location_address_observations (
      id, location_id, observation_kind, descriptor_kind, observed_at,
      recorded_at, recorded_by_actor_ref, recorded_from_request_id,
      source_ref_sha256, source_payload_sha256, source_retrieved_at,
      fresh_until, country_code, postal_code, house_number,
      house_number_addition, street, city, site_reference
    ) values (
      ${sqlLiteral(options.id ?? OBS_A)},
      ${sqlLiteral(options.locationId ?? ROOT_A)},
      ${sqlLiteral(kind)},
      ${sqlLiteral(descriptor)},
      '2026-01-01T00:00:00Z',
      '2026-01-02T00:00:00Z',
      ${sqlLiteral(options.actor ?? "synthetic-actor")},
      ${sqlLiteral(options.request ?? "synthetic-request")},
      ${value(options.sourceRef)},
      ${value(options.payload === undefined && payloadRequired ? HASH : options.payload)},
      ${
    value(
      options.retrieved === undefined && retrievedRequired
        ? "2026-01-01T12:00:00Z"
        : options.retrieved,
    )
  },
      ${value(options.freshUntil)},
      'NL',
      ${value(options.postalCode === undefined && postal ? "1234AB" : options.postalCode)},
      ${
    options.houseNumber === null || (options.houseNumber === undefined && !postal)
      ? "null"
      : String(options.houseNumber === undefined ? 10 : options.houseNumber)
  },
      ${value(options.addition)},
      ${value(options.street === undefined && postal ? "Syntheticstraat" : options.street)},
      ${value(options.city === undefined && postal ? "Teststad" : options.city)},
      ${value(options.site === undefined && !postal ? "synthetic-site" : options.site)}
    );`;
}

type VersionOptions = {
  id?: string;
  locationId?: string;
  observationId?: string;
  validFrom?: string;
  validTo?: string | null;
  recordedAt?: string;
  acceptedAt?: string;
  actor?: string;
  request?: string;
  decision?: string;
  descriptor?: "postal_address" | "site_reference";
  postalCode?: string | null;
  houseNumber?: number | null;
  addition?: string | null;
  street?: string | null;
  city?: string | null;
  site?: string | null;
  supersedes?: string | null;
  correction?: string | null;
};

function version(options: VersionOptions = {}): string {
  const descriptor = options.descriptor ?? "site_reference";
  const postal = descriptor === "postal_address";
  const value = (input: string | null | undefined): string =>
    input === null || input === undefined ? "null" : sqlLiteral(input);
  return `
    insert into public.app_location_versions (
      id, location_id, accepted_from_observation_id, valid_from, valid_to,
      recorded_at, accepted_at, accepted_by_actor_ref,
      accepted_from_request_id, acceptance_decision_ref, descriptor_kind,
      country_code, postal_code, house_number, house_number_addition,
      street, city, site_reference, supersedes_version_id, correction_reason
    ) values (
      ${sqlLiteral(options.id ?? VERSION_A)},
      ${sqlLiteral(options.locationId ?? ROOT_A)},
      ${sqlLiteral(options.observationId ?? OBS_A)},
      ${sqlLiteral(options.validFrom ?? "2026-01-01T00:00:00Z")},
      ${value(options.validTo)},
      ${sqlLiteral(options.recordedAt ?? "2026-01-03T00:00:00Z")},
      ${sqlLiteral(options.acceptedAt ?? "2026-01-02T12:00:00Z")},
      ${sqlLiteral(options.actor ?? "synthetic-acceptor")},
      ${sqlLiteral(options.request ?? "synthetic-accept-request")},
      ${sqlLiteral(options.decision ?? `synthetic-decision-${options.id ?? VERSION_A}`)},
      ${sqlLiteral(descriptor)},
      'NL',
      ${value(options.postalCode === undefined && postal ? "1234AB" : options.postalCode)},
      ${
    options.houseNumber === null || (options.houseNumber === undefined && !postal)
      ? "null"
      : String(options.houseNumber === undefined ? 10 : options.houseNumber)
  },
      ${value(options.addition)},
      ${value(options.street === undefined && postal ? "Syntheticstraat" : options.street)},
      ${value(options.city === undefined && postal ? "Teststad" : options.city)},
      ${value(options.site === undefined && !postal ? "synthetic-site" : options.site)},
      ${value(options.supersedes)},
      ${value(options.correction)}
    );`;
}

async function tableColumns(table: string): Promise<string[]> {
  const result = await psql(`
    select column_name || '|' || data_type || '|' || is_nullable || '|' ||
           coalesce(column_default, '')
    from information_schema.columns
    where table_schema = 'public' and table_name = ${sqlLiteral(table)}
    order by ordinal_position;
  `);
  return result ? result.split("\n") : [];
}

async function targetCounts(): Promise<number[]> {
  return (await Promise.all(TARGET_TABLES.map(async (table) =>
    Number(await psql(`select count(*) from public.${table};`))
  )));
}

async function protectedCounts(): Promise<Map<string, number>> {
  const names = (await psql(`
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (
        c.relname like 'app\\_%' escape '\\'
        or c.relname like 'evidence\\_%' escape '\\'
      )
      and c.relname not in (
        'app_locations',
        'app_location_address_observations',
        'app_location_versions'
      )
    order by c.relname;
  `)).split("\n").filter(Boolean);
  const result = new Map<string, number>();
  for (const name of names) {
    result.set(name, Number(await psql(`select count(*) from public.${name};`)));
  }
  return result;
}

async function sha256(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function protectedHashes(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const path of PROTECTED_UNTRACKED) result.set(path, await sha256(path));
  return result;
}

function equalMaps<K, V>(left: Map<K, V>, right: Map<K, V>): boolean {
  return left.size === right.size &&
    [...left].every(([key, value]) => right.get(key) === value);
}

async function repoScope(): Promise<void> {
  assert(await command("git", ["diff", "--name-only"]) === "");
  assert(await command("git", ["diff", "--cached", "--name-only"]) === "");
  const untracked = new Set(
    (await command("git", [
      "ls-files",
      "--others",
      "--exclude-standard",
    ])).split("\n").filter(Boolean),
  );
  const expected = new Set<string>([...PROTECTED_UNTRACKED, PROOF_PATH]);
  assert(untracked.size === expected.size);
  for (const path of expected) assert(untracked.has(path));
  const ignored = await command("git", ["check-ignore", "-v", MIGRATION_PATH]);
  assert(ignored.endsWith(`\t${MIGRATION_PATH}`));
}

async function main(): Promise<void> {
  const countsBefore = await protectedCounts();
  const hashesBefore = await protectedHashes();
  const initialTargetCounts = await targetCounts();
  assert(initialTargetCounts.every((count) => count === 0));

  await repoScope();
  const migration = await Deno.readTextFile(MIGRATION_PATH);
  assert(
    [...migration.matchAll(/create table public\.([a-z0-9_]+)/g)]
      .map((match) => match[1]).join(",") === TARGET_TABLES.join(","),
  );
  assert(
    [...migration.matchAll(/create function public\.([a-z0-9_]+)\(\)/g)]
      .map((match) => match[1]).join(",") ===
      "app_location_versions_deferred_guard",
  );
  pass(1);

  assert(MIGRATION_PATH ===
    "supabase/migrations/20260728100000_app_location_foundation.sql");
  assert(PROOF_PATH === "scripts/proofs/app-location-foundation.proof.ts");
  const timestampPeers = [];
  for await (const entry of Deno.readDir("supabase/migrations")) {
    if (entry.name.startsWith("20260728100000_")) timestampPeers.push(entry.name);
  }
  assert(timestampPeers.join(",") === "20260728100000_app_location_foundation.sql");
  pass(2);

  const targetObjectInventory = await psql(`
    select kind || ':' || name
    from (
      select 'relation' as kind, c.relname as name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (
          c.relname in (
            'app_locations',
            'app_location_address_observations',
            'app_location_versions'
          )
          or c.relname like 'app_location_address_observations_%'
          or c.relname like 'app_location_versions_%'
          or c.relname like 'app_locations_%'
        )
      union all
      select 'function', p.proname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'app_location_versions_deferred_guard'
    ) inventory
    order by kind, name;
  `);
  assert(!migration.toLowerCase().includes("if not exists"));
  assert(targetObjectInventory.includes("function:app_location_versions_deferred_guard"));
  assert(targetObjectInventory.split("\n").filter((line) =>
    line.startsWith("relation:app_location")
  ).length >= 3);
  pass(3);

  const actualTables = (await psql(`
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname in (
        'app_locations',
        'app_location_address_observations',
        'app_location_versions'
      )
    order by c.relname;
  `)).split("\n");
  assert(actualTables.join(",") === [...TARGET_TABLES].sort().join(","));
  assert(
    [...migration.matchAll(/\bcreate table\b/gi)].length === 3,
  );
  pass(4);

  assert(initialTargetCounts.every((count) => count === 0));
  pass(5);

  assert(countsBefore.get("app_dossier_locations") === 44);
  for (
    const name of [
      "app_dossier_locations",
      "app_dossier_chargers",
      "app_dossier_document_files",
      "app_dossier_document_slots",
      "app_dossier_document_versions",
    ]
  ) assert(countsBefore.has(name));
  pass(6);

  const executableLines = migration.split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== "" && !line.startsWith("--"));
  assert(!executableLines.some((line) =>
    /^(insert|update|delete|copy|truncate|drop)\b/.test(line) ||
    line.includes("app_dossier_locations")
  ));
  pass(7);

  assert((await tableColumns("app_locations")).join("\n") ===
    ROOT_COLUMNS.join("\n"));
  assert(await psql(`
    select count(*) from pg_catalog.pg_constraint
    where conrelid = 'public.app_locations'::regclass
      and contype = 'c';
  `) === "3");
  pass(8);

  const rootForbidden = await psql(`
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'app_locations'
      and column_name ~
        '(address|postal|street|city|site|ean|party|case|owner|mid|eligib|settle|status|updated|provider|external)';
  `);
  assert(rootForbidden === "0");
  pass(9);

  for (
    const basis of [
      "customer_declaration",
      "source_observation",
      "manual_migration_review",
    ]
  ) {
    await psql(`begin; ${root(ROOT_A, basis)} rollback;`);
  }
  await expectSqlFailure(root(ROOT_A, "other"));
  await expectSqlFailure(root(ROOT_A, "customer_declaration", " "));
  pass(10);

  await expectSqlFailure(`${root()} update public.app_locations set creation_basis =
    'source_observation' where id = ${sqlLiteral(ROOT_A)};`);
  await expectSqlFailure(`${root()} delete from public.app_locations
    where id = ${sqlLiteral(ROOT_A)};`);
  assert(await psql(`
    select count(*) from pg_catalog.pg_trigger
    where tgrelid = 'public.app_locations'::regclass
      and tgname = 'app_locations_immutable'
      and tgfoid = 'public.app_wp2b_i_immutable_guard()'::regprocedure;
  `) === "1");
  pass(11);

  assert((await tableColumns("app_location_address_observations"))
    .join("\n") === OBSERVATION_COLUMNS.join("\n"));
  assert(await psql(`
    select confdeltype
    from pg_catalog.pg_constraint
    where conrelid = 'public.app_location_address_observations'::regclass
      and conname = 'app_location_address_observations_location_id_fkey';
  `) === "r");
  pass(12);

  const kinds = [
    "customer_declared",
    "document_parsed",
    "pdok_observed",
    "bag_observed",
    "provider_observed",
    "manual_observed",
    "migration_snapshot",
  ];
  for (const kind of kinds) {
    await psql(`begin; ${root()} ${observation({ kind })} rollback;`);
  }
  await expectSqlFailure(`${root()} ${observation({ kind: "other" })}`);
  pass(13);

  await psql(`begin; ${root()} ${observation()} rollback;`);
  await psql(`begin; ${root()} ${observation({ descriptor: "postal_address" })} rollback;`);
  await expectSqlFailure(`${root()} ${
    observation().replace("'site_reference'", "'other_descriptor'")
  }`);
  pass(14);

  await psql(`begin; ${root()} ${
    observation({ descriptor: "postal_address" })
  } rollback;`);
  await expectSqlFailure(`${root()} ${
    observation({ descriptor: "postal_address", city: null })
  }`);
  await expectSqlFailure(`${root()} ${
    observation({
      descriptor: "postal_address",
      site: "mixed-site",
    })
  }`);
  await expectSqlFailure(`${root()} ${
    observation({ descriptor: "postal_address", houseNumber: 0 })
  }`);
  pass(15);

  await psql(`begin; ${root()} ${observation()} rollback;`);
  await expectSqlFailure(`${root()} ${observation({ site: " " })}`);
  await expectSqlFailure(`${root()} ${
    observation({ postalCode: "1234AB", houseNumber: 10 })
  }`);
  pass(16);

  await psql(`begin; ${root()} ${
    observation({ sourceRef: HASH, payload: HASH })
  } rollback;`);
  await expectSqlFailure(`${root()} ${observation({ sourceRef: "A".repeat(64) })}`);
  await expectSqlFailure(`${root()} ${observation({ payload: "a".repeat(63) })}`);
  await expectSqlFailure(`${root()} ${
    observation({ kind: "document_parsed", payload: null })
  }`);
  await expectSqlFailure(`${root()} ${
    observation({ kind: "pdok_observed", retrieved: null })
  }`);
  await expectSqlFailure(`${root()} ${
    observation({
      kind: "pdok_observed",
      retrieved: "2026-01-01T12:00:00Z",
      freshUntil: "2026-01-01T11:00:00Z",
    })
  }`);
  await expectSqlFailure(`${root()} ${
    observation({
      kind: "customer_declared",
      retrieved: "2026-01-01T12:00:00Z",
      freshUntil: "2026-01-02T12:00:00Z",
    })
  }`);
  pass(17);

  assert(await psql(`
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_location_address_observations'
      and column_name ~
        '(raw|payload_json|provider_id|storage|document_content|secret|email|phone|case_id|evidence_id)';
  `) === "0");
  pass(18);

  assert(await psql(`
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_location_address_observations'
      and column_name ~ '(accepted|approved|verified|current|operational|eligible|status|updated)';
  `) === "0");
  assert(await psql(`
    select count(*)
    from pg_catalog.pg_trigger
    where tgrelid = 'public.app_location_address_observations'::regclass
      and not tgisinternal
      and tgname <> 'app_location_address_observations_immutable';
  `) === "0");
  pass(19);

  await expectSqlFailure(`${root()} ${observation()}
    update public.app_location_address_observations
    set city = 'Other' where id = ${sqlLiteral(OBS_A)};`);
  await expectSqlFailure(`${root()} ${observation()}
    delete from public.app_location_address_observations
    where id = ${sqlLiteral(OBS_A)};`);
  pass(20);

  assert((await tableColumns("app_location_versions")).join("\n") ===
    VERSION_COLUMNS.join("\n"));
  assert(await psql(`
    select string_agg(
      conname || ':' || confdeltype::text,
      ',' order by conname
    )
    from pg_catalog.pg_constraint
    where conrelid = 'public.app_location_versions'::regclass
      and contype = 'f';
  `) === [
    "app_location_versions_accepted_observation_same_root_fkey:r",
    "app_location_versions_location_id_fkey:r",
    "app_location_versions_supersedes_same_root_fkey:r",
  ].join(","));
  pass(21);

  await expectSqlFailure(`${root(ROOT_A)} ${root(ROOT_B)}
    ${observation({ id: OBS_A, locationId: ROOT_A })}
    ${version({ locationId: ROOT_B, observationId: OBS_A })}`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ id: VERSION_A })}
    ${version({
      id: VERSION_B,
      observationId: OBS_A,
      decision: "synthetic-decision-two",
      validFrom: "2027-01-01T00:00:00Z",
    })}`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ actor: " " })}`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ acceptedAt: "2026-01-04T00:00:00Z" })}`);
  await expectSqlFailure(`${root()} ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({ id: VERSION_A, observationId: OBS_A, decision: "same-decision" })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      decision: "same-decision",
      validFrom: "2027-01-01T00:00:00Z",
    })}`);
  pass(22);

  assert(await psql(`
    select count(*)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'app_location_versions'
      and column_name ~ '(draft|pending|reject|status|updated|approved|current)';
  `) === "0");
  pass(23);

  await psql(`begin; ${root()} ${observation({ descriptor: "postal_address" })}
    ${version({ descriptor: "postal_address" })} rollback;`);
  await psql(`begin; ${root()} ${observation()} ${version()} rollback;`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ site: " " })}`);
  await expectSqlFailure(`${root()} ${observation({ descriptor: "postal_address" })}
    ${version({ descriptor: "postal_address", street: null })}`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ postalCode: "1234AB", houseNumber: 10 })}`);
  pass(24);

  await psql(`begin; ${root()} ${observation()}
    ${version({ validTo: "2026-02-01T00:00:00Z" })} rollback;`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ validTo: "2026-01-01T00:00:00Z" })}`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ validTo: "2025-12-31T00:00:00Z" })}`);
  pass(25);

  await psql(`begin; ${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({
      id: VERSION_A,
      observationId: OBS_A,
      validFrom: "2026-01-01T00:00:00Z",
      validTo: "2026-02-01T00:00:00Z",
    })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      validFrom: "2026-02-01T00:00:00Z",
      validTo: "2026-03-01T00:00:00Z",
    })}
    rollback;`);
  pass(26);

  await expectSqlFailure(`${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({
      id: VERSION_A,
      observationId: OBS_A,
      validFrom: "2026-01-01T00:00:00Z",
      validTo: "2026-03-01T00:00:00Z",
    })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      validFrom: "2026-02-01T00:00:00Z",
      validTo: "2026-04-01T00:00:00Z",
    })}`);
  pass(27);

  await expectSqlFailure(`${root(ROOT_A)} ${root(ROOT_B)}
    ${observation({ id: OBS_A, locationId: ROOT_A })}
    ${observation({ id: OBS_B, locationId: ROOT_B })}
    ${version({ id: VERSION_A, locationId: ROOT_A, observationId: OBS_A })}
    ${version({
      id: VERSION_B,
      locationId: ROOT_B,
      observationId: OBS_B,
      supersedes: VERSION_A,
      correction: "synthetic correction",
      recordedAt: "2026-01-04T00:00:00Z",
    })}`);
  pass(28);

  await expectSqlFailure(`${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${observation({ id: OBS_C })}
    ${version({ id: VERSION_A, observationId: OBS_A })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      supersedes: VERSION_A,
      correction: "first correction",
      recordedAt: "2026-01-04T00:00:00Z",
    })}
    ${version({
      id: VERSION_C,
      observationId: OBS_C,
      supersedes: VERSION_A,
      correction: "second correction",
      recordedAt: "2026-01-05T00:00:00Z",
    })}`);
  assert(await psql(`
    select count(*) from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    where c.relname = 'app_location_versions_direct_successor_uidx'
      and i.indisunique and i.indpred is not null;
  `) === "1");
  pass(29);

  await expectSqlFailure(`${root()} ${observation()}
    ${version({
      id: VERSION_A,
      supersedes: VERSION_A,
      correction: "self correction",
    })}`);
  const guardDefinition = await psql(`
    select pg_catalog.pg_get_functiondef(
      'public.app_location_versions_deferred_guard()'::regprocedure
    );
  `);
  assert(guardDefinition.toLowerCase().includes("with recursive"));
  assert(await psql(`
    select count(*) from pg_catalog.pg_trigger
    where tgrelid = 'public.app_location_versions'::regclass
      and tgname = 'app_location_versions_deferred_guard_trigger'
      and tgdeferrable and tginitdeferred;
  `) === "1");
  pass(30);

  await expectSqlFailure(`${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({ id: VERSION_A, observationId: OBS_A })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      supersedes: VERSION_A,
      correction: null,
      recordedAt: "2026-01-04T00:00:00Z",
    })}`);
  await expectSqlFailure(`${root()} ${observation()}
    ${version({ correction: "unattached correction" })}`);
  await expectSqlFailure(`${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({ id: VERSION_A, observationId: OBS_A })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      supersedes: VERSION_A,
      correction: " ",
      recordedAt: "2026-01-04T00:00:00Z",
    })}`);
  pass(31);

  await expectSqlFailure(`${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({
      id: VERSION_A,
      observationId: OBS_A,
      recordedAt: "2026-01-05T00:00:00Z",
    })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      supersedes: VERSION_A,
      correction: "recorded order correction",
      recordedAt: "2026-01-04T00:00:00Z",
    })}`);
  pass(32);

  await expectSqlFailure(`${root()} ${observation()} ${version()}
    update public.app_location_versions set valid_to = '2027-01-01T00:00:00Z'
    where id = ${sqlLiteral(VERSION_A)};`);
  await expectSqlFailure(`${root()} ${observation()} ${version()}
    delete from public.app_location_versions where id = ${sqlLiteral(VERSION_A)};`);
  assert(await psql(`begin; ${root()}
    ${observation({ id: OBS_A })}
    ${observation({ id: OBS_B })}
    ${version({ id: VERSION_A, observationId: OBS_A })}
    ${version({
      id: VERSION_B,
      observationId: OBS_B,
      supersedes: VERSION_A,
      correction: "synthetic correction",
      recordedAt: "2026-01-04T00:00:00Z",
    })}
    select count(*) from public.app_location_versions
    where id in (${sqlLiteral(VERSION_A)}, ${sqlLiteral(VERSION_B)});
    rollback;`) === "2");
  pass(33);

  assert(await psql(`
    select count(*)
    from pg_catalog.pg_class
    where oid = any(array[
      'public.app_locations'::regclass,
      'public.app_location_address_observations'::regclass,
      'public.app_location_versions'::regclass
    ])
      and relrowsecurity;
  `) === "3");
  pass(34);

  assert(await psql(`
    select count(*)
    from pg_catalog.pg_policy
    where polrelid = any(array[
      'public.app_locations'::regclass,
      'public.app_location_address_observations'::regclass,
      'public.app_location_versions'::regclass
    ])
      and polname = 'deny_all'
      and polcmd = '*'
      and cardinality(polroles) = 2
      and polroles @> array[
        'anon'::regrole::oid,
        'authenticated'::regrole::oid
      ]
      and pg_catalog.pg_get_expr(polqual, polrelid) = 'false'
      and pg_catalog.pg_get_expr(polwithcheck, polrelid) = 'false';
  `) === "3");
  assert(await psql(`
    select count(*) from pg_catalog.pg_policy
    where polrelid = any(array[
      'public.app_locations'::regclass,
      'public.app_location_address_observations'::regclass,
      'public.app_location_versions'::regclass
    ]);
  `) === "3");
  pass(35);

  assert(await psql(`
    select count(*)
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid = any(array[
      'public.app_locations'::regclass,
      'public.app_location_address_observations'::regclass,
      'public.app_location_versions'::regclass
    ])
      and acl.grantee = 0;
  `) === "0");
  for (const role of ["anon", "authenticated"]) {
    for (const table of TARGET_TABLES) {
      for (
        const privilege of [
          "SELECT",
          "INSERT",
          "UPDATE",
          "DELETE",
          "TRUNCATE",
          "REFERENCES",
          "TRIGGER",
        ]
      ) {
        assert(await psql(`
          select has_table_privilege(
            ${sqlLiteral(role)}, 'public.${table}', ${sqlLiteral(privilege)}
          );
        `) === "f");
      }
    }
  }
  pass(36);

  for (const table of TARGET_TABLES) {
    const privileges = await psql(`
      select string_agg(privilege_type, ',' order by privilege_type)
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = ${sqlLiteral(table)}
        and grantee = 'service_role';
    `);
    assert(privileges === "INSERT,SELECT");
  }
  pass(37);

  for (const table of TARGET_TABLES) {
    for (
      const privilege of [
        "UPDATE",
        "DELETE",
        "TRUNCATE",
        "REFERENCES",
        "TRIGGER",
      ]
    ) {
      assert(await psql(`
        select has_table_privilege(
          'service_role', 'public.${table}', ${sqlLiteral(privilege)}
        );
      `) === "f");
    }
  }
  pass(38);

  for (
    const functionName of [
      "app_wp2b_i_immutable_guard",
      "app_location_versions_deferred_guard",
    ]
  ) {
    assert(await psql(`
      select (not p.prosecdef)
        and p.proconfig @> array['search_path=pg_catalog, public']
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = ${sqlLiteral(functionName)};
    `) === "t");
    assert(await psql(`
      select count(*)
      from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where p.oid = 'public.${functionName}()'::regprocedure
        and acl.grantee = 0;
    `) === "0");
    for (const role of ["anon", "authenticated", "service_role"]) {
      assert(await psql(`
        select has_function_privilege(
          ${sqlLiteral(role)},
          'public.${functionName}()',
          'EXECUTE'
        );
      `) === "f");
    }
  }
  pass(39);

  assert(!/\bsecurity\s+definer\b/i.test(migration));
  assert(!/\bcreate\s+(?:or\s+replace\s+)?(?:view|materialized\s+view|procedure)\b/i
    .test(migration));
  assert([...migration.matchAll(/\bcreate function\b/gi)].length === 1);
  assert(await psql(`
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'app_location%'
      and p.proname <> 'app_location_versions_deferred_guard';
  `) === "0");
  pass(40);

  await repoScope();
  assert(!migration.includes("supabase/functions/"));
  assert(!migration.includes("apps/"));
  assert(!migration.includes("packages/"));
  pass(41);

  assert((await targetCounts()).every((count) => count === 0));
  const countsAfter = await protectedCounts();
  const hashesAfter = await protectedHashes();
  assert(equalMaps(countsBefore, countsAfter));
  assert(equalMaps(hashesBefore, hashesAfter));
  assert(countsAfter.get("app_dossier_locations") === 44);
  pass(42);

  console.log("app-location-foundation-proof-ok");
}

try {
  await main();
} catch {
  console.error("app-location-foundation-proof-failed");
  Deno.exit(1);
}
