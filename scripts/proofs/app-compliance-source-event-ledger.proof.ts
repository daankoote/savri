import {
  buildComplianceActionPlan,
  ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
} from "../../platform/runtime/compliance/compliance_action_plan.ts";
import {
  projectComplianceWorklist,
} from "../../platform/runtime/compliance/compliance_worklist.ts";
import {
  applyDeliveryYearComplianceEvent,
  createInitialDeliveryYearComplianceStateV1,
  DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
  type DeliveryYearComplianceEventV1,
  type DeliveryYearComplianceStateV1,
} from "../../platform/runtime/compliance/delivery_year_compliance.ts";
import {
  DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_CONTRACT_VERSION,
  DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_KINDS,
  mapComplianceSourceEventToReg02,
  type PersistedDeliveryYearComplianceSourceEventV1,
} from "../../platform/runtime/compliance/delivery_year_compliance_source_event.ts";

const CONTAINER = "supabase_db_enval";
const DATABASE = `enval_reg03g_proof_${crypto.randomUUID().replaceAll("-", "")}`;
const MIGRATIONS = [
  "supabase/migrations/20260816150000_app_current_baseline.sql",
  "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql",
  "supabase/migrations/20260817120000_app_compliance_workforce_view.sql",
  "supabase/migrations/20260817160000_app_compliance_source_event_ledger.sql",
] as const;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

class ProofFailure extends Error {}
type CommandResult = Readonly<{ code: number; stdout: string; stderr: string }>;

function assert(value: boolean, code: string): asserts value {
  if (!value) throw new ProofFailure(code);
}
function q(value: number): void {
  console.log(`REG03G-Q${String(value).padStart(2, "0")}: PASS`);
}
function scrub(value: string): string {
  return value
    .replaceAll(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "[uuid]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, "[address]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 400);
}
async function command(
  name: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  const child = new Deno.Command(name, {
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
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout).trim(),
    stderr: new TextDecoder().decode(output.stderr).trim(),
  };
}
async function must(name: string, args: string[], stdin?: string) {
  const result = await command(name, args, stdin);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || `${name}_failed`));
  }
  return result.stdout;
}
async function psqlResult(sql: string): Promise<CommandResult> {
  return await command("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-X",
    "-qAt",
    "-U",
    "postgres",
    "-d",
    DATABASE,
    "-v",
    "ON_ERROR_STOP=1",
  ], sql);
}
async function psql(sql: string): Promise<string> {
  const result = await psqlResult(sql);
  if (result.code !== 0) {
    throw new ProofFailure(scrub(result.stderr || "psql_failed"));
  }
  return result.stdout;
}
async function reject(sql: string): Promise<void> {
  const result = await psqlResult(`begin;\n${sql}\nrollback;`);
  assert(result.code !== 0, "expected_rejection");
}

function insertEvent(input: {
  eventId: string;
  year: number;
  kind: string;
  occurredAt: string;
  actor: string;
  provenance: string;
  evidenceReference: string;
  hash?: string;
  evidenceVersionId?: string | null;
  verificationResultReference?: string | null;
  statementReference?: string | null;
  findingsReportReference?: string | null;
}): string {
  const nullable = (value: string | null | undefined) =>
    value == null ? "null" : `'${value}'`;
  return `
    insert into public.app_delivery_year_compliance_source_events (
      source_contract_version,event_schema_version,event_id,delivery_year,
      event_kind,occurred_at,regulated_actor_kind,recorded_at,
      recorder_kind,recorder_reference,provenance_kind,evidence_reference,
      evidence_sha256,evidence_version_id,verification_result_reference,
      statement_reference,findings_report_reference
    ) values (
      'delivery-year-compliance-source-event-v1',
      'delivery-year-compliance-event-v1','${input.eventId}',${input.year},
      '${input.kind}','${input.occurredAt}','${input.actor}',
      '${input.year + 1}-06-01T00:00:00Z','WORKFORCE','workforce:proof-recorder',
      '${input.provenance}','${input.evidenceReference}',
      '${input.hash ?? HASH_A}',${nullable(input.evidenceVersionId)},
      ${nullable(input.verificationResultReference)},
      ${nullable(input.statementReference)},
      ${nullable(input.findingsReportReference)}
    );`;
}

