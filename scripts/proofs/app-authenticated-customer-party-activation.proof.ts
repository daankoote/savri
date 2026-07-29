// Local PILOT-PARTY-01A proof.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
//
// The fixed local ENVAL database is inspected only. All behavior fixtures run
// in one disposable database copied without business data and dropped in
// finally.

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
const EXPECTED_HEAD = "ccc27af20756f7483324948a0d49eb422f1fd4db";
const V1_FINGERPRINT = "690b68a752ac64b988bb69442dc8d20e";
const V2_FINGERPRINT = "56d1d4b8fc016bb4435e00cea077dc1d";
const V1_MIGRATION_SHA256 =
  "c43dc5183a86bc01de4a6e3420f6712eee7c806e9779014da015e7ec0f12e8f0";
const V2_MIGRATION_SHA256 =
  "66f0a8a494426f70e3673134c2f29664155ff83344385749779aa6d6d26adc30";
const MIGRATION_PATH =
  "supabase/migrations/20260729180000_app_authenticated_customer_party_activation.sql";
const PROOF_PATH =
  "scripts/proofs/app-authenticated-customer-party-activation.proof.ts";
const DOC_PATH =
  "docs/app/operations/pilot-party-01a-authenticated-customer-party-activation-local-proof.md";
const V1_SIGNATURE =
  "public.app_bootstrap_customer_auth_v1(uuid,text,text,text,text,text,text,text,text,text)";
const V2_SIGNATURE =
  "public.app_bootstrap_customer_auth_v2(uuid,text,text,text,text,text,text,text,text,text)";
const V3_SIGNATURE =
  "public.app_bootstrap_customer_auth_v3(uuid,text,text,text,text,text,text,text,text,text)";
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
    .replace(/enval_pilot_party_01a_[0-9_]+/g, "<proof-database>")
    .split("\n")
    .slice(0, 5)
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
    drop function if exists ${V3_SIGNATURE};
    drop index if exists public.app_parties_authenticated_customer_source_uidx;
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

