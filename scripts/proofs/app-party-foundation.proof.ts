// Local transactional proof for the WP2A party foundation.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Uses only the fixed local Supabase Postgres container. It prints no names,
// identifiers, source references, customer data, connection strings, or keys.

type ProofStatus = "PASS" | "FAIL";
type ProofResult = { id: string; status: ProofStatus; detail: string };
type TableCounts = Map<string, number>;

const MIGRATION_PATH =
  "supabase/migrations/20260722100000_app_party_foundation.sql";
const PROOF_PATH = "scripts/proofs/app-party-foundation.proof.ts";

const PARTY_TABLES = [
  "app_parties",
  "app_party_person_versions",
  "app_party_organization_versions",
  "app_customer_party_relationships",
] as const;

const REQUIRED_SNAPSHOT_TABLES = [
  "app_customers",
  "app_customer_identities",
  "app_customer_dossiers",
  "app_connections",
  "app_connection_periods",
  "app_connection_ownership_periods",
  "app_dossier_document_slots",
  "app_dossier_document_files",
  "app_dossier_document_versions",
  "app_audit_events",
  "app_idempotency_keys",
] as const;

const PROTECTED_FILE_HASHES: Record<string, string> = {
  "docs/app/operations/nea-implementation-roadmap.md":
    "ae9264a8a67240f86b6d9420266ff5e0b8be7532b5c644c6bb43d5b566ad619b",
  "deno.lock":
    "c8f4a0d9dcf5144f4f95c30a843efe16f784e1ee94434e672143893a22d2214c",
  "docs/app/contracts/customer-party-representation-case.md":
    "d6ae5f12bbf9c6facf79a2095ab9d6c10b1e9fb39cdb9193554f18fa48596e33",
  "scripts/proofs/app-connection-write-rpcs.proof.ts":
    "6d271aa83c236b5336340c83117edf4d8f56bddaee42c86a026284f1a07c6391",
  "scripts/proofs/app-ean-connection-domain-foundation.proof.ts":
    "5b3cb099313aa25a2d908c02123a2e60093100fe0b79180abe844a64f781b7ee",
  "scripts/proofs/app-signup-intake-quarantine-schema.proof.ts":
    "eba3d7a2036e16b7897880b11e9afe1c035f51e67a22cc3bde0e5f76215edf61",
  "scripts/proofs/in-place-baseline-phase0-proof.mjs":
    "1eac571713d1944c4899c4ff5d0b38b812f40c8d5fc70d9729f50fb12fe538db",
  "scripts/proofs/in-place-baseline-phase0-remote-readonly.sql":
    "7939a9d8b0925665e5a8bd2a720a743fb2daa5aebddeda10c53685d42fe7f5b5",
  "scripts/proofs/postgrest-authorized-health.proof.mjs":
    "568054913b340eff2e0c7e19dab9ae470819603a09d95aeb8ed3e7f29cd9d5ca",
  "scripts/proofs/recovery-gate-remote-readonly.sql":
    "2c5b5ccc69f7c76cfec822ca48115c79663ec65a3f20760c3c5702cb58fba329",
  "supabase/baseline-proposals/wave-1-rollback/001_emergency_drop_wave1_app_objects.sql":
    "1840b768406cf517c27ba1838220b4e3b34c3225fb83cc15cf59b6ef53022e7f",
  "supabase/baseline-proposals/wave-1/001_app_identity_audit_idempotency.sql":
    "778fd7173bd4cb47da03e6b6817e650e950299ee471ad0c38908961fc5bc9652",
  "supabase/baseline-proposals/wave-1/002_app_case_location_foundation.sql":
    "324867ef92b98923c7b871fa3695efcdcfb2d492f1e50e4f97541f9bb7b16c16",
  "supabase/baseline-proposals/wave-1/003_app_evidence_slots.sql":
    "05e8f4e06a2148956857870744695ad1fc311bf885e78046aa4598081492df55",
  "supabase/baseline-proposals/wave-1/004_app_document_files_versions.sql":
    "9abfe866bcbf2760e53278daa9f1914a1df52134bef11625dc19b81d4acf77bf",
  "supabase/baseline-proposals/wave-1/005_app_document_confirm_withdraw_rpcs.sql":
    "8b90a8e7c25eb64199af6cf0ed8a210c21376978eebbbc15f496217fcba337ca",
};

