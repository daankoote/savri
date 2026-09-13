import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { buildLocalSigningConfigurationGraph } from "../tools/enval-local-signing-configuration.ts";
import {
  createReceiptBoundLegalDocuments,
  legalDocumentIsSigningReady,
  type ReceiptBoundLegalDocumentInput,
} from "../../app/src/features/signup/signing/legalDocumentRegistry.ts";
import { signingSha256Hex } from "../../supabase/functions/_shared/signing_legal_runtime.ts";

type Json = Record<string, unknown>;
type LocalRuntime = Readonly<{
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  mailpitUrl: string;
  controlPlaneDbUrl: string;
}>;
type FixtureState = {
  fixtureId: string;
  prefix: string;
  tenantId: string;
  authUserId: string;
  email: string;
  password: string;
  intakeId: string;
  managementCapability: string;
  intakeExpiresAt: string;
  expectedBundle: string;
  pilotBefore: string;
  createdAt: string;
};

const ROOT = new URL("../../", import.meta.url);
const CONTROL_PLANE_ROOT = new URL(
  "../../platform/control-plane/",
  import.meta.url,
);
const ROOT_PATH = decodeURIComponent(ROOT.pathname);
const CONTROL_PLANE_ROOT_PATH = decodeURIComponent(CONTROL_PLANE_ROOT.pathname);
const FIXTURE_ROOT = "/private/tmp/enval-sl01cf";
const PILOT_CASE_REFERENCE = "CASE-7E4CC75CD19F";
const FIXTURE_ID_PATTERN = /^sl01cf-[0-9]{13}-[0-9a-f]{8}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
class FixtureError extends Error {}

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new FixtureError(code);
}

function safeDiagnostic(value: unknown): string {
  return String(value ?? "")
    .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database]")
    .replaceAll(
      /\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g,
      "[token]",
    )
    .replaceAll(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[key]")
    .replaceAll(/[0-9a-f]{64}/gi, "[hash]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 400);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function fixtureDirectory(fixtureId: string): string {
  assert(FIXTURE_ID_PATTERN.test(fixtureId), "fixture_id_invalid");
  return `${FIXTURE_ROOT}/${fixtureId}`;
}

async function command(
  name: string,
  args: string[],
  options: Readonly<{
    cwd?: URL;
    stdin?: string;
  }> = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new Deno.Command(name, {
    args,
    cwd: options.cwd ?? ROOT,
    env: { SUPABASE_TELEMETRY_DISABLED: "1" },
    stdin: options.stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  if (options.stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(options.stdin));
    await writer.close();
  }
  const result = await child.output();
  return {
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  };
}

function parseStatusEnvironment(raw: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    values.set(match[1], value);
  }
  return values;
}

function assertLocalUrl(raw: string, port: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FixtureError("non_local_runtime_rejected");
  }
  assert(
    url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === port,
    "non_local_runtime_rejected",
  );
  return url.toString().replace(/\/$/, "");
}

async function statusEnvironment(
  workdir: string,
): Promise<Map<string, string>> {
  const result = await command(
    "supabase",
    ["--workdir", workdir, "status", "-o", "env"],
  );
  assert(result.code === 0, "local_supabase_status_unavailable");
  return parseStatusEnvironment(result.stdout);
}

async function runtime(): Promise<LocalRuntime> {
  const [tenant, controlPlane] = await Promise.all([
    statusEnvironment(ROOT_PATH),
    statusEnvironment(CONTROL_PLANE_ROOT_PATH),
  ]);
  const apiUrl = assertLocalUrl(tenant.get("API_URL") ?? "", "54321");
  const dbUrl = tenant.get("DB_URL") ?? "";
  const controlPlaneDbUrl = controlPlane.get("DB_URL") ?? "";
  assert(
    dbUrl.includes("127.0.0.1:54322/") &&
      controlPlaneDbUrl.includes("127.0.0.1:56322/"),
    "non_local_database_rejected",
  );
  const mailpitUrl = assertLocalUrl(
    tenant.get("MAILPIT_URL") ?? tenant.get("INBUCKET_URL") ?? "",
    "54324",
  );
  const anonKey = tenant.get("ANON_KEY") ?? "";
  const serviceRoleKey = tenant.get("SERVICE_ROLE_KEY") ?? "";
  assert(anonKey && serviceRoleKey, "local_runtime_keys_unavailable");
  return {
    apiUrl,
    dbUrl,
    anonKey,
    serviceRoleKey,
    mailpitUrl,
    controlPlaneDbUrl,
  };
}