function parsePersistedRow(line: string): PersistedDeliveryYearComplianceSourceEventV1 {
  const fields = line.split("|");
  assert(fields.length === 17, "persisted_row_shape_invalid");
  return {
    source_contract_version: fields[0] as typeof DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_CONTRACT_VERSION,
    event_schema_version: fields[1] as "delivery-year-compliance-event-v1",
    event_id: fields[2],
    delivery_year: Number(fields[3]),
    event_kind: fields[4] as PersistedDeliveryYearComplianceSourceEventV1["event_kind"],
    occurred_at: fields[5],
    regulated_actor_kind: fields[6] as PersistedDeliveryYearComplianceSourceEventV1["regulated_actor_kind"],
    recorded_at: fields[7],
    recorder_kind: fields[8] as PersistedDeliveryYearComplianceSourceEventV1["recorder_kind"],
    recorder_reference: fields[9],
    provenance_kind: fields[10] as PersistedDeliveryYearComplianceSourceEventV1["provenance_kind"],
    evidence_reference: fields[11],
    evidence_sha256: fields[12],
    evidence_version_id: fields[13] || null,
    verification_result_reference: fields[14] || null,
    statement_reference: fields[15] || null,
    findings_report_reference: fields[16] || null,
  };
}

function replay(
  year: number,
  events: readonly DeliveryYearComplianceEventV1[],
): DeliveryYearComplianceStateV1 {
  const initial = createInitialDeliveryYearComplianceStateV1(year);
  assert(initial.ok, "initial_state_rejected");
  let state = initial.value;
  for (const event of events) {
    const result = applyDeliveryYearComplianceEvent(state, event);
    assert(result.ok && !result.idempotent, `reg02_replay_failed:${result.ok ? "idempotent" : result.code}`);
    state = result.value;
  }
  return state;
}