const EXPECTED_UNTRACKED = new Set([
  "deno.lock",
  "docs/app/contracts/customer-party-representation-case.md",
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
  PROOF_PATH,
]);

const proofPrefix = `party-proof-${Date.now()}-${
  crypto.randomUUID().slice(0, 8)
}`;
const ids = {
  person: crypto.randomUUID(),
  personSubtypeOnly: crypto.randomUUID(),
  organization: crypto.randomUUID(),
  vve: crypto.randomUUID(),
  secondPerson: crypto.randomUUID(),
  personVersion: crypto.randomUUID(),
  personVersionSuccessor: crypto.randomUUID(),
  organizationVersion: crypto.randomUUID(),
  vveVersion: crypto.randomUUID(),
  secondPersonVersion: crypto.randomUUID(),
  relationshipOwner: crypto.randomUUID(),
  relationshipContact: crypto.randomUUID(),
  relationshipServiceRecipient: crypto.randomUUID(),
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireLocalProof(): void {
  if (Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") !== "YES") {
    throw new Error("destructive_local_proof_not_enabled");
  }
}

function scrub(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>")
    .replace(/party-proof-[^\s']+/g, "<proof-ref>");
}

async function commandText(
  command: string,
  args: string[],
  stdin?: string,
): Promise<string> {
  const process = new Deno.Command(command, {
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
  if (!output.success) {
    const stderr =
      new TextDecoder().decode(output.stderr).split("\n")[0]?.trim() ||
      `${command}_failed`;
    throw new Error(scrub(stderr));
  }

  return new TextDecoder().decode(output.stdout).trim();
}

async function psql(sql: string): Promise<string> {
  return await commandText("docker", [
    "exec",
    "-i",
    "supabase_db_enval",
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
  ], sql);
}

async function sha256File(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

async function allAppTableCounts(): Promise<TableCounts> {
  const raw = await psql(`
    select table_name || '|' || (
      xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, ''))
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

async function requiredSnapshotPresence(): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  for (const table of REQUIRED_SNAPSHOT_TABLES) {
    const present = await psql(
      `select to_regclass('public.${table}') is not null;`,
    );
    if (present !== "t") {
      result.set(table, null);
      continue;
    }
    result.set(
      table,
      Number(await psql(`select count(*) from public.${table};`)),
    );
  }
  return result;
}

function equalCounts(
  left: TableCounts,
  right: TableCounts,
  excluded = new Set<string>(),
): boolean {
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    if (excluded.has(key)) continue;
    if (left.get(key) !== right.get(key)) return false;
  }
  return true;
}

async function proveSourceScope(): Promise<void> {
  for (const [path, expectedHash] of Object.entries(PROTECTED_FILE_HASHES)) {
    assert(
      await sha256File(path) === expectedHash,
      `protected_file_changed:${path}`,
    );
  }

  const trackedDiff = (await commandText("git", ["diff", "--name-only"]))
    .split("\n")
    .filter(Boolean);
  assert(
    trackedDiff.length === 1 &&
      trackedDiff[0] === "docs/app/operations/nea-implementation-roadmap.md",
    "unexpected_tracked_diff_scope",
  );

  const untracked = new Set(
    (await commandText("git", ["ls-files", "--others", "--exclude-standard"]))
      .split("\n")
      .filter(Boolean),
  );
  assert(
    untracked.size === EXPECTED_UNTRACKED.size,
    "unexpected_untracked_file_count",
  );
  for (const path of EXPECTED_UNTRACKED) {
    assert(untracked.has(path), `expected_untracked_file_missing:${path}`);
  }

  const ignoredMigration = await commandText("git", [
    "check-ignore",
    "-v",
    MIGRATION_PATH,
  ]);
  assert(
    ignoredMigration.endsWith(`\t${MIGRATION_PATH}`),
    "migration_ignore_status_changed",
  );

  const migration = await Deno.readTextFile(MIGRATION_PATH);
  const createdTables = [
    ...migration.matchAll(/create table public\.([a-z0-9_]+)/g),
  ].map((match) => match[1]);
  assert(
    createdTables.length === PARTY_TABLES.length &&
      PARTY_TABLES.every((table) => createdTables.includes(table)),
    "migration_table_scope_mismatch",
  );
  assert(
    !/create\s+(?:or\s+replace\s+)?(?:view|materialized\s+view|procedure)\b/i
      .test(migration),
    "unexpected_object_kind",
  );
  assert(
    !/\b(app_set_updated_at|app_cases|app_case_party_roles|app_party_address_roles)\b/
      .test(migration),
    "forbidden_scope_in_migration",
  );
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlUuid(value: string): string {
  return `${sqlText(value)}::uuid`;
}

function provenanceValues(label: string): string {
  return [
    "'manual_review'",
    "'local_proof'",
    sqlText(`${proofPrefix}-source-${label}`),
    sqlText(`${proofPrefix}-request-${label}`),
    "'system'",
    sqlText(`${proofPrefix}-actor`),
  ].join(", ");
}

function partyInsert(
  id: string,
  kind: "natural_person" | "organization",
  label: string,
): string {
  return `
    insert into public.app_parties (
      id, party_kind, source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      ${sqlUuid(id)}, ${sqlText(kind)}, ${provenanceValues(label)}
    );
  `;
}

function personVersionInsert(args: {
  id: string;
  partyId: string;
  label: string;
  validFrom?: string;
  validTo?: string | null;
  supersedesId?: string | null;
}): string {
  return `
    insert into public.app_party_person_versions (
      id, party_id, full_name, valid_from, valid_to,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref, supersedes_person_version_id
    ) values (
      ${sqlUuid(args.id)}, ${sqlUuid(args.partyId)}, 'Redacted Proof Person',
      ${sqlText(args.validFrom ?? "2026-01-01")}::date,
      ${
    args.validTo === null || args.validTo === undefined
      ? "null"
      : `${sqlText(args.validTo)}::date`
  },
      ${provenanceValues(args.label)},
      ${args.supersedesId ? sqlUuid(args.supersedesId) : "null"}
    );
  `;
}

function organizationVersionInsert(args: {
  id: string;
  partyId: string;
  label: string;
  classification?: "business" | "vve" | "other_organization";
  validFrom?: string;
  validTo?: string | null;
}): string {
  return `
    insert into public.app_party_organization_versions (
      id, party_id, legal_name, organization_classification, legal_form,
      trade_register_number, valid_from, valid_to,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      ${sqlUuid(args.id)}, ${
    sqlUuid(args.partyId)
  }, 'Redacted Proof Organization',
      ${sqlText(args.classification ?? "business")}, null, ${
    sqlText(`${proofPrefix}-register-${args.label}`)
  },
      ${sqlText(args.validFrom ?? "2026-01-01")}::date,
      ${
    args.validTo === null || args.validTo === undefined
      ? "null"
      : `${sqlText(args.validTo)}::date`
  },
      ${provenanceValues(args.label)}
    );
  `;
}

function relationshipInsert(args: {
  id: string;
  partyId: string;
  role: string;
  label: string;
  validFrom?: string;
}): string {
  return `
    insert into public.app_customer_party_relationships (
      id, customer_id, party_id, relationship_role, valid_from, valid_to,
      source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref
    ) values (
      ${sqlUuid(args.id)}, (select customer_id from proof_context), ${
    sqlUuid(args.partyId)
  },
      ${sqlText(args.role)}, ${
    sqlText(args.validFrom ?? "2026-01-01")
  }::date, null,
      ${provenanceValues(args.label)}
    );
  `;
}

function expectedErrorCase(
  sql: string,
  expectedMessage: string,
  id: string,
  detail: string,
): string {
  return `
    do $proof$
    begin
      begin
        ${sql}
        raise exception 'proof_expected_failure_missing';
      exception when others then
        if sqlerrm = 'proof_expected_failure_missing'
           or position(${sqlText(expectedMessage)} in sqlerrm) = 0 then
          raise;
        end if;
      end;
      insert into proof_results values (${sqlText(id)}, 'PASS', ${
    sqlText(detail)
  });
    end
    $proof$;
  `;
}

async function runDatabaseProof(): Promise<ProofResult[]> {
  const sql = `
    begin;

    create temp table proof_results (
      id text primary key,
      status text not null,
      detail text not null
    ) on commit drop;

    create temp table proof_context (customer_id uuid not null) on commit drop;
    insert into proof_context
    select id from public.app_customers order by id limit 1;

    do $proof$
    begin
      if (select count(*) from proof_context) <> 1 then
        raise exception 'local customer fixture unavailable';
      end if;

      if (
        select count(*)
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'app_parties',
            'app_party_person_versions',
            'app_party_organization_versions',
            'app_customer_party_relationships'
          )
      ) <> 4 then
        raise exception 'exact party table set missing';
      end if;

      insert into proof_results values ('Q01', 'PASS', 'exact four party tables exist');
    end
    $proof$;

    ${partyInsert(ids.person, "natural_person", "person")}
    ${
    personVersionInsert({
      id: ids.personVersion,
      partyId: ids.person,
      label: "person-version",
      validTo: "2027-01-01",
    })
  }
    insert into proof_results values ('Q02', 'PASS', 'natural-person party and profile version inserted');

    ${partyInsert(ids.organization, "organization", "organization")}
    ${
    organizationVersionInsert({
      id: ids.organizationVersion,
      partyId: ids.organization,
      label: "organization-version",
      validTo: "2027-01-01",
    })
  }
    insert into proof_results values ('Q03', 'PASS', 'organization party and profile version inserted');

    ${partyInsert(ids.vve, "organization", "vve")}
    ${
    organizationVersionInsert({
      id: ids.vveVersion,
      partyId: ids.vve,
      label: "vve-version",
      classification: "vve",
    })
  }
    insert into proof_results values ('Q04', 'PASS', 'VvE inserted as organization classification');

    ${
    expectedErrorCase(
      personVersionInsert({
        id: crypto.randomUUID(),
        partyId: ids.organization,
        label: "wrong-person-kind",
      }),
      "require a natural_person party",
      "Q05",
      "person profile on organization rejected",
    )
  }

    ${
    partyInsert(ids.personSubtypeOnly, "natural_person", "person-subtype-only")
  }
    ${
    expectedErrorCase(
      organizationVersionInsert({
        id: crypto.randomUUID(),
        partyId: ids.personSubtypeOnly,
        label: "wrong-organization-kind",
      }),
      "require an organization party",
      "Q06",
      "organization profile on natural person rejected",
    )
  }

    ${
    expectedErrorCase(
      organizationVersionInsert({
        id: crypto.randomUUID(),
        partyId: ids.person,
        label: "mixed-subtype",
      }),
      "require an organization party",
      "Q07",
      "mixed subtype families rejected",
    )
  }

    do $proof$
    begin
      begin
        update public.app_parties
        set party_kind = 'organization'
        where id = ${sqlUuid(ids.person)};
        raise exception 'proof_expected_failure_missing';
      exception when others then
        if sqlerrm = 'proof_expected_failure_missing'
           or position('app_parties roots are immutable' in sqlerrm) = 0 then
          raise;
        end if;
      end;
      update proof_results
      set detail = 'mixed subtype families and party-kind mutation rejected'
      where id = 'Q07';
    end
    $proof$;

    ${
    expectedErrorCase(
      personVersionInsert({
        id: crypto.randomUUID(),
        partyId: ids.personSubtypeOnly,
        label: "invalid-period",
        validFrom: "2027-01-01",
        validTo: "2026-01-01",
      }),
      "app_party_person_versions_valid_range_chk",
      "Q08",
      "invalid validity period rejected",
    )
  }

    ${
    expectedErrorCase(
      personVersionInsert({
        id: crypto.randomUUID(),
        partyId: ids.person,
        label: "person-overlap",
        validFrom: "2026-06-01",
        validTo: "2026-12-01",
      }),
      "overlapping active app_party_person_versions",
      "Q09",
      "overlapping active person profiles rejected",
    )
  }

    ${
    expectedErrorCase(
      organizationVersionInsert({
        id: crypto.randomUUID(),
        partyId: ids.organization,
        label: "organization-overlap",
        validFrom: "2026-06-01",
        validTo: "2026-12-01",
      }),
      "overlapping active app_party_organization_versions",
      "Q10",
      "overlapping active organization profiles rejected",
    )
  }

    do $proof$
    begin
      begin
        ${
    personVersionInsert({
      id: crypto.randomUUID(),
      partyId: ids.personSubtypeOnly,
      label: "cross-party-supersession",
      supersedesId: ids.personVersion,
    })
  }
        raise exception 'proof_expected_failure_missing';
      exception when others then
        if sqlerrm = 'proof_expected_failure_missing'
           or position('app_party_person_versions_supersession_fk' in sqlerrm) = 0 then
          raise;
        end if;
      end;
    end
    $proof$;

    ${
    personVersionInsert({
      id: ids.personVersionSuccessor,
      partyId: ids.person,
      label: "person-supersession",
      validTo: "2027-01-01",
      supersedesId: ids.personVersion,
    })
  }
    insert into proof_results values (
      'Q11',
      'PASS',
      'same-party supersession accepted and cross-party supersession rejected'
    );

    do $proof$
    begin
      begin
        update public.app_party_person_versions
        set full_name = 'Forbidden Rewrite'
        where id = ${sqlUuid(ids.personVersion)};
        raise exception 'proof_expected_failure_missing';
      exception when others then
        if sqlerrm = 'proof_expected_failure_missing'
           or position('app party history rows are immutable' in sqlerrm) = 0 then
          raise;
        end if;
      end;

      if (select count(*) from public.app_party_person_versions where party_id = ${
    sqlUuid(ids.person)
  }) <> 2
         or not exists (
           select 1 from public.app_party_person_versions
           where id = ${sqlUuid(ids.personVersion)}
      ) then
        raise exception 'superseded history row not retained';
      end if;
      insert into proof_results values ('Q12', 'PASS', 'superseded profile retained and immutable');
    end
    $proof$;

    ${
    expectedErrorCase(
      `insert into public.app_parties (
        id, party_kind, source_type, source_reference_type, source_reference_id,
        request_id, actor_type, actor_ref
      ) values (
        ${
        sqlUuid(crypto.randomUUID())
      }, 'natural_person', 'manual_review', 'local_proof', '',
        ${sqlText(`${proofPrefix}-request-empty`)}, 'system', ${
        sqlText(`${proofPrefix}-actor`)
      }
      );`,
      "app_parties_provenance_not_blank_chk",
      "Q13",
      "empty mandatory provenance rejected",
    )
  }

    ${partyInsert(ids.secondPerson, "natural_person", "second-person")}
    ${
    personVersionInsert({
      id: ids.secondPersonVersion,
      partyId: ids.secondPerson,
      label: "second-person-version",
    })
  }
    ${
    relationshipInsert({
      id: ids.relationshipOwner,
      partyId: ids.person,
      role: "account_owner",
      label: "owner-relationship",
    })
  }
    ${
    relationshipInsert({
      id: ids.relationshipServiceRecipient,
      partyId: ids.secondPerson,
      role: "service_recipient",
      label: "service-recipient-relationship",
    })
  }
    insert into proof_results values ('Q14', 'PASS', 'one customer linked to multiple parties');

    ${
    relationshipInsert({
      id: ids.relationshipContact,
      partyId: ids.person,
      role: "contact",
      label: "contact-relationship",
    })
  }
    insert into proof_results values ('Q15', 'PASS', 'same customer and party linked with multiple roles');

    ${
    expectedErrorCase(
      relationshipInsert({
        id: crypto.randomUUID(),
        partyId: ids.person,
        role: "account_owner",
        label: "relationship-overlap",
        validFrom: "2026-06-01",
      }),
      "overlapping active app_customer_party_relationships",
      "Q16",
      "overlapping identical customer-party-role rejected",
    )
  }

    ${
    expectedErrorCase(
      relationshipInsert({
        id: crypto.randomUUID(),
        partyId: ids.organization,
        role: "legal_representative",
        label: "invalid-role",
      }),
      "app_customer_party_relationships_role_chk",
      "Q17",
      "relationship role outside vocabulary rejected",
    )
  }

    do $proof$
    begin
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'app_customer_party_relationships'
          and column_name ~ '(authority|mandate|representation|case|ean|connection)'
      ) then
        raise exception 'relationship leaked authority, mandate, case, or connection ownership';
      end if;
      insert into proof_results values ('Q18', 'PASS', 'relationship creates no authority or mandate object');
    end
    $proof$;

    do $proof$
    declare
      v_table text;
    begin
      foreach v_table in array array[
        'app_parties',
        'app_party_person_versions',
        'app_party_organization_versions',
        'app_customer_party_relationships'
      ] loop
        if has_table_privilege('anon', format('public.%I', v_table), 'SELECT')
           or has_table_privilege('anon', format('public.%I', v_table), 'INSERT')
           or has_table_privilege('anon', format('public.%I', v_table), 'UPDATE')
           or has_table_privilege('anon', format('public.%I', v_table), 'DELETE') then
          raise exception 'anon table privilege present';
        end if;
      end loop;
      insert into proof_results values ('Q19', 'PASS', 'anon has no party-table access');
    end
    $proof$;

    do $proof$
    declare
      v_table text;
    begin
      foreach v_table in array array[
        'app_parties',
        'app_party_person_versions',
        'app_party_organization_versions',
        'app_customer_party_relationships'
      ] loop
        if has_table_privilege('authenticated', format('public.%I', v_table), 'SELECT')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'INSERT')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'UPDATE')
           or has_table_privilege('authenticated', format('public.%I', v_table), 'DELETE') then
          raise exception 'authenticated table privilege present';
        end if;
      end loop;
      insert into proof_results values ('Q20', 'PASS', 'authenticated has no party-table access');
    end
    $proof$;

    do $proof$
    declare
      v_table text;
    begin
      foreach v_table in array array[
        'app_parties',
        'app_party_person_versions',
        'app_party_organization_versions',
        'app_customer_party_relationships'
      ] loop
        if not has_table_privilege('service_role', format('public.%I', v_table), 'SELECT')
           or not has_table_privilege('service_role', format('public.%I', v_table), 'INSERT')
           or has_table_privilege('service_role', format('public.%I', v_table), 'UPDATE')
           or has_table_privilege('service_role', format('public.%I', v_table), 'DELETE') then
          raise exception 'service_role privilege set is not minimal select/insert';
        end if;
      end loop;

      if (
        select count(*)
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = any(array[
            'app_parties',
            'app_party_person_versions',
            'app_party_organization_versions',
            'app_customer_party_relationships'
          ])
          and c.relrowsecurity
      ) <> 4 then
        raise exception 'RLS not enabled on all party tables';
      end if;

      if (
        select count(*)
        from pg_policies
        where schemaname = 'public'
          and tablename = any(array[
            'app_parties',
            'app_party_person_versions',
            'app_party_organization_versions',
            'app_customer_party_relationships'
          ])
          and policyname = 'deny_all'
      ) <> 4 then
        raise exception 'deny-all policy missing';
      end if;

      insert into proof_results values ('Q21', 'PASS', 'service_role has select/insert only; RLS and deny-all present');
    end
    $proof$;

    select id || '|' || status || '|' || detail
    from proof_results
    order by id;

    rollback;
  `;

  const raw = await psql(sql);
  return raw.split("\n").filter(Boolean).map((line) => {
    const [id, status, detail] = line.split("|");
    return { id, status: status as ProofStatus, detail };
  });
}

async function main(): Promise<void> {
  requireLocalProof();
  await proveSourceScope();

  const before = await allAppTableCounts();
  const requiredBefore = await requiredSnapshotPresence();
  for (const [table, count] of requiredBefore) {
    console.log(
      `snapshot-before:${table}:${count === null ? "MISSING" : count}`,
    );
  }

  const results = await runDatabaseProof();
  const after = await allAppTableCounts();
  const requiredAfter = await requiredSnapshotPresence();
  for (const [table, count] of requiredAfter) {
    console.log(
      `snapshot-after:${table}:${count === null ? "MISSING" : count}`,
    );
  }

  results.push({
    id: "Q22",
    status: equalCounts(before, after, new Set(PARTY_TABLES)) ? "PASS" : "FAIL",
    detail: "all pre-existing app-table counts unchanged",
  });
  results.push({
    id: "Q23",
    status: "PASS",
    detail: "protected hashes and additive file scope unchanged",
  });
  results.push({
    id: "Q24",
    status: equalCounts(before, after) ? "PASS" : "FAIL",
    detail: "transactional rollback restored all party test rows",
  });

  results.sort((left, right) => left.id.localeCompare(right.id));
  for (const result of results) {
    console.log(`${result.id} ${result.status} ${result.detail}`);
  }

  assert(
    results.length === 24,
    `unexpected_proof_result_count:${results.length}`,
  );
  assert(
    results.every((result) => result.status === "PASS"),
    "party_foundation_proof_failed",
  );
  console.log("app-party-foundation-proof-ok");
}

await main();
