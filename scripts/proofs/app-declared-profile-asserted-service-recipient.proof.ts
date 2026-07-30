// Local PILOT-PROFILE-02 proof.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
//
// The fixed local ENVAL database is inspected only. All behavior fixtures run
// in one disposable schema-only database and are dropped in finally.

type CommandResult = {
  success: boolean;
  stdout: string;
  stderr: string;
};

type AccountType = "particulier" | "zakelijk" | "vve";

type Fixture = {
  authUserId: string;
  customerId: string;
  identityId: string;
  email: string;
  accountType: AccountType;
  dossierIds: string[];
};

type DeclarationFacts = {
  firstName?: string;
  lastName?: string;
  legalName?: string;
  tradeRegisterNumber?: string;
};

const CONTAINER = "supabase_db_enval";
const MAIN_DATABASE = "postgres";
const EXPECTED_HEAD = "f04e18aa0a6266c035fe40cca68da40c450831b7";
const MIGRATION_PATH =
  "supabase/migrations/20260730100000_app_declared_profile_asserted_service_recipient.sql";
const PROOF_PATH =
  "scripts/proofs/app-declared-profile-asserted-service-recipient.proof.ts";
const DOC_PATH = "docs/app/operations/pilot-profile-02-local-proof.md";
const EDGE_PATH = "supabase/functions/api-app-auth-bootstrap/index.ts";
const V1_SIGNATURE =
  "public.app_bootstrap_customer_auth_v1(uuid,text,text,text,text,text,text,text,text,text)";
const V2_SIGNATURE =
  "public.app_bootstrap_customer_auth_v2(uuid,text,text,text,text,text,text,text,text,text)";
const V3_SIGNATURE =
  "public.app_bootstrap_customer_auth_v3(uuid,text,text,text,text,text,text,text,text,text)";
const V4_SIGNATURE =
  "public.app_bootstrap_customer_auth_v4(uuid,text,text,text,text,text,text,text,text,text)";
const EXPECTED_FINGERPRINTS = new Map([
  [V1_SIGNATURE, "690b68a752ac64b988bb69442dc8d20e"],
  [V2_SIGNATURE, "56d1d4b8fc016bb4435e00cea077dc1d"],
  [V3_SIGNATURE, "fa10dbbd12ae110d8368679fdcda1113"],
]);
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
    .replace(/enval_pilot_profile_02_[0-9_]+/g, "<proof-database>")
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
    drop function if exists ${V4_SIGNATURE};
    drop trigger if exists trg_app_asserted_service_recipient_guard
      on public.app_case_party_roles;
    drop function if exists public.app_asserted_service_recipient_guard();
    drop index if exists
      public.app_party_person_versions_declared_source_uidx;
    drop index if exists
      public.app_party_organization_versions_declared_source_uidx;
    drop index if exists
      public.app_case_party_roles_asserted_service_recipient_idx;
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
  accountType: AccountType,
  dossierCount = 1,
): Promise<Fixture> {
  const authUserId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  const identityId = crypto.randomUUID();
  const email = `pilot-profile-${crypto.randomUUID()}@example.test`;
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
        ${sqlText(`PROFILE-${authUserId.slice(0, 8)}-${index + 1}`)},
        ${sqlText(accountType)}, 'submitted', now()
      );`).join("\n")
    }
  `,
  );

  return {
    authUserId,
    customerId,
    identityId,
    email,
    accountType,
    dossierIds,
  };
}

