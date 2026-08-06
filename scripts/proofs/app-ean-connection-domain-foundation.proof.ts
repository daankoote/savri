// Local destructive proof for the Gate 1 EAN/electricity connection domain.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Uses only the local Supabase Postgres container and never prints secrets,
// customer data, EANs, addresses, IDs, connection strings, or keys.

type ProofStatus = "PASS" | "FAIL";
type ProofResult = { id: string; status: ProofStatus; detail: string };
type TableCounts = Map<string, number>;

const TABLES = [
  "app_connections",
  "app_connection_periods",
  "app_connection_ownership_periods",
] as const;

const GUARD_FUNCTIONS = [
  "app_connection_periods_overlap_guard",
  "app_connection_ownership_periods_overlap_guard",
  "app_connections_boundary_guard",
  "app_connection_periods_boundary_guard",
  "app_connection_ownership_periods_boundary_guard",
  "app_connections_transition_guard",
  "app_connection_periods_transition_guard",
  "app_connection_ownership_periods_transition_guard",
] as const;

const proofPrefix = `ean-proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const ids = {
  customerA: crypto.randomUUID(),
  customerB: crypto.randomUUID(),
  dossierA: crypto.randomUUID(),
  dossierB: crypto.randomUUID(),
  locationA: crypto.randomUUID(),
  locationB: crypto.randomUUID(),
  connectionPrimary: crypto.randomUUID(),
  connectionSecondary: crypto.randomUUID(),
  connectionSequential: crypto.randomUUID(),
  connectionTerminal: crypto.randomUUID(),
  periodOne: crypto.randomUUID(),
  periodTwo: crypto.randomUUID(),
  ownershipDeclared: crypto.randomUUID(),
  ownershipTransition: crypto.randomUUID(),
  ownershipCorrection: crypto.randomUUID(),
  ownershipSelfSupersede: crypto.randomUUID(),
};

const results: ProofResult[] = [];

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(label);
}

function assertEquals(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlUuid(value: string): string {
  return `${sqlText(value)}::uuid`;
}

function requireLocalProof(): void {
  if (Deno.env.get("ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF") !== "YES") {
    throw new Error("destructive_local_proof_not_enabled");
  }
}

async function psql(sql: string): Promise<string> {
  const command = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      "supabase_db_enval",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();

  const output = await child.output();
  if (!output.success) {
    const detail = new TextDecoder().decode(output.stderr).split("\n")[0]?.trim() || "psql_failed";
    throw new Error(detail.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<uuid>"));
  }

  return new TextDecoder().decode(output.stdout).trim();
}

async function expectDbError(sql: string, label: string): Promise<void> {
  const command = new Deno.Command("docker", {
    args: [
      "exec",
      "-i",
      "supabase_db_enval",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-qAt",
    ],
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });

  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(sql));
  await writer.close();

  const output = await child.output();
  if (output.success) throw new Error(label);
}

async function runCase(id: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push({ id, status: "PASS", detail: "ok" });
  } catch (error) {
    results.push({ id, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

async function tableCounts(): Promise<TableCounts> {
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

async function legacyObjectCount(): Promise<number> {
  const raw = await psql(`
    select count(*)
    from (
      select c.oid
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname like 'dossier\\_%' escape '\\'
      union all
      select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname like 'api_dossier\\_%' escape '\\'
    ) legacy_objects;
  `);
  return Number(raw);
}

function customerInsert(customerId: string, suffix: string): string {
  return `
    insert into public.app_customers (id, customer_type, display_name, primary_email_normalized, status)
    values (${sqlUuid(customerId)}, 'particulier', ${sqlText(`${proofPrefix}-${suffix}`)}, null, 'active');
  `;
}

function dossierInsert(dossierId: string, customerId: string, suffix: string): string {
  return `
    insert into public.app_customer_dossiers (id, customer_id, dossier_number, account_type, status)
    values (${sqlUuid(dossierId)}, ${sqlUuid(customerId)}, ${sqlText(`${proofPrefix}-${suffix}`)}, 'particulier', 'submitted');
  `;
}

function locationInsert(locationId: string, dossierId: string, suffix: string): string {
  return `
    insert into public.app_dossier_locations (
      id, dossier_id, client_location_id, status, postcode_normalized, house_number, country
    )
    values (
      ${sqlUuid(locationId)},
      ${sqlUuid(dossierId)},
      ${sqlText(`${proofPrefix}-${suffix}`)},
      'submitted',
      '0000XX',
      '1',
      'Nederland'
    );
  `;
}

function connectionInsert(args: {
  id: string;
  customerId?: string;
  dossierId?: string;
  locationId?: string;
  ean?: string;
  type?: "primary" | "secondary_allocation_point" | "direct_line";
  status?: "declared" | "under_review" | "verified" | "rejected" | "superseded";
  extra?: string;
}): string {
  return `
    insert into public.app_connections (
      id, customer_id, dossier_id, location_id, ean_normalized, connection_type,
      declared_network_operator, status, source_type, source_reference_type, source_reference_id,
      request_id, actor_type, actor_ref ${args.extra ? `, ${args.extra}` : ""}
    )
    values (
      ${sqlUuid(args.id)},
      ${sqlUuid(args.customerId ?? ids.customerA)},
      ${sqlUuid(args.dossierId ?? ids.dossierA)},
      ${sqlUuid(args.locationId ?? ids.locationA)},
      ${sqlText(args.ean ?? "871234567890123456")},
      ${sqlText(args.type ?? "primary")},
      'synthetic-network',
      ${sqlText(args.status ?? "declared")},
      'customer_declared',
      'proof',
      ${sqlText(`${proofPrefix}-source`)},
      ${sqlText(`${proofPrefix}-request`)},
      'proof_actor',
      ${sqlText(`${proofPrefix}-actor`)}
      ${args.extra ? ", " + decisionValues(args.extra) : ""}
    );
  `;
}

function decisionValues(extraColumns: string): string {
  const values: string[] = [];
  if (extraColumns.includes("decision_actor_type")) values.push("'proof_decider'");
  if (extraColumns.includes("decision_actor_ref")) values.push(sqlText(`${proofPrefix}-decider`));
  if (extraColumns.includes("decision_request_id")) values.push(sqlText(`${proofPrefix}-decision`));
  if (extraColumns.includes("decision_reason")) values.push("'proof reason'");
  if (extraColumns.includes("decided_at")) values.push("now()");
  if (extraColumns.includes("supersedes_connection_id")) values.push(sqlUuid(ids.connectionPrimary));
  return values.join(", ");
}

function periodInsert(args: {
  id: string;
  connectionId?: string;
  locationId?: string;
  from: string;
  to?: string | null;
  configuration?: string;
  status?: string;
}): string {
  return `
    insert into public.app_connection_periods (
      id, connection_id, location_id, valid_from, valid_to, network_operator, configuration_type,
      status, source_type, source_reference_type, source_reference_id, request_id, actor_type, actor_ref
    )
    values (
      ${sqlUuid(args.id)},
      ${sqlUuid(args.connectionId ?? ids.connectionPrimary)},
      ${sqlUuid(args.locationId ?? ids.locationA)},
      ${sqlText(args.from)}::date,
      ${args.to === undefined || args.to === null ? "null" : `${sqlText(args.to)}::date`},
      'synthetic-network',
      ${sqlText(args.configuration ?? "exclusive_transport_connection")},
      ${sqlText(args.status ?? "declared")},
      'customer_declared',
      'proof',
      ${sqlText(`${proofPrefix}-period-source`)},
      ${sqlText(`${proofPrefix}-period-request`)},
      'proof_actor',
      ${sqlText(`${proofPrefix}-actor`)}
    );
  `;
}

function ownershipInsert(args: {
  id: string;
  connectionId?: string;
  customerId?: string;
  dossierId?: string;
  from: string;
  to?: string | null;
  status?: string;
  verified?: boolean;
  supersedesId?: string;
  rejectedReason?: boolean;
}): string {
  const terminal = args.status === "verified" || args.status === "rejected" || args.status === "superseded";
  return `
    insert into public.app_connection_ownership_periods (
      id, connection_id, customer_id, dossier_id, valid_from, valid_to, claim_source_type,
      source_reference_type, source_reference_id, claim_status, observed_at, verified_at,
      request_id, actor_type, actor_ref,
      decision_actor_type, decision_actor_ref, decision_request_id, decision_reason, decided_at,
      supersedes_ownership_period_id
    )
    values (
      ${sqlUuid(args.id)},
      ${sqlUuid(args.connectionId ?? ids.connectionPrimary)},
      ${sqlUuid(args.customerId ?? ids.customerA)},
      ${sqlUuid(args.dossierId ?? ids.dossierA)},
      ${sqlText(args.from)}::date,
      ${args.to === undefined || args.to === null ? "null" : `${sqlText(args.to)}::date`},
      'customer_declared',
      'proof',
      ${sqlText(`${proofPrefix}-ownership-source`)},
      ${sqlText(args.status ?? "declared")},
      now(),
      ${args.verified ? "now()" : "null"},
      ${sqlText(`${proofPrefix}-ownership-request`)},
      'proof_actor',
      ${sqlText(`${proofPrefix}-actor`)},
      ${terminal ? "'proof_decider'" : "null"},
      ${terminal ? sqlText(`${proofPrefix}-decider`) : "null"},
      ${terminal ? sqlText(`${proofPrefix}-decision`) : "null"},
      ${args.rejectedReason ? "'proof reason'" : "null"},
      ${terminal ? "now()" : "null"},
      ${args.supersedesId ? sqlUuid(args.supersedesId) : "null"}
    );
  `;
}

async function cleanup(): Promise<void> {
  await psql(`
    delete from public.app_connection_ownership_periods
    where id in (
      ${[
        ids.ownershipDeclared,
        ids.ownershipTransition,
        ids.ownershipCorrection,
        ids.ownershipSelfSupersede,
      ].map(sqlUuid).join(", ")}
    )
      or actor_ref = ${sqlText(`${proofPrefix}-actor`)};

    delete from public.app_connection_periods
    where id in (${[ids.periodOne, ids.periodTwo].map(sqlUuid).join(", ")})
      or actor_ref = ${sqlText(`${proofPrefix}-actor`)};

    delete from public.app_connections
    where id in (${[
      ids.connectionPrimary,
      ids.connectionSecondary,
      ids.connectionSequential,
      ids.connectionTerminal,
    ].map(sqlUuid).join(", ")})
      or actor_ref = ${sqlText(`${proofPrefix}-actor`)};

    delete from public.app_dossier_locations
    where id in (${[ids.locationA, ids.locationB].map(sqlUuid).join(", ")});

    delete from public.app_customer_dossiers
    where id in (${[ids.dossierA, ids.dossierB].map(sqlUuid).join(", ")});

    delete from public.app_customers
    where id in (${[ids.customerA, ids.customerB].map(sqlUuid).join(", ")});
  `);
}

async function setupFixtures(): Promise<void> {
  await psql(`
    ${customerInsert(ids.customerA, "customer-a")}
    ${customerInsert(ids.customerB, "customer-b")}
    ${dossierInsert(ids.dossierA, ids.customerA, "dossier-a")}
    ${dossierInsert(ids.dossierB, ids.customerB, "dossier-b")}
    ${locationInsert(ids.locationA, ids.dossierA, "location-a")}
    ${locationInsert(ids.locationB, ids.dossierB, "location-b")}
  `);
}

async function assertCountsUnchanged(before: TableCounts, after: TableCounts): Promise<void> {
  const ignored = new Set<string>([...TABLES]);
  for (const [table, beforeCount] of before) {
    if (ignored.has(table)) continue;
    assertEquals(after.get(table), beforeCount, `${table}_count_changed`);
  }
}

async function main(): Promise<void> {
  requireLocalProof();
  const countsBefore = await tableCounts();
  const legacyBefore = await legacyObjectCount();

  try {
    await cleanup();
    await setupFixtures();

    await runCase("Q1_tables_exist", async () => {
      const count = Number(await psql(`
        select count(*) from information_schema.tables
        where table_schema = 'public' and table_name in (${TABLES.map(sqlText).join(", ")});
      `));
      assertEquals(count, 3, "gate1_tables_missing");
    });

    await runCase("Q2_required_columns_exist", async () => {
      const count = Number(await psql(`
        select count(*) from information_schema.columns
        where table_schema = 'public'
          and (
            (table_name = 'app_connections' and column_name in (
              'id','customer_id','dossier_id','location_id','ean_normalized','connection_type',
              'status','source_type','source_reference_type','source_reference_id','observed_at',
              'request_id','actor_type','actor_ref','decision_actor_type','decision_actor_ref',
              'decision_request_id','decision_reason','decided_at','supersedes_connection_id'
            ))
            or (table_name = 'app_connection_periods' and column_name in (
              'id','connection_id','location_id','valid_from','valid_to','network_operator',
              'configuration_type','status','source_type','source_reference_type','source_reference_id',
              'observed_at','request_id','actor_type','actor_ref','decision_actor_type',
              'decision_actor_ref','decision_request_id','decision_reason','decided_at',
              'supersedes_period_id'
            ))
            or (table_name = 'app_connection_ownership_periods' and column_name in (
              'id','connection_id','customer_id','dossier_id','valid_from','valid_to',
              'claim_source_type','source_reference_type','source_reference_id','claim_status',
              'observed_at','verified_at','request_id','actor_type','actor_ref',
              'decision_actor_type','decision_actor_ref','decision_request_id','decision_reason',
              'decided_at','supersedes_ownership_period_id'
            ))
          );
      `));
      assertEquals(count, 62, "required_column_count");
    });

    await runCase("Q3_rls_enabled", async () => {
      const count = Number(await psql(`
        select count(*) from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in (${TABLES.map(sqlText).join(", ")})
          and c.relrowsecurity;
      `));
      assertEquals(count, 3, "rls_not_enabled");
    });

    await runCase("Q4_no_browser_role_grants", async () => {
      const count = Number(await psql(`
        select count(*)
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (${TABLES.map(sqlText).join(", ")})
          and grantee in ('PUBLIC', 'anon', 'authenticated');
      `));
      assertEquals(count, 0, "browser_role_table_grants_present");
    });

    await runCase("Q5_service_role_no_delete", async () => {
      const deleteCount = Number(await psql(`
        select count(*) from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (${TABLES.map(sqlText).join(", ")})
          and grantee = 'service_role'
          and privilege_type = 'DELETE';
      `));
      const expectedPrivileges = Number(await psql(`
        select count(*) from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (${TABLES.map(sqlText).join(", ")})
          and grantee = 'service_role'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE');
      `));
      assertEquals(deleteCount, 0, "service_role_delete_grant_present");
      assertEquals(expectedPrivileges, 9, "service_role_minimal_privileges_missing");
    });

    await runCase("Q6_valid_18_digit_ean_insert_succeeds", async () => {
      await psql(connectionInsert({ id: ids.connectionPrimary }));
    });

    await runCase("Q7_short_ean_rejected", async () => {
      await expectDbError(connectionInsert({
        id: crypto.randomUUID(),
        ean: "87123456789012345",
      }), "short_ean_insert_allowed");
    });

    await runCase("Q8_non_numeric_ean_rejected", async () => {
      await expectDbError(connectionInsert({
        id: crypto.randomUUID(),
        ean: "87123456789012345A",
      }), "non_numeric_ean_insert_allowed");
    });

    await runCase("Q9_whitespace_ean_rejected", async () => {
      await expectDbError(connectionInsert({
        id: crypto.randomUUID(),
        ean: " 87123456789012345",
      }), "whitespace_ean_insert_allowed");
    });

    await runCase("Q10_customer_dossier_location_boundary_succeeds", async () => {
      const count = Number(await psql(`
        select count(*) from public.app_connections
        where id = ${sqlUuid(ids.connectionPrimary)}
          and customer_id = ${sqlUuid(ids.customerA)}
          and dossier_id = ${sqlUuid(ids.dossierA)}
          and location_id = ${sqlUuid(ids.locationA)};
      `));
      assertEquals(count, 1, "boundary_insert_not_found");
    });

    await runCase("Q11_cross_customer_boundary_rejected", async () => {
      await expectDbError(connectionInsert({
        id: crypto.randomUUID(),
        customerId: ids.customerB,
        dossierId: ids.dossierA,
        locationId: ids.locationA,
        ean: "871234567890123459",
      }), "cross_customer_connection_allowed");
    });

    await runCase("Q12_invalid_period_range_rejected", async () => {
      await expectDbError(periodInsert({
        id: crypto.randomUUID(),
        from: "2026-02-01",
        to: "2026-02-01",
      }), "invalid_period_range_allowed");
    });

    await runCase("Q13_overlapping_connection_period_rejected", async () => {
      await psql(periodInsert({
        id: ids.periodOne,
        from: "2026-01-01",
        to: "2026-04-01",
      }));
      await expectDbError(periodInsert({
        id: crypto.randomUUID(),
        from: "2026-03-01",
        to: "2026-05-01",
      }), "overlapping_period_allowed");
    });

    await runCase("Q14_sequential_connection_period_succeeds", async () => {
      await psql(periodInsert({
        id: ids.periodTwo,
        from: "2026-04-01",
        to: "2026-05-01",
      }));
      const count = Number(await psql(`
        select count(*) from public.app_connection_periods
        where connection_id = ${sqlUuid(ids.connectionPrimary)};
      `));
      assertEquals(count, 2, "sequential_period_missing");
    });

    await runCase("Q15_primary_secondary_constructs_distinguished", async () => {
      await psql(connectionInsert({
        id: ids.connectionSecondary,
        ean: "871234567890123457",
        type: "secondary_allocation_point",
      }));
      const count = Number(await psql(`
        select count(distinct connection_type)
        from public.app_connections
        where id in (${sqlUuid(ids.connectionPrimary)}, ${sqlUuid(ids.connectionSecondary)});
      `));
      assertEquals(count, 2, "construct_types_not_distinguished");
    });

    await runCase("Q16_secondary_not_auto_verified", async () => {
      const status = await psql(`
        select status from public.app_connections where id = ${sqlUuid(ids.connectionSecondary)};
      `);
      const eligibilityColumns = Number(await psql(`
        select count(*) from information_schema.columns
        where table_schema = 'public'
          and table_name in (${TABLES.map(sqlText).join(", ")})
          and column_name ilike '%eligible%';
      `));
      assertEquals(status, "declared", "secondary_auto_verified");
      assertEquals(eligibilityColumns, 0, "eligibility_column_claims_present");
    });

    await runCase("Q17_declared_ownership_claim_insert_succeeds", async () => {
      await psql(ownershipInsert({
        id: ids.ownershipDeclared,
        from: "2026-01-01",
        to: "2026-04-01",
      }));
    });

    await runCase("Q18_declared_claim_not_verified", async () => {
      const result = await psql(`
        select claim_status || '|' || (verified_at is null)::text
        from public.app_connection_ownership_periods
        where id = ${sqlUuid(ids.ownershipDeclared)};
      `);
      assertEquals(result, "declared|true", "declared_claim_verified");
    });

    await runCase("Q19_verified_without_decision_metadata_rejected", async () => {
      await expectDbError(`
        insert into public.app_connection_ownership_periods (
          id, connection_id, customer_id, dossier_id, valid_from, valid_to, claim_source_type,
          source_reference_type, source_reference_id, claim_status, verified_at,
          request_id, actor_type, actor_ref
        )
        values (
          ${sqlUuid(crypto.randomUUID())}, ${sqlUuid(ids.connectionPrimary)}, ${sqlUuid(ids.customerA)},
          ${sqlUuid(ids.dossierA)}, '2026-05-01', '2026-06-01', 'customer_declared',
          'proof', ${sqlText(`${proofPrefix}-bad-verified`)}, 'verified', now(),
          ${sqlText(`${proofPrefix}-request`)}, 'proof_actor', ${sqlText(`${proofPrefix}-actor`)}
        );
      `, "verified_without_decision_metadata_allowed");
    });

    await runCase("Q20_rejected_without_reason_rejected", async () => {
      await expectDbError(ownershipInsert({
        id: crypto.randomUUID(),
        from: "2026-05-01",
        to: "2026-06-01",
        status: "rejected",
      }), "rejected_without_reason_allowed");
    });

    await runCase("Q21_valid_review_transition_succeeds", async () => {
      await psql(ownershipInsert({
        id: ids.ownershipTransition,
        from: "2026-04-01",
        to: "2026-05-01",
      }));
      await psql(`
        update public.app_connection_ownership_periods
        set claim_status = 'under_review'
        where id = ${sqlUuid(ids.ownershipTransition)};

        update public.app_connection_ownership_periods
        set claim_status = 'verified',
            verified_at = now(),
            decision_actor_type = 'proof_decider',
            decision_actor_ref = ${sqlText(`${proofPrefix}-decider`)},
            decision_request_id = ${sqlText(`${proofPrefix}-decision`)},
            decided_at = now()
        where id = ${sqlUuid(ids.ownershipTransition)};
      `);
      const status = await psql(`
        select claim_status from public.app_connection_ownership_periods
        where id = ${sqlUuid(ids.ownershipTransition)};
      `);
      assertEquals(status, "verified", "review_transition_failed");
    });

    await runCase("Q22_invalid_backtransition_rejected", async () => {
      await expectDbError(`
        update public.app_connection_ownership_periods
        set claim_status = 'declared'
        where id = ${sqlUuid(ids.ownershipTransition)};
      `, "backtransition_allowed");
    });

    await runCase("Q23_terminal_claim_cannot_be_rewritten", async () => {
      await expectDbError(`
        update public.app_connection_ownership_periods
        set source_reference_id = ${sqlText(`${proofPrefix}-mutated-source`)}
        where id = ${sqlUuid(ids.ownershipTransition)};
      `, "terminal_claim_update_allowed");
    });

    await runCase("Q24_correction_history_uses_supersede_link", async () => {
      await psql(ownershipInsert({
        id: ids.ownershipCorrection,
        from: "2026-04-01",
        to: "2026-05-01",
        status: "superseded",
        supersedesId: ids.ownershipTransition,
      }));
      const count = Number(await psql(`
        select count(*) from public.app_connection_ownership_periods
        where id = ${sqlUuid(ids.ownershipCorrection)}
          and supersedes_ownership_period_id = ${sqlUuid(ids.ownershipTransition)}
          and claim_status = 'superseded';
      `));
      assertEquals(count, 1, "supersede_correction_missing");
    });

    await runCase("Q25_self_supersede_rejected", async () => {
      await expectDbError(ownershipInsert({
        id: ids.ownershipSelfSupersede,
        from: "2026-05-01",
        to: "2026-06-01",
        status: "superseded",
        supersedesId: ids.ownershipSelfSupersede,
      }), "self_supersede_allowed");
    });

    await runCase("Q26_source_provenance_fields_required", async () => {
      await expectDbError(`
        insert into public.app_connections (
          id, customer_id, dossier_id, location_id, ean_normalized, connection_type,
          status, source_type, source_reference_type, source_reference_id, request_id, actor_type, actor_ref
        )
        values (
          ${sqlUuid(crypto.randomUUID())}, ${sqlUuid(ids.customerA)}, ${sqlUuid(ids.dossierA)}, ${sqlUuid(ids.locationA)},
          '871234567890123460', 'primary', 'declared', 'customer_declared', 'proof', '', '', 'proof_actor',
          ${sqlText(`${proofPrefix}-actor`)}
        );
      `, "blank_provenance_allowed");
    });

    await runCase("Q27_no_raw_payload_or_car_response_columns", async () => {
      const count = Number(await psql(`
        select count(*) from information_schema.columns
        where table_schema = 'public'
          and table_name in (${TABLES.map(sqlText).join(", ")})
          and (
            column_name ilike 'raw%'
            or column_name ilike '%payload%'
            or column_name ilike '%response%'
            or column_name ilike '%car_raw%'
            or column_name ilike '%car_response%'
          );
      `));
      assertEquals(count, 0, "raw_payload_columns_present");
    });

    await runCase("Q28_no_browser_write_grants", async () => {
      const count = Number(await psql(`
        select count(*) from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (${TABLES.map(sqlText).join(", ")})
          and grantee in ('anon', 'authenticated', 'PUBLIC')
          and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');
      `));
      assertEquals(count, 0, "browser_write_grants_present");
    });

    await runCase("Q29_existing_app_row_counts_unchanged_after_cleanup", async () => {
      await cleanup();
      await setupFixtures();
      const afterCleanupSetup = await tableCounts();
      for (const [table, beforeCount] of countsBefore) {
        if ([...TABLES, "app_customers", "app_customer_dossiers", "app_dossier_locations"].includes(table)) continue;
        assertEquals(afterCleanupSetup.get(table), beforeCount, `${table}_count_changed`);
      }
    });

    await runCase("Q30_legacy_object_inventory_unchanged", async () => {
      const legacyAfter = await legacyObjectCount();
      assertEquals(legacyAfter, legacyBefore, "legacy_object_count_changed");
    });

    await runCase("Q31_claim_does_not_create_customer_dossier_document_auth", async () => {
      await psql(connectionInsert({
        id: ids.connectionSequential,
        ean: "871234567890123458",
      }));
      const before = await psql(`
        select
          (select count(*) from public.app_customers) || '|' ||
          (select count(*) from public.app_customer_dossiers) || '|' ||
          (select count(*) from public.app_dossier_document_files) || '|' ||
          (select count(*) from auth.users);
      `);
      await psql(ownershipInsert({
        id: ids.ownershipDeclared,
        connectionId: ids.connectionSequential,
        from: "2026-06-01",
        to: "2026-07-01",
      }));
      const after = await psql(`
        select
          (select count(*) from public.app_customers) || '|' ||
          (select count(*) from public.app_customer_dossiers) || '|' ||
          (select count(*) from public.app_dossier_document_files) || '|' ||
          (select count(*) from auth.users);
      `);
      assertEquals(after, before, "claim_created_unexpected_entities");
    });

    await runCase("Q32_cleanup_removes_all_proof_data", async () => {
      await cleanup();
      const remaining = Number(await psql(`
        select
          (select count(*) from public.app_connection_ownership_periods where actor_ref = ${sqlText(`${proofPrefix}-actor`)}) +
          (select count(*) from public.app_connection_periods where actor_ref = ${sqlText(`${proofPrefix}-actor`)}) +
          (select count(*) from public.app_connections where actor_ref = ${sqlText(`${proofPrefix}-actor`)}) +
          (select count(*) from public.app_dossier_locations where id in (${[ids.locationA, ids.locationB].map(sqlUuid).join(", ")})) +
          (select count(*) from public.app_customer_dossiers where id in (${[ids.dossierA, ids.dossierB].map(sqlUuid).join(", ")})) +
          (select count(*) from public.app_customers where id in (${[ids.customerA, ids.customerB].map(sqlUuid).join(", ")}));
      `));
      assertEquals(remaining, 0, "proof_data_remaining");
    });

    await runCase("Q33_final_inventory_matches_migration", async () => {
      const inventory = await psql(`
        select
          (select count(*) from information_schema.tables where table_schema = 'public' and table_name in (${TABLES.map(sqlText).join(", ")})) || '|' ||
          (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in (${GUARD_FUNCTIONS.map(sqlText).join(", ")})) || '|' ||
          (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in (${TABLES.map(sqlText).join(", ")}) and not t.tgisinternal) || '|' ||
          (select count(*) from pg_policies where schemaname = 'public' and tablename in (${TABLES.map(sqlText).join(", ")})) || '|' ||
          (select count(*) from pg_indexes where schemaname = 'public' and tablename in (${TABLES.map(sqlText).join(", ")}));
      `);
      assertEquals(inventory, "3|8|9|3|15", "final_inventory_mismatch");
    });

    await runCase("Q34_final_marker", () => {
      assert(true, "marker_ready");
    });

    await cleanup();
    const countsAfter = await tableCounts();
    await assertCountsUnchanged(countsBefore, countsAfter);
    assertEquals(await legacyObjectCount(), legacyBefore, "legacy_object_count_changed_after_cleanup");
  } finally {
    await cleanup();
  }

  for (const result of results) {
    console.log(`${result.id}: ${result.status}`);
    if (result.status === "FAIL") console.log(`  detail: ${result.detail}`);
  }

  const failed = results.filter((result) => result.status === "FAIL");
  if (failed.length > 0) {
    console.error(`app-ean-connection-domain-foundation-proof-failed: ${failed.length}`);
    Deno.exit(1);
  }

  console.log("app-ean-connection-domain-foundation-proof-ok");
}

await main();
