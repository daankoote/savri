// Local PILOT-CASE-01 proof.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
//
// The fixed local ENVAL database is inspected only. All case behavior runs in
// one disposable database copied without business data and dropped in finally.

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type Fixture = {
  authUserId: string;
  customerId: string;
  identityId: string;
  email: string;
  dossierIds: string[];
};

const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const EXPECTED_HEAD = "1f1d8159f5003799be10cf3fa23e06d3353eb833";
const V1_FINGERPRINT = "690b68a752ac64b988bb69442dc8d20e";
const V1_MIGRATION_SHA256 =
  "c43dc5183a86bc01de4a6e3420f6712eee7c806e9779014da015e7ec0f12e8f0";
const MIGRATION_PATH =
  "supabase/migrations/20260729140000_app_authenticated_dossier_case_activation.sql";
const PROOF_PATH =
  "scripts/proofs/app-authenticated-dossier-case-activation.proof.ts";
const DOC_PATH =
  "docs/app/operations/pilot-case-01-authenticated-dossier-case-activation-local-proof.md";
const RPC_SIGNATURE =
  "public.app_bootstrap_customer_auth_v2(uuid,text,text,text,text,text,text,text,text,text)";
const V1_SIGNATURE =
  "public.app_bootstrap_customer_auth_v1(uuid,text,text,text,text,text,text,text,text,text)";
const PAYLOAD_HASH = "a".repeat(64);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlUuid(value: string): string {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value),
    "invalid_uuid",
  );
  return `${sqlText(value)}::uuid`;
}