async function seedDeclarations(
  database: string,
  fixture: Fixture,
  facts: DeclarationFacts,
  timestamps: string[] = [],
  coverage = fixture.dossierIds.length,
): Promise<string[]> {
  const sourceIds = fixture.dossierIds.slice(0, coverage).map(() =>
    crypto.randomUUID()
  );
  const declarationKind = fixture.accountType === "particulier"
    ? "natural_person"
    : "organization";
  const classification = fixture.accountType === "zakelijk"
    ? "business"
    : fixture.accountType === "vve"
    ? "vve"
    : null;
  const firstName = facts.firstName || "Declared";
  const lastName = facts.lastName || "Person";
  const fullName = `${firstName} ${lastName}`;
  const legalName = facts.legalName || "Declared Organization";
  const tradeRegisterNumber = facts.tradeRegisterNumber || "12345678";

  await psql(
    database,
    sourceIds.map((sourceId, index) => {
      const timestamp = timestamps[index] ||
        `2026-07-${String(20 + index).padStart(2, "0")} 10:00:00+00`;
      return `
      insert into public.app_party_declaration_sources (
        id, customer_id, dossier_id, account_type, declaration_kind,
        declared_at, valid_from, created_at,
        person_first_name, person_last_name, person_full_name,
        organization_classification, organization_legal_name,
        trade_register_number, source_type, source_request_id,
        source_payload_sha256, declarative_actor_ref, environment
      ) values (
        ${sqlUuid(sourceId)}, ${sqlUuid(fixture.customerId)},
        ${sqlUuid(fixture.dossierIds[index])}, ${sqlText(fixture.accountType)},
        ${sqlText(declarationKind)}, ${sqlText(timestamp)}::timestamptz,
        ${sqlText(timestamp)}::timestamptz,
        ${sqlText(timestamp)}::timestamptz,
        ${fixture.accountType === "particulier" ? sqlText(firstName) : "null"},
        ${fixture.accountType === "particulier" ? sqlText(lastName) : "null"},
        ${fixture.accountType === "particulier" ? sqlText(fullName) : "null"},
        ${classification ? sqlText(classification) : "null"},
        ${fixture.accountType === "particulier" ? "null" : sqlText(legalName)},
        ${
        fixture.accountType === "particulier"
          ? "null"
          : sqlText(tradeRegisterNumber)
      },
        'signup_applicant_declaration',
        ${sqlText(`signup-source-${sourceId}`)}, ${sqlText("b".repeat(64))},
        'anonymous_signup_applicant', 'local-disposable-proof'
      );`;
    }).join("\n"),
  );

  return sourceIds;
}

