// Local destructive proof for Gate 1 connection write RPCs.
// Requires ENVAL_ALLOW_DESTRUCTIVE_LOCAL_PROOF=YES.
// Uses only the local Supabase Postgres container and never prints secrets,
// customer data, EANs, addresses, IDs, connection strings, or keys.

type ProofStatus = "PASS" | "FAIL";
type ProofResult = { id: string; status: ProofStatus; detail: string };
type TableCounts = Map<string, number>;

const RPCS = [
  "app_declare_connection_v1",
  "app_declare_connection_ownership_v1",
  "app_decide_connection_ownership_v1",
  "app_supersede_connection_ownership_v1",
] as const;

const proofPrefix = `conn-rpc-proof-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const actorRef = `${proofPrefix}-actor`;
const reviewerRef = `${proofPrefix}-reviewer`;
const hashA = "a".repeat(64);
const hashB = "b".repeat(64);
const hashC = "c".repeat(64);
const hashD = "d".repeat(64);
const hashE = "e".repeat(64);

const ids = {
  customerA: crypto.randomUUID(),
  customerB: crypto.randomUUID(),
  dossierA: crypto.randomUUID(),
  dossierB: crypto.randomUUID(),
  locationA: crypto.randomUUID(),
  locationB: crypto.randomUUID(),
  selfSupersede: crypto.randomUUID(),
};

const results: ProofResult[] = [];
let connectionId = "";
let periodId = "";
let ownershipClaimId = "";
let reviewClaimId = "";
let missingMetaClaimId = "";
let rejectedNoReasonClaimId = "";
let supersedeClaimId = "";
let declareResponseText = "";
let entityCountsBeforeClaim = "";

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

async function callJson(sql: string): Promise<Record<string, unknown>> {
  const raw = await psql(sql);
  assert(raw.startsWith("{") && raw.endsWith("}"), "rpc_response_not_json");
  return JSON.parse(raw) as Record<string, unknown>;
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

function key(suffix: string): string {
  return `${proofPrefix}-${suffix}`;
}

function requestId(suffix: string): string {
  return `${proofPrefix}-request-${suffix}`;
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

function declareConnectionSql(args: {
  customerId?: string;
  dossierId?: string;
  locationId?: string;
  ean?: string;
  type?: string;
  from?: string | null;
  to?: string | null;
  key: string;
  hash: string;
  request: string;
}): string {
  return `
    select public.app_declare_connection_v1(
      ${sqlUuid(args.customerId ?? ids.customerA)},
      ${sqlUuid(args.dossierId ?? ids.dossierA)},
      ${sqlUuid(args.locationId ?? ids.locationA)},
      ${sqlText(args.ean ?? "871234567890123456")},
      ${sqlText(args.type ?? "primary")},
      'synthetic-network',
      ${args.from === null ? "null" : `${sqlText(args.from ?? "2026-01-01")}::date`},
      ${args.to === null ? "null" : `${sqlText(args.to ?? "2026-02-01")}::date`},
      'synthetic-network',
      'exclusive_transport_connection',
      'customer_declared',
      'proof',
      ${sqlText(`${proofPrefix}-source`)},
      'support',
      ${sqlText(actorRef)},
      ${sqlText(args.request)},
      ${sqlText(args.key)},
      ${sqlText(args.hash)}
    )::text;
  `;
}

function declareOwnershipSql(args: {
  connection?: string;
  customerId?: string;
  dossierId?: string;
  from: string;
  to: string;
  status?: string;
  sourceReferenceId?: string;
  sourceReferenceType?: string;
  claimSourceType?: string;
  key: string;
  hash: string;
  request: string;
}): string {
  return `
    select public.app_declare_connection_ownership_v1(
      ${sqlUuid(args.connection ?? connectionId)},
      ${sqlUuid(args.customerId ?? ids.customerA)},
      ${sqlUuid(args.dossierId ?? ids.dossierA)},
      ${sqlText(args.from)}::date,
      ${sqlText(args.to)}::date,
      ${sqlText(args.claimSourceType ?? "customer_declared")},
      ${sqlText(args.sourceReferenceType ?? "proof")},
      ${sqlText(args.sourceReferenceId ?? `${proofPrefix}-ownership-source`)},
      ${sqlText(args.status ?? "declared")},
      'support',
      ${sqlText(actorRef)},
      ${sqlText(args.request)},
      ${sqlText(args.key)},
      ${sqlText(args.hash)}
    )::text;
  `;
}

function decideOwnershipSql(args: {
  claim?: string;
  decision: string;
  reason?: string;
  actorType?: string;
  actorRef?: string;
  key: string;
  hash: string;
  request: string;
}): string {
  return `
    select public.app_decide_connection_ownership_v1(
      ${sqlUuid(args.claim ?? reviewClaimId)},
      ${sqlUuid(ids.customerA)},
      ${sqlUuid(ids.dossierA)},
      ${sqlText(args.decision)},
      ${args.reason === undefined ? "null" : sqlText(args.reason)},
      ${args.actorType === undefined ? "'support'" : sqlText(args.actorType)},
      ${args.actorRef === undefined ? sqlText(reviewerRef) : sqlText(args.actorRef)},
      ${sqlText(args.request)},
      ${sqlText(args.key)},
      ${sqlText(args.hash)}
    )::text;
  `;
}

function supersedeOwnershipSql(args: {
  claim?: string;
  from: string;
  to: string;
  reason?: string;
  key: string;
  hash: string;
  request: string;
}): string {
  return `
    select public.app_supersede_connection_ownership_v1(
      ${sqlUuid(args.claim ?? reviewClaimId)},
      ${sqlUuid(ids.customerA)},
      ${sqlUuid(ids.dossierA)},
      ${sqlText(args.from)}::date,
      ${sqlText(args.to)}::date,
      'manual_review',
      'proof',
      ${sqlText(`${proofPrefix}-supersede-source`)},
      ${args.reason === undefined ? "null" : sqlText(args.reason)},
      'support',
      ${sqlText(reviewerRef)},
      ${sqlText(args.request)},
      ${sqlText(args.key)},
      ${sqlText(args.hash)}
    )::text;
  `;
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

async function cleanup(): Promise<void> {
  await psql(`
    delete from public.app_connection_ownership_periods
    where actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)})
       or decision_actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)})
       or source_reference_id like ${sqlText(`${proofPrefix}%`)};

    delete from public.app_connection_periods
    where actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)})
       or source_reference_id like ${sqlText(`${proofPrefix}%`)};

    delete from public.app_connections
    where actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)})
       or source_reference_id like ${sqlText(`${proofPrefix}%`)};

    delete from public.app_audit_events
    where request_id like ${sqlText(`${proofPrefix}%`)}
       or idempotency_key like ${sqlText(`${proofPrefix}%`)}
       or actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)});

    delete from public.app_idempotency_keys
    where key like ${sqlText(`${proofPrefix}%`)}
       or scope like ${sqlText(`connection_declare:${ids.customerA}%`)}
       or scope like ${sqlText(`connection_declare:${ids.customerB}%`)};

    delete from public.app_dossier_locations
    where id in (${[ids.locationA, ids.locationB].map(sqlUuid).join(", ")})
       or client_location_id like ${sqlText(`${proofPrefix}%`)};

    delete from public.app_customer_dossiers
    where id in (${[ids.dossierA, ids.dossierB].map(sqlUuid).join(", ")})
       or dossier_number like ${sqlText(`${proofPrefix}%`)};

    delete from public.app_customers
    where id in (${[ids.customerA, ids.customerB].map(sqlUuid).join(", ")})
       or display_name like ${sqlText(`${proofPrefix}%`)};
  `);
}

async function entityCounts(): Promise<string> {
  return await psql(`
    select
      (select count(*) from public.app_customers) || '|' ||
      (select count(*) from public.app_customer_dossiers) || '|' ||
      (select count(*) from public.app_dossier_locations) || '|' ||
      (select count(*) from public.app_dossier_document_files) || '|' ||
      (select count(*) from auth.users);
  `);
}

async function assertCountsUnchanged(before: TableCounts, after: TableCounts): Promise<void> {
  for (const [table, beforeCount] of before) {
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

    await runCase("Q1_rpcs_exist", async () => {
      const count = Number(await psql(`
        select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (${RPCS.map(sqlText).join(", ")});
      `));
      assertEquals(count, 4, "rpc_count");
    });

    await runCase("Q2_rpcs_security_definer", async () => {
      const count = Number(await psql(`
        select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (${RPCS.map(sqlText).join(", ")})
          and p.prosecdef;
      `));
      assertEquals(count, 4, "security_definer_count");
    });

    await runCase("Q3_search_path_safe", async () => {
      const count = Number(await psql(`
        select count(*)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (${RPCS.map(sqlText).join(", ")})
          and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=""';
      `));
      assertEquals(count, 4, "safe_search_path_count");
    });

    await runCase("Q4_service_role_execute_present", async () => {
      const count = Number(await psql(`
        select count(*)
        from information_schema.routine_privileges
        where specific_schema = 'public'
          and routine_name in (${RPCS.map(sqlText).join(", ")})
          and grantee = 'service_role'
          and privilege_type = 'EXECUTE';
      `));
      assertEquals(count, 4, "service_role_execute_count");
    });

    await runCase("Q5_browser_roles_no_execute", async () => {
      const count = Number(await psql(`
        select count(*)
        from information_schema.routine_privileges
        where specific_schema = 'public'
          and routine_name in (${RPCS.map(sqlText).join(", ")})
          and grantee in ('PUBLIC', 'anon', 'authenticated');
      `));
      assertEquals(count, 0, "browser_execute_grants_present");
    });

    await runCase("Q6_valid_connection_declare_succeeds", async () => {
      const raw = await psql(declareConnectionSql({
        key: key("declare"),
        hash: hashA,
        request: requestId("declare"),
      }));
      declareResponseText = raw;
      const res = JSON.parse(raw) as Record<string, unknown>;
      assert(res.ok === true, "connection_declare_not_ok");
      connectionId = String(res.connection_id);
      periodId = String(res.connection_period_id);
      assert(connectionId.length > 0, "connection_id_missing");
      assert(periodId.length > 0, "period_id_missing");
    });

    await runCase("Q7_idempotent_replay_same_payload", async () => {
      const raw = await psql(declareConnectionSql({
        key: key("declare"),
        hash: hashA,
        request: requestId("declare"),
      }));
      assertEquals(raw, declareResponseText, "replay_response_changed");
    });

    await runCase("Q8_idempotency_conflict_same_key_other_payload", async () => {
      const res = await callJson(declareConnectionSql({
        key: key("declare"),
        hash: hashB,
        request: requestId("declare-conflict"),
      }));
      assertEquals(res.code, "idempotency_conflict", "conflict_code");
    });

    await runCase("Q9_cross_customer_scope_fails", async () => {
      const res = await callJson(declareConnectionSql({
        customerId: ids.customerB,
        dossierId: ids.dossierA,
        locationId: ids.locationA,
        ean: "871234567890123457",
        key: key("cross-customer"),
        hash: hashB,
        request: requestId("cross-customer"),
      }));
      assertEquals(res.code, "customer_scope_mismatch", "cross_customer_code");
    });

    await runCase("Q10_cross_dossier_scope_fails", async () => {
      const res = await callJson(declareOwnershipSql({
        customerId: ids.customerA,
        dossierId: ids.dossierB,
        from: "2026-02-01",
        to: "2026-03-01",
        key: key("cross-dossier"),
        hash: hashB,
        request: requestId("cross-dossier"),
      }));
      assertEquals(res.code, "dossier_scope_mismatch", "cross_dossier_code");
    });

    await runCase("Q11_cross_location_scope_fails", async () => {
      const res = await callJson(declareConnectionSql({
        customerId: ids.customerA,
        dossierId: ids.dossierA,
        locationId: ids.locationB,
        ean: "871234567890123458",
        key: key("cross-location"),
        hash: hashB,
        request: requestId("cross-location"),
      }));
      assertEquals(res.code, "location_scope_mismatch", "cross_location_code");
    });

    await runCase("Q12_connection_declare_writes_audit", async () => {
      const count = Number(await psql(`
        select count(*) from public.app_audit_events
        where event_type = 'app_connection_declared'
          and request_id = ${sqlText(requestId("declare"))}
          and idempotency_key = ${sqlText(key("declare"))};
      `));
      assertEquals(count, 1, "connection_audit_count");
    });

    await runCase("Q13_connection_declare_writes_idempotency", async () => {
      const count = Number(await psql(`
        select count(*) from public.app_idempotency_keys
        where key = ${sqlText(key("declare"))}
          and response_status = 200
          and response_body is not null;
      `));
      assertEquals(count, 1, "connection_idempotency_count");
    });

    await runCase("Q14_declared_ownership_claim_succeeds", async () => {
      entityCountsBeforeClaim = await entityCounts();
      const res = await callJson(declareOwnershipSql({
        from: "2026-02-01",
        to: "2026-03-01",
        key: key("claim-declare"),
        hash: hashC,
        request: requestId("claim-declare"),
      }));
      assert(res.ok === true, "ownership_declare_not_ok");
      ownershipClaimId = String(res.ownership_claim_id);
      assert(ownershipClaimId.length > 0, "ownership_claim_id_missing");
    });

    await runCase("Q15_claim_starts_not_verified", async () => {
      const status = await psql(`
        select claim_status from public.app_connection_ownership_periods
        where id = ${sqlUuid(ownershipClaimId)};
      `);
      assertEquals(status, "declared", "claim_not_declared");
    });

    await runCase("Q16_missing_source_provenance_fails", async () => {
      const res = await callJson(declareOwnershipSql({
        from: "2026-03-01",
        to: "2026-04-01",
        sourceReferenceId: "",
        key: key("missing-source"),
        hash: hashC,
        request: requestId("missing-source"),
      }));
      assertEquals(res.code, "source_provenance_required", "missing_source_code");
    });

    await runCase("Q17_invalid_period_fails", async () => {
      const res = await callJson(declareOwnershipSql({
        from: "2026-03-01",
        to: "2026-03-01",
        key: key("invalid-period"),
        hash: hashC,
        request: requestId("invalid-period"),
      }));
      assertEquals(res.code, "invalid_request", "invalid_period_code");
    });

    await runCase("Q18_overlap_conflict_fails", async () => {
      const res = await callJson(declareOwnershipSql({
        from: "2026-02-15",
        to: "2026-03-15",
        key: key("overlap"),
        hash: hashC,
        request: requestId("overlap"),
      }));
      assertEquals(res.code, "overlap_conflict", "overlap_code");
    });

    await runCase("Q19_valid_review_transition_succeeds", async () => {
      const declared = await callJson(declareOwnershipSql({
        from: "2026-03-01",
        to: "2026-04-01",
        status: "under_review",
        key: key("claim-review"),
        hash: hashD,
        request: requestId("claim-review"),
      }));
      assert(declared.ok === true, "review_claim_declare_failed");
      reviewClaimId = String(declared.ownership_claim_id);
      const decided = await callJson(decideOwnershipSql({
        decision: "verified",
        key: key("claim-review-decide"),
        hash: hashD,
        request: requestId("claim-review-decide"),
      }));
      assert(decided.ok === true, "review_decision_failed");
      assertEquals(decided.claim_status, "verified", "review_status");
    });

    await runCase("Q20_verified_without_decision_metadata_fails", async () => {
      const declared = await callJson(declareOwnershipSql({
        from: "2026-04-01",
        to: "2026-05-01",
        key: key("claim-missing-meta"),
        hash: hashD,
        request: requestId("claim-missing-meta"),
      }));
      missingMetaClaimId = String(declared.ownership_claim_id);
      const res = await callJson(decideOwnershipSql({
        claim: missingMetaClaimId,
        decision: "verified",
        actorType: "",
        actorRef: "",
        key: key("claim-missing-meta-decide"),
        hash: hashD,
        request: requestId("claim-missing-meta-decide"),
      }));
      assertEquals(res.code, "decision_metadata_required", "missing_decision_metadata_code");
    });

    await runCase("Q21_rejected_without_reason_fails", async () => {
      const declared = await callJson(declareOwnershipSql({
        from: "2026-05-01",
        to: "2026-06-01",
        key: key("claim-reject-no-reason"),
        hash: hashD,
        request: requestId("claim-reject-no-reason"),
      }));
      rejectedNoReasonClaimId = String(declared.ownership_claim_id);
      const res = await callJson(decideOwnershipSql({
        claim: rejectedNoReasonClaimId,
        decision: "rejected",
        reason: "",
        key: key("claim-reject-no-reason-decide"),
        hash: hashD,
        request: requestId("claim-reject-no-reason-decide"),
      }));
      assertEquals(res.code, "decision_metadata_required", "rejected_no_reason_code");
    });

    await runCase("Q22_invalid_backtransition_fails", async () => {
      const res = await callJson(decideOwnershipSql({
        claim: reviewClaimId,
        decision: "declared",
        key: key("invalid-backtransition"),
        hash: hashD,
        request: requestId("invalid-backtransition"),
      }));
      assertEquals(res.code, "invalid_transition", "backtransition_code");
    });

    await runCase("Q23_terminal_claim_cannot_be_silently_rewritten", async () => {
      await expectDbError(`
        update public.app_connection_ownership_periods
        set source_reference_id = ${sqlText(`${proofPrefix}-mutated`)}
        where id = ${sqlUuid(reviewClaimId)};
      `, "terminal_claim_update_allowed");
    });

    await runCase("Q24_supersede_creates_new_history_row", async () => {
      const res = await callJson(supersedeOwnershipSql({
        from: "2026-03-01",
        to: "2026-04-01",
        reason: "proof correction",
        key: key("supersede"),
        hash: hashE,
        request: requestId("supersede"),
      }));
      assert(res.ok === true, "supersede_not_ok");
      supersedeClaimId = String(res.ownership_claim_id);
      const count = Number(await psql(`
        select count(*) from public.app_connection_ownership_periods
        where id = ${sqlUuid(supersedeClaimId)}
          and supersedes_ownership_period_id = ${sqlUuid(reviewClaimId)};
      `));
      assertEquals(count, 1, "supersede_history_row_missing");
    });

    await runCase("Q25_old_claim_remains", async () => {
      const count = Number(await psql(`
        select count(*) from public.app_connection_ownership_periods
        where id = ${sqlUuid(reviewClaimId)}
          and claim_status = 'verified';
      `));
      assertEquals(count, 1, "old_claim_missing_or_mutated");
    });

    await runCase("Q26_self_supersede_fails", async () => {
      await expectDbError(`
        insert into public.app_connection_ownership_periods (
          id, connection_id, customer_id, dossier_id, valid_from, valid_to, claim_source_type,
          source_reference_type, source_reference_id, claim_status, request_id, actor_type,
          actor_ref, decision_actor_type, decision_actor_ref, decision_request_id,
          decision_reason, decided_at, supersedes_ownership_period_id
        )
        values (
          ${sqlUuid(ids.selfSupersede)}, ${sqlUuid(connectionId)}, ${sqlUuid(ids.customerA)},
          ${sqlUuid(ids.dossierA)}, '2026-07-01', '2026-08-01', 'manual_review',
          'proof', ${sqlText(`${proofPrefix}-self-supersede`)}, 'superseded',
          ${sqlText(requestId("self-supersede"))}, 'support', ${sqlText(actorRef)},
          'support', ${sqlText(reviewerRef)}, ${sqlText(requestId("self-supersede"))},
          'proof reason', now(), ${sqlUuid(ids.selfSupersede)}
        );
      `, "self_supersede_insert_allowed");
    });

    await runCase("Q27_supersede_cycle_fails_or_impossible", async () => {
      const res = await callJson(supersedeOwnershipSql({
        claim: supersedeClaimId,
        from: "2026-03-01",
        to: "2026-04-01",
        reason: "proof cycle attempt",
        key: key("supersede-cycle"),
        hash: hashE,
        request: requestId("supersede-cycle"),
      }));
      assertEquals(res.code, "supersede_invalid", "supersede_cycle_code");
    });

    await runCase("Q28_no_auto_customer_dossier_location_document_auth_created", async () => {
      const after = await entityCounts();
      assertEquals(after, entityCountsBeforeClaim, "entity_counts_changed_after_claims");
    });

    await runCase("Q29_no_raw_car_or_external_payload_stored", async () => {
      const count = Number(await psql(`
        select count(*) from public.app_audit_events
        where request_id like ${sqlText(`${proofPrefix}%`)}
          and event_data::text ~* '(raw_car|car_payload|external_payload|signed_url|secret|token)';
      `));
      assertEquals(count, 0, "raw_external_payload_marker_found");
    });

    await runCase("Q30_audit_contains_traceability_fields", async () => {
      const count = Number(await psql(`
        select count(*) from public.app_audit_events
        where event_type = 'app_connection_ownership_decided'
          and request_id = ${sqlText(requestId("claim-review-decide"))}
          and actor_ref = ${sqlText(reviewerRef)}
          and event_data ? 'source_type'
          and event_data ? 'decision'
          and event_data ? 'audit_recorded_at'
          and event_data ? 'idempotency_scope'
          and event_data->>'decision' = 'verified';
      `));
      assertEquals(count, 1, "audit_traceability_missing");
    });

    await runCase("Q31_idempotent_replay_no_extra_rows", async () => {
      const before = await psql(`
        select
          (select count(*) from public.app_connections) || '|' ||
          (select count(*) from public.app_connection_periods) || '|' ||
          (select count(*) from public.app_connection_ownership_periods) || '|' ||
          (select count(*) from public.app_audit_events where request_id like ${sqlText(`${proofPrefix}%`)}) || '|' ||
          (select count(*) from public.app_idempotency_keys where key like ${sqlText(`${proofPrefix}%`)});
      `);
      const raw = await psql(declareConnectionSql({
        key: key("declare"),
        hash: hashA,
        request: requestId("declare"),
      }));
      assertEquals(raw, declareResponseText, "late_replay_response_changed");
      const after = await psql(`
        select
          (select count(*) from public.app_connections) || '|' ||
          (select count(*) from public.app_connection_periods) || '|' ||
          (select count(*) from public.app_connection_ownership_periods) || '|' ||
          (select count(*) from public.app_audit_events where request_id like ${sqlText(`${proofPrefix}%`)}) || '|' ||
          (select count(*) from public.app_idempotency_keys where key like ${sqlText(`${proofPrefix}%`)});
      `);
      assertEquals(after, before, "replay_created_extra_rows");
    });

    await runCase("Q32_cleanup_removes_all_proofdata", async () => {
      await cleanup();
      const remaining = await psql(`
        select
          (select count(*) from public.app_connection_ownership_periods where actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)}) or decision_actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)}) or source_reference_id like ${sqlText(`${proofPrefix}%`)}) || '|' ||
          (select count(*) from public.app_connection_periods where actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)}) or source_reference_id like ${sqlText(`${proofPrefix}%`)}) || '|' ||
          (select count(*) from public.app_connections where actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)}) or source_reference_id like ${sqlText(`${proofPrefix}%`)}) || '|' ||
          (select count(*) from public.app_audit_events where request_id like ${sqlText(`${proofPrefix}%`)} or idempotency_key like ${sqlText(`${proofPrefix}%`)} or actor_ref in (${sqlText(actorRef)}, ${sqlText(reviewerRef)})) || '|' ||
          (select count(*) from public.app_idempotency_keys where key like ${sqlText(`${proofPrefix}%`)}) || '|' ||
          (select count(*) from public.app_customers where display_name like ${sqlText(`${proofPrefix}%`)});
      `);
      assertEquals(remaining, "0|0|0|0|0|0", "proofdata_remaining");
    });

    await runCase("Q33_existing_app_rowcounts_unchanged_after_cleanup", async () => {
      const countsAfter = await tableCounts();
      await assertCountsUnchanged(countsBefore, countsAfter);
    });

    await runCase("Q34_legacy_object_inventory_unchanged", async () => {
      assertEquals(await legacyObjectCount(), legacyBefore, "legacy_inventory_changed");
    });

    await runCase("Q35_no_anon_authenticated_public_grants", async () => {
      const functionGrants = Number(await psql(`
        select count(*)
        from information_schema.routine_privileges
        where specific_schema = 'public'
          and routine_name in (${RPCS.map(sqlText).join(", ")})
          and grantee in ('PUBLIC', 'anon', 'authenticated');
      `));
      const tableGrants = Number(await psql(`
        select count(*)
        from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('app_connections','app_connection_periods','app_connection_ownership_periods')
          and grantee in ('PUBLIC', 'anon', 'authenticated');
      `));
      assertEquals(functionGrants, 0, "browser_function_grants_present");
      assertEquals(tableGrants, 0, "browser_table_grants_present");
    });

    await runCase("Q36_final_marker", () => {
      assert(true, "marker_ready");
    });
  } finally {
    await cleanup();
  }

  for (const result of results) {
    console.log(`${result.id}: ${result.status}`);
    if (result.status === "FAIL") console.log(`  detail: ${result.detail}`);
  }

  const failed = results.filter((result) => result.status === "FAIL");
  if (failed.length > 0) {
    console.error(`app-connection-write-rpcs-proof-failed: ${failed.length}`);
    Deno.exit(1);
  }

  console.log("app-connection-write-rpcs-proof-ok");
}

await main();
