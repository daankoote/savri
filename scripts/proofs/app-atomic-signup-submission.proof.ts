// Local PILOT-SIGNUP-ATOMIC-01 proof.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
//
// The fixed local ENVAL database is inspected only. All signup fixtures and
// failure injection run in one disposable schema-only database and are dropped
// in finally.

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type AccountType = "particulier" | "zakelijk" | "vve";

const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const EXPECTED_HEAD = "25f3925716a43dd2c9495bdf4f1c1db79f85dd57";
const MIGRATION_PATH =
  "supabase/migrations/20260729220000_app_atomic_signup_submission.sql";
const PROOF_PATH = "scripts/proofs/app-atomic-signup-submission.proof.ts";
const DOC_PATH = "docs/app/operations/pilot-signup-atomic-01-local-proof.md";
const EDGE_PATH = "supabase/functions/api-app-signup-submit/index.ts";
const RPC_SIGNATURE = "public.app_submit_signup_v4(jsonb)";
const V1_SIGNATURE =
  "public.app_bootstrap_customer_auth_v1(uuid,text,text,text,text,text,text,text,text,text)";
const V2_SIGNATURE =
  "public.app_bootstrap_customer_auth_v2(uuid,text,text,text,text,text,text,text,text,text)";
const V3_SIGNATURE =
  "public.app_bootstrap_customer_auth_v3(uuid,text,text,text,text,text,text,text,text,text)";
const EXPECTED_AUTH_FINGERPRINTS = new Map([
  [V1_SIGNATURE, "690b68a752ac64b988bb69442dc8d20e"],
  [V2_SIGNATURE, "56d1d4b8fc016bb4435e00cea077dc1d"],
  [V3_SIGNATURE, "fa10dbbd12ae110d8368679fdcda1113"],
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function scrub(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/enval_pilot_signup_atomic_01_[0-9_]+/g, "<proof-database>")
    .split("\n")
    .slice(0, 8)
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
    drop function if exists ${RPC_SIGNATURE};
    drop table if exists public.app_party_declaration_sources cascade;
    drop function if exists
      public.app_party_declaration_sources_immutable_guard();
  `,
  );

  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const applied = await psqlResult(database, migration, true);
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

function signupRequest(
  accountType: AccountType,
  key: string,
  requestId: string,
  email: string,
  payloadHash = "a".repeat(64),
): Record<string, unknown> {
  const person = accountType === "particulier";
  const organizationClassification = accountType === "zakelijk"
    ? "business"
    : "vve";
  const organizationName = accountType === "zakelijk"
    ? "Atomic Proof B.V."
    : "VvE Atomic Proof";

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
    display_name: person ? "Atomic Person" : organizationName,
    declaration: person
      ? {
        declaration_kind: "natural_person",
        person_first_name: "Atomic",
        person_last_name: "Person",
        person_full_name: "Atomic Person",
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
    locations: [{
      client_location_id: "location-1",
      label: "Proof location",
      postcode_normalized: "2042PC",
      house_number: "65",
      suffix_normalized: null,
      street: "Proofstraat",
      city: "Zandvoort",
      country: "Nederland",
      lookup_provider: "pdok",
      lookup_provider_id: "proof-observation",
      lookup_metadata: {
        normalized_lookup_key: "2042PC|65|",
      },
      chargers: [{
        client_charger_id: "charger-1-1",
        brand_id: "1",
        brand_label: "Proof brand",
        manual_brand: null,
        model_id: "1",
        model_label: "Proof model",
        manual_model: null,
        serial_number: "SER-PROOF",
        mid_number: "MID-PROOF",
        backend_supplier_id: null,
        backend_supplier_label: null,
        manual_backend_supplier: null,
        installation_year: 2025,
        solar_export_status: "none",
      }],
    }],
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
    select public.app_submit_signup_v4(
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
      (select count(*) from public.app_customer_identities
        where email_normalized = ${sqlText(email)}) || '|' ||
      (select count(*) from public.app_customer_dossiers d
        join public.app_customers c on c.id = d.customer_id
        where c.primary_email_normalized = ${sqlText(email)}) || '|' ||
      (select count(*) from public.app_party_declaration_sources
        where source_request_id = ${sqlText(requestId)}) || '|' ||
      (select count(*) from public.app_audit_events
        where request_id = ${sqlText(requestId)}) || '|' ||
      (select count(*) from public.app_intake_audit_events
        where request_id = ${sqlText(requestId)}) || '|' ||
      (select count(*) from public.app_idempotency_keys
        where scope = 'api-app-signup-submit:v3'
          and key = ${sqlText(key)});
  `,
  );
}