function callSql(
  fixture: Fixture,
  scope: string,
  key: string,
  version: "v3" | "v4" = "v4",
  failureStage?: string,
): string {
  return `
    begin;
    set local role service_role;
    ${
    failureStage
      ? `set local enval.proof_failure_stage = ${sqlText(failureStage)};`
      : ""
  }
    select public.app_bootstrap_customer_auth_${version}(
      ${sqlUuid(fixture.authUserId)},
      ${sqlText(fixture.email)},
      ${sqlText(`supabase_auth_user:${fixture.authUserId}`)},
      ${sqlText(`proof-${crypto.randomUUID()}`)},
      ${sqlText(scope)},
      ${sqlText(key)},
      ${sqlText(PAYLOAD_HASH)},
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
  scope = `pilot-profile:${crypto.randomUUID()}`,
  key = `key-${crypto.randomUUID()}`,
  version: "v3" | "v4" = "v4",
): Promise<Record<string, unknown>> {
  const raw = await psql(database, callSql(fixture, scope, key, version));
  const jsonLine = raw.split("\n").find((line) => line.startsWith("{"));
  assert(jsonLine, "rpc_json_response_missing");
  return JSON.parse(jsonLine);
}

async function targetState(
  database: string,
  fixture: Fixture,
): Promise<string> {
  return await psql(
    database,
    `
    select
      (select count(*) from public.app_parties p
        join public.app_customer_party_relationships r on r.party_id = p.id
        where r.customer_id = ${sqlUuid(fixture.customerId)}
          and r.relationship_role = 'account_owner') || '|' ||
      (select count(*) from public.app_party_person_versions pv
        join public.app_parties p on p.id = pv.party_id
        join public.app_customer_party_relationships r on r.party_id = p.id
        where r.customer_id = ${sqlUuid(fixture.customerId)}) || '|' ||
      (select count(*) from public.app_party_organization_versions ov
        join public.app_parties p on p.id = ov.party_id
        join public.app_customer_party_relationships r on r.party_id = p.id
        where r.customer_id = ${sqlUuid(fixture.customerId)}) || '|' ||
      (select count(*) from public.app_cases
        where customer_id = ${sqlUuid(fixture.customerId)}) || '|' ||
      (select count(*) from public.app_case_party_roles role
        join public.app_cases c on c.id = role.case_id
        where c.customer_id = ${sqlUuid(fixture.customerId)});
  `,
  );
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
    assert(mainCountsBefore.get(table) === 0, `real_${table}_not_empty`);
  }

  const database = `enval_pilot_profile_02_${Date.now()}`;
  const passed = new Set<number>();
  const pass = (id: number) => {
    assert(!passed.has(id), `duplicate_q${id}`);
    passed.add(id);
    console.log(
      `PILOT-PROFILE-02-Q${String(id).padStart(2, "0")}: PASS`,
    );
  };

  try {
    for (const path of [MIGRATION_PATH, PROOF_PATH, DOC_PATH, EDGE_PATH]) {
      assert((await Deno.stat(path)).isFile, `required_path_missing:${path}`);
    }
    const migrationSource = await Deno.readTextFile(MIGRATION_PATH);
    assert(
      migrationSource.includes(
        "create or replace function public.app_bootstrap_customer_auth_v4(",
      ) &&
        migrationSource.includes(
          "create or replace function public.app_asserted_service_recipient_guard()",
        ) &&
        migrationSource.includes(
          "(v_source.valid_from at time zone 'Europe/Amsterdam')::date",
        ),
      "migration_manifest_or_temporal_contract_missing",
    );
    pass(1);

    for (const [signature, fingerprint] of EXPECTED_FINGERPRINTS) {
      assert(
        await psql(
          MAIN_DATABASE,
          `select md5(pg_get_functiondef('${signature}'::regprocedure));`,
        ) === fingerprint,
        `${signature}_fingerprint_changed`,
      );
    }
    pass(2);

    await createProofDatabase(database);
    const security = await psql(
      database,
      `
      select p.prosecdef || '|' ||
        coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
        has_function_privilege('service_role', '${V4_SIGNATURE}', 'EXECUTE')
      from pg_proc p where p.oid = '${V4_SIGNATURE}'::regprocedure;
    `,
    );
    assert(
      security === 'true|search_path=""|true',
      `v4_security_mismatch:${security}`,
    );
    pass(3);

    const acl = await psql(
      database,
      `
      select
        has_function_privilege('public', '${V4_SIGNATURE}', 'EXECUTE') || '|' ||
        has_function_privilege('anon', '${V4_SIGNATURE}', 'EXECUTE') || '|' ||
        has_function_privilege('authenticated', '${V4_SIGNATURE}', 'EXECUTE');
    `,
    );
    assert(acl === "false|false|false", `v4_acl_mismatch:${acl}`);
    pass(4);

    const noSource = await seedFixture(database, "particulier");
    const noSourceResponse = await callBootstrap(database, noSource);
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
    const edgeSource = await Deno.readTextFile(EDGE_PATH);
    assert(
      noSourceResponse.ok === true &&
        noSourceResponse.mode === "auth_bootstrap_v2" &&
        Object.keys(noSourceResponse).sort().join("|") ===
          safeKeys.join("|") &&
        edgeSource.includes('SB.rpc("app_bootstrap_customer_auth_v4"') &&
        !edgeSource.includes('SB.rpc("app_bootstrap_customer_auth_v3"'),
      "safe_response_or_edge_v4_wiring_changed",
    );
    pass(5);

    assert(
      await targetState(database, noSource) === "1|0|0|1|0",
      "no_source_created_profile_or_role",
    );
    pass(6);

    const partial = await seedFixture(database, "particulier", 2);
    await seedDeclarations(database, partial, {}, [], 1);
    const partialResponse = await callBootstrap(database, partial);
    assert(
      partialResponse.ok === false &&
        partialResponse.code === "party_declaration_incomplete" &&
        await targetState(database, partial) === "0|0|0|0|0",
      "partial_coverage_not_fail_closed",
    );
    pass(7);

    const conflicting = await seedFixture(database, "particulier", 2);
    await seedDeclarations(
      database,
      conflicting,
      {
        firstName: "First",
        lastName: "Declaration",
      },
      [],
      1,
    );
    await seedDeclarations(database, {
      ...conflicting,
      dossierIds: [conflicting.dossierIds[1]],
    }, {
      firstName: "Other",
      lastName: "Declaration",
    });
    const conflictResponse = await callBootstrap(database, conflicting);
    assert(
      conflictResponse.ok === false &&
        conflictResponse.code === "party_declaration_conflict" &&
        await targetState(database, conflicting) === "0|0|0|0|0",
      "conflicting_declarations_not_fail_closed",
    );
    pass(8);

    const person = await seedFixture(database, "particulier");
    const personSources = await seedDeclarations(database, person, {
      firstName: "Declared",
      lastName: "Citizen",
    });
    await callBootstrap(database, person);
    const personState = await psql(
      database,
      `
      select pv.full_name || '|' || pv.valid_from || '|' ||
        pv.source_reference_id
      from public.app_party_person_versions pv
      join public.app_customer_party_relationships r on r.party_id = pv.party_id
      where r.customer_id = ${sqlUuid(person.customerId)};
    `,
    );
    assert(
      personState === `Declared Citizen|2026-07-20|${personSources[0]}`,
      `person_profile_mismatch:${personState}`,
    );
    pass(9);

    const business = await seedFixture(database, "zakelijk");
    await seedDeclarations(database, business, {
      legalName: "Declared Business B.V.",
      tradeRegisterNumber: "87654321",
    });
    await callBootstrap(database, business);
    const businessState = await psql(
      database,
      `
      select ov.legal_name || '|' || ov.organization_classification || '|' ||
        coalesce(ov.trade_register_number, '<null>')
      from public.app_party_organization_versions ov
      join public.app_customer_party_relationships r on r.party_id = ov.party_id
      where r.customer_id = ${sqlUuid(business.customerId)};
    `,
    );
    assert(
      businessState === "Declared Business B.V.|business|<null>",
      `business_profile_mismatch:${businessState}`,
    );
    pass(10);

    const vve = await seedFixture(database, "vve");
    await seedDeclarations(database, vve, {
      legalName: "VvE Declared",
      tradeRegisterNumber: "11223344",
    });
    await callBootstrap(database, vve);
    assert(
      await psql(
        database,
        `
        select ov.legal_name || '|' || ov.organization_classification
        from public.app_party_organization_versions ov
        join public.app_customer_party_relationships r on r.party_id = ov.party_id
        where r.customer_id = ${sqlUuid(vve.customerId)};
      `,
      ) === "VvE Declared|vve",
      "vve_profile_mismatch",
    );
    pass(11);

    const migrationLower = migrationSource.toLowerCase();
    assert(
      !migrationLower.includes("primary_email_normalized") &&
        !migrationLower.includes("app_dossier_locations") &&
        !migrationLower.includes("representation_authority") &&
        !migrationLower.includes("case_contact"),
      "contact_location_or_authority_inference_present",
    );
    pass(12);

    assert(
      businessState.endsWith("|<null>") &&
        !migrationSource.includes("verified_kvk") &&
        !migrationSource.includes("party_identifier"),
      "trade_register_promoted_or_verified",
    );
    pass(13);

    const temporal = await seedFixture(database, "particulier", 2);
    const temporalSources = await seedDeclarations(
      database,
      temporal,
      { firstName: "Temporal", lastName: "Proof" },
      [
        "2026-07-30 23:30:00+00",
        "2026-07-31 01:00:00+00",
      ],
    );
    await psql(
      database,
      `set timezone = 'Asia/Makassar'; ${
        callSql(
          temporal,
          `temporal:${crypto.randomUUID()}`,
          `key-${crypto.randomUUID()}`,
        )
      }`,
    );
    const temporalState = await psql(
      database,
      `
      select s.valid_from || '|' || pv.valid_from || '|' ||
        pv.source_reference_id || '|' ||
        pg_typeof(pv.valid_from)::text
      from public.app_party_person_versions pv
      join public.app_party_declaration_sources s
        on s.id::text = pv.source_reference_id
      join public.app_customer_party_relationships r on r.party_id = pv.party_id
      where r.customer_id = ${sqlUuid(temporal.customerId)};
    `,
    );
    const timezoneDates = await psql(
      database,
      `
      set timezone = 'UTC';
      select ('2026-07-30 23:30:00+00'::timestamptz
        at time zone 'Europe/Amsterdam')::date;
      set timezone = 'Europe/Amsterdam';
      select ('2026-07-30 23:30:00+00'::timestamptz
        at time zone 'Europe/Amsterdam')::date;
      set timezone = 'Asia/Makassar';
      select ('2026-07-30 23:30:00+00'::timestamptz
        at time zone 'Europe/Amsterdam')::date;
    `,
    );
    assert(
      temporalState ===
          `2026-07-30 23:30:00+00|2026-07-31|${temporalSources[0]}|date` &&
        timezoneDates.split("\n").filter((line) => /^\d{4}-/.test(line))
            .join("|") === "2026-07-31|2026-07-31|2026-07-31" &&
        !migrationSource.includes("profile_valid_from_timestamp"),
      `temporal_mapping_mismatch:${temporalState}:${timezoneDates}`,
    );
    pass(14);

    const roleState = await psql(
      database,
      `
      select count(*) || '|' ||
        min(role_type) || '|' || min(claim_status) || '|' ||
        min(num_nonnulls(
          person_profile_version_id,
          organization_profile_version_id
        ))
      from public.app_case_party_roles r
      join public.app_cases c on c.id = r.case_id
      where c.customer_id = ${sqlUuid(temporal.customerId)};
    `,
    );
    assert(roleState === "2|service_recipient|asserted|1", roleState);
    pass(15);

    const forbiddenClaims = await psql(
      database,
      `
      select count(*) from public.app_case_party_roles
      where claim_status = 'case_confirmed'
        or role_type <> 'service_recipient'
        or decision_at is not null
        or decided_by_actor_ref is not null;
    `,
    );
    assert(forbiddenClaims === "0", "forbidden_case_claim_created");
    pass(16);

    const replayScope = `replay:${crypto.randomUUID()}`;
    const replayKey = `key-${crypto.randomUUID()}`;
    const replayFixture = await seedFixture(database, "particulier", 2);
    await seedDeclarations(database, replayFixture, {});
    const replayOne = await callBootstrap(
      database,
      replayFixture,
      replayScope,
      replayKey,
    );
    const replayTwo = await callBootstrap(
      database,
      replayFixture,
      replayScope,
      replayKey,
    );
    assert(
      replayOne.ok === true && replayTwo.ok === true &&
        replayTwo.replayed === true &&
        await targetState(database, replayFixture) === "1|1|0|2|2",
      "replay_duplicated_profile_or_role",
    );
    pass(17);

    const concurrent = await seedFixture(database, "zakelijk", 2);
    await seedDeclarations(database, concurrent, {});
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
      concurrentCalls.every((result) => result.success) &&
        (await targetState(database, concurrent)).split("|")[2] === "1",
      `concurrent_profile_failure:${
        concurrentCalls.map((result) => scrub(result.stderr)).join(",")
      }`,
    );
    pass(18);

    assert(
      (await targetState(database, concurrent)) === "1|0|1|2|2",
      "concurrent_role_duplicate",
    );
    pass(19);

    const resolved = await seedFixture(database, "particulier");
    const resolvedSources = await seedDeclarations(database, resolved, {
      firstName: "Existing",
      lastName: "Profile",
    });
    await callBootstrap(
      database,
      resolved,
      `resolved-base:${crypto.randomUUID()}`,
      `key-${crypto.randomUUID()}`,
      "v3",
    );
    await psql(
      database,
      `
      with binding as (
        select r.party_id from public.app_customer_party_relationships r
        where r.customer_id = ${sqlUuid(resolved.customerId)}
          and r.relationship_role = 'account_owner'
      ), profile as (
        insert into public.app_party_person_versions (
          party_id, full_name, valid_from, source_type,
          source_reference_type, source_reference_id, request_id,
          actor_type, actor_ref
        )
        select party_id, 'Existing Profile', date '2026-07-20',
          'signup_applicant_declaration',
          'app_party_declaration_sources', ${sqlText(resolvedSources[0])},
          ${sqlText(`signup-source-${resolvedSources[0]}`)},
          'customer', 'disposable-existing'
        from binding returning id, party_id
      )
      insert into public.app_case_party_roles (
        case_id, party_id, person_profile_version_id, role_type,
        claim_status, valid_from, recorded_at, recorded_by_actor_type,
        recorded_by_actor_ref, source_class, source_ref, request_id
      )
      select c.id, p.party_id, p.id, 'service_recipient', 'asserted',
        now(), now(), 'customer', 'disposable-existing',
        'signup_applicant_declaration', ${sqlText(resolvedSources[0])},
        'disposable-existing'
      from profile p
      join public.app_cases c
        on c.customer_id = ${sqlUuid(resolved.customerId)};
    `,
    );
    await callBootstrap(database, resolved);
    assert(
      await targetState(database, resolved) === "1|1|0|1|1",
      "existing_profile_or_role_not_resolved",
    );
    pass(20);

    const profileConflict = await seedFixture(database, "particulier");
    await seedDeclarations(database, profileConflict, {
      firstName: "Expected",
      lastName: "Truth",
    });
    await callBootstrap(
      database,
      profileConflict,
      `profile-conflict-base:${crypto.randomUUID()}`,
      `key-${crypto.randomUUID()}`,
      "v3",
    );
    await psql(
      database,
      `
      insert into public.app_party_person_versions (
        party_id, full_name, valid_from, source_type,
        source_reference_type, source_reference_id, request_id,
        actor_type, actor_ref
      )
      select r.party_id, 'Conflicting Truth', date '2026-07-20',
        'manual_review', 'manual', 'conflict', 'conflict',
        'system', 'disposable-conflict'
      from public.app_customer_party_relationships r
      where r.customer_id = ${sqlUuid(profileConflict.customerId)}
        and r.relationship_role = 'account_owner';
    `,
    );
    const profileConflictResponse = await callBootstrap(
      database,
      profileConflict,
    );

    const roleConflict = await seedFixture(database, "particulier");
    const roleConflictSources = await seedDeclarations(database, roleConflict, {
      firstName: "Role",
      lastName: "Conflict",
    });
    await callBootstrap(
      database,
      roleConflict,
      `role-conflict-base:${crypto.randomUUID()}`,
      `key-${crypto.randomUUID()}`,
      "v3",
    );
    await psql(
      database,
      `
      with binding as (
        select r.party_id from public.app_customer_party_relationships r
        where r.customer_id = ${sqlUuid(roleConflict.customerId)}
          and r.relationship_role = 'account_owner'
      ), profile as (
        insert into public.app_party_person_versions (
          party_id, full_name, valid_from, source_type,
          source_reference_type, source_reference_id, request_id,
          actor_type, actor_ref
        )
        select party_id, 'Role Conflict', date '2026-07-20',
          'signup_applicant_declaration',
          'app_party_declaration_sources', ${sqlText(roleConflictSources[0])},
          ${sqlText(`signup-source-${roleConflictSources[0]}`)},
          'customer', 'disposable-role-conflict'
        from binding returning id, party_id
      )
      insert into public.app_case_party_roles (
        case_id, party_id, person_profile_version_id, role_type,
        claim_status, valid_from, recorded_at, recorded_by_actor_type,
        recorded_by_actor_ref, source_class, source_ref, request_id,
        decision_at, decided_by_actor_type, decided_by_actor_ref,
        decision_reason
      )
      select c.id, p.party_id, p.id, 'service_recipient', 'case_confirmed',
        now(), now(), 'system', 'disposable-role-conflict',
        'manual_review', 'conflict', 'disposable-role-conflict',
        now(), 'system', 'disposable-role-conflict', 'manual confirmation'
      from profile p
      join public.app_cases c
        on c.customer_id = ${sqlUuid(roleConflict.customerId)};
    `,
    );
    const roleConflictResponse = await callBootstrap(database, roleConflict);
    assert(
      profileConflictResponse.code === "party_profile_conflict" &&
        roleConflictResponse.code === "party_role_conflict",
      "profile_or_role_conflict_not_fail_closed",
    );
    pass(21);

    for (const stage of ["after_profile", "after_roles", "during_audit"]) {
      const rollback = await seedFixture(database, "vve", 2);
      await seedDeclarations(database, rollback, {});
      const failure = await psqlResult(
        database,
        callSql(
          rollback,
          `rollback-${stage}:${crypto.randomUUID()}`,
          `key-${crypto.randomUUID()}`,
          "v4",
          stage,
        ),
      );
      assert(
        !failure.success &&
          failure.stderr.includes(`proof_failure_${stage}`) &&
          await targetState(database, rollback) === "0|0|0|0|0",
        `rollback_failed_${stage}:${scrub(failure.stderr)}`,
      );
    }
    pass(22);

    const forbiddenTruth = await psql(
      database,
      `
      select
        (select count(*) from information_schema.columns
          where table_schema = 'public'
            and table_name in (
              'app_party_person_versions',
              'app_party_organization_versions'
            )
            and data_type = 'timestamp with time zone'
            and column_name like '%valid_from%') || '|' ||
        (select count(*) from public.app_case_party_roles
          where source_class = 'signup_applicant_declaration'
            and (
              role_type <> 'service_recipient'
              or claim_status = 'case_confirmed'
            ));
    `,
    );
    assert(
      forbiddenTruth === "0|0" &&
        !/insert into public\.app_(?:connections|location_versions|dossier_document_versions)/i
          .test(migrationSource) &&
        !/create table public\./i.test(migrationSource),
      "forbidden_domain_truth_created",
    );
    pass(23);

    const mainFingerprint = await psql(
      MAIN_DATABASE,
      `select md5(pg_get_functiondef('${V4_SIGNATURE}'::regprocedure));`,
    );
    const proofFingerprint = await psql(
      database,
      `select md5(pg_get_functiondef('${V4_SIGNATURE}'::regprocedure));`,
    );
    assert(
      freshApplyCount === 1 && mainFingerprint === proofFingerprint,
      `fresh_apply_or_function_body_mismatch:${freshApplyCount}`,
    );
  } finally {
    await dropProofDatabase(database);
  }

  const disposableCount = await psql(
    MAIN_DATABASE,
    `
    select count(*) from pg_database
    where datname like 'enval_pilot_profile_02_%';
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
    assert(mainCountsAfter.get(table) === 0, `real_${table}_changed`);
  }
  pass(24);

  assert(passed.size === 24, `expected_24_passes_got_${passed.size}`);
  console.log("declared-profile-asserted-service-recipient-proof-ok");
}

await main();