try {
  await must("docker", [
    "exec",
    CONTAINER,
    "createdb",
    "-U",
    "postgres",
    "-T",
    "template0",
    DATABASE,
  ]);
  await psql(`
    create schema extensions;
    create extension pgcrypto with schema extensions;
    create schema auth;
    create table auth.users (
      instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255),
      email varchar(255), encrypted_password varchar(255),
      email_confirmed_at timestamptz, invited_at timestamptz,
      confirmation_token varchar(255), confirmation_sent_at timestamptz,
      recovery_token varchar(255), recovery_sent_at timestamptz,
      email_change_token_new varchar(255), email_change varchar(255),
      email_change_sent_at timestamptz, last_sign_in_at timestamptz,
      raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_super_admin boolean,
      created_at timestamptz, updated_at timestamptz, phone text,
      phone_confirmed_at timestamptz, phone_change text,
      phone_change_token text, phone_change_sent_at timestamptz,
      confirmed_at timestamptz generated always as (
        least(email_confirmed_at, phone_confirmed_at)
      ) stored,
      email_change_token_current text,
      email_change_confirm_status smallint default 0,
      banned_until timestamptz, reauthentication_token text,
      reauthentication_sent_at timestamptz,
      is_sso_user boolean default false not null,
      deleted_at timestamptz, is_anonymous boolean default false not null
    );
  `);
  for (const path of MIGRATIONS.slice(0, -1)) {
    await psql(await Deno.readTextFile(path));
  }
  const auditCountBefore = await psql(
    "select count(*) from public.app_audit_events;",
  );
  await psql(await Deno.readTextFile(MIGRATIONS.at(-1)!));

  const catalog = await psql(`select concat_ws('|',
    (select count(*) from information_schema.columns
      where table_schema='public'
        and table_name='app_delivery_year_compliance_source_events'
        and column_name in ('tenant_id','customer_id','case_id','location_id')),
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname like 'app\\_%compliance%'
        and c.relkind='r'),
    (select relrowsecurity::text from pg_class
      where oid='public.app_delivery_year_compliance_source_events'::regclass),
    (select count(*) from information_schema.role_table_grants
      where table_schema='public'
        and table_name='app_delivery_year_compliance_source_events'
        and grantee in ('anon','authenticated')),
    has_table_privilege(
      'service_role','public.app_delivery_year_compliance_source_events','SELECT'
    )::text,
    has_table_privilege(
      'service_role','public.app_delivery_year_compliance_source_events','INSERT'
    )::text,
    (select count(*) from public.app_workforce_capability_catalog),
    (select count(*) from public.app_audit_events)
  );`);
  assert(
    catalog === `0|1|true|0|true|false|10|${auditCountBefore}`,
    `catalog_boundary_invalid:${catalog}`,
  );
  q(1);

  const constraints = await psql(`select (
    position('app_evidence_versions' in pg_get_functiondef(
      'public.app_compliance_source_event_insert_guard()'::regprocedure
    )) > 0
    and position('sha256' in pg_get_functiondef(
      'public.app_compliance_source_event_insert_guard()'::regprocedure
    )) > 0
    and exists (
      select 1 from pg_constraint
      where conrelid='public.app_delivery_year_compliance_source_events'::regclass
        and contype='f'
        and confrelid='public.app_evidence_versions'::regclass
    )
    and (select count(*) from pg_trigger
      where tgrelid='public.app_delivery_year_compliance_source_events'::regclass
        and not tgisinternal and tgname like '%immutable%') = 1
    and exists (select 1 from pg_trigger
      where tgrelid='public.app_delivery_year_compliance_source_events'::regclass
        and not tgisinternal and tgname like '%truncate_guard%')
  )::text;`);
  assert(constraints === "true", "immutability_or_evidence_binding_missing");
  q(2);

  const positive = [
    insertEvent({
      eventId: "event:2026:inbooking", year: 2026,
      kind: "INBOOKING_COMPLETED", occurredAt: "2027-01-10T10:00:00Z",
      actor: "INBOEKER", provenance: "REV_INBOOKING_COMPLETION",
      evidenceReference: "rev:inbooking:2026",
    }),
    insertEvent({
      eventId: "event:2026:statement", year: 2026,
      kind: "VERIFICATION_STATEMENT_POSSESSED", occurredAt: "2027-01-11T10:00:00Z",
      actor: "INBOEKER", provenance: "VERIFIER_STATEMENT_ARTIFACT",
      evidenceReference: "verifier:statement-evidence:2026",
      verificationResultReference: "verification-result:2026:positive",
      statementReference: "statement:2026:001",
    }),
    insertEvent({
      eventId: "event:2026:submission", year: 2026,
      kind: "STATEMENT_SUBMITTED_TO_NEA", occurredAt: "2027-01-12T10:00:00Z",
      actor: "INBOEKER", provenance: "NEA_SUBMISSION_CONFIRMATION",
      evidenceReference: "nea:submission-receipt:2026",
      statementReference: "statement:2026:001",
    }),
    insertEvent({
      eventId: "event:2026:rev-registration", year: 2026,
      kind: "VERIFICATION_RESULT_REGISTERED_IN_REV",
      occurredAt: "2027-01-13T10:00:00Z", actor: "VERIFIER",
      provenance: "VERIFIER_REV_REGISTRATION_CONFIRMATION",
      evidenceReference: "rev:verification-registration:2026",
      verificationResultReference: "verification-result:2026:positive",
    }),
    insertEvent({
      eventId: "event:2027:findings", year: 2027,
      kind: "FINDINGS_REPORT_RECEIVED", occurredAt: "2028-01-11T10:00:00Z",
      actor: "INBOEKER", provenance: "VERIFIER_FINDINGS_ARTIFACT",
      evidenceReference: "verifier:findings-evidence:2027", hash: HASH_B,
      verificationResultReference: "verification-result:2027:findings",
      findingsReportReference: "findings:2027:001",
    }),
  ];
  await psql(positive.join("\n"));
  const kinds = await psql(`select count(distinct event_kind) || '|' ||
    string_agg(distinct event_kind, ',' order by event_kind)
    from public.app_delivery_year_compliance_source_events;`);
  assert(
    kinds === "5|FINDINGS_REPORT_RECEIVED,INBOOKING_COMPLETED," +
      "STATEMENT_SUBMITTED_TO_NEA,VERIFICATION_RESULT_REGISTERED_IN_REV," +
      "VERIFICATION_STATEMENT_POSSESSED",
    `event_catalog_invalid:${kinds}`,
  );
  assert(DELIVERY_YEAR_COMPLIANCE_SOURCE_EVENT_KINDS.length === 5, "mapper_catalog_invalid");
  q(3);

  await reject(insertEvent({
    eventId: "event:2026:bad-inbooking", year: 2026,
    kind: "INBOOKING_COMPLETED", occurredAt: "2027-01-14T10:00:00Z",
    actor: "INBOEKER", provenance: "INTERNAL_SUBMITTED_FOR_REVIEW",
    evidenceReference: "internal:status:submitted-for-review",
  }));
  await reject(insertEvent({
    eventId: "event:2028:bad-statement", year: 2028,
    kind: "VERIFICATION_STATEMENT_POSSESSED", occurredAt: "2029-01-11T10:00:00Z",
    actor: "INBOEKER", provenance: "REV_INBOOKING_COMPLETION",
    evidenceReference: "verifier:statement:bad",
    verificationResultReference: "verification-result:2028:positive",
    statementReference: "statement:2028:001",
  }));
  await reject(insertEvent({
    eventId: "event:2028:bad-findings", year: 2028,
    kind: "FINDINGS_REPORT_RECEIVED", occurredAt: "2029-01-11T10:00:00Z",
    actor: "INBOEKER", provenance: "VERIFIER_STATEMENT_ARTIFACT",
    evidenceReference: "verifier:findings:bad",
    verificationResultReference: "verification-result:2028:findings",
    findingsReportReference: "findings:2028:001",
  }));
  q(4);

  await reject(insertEvent({
    eventId: "event:2028:bad-submission", year: 2028,
    kind: "STATEMENT_SUBMITTED_TO_NEA", occurredAt: "2029-01-12T10:00:00Z",
    actor: "INBOEKER", provenance: "VERIFIER_STATEMENT_ARTIFACT",
    evidenceReference: "internal:document-ready:2028",
    statementReference: "statement:2028:001",
  }));
  await reject(insertEvent({
    eventId: "event:2028:bad-rev", year: 2028,
    kind: "VERIFICATION_RESULT_REGISTERED_IN_REV",
    occurredAt: "2029-01-13T10:00:00Z", actor: "VERIFIER",
    provenance: "NEA_SUBMISSION_CONFIRMATION",
    evidenceReference: "internal:result-ready:2028",
    verificationResultReference: "verification-result:2028:positive",
  }));
  q(5);

  await reject(insertEvent({
    eventId: "event:2028:wrong-actor", year: 2028,
    kind: "VERIFICATION_RESULT_REGISTERED_IN_REV",
    occurredAt: "2029-01-13T10:00:00Z", actor: "INBOEKER",
    provenance: "VERIFIER_REV_REGISTRATION_CONFIRMATION",
    evidenceReference: "rev:verification-registration:2028",
    verificationResultReference: "verification-result:2028:positive",
  }));
  await reject(insertEvent({
    eventId: "event:2028:recorder-as-actor", year: 2028,
    kind: "VERIFICATION_STATEMENT_POSSESSED", occurredAt: "2029-01-11T10:00:00Z",
    actor: "WORKFORCE", provenance: "VERIFIER_STATEMENT_ARTIFACT",
    evidenceReference: "verifier:statement:2028",
    verificationResultReference: "verification-result:2028:positive",
    statementReference: "statement:2028:001",
  }));
  q(6);

  await reject(insertEvent({
    eventId: "event:2026:duplicate-inbooking", year: 2026,
    kind: "INBOOKING_COMPLETED", occurredAt: "2027-01-10T10:00:00Z",
    actor: "INBOEKER", provenance: "REV_INBOOKING_COMPLETION",
    evidenceReference: "rev:inbooking:duplicate",
  }));
  await reject(insertEvent({
    eventId: "event:2026:conflicting-findings", year: 2026,
    kind: "FINDINGS_REPORT_RECEIVED", occurredAt: "2027-01-14T10:00:00Z",
    actor: "INBOEKER", provenance: "VERIFIER_FINDINGS_ARTIFACT",
    evidenceReference: "verifier:findings:2026",
    verificationResultReference: "verification-result:2026:findings",
    findingsReportReference: "findings:2026:001",
  }));
  q(7);

  await reject(`update public.app_delivery_year_compliance_source_events
    set recorder_reference='workforce:other'
    where event_id='event:2026:inbooking';`);
  await reject(`delete from public.app_delivery_year_compliance_source_events
    where event_id='event:2026:inbooking';`);
  await reject(`truncate public.app_delivery_year_compliance_source_events;`);
  assert(await psql("select count(*) from public.app_delivery_year_compliance_source_events;") === "5", "immutable_rows_changed");
  q(8);

  await reject(`set local role authenticated;
    insert into public.app_delivery_year_compliance_source_events (
      source_contract_version,event_schema_version,event_id,delivery_year,
      event_kind,occurred_at,regulated_actor_kind,recorder_kind,
      recorder_reference,provenance_kind,evidence_reference,evidence_sha256
    ) values ('delivery-year-compliance-source-event-v1',
      'delivery-year-compliance-event-v1','event:browser:forbidden',2028,
      'INBOOKING_COMPLETED','2028-01-01T00:00:00Z','INBOEKER','SYSTEM',
      'system:browser','REV_INBOOKING_COMPLETION','rev:browser','${HASH_A}');`);
  await reject(`set local role authenticated;
    select * from public.app_delivery_year_compliance_source_events;`);
  q(9);

  const rows = await psql(`select concat_ws('|',
      source_contract_version,event_schema_version,event_id,delivery_year,
      event_kind,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      regulated_actor_kind,
      to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      recorder_kind,recorder_reference,provenance_kind,evidence_reference,
      evidence_sha256,coalesce(evidence_version_id::text,''),
      coalesce(verification_result_reference,''),coalesce(statement_reference,''),
      coalesce(findings_report_reference,'')
    ) from public.app_delivery_year_compliance_source_events
    order by delivery_year,occurred_at,event_id;`);
  const persisted = rows.split("\n").map(parsePersistedRow);
  const mapped = persisted.map((row) => {
    const result = mapComplianceSourceEventToReg02(row);
    assert(result.ok, `source_mapping_failed:${result.ok ? "unknown" : result.code}`);
    assert(
      !Object.hasOwn(result.value, "evidence_sha256") &&
        !Object.hasOwn(result.value, "recorder_reference") &&
        !Object.hasOwn(result.value, "evidence_version_id"),
      "unsafe_source_metadata_leaked",
    );
    return result.value;
  });
  assert(mapped.length === 5, "persisted_mapping_count_invalid");
  q(10);

  const unsupportedSource = mapComplianceSourceEventToReg02({
    ...persisted[0], source_contract_version: "delivery-year-compliance-source-event-v2",
  });
  const unsupportedReg02 = mapComplianceSourceEventToReg02({
    ...persisted[0], event_schema_version: "delivery-year-compliance-event-v2",
  });
  const unknownKind = mapComplianceSourceEventToReg02({
    ...persisted[0], event_kind: "YEAR_END",
  });
  assert(!unsupportedSource.ok && unsupportedSource.code === "unsupported_source_contract_version", "source_version_not_closed");
  assert(!unsupportedReg02.ok && unsupportedReg02.code === "unsupported_reg02_event_version", "reg02_version_not_closed");
  assert(!unknownKind.ok && unknownKind.code === "unknown_source_event_kind", "event_catalog_not_closed");
  q(11);

  const positiveEvents = mapped.filter((event) => event.deliveryYear === 2026);
  const positiveState = replay(2026, positiveEvents);
  assert(
    positiveState.inbooking.status === "COMPLETED" &&
      positiveState.verificationOutcome.status === "STATEMENT_POSSESSED" &&
      positiveState.statementSubmission.status === "SUBMITTED" &&
      positiveState.verifierRevRegistration.status === "REGISTERED",
    "positive_replay_incomplete",
  );
  const repeated = applyDeliveryYearComplianceEvent(positiveState, positiveEvents[0]);
  assert(repeated.ok && repeated.idempotent && repeated.value === positiveState, "identical_replay_not_idempotent");
  q(12);

  const findingsEvents = mapped.filter((event) => event.deliveryYear === 2027);
  const findingsStateA = replay(2027, findingsEvents);
  const findingsStateB = replay(2027, findingsEvents);
  assert(
    findingsStateA.verificationOutcome.status === "FINDINGS_REPORT_RECEIVED" &&
      JSON.stringify(findingsStateA) === JSON.stringify(findingsStateB),
    "findings_replay_not_deterministic",
  );
  q(13);

  const actionPlanA = buildComplianceActionPlan(
    positiveState,
    DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
    "2027-02-01T12:00:00Z",
    ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  );
  const actionPlanB = buildComplianceActionPlan(
    positiveState,
    DELIVERY_YEAR_2026_COMPLIANCE_CALENDAR_V1,
    "2027-02-01T12:00:00Z",
    ENVAL_COMPLIANCE_ACTION_PLAN_POLICY_V1,
  );
  assert(actionPlanA.ok && actionPlanB.ok && JSON.stringify(actionPlanA.value) === JSON.stringify(actionPlanB.value), "reg03b_not_deterministic");
  const worklistA = projectComplianceWorklist(actionPlanA.value);
  const worklistB = projectComplianceWorklist(actionPlanB.value);
  assert(worklistA.ok && worklistB.ok && JSON.stringify(worklistA.value) === JSON.stringify(worklistB.value), "reg03d_not_deterministic");
  q(14);

  const noDerivedPersistence = await psql(`select (
    to_regclass('public.app_delivery_year_compliance_states') is null
    and to_regclass('public.app_compliance_action_plans') is null
    and to_regclass('public.app_compliance_worklists') is null
    and not exists (select 1 from information_schema.columns
      where table_schema='public'
        and table_name='app_delivery_year_compliance_source_events'
        and column_name in ('status','notes','metadata','reminder_state','worklist_state'))
  )::text;`);
  assert(noDerivedPersistence === "true", "derived_or_mutable_state_persisted");
  q(15);

  console.log("COMPLIANCE_SOURCE_EVENT_LEDGER_Q01_Q15=PASS");
  console.log("EVENT_KIND_COUNT=5");
  console.log("POSITIVE_PATH=PASS");
  console.log("FINDINGS_PATH=PASS");
  console.log("REG02_REPLAY=PASS");
  console.log("REG03B_DOWNSTREAM=PASS");
  console.log("REG03D_DOWNSTREAM=PASS");
  console.log("PERSISTENT_TEST_FIXTURES_LEFT=NO");
} catch (error) {
  console.error(
    `COMPLIANCE_SOURCE_EVENT_LEDGER=FAIL\n${scrub(error instanceof Error ? error.message : String(error))}`,
  );
  Deno.exitCode = 1;
} finally {
  try {
    await must("docker", [
      "exec", CONTAINER, "dropdb", "-U", "postgres", "--force",
      "--if-exists", DATABASE,
    ]);
  } catch {
    console.error("DISPOSABLE_DATABASE_CLEANUP=FAIL");
    Deno.exitCode = 1;
  }
}