function scrub(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/enval_pilot_case_01_[0-9_]+/g, "<proof-database>")
    .split("\n")
    .slice(0, 4)
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
    drop function ${RPC_SIGNATURE};
    drop index public.app_cases_app_customer_dossier_source_uidx;
  `,
  );

  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const applied = await psqlResult(database, migration, true);
  assert(applied.success, `fresh_apply_failed:${scrub(applied.stderr)}`);
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

async function seedFixture(
  database: string,
  accountType: "particulier" | "zakelijk" | "vve",
  dossierCount = 1,
): Promise<Fixture> {
  const authUserId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const email = `pilot-case-${crypto.randomUUID()}@example.test`;
  const dossierIds = Array.from(
    { length: dossierCount },
    () => crypto.randomUUID(),
  );

  await psql(
    database,
    `
    insert into auth.users (
      id, email, email_confirmed_at, created_at, updated_at,
      is_sso_user, is_anonymous
    ) values (
      ${sqlUuid(authUserId)}, ${sqlText(email)}, now(), now(), now(),
      false, false
    );
    insert into public.app_customers (
      id, customer_type, primary_email_normalized, status
    ) values (
      ${sqlUuid(customerId)}, ${sqlText(accountType)}, ${
      sqlText(email)
    }, 'active'
    );
    insert into public.app_customer_identities (
      id, customer_id, auth_user_id, email_normalized,
      email_verified_at, identity_provider, status
    ) values (
      ${sqlUuid(identityId)}, ${sqlUuid(customerId)}, null, ${sqlText(email)},
      now(), 'supabase', 'active'
    );
    ${
      dossierIds.map((dossierId, index) => `
      insert into public.app_customer_dossiers (
        id, customer_id, dossier_number, account_type, status, submitted_at
      ) values (
        ${sqlUuid(dossierId)}, ${sqlUuid(customerId)},
        ${sqlText(`PROOF-${authUserId.slice(0, 8)}-${index + 1}`)},
        ${sqlText(accountType)}, 'submitted', now()
      );`).join("\n")
    }
  `,
  );

  return { authUserId, customerId, identityId, email, dossierIds };
}

function callSql(
  fixture: Fixture,
  scope: string,
  key: string,
  payloadHash = PAYLOAD_HASH,
  requestId = `proof-${crypto.randomUUID()}`,
): string {
  return `
    begin;
    set local role service_role;
    select public.app_bootstrap_customer_auth_v2(
      ${sqlUuid(fixture.authUserId)},
      ${sqlText(fixture.email)},
      ${sqlText(`supabase_auth_user:${fixture.authUserId}`)},
      ${sqlText(requestId)},
      ${sqlText(scope)},
      ${sqlText(key)},
      ${sqlText(payloadHash)},
      null,
      null,
      'local-disposable-proof'
    )::text;
    commit;
  `;
}

async function callV2(
  database: string,
  fixture: Fixture,
  scope = `pilot-case:${crypto.randomUUID()}`,
  key = `key-${crypto.randomUUID()}`,
  payloadHash = PAYLOAD_HASH,
): Promise<Record<string, unknown>> {
  const raw = await psql(database, callSql(fixture, scope, key, payloadHash));
  const jsonLine = raw.split("\n").find((line) => line.startsWith("{"));
  assert(jsonLine, "rpc_json_response_missing");
  return JSON.parse(jsonLine);
}

async function caseCount(
  database: string,
  dossierId?: string,
): Promise<number> {
  const where = dossierId
    ? `where source_class = 'app_customer_dossier' and source_ref = ${
      sqlText(dossierId)
    }`
    : "";
  return Number(
    await psql(database, `select count(*) from public.app_cases ${where};`),
  );
}

function dossierResponse(
  response: Record<string, unknown>,
): Array<Record<string, unknown>> {
  assert(Array.isArray(response.dossiers), "dossiers_response_missing");
  return response.dossiers as Array<Record<string, unknown>>;
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
  assert(mainCountsBefore.get("app_cases") === 0, "real_cases_not_empty");
  assert(
    mainCountsBefore.get("app_case_party_roles") === 0,
    "real_case_party_roles_not_empty",
  );

  const database = `enval_pilot_case_01_${Date.now()}`;
  const passed = new Set<number>();
  const pass = (id: number) => {
    assert(!passed.has(id), `duplicate_q${id}`);
    passed.add(id);
    console.log(`PILOT-CASE-01-Q${String(id).padStart(2, "0")}: PASS`);
  };

  try {
    const requiredPaths = [
      MIGRATION_PATH,
      PROOF_PATH,
      DOC_PATH,
      "supabase/functions/api-app-auth-bootstrap/index.ts",
      "supabase/functions/api-app-dashboard-get/index.ts",
      "app/src/features/auth/authBootstrapClient.ts",
      "app/src/features/dashboard/dashboardReadClient.ts",
      "app/src/features/dashboard/ActivePrivateDashboard.tsx",
      "docs/app/contracts/auth.md",
      "docs/app/contracts/customer-party-representation-case.md",
      "docs/app/contracts/signup-dashboard.md",
    ];
    for (const path of requiredPaths) {
      assert((await Deno.stat(path)).isFile, `required_path_missing:${path}`);
    }
    pass(1);

    assert(
      await sha256File(
        "supabase/migrations/20260712100000_app_customer_auth_bootstrap_rpc.sql",
      ) === V1_MIGRATION_SHA256,
      "v1_migration_changed",
    );
    assert(
      await psql(
        MAIN_DATABASE,
        `select md5(pg_get_functiondef('${V1_SIGNATURE}'::regprocedure));`,
      ) === V1_FINGERPRINT,
      "v1_catalog_fingerprint_changed",
    );
    pass(2);

    await createProofDatabase(database);
    const v2Security = await psql(
      database,
      `
      select
        p.prosecdef || '|' ||
        coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
        has_function_privilege('service_role', '${RPC_SIGNATURE}', 'EXECUTE')
      from pg_proc p
      where p.oid = '${RPC_SIGNATURE}'::regprocedure;
    `,
    );
    assert(
      v2Security === 'true|search_path=""|true',
      `v2_security_mismatch:${v2Security}`,
    );
    pass(3);

    const v2Acl = await psql(
      database,
      `
      select
        has_function_privilege('anon', '${RPC_SIGNATURE}', 'EXECUTE') || '|' ||
        has_function_privilege('authenticated', '${RPC_SIGNATURE}', 'EXECUTE') || '|' ||
        has_function_privilege('public', '${RPC_SIGNATURE}', 'EXECUTE');
    `,
    );
    assert(v2Acl === "false|false|false", `v2_acl_mismatch:${v2Acl}`);
    pass(4);

    const indexDefinition = await psql(
      database,
      `
      select pg_get_indexdef(indexrelid)
      from pg_index
      where indexrelid =
        'public.app_cases_app_customer_dossier_source_uidx'::regclass;
    `,
    );
    assert(
      indexDefinition.includes("UNIQUE INDEX") &&
        indexDefinition.includes("(source_class, source_ref)") &&
        indexDefinition.includes(
          "source_class = 'app_customer_dossier'::text",
        ),
      "source_unique_index_mismatch",
    );
    pass(5);

    for (
      const [id, accountType] of [
        [6, "particulier"],
        [7, "zakelijk"],
        [8, "vve"],
      ] as const
    ) {
      const fixture = await seedFixture(database, accountType);
      const response = await callV2(database, fixture);
      assert(response.ok === true, `${accountType}_bootstrap_failed`);
      assert(
        await caseCount(database, fixture.dossierIds[0]) === 1,
        `${accountType}_case_count`,
      );
      pass(id);
    }

    const multiple = await seedFixture(database, "zakelijk", 3);
    const multipleResponse = await callV2(database, multiple);
    assert(
      dossierResponse(multipleResponse).length === 3,
      "multi_dossier_response_count",
    );
    for (const dossierId of multiple.dossierIds) {
      assert(
        await caseCount(database, dossierId) === 1,
        "multi_dossier_case_count",
      );
    }
    pass(9);

    const allCaseRefs = await psql(
      database,
      `
      select count(*)
      from public.app_cases
      where case_reference <> 'CASE-' || source_ref
        or case_reference !~ '^CASE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    `,
    );
    assert(allCaseRefs === "0", "non_deterministic_case_reference");
    pass(10);

    const replayFixture = await seedFixture(database, "particulier");
    const replayScope = `replay:${crypto.randomUUID()}`;
    const replayKey = `key-${crypto.randomUUID()}`;
    const replayFirst = await callV2(
      database,
      replayFixture,
      replayScope,
      replayKey,
    );
    const replayAuditBefore = await psql(
      database,
      `
      select count(*) from public.app_audit_events
      where event_type = 'authenticated_dossier_case_activated'
        and idempotency_key = ${sqlText(replayKey)};
    `,
    );
    const replaySecond = await callV2(
      database,
      replayFixture,
      replayScope,
      replayKey,
    );
    const replayAuditAfter = await psql(
      database,
      `
      select count(*) from public.app_audit_events
      where event_type = 'authenticated_dossier_case_activated'
        and idempotency_key = ${sqlText(replayKey)};
    `,
    );
    assert(
      replayFirst.ok === true && replaySecond.ok === true &&
        replaySecond.replayed === true,
      "replay_response_invalid",
    );
    assert(
      await caseCount(database, replayFixture.dossierIds[0]) === 1 &&
        replayAuditBefore === "1" && replayAuditAfter === "1",
      "replay_duplicated_state",
    );
    pass(11);

    const conflictResponse = await callV2(
      database,
      replayFixture,
      replayScope,
      replayKey,
      "b".repeat(64),
    );
    assert(
      conflictResponse.ok === false &&
        conflictResponse.code === "idempotency_conflict",
      "idempotency_conflict_missing",
    );
    pass(12);

    const concurrent = await seedFixture(database, "vve");
    const concurrentCalls = await Promise.all([
      psqlResult(
        database,
        callSql(
          concurrent,
          `concurrent-a:${crypto.randomUUID()}`,
          `key-${crypto.randomUUID()}`,
        ),
      ),
      psqlResult(
        database,
        callSql(
          concurrent,
          `concurrent-b:${crypto.randomUUID()}`,
          `key-${crypto.randomUUID()}`,
        ),
      ),
    ]);
    assert(
      concurrentCalls.every((result) => result.success),
      "concurrent_bootstrap_failed",
    );
    for (const result of concurrentCalls) {
      const jsonLine = result.stdout.split("\n").find((line) =>
        line.startsWith("{")
      );
      assert(
        jsonLine && JSON.parse(jsonLine).ok === true,
        "concurrent_response_invalid",
      );
    }
    assert(
      await caseCount(database, concurrent.dossierIds[0]) === 1,
      "concurrent_duplicate_case",
    );
    pass(13);

    const resolved = await seedFixture(database, "particulier");
    await psql(
      database,
      `
      insert into public.app_cases (
        customer_id, case_reference, created_at, created_by_actor_type,
        created_by_actor_ref, source_class, source_ref, request_id
      ) values (
        ${sqlUuid(resolved.customerId)},
        ${sqlText(`CASE-${resolved.dossierIds[0]}`)},
        now(), 'system', 'disposable-proof',
        'app_customer_dossier', ${sqlText(resolved.dossierIds[0])},
        'disposable-proof'
      );
    `,
    );
    const resolvedResponse = await callV2(database, resolved);
    assert(
      resolvedResponse.ok === true &&
        await caseCount(database, resolved.dossierIds[0]) === 1,
      "valid_case_not_resolved",
    );
    const resolvedAudit = await psql(
      database,
      `
      select event_data ->> 'case_activation_outcome'
      from public.app_audit_events
      where dossier_id = ${sqlUuid(resolved.dossierIds[0])}
        and event_type = 'authenticated_dossier_case_activated'
      order by created_at desc limit 1;
    `,
    );
    assert(resolvedAudit === "resolved", "resolved_audit_missing");
    pass(14);

    const conflicting = await seedFixture(database, "zakelijk");
    await psql(
      database,
      `
      insert into public.app_cases (
        customer_id, case_reference, created_at, created_by_actor_type,
        created_by_actor_ref, source_class, source_ref, request_id
      ) values (
        ${sqlUuid(conflicting.customerId)},
        ${sqlText(`CONFLICT-${conflicting.dossierIds[0]}`)},
        now(), 'system', 'disposable-proof',
        'app_customer_dossier', ${sqlText(conflicting.dossierIds[0])},
        'disposable-proof'
      );
    `,
    );
    const conflictingCall = await psqlResult(
      database,
      callSql(
        conflicting,
        `conflict:${crypto.randomUUID()}`,
        `key-${crypto.randomUUID()}`,
      ),
    );
    assert(
      !conflictingCall.success &&
        conflictingCall.stderr.includes("conflicting dossier case source"),
      "conflicting_case_not_rejected",
    );
    const duplicateInsert = await psqlResult(
      database,
      `
      insert into public.app_cases (
        customer_id, case_reference, created_at, created_by_actor_type,
        created_by_actor_ref, source_class, source_ref, request_id
      ) values (
        ${sqlUuid(conflicting.customerId)}, ${
        sqlText(`OTHER-${crypto.randomUUID()}`)
      },
        now(), 'system', 'disposable-proof',
        'app_customer_dossier', ${sqlText(conflicting.dossierIds[0])},
        'disposable-proof'
      );
    `,
    );
    assert(!duplicateInsert.success, "duplicate_source_not_rejected");
    pass(15);

    const caseRollback = await seedFixture(database, "particulier");
    await psql(
      database,
      `
      insert into public.app_cases (
        customer_id, case_reference, created_at, created_by_actor_type,
        created_by_actor_ref, source_class, source_ref, request_id
      ) values (
        ${sqlUuid(caseRollback.customerId)},
        ${sqlText(`CONFLICT-${caseRollback.dossierIds[0]}`)},
        now(), 'system', 'disposable-proof',
        'app_customer_dossier', ${sqlText(caseRollback.dossierIds[0])},
        'disposable-proof'
      );
    `,
    );
    const rollbackScope = `rollback:${crypto.randomUUID()}`;
    const rollbackKey = `key-${crypto.randomUUID()}`;
    const caseFailure = await psqlResult(
      database,
      callSql(caseRollback, rollbackScope, rollbackKey),
    );
    assert(!caseFailure.success, "case_failure_missing");
    const caseRollbackState = await psql(
      database,
      `
      select
        (select auth_user_id is null from public.app_customer_identities
          where id = ${sqlUuid(caseRollback.identityId)}) || '|' ||
        (select count(*) from public.app_idempotency_keys
          where scope = ${sqlText(rollbackScope)}
            and key = ${sqlText(rollbackKey)});
    `,
    );
    assert(
      caseRollbackState === "true|0",
      `case_failure_not_atomic:${caseRollbackState}`,
    );
    pass(16);

    const auditRollback = await seedFixture(database, "vve");
    await psql(
      database,
      `
      create function public.pilot_case_01_reject_audit()
      returns trigger language plpgsql as $$
      begin
        if new.event_type = 'authenticated_dossier_case_activated' then
          raise exception 'disposable audit failure';
        end if;
        return new;
      end;
      $$;
      create trigger trg_pilot_case_01_reject_audit
      before insert on public.app_audit_events
      for each row execute function public.pilot_case_01_reject_audit();
    `,
    );
    const auditScope = `audit-rollback:${crypto.randomUUID()}`;
    const auditKey = `key-${crypto.randomUUID()}`;
    const auditFailure = await psqlResult(
      database,
      callSql(auditRollback, auditScope, auditKey),
    );
    assert(
      !auditFailure.success &&
        auditFailure.stderr.includes("disposable audit failure"),
      "audit_failure_missing",
    );
    await psql(
      database,
      `
      drop trigger trg_pilot_case_01_reject_audit on public.app_audit_events;
      drop function public.pilot_case_01_reject_audit();
    `,
    );
    const auditRollbackState = await psql(
      database,
      `
      select
        (select auth_user_id is null from public.app_customer_identities
          where id = ${sqlUuid(auditRollback.identityId)}) || '|' ||
        (select count(*) from public.app_cases
          where source_ref = ${sqlText(auditRollback.dossierIds[0])}) || '|' ||
        (select count(*) from public.app_idempotency_keys
          where scope = ${sqlText(auditScope)} and key = ${sqlText(auditKey)});
    `,
    );
    assert(
      auditRollbackState === "true|0|0",
      `audit_failure_not_atomic:${auditRollbackState}`,
    );
    pass(17);

    const owner = await seedFixture(database, "particulier");
    const other = await seedFixture(database, "particulier");
    await callV2(database, owner);
    assert(
      await caseCount(database, owner.dossierIds[0]) === 1 &&
        await caseCount(database, other.dossierIds[0]) === 0,
      "non_customer_dossier_activated",
    );
    pass(18);

    const crossProjection = await psql(
      database,
      `
      select count(*)
      from public.app_cases
      where customer_id = ${sqlUuid(owner.customerId)}
        and source_class = 'app_customer_dossier'
        and source_ref = ${sqlText(other.dossierIds[0])};
    `,
    );
    assert(crossProjection === "0", "cross_account_case_projected");
    pass(19);

    const eligibility = await seedFixture(database, "zakelijk");
    const minimizedId = crypto.randomUUID();
    const expiredId = crypto.randomUUID();
    await psql(
      database,
      `
      insert into public.app_customer_dossiers (
        id, customer_id, account_type, status, minimized_at
      ) values (
        ${sqlUuid(minimizedId)}, ${sqlUuid(eligibility.customerId)},
        'zakelijk', 'submitted', now()
      ), (
        ${sqlUuid(expiredId)}, ${sqlUuid(eligibility.customerId)},
        'zakelijk', 'expired_minimized', null
      );
    `,
    );
    const eligibilityResponse = await callV2(database, eligibility);
    assert(
      dossierResponse(eligibilityResponse).length === 1 &&
        await caseCount(database, eligibility.dossierIds[0]) === 1 &&
        await caseCount(database, minimizedId) === 0 &&
        await caseCount(database, expiredId) === 0,
      "ineligible_dossier_activated",
    );
    pass(20);

    assert(
      await psql(
        database,
        "select count(*) from public.app_case_party_roles;",
      ) === "0",
      "case_party_role_created",
    );
    pass(21);

    const partyRows = await psql(
      database,
      `
      select coalesce(sum(row_count), 0)
      from (
        select (
          xpath(
            '/row/c/text()',
            query_to_xml(
              format('select count(*) as c from public.%I', table_name),
              false, true, ''
            )
          )
        )[1]::text::bigint as row_count
        from information_schema.tables
        where table_schema = 'public'
          and (
            table_name like 'app_party%'
            or table_name like 'app_representation%'
            or table_name like 'app_mandate%'
          )
      ) counts;
    `,
    );
    assert(partyRows === "0", "party_or_authority_rows_created");
    pass(22);

    const unrelatedRows = await psql(
      database,
      `
      select coalesce(sum(row_count), 0)
      from (
        select (
          xpath(
            '/row/c/text()',
            query_to_xml(
              format('select count(*) as c from public.%I', table_name),
              false, true, ''
            )
          )
        )[1]::text::bigint as row_count
        from information_schema.tables
        where table_schema = 'public'
          and (
            table_name like 'app_location%'
            or table_name like 'app_connection%'
            or table_name like 'app_ean%'
            or table_name like 'app_evidence%'
            or table_name like 'app_kwh%'
            or table_name like 'app_workforce%'
          )
      ) counts;
    `,
    );
    assert(unrelatedRows === "0", "unrelated_domain_rows_created");
    pass(23);

    const dashboardSource = await Deno.readTextFile(
      "supabase/functions/api-app-dashboard-get/index.ts",
    );
    const readModelSource = dashboardSource.slice(
      dashboardSource.indexOf("async function loadDashboardReadModel"),
      dashboardSource.indexOf("serve(async"),
    );
    assert(
      !/\.(?:insert|update|delete|upsert|rpc)\(/.test(readModelSource),
      "dashboard_read_model_writes",
    );
    assert(
      !dashboardSource.includes("insertAppAudit") &&
        !/\.(?:insert|update|delete|upsert|rpc)\(/.test(dashboardSource),
      "dashboard_endpoint_write_path_found",
    );
    pass(24);

    assert(
      (readModelSource.match(/\.from\("app_cases"\)/g) || []).length === 1 &&
        !/for\s*\([^)]*\)[\s\S]{0,240}\.from\(/.test(readModelSource),
      "dashboard_case_read_not_bounded_bulk",
    );
    pass(25);

    assert(
      dashboardSource.includes("case_id: string;") &&
        dashboardSource.includes("case_reference: string;") &&
        dashboardSource.includes("case_id: caseId") &&
        dashboardSource.includes("case_reference: caseReference"),
      "dashboard_case_projection_missing",
    );
    pass(26);

    const responseType = dashboardSource.slice(
      dashboardSource.indexOf("type SafeDossier"),
      dashboardSource.indexOf("type SafeLocation"),
    );
    assert(
      !responseType.includes("source_class") &&
        !responseType.includes("source_ref") &&
        !responseType.includes("event_data"),
      "dashboard_internal_case_fields_exposed",
    );
    pass(27);

    const authClient = await Deno.readTextFile(
      "app/src/features/auth/authBootstrapClient.ts",
    );
    assert(
      authClient.includes('stringField(item, "case_id")') &&
        authClient.includes('stringField(item, "case_reference")') &&
        authClient.includes("CASE_REFERENCE_RE.test(caseReference)") &&
        authClient.includes('body.mode !== "auth_bootstrap_v2"'),
      "auth_client_case_validation_missing",
    );
    pass(28);

    const dashboardClient = await Deno.readTextFile(
      "app/src/features/dashboard/dashboardReadClient.ts",
    );
    assert(
      dashboardClient.includes('stringField(value, "case_id")') &&
        dashboardClient.includes('stringField(value, "case_reference")') &&
        dashboardClient.includes("CASE_REFERENCE_RE.test(caseReference)") &&
        !dashboardClient.includes("`CASE-${"),
      "dashboard_client_validation_or_fallback_mismatch",
    );
    pass(29);

    const dashboardComponent = await Deno.readTextFile(
      "app/src/features/dashboard/ActivePrivateDashboard.tsx",
    );
    assert(
      dashboardComponent.includes('label: "Zaakreferentie"') &&
        dashboardComponent.includes(
          "value: model.selected_dossier.case_reference",
        ) &&
        dashboardComponent.includes('className="portal-info-row"') &&
        !dashboardComponent.includes("style={{"),
      "dashboard_component_case_row_mismatch",
    );
    pass(30);

    assert(
      dashboardComponent.includes("selectedDossierId") &&
        dashboardComponent.includes("DocumentUploadCard") &&
        dashboardComponent.includes("onRefreshSelectedDossier") &&
        dashboardClient.includes("document_slots"),
      "selected_dossier_or_document_contract_missing",
    );
    pass(31);
  } finally {
    await dropProofDatabase(database);
  }

  const databaseRemains = await psql(
    MAIN_DATABASE,
    `select count(*) from pg_database where datname = ${sqlText(database)};`,
  );
  const mainCountsAfter = await appTableCounts(MAIN_DATABASE);
  const workspaceAfter = await workspaceSnapshot();
  assert(databaseRemains === "0", "disposable_database_remains");
  assert(
    mapsEqual(mainCountsBefore, mainCountsAfter),
    "protected_app_counts_changed",
  );
  assert(
    mapsEqual(workspaceBefore, workspaceAfter),
    "workspace_changed_during_proof",
  );
  assert(
    mainCountsAfter.get("app_cases") === 0 &&
      mainCountsAfter.get("app_case_party_roles") === 0,
    "real_case_tables_changed",
  );
  pass(32);

  assert(passed.size === 32, `expected_32_passes_got_${passed.size}`);
  console.log("authenticated-dossier-case-activation-proof-ok");
}

await main();