async function seedFixture(
  database: string,
  accountType: "particulier" | "zakelijk" | "vve",
  dossierCount = 1,
): Promise<Fixture> {
  const authUserId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const email = `pilot-party-${crypto.randomUUID()}@example.test`;
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
        ${sqlText(`PARTY-${authUserId.slice(0, 8)}-${index + 1}`)},
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
  version: "v2" | "v3" = "v3",
): string {
  return `
    begin;
    set local role service_role;
    select public.app_bootstrap_customer_auth_${version}(
      ${sqlUuid(fixture.authUserId)},
      ${sqlText(fixture.email)},
      ${sqlText(`supabase_auth_user:${fixture.authUserId}`)},
      ${sqlText(`proof-${crypto.randomUUID()}`)},
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

async function callBootstrap(
  database: string,
  fixture: Fixture,
  scope = `pilot-party:${crypto.randomUUID()}`,
  key = `key-${crypto.randomUUID()}`,
  payloadHash = PAYLOAD_HASH,
  version: "v2" | "v3" = "v3",
): Promise<Record<string, unknown>> {
  const raw = await psql(
    database,
    callSql(fixture, scope, key, payloadHash, version),
  );
  const jsonLine = raw.split("\n").find((line) => line.startsWith("{"));
  assert(jsonLine, "rpc_json_response_missing");
  return JSON.parse(jsonLine);
}

async function partyIdsForCustomer(
  database: string,
  customerId: string,
): Promise<string[]> {
  const raw = await psql(
    database,
    `
    select distinct r.party_id
    from public.app_customer_party_relationships r
    where r.customer_id = ${sqlUuid(customerId)}
      and r.relationship_role = 'account_owner'
    order by r.party_id;
  `,
  );
  return raw.split("\n").filter(Boolean);
}

async function insertPartyBinding(
  database: string,
  customerId: string,
  partyKind: "natural_person" | "organization",
): Promise<string> {
  const partyId = crypto.randomUUID();
  await psql(
    database,
    `
    insert into public.app_parties (
      id, party_kind, source_type, source_reference_type,
      source_reference_id, request_id, actor_type, actor_ref
    ) values (
      ${sqlUuid(partyId)}, ${sqlText(partyKind)}, 'disposable_proof',
      'app_customer', ${sqlText(customerId)}, 'disposable-proof',
      'system', 'disposable-proof'
    );
    insert into public.app_customer_party_relationships (
      customer_id, party_id, relationship_role, valid_from,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      ${sqlUuid(customerId)}, ${sqlUuid(partyId)}, 'account_owner',
      current_date, 'disposable_proof', 'app_customer',
      ${sqlText(customerId)}, 'disposable-proof', 'system',
      'disposable-proof'
    );
  `,
  );
  return partyId;
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
      "app_parties",
      "app_party_person_versions",
      "app_party_organization_versions",
      "app_cases",
      "app_case_party_roles",
    ]
  ) {
    assert(mainCountsBefore.get(table) === 0, `real_${table}_not_empty`);
  }

  const database = `enval_pilot_party_01a_${Date.now()}`;
  const passed = new Set<number>();
  const pass = (id: number) => {
    assert(!passed.has(id), `duplicate_q${id}`);
    passed.add(id);
    console.log(`PILOT-PARTY-01A-Q${String(id).padStart(2, "0")}: PASS`);
  };

  try {
    for (
      const path of [
        MIGRATION_PATH,
        PROOF_PATH,
        DOC_PATH,
        "supabase/functions/api-app-auth-bootstrap/index.ts",
      ]
    ) {
      assert((await Deno.stat(path)).isFile, `required_path_missing:${path}`);
    }
    const migrationSource = await Deno.readTextFile(MIGRATION_PATH);
    assert(
      migrationSource.includes(
        "create or replace function public.app_bootstrap_customer_auth_v3(",
      ),
      "v3_source_missing",
    );
    pass(1);

    assert(
      await sha256File(
        "supabase/migrations/20260712100000_app_customer_auth_bootstrap_rpc.sql",
      ) === V1_MIGRATION_SHA256,
      "v1_migration_changed",
    );
    assert(
      await sha256File(
        "supabase/migrations/20260729140000_app_authenticated_dossier_case_activation.sql",
      ) === V2_MIGRATION_SHA256,
      "v2_migration_changed",
    );
    for (
      const [signature, fingerprint] of [
        [V1_SIGNATURE, V1_FINGERPRINT],
        [V2_SIGNATURE, V2_FINGERPRINT],
      ]
    ) {
      assert(
        await psql(
          MAIN_DATABASE,
          `select md5(pg_get_functiondef('${signature}'::regprocedure));`,
        ) === fingerprint,
        `${signature}_catalog_fingerprint_changed`,
      );
    }
    pass(2);

    await createProofDatabase(database);
    const v3Security = await psql(
      database,
      `
      select
        p.prosecdef || '|' ||
        coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
        has_function_privilege('service_role', '${V3_SIGNATURE}', 'EXECUTE')
      from pg_proc p
      where p.oid = '${V3_SIGNATURE}'::regprocedure;
    `,
    );
    assert(
      v3Security === 'true|search_path=""|true',
      `v3_security_mismatch:${v3Security}`,
    );
    pass(3);

    const v3Acl = await psql(
      database,
      `
      select
        has_function_privilege('anon', '${V3_SIGNATURE}', 'EXECUTE') || '|' ||
        has_function_privilege('authenticated', '${V3_SIGNATURE}', 'EXECUTE') || '|' ||
        has_function_privilege('public', '${V3_SIGNATURE}', 'EXECUTE');
    `,
    );
    assert(v3Acl === "false|false|false", `v3_acl_mismatch:${v3Acl}`);
    pass(4);

    const one = await seedFixture(database, "particulier");
    await callBootstrap(database, one);
    assert(
      (await partyIdsForCustomer(database, one.customerId)).length === 1,
      "customer_party_cardinality_mismatch",
    );
    pass(5);

    const multiple = await seedFixture(database, "zakelijk", 3);
    await callBootstrap(database, multiple);
    const multiplePartyIds = await partyIdsForCustomer(
      database,
      multiple.customerId,
    );
    const multiState = await psql(
      database,
      `
      select
        (select count(*) from public.app_cases
          where customer_id = ${sqlUuid(multiple.customerId)}) || '|' ||
        (select count(distinct party_id)
          from public.app_customer_party_relationships
          where customer_id = ${sqlUuid(multiple.customerId)}
            and relationship_role = 'account_owner');
    `,
    );
    assert(
      multiplePartyIds.length === 1 && multiState === "3|1",
      `multi_dossier_party_reuse_failed:${multiState}`,
    );
    pass(6);

    const distinctA = await seedFixture(database, "vve");
    const distinctB = await seedFixture(database, "vve");
    await callBootstrap(database, distinctA);
    await callBootstrap(database, distinctB);
    const distinctPartyA = await partyIdsForCustomer(
      database,
      distinctA.customerId,
    );
    const distinctPartyB = await partyIdsForCustomer(
      database,
      distinctB.customerId,
    );
    assert(
      distinctPartyA.length === 1 && distinctPartyB.length === 1 &&
        distinctPartyA[0] !== distinctPartyB[0],
      "different_customers_share_party",
    );
    pass(7);

    for (
      const [accountType, expectedKind] of [
        ["particulier", "natural_person"],
        ["zakelijk", "organization"],
        ["vve", "organization"],
      ] as const
    ) {
      const fixture = await seedFixture(database, accountType);
      await callBootstrap(database, fixture);
      const kind = await psql(
        database,
        `
        select p.party_kind
        from public.app_parties p
        join public.app_customer_party_relationships r
          on r.party_id = p.id
        where r.customer_id = ${sqlUuid(fixture.customerId)}
          and r.relationship_role = 'account_owner';
      `,
      );
      assert(kind === expectedKind, `${accountType}_party_kind_mismatch`);
    }
    pass(8);

    const forbiddenProfileRows = await psql(
      database,
      `
      select
        (select count(*) from public.app_party_person_versions) || '|' ||
        (select count(*) from public.app_party_organization_versions) || '|' ||
        coalesce((
          select sum((
            xpath(
              '/row/c/text()',
              query_to_xml(
                format('select count(*) as c from public.%I', table_name),
                false, true, ''
              )
            )
          )[1]::text::bigint)
          from information_schema.tables
          where table_schema = 'public'
            and table_name like 'app\\_party%identifier%' escape '\\'
        ), 0);
    `,
    );
    assert(forbiddenProfileRows === "0|0|0", "profile_or_identifier_created");
    pass(9);

    assert(
      await psql(
        database,
        "select count(*) from public.app_case_party_roles;",
      ) === "0",
      "case_party_role_created",
    );
    pass(10);

    const replay = await seedFixture(database, "particulier");
    const replayScope = `replay:${crypto.randomUUID()}`;
    const replayKey = `key-${crypto.randomUUID()}`;
    const replayFirst = await callBootstrap(
      database,
      replay,
      replayScope,
      replayKey,
    );
    const replaySecond = await callBootstrap(
      database,
      replay,
      replayScope,
      replayKey,
    );
    const replayState = await psql(
      database,
      `
      select
        (select count(*) from public.app_parties p
          join public.app_customer_party_relationships r on r.party_id = p.id
          where r.customer_id = ${sqlUuid(replay.customerId)}
            and r.relationship_role = 'account_owner') || '|' ||
        (select count(*) from public.app_audit_events
          where customer_id = ${sqlUuid(replay.customerId)}
            and event_type = 'authenticated_customer_party_root_activated'
            and idempotency_key = ${sqlText(replayKey)});
    `,
    );
    assert(
      replayFirst.ok === true && replaySecond.ok === true &&
        replaySecond.replayed === true && replayState === "1|1",
      `replay_duplicated_party_or_audit:${replayState}`,
    );
    pass(11);

    const conflict = await callBootstrap(
      database,
      replay,
      replayScope,
      replayKey,
      "b".repeat(64),
    );
    assert(
      conflict.ok === false && conflict.code === "idempotency_conflict",
      "idempotency_conflict_missing",
    );
    pass(12);

    const concurrent = await seedFixture(database, "zakelijk", 2);
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
      `concurrent_bootstrap_failed:${
        concurrentCalls.map((result) => scrub(result.stderr)).join(",")
      }`,
    );
    assert(
      (await partyIdsForCustomer(database, concurrent.customerId)).length ===
        1,
      "concurrent_duplicate_party",
    );
    pass(13);

    const resolved = await seedFixture(database, "vve");
    const preexistingParty = await insertPartyBinding(
      database,
      resolved.customerId,
      "organization",
    );
    await callBootstrap(database, resolved);
    const resolvedPartyIds = await partyIdsForCustomer(
      database,
      resolved.customerId,
    );
    const resolvedOutcome = await psql(
      database,
      `
      select event_data ->> 'party_activation_outcome'
      from public.app_audit_events
      where customer_id = ${sqlUuid(resolved.customerId)}
        and event_type = 'authenticated_customer_party_root_activated'
      order by created_at desc
      limit 1;
    `,
    );
    assert(
      resolvedPartyIds.length === 1 &&
        resolvedPartyIds[0] === preexistingParty &&
        resolvedOutcome === "resolved",
      "existing_valid_binding_not_resolved",
    );
    pass(14);

    const ambiguous = await seedFixture(database, "zakelijk");
    await insertPartyBinding(database, ambiguous.customerId, "organization");
    await insertPartyBinding(database, ambiguous.customerId, "organization");
    const ambiguousCall = await psqlResult(
      database,
      callSql(
        ambiguous,
        `ambiguous:${crypto.randomUUID()}`,
        `key-${crypto.randomUUID()}`,
      ),
    );
    assert(
      !ambiguousCall.success &&
        ambiguousCall.stderr.includes(
          "ambiguous current customer party binding",
        ),
      "ambiguous_binding_not_rejected",
    );
    pass(15);

    const partyRollback = await seedFixture(database, "particulier");
    await insertPartyBinding(
      database,
      partyRollback.customerId,
      "organization",
    );
    const partyRollbackScope = `party-rollback:${crypto.randomUUID()}`;
    const partyRollbackKey = `key-${crypto.randomUUID()}`;
    const partyFailure = await psqlResult(
      database,
      callSql(partyRollback, partyRollbackScope, partyRollbackKey),
    );
    assert(
      !partyFailure.success &&
        partyFailure.stderr.includes("conflicting customer party kind"),
      "party_failure_missing",
    );
    const partyRollbackState = await psql(
      database,
      `
      select
        (select auth_user_id is null from public.app_customer_identities
          where id = ${sqlUuid(partyRollback.identityId)}) || '|' ||
        (select count(*) from public.app_cases
          where customer_id = ${sqlUuid(partyRollback.customerId)}) || '|' ||
        (select count(*) from public.app_idempotency_keys
          where scope = ${sqlText(partyRollbackScope)}
            and key = ${sqlText(partyRollbackKey)});
    `,
    );
    assert(
      partyRollbackState === "true|0|0",
      `party_failure_not_atomic:${partyRollbackState}`,
    );

    const auditRollback = await seedFixture(database, "vve");
    await psql(
      database,
      `
      create function public.pilot_party_01a_reject_audit()
      returns trigger language plpgsql as $$
      begin
        if new.event_type = 'authenticated_customer_party_root_activated' then
          raise exception 'disposable party audit failure';
        end if;
        return new;
      end;
      $$;
      create trigger trg_pilot_party_01a_reject_audit
      before insert on public.app_audit_events
      for each row execute function public.pilot_party_01a_reject_audit();
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
        auditFailure.stderr.includes("disposable party audit failure"),
      "audit_failure_missing",
    );
    await psql(
      database,
      `
      drop trigger trg_pilot_party_01a_reject_audit
        on public.app_audit_events;
      drop function public.pilot_party_01a_reject_audit();
    `,
    );
    const auditRollbackState = await psql(
      database,
      `
      select
        (select auth_user_id is null from public.app_customer_identities
          where id = ${sqlUuid(auditRollback.identityId)}) || '|' ||
        (select count(*) from public.app_cases
          where customer_id = ${sqlUuid(auditRollback.customerId)}) || '|' ||
        (select count(*) from public.app_parties
          where source_type = 'authenticated_customer_party_root'
            and source_reference_id = ${
        sqlText(auditRollback.customerId)
      }) || '|' ||
        (select count(*) from public.app_idempotency_keys
          where scope = ${sqlText(auditScope)} and key = ${sqlText(auditKey)});
    `,
    );
    assert(
      auditRollbackState === "true|0|0|0",
      `audit_failure_not_atomic:${auditRollbackState}`,
    );
    pass(16);

    const responseFixture = await seedFixture(database, "particulier");
    const responseScope = `response:${crypto.randomUUID()}`;
    const responseKey = `key-${crypto.randomUUID()}`;
    const v2Response = await callBootstrap(
      database,
      responseFixture,
      responseScope,
      responseKey,
      PAYLOAD_HASH,
      "v2",
    );
    const v3Response = await callBootstrap(
      database,
      responseFixture,
      responseScope,
      responseKey,
    );
    const safeKeys = [
      "binding_status",
      "customer_id",
      "dossiers",
      "identity_id",
      "identity_status",
      "mode",
      "ok",
      "payload_hash",
      "replayed",
      "request_id",
    ];
    assert(
      Object.keys(v2Response).sort().join("|") === safeKeys.join("|") &&
        Object.keys(v3Response).sort().join("|") === safeKeys.join("|"),
      "public_response_shape_changed",
    );
    const serializedV3 = JSON.stringify(v3Response);
    for (
      const forbidden of [
        "party_id",
        "party_kind",
        "source_type",
        "source_reference",
        "profile",
        "relationship_role",
        "authority",
      ]
    ) {
      assert(
        !serializedV3.includes(forbidden),
        `public_response_exposes_${forbidden}`,
      );
    }
    const edgeSource = await Deno.readTextFile(
      "supabase/functions/api-app-auth-bootstrap/index.ts",
    );
    assert(
      edgeSource.includes(
        'SB.rpc("app_bootstrap_customer_auth_v3"',
      ) &&
        edgeSource.includes('const MODE = "auth_bootstrap_v2"'),
      "edge_v3_wiring_or_public_mode_changed",
    );
    pass(17);
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
    where datname like 'enval_pilot_party_01a_%';
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
      "app_parties",
      "app_party_person_versions",
      "app_party_organization_versions",
      "app_cases",
      "app_case_party_roles",
    ]
  ) {
    assert(mainCountsAfter.get(table) === 0, `real_${table}_changed`);
  }
  pass(18);

  assert(passed.size === 18, `expected_18_passes_got_${passed.size}`);
  console.log("authenticated-customer-party-activation-proof-ok");
}

await main();
