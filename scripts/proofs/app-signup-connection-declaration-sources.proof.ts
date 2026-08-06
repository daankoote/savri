// Local PILOT-CONNECTION-01 proof.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
//
// The fixed local ENVAL database is inspected only. Signup fixtures, failure
// injection and concurrency run only in one disposable schema-only database,
// which is dropped in finally.

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type AccountType = "particulier" | "zakelijk" | "vve";

const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const EXPECTED_HEAD = "c2c7f3efb4104140625b4acd375281f4e86bc500";
const MIGRATION_PATH =
  "supabase/migrations/20260730150000_app_signup_connection_declaration_sources.sql";
const CORRECTION_MIGRATION_PATH =
  "supabase/migrations/20260730170000_app_assisted_connection_capture_correction.sql";
const PROOF_PATH =
  "scripts/proofs/app-signup-connection-declaration-sources.proof.ts";
const DOC_PATH = "docs/app/operations/pilot-connection-01-local-proof.md";
const EDGE_PATH = "supabase/functions/api-app-signup-submit/index.ts";
const TYPES_PATH = "app/src/features/signup/signupTypes.ts";
const MAPPER_PATH = "app/src/features/signup/signupSubmitMapper.ts";
const VALIDATOR_PATH = "app/src/features/signup/signupValidation.ts";
const LOCATION_COMPONENT_PATH =
  "app/src/features/signup/ChargerInfoSection.tsx";
const V4_SIGNATURE = "public.app_submit_signup_v4(jsonb)";
const V5_SIGNATURE = "public.app_submit_signup_v5(jsonb)";
const EXPECTED_V4_FINGERPRINT = "199714f2f95e9f8385543b58f3c5c8e3";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function scrub(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/enval_pilot_connection_01_[0-9_]+/g, "<proof-database>")
    .split("\n")
    .slice(0, 10)
    .join(" | ");
}