async function proveFailureAndReplay(
  database: string,
  stage: string,
): Promise<void> {
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
    await attemptState(database, request) === "0|0|0|0|0|0|0",
    `partial_rows_after_${stage}`,
  );
  const replay = await callSignup(database, request);
  assert(replay.ok === true, `replay_failed_after_${stage}`);
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
  for (
    const table of [
      "app_party_declaration_sources",
      "app_parties",
      "app_customer_party_relationships",
      "app_party_person_versions",
      "app_party_organization_versions",
      "app_cases",
      "app_case_party_roles",
    ]
  ) {
    assert(
      (mainCountsBefore.get(table) ?? 0) === 0,
      `real_${table}_not_empty`,
    );
  }

  for (const [signature, fingerprint] of EXPECTED_AUTH_FINGERPRINTS) {
    assert(
      await psql(
        MAIN_DATABASE,
        `select md5(pg_get_functiondef('${signature}'::regprocedure));`,
      ) === fingerprint,
      `${signature}_fingerprint_changed`,
    );
  }

  const database = `enval_pilot_signup_atomic_01_${Date.now()}`;
  const passed = new Set<number>();
  const pass = (id: number) => {
    assert(!passed.has(id), `duplicate_q${id}`);
    passed.add(id);
    console.log(
      `PILOT-SIGNUP-ATOMIC-01-Q${String(id).padStart(2, "0")}: PASS`,
    );
  };

  try {
    for (const path of [MIGRATION_PATH, PROOF_PATH, DOC_PATH, EDGE_PATH]) {
      assert((await Deno.stat(path)).isFile, `required_path_missing:${path}`);
    }
    const migrationSource = await Deno.readTextFile(MIGRATION_PATH);
    assert(
      (migrationSource.match(
            /create table public\.app_party_declaration_sources/g,
          ) || []).length === 1 &&
        (migrationSource.match(
            /create or replace function public\.app_submit_signup_v4/g,
          ) || []).length === 1,
      "bounded_schema_manifest_mismatch",
    );
    pass(1);

    await createProofDatabase(database);

    const rpcSecurity = await psql(
      database,
      `
      select
        p.prosecdef || '|' ||
        coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
        has_function_privilege(
          'service_role', '${RPC_SIGNATURE}', 'EXECUTE'
        )
      from pg_proc p
      where p.oid = '${RPC_SIGNATURE}'::regprocedure;
    `,
    );
    const rpcAcl = await psql(
      database,
      `
      select
        has_function_privilege(
          'public', '${RPC_SIGNATURE}', 'EXECUTE'
        ) || '|' ||
        has_function_privilege(
          'anon', '${RPC_SIGNATURE}', 'EXECUTE'
        ) || '|' ||
        has_function_privilege(
          'authenticated', '${RPC_SIGNATURE}', 'EXECUTE'
        );
    `,
    );
    assert(
      rpcSecurity === 'true|search_path=""|true' &&
        rpcAcl === "false|false|false",
      `rpc_security_mismatch:${rpcSecurity}:${rpcAcl}`,
    );
    pass(2);

    const tableSecurity = await psql(
      database,
      `
      select
        c.relrowsecurity || '|' ||
        (select count(*) from pg_policy
          where polrelid = c.oid and polname = 'deny_all') || '|' ||
        has_table_privilege(
          'service_role', c.oid, 'SELECT'
        ) || '|' ||
        has_table_privilege(
          'service_role', c.oid, 'INSERT'
        ) || '|' ||
        has_table_privilege(
          'service_role', c.oid, 'UPDATE'
        ) || '|' ||
        has_table_privilege(
          'service_role', c.oid, 'DELETE'
        ) || '|' ||
        has_table_privilege(
          'service_role', c.oid, 'TRUNCATE'
        ) || '|' ||
        has_table_privilege(
          'anon', c.oid, 'SELECT'
        ) || '|' ||
        has_table_privilege(
          'authenticated', c.oid, 'SELECT'
        )
      from pg_class c
      where c.oid = 'public.app_party_declaration_sources'::regclass;
    `,
    );
    assert(
      tableSecurity ===
        "true|1|true|true|false|false|false|false|false",
      `declaration_table_security_mismatch:${tableSecurity}`,
    );
    pass(3);

    const immutableRequest = signupRequest(
      "particulier",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `immutable-${crypto.randomUUID()}@example.test`,
    );
    const immutableResult = await callSignup(database, immutableRequest);
    const immutableDossier = String(
      (immutableResult.body as Record<string, unknown>).dossier_id,
    );
    for (
      const mutation of [
        `update public.app_party_declaration_sources
        set environment = 'changed'
        where dossier_id = ${sqlText(immutableDossier)}::uuid;`,
        `delete from public.app_party_declaration_sources
        where dossier_id = ${sqlText(immutableDossier)}::uuid;`,
        "truncate table public.app_party_declaration_sources;",
      ]
    ) {
      const result = await psqlResult(database, mutation);
      assert(
        !result.success &&
          result.stderr.includes(
            "app_party_declaration_sources rows are immutable",
          ),
        "declaration_mutation_allowed",
      );
    }
    pass(4);

    const invalidPerson = signupRequest(
      "particulier",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `invalid-person-${crypto.randomUUID()}@example.test`,
    );
    const invalidPersonDeclaration = invalidPerson
      .declaration as Record<string, unknown>;
    invalidPersonDeclaration.person_first_name = "";
    invalidPersonDeclaration.person_full_name = "Person";
    const invalidPersonResponse = await callSignup(database, invalidPerson);
    assert(
      invalidPersonResponse.ok === false &&
        invalidPersonResponse.code === "invalid_signup_contract",
      "person_name_requiredness_missing",
    );
    pass(5);

    const invalidBusiness = signupRequest(
      "zakelijk",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `invalid-business-${crypto.randomUUID()}@example.test`,
    );
    const invalidBusinessDeclaration = invalidBusiness
      .declaration as Record<string, unknown>;
    invalidBusinessDeclaration.organization_legal_name = "";
    invalidBusinessDeclaration.trade_register_number = "123";
    const invalidBusinessResponse = await callSignup(
      database,
      invalidBusiness,
    );
    assert(
      invalidBusinessResponse.ok === false &&
        invalidBusinessResponse.code === "invalid_signup_contract",
      "business_declaration_validation_missing",
    );
    pass(6);

    const invalidVve = signupRequest(
      "vve",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `invalid-vve-${crypto.randomUUID()}@example.test`,
    );
    const invalidVveDeclaration = invalidVve
      .declaration as Record<string, unknown>;
    invalidVveDeclaration.organization_classification = "business";
    const invalidVveResponse = await callSignup(database, invalidVve);
    assert(
      invalidVveResponse.ok === false &&
        invalidVveResponse.code === "invalid_signup_contract",
      "vve_declaration_validation_missing",
    );
    pass(7);

    const edgeSource = await Deno.readTextFile(EDGE_PATH);
    assert(
      !edgeSource.includes('split("@")') &&
        !migrationSource.includes("person_address") &&
        !migrationSource.includes("organization_address") &&
        !migrationSource.includes("verified_kvk"),
      "email_or_location_promoted_to_profile_truth",
    );
    pass(8);

    const successRequest = signupRequest(
      "particulier",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `success-${crypto.randomUUID()}@example.test`,
    );
    const success = await callSignup(database, successRequest);
    const successBody = success.body as Record<string, unknown>;
    const successState = await psql(
      database,
      `
      select
        (select count(*) from public.app_customers
          where primary_email_normalized =
            ${sqlText(String(successRequest.email_normalized))}) || '|' ||
        (select count(*) from public.app_customer_identities
          where email_normalized =
            ${sqlText(String(successRequest.email_normalized))}) || '|' ||
        (select count(*) from public.app_customer_dossiers
          where id = ${sqlText(String(successBody.dossier_id))}::uuid) || '|' ||
        (select count(*) from public.app_dossier_locations
          where dossier_id =
            ${sqlText(String(successBody.dossier_id))}::uuid) || '|' ||
        (select count(*) from public.app_dossier_chargers
          where dossier_id =
            ${sqlText(String(successBody.dossier_id))}::uuid) || '|' ||
        (select count(*) from public.app_dossier_document_slots
          where dossier_id =
            ${sqlText(String(successBody.dossier_id))}::uuid) || '|' ||
        (select count(*) from public.app_dossier_legal_acceptances
          where dossier_id =
            ${sqlText(String(successBody.dossier_id))}::uuid) || '|' ||
        (select count(*) from public.app_party_declaration_sources
          where dossier_id =
            ${sqlText(String(successBody.dossier_id))}::uuid);
    `,
    );
    assert(
      success.ok === true &&
        successState === "1|1|1|1|1|3|2|1",
      `successful_signup_shape_mismatch:${successState}`,
    );
    pass(9);

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
    pass(10);

    const replay = await callSignup(database, successRequest);
    const replayBody = replay.body as Record<string, unknown>;
    assert(
      replay.replayed === true &&
        JSON.stringify(replayBody) === JSON.stringify(successBody) &&
        await attemptState(database, successRequest) === "1|1|1|1|7|1|1",
      "replay_not_exact_or_duplicated",
    );
    pass(11);

    const conflictRequest = {
      ...successRequest,
      payload_hash: "d".repeat(64),
    };
    const conflict = await callSignup(database, conflictRequest);
    assert(
      conflict.ok === false &&
        conflict.code === "idempotency_conflict",
      "payload_conflict_not_rejected",
    );
    pass(12);

    const concurrentRequest = signupRequest(
      "zakelijk",
      `key-${crypto.randomUUID()}`,
      `request-${crypto.randomUUID()}`,
      `concurrent-${crypto.randomUUID()}@example.test`,
    );
    const concurrentCalls = await Promise.all([
      psqlResult(database, callSql(concurrentRequest)),
      psqlResult(database, callSql(concurrentRequest)),
    ]);
    assert(
      concurrentCalls.every((result) => result.success),
      `concurrent_signup_failed:${
        concurrentCalls.map((result) => scrub(result.stderr)).join(",")
      }`,
    );
    const concurrentState = await attemptState(database, concurrentRequest);
    assert(
      concurrentState === "1|1|1|1|7|1|1",
      `concurrent_duplicate_dossier:${concurrentState}`,
    );
    pass(13);

    assert(
      (await attemptState(database, concurrentRequest)).split("|")[3] === "1",
      "concurrent_duplicate_declaration_source",
    );
    pass(14);

    await proveFailureAndReplay(database, "after_customer");
    pass(15);

    await proveFailureAndReplay(database, "after_dossier");
    pass(16);

    await proveFailureAndReplay(database, "after_underlying_objects");
    pass(17);

    await proveFailureAndReplay(database, "after_declaration_source");
    pass(18);

    const auditSuffix = crypto.randomUUID();
    const auditRequest = signupRequest(
      "vve",
      `key-${auditSuffix}`,
      `request-${auditSuffix}`,
      `audit-${auditSuffix}@example.test`,
    );
    await psql(
      database,
      `
      create function public.pilot_signup_atomic_reject_audit()
      returns trigger
      language plpgsql
      as $$
      begin
        if new.event_type = 'signup_party_declaration_recorded' then
          raise exception 'disposable signup audit failure';
        end if;
        return new;
      end;
      $$;
      create trigger trg_pilot_signup_atomic_reject_audit
      before insert on public.app_audit_events
      for each row
      execute function public.pilot_signup_atomic_reject_audit();
    `,
    );
    const auditFailure = await psqlResult(database, callSql(auditRequest));
    assert(
      !auditFailure.success &&
        auditFailure.stderr.includes("disposable signup audit failure") &&
        await attemptState(database, auditRequest) === "0|0|0|0|0|0|0",
      "audit_failure_not_atomic",
    );
    await psql(
      database,
      `
      drop trigger trg_pilot_signup_atomic_reject_audit
        on public.app_audit_events;
      drop function public.pilot_signup_atomic_reject_audit();
    `,
    );
    assert(
      (await callSignup(database, auditRequest)).ok === true,
      "audit_failure_replay_failed",
    );
    pass(19);

    await proveFailureAndReplay(database, "before_idempotency_completion");
    const incomplete = await psql(
      database,
      `
      select count(*)
      from public.app_idempotency_keys
      where scope = 'api-app-signup-submit:v3'
        and response_status is null
        and response_body is null;
    `,
    );
    assert(incomplete === "0", "permanent_request_in_progress_remains");
    pass(20);

    assert(
      !edgeSource.includes(".from(") &&
        !edgeSource.includes("insertAppAudit") &&
        !edgeSource.includes("insertAppIntakeAudit") &&
        (edgeSource.match(/\.rpc\("app_submit_signup_v4"/g) || [])
            .length === 1,
      "edge_contains_direct_business_writes",
    );
    pass(21);

    const forbiddenTruth = await psql(
      database,
      `
      select
        (select count(*) from public.app_parties) || '|' ||
        (select count(*) from public.app_party_person_versions) || '|' ||
        (select count(*) from public.app_party_organization_versions) || '|' ||
        (select count(*) from public.app_cases) || '|' ||
        (select count(*) from public.app_case_party_roles);
    `,
    );
    assert(
      forbiddenTruth === "0|0|0|0|0" &&
        !migrationSource.includes("case_confirmed") &&
        !migrationSource.includes("representation_authority") &&
        !migrationSource.includes("eligibility_decision"),
      "forbidden_profile_role_authority_or_eligibility_truth_created",
    );
    pass(22);

    const mainFunctionFingerprint = await psql(
      MAIN_DATABASE,
      `select md5(pg_get_functiondef('${RPC_SIGNATURE}'::regprocedure));`,
    );
    const proofFunctionFingerprint = await psql(
      database,
      `select md5(pg_get_functiondef('${RPC_SIGNATURE}'::regprocedure));`,
    );
    assert(
      freshApplyCount === 1 &&
        mainFunctionFingerprint === proofFunctionFingerprint,
      `fresh_apply_or_function_body_mismatch:${freshApplyCount}`,
    );
    pass(23);
  } finally {
    await dropProofDatabase(database);
  }

  const databaseRemains = await psql(
    MAIN_DATABASE,
    `select count(*) from pg_database where datname = ${sqlText(database)};`,
  );
  const disposableDatabaseCount = await psql(
    MAIN_DATABASE,
    `
    select count(*)
    from pg_database
    where datname like 'enval_pilot_signup_atomic_01_%';
  `,
  );
  const mainCountsAfter = await appTableCounts(MAIN_DATABASE);
  const workspaceAfter = await workspaceSnapshot();
  assert(freshApplyCount === 1, `fresh_apply_count:${freshApplyCount}`);
  assert(databaseRemains === "0", "disposable_database_remains");
  assert(disposableDatabaseCount === "0", "disposable_databases_remain");
  assert(
    mapsEqual(mainCountsBefore, mainCountsAfter),
    "protected_app_counts_changed",
  );
  assert(
    mapsEqual(workspaceBefore, workspaceAfter),
    "workspace_changed_during_proof",
  );
  for (
    const table of [
      "app_party_declaration_sources",
      "app_parties",
      "app_customer_party_relationships",
      "app_party_person_versions",
      "app_party_organization_versions",
      "app_cases",
      "app_case_party_roles",
    ]
  ) {
    assert(
      (mainCountsAfter.get(table) ?? 0) === 0,
      `real_${table}_changed`,
    );
  }
  pass(24);

  assert(passed.size === 24, `expected_24_passes_got_${passed.size}`);
  console.log("atomic-signup-submission-proof-ok");
}

await main();
