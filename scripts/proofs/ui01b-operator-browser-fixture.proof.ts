import {
  DEDICATED_ADMIN_API_URL,
  DEDICATED_ADMIN_EMAIL,
  DEDICATED_ADMIN_FIXTURE_ID,
  DEDICATED_ADMIN_PASSWORD,
  validateDedicatedAdminTarget,
} from "./ui01b-operator-browser-fixture.ts";

type Runtime = Readonly<{
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
}>;

const ROOT = new URL("../../", import.meta.url);
const ROOT_PATH = decodeURIComponent(ROOT.pathname);

function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function command(
  name: string,
  args: string[],
  stdin?: string,
  env: Record<string, string> = {},
) {
  const child = new Deno.Command(name, {
    args,
    cwd: ROOT,
    env: { ...env, SUPABASE_TELEMETRY_DISABLED: "1" },
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }
  const result = await child.output();
  return Object.freeze({
    code: result.code,
    stdout: new TextDecoder().decode(result.stdout).trim(),
    stderr: new TextDecoder().decode(result.stderr).trim(),
  });
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

async function runtime(): Promise<Runtime> {
  const status = await command("supabase", [
    "--workdir",
    ROOT_PATH,
    "status",
    "-o",
    "env",
  ]);
  assert(status.code === 0, "local_supabase_status_unavailable");
  const values = parseStatusEnvironment(status.stdout);
  const apiUrl = (values.get("API_URL") ?? "").replace(/\/$/, "");
  const dbUrl = values.get("DB_URL") ?? "";
  const anonKey = values.get("ANON_KEY") ?? "";
  assert(apiUrl === DEDICATED_ADMIN_API_URL, "local_api_target_invalid");
  assert(dbUrl.includes("127.0.0.1:54322/"), "local_db_target_invalid");
  assert(anonKey, "local_anon_key_missing");
  return Object.freeze({ apiUrl, dbUrl, anonKey });
}

async function psql(config: Runtime, sql: string): Promise<string> {
  const result = await command(
    "psql",
    [config.dbUrl, "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
    sql,
  );
  assert(result.code === 0, "local_read_only_sql_failed");
  return result.stdout;
}

async function fixture(operation: "admin-setup" | "admin-cleanup") {
  const result = await command(
    "deno",
    [
      "run",
      "--no-lock",
      "--allow-all",
      "scripts/proofs/ui01b-operator-browser-fixture.ts",
      operation,
    ],
    undefined,
    { ENVAL_ALLOW_LOCAL_UI01B_FIXTURE_WRITES: "YES" },
  );
  if (result.code !== 0) {
    throw new Error(
      `${operation}_failed:${
        result.stderr.replaceAll(/\s+/g, " ").slice(0, 500)
      }`,
    );
  }
  return result.stdout;
}

async function fixtureSnapshot(
  config: Runtime,
): Promise<Record<string, unknown>> {
  const raw = await psql(
    config,
    `begin read only;
    with auth_target as (
      select id,email_confirmed_at,confirmed_at
      from auth.users where lower(email)=${quote(DEDICATED_ADMIN_EMAIL)}
    ), identity_target as (
      select identity.id,identity.auth_user_id
      from public.app_workforce_identities identity
      join auth_target on auth_target.id=identity.auth_user_id
    )
    select jsonb_build_object(
      'auth_count',(select count(*) from auth_target),
      'auth_user_id',(select id::text from auth_target limit 1),
      'email_confirmed',coalesce((select coalesce(email_confirmed_at,confirmed_at) is not null from auth_target limit 1),false),
      'identity_count',(select count(*) from identity_target),
      'identity_id',(select id::text from identity_target limit 1),
      'state',coalesce((select item.state from public.app_workforce_identity_states item join identity_target on identity_target.id=item.workforce_identity_id order by item.effective_at desc,item.recorded_at desc limit 1),''),
      'seniority',coalesce((select item.seniority from public.app_workforce_seniority_assignments item join identity_target on identity_target.id=item.workforce_identity_id order by item.effective_at desc,item.recorded_at desc limit 1),''),
      'state_event_count',(select count(*) from public.app_workforce_identity_states item join identity_target on identity_target.id=item.workforce_identity_id),
      'seniority_event_count',(select count(*) from public.app_workforce_seniority_assignments item join identity_target on identity_target.id=item.workforce_identity_id),
      'capability_event_count',(select count(*) from public.app_workforce_capability_assignments item join identity_target on identity_target.id=item.workforce_identity_id),
      'compliance_effective',(select count(*) from public.app_workforce_capability_assignments item join identity_target on identity_target.id=item.workforce_identity_id where item.capability_code='compliance.delivery_year.view' and item.event_type='granted' and item.supersedes_assignment_event_id is null and not exists (select 1 from public.app_workforce_capability_assignments revoked where revoked.assignment_id=item.assignment_id and revoked.event_type='revoked')),
      'evidence_effective',(select count(*) from public.app_workforce_capability_assignments item join identity_target on identity_target.id=item.workforce_identity_id where item.capability_code='evidence.review.view' and item.event_type='granted' and item.supersedes_assignment_event_id is null and not exists (select 1 from public.app_workforce_capability_assignments revoked where revoked.assignment_id=item.assignment_id and revoked.event_type='revoked')),
      'tenant_scope_effective',(select count(*) from public.app_workforce_tenant_scope_assignments item join identity_target on identity_target.id=item.workforce_identity_id where item.capability_code='compliance.delivery_year.view' and item.tenant_scope_ref='CURRENT_TENANT_DATA_PLANE' and item.event_type='granted' and item.supersedes_scope_event_id is null and not exists (select 1 from public.app_workforce_tenant_scope_assignments revoked where revoked.scope_assignment_id=item.scope_assignment_id and revoked.event_type='revoked'))
    )::text;
    rollback;`,
  );
  return JSON.parse(raw) as Record<string, unknown>;
}

async function protectedFingerprint(config: Runtime): Promise<string> {
  return await psql(
    config,
    `begin read only;
    select jsonb_build_object(
      'auth_users',coalesce((select jsonb_agg(id order by id) from auth.users where lower(coalesce(email,''))<>${
      quote(DEDICATED_ADMIN_EMAIL)
    }),'[]'::jsonb),
      'workforce_identities',coalesce((select jsonb_agg(id order by id) from public.app_workforce_identities where auth_user_id not in (select id from auth.users where lower(email)=${
      quote(DEDICATED_ADMIN_EMAIL)
    })),'[]'::jsonb),
      'identity_states',coalesce((select jsonb_agg(id order by id) from public.app_workforce_identity_states where workforce_identity_id not in (select identity.id from public.app_workforce_identities identity join auth.users auth_user on auth_user.id=identity.auth_user_id where lower(auth_user.email)=${
      quote(DEDICATED_ADMIN_EMAIL)
    })),'[]'::jsonb),
      'seniority_assignments',coalesce((select jsonb_agg(id order by id) from public.app_workforce_seniority_assignments where workforce_identity_id not in (select identity.id from public.app_workforce_identities identity join auth.users auth_user on auth_user.id=identity.auth_user_id where lower(auth_user.email)=${
      quote(DEDICATED_ADMIN_EMAIL)
    })),'[]'::jsonb),
      'capability_assignments',coalesce((select jsonb_agg(id order by id) from public.app_workforce_capability_assignments where workforce_identity_id not in (select identity.id from public.app_workforce_identities identity join auth.users auth_user on auth_user.id=identity.auth_user_id where lower(auth_user.email)=${
      quote(DEDICATED_ADMIN_EMAIL)
    })),'[]'::jsonb),
      'tenant_scope_assignments',coalesce((select jsonb_agg(id order by id) from public.app_workforce_tenant_scope_assignments where workforce_identity_id not in (select identity.id from public.app_workforce_identities identity join auth.users auth_user on auth_user.id=identity.auth_user_id where lower(auth_user.email)=${
      quote(DEDICATED_ADMIN_EMAIL)
    })),'[]'::jsonb),
      'fixture_external_audit',coalesce((select jsonb_agg(id order by id) from public.app_audit_events where request_id not like ${
      quote(`${DEDICATED_ADMIN_FIXTURE_ID}%`)
    }),'[]'::jsonb),
      'fixture_external_idempotency',coalesce((select jsonb_agg(id order by id) from public.app_idempotency_keys where key not like ${
      quote(`${DEDICATED_ADMIN_FIXTURE_ID}%`)
    }),'[]'::jsonb)
    )::text;
    rollback;`,
  );
}

async function login(config: Runtime) {
  const response = await fetch(
    `${config.apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: DEDICATED_ADMIN_EMAIL,
        password: DEDICATED_ADMIN_PASSWORD,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await response.json() as Record<string, unknown>;
  assert(response.status === 200, "password_login_failed");
  assert(typeof body.access_token === "string", "password_token_missing");
  return body.access_token;
}

async function operatorContext(config: Runtime, token: string) {
  const response = await fetch(
    `${config.apiUrl}/functions/v1/api-app-operator-context`,
    {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const body = await response.json() as Record<string, unknown>;
  assert(response.status === 200, "operator_context_not_authorized");
  assert(
    body.code !== "workforce_identity_missing",
    "workforce_identity_missing",
  );
  const capabilities = Array.isArray(body.effective_capabilities)
    ? body.effective_capabilities
    : [];
  assert(
    capabilities.includes("compliance.delivery_year.view") &&
      capabilities.includes("evidence.review.view"),
    "operator_context_capabilities_missing",
  );
  return body;
}

function assertProvisioned(snapshot: Record<string, unknown>) {
  assert(snapshot.auth_count === 1, "auth_user_count_not_one");
  assert(snapshot.email_confirmed === true, "email_not_confirmed");
  assert(snapshot.identity_count === 1, "workforce_identity_count_not_one");
  assert(snapshot.state === "active", "workforce_not_active");
  assert(snapshot.seniority === "admin", "workforce_not_admin");
  assert(snapshot.compliance_effective === 1, "compliance_capability_missing");
  assert(snapshot.evidence_effective === 1, "evidence_capability_missing");
  assert(snapshot.tenant_scope_effective === 1, "tenant_scope_missing");
}

let cleanupRequired = false;
try {
  const validProbe = JSON.stringify({
    probe: "api-health",
    origin: DEDICATED_ADMIN_API_URL,
    status: 200,
    marker: "ENVAL_LOCAL_API_HEALTH_OK",
  });
  let remoteRejected = false;
  try {
    validateDedicatedAdminTarget("https://remote.supabase.co", validProbe);
  } catch {
    remoteRejected = true;
  }
  assert(remoteRejected, "remote_target_not_rejected");
  let markerRejected = false;
  try {
    validateDedicatedAdminTarget(
      DEDICATED_ADMIN_API_URL,
      validProbe.replace("ENVAL_LOCAL_API_HEALTH_OK", "WRONG_MARKER"),
    );
  } catch {
    markerRejected = true;
  }
  assert(markerRejected, "invalid_health_marker_not_rejected");

  const config = await runtime();
  await fixture("admin-cleanup");
  const protectedBefore = await protectedFingerprint(config);
  cleanupRequired = true;

  const firstOutput = await fixture("admin-setup");
  assert(
    firstOutput.includes("AUTH_ACTION=created"),
    "first_execution_did_not_create",
  );
  const first = await fixtureSnapshot(config);
  assertProvisioned(first);
  const token = await login(config);
  const context = await operatorContext(config, token);

  const secondOutput = await fixture("admin-setup");
  assert(
    secondOutput.includes("AUTH_ACTION=restored"),
    "second_execution_did_not_restore",
  );
  const second = await fixtureSnapshot(config);
  assertProvisioned(second);
  for (
    const key of [
      "auth_user_id",
      "identity_id",
      "auth_count",
      "identity_count",
      "state_event_count",
      "seniority_event_count",
      "capability_event_count",
      "compliance_effective",
      "evidence_effective",
      "tenant_scope_effective",
    ]
  ) assert(first[key] === second[key], `idempotency_changed:${key}`);

  await fixture("admin-cleanup");
  cleanupRequired = false;
  const cleaned = await fixtureSnapshot(config);
  assert(cleaned.auth_count === 0, "cleanup_auth_residue");
  assert(cleaned.identity_count === 0, "cleanup_workforce_residue");
  assert(
    protectedBefore === await protectedFingerprint(config),
    "cleanup_changed_non_fixture_state",
  );

  console.log("UI01B_DEDICATED_ADMIN_FIXTURE_PROOF=PASS");
  console.log("REMOTE_TARGET_REJECTED=YES");
  console.log("LOCAL_HEALTH_MARKER_REQUIRED=YES");
  console.log("FIRST_EXECUTION_AUTH_USERS=1");
  console.log("EMAIL_CONFIRMED=YES");
  console.log("WORKFORCE_ACTIVE_ADMIN=YES");
  console.log("REQUIRED_CAPABILITIES_EFFECTIVE=YES");
  console.log("SECOND_EXECUTION_IDEMPOTENT=YES");
  console.log("PASSWORD_LOGIN=PASS");
  console.log(
    `OPERATOR_CONTEXT=${
      context.authorized === true ? "200:authorized" : "FAIL"
    }`,
  );
  console.log("CLEANUP_EXACT_FIXTURE_ONLY=YES");
} finally {
  if (cleanupRequired) await fixture("admin-cleanup");
}