async function command(
  executable: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const child = new Deno.Command(executable, {
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
  const result = await command(executable, args, stdin);
  if (!result.success) {
    throw new Error(scrub(result.stderr || `${executable}_failed`));
  }
  return result.stdout;
}

async function psqlResult(
  database: string,
  sql: string,
  singleTransaction = false,
): Promise<CommandResult> {
  const args = [
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
  ];
  if (singleTransaction) args.push("--single-transaction");
  return await command("docker", args, sql);
}

async function psql(database: string, sql: string): Promise<string> {
  const result = await psqlResult(database, sql);
  if (!result.success) {
    throw new Error(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256File(path: string): Promise<string> {
  return await sha256Text(await Deno.readTextFile(path));
}

async function workspaceSnapshot(): Promise<Map<string, string>> {
  const status = await mustCommand("git", [
    "status",
    "--porcelain=v1",
    "-uall",
  ]);
  const result = new Map<string, string>();
  for (const line of status.split("\n").filter(Boolean)) {
    const path = line[2] === " "
      ? line.slice(3)
      : line[1] === " "
      ? line.slice(2)
      : "";
    assert(path, `unparseable_git_status:${line}`);
    result.set(path, await sha256File(path));
  }
  result.set(MIGRATION_PATH, await sha256File(MIGRATION_PATH));
  result.set(
    CORRECTION_MIGRATION_PATH,
    await sha256File(CORRECTION_MIGRATION_PATH),
  );
  return result;
}

function mapsEqual<K, V>(left: Map<K, V>, right: Map<K, V>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

async function appTableCounts(database: string): Promise<Map<string, number>> {
  const raw = await psql(
    database,
    `
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
  `,
  );
  const counts = new Map<string, number>();
  for (const line of raw.split("\n").filter(Boolean)) {
    const [name, count] = line.split("|");
    counts.set(name, Number(count));
  }
  return counts;
}

let freshApplyCount = 0;

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

  const dump = await mustCommand("docker", [
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
  const schema = dump
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
  await psql(
    database,
    `
    drop function if exists ${V5_SIGNATURE};
    drop table if exists
      public.app_connection_declaration_sources cascade;
  `,
  );

  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const correctionMigration = await Deno.readTextFile(
    CORRECTION_MIGRATION_PATH,
  );
  const applied = await psqlResult(
    database,
    `${migration}\n${correctionMigration}`,
    true,
  );
  assert(applied.success, `fresh_apply_failed:${scrub(applied.stderr)}`);
  freshApplyCount += 1;
}

async function dropProofDatabase(database: string): Promise<void> {
  await mustCommand("docker", [
    "exec",
    CONTAINER,
    "dropdb",
    "-U",
    "postgres",
    "--if-exists",
    "--force",
    database,
  ]);
}

type CaptureMethod =
  | "energy_document_customer_confirmed"
  | "manual_customer_confirmed";

function confirmedConnection(
  ean: string,
  captureMethod: CaptureMethod = "manual_customer_confirmed",
) {
  return {
    ean_normalized: ean,
    capture_method: captureMethod,
    customer_confirmed: true,
  };
}

function location(
  id: string,
  connectionDeclaration: Record<string, unknown> | null = confirmedConnection(
    "871685900012345678",
  ),
  parserCandidate?: Record<string, unknown>,
) {
  return {
    client_location_id: id,
    label: `Proof ${id}`,
    postcode_normalized: "2042PC",
    house_number: id === "location-1" ? "65" : "67",
    suffix_normalized: null,
    street: "Proofstraat",
    city: "Zandvoort",
    country: "Nederland",
    lookup_provider: "pdok",
    lookup_provider_id: `proof-${id}`,
    lookup_metadata: { normalized_lookup_key: `2042PC|${id}|` },
    connection_declaration: connectionDeclaration,
    ...(parserCandidate ? { connection_candidate: parserCandidate } : {}),
    chargers: [{
      client_charger_id: `charger-${id}`,
      brand_id: "1",
      brand_label: "Proof brand",
      manual_brand: null,
      model_id: "1",
      model_label: "Proof model",
      manual_model: null,
      serial_number: `SER-${id}`,
      mid_number: `MID-${id}`,
      backend_supplier_id: null,
      backend_supplier_label: null,
      manual_backend_supplier: null,
      installation_year: 2025,
      solar_export_status: "none",
    }],
  };
}

function signupRequest(
  accountType: AccountType,
  key: string,
  requestId: string,
  email: string,
  locations = [location("location-1")],
  payloadHash = "a".repeat(64),
): Record<string, unknown> {
  const person = accountType === "particulier";
  const organizationClassification = accountType === "zakelijk"
    ? "business"
    : "vve";
  const organizationName = accountType === "zakelijk"
    ? "Connection Proof B.V."
    : "VvE Connection Proof";

  return {
    request_id: requestId,
    idempotency_scope: "api-app-signup-submit:v3",
    idempotency_key: key,
    payload_hash: payloadHash,
    idempotency_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    actor_ref: "api-app-signup-submit",
    environment: "local-disposable-proof",
    ip_hash: "b".repeat(64),
    user_agent_hash: "c".repeat(64),
    account_type: accountType,
    email_normalized: email,
    display_name: person ? "Connection Person" : organizationName,
    declaration: person
      ? {
        declaration_kind: "natural_person",
        person_first_name: "Connection",
        person_last_name: "Person",
        person_full_name: "Connection Person",
        organization_classification: null,
        organization_legal_name: null,
        trade_register_number: null,
      }
      : {
        declaration_kind: "organization",
        person_first_name: null,
        person_last_name: null,
        person_full_name: null,
        organization_classification: organizationClassification,
        organization_legal_name: organizationName,
        trade_register_number: "12345678",
      },
    locations,
    legal_acceptances: [
      {
        acceptance_type: "consent_bundle",
        version_ref: "signup-consent-v1",
        version_hash: null,
      },
      {
        acceptance_type: "fee_terms",
        version_ref: "fee-terms-v1",
        version_hash: null,
      },
    ],
  };
}

function callSql(
  request: Record<string, unknown>,
  failureStage?: string,
): string {
  const failure = failureStage
    ? `set local enval.proof_failure_stage = ${sqlText(failureStage)};`
    : "";
  return `
    begin;
    set local role service_role;
    ${failure}
    select public.app_submit_signup_v5(
      ${sqlText(JSON.stringify(request))}::jsonb
    )::text;
    commit;
  `;
}

async function callSignup(
  database: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = await psql(database, callSql(request));
  const jsonLine = raw.split("\n").find((line) => line.startsWith("{"));
  assert(jsonLine, "rpc_json_response_missing");
  return JSON.parse(jsonLine);
}

async function attemptState(
  database: string,
  request: Record<string, unknown>,
): Promise<string> {
  const email = String(request.email_normalized);
  const requestId = String(request.request_id);
  const key = String(request.idempotency_key);
  return await psql(
    database,
    `
    select
      (select count(*) from public.app_customers
        where primary_email_normalized = ${sqlText(email)}) || '|' ||
      (select count(*) from public.app_customer_dossiers d
        join public.app_customers c on c.id = d.customer_id
        where c.primary_email_normalized = ${sqlText(email)}) || '|' ||
      (select count(*) from public.app_dossier_locations l
        join public.app_customer_dossiers d on d.id = l.dossier_id
        join public.app_customers c on c.id = d.customer_id
        where c.primary_email_normalized = ${sqlText(email)}) || '|' ||
      (select count(*) from public.app_connection_declaration_sources s
        join public.app_customers c on c.id = s.customer_id
        where c.primary_email_normalized = ${sqlText(email)}) || '|' ||
      (select count(*) from public.app_audit_events
        where request_id = ${sqlText(requestId)}
          and event_type = 'signup_connection_declaration_recorded') || '|' ||
      (select count(*) from public.app_idempotency_keys
        where scope = 'api-app-signup-submit:v3'
          and key = ${sqlText(key)});
  `,
  );
}

async function failureRequest(
  database: string,
  stage: string,
): Promise<Record<string, unknown>> {
  const suffix = crypto.randomUUID();
  const request = signupRequest(
    "particulier",
    `key-${suffix}`,
    `request-${suffix}`,
    `failure-${suffix}@example.test`,
  );
  const failed = await psqlResult(database, callSql(request, stage));
  assert(
    !failed.success && failed.stderr.includes(`proof_failure_${stage}`),
    `failure_stage_not_reached:${stage}:${scrub(failed.stderr)}`,
  );
  assert(
    await attemptState(database, request) === "0|0|0|0|0|0",
    `partial_rows_after_${stage}`,
  );
  return request;
}

async function main(): Promise<void> {
  assert(
    Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") === "YES",
    "destructive_local_proof_not_enabled",
  );
  assert(
    await mustCommand("git", ["rev-parse", "HEAD"]) === EXPECTED_HEAD,
    "unexpected_head",
  );

  const workspaceBefore = await workspaceSnapshot();
  const mainCountsBefore = await appTableCounts(MAIN_DATABASE);
  const protectedEmpty = [
    "app_connection_declaration_sources",
    "app_connections",
    "app_connection_periods",
    "app_connection_ownership_periods",
    "app_locations",
    "app_location_versions",
    "app_parties",
    "app_party_person_versions",
    "app_party_organization_versions",
    "app_cases",
    "app_case_party_roles",
  ];
  for (const table of protectedEmpty) {
    assert((mainCountsBefore.get(table) ?? 0) === 0, `real_${table}_not_empty`);
  }

  const database = `enval_pilot_connection_01_${Date.now()}`;
  const passed = new Set<number>();
  const pass = (id: number) => {
    assert(!passed.has(id), `duplicate_q${id}`);
    passed.add(id);
    console.log(
      `PILOT-CONNECTION-01-Q${String(id).padStart(2, "0")}: PASS`,
    );
  };

  try {
    const requiredPaths = [
      MIGRATION_PATH,
      CORRECTION_MIGRATION_PATH,
      PROOF_PATH,
      DOC_PATH,
      EDGE_PATH,
      TYPES_PATH,
      MAPPER_PATH,
      VALIDATOR_PATH,
      LOCATION_COMPONENT_PATH,
    ];
    for (const path of requiredPaths) {
      assert((await Deno.stat(path)).isFile, `required_path_missing:${path}`);
    }
    const migrationSource = await Deno.readTextFile(MIGRATION_PATH);
    const correctionMigrationSource = await Deno.readTextFile(
      CORRECTION_MIGRATION_PATH,
    );
    const edgeSource = await Deno.readTextFile(EDGE_PATH);
    const mapperSource = await Deno.readTextFile(MAPPER_PATH);
    const validatorSource = await Deno.readTextFile(VALIDATOR_PATH);
    const componentSource = await Deno.readTextFile(LOCATION_COMPONENT_PATH);
    const docSource = await Deno.readTextFile(DOC_PATH);
    assert(
      migrationSource.includes(
        "create table public.app_connection_declaration_sources",
      ) &&
        migrationSource.includes(
          "create or replace function public.app_submit_signup_v5",
        ) &&
        correctionMigrationSource.includes(
          "energy_document_customer_confirmed",
        ) &&
        correctionMigrationSource.includes("customer_confirmed_at") &&
        !correctionMigrationSource.includes(
          "update public.app_connection_declaration_sources",
        ) &&
        edgeSource.includes('.rpc("app_submit_signup_v5"') &&
        mapperSource.includes("manual_customer_confirmed") &&
        validatorSource.includes("exact 18 cijfers") &&
        componentSource.includes("EAN handmatig invoeren") &&
        !componentSource.includes("Door jou opgegeven netbeheerder") &&
        !componentSource.includes("Aansluiting geldig vanaf") &&
        docSource.includes(
          "CURRENT PROVEN — LOCAL ONLY — ASSISTED AND CUSTOMER-CONFIRMED EAN ACQUISITION WITH MANUAL FALLBACK",
        ),
      "required_contract_manifest_missing",
    );
    pass(1);

    const mainV4Fingerprint = await psql(
      MAIN_DATABASE,
      `select md5(pg_get_functiondef('${V4_SIGNATURE}'::regprocedure));`,
    );
    assert(
      mainV4Fingerprint === EXPECTED_V4_FINGERPRINT,
      `v4_fingerprint_changed:${mainV4Fingerprint}`,
    );
    await createProofDatabase(database);
    const proofV4Fingerprint = await psql(
      database,
      `select md5(pg_get_functiondef('${V4_SIGNATURE}'::regprocedure));`,
    );
    assert(
      proofV4Fingerprint === EXPECTED_V4_FINGERPRINT,
      `proof_v4_fingerprint_changed:${proofV4Fingerprint}`,
    );
    pass(2);

    const rpcSecurity = await psql(
      database,
      `
      select
        p.prosecdef || '|' ||
        coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
        has_function_privilege(
          'service_role', '${V5_SIGNATURE}', 'EXECUTE'
        ) || '|' ||
        has_function_privilege(
          'public', '${V5_SIGNATURE}', 'EXECUTE'
        ) || '|' ||
        has_function_privilege(
          'anon', '${V5_SIGNATURE}', 'EXECUTE'
        ) || '|' ||
        has_function_privilege(
          'authenticated', '${V5_SIGNATURE}', 'EXECUTE'
        )
      from pg_proc p
      where p.oid = '${V5_SIGNATURE}'::regprocedure;
    `,
    );
    assert(
      rpcSecurity === 'true|search_path=""|true|false|false|false',
      `v5_security_mismatch:${rpcSecurity}`,
    );
    pass(3);

    const tableSecurity = await psql(
      database,
      `
      select
        c.relrowsecurity || '|' ||
        (select count(*) from pg_policy
          where polrelid = c.oid and polname = 'deny_all') || '|' ||
        has_table_privilege('service_role', c.oid, 'SELECT') || '|' ||
        has_table_privilege('service_role', c.oid, 'INSERT') || '|' ||
        has_table_privilege('service_role', c.oid, 'UPDATE') || '|' ||
        has_table_privilege('service_role', c.oid, 'DELETE') || '|' ||
        has_table_privilege('service_role', c.oid, 'TRUNCATE') || '|' ||
        has_table_privilege('anon', c.oid, 'SELECT') || '|' ||
        has_table_privilege('authenticated', c.oid, 'SELECT')
      from pg_class c
      where c.oid =
        'public.app_connection_declaration_sources'::regclass;
    `,
    );
    assert(
      tableSecurity ===
        "true|1|true|true|false|false|false|false|false",
      `table_security_mismatch:${tableSecurity}`,
    );
    pass(4);

    const deferredSuffix = crypto.randomUUID();
    const deferredRequest = signupRequest(
      "particulier",
      `key-${deferredSuffix}`,
      `request-${deferredSuffix}`,
      `deferred-${deferredSuffix}@example.test`,
      [location("location-1", null)],
    );
    const deferred = await callSignup(database, deferredRequest);
    assert(
      deferred.ok === true &&
        (deferred.body as Record<string, unknown>).mode === "write_v3" &&
        await attemptState(database, deferredRequest) === "1|1|1|0|0|1",
      "deferred_signup_created_connection_source",
    );
    pass(5);

    const successSuffix = crypto.randomUUID();
    const successRequest = signupRequest(
      "particulier",
      `key-${successSuffix}`,
      `request-${successSuffix}`,
      `success-${successSuffix}@example.test`,
    );
    const success = await callSignup(database, successRequest);
    const successBody = success.body as Record<string, unknown>;
    const successDossier = String(successBody.dossier_id);
    const sourceShape = await psql(
      database,
      `
      select
        address_role || '|' ||
        capture_method || '|' ||
        (customer_confirmed_at = declared_at) || '|' ||
        (network_operator_declared is null) || '|' ||
        (claimed_valid_from is null) || '|' ||
        (claimed_valid_to is null)
      from public.app_connection_declaration_sources
      where dossier_id = ${sqlText(successDossier)}::uuid;
    `,
    );
    assert(
      sourceShape ===
          "connection_service_location|manual_customer_confirmed|true|true|true|true" &&
        await attemptState(database, successRequest) === "1|1|1|1|1|1",
      `manual_confirmed_source_shape_mismatch:${sourceShape}`,
    );
    pass(6);

    const invalidEan = signupRequest(
      "particulier",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `ean-${crypto.randomUUID()}@example.test`,
      [location("location-1", confirmedConnection("123"))],
    );
    const invalidEanResponse = await callSignup(database, invalidEan);
    const unconfirmed = signupRequest(
      "particulier",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `unconfirmed-${crypto.randomUUID()}@example.test`,
      [location("location-1", {
        ean_normalized: "871685900012345678",
        capture_method: "manual_customer_confirmed",
        customer_confirmed: false,
      })],
    );
    assert(
      invalidEanResponse.ok === false &&
        invalidEanResponse.code === "invalid_signup_contract" &&
        (await callSignup(database, unconfirmed)).ok === false &&
        await attemptState(database, invalidEan) === "0|0|0|0|0|0" &&
        await attemptState(database, unconfirmed) === "0|0|0|0|0|0",
      "invalid_or_unconfirmed_ean_not_rejected_atomically",
    );
    pass(7);

    const candidateSuffix = crypto.randomUUID();
    const parserCandidateRequest = signupRequest(
      "particulier",
      `key-${candidateSuffix}`,
      `request-${candidateSuffix}`,
      `candidate-${candidateSuffix}@example.test`,
      [location("location-1", null, {
        ean_observed: "871685900012345679",
        source_file_ref: "energy-bill-proof.pdf",
        confidence: 0.96,
      })],
    );
    assert(
      (await callSignup(database, parserCandidateRequest)).ok === true &&
        await attemptState(database, parserCandidateRequest) ===
          "1|1|1|0|0|1",
      "unconfirmed_parser_candidate_created_declaration",
    );
    pass(8);

    const parserSuffix = crypto.randomUUID();
    const confirmedParserRequest = signupRequest(
      "particulier",
      `key-${parserSuffix}`,
      `request-${parserSuffix}`,
      `parser-${parserSuffix}@example.test`,
      [location(
        "location-1",
        confirmedConnection(
          "871685900012345679",
          "energy_document_customer_confirmed",
        ),
      )],
      "d".repeat(64),
    );
    const parserResult = await callSignup(database, confirmedParserRequest);
    const parserDossier = String(
      (parserResult.body as Record<string, unknown>).dossier_id,
    );
    const parserSource = await psql(
      database,
      `
      select count(*) || '|' || min(capture_method)
      from public.app_connection_declaration_sources
      where dossier_id = ${sqlText(parserDossier)}::uuid;
    `,
    );
    assert(
      parserSource === "1|energy_document_customer_confirmed",
      `confirmed_parser_source_mismatch:${parserSource}`,
    );
    pass(9);

    assert(
      correctionMigrationSource.includes(
        "alter column network_operator_declared drop not null",
      ) &&
        correctionMigrationSource.includes(
          "alter column claimed_valid_from drop not null",
        ) &&
        !correctionMigrationSource.includes("mandate_valid") &&
        !mapperSource.includes("networkOperatorDeclared") &&
        !mapperSource.includes("claimedValidFrom"),
      "optional_operator_period_or_mandate_boundary_missing",
    );
    pass(10);

    for (
      const mutation of [
        `update public.app_connection_declaration_sources
          set environment = 'changed'
          where dossier_id = ${sqlText(successDossier)}::uuid;`,
        `delete from public.app_connection_declaration_sources
          where dossier_id = ${sqlText(successDossier)}::uuid;`,
        "truncate table public.app_connection_declaration_sources;",
      ]
    ) {
      const result = await psqlResult(database, mutation);
      assert(
        !result.success &&
          result.stderr.includes(
            "app_connection_declaration_sources rows are immutable",
          ),
        "connection_source_mutation_allowed",
      );
    }
    pass(11);

    const noAddressTruth = await psql(
      database,
      `
      select
        (select count(*) from public.app_locations) || '|' ||
        (select count(*) from public.app_location_versions) || '|' ||
        (select count(*) from public.app_parties);
    `,
    );
    assert(
      noAddressTruth === "0|0|0" &&
        !correctionMigrationSource.includes("residence_address") &&
        !correctionMigrationSource.includes("establishment_address") &&
        !correctionMigrationSource.includes("accepted_location"),
      "location_promoted_to_address_or_canonical_truth",
    );
    pass(12);

    const multiSuffix = crypto.randomUUID();
    const multiRequest = signupRequest(
      "zakelijk",
      `key-${multiSuffix}`,
      `request-${multiSuffix}`,
      `multi-${multiSuffix}@example.test`,
      [
        location(
          "location-1",
          confirmedConnection("871685900012345680"),
        ),
        location("location-2", null),
      ],
      "e".repeat(64),
    );
    const multi = await callSignup(database, multiRequest);
    const multiDossier = String(
      (multi.body as Record<string, unknown>).dossier_id,
    );
    const multiShape = await psql(
      database,
      `
      select
        (select count(*) from public.app_dossier_locations
          where dossier_id = ${sqlText(multiDossier)}::uuid) || '|' ||
        (select count(*) from public.app_connection_declaration_sources
          where dossier_id = ${sqlText(multiDossier)}::uuid);
    `,
    );
    assert(multiShape === "2|1", `multi_deferred_source_mixup:${multiShape}`);
    pass(13);

    const accountEans = {
      particulier: "871685900012345681",
      zakelijk: "871685900012345682",
      vve: "871685900012345683",
    } as const;
    for (const accountType of ["particulier", "zakelijk", "vve"] as const) {
      const suffix = crypto.randomUUID();
      const request = signupRequest(
        accountType,
        `key-${suffix}`,
        `request-${suffix}`,
        `${accountType}-${suffix}@example.test`,
        [location(
          "location-1",
          confirmedConnection(accountEans[accountType]),
        )],
        await sha256Text(`${accountType}-${suffix}`),
      );
      assert((await callSignup(database, request)).ok === true, accountType);
    }
    pass(14);

    const replay = await callSignup(database, successRequest);
    const replayCount = await psql(
      database,
      `
      select count(*)
      from public.app_connection_declaration_sources
      where dossier_id = ${sqlText(successDossier)}::uuid;
    `,
    );
    assert(
      replay.replayed === true && replayCount === "1",
      "replay_duplicated_connection_source",
    );
    pass(15);

    const conflict = {
      ...successRequest,
      payload_hash: "f".repeat(64),
    };
    const conflictResponse = await callSignup(database, conflict);
    assert(
      conflictResponse.ok === false &&
        conflictResponse.code === "idempotency_conflict",
      "changed_payload_same_key_not_conflict",
    );
    pass(16);

    const concurrentSuffix = crypto.randomUUID();
    const concurrentRequest = signupRequest(
      "vve",
      `key-${concurrentSuffix}`,
      `request-${concurrentSuffix}`,
      `concurrent-${concurrentSuffix}@example.test`,
    );
    const concurrent = await Promise.all([
      psqlResult(database, callSql(concurrentRequest)),
      psqlResult(database, callSql(concurrentRequest)),
    ]);
    assert(
      concurrent.every((result) => result.success) &&
        (await attemptState(database, concurrentRequest)).split("|")[3] ===
          "1",
      `concurrent_duplicate_source:${
        concurrent.map((result) => scrub(result.stderr)).join(",")
      }`,
    );
    pass(17);

    await failureRequest(database, "after_connection_sources");
    pass(18);

    const failedAudit = await failureRequest(
      database,
      "during_connection_audit",
    );
    assert(
      (await callSignup(database, failedAudit)).ok === true &&
        (await attemptState(database, failedAudit)).split("|")[3] === "1",
      "replay_after_failure_did_not_succeed",
    );
    pass(19);

    assert(
      !edgeSource.includes(".from(") &&
        (edgeSource.match(/\.rpc\("app_submit_signup_v5"/g) || [])
            .length === 1 &&
        (edgeSource.match(/\.rpc\("app_submit_signup_v4"/g) || [])
            .length === 0,
      "edge_business_write_boundary_mismatch",
    );
    pass(20);

    const expectedPublicKeys = [
      "charger_count",
      "customer_id",
      "document_slot_count",
      "dossier_id",
      "legal_acceptance_count",
      "location_count",
      "message",
      "mode",
      "ok",
      "payload_hash",
      "request_id",
    ];
    assert(
      Object.keys(successBody).sort().join("|") ===
          expectedPublicKeys.sort().join("|") &&
        successBody.mode === "write_v3",
      "public_response_not_backward_compatible",
    );
    pass(21);

    const forbiddenTruth = await psql(
      database,
      `
      select
        (select count(*) from public.app_connections) || '|' ||
        (select count(*) from public.app_connection_periods) || '|' ||
        (select count(*) from public.app_connection_ownership_periods) || '|' ||
        (select count(*) from public.app_parties) || '|' ||
        (select count(*) from public.app_party_person_versions) || '|' ||
        (select count(*) from public.app_party_organization_versions) || '|' ||
        (select count(*) from public.app_cases) || '|' ||
        (select count(*) from public.app_case_party_roles);
    `,
    );
    assert(
      forbiddenTruth === "0|0|0|0|0|0|0|0" &&
        !correctionMigrationSource.includes("car_observed") &&
        !correctionMigrationSource.includes("eligibility_decision") &&
        !correctionMigrationSource.includes("api_lookup_verified"),
      "forbidden_connection_or_adjacent_truth_created",
    );
    pass(22);

    const frontendProof = await command("deno", [
      "eval",
      "--sloppy-imports",
      `import { runSignupSubmitMapperProof } from "./app/src/features/signup/signupSubmitMapper.proof.ts"; runSignupSubmitMapperProof();`,
    ]);
    assert(
      frontendProof.success &&
        mapperSource.includes("connectionDeclaration?:") &&
        validatorSource.includes("ean-confirmation") &&
        componentSource.includes("locations.find") &&
        componentSource.includes("energienota of beschikbare koppeling") &&
        componentSource.includes("EAN handmatig invoeren") &&
        !componentSource.includes("netbeheerder") &&
        !componentSource.includes('type="date"') &&
        !componentSource.includes("style={{") &&
        !componentSource.includes("geverifieerd"),
      `frontend_contract_proof_failed:${scrub(frontendProof.stderr)}`,
    );
    pass(23);
  } finally {
    await dropProofDatabase(database);
  }

  const disposableCount = await psql(
    MAIN_DATABASE,
    `
    select count(*)
    from pg_database
    where datname like 'enval_pilot_connection_01_%';
  `,
  );
  const mainCountsAfter = await appTableCounts(MAIN_DATABASE);
  const workspaceAfter = await workspaceSnapshot();
  assert(freshApplyCount === 1, `fresh_apply_count:${freshApplyCount}`);
  assert(disposableCount === "0", "disposable_databases_remain");
  assert(
    mapsEqual(mainCountsBefore, mainCountsAfter),
    "protected_app_counts_changed",
  );
  assert(
    mapsEqual(workspaceBefore, workspaceAfter),
    "workspace_changed_during_proof",
  );
  for (const table of protectedEmpty) {
    assert((mainCountsAfter.get(table) ?? 0) === 0, `real_${table}_changed`);
  }
  pass(24);

  assert(passed.size === 24, `expected_24_passes_got_${passed.size}`);
  console.log("signup-connection-declaration-sources-proof-ok");
}

await main();