async function psql(databaseUrl: string, sql: string): Promise<string> {
  const result = await command(
    "psql",
    [databaseUrl, "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
    { stdin: sql },
  );
  if (result.code !== 0) {
    throw new FixtureError(`local_sql_failed:${safeDiagnostic(result.stderr)}`);
  }
  return result.stdout;
}

async function tenantId(config: LocalRuntime): Promise<string> {
  const value = await psql(
    config.controlPlaneDbUrl,
    `begin read only;
    select t.id::text
    from platform.tenants t
    join platform.routing_identities routing on routing.tenant_id=t.id
    join platform.data_plane_locators locator on locator.tenant_id=t.id
    where t.lifecycle_status='active' and t.public_slug='enval'
      and routing.identity_kind='host' and routing.normalized_value='enval.localhost'
      and routing.lifecycle_status='active' and locator.environment='local'
      and locator.lifecycle_status='active';
    rollback;`,
  );
  assert(UUID_PATTERN.test(value), "local_tenant_unavailable_or_ambiguous");
  return value;
}

async function pilotState(config: LocalRuntime): Promise<string> {
  return await psql(
    config.dbUrl,
    `begin read only;
    with pilot as (
      select id from public.app_cases
      where case_reference=${quote(PILOT_CASE_REFERENCE)}
    )
    select jsonb_build_object(
      'case',coalesce((select row_to_json(value) from (
        select item.id,item.case_reference,
          (select lifecycle_state from public.app_case_lifecycle_events event
           where event.case_id=item.id
           order by event.event_at desc,event.id desc limit 1) lifecycle_state
        from public.app_cases item join pilot on pilot.id=item.id
      ) value),'null'::json),
      'rounds',(select count(*) from public.app_evidence_review_rounds value
                join pilot on pilot.id=value.case_id),
      'handoffs',(select count(*) from public.app_evidence_review_correction_handoffs value
                  join pilot on pilot.id=value.case_id),
      'uploads',(select count(*) from public.app_customer_correction_replacement_uploads value
                 join pilot on pilot.id=value.case_id),
      'submissions',(select count(*) from public.app_evidence_review_customer_submissions value
                     join pilot on pilot.id=value.case_id)
    )::text;
    rollback;`,
  );
}

function syntheticPdf(lines: readonly string[]): Uint8Array {
  const hex = (value: string) =>
    Array.from(new TextEncoder().encode(value))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  const stream = [
    "BT",
    "/F1 12 Tf",
    ...lines.flatMap((line, index) => [
      `1 0 0 1 72 ${720 - index * 20} Tm`,
      `<${hex(line)}> Tj`,
    ]),
    "ET",
  ].join("\n");
  return new TextEncoder().encode([
    "%PDF-1.4",
    "1 0 obj",
    "<< /Type /Catalog /Pages 2 0 R >>",
    "endobj",
    "2 0 obj",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "endobj",
    "3 0 obj",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "endobj",
    "4 0 obj",
    `<< /Length ${stream.length} >>`,
    "stream",
    stream,
    "endstream",
    "endobj",
    "5 0 obj",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "endobj",
    "%%EOF",
  ].join("\n"));
}

async function writePrivate(path: string, value: string | Uint8Array) {
  await Deno.writeFile(
    path,
    typeof value === "string" ? new TextEncoder().encode(value) : value,
    { create: true, mode: 0o600 },
  );
  await Deno.chmod(path, 0o600);
}

async function post(
  config: LocalRuntime,
  endpoint: string,
  token: string,
  idempotencyKey: string,
  body: Json,
): Promise<{ status: number; body: Json }> {
  const response = await fetch(
    `${config.apiUrl}/functions/v1/${endpoint}`,
    {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    },
  );
  const parsed = await response.json().catch(() => null);
  assert(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    `endpoint_non_json:${endpoint}`,
  );
  return { status: response.status, body: parsed as Json };
}

async function removeMailpitMessages(config: LocalRuntime, email: string) {
  const response = await fetch(`${config.mailpitUrl}/api/v1/messages`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return;
  const body = await response.json().catch(() => null) as {
    messages?: Array<{ ID?: string; To?: Array<{ Address?: string }> }>;
  } | null;
  for (const message of body?.messages ?? []) {
    if (
      message.ID &&
      message.To?.some((recipient) =>
        recipient.Address?.toLowerCase() === email.toLowerCase()
      )
    ) {
      await fetch(`${config.mailpitUrl}/api/v1/messages/${message.ID}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(10_000),
      }).catch(() => undefined);
    }
  }
}

async function fixtureResidue(config: LocalRuntime, state: FixtureState) {
  const ids = [
    state.authUserId,
    state.intakeId,
  ].filter(UUID_PATTERN.test.bind(UUID_PATTERN));
  const values = ids.map(quote).join(",");
  const result = await psql(
    config.dbUrl,
    `begin read only;
    select concat_ws('|',
      (select count(*) from public.app_signup_intakes
       where id=any(array[${values}]::uuid[])),
      (select count(*) from public.app_signup_signing_presentation_receipts
       where intake_id=any(array[${values}]::uuid[])),
      (select count(*) from public.app_signup_signing_presentation_acceptances
       where intake_id=any(array[${values}]::uuid[])),
      (select count(*) from public.app_signup_signing_challenges
       where intake_id=any(array[${values}]::uuid[]))
    );
    rollback;`,
  );
  const counts = result.split("|").map(Number);
  assert(
    counts.length === 4 && counts.every(Number.isFinite),
    "residue_query_invalid",
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function cleanupState(
  config: LocalRuntime,
  service: SupabaseClient,
  state: FixtureState,
) {
  const intakeRows = await psql(
    config.dbUrl,
    `begin read only;
    select distinct provenance.intake_id::text
    from public.app_signup_authenticated_intake_provenance provenance
    where provenance.auth_user_id=${quote(state.authUserId)}
    union select ${quote(state.intakeId)};
    rollback;`,
  );
  const intakeIds = intakeRows.split(/\r?\n/).filter(
    UUID_PATTERN.test.bind(UUID_PATTERN),
  );
  if (intakeIds.length > 0) {
    const locators = await psql(
      config.dbUrl,
      `begin read only;
      select storage_bucket || E'\t' || storage_path
      from public.app_signup_intake_files
      where intake_id=any(array[${intakeIds.map(quote).join(",")}]::uuid[])
        and storage_bucket is not null and storage_path is not null;
      rollback;`,
    );
    for (const locator of locators.split(/\r?\n/).filter(Boolean)) {
      const [bucket, path] = locator.split("\t");
      if (bucket && path) await service.storage.from(bucket).remove([path]);
    }
  }
  const fixtureIds = new Set([
    state.authUserId,
    ...intakeIds,
  ].filter(UUID_PATTERN.test.bind(UUID_PATTERN)));
  const values = [...fixtureIds].map((id) => `(${quote(id)}::uuid)`).join(",");
  await psql(
    config.dbUrl,
    `begin;
    set local session_replication_role=replica;
    create temp table sl01cf_fixture_ids(id uuid primary key) on commit drop;
    insert into sl01cf_fixture_ids values ${values} on conflict do nothing;
    do $cleanup$
    declare item record; expression text; pass integer;
    begin
      for pass in 1..8 loop
        for item in
          select namespace.nspname schema_name,relation.relname table_name,
            string_agg(format('%I',attribute.attname),',') filter (
              where attribute.atttypid='uuid'::regtype
            ) uuid_columns
          from pg_class relation
          join pg_namespace namespace on namespace.oid=relation.relnamespace
          join pg_attribute attribute on attribute.attrelid=relation.oid
            and attribute.attnum>0 and not attribute.attisdropped
          where namespace.nspname='public' and relation.relkind in ('r','p')
          group by namespace.nspname,relation.relname
          having bool_or(attribute.attname='id'
                         and attribute.atttypid='uuid'::regtype)
             and bool_or(attribute.atttypid='uuid'::regtype)
        loop
          select string_agg(
            format('%I in (select id from sl01cf_fixture_ids)',column_name),
            ' or '
          ) into expression
          from unnest(string_to_array(item.uuid_columns,',')) column_name;
          execute format(
            'insert into sl01cf_fixture_ids select id from %I.%I where %s on conflict do nothing',
            item.schema_name,item.table_name,expression
          );
        end loop;
      end loop;
      for item in
        select namespace.nspname schema_name,relation.relname table_name,
          string_agg(
            format('%I in (select id from sl01cf_fixture_ids)',attribute.attname),
            ' or '
          ) filter (where attribute.atttypid='uuid'::regtype) expression
        from pg_class relation
        join pg_namespace namespace on namespace.oid=relation.relnamespace
        join pg_attribute attribute on attribute.attrelid=relation.oid
          and attribute.attnum>0 and not attribute.attisdropped
        where namespace.nspname='public' and relation.relkind in ('r','p')
        group by namespace.nspname,relation.relname
        having bool_or(attribute.atttypid='uuid'::regtype)
      loop
        execute format(
          'delete from %I.%I where %s',
          item.schema_name,item.table_name,item.expression
        );
      end loop;
    end $cleanup$;
    delete from public.app_intake_audit_events
      where request_id like ${quote(`${state.prefix}%`)}
         or actor_ref like ${quote(`%${state.fixtureId}%`)};
    delete from public.app_audit_events
      where request_id like ${quote(`${state.prefix}%`)}
         or actor_ref like ${quote(`%${state.fixtureId}%`)};
    delete from public.app_idempotency_keys
      where key like ${quote(`${state.prefix}%`)}
         or scope like ${quote(`%${state.fixtureId}%`)};
    commit;`,
  );
  await service.auth.admin.deleteUser(state.authUserId).catch(() => null);
  await removeMailpitMessages(config, state.email);
}

async function setup() {
  const config = await runtime();
  const existing = await psql(
    config.dbUrl,
    `begin read only;
    select count(*)::text
    from public.app_tenant_configuration_component_revisions
    where approved_by_actor_ref like 'sl01cf:%';
    rollback;`,
  );
  assert(existing === "0", "existing_sl01cf_fixture_requires_cleanup");
  const fixtureId = `sl01cf-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const directory = fixtureDirectory(fixtureId);
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  await Deno.chmod(directory, 0o700);
  const tenantReference = await tenantId(config);
  const graph = await buildLocalSigningConfigurationGraph(tenantReference);
  const state: FixtureState = {
    fixtureId,
    prefix: fixtureId,
    tenantId: tenantReference,
    authUserId: "",
    email: `${fixtureId}@example.invalid`,
    password: `LocalOnly!${crypto.randomUUID()}Aa1`,
    intakeId: "",
    managementCapability: "",
    intakeExpiresAt: "",
    expectedBundle: graph.legal.content.bundleRevision,
    pilotBefore: await pilotState(config),
    createdAt: new Date().toISOString(),
  };
  const statePath = `${directory}/state.json`;
  await writePrivate(statePath, JSON.stringify(state, null, 2));
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  try {
    const created = await service.auth.admin.createUser({
      email: state.email,
      password: state.password,
      email_confirm: true,
      user_metadata: {
        fixture_id: fixtureId,
        fixture_status: "SYNTHETIC_LOCAL_ONLY",
      },
    });
    assert(
      !created.error && created.data.user?.id,
      "fixture_auth_create_failed",
    );
    state.authUserId = created.data.user.id;
    await writePrivate(statePath, JSON.stringify(state, null, 2));
    const browserClient = createClient(config.apiUrl, config.anonKey, {
      auth: { persistSession: false },
    });
    const signed = await browserClient.auth.signInWithPassword({
      email: state.email,
      password: state.password,
    });
    assert(
      !signed.error && signed.data.session?.access_token,
      "fixture_auth_signin_failed",
    );
    const intake = await post(
      config,
      "api-app-signup-intake-start",
      signed.data.session.access_token,
      `${fixtureId}-intake-start`,
      { account_type: "particulier", email: state.email },
    );
    state.intakeId = String(intake.body.intake_reference ?? "");
    state.managementCapability = String(
      intake.body.management_capability ?? "",
    );
    state.intakeExpiresAt = String(intake.body.intake_expires_at ?? "");
    if (
      intake.status !== 200 || intake.body.ok !== true ||
      !UUID_PATTERN.test(state.intakeId) || !state.managementCapability ||
      !Number.isFinite(Date.parse(state.intakeExpiresAt))
    ) {
      throw new FixtureError(
        `fixture_intake_start_failed:${intake.status}:` +
          `${String(intake.body.code ?? "response_contract_invalid")}`,
      );
    }
    await writePrivate(statePath, JSON.stringify(state, null, 2));
    const presentation = await post(
      config,
      "api-app-signup-signing-presentation",
      signed.data.session.access_token,
      `${fixtureId}-presentation-sanity`,
      {
        intake_reference: state.intakeId,
        management_capability: state.managementCapability,
      },
    );
    assert(
      presentation.status === 201 && presentation.body.ok === true &&
        Array.isArray(presentation.body.legal_documents) &&
        presentation.body.legal_documents.length === 4,
      "fixture_presentation_sanity_failed",
    );
    const responseDocuments = presentation.body
      .legal_documents as ReceiptBoundLegalDocumentInput[];
    assert(
      (await Promise.all(
        responseDocuments.map(async (document) =>
          Boolean(document.canonical_content) &&
          await signingSha256Hex(document.canonical_content) ===
            document.content_sha256
        ),
      )).every(Boolean),
      "fixture_legal_document_content_hash_failed",
    );
    const browserDocuments = createReceiptBoundLegalDocuments(
      String(presentation.body.receipt_reference ?? ""),
      responseDocuments,
    );
    assert(
      browserDocuments?.length === 4 &&
        browserDocuments.every(legalDocumentIsSigningReady),
      "fixture_browser_legal_document_contract_failed",
    );
    const challenge = await post(
      config,
      "api-app-signup-signing-challenge",
      signed.data.session.access_token,
      `${fixtureId}-challenge-sanity`,
      {
        intake_reference: state.intakeId,
        management_capability: state.managementCapability,
        presentation_receipt_reference: presentation.body.receipt_reference,
        presentation_receipt_sha256: presentation.body.receipt_sha256,
        legal_actions: {
          privacy_notice_read: true,
          service_terms_accepted: true,
          fee_terms_accepted: true,
          mandate_signed: true,
        },
      },
    );
    assert(
      challenge.status === 201 && challenge.body.ok === true &&
        UUID_PATTERN.test(String(challenge.body.challenge_reference ?? "")),
      "fixture_challenge_sanity_failed",
    );
    await writePrivate(
      `${directory}/browser-login.txt`,
      [
        "LOCAL DISPOSABLE SL01-CF LOGIN",
        `Email: ${state.email}`,
        `Password: ${state.password}`,
        "Do not paste these credentials into chat or commit them.",
      ].join("\n") + "\n",
    );
    await writePrivate(
      `${directory}/browser-session.js`,
      `sessionStorage.setItem("enval.signup.intake.v1", ${
        JSON.stringify(JSON.stringify({
          intakeReference: state.intakeId,
          managementCapability: state.managementCapability,
          accountType: "particulier",
          email: state.email,
          expiresAt: state.intakeExpiresAt,
        }))
      }); window.location.assign("/aanmelden");\n`,
    );
    await writePrivate(
      `${directory}/sl01cf-energy.pdf`,
      syntheticPdf([
        "TEST SYNTHETIC ENERGY DOCUMENT - NOT REAL",
        "Leverancier: SL01-C Synthetic Energy Provider",
        "Contracthouder Synthetic Test Customer",
        "Leveradres: Bewijsstraat 12",
        "Postcode: 1234 AB Proefstad",
        "Elektriciteit: 871685900012345678",
      ]),
    );
    await writePrivate(
      `${directory}/sl01cf-installation.pdf`,
      syntheticPdf([
        "TEST SYNTHETIC INSTALLATION DOCUMENT - NOT REAL",
        "Installateur: SL01-C Synthetic Installer",
        "Klant: SL01-C Test Customer",
        "Factuuradres: Bewijsstraat 12",
        "Postcode: 1234 AB Proefstad",
        "Merk: SL01-C Test Charger",
        "Model: Synthetic One",
        "MID: 123456789",
        "Serienummer: SL01CF-SYNTHETIC-2026",
      ]),
    );
    console.log("SL01C_BROWSER_FIXTURE_SETUP=PASS");
    console.log("LEGAL_DOCUMENT_DELIVERY=PASS");
    console.log("LEGAL_DOCUMENT_CONTENT_HASH=PASS");
    console.log(`FIXTURE_ID=${fixtureId}`);
    console.log(
      `FIXTURE_TENANT=SL01-C Test Operator / local / ${tenantReference}`,
    );
    console.log(`FIXTURE_INTAKE_REFERENCE=${state.intakeId}`);
    console.log(
      "BROWSER_START_URL=http://127.0.0.1:5175/inloggen",
    );
    console.log(
      `BROWSER_LOGIN_METHOD=existing local password form; credentials file ${directory}/browser-login.txt`,
    );
    console.log(
      `BROWSER_SESSION_BOOTSTRAP_FILE=${directory}/browser-session.js`,
    );
    console.log(`SYNTHETIC_ENERGY_PDF=${directory}/sl01cf-energy.pdf`);
    console.log(
      `SYNTHETIC_INSTALLATION_PDF=${directory}/sl01cf-installation.pdf`,
    );
    console.log(`EXPECTED_LEGAL_BUNDLE_LABEL=${state.expectedBundle}`);
    console.log("MAILPIT_REQUIRED=YES");
    console.log("REAL_PILOT_UNCHANGED=YES");
  } catch (error) {
    if (state.authUserId) {
      await cleanupState(config, service, state).catch(() => undefined);
    }
    await Deno.remove(directory, { recursive: true }).catch(() => undefined);
    throw error;
  }
}

async function cleanup(fixtureId: string) {
  const directory = fixtureDirectory(fixtureId);
  const state = JSON.parse(
    await Deno.readTextFile(`${directory}/state.json`),
  ) as FixtureState;
  assert(state.fixtureId === fixtureId, "fixture_state_scope_mismatch");
  const config = await runtime();
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  await cleanupState(config, service, state);
  const residue = await fixtureResidue(config, state);
  const pilotAfter = await pilotState(config);
  const pilotUnchanged = state.pilotBefore === pilotAfter;
  if (residue === 0 && pilotUnchanged) {
    await Deno.remove(directory, { recursive: true });
  }
  console.log(
    `SL01C_BROWSER_FIXTURE_CLEANUP=${
      residue === 0 && pilotUnchanged ? "PASS" : "FAIL"
    }`,
  );
  console.log(`SYNTHETIC_ROWS_REMAIN=${residue === 0 ? "NO" : "YES"}`);
  console.log(`REAL_PILOT_UNCHANGED=${pilotUnchanged ? "YES" : "NO"}`);
  if (residue !== 0 || !pilotUnchanged) Deno.exitCode = 1;
}

const [operation, fixtureId, ...extra] = Deno.args;
try {
  assert(extra.length === 0, "unexpected_arguments");
  if (operation === "setup" && fixtureId === undefined) await setup();
  else if (operation === "cleanup" && fixtureId) await cleanup(fixtureId);
  else throw new FixtureError("usage: setup | cleanup <fixture-id>");
} catch (error) {
  console.error(`SL01C_BROWSER_FIXTURE=FAIL:${safeDiagnostic(error)}`);
  Deno.exitCode = 1;
}
