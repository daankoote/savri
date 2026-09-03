import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Json = Record<string, unknown>;
type LocalRuntime = Readonly<{
  apiUrl: string;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}>;
type FixtureState = {
  fixtureId: string;
  prefix: string;
  authOnlyUserId: string;
  authOnlyEmail: string;
  authOnlyPassword: string;
  workforceUserId: string;
  workforceEmail: string;
  workforcePassword: string;
  workforceIdentityId: string;
  pilotBefore: string;
  createdAt: string;
  cleanedAt: string | null;
};

const ROOT = new URL("../../", import.meta.url);
const ROOT_PATH = decodeURIComponent(ROOT.pathname);
const FIXTURE_ROOT = "/private/tmp/enval-ui01b-bf01";
const PILOT_CASE_REFERENCE = "CASE-7E4CC75CD19F";
const FIXTURE_ID_PATTERN = /^ui01b-bf01-[0-9]{13}-[0-9a-f]{8}$/;
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
    .replaceAll(/[A-Za-z0-9!._-]{20,}@example\.invalid/gi, "[address]")
    .replaceAll(/LocalOnly![A-Za-z0-9-]+Aa1/g, "[password]")
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
  stdin?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = new Deno.Command(name, {
    args,
    cwd: ROOT,
    env: { SUPABASE_TELEMETRY_DISABLED: "1" },
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

async function runtime(): Promise<LocalRuntime> {
  const result = await command("supabase", [
    "--workdir",
    ROOT_PATH,
    "status",
    "-o",
    "env",
  ]);
  assert(result.code === 0, "local_supabase_status_unavailable");
  const values = parseStatusEnvironment(result.stdout);
  const apiUrl = assertLocalUrl(values.get("API_URL") ?? "", "54321");
  const dbUrl = values.get("DB_URL") ?? "";
  assert(
    dbUrl.includes("127.0.0.1:54322/"),
    "non_local_database_rejected",
  );
  const anonKey = values.get("ANON_KEY") ?? "";
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY") ?? "";
  assert(anonKey && serviceRoleKey, "local_runtime_keys_unavailable");
  return { apiUrl, dbUrl, anonKey, serviceRoleKey };
}

async function psql(databaseUrl: string, sql: string): Promise<string> {
  const result = await command(
    "psql",
    [databaseUrl, "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
    sql,
  );
  if (result.code !== 0) {
    throw new FixtureError(`local_sql_failed:${safeDiagnostic(result.stderr)}`);
  }
  return result.stdout;
}

async function writePrivate(path: string, value: string) {
  await Deno.writeFile(path, new TextEncoder().encode(value), {
    create: true,
    mode: 0o600,
  });
  await Deno.chmod(path, 0o600);
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
      'submissions',(select count(*) from public.app_evidence_review_customer_submissions value
                     join pilot on pilot.id=value.case_id)
    )::text;
    rollback;`,
  );
}

async function createAuthUser(
  service: SupabaseClient,
  fixtureId: string,
  kind: "auth-only" | "workforce",
): Promise<Readonly<{ userId: string; email: string; password: string }>> {
  const email = `${fixtureId}-${kind}@example.invalid`;
  const password = `LocalOnly!${crypto.randomUUID()}Aa1`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      fixture_id: fixtureId,
      fixture_kind: kind,
      fixture_status: "SYNTHETIC_LOCAL_ONLY",
    },
  });
  assert(!created.error && created.data.user?.id, `${kind}_auth_create_failed`);
  return Object.freeze({
    userId: created.data.user.id,
    email,
    password,
  });
}

async function accessToken(
  config: LocalRuntime,
  email: string,
  password: string,
): Promise<string> {
  const browserClient = createClient(config.apiUrl, config.anonKey, {
    auth: { persistSession: false },
  });
  const signed = await browserClient.auth.signInWithPassword({
    email,
    password,
  });
  assert(
    !signed.error && signed.data.session?.access_token,
    "fixture_auth_signin_failed",
  );
  return signed.data.session.access_token;
}

async function operatorContext(
  config: LocalRuntime,
  token: string,
): Promise<Readonly<{ status: number; body: Json }>> {
  const response = await fetch(
    `${config.apiUrl}/functions/v1/api-app-operator-context`,
    {
      method: "GET",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        Origin: "http://127.0.0.1:5175",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  return Object.freeze({
    status: response.status,
    body: await response.json().catch(() => ({})) as Json,
  });
}

async function activeWorkforceAdmin(config: LocalRuntime): Promise<string> {
  const value = await psql(
    config.dbUrl,
    `begin read only;
    select identity.auth_user_id::text
    from public.app_workforce_identities identity
    cross join lateral public.app_workforce_authorize_v1(
      identity.auth_user_id,
      'workforce.member.manage',
      null::text,
      null::uuid,
      null::uuid,
      clock_timestamp()
    ) authz
    where authz->>'ok'='true'
    order by identity.created_at,identity.id
    limit 1;
    rollback;`,
  );
  assert(UUID_PATTERN.test(value), "active_workforce_admin_unavailable");
  return value;
}

async function createWorkforce(
  config: LocalRuntime,
  state: FixtureState,
): Promise<string> {
  const adminAuthUserId = await activeWorkforceAdmin(config);
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const result = await psql(
    config.dbUrl,
    `select public.app_workforce_member_manage_v1(
      ${quote(adminAuthUserId)},
      ${quote(`${state.prefix}-member-create`)},
      ${quote(`${state.prefix}-member-key`)},
      ${quote("a".repeat(64))},
      ${quote(expiresAt)},
      'create',
      ${quote(state.workforceUserId)},
      null,
      'reviewer',
      clock_timestamp(),
      ${quote(`decision:${state.prefix}:member`)},
      null
    )->>'ok';`,
  );
  assert(result === "true", "workforce_member_create_failed");
  const identityId = await psql(
    config.dbUrl,
    `begin read only;
    select id::text from public.app_workforce_identities
    where auth_user_id=${quote(state.workforceUserId)};
    rollback;`,
  );
  assert(UUID_PATTERN.test(identityId), "workforce_identity_missing");
  return identityId;
}

async function assertFixtureAuthority(
  config: LocalRuntime,
  state: FixtureState,
): Promise<
  Readonly<{
    authOnlyStatus: number;
    authOnlyCode: string;
    workforceStatus: number;
    workforceCode: string;
  }>
> {
  const authOnlyToken = await accessToken(
    config,
    state.authOnlyEmail,
    state.authOnlyPassword,
  );
  const workforceToken = await accessToken(
    config,
    state.workforceEmail,
    state.workforcePassword,
  );
  const [authOnly, workforce, databaseProof] = await Promise.all([
    operatorContext(config, authOnlyToken),
    operatorContext(config, workforceToken),
    psql(
      config.dbUrl,
      `begin read only;
      select concat_ws('|',
        (select count(*) from public.app_workforce_identities
         where auth_user_id=${quote(state.authOnlyUserId)}),
        (select state_event.state
         from public.app_workforce_identity_states state_event
         where state_event.workforce_identity_id=${
        quote(state.workforceIdentityId)
      }
         order by state_event.effective_at desc,state_event.recorded_at desc limit 1),
        (select count(*) from public.app_workforce_tenant_scope_assignments scope_event
         where scope_event.workforce_identity_id=${
        quote(state.workforceIdentityId)
      }
           and scope_event.capability_code='compliance.delivery_year.view'
           and scope_event.tenant_scope_ref='CURRENT_TENANT_DATA_PLANE'
           and scope_event.event_type='granted'),
        (select count(*) from public.app_workforce_capability_assignments capability
         where capability.workforce_identity_id=${
        quote(state.workforceIdentityId)
      }
           and capability.capability_code='evidence.review.view'
           and capability.event_type='granted'),
        (select count(*) from public.app_workforce_capability_assignments capability
         where capability.workforce_identity_id=${
        quote(state.workforceIdentityId)
      }
           and capability.capability_code='platform_support.request')
      );
      rollback;`,
    ),
  ]);
  assert(
    databaseProof === "0|active|1|1|0",
    "fixture_database_authority_invalid",
  );
  return Object.freeze({
    authOnlyStatus: authOnly.status,
    authOnlyCode: typeof authOnly.body.code === "string"
      ? authOnly.body.code
      : "none",
    workforceStatus: workforce.status,
    workforceCode: typeof workforce.body.code === "string"
      ? workforce.body.code
      : "none",
  });
}

async function fixtureResidue(
  config: LocalRuntime,
  state: FixtureState,
): Promise<number> {
  const authUserIds = [state.authOnlyUserId, state.workforceUserId]
    .filter((value) => UUID_PATTERN.test(value))
    .map(quote);
  const authUserIdsSql = authUserIds.length > 0
    ? authUserIds.join(",")
    : "null::uuid";
  const workforceIdentitySql = UUID_PATTERN.test(state.workforceIdentityId)
    ? quote(state.workforceIdentityId)
    : "null::uuid";
  const result = await psql(
    config.dbUrl,
    `begin read only;
    select concat_ws('|',
      (select count(*) from auth.users
       where id in (${authUserIdsSql})),
      (select count(*) from public.app_workforce_identities
       where id=${workforceIdentitySql}
          or auth_user_id in (${authUserIdsSql})),
      (select count(*) from public.app_workforce_identity_states
       where workforce_identity_id=${workforceIdentitySql}),
      (select count(*) from public.app_workforce_seniority_assignments
       where workforce_identity_id=${workforceIdentitySql}),
      (select count(*) from public.app_workforce_capability_assignments
       where workforce_identity_id=${workforceIdentitySql}),
      (select count(*) from public.app_workforce_scope_assignments
       where workforce_identity_id=${workforceIdentitySql}),
      (select count(*) from public.app_workforce_tenant_scope_assignments
       where workforce_identity_id=${workforceIdentitySql}),
      (select count(*) from public.app_audit_events
       where request_id like ${quote(`${state.prefix}%`)}),
      (select count(*) from public.app_idempotency_keys
       where key like ${quote(`${state.prefix}%`)})
    );
    rollback;`,
  );
  const counts = result.split("|").map(Number);
  assert(
    counts.length === 9 && counts.every(Number.isFinite),
    "residue_query_invalid",
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function cleanupState(
  config: LocalRuntime,
  service: SupabaseClient,
  state: FixtureState,
) {
  if (UUID_PATTERN.test(state.workforceIdentityId)) {
    await psql(
      config.dbUrl,
      `begin;
      set local session_replication_role=replica;
      delete from public.app_workforce_tenant_scope_assignments
       where workforce_identity_id=${quote(state.workforceIdentityId)};
      delete from public.app_workforce_scope_assignments
       where workforce_identity_id=${quote(state.workforceIdentityId)};
      delete from public.app_workforce_capability_assignments
       where workforce_identity_id=${quote(state.workforceIdentityId)};
      delete from public.app_workforce_seniority_assignments
       where workforce_identity_id=${quote(state.workforceIdentityId)};
      delete from public.app_workforce_identity_states
       where workforce_identity_id=${quote(state.workforceIdentityId)};
      delete from public.app_audit_events
       where request_id like ${quote(`${state.prefix}%`)}
          or scope_id=${quote(state.workforceIdentityId)};
      delete from public.app_idempotency_keys
       where key like ${quote(`${state.prefix}%`)};
      delete from public.app_workforce_identities
       where id=${quote(state.workforceIdentityId)};
      commit;`,
    );
  }
  for (const userId of [state.authOnlyUserId, state.workforceUserId]) {
    if (UUID_PATTERN.test(userId)) {
      await service.auth.admin.deleteUser(userId).catch(() => null);
    }
  }
}

async function setup() {
  const config = await runtime();
  const fixtureId = `ui01b-bf01-${Date.now()}-${
    crypto.randomUUID().slice(0, 8)
  }`;
  const directory = fixtureDirectory(fixtureId);
  await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
  await Deno.chmod(directory, 0o700);
  const state: FixtureState = {
    fixtureId,
    prefix: fixtureId,
    authOnlyUserId: "",
    authOnlyEmail: `${fixtureId}-auth-only@example.invalid`,
    authOnlyPassword: "",
    workforceUserId: "",
    workforceEmail: `${fixtureId}-workforce@example.invalid`,
    workforcePassword: "",
    workforceIdentityId: "",
    pilotBefore: await pilotState(config),
    createdAt: new Date().toISOString(),
    cleanedAt: null,
  };
  const statePath = `${directory}/state.json`;
  await writePrivate(statePath, JSON.stringify(state, null, 2));
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  try {
    const authOnly = await createAuthUser(service, fixtureId, "auth-only");
    state.authOnlyUserId = authOnly.userId;
    state.authOnlyEmail = authOnly.email;
    state.authOnlyPassword = authOnly.password;
    await writePrivate(statePath, JSON.stringify(state, null, 2));

    const workforce = await createAuthUser(service, fixtureId, "workforce");
    state.workforceUserId = workforce.userId;
    state.workforceEmail = workforce.email;
    state.workforcePassword = workforce.password;
    await writePrivate(statePath, JSON.stringify(state, null, 2));

    state.workforceIdentityId = await createWorkforce(config, state);
    await writePrivate(statePath, JSON.stringify(state, null, 2));
    const endpointObservation = await assertFixtureAuthority(config, state);
    assert(
      state.pilotBefore === await pilotState(config),
      "real_pilot_changed",
    );

    const authOnlyLoginPath = `${directory}/auth-only-login.txt`;
    const workforceLoginPath = `${directory}/workforce-login.txt`;
    await writePrivate(
      authOnlyLoginPath,
      [
        "LOCAL DISPOSABLE UI-01B AUTH-ONLY LOGIN",
        `Email: ${state.authOnlyEmail}`,
        `Password: ${state.authOnlyPassword}`,
        "Do not paste these credentials into chat or commit them.",
      ].join("\n") + "\n",
    );
    await writePrivate(
      workforceLoginPath,
      [
        "LOCAL DISPOSABLE UI-01B WORKFORCE LOGIN",
        `Email: ${state.workforceEmail}`,
        `Password: ${state.workforcePassword}`,
        "Do not paste these credentials into chat or commit them.",
      ].join("\n") + "\n",
    );

    console.log("UI01B_OPERATOR_BROWSER_FIXTURE_SETUP=PASS");
    console.log(`FIXTURE_ID=${fixtureId}`);
    console.log(`AUTH_ONLY_LOGIN_FILE=${authOnlyLoginPath}`);
    console.log(`WORKFORCE_LOGIN_FILE=${workforceLoginPath}`);
    console.log("OPERATOR_START_URL=http://127.0.0.1:5175/beheer");
    console.log(
      "OPERATOR_DOSSIERS_URL=http://127.0.0.1:5175/beheer/dossiers",
    );
    console.log(
      `CLEANUP_COMMAND=ENVAL_ALLOW_LOCAL_UI01B_FIXTURE_WRITES=YES deno run --allow-all scripts/proofs/ui01b-operator-browser-fixture.ts cleanup ${fixtureId}`,
    );
    console.log("AUTH_ONLY_HAS_WORKFORCE_IDENTITY=NO");
    console.log("WORKFORCE_ACTIVE=YES");
    console.log("WORKFORCE_TENANT_BOUND=YES");
    console.log("WORKFORCE_COMPLIANCE_VIEW=YES");
    console.log("WORKFORCE_EVIDENCE_REVIEW_VIEW=YES");
    console.log("WORKFORCE_PLATFORM_SUPPORT_REQUEST=NO");
    console.log(
      `AUTH_ONLY_OPERATOR_CONTEXT=${endpointObservation.authOnlyStatus}:${endpointObservation.authOnlyCode}`,
    );
    console.log(
      `WORKFORCE_OPERATOR_CONTEXT=${endpointObservation.workforceStatus}:${endpointObservation.workforceCode}`,
    );
  } catch (error) {
    try {
      await cleanupState(config, service, state);
      const residue = await fixtureResidue(config, state);
      const pilotUnchanged = state.pilotBefore === await pilotState(config);
      if (residue === 0 && pilotUnchanged) {
        await Deno.remove(directory, { recursive: true });
      }
    } catch {
      // Preserve scoped private state only when automatic cleanup cannot be proven.
    }
    throw error;
  }
}

async function cleanup(fixtureId: string) {
  const directory = fixtureDirectory(fixtureId);
  const statePath = `${directory}/state.json`;
  const state = JSON.parse(await Deno.readTextFile(statePath)) as FixtureState;
  assert(state.fixtureId === fixtureId, "fixture_state_scope_mismatch");
  const config = await runtime();
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  await cleanupState(config, service, state);
  const residue = await fixtureResidue(config, state);
  const pilotUnchanged = state.pilotBefore === await pilotState(config);
  if (residue === 0 && pilotUnchanged) {
    await Deno.remove(`${directory}/auth-only-login.txt`).catch(() =>
      undefined
    );
    await Deno.remove(`${directory}/workforce-login.txt`).catch(() =>
      undefined
    );
    state.authOnlyPassword = "";
    state.workforcePassword = "";
    state.cleanedAt ??= new Date().toISOString();
    await writePrivate(statePath, JSON.stringify(state, null, 2));
  }
  console.log(
    `UI01B_OPERATOR_BROWSER_FIXTURE_CLEANUP=${
      residue === 0 && pilotUnchanged ? "PASS" : "FAIL"
    }`,
  );
  console.log(`SYNTHETIC_ROWS_REMAIN=${residue === 0 ? "NO" : "YES"}`);
  console.log(`REAL_PILOT_UNCHANGED=${pilotUnchanged ? "YES" : "NO"}`);
  if (residue !== 0 || !pilotUnchanged) Deno.exitCode = 1;
}

assert(
  Deno.env.get("ENVAL_ALLOW_LOCAL_UI01B_FIXTURE_WRITES") === "YES",
  "local_fixture_writes_not_enabled",
);

const [operation, fixtureId, ...extra] = Deno.args;
try {
  assert(extra.length === 0, "unexpected_arguments");
  if (operation === "setup" && fixtureId === undefined) await setup();
  else if (operation === "cleanup" && fixtureId) await cleanup(fixtureId);
  else throw new FixtureError("usage: setup | cleanup <fixture-id>");
} catch (error) {
  console.error(`UI01B_OPERATOR_BROWSER_FIXTURE=FAIL:${safeDiagnostic(error)}`);
  Deno.exitCode = 1;
}
