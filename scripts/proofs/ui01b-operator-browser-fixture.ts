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
type DedicatedAdminState = {
  fixtureId: string;
  prefix: string;
  authUserId: string;
  workforceIdentityId: string;
  createdAt: string;
  updatedAt: string;
};

const ROOT = new URL("../../", import.meta.url);
const ROOT_PATH = decodeURIComponent(ROOT.pathname);
const FIXTURE_ROOT = "/private/tmp/enval-ui01b-bf01";
export const DEDICATED_ADMIN_FIXTURE_ID = "ui01b-beheer-admin-v1";
export const DEDICATED_ADMIN_EMAIL = "beheer.admin@enval.test";
export const DEDICATED_ADMIN_PASSWORD = "Enval-Local-Admin-2026!";
export const DEDICATED_ADMIN_API_URL = "http://127.0.0.1:54321";
const DEDICATED_ADMIN_DIRECTORY =
  `${FIXTURE_ROOT}/${DEDICATED_ADMIN_FIXTURE_ID}`;
const DEDICATED_ADMIN_LOGIN_PATH =
  `${DEDICATED_ADMIN_DIRECTORY}/workforce-login.txt`;
const DEDICATED_ADMIN_STATE_PATH = `${DEDICATED_ADMIN_DIRECTORY}/state.json`;
const REQUIRED_ADMIN_CAPABILITIES = Object.freeze([
  "compliance.delivery_year.view",
  "evidence.review.view",
]);
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
    .replaceAll(DEDICATED_ADMIN_EMAIL, "[dedicated-admin-address]")
    .replaceAll(DEDICATED_ADMIN_PASSWORD, "[dedicated-admin-password]")
    .replaceAll(/\s+/g, " ")
    .slice(0, 400);
}

export function validateDedicatedAdminTarget(
  apiUrl: string,
  rawProbe: string,
): Readonly<{
  origin: string;
  marker: "ENVAL_LOCAL_API_HEALTH_OK";
  status: 200;
}> {
  assert(apiUrl === DEDICATED_ADMIN_API_URL, "dedicated_admin_target_rejected");
  let probe: Json;
  try {
    probe = JSON.parse(rawProbe) as Json;
  } catch {
    throw new FixtureError("dedicated_admin_health_proof_invalid");
  }
  assert(
    probe.probe === "api-health" &&
      probe.origin === DEDICATED_ADMIN_API_URL &&
      probe.status === 200 &&
      probe.marker === "ENVAL_LOCAL_API_HEALTH_OK",
    "dedicated_admin_health_proof_invalid",
  );
  return Object.freeze({
    origin: DEDICATED_ADMIN_API_URL,
    marker: "ENVAL_LOCAL_API_HEALTH_OK",
    status: 200,
  });
}

function assertDedicatedAdminDatabaseTarget(raw: string) {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    throw new FixtureError("dedicated_admin_database_target_rejected");
  }
  assert(
    ["postgres:", "postgresql:"].includes(target.protocol) &&
      target.hostname === "127.0.0.1" && target.port === "54322" &&
      target.pathname === "/postgres" && !target.search && !target.hash,
    "dedicated_admin_database_target_rejected",
  );
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

async function proveDedicatedAdminWriteTarget(
  config: LocalRuntime,
): Promise<
  Readonly<{
    origin: string;
    marker: "ENVAL_LOCAL_API_HEALTH_OK";
    status: 200;
  }>
> {
  assertDedicatedAdminDatabaseTarget(config.dbUrl);
  const result = await command("node", [
    "scripts/tools/enval-supabase-target.mjs",
    "--target",
    "TENANT_ENVAL",
    "--probe",
    "api-health",
  ]);
  assert(result.code === 0, "dedicated_admin_health_probe_failed");
  return validateDedicatedAdminTarget(config.apiUrl, result.stdout);
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

async function activeWorkforceAdminContext(
  config: LocalRuntime,
): Promise<Readonly<{ authUserId: string; actorRef: string }>> {
  const value = await psql(
    config.dbUrl,
    `begin read only;
    select concat_ws('|',identity.auth_user_id::text,identity.workforce_ref)
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
  const [authUserId, actorRef, ...extra] = value.split("|");
  assert(
    UUID_PATTERN.test(authUserId) && actorRef && extra.length === 0,
    "active_workforce_admin_unavailable",
  );
  return Object.freeze({ authUserId, actorRef });
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
  beforeWrite?: () => Promise<unknown>,
) {
  if (UUID_PATTERN.test(state.workforceIdentityId)) {
    await beforeWrite?.();
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
      await beforeWrite?.();
      await service.auth.admin.deleteUser(userId).catch(() => null);
    }
  }
}

type DedicatedAdminSnapshot = Readonly<{
  identityCount: number;
  identityId: string;
  state: string;
  seniority: string;
  complianceGrantCount: number;
  evidenceGrantCount: number;
  tenantScopeCount: number;
}>;

async function dedicatedAdminSnapshot(
  config: LocalRuntime,
  authUserId: string,
): Promise<DedicatedAdminSnapshot> {
  const value = await psql(
    config.dbUrl,
    `begin read only;
    with target as (
      select id from public.app_workforce_identities
      where auth_user_id=${quote(authUserId)}
    )
    select concat_ws('|',
      (select count(*) from target),
      coalesce((select id::text from target limit 1),''),
      coalesce((select state_event.state
        from public.app_workforce_identity_states state_event
        join target on target.id=state_event.workforce_identity_id
        where state_event.effective_at <= clock_timestamp()
        order by state_event.effective_at desc,state_event.recorded_at desc
        limit 1),''),
      coalesce((select seniority_event.seniority
        from public.app_workforce_seniority_assignments seniority_event
        join target on target.id=seniority_event.workforce_identity_id
        where seniority_event.effective_at <= clock_timestamp()
        order by seniority_event.effective_at desc,seniority_event.recorded_at desc
        limit 1),''),
      (select count(*) from public.app_workforce_capability_assignments item
        join target on target.id=item.workforce_identity_id
        where item.capability_code='compliance.delivery_year.view'
          and item.event_type='granted'
          and item.supersedes_assignment_event_id is null
          and item.effective_at <= clock_timestamp()
          and (item.valid_until is null or clock_timestamp() < item.valid_until)
          and not exists (
            select 1 from public.app_workforce_capability_assignments revoked
            where revoked.assignment_id=item.assignment_id
              and revoked.event_type='revoked'
              and revoked.effective_at <= clock_timestamp()
          )),
      (select count(*) from public.app_workforce_capability_assignments item
        join target on target.id=item.workforce_identity_id
        where item.capability_code='evidence.review.view'
          and item.event_type='granted'
          and item.supersedes_assignment_event_id is null
          and item.effective_at <= clock_timestamp()
          and (item.valid_until is null or clock_timestamp() < item.valid_until)
          and not exists (
            select 1 from public.app_workforce_capability_assignments revoked
            where revoked.assignment_id=item.assignment_id
              and revoked.event_type='revoked'
              and revoked.effective_at <= clock_timestamp()
          )),
      (select count(*) from public.app_workforce_tenant_scope_assignments item
        join target on target.id=item.workforce_identity_id
        where item.capability_code='compliance.delivery_year.view'
          and item.tenant_scope_ref='CURRENT_TENANT_DATA_PLANE'
          and item.event_type='granted'
          and item.supersedes_scope_event_id is null
          and item.effective_at <= clock_timestamp()
          and (item.valid_until is null or clock_timestamp() < item.valid_until)
          and not exists (
            select 1 from public.app_workforce_tenant_scope_assignments revoked
            where revoked.scope_assignment_id=item.scope_assignment_id
              and revoked.event_type='revoked'
              and revoked.effective_at <= clock_timestamp()
          ))
    );
    rollback;`,
  );
  const [
    identityCount,
    identityId,
    state,
    seniority,
    complianceGrantCount,
    evidenceGrantCount,
    tenantScopeCount,
    ...extra
  ] = value.split("|");
  const snapshot = {
    identityCount: Number(identityCount),
    identityId,
    state,
    seniority,
    complianceGrantCount: Number(complianceGrantCount),
    evidenceGrantCount: Number(evidenceGrantCount),
    tenantScopeCount: Number(tenantScopeCount),
  };
  assert(
    extra.length === 0 &&
      [
        snapshot.identityCount,
        snapshot.complianceGrantCount,
        snapshot.evidenceGrantCount,
        snapshot.tenantScopeCount,
      ]
        .every(Number.isSafeInteger),
    "dedicated_admin_snapshot_invalid",
  );
  return Object.freeze(snapshot);
}

async function findDedicatedAdminUsers(service: SupabaseClient) {
  const matches = [];
  for (let page = 1; page <= 100; page += 1) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 100 });
    assert(!listed.error, "dedicated_admin_auth_list_failed");
    const users = listed.data.users ?? [];
    matches.push(
      ...users.filter((user) =>
        user.email?.toLowerCase() === DEDICATED_ADMIN_EMAIL
      ),
    );
    if (users.length < 100) break;
    assert(page < 100, "dedicated_admin_auth_list_unbounded");
  }
  assert(matches.length <= 1, "dedicated_admin_auth_duplicate_detected");
  return matches;
}

function assertDedicatedAdminOwnership(user: {
  user_metadata?: Record<string, unknown>;
}) {
  assert(
    user.user_metadata?.fixture_id === DEDICATED_ADMIN_FIXTURE_ID &&
      user.user_metadata?.fixture_kind === "workforce-admin" &&
      user.user_metadata?.fixture_status === "SYNTHETIC_LOCAL_ONLY",
    "dedicated_admin_email_owned_by_non_fixture_user",
  );
}

async function ensureDedicatedAdminAuth(
  config: LocalRuntime,
  service: SupabaseClient,
): Promise<Readonly<{ userId: string; action: "created" | "restored" }>> {
  const matches = await findDedicatedAdminUsers(service);
  const attributes = {
    email: DEDICATED_ADMIN_EMAIL,
    password: DEDICATED_ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      fixture_id: DEDICATED_ADMIN_FIXTURE_ID,
      fixture_kind: "workforce-admin",
      fixture_status: "SYNTHETIC_LOCAL_ONLY",
    },
  };
  if (matches.length === 0) {
    await proveDedicatedAdminWriteTarget(config);
    const created = await service.auth.admin.createUser(attributes);
    assert(
      !created.error && created.data.user?.id,
      "dedicated_admin_auth_create_failed",
    );
    return Object.freeze({ userId: created.data.user.id, action: "created" });
  }
  const existing = matches[0];
  assertDedicatedAdminOwnership(existing);
  await proveDedicatedAdminWriteTarget(config);
  const updated = await service.auth.admin.updateUserById(
    existing.id,
    attributes,
  );
  assert(
    !updated.error && updated.data.user?.id === existing.id,
    "dedicated_admin_auth_restore_failed",
  );
  return Object.freeze({ userId: existing.id, action: "restored" });
}

async function manageDedicatedAdminWorkforce(
  config: LocalRuntime,
  action: "create" | "activate" | "change_seniority",
  authUserId: string,
  workforceIdentityId: string,
) {
  const manager = await activeWorkforceAdminContext(config);
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const requestId = `${DEDICATED_ADMIN_FIXTURE_ID}-${action}-${nonce}`;
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  await proveDedicatedAdminWriteTarget(config);
  const result = await psql(
    config.dbUrl,
    `select public.app_workforce_member_manage_v1(
      ${quote(manager.authUserId)},
      ${quote(requestId)},
      ${quote(`${requestId}-key`)},
      ${quote("b".repeat(64))},
      ${quote(expiresAt)},
      ${quote(action)},
      ${action === "create" ? quote(authUserId) : "null::uuid"},
      ${action === "create" ? "null::uuid" : quote(workforceIdentityId)},
      ${
      action === "create" || action === "change_seniority"
        ? "'admin'"
        : "null::text"
    },
      clock_timestamp(),
      ${quote(`decision:${DEDICATED_ADMIN_FIXTURE_ID}`)},
      null
    )->>'ok';`,
  );
  assert(result === "true", `dedicated_admin_workforce_${action}_failed`);
}

async function reconcileDedicatedAdminCapabilities(
  config: LocalRuntime,
  workforceIdentityId: string,
) {
  const manager = await activeWorkforceAdminContext(config);
  const requestId = `${DEDICATED_ADMIN_FIXTURE_ID}-reconcile-${
    crypto.randomUUID().replaceAll("-", "")
  }`;
  await proveDedicatedAdminWriteTarget(config);
  await psql(
    config.dbUrl,
    `select public.app_workforce_reconcile_capabilities_v1(
      ${quote(workforceIdentityId)},
      clock_timestamp(),
      ${quote(manager.actorRef)},
      ${quote(`decision:${DEDICATED_ADMIN_FIXTURE_ID}`)},
      ${quote(requestId)}
    );`,
  );
}

async function ensureDedicatedAdminWorkforce(
  config: LocalRuntime,
  authUserId: string,
): Promise<DedicatedAdminSnapshot> {
  let snapshot = await dedicatedAdminSnapshot(config, authUserId);
  assert(snapshot.identityCount <= 1, "dedicated_admin_workforce_duplicate");
  if (snapshot.identityCount === 0) {
    await manageDedicatedAdminWorkforce(config, "create", authUserId, "");
    snapshot = await dedicatedAdminSnapshot(config, authUserId);
  }
  assert(
    snapshot.identityCount === 1 && UUID_PATTERN.test(snapshot.identityId),
    "dedicated_admin_workforce_identity_missing",
  );
  if (snapshot.state !== "active") {
    await manageDedicatedAdminWorkforce(
      config,
      "activate",
      authUserId,
      snapshot.identityId,
    );
    snapshot = await dedicatedAdminSnapshot(config, authUserId);
  }
  if (snapshot.seniority !== "admin") {
    await manageDedicatedAdminWorkforce(
      config,
      "change_seniority",
      authUserId,
      snapshot.identityId,
    );
    snapshot = await dedicatedAdminSnapshot(config, authUserId);
  }
  if (
    snapshot.complianceGrantCount !== 1 ||
    snapshot.evidenceGrantCount !== 1 ||
    snapshot.tenantScopeCount !== 1
  ) {
    await reconcileDedicatedAdminCapabilities(config, snapshot.identityId);
    snapshot = await dedicatedAdminSnapshot(config, authUserId);
  }
  assert(
    snapshot.identityCount === 1 && snapshot.state === "active" &&
      snapshot.seniority === "admin" &&
      snapshot.complianceGrantCount === 1 &&
      snapshot.evidenceGrantCount === 1 && snapshot.tenantScopeCount === 1,
    "dedicated_admin_workforce_authority_invalid",
  );
  return snapshot;
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

function dedicatedAdminFixtureState(
  state: DedicatedAdminState,
): FixtureState {
  return {
    fixtureId: state.fixtureId,
    prefix: state.prefix,
    authOnlyUserId: "",
    authOnlyEmail: "",
    authOnlyPassword: "",
    workforceUserId: state.authUserId,
    workforceEmail: DEDICATED_ADMIN_EMAIL,
    workforcePassword: "",
    workforceIdentityId: state.workforceIdentityId,
    pilotBefore: "",
    createdAt: state.createdAt,
    cleanedAt: null,
  };
}

async function readDedicatedAdminState(): Promise<DedicatedAdminState | null> {
  try {
    const state = JSON.parse(
      await Deno.readTextFile(DEDICATED_ADMIN_STATE_PATH),
    ) as DedicatedAdminState;
    assert(
      state.fixtureId === DEDICATED_ADMIN_FIXTURE_ID &&
        state.prefix === DEDICATED_ADMIN_FIXTURE_ID &&
        UUID_PATTERN.test(state.authUserId) &&
        UUID_PATTERN.test(state.workforceIdentityId),
      "dedicated_admin_state_invalid",
    );
    return state;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

async function setupDedicatedAdmin() {
  const config = await runtime();
  const targetProof = await proveDedicatedAdminWriteTarget(config);
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  await proveDedicatedAdminWriteTarget(config);
  await Deno.mkdir(DEDICATED_ADMIN_DIRECTORY, {
    recursive: true,
    mode: 0o700,
  });
  await Deno.chmod(DEDICATED_ADMIN_DIRECTORY, 0o700);

  const auth = await ensureDedicatedAdminAuth(config, service);
  const users = await findDedicatedAdminUsers(service);
  assert(
    users.length === 1 && users[0].id === auth.userId,
    "dedicated_admin_auth_count_invalid",
  );
  assertDedicatedAdminOwnership(users[0]);
  assert(
    Boolean(users[0].email_confirmed_at ?? users[0].confirmed_at),
    "dedicated_admin_email_unconfirmed",
  );

  const workforce = await ensureDedicatedAdminWorkforce(config, auth.userId);
  const previousState = await readDedicatedAdminState();
  if (previousState) {
    assert(
      previousState.authUserId === auth.userId &&
        previousState.workforceIdentityId === workforce.identityId,
      "dedicated_admin_identity_changed",
    );
  }
  const now = new Date().toISOString();
  const state: DedicatedAdminState = {
    fixtureId: DEDICATED_ADMIN_FIXTURE_ID,
    prefix: DEDICATED_ADMIN_FIXTURE_ID,
    authUserId: auth.userId,
    workforceIdentityId: workforce.identityId,
    createdAt: previousState?.createdAt ?? now,
    updatedAt: now,
  };
  await proveDedicatedAdminWriteTarget(config);
  await writePrivate(
    DEDICATED_ADMIN_STATE_PATH,
    JSON.stringify(state, null, 2),
  );
  await proveDedicatedAdminWriteTarget(config);
  await writePrivate(
    DEDICATED_ADMIN_LOGIN_PATH,
    [
      "LOCAL UI-01B DEDICATED BEHEER LOGIN",
      `Email: ${DEDICATED_ADMIN_EMAIL}`,
      `Password: ${DEDICATED_ADMIN_PASSWORD}`,
      "Local Supabase only. Do not commit or reuse outside this fixture.",
    ].join("\n") + "\n",
  );

  const token = await accessToken(
    config,
    DEDICATED_ADMIN_EMAIL,
    DEDICATED_ADMIN_PASSWORD,
  );
  const context = await operatorContext(config, token);
  const effectiveCapabilities =
    Array.isArray(context.body.effective_capabilities)
      ? context.body.effective_capabilities.filter((value): value is string =>
        typeof value === "string"
      )
      : [];
  assert(
    context.status === 200 && context.body.authorized === true &&
      context.body.active === true &&
      REQUIRED_ADMIN_CAPABILITIES.every((capability) =>
        effectiveCapabilities.includes(capability)
      ) && context.body.code !== "workforce_identity_missing",
    "dedicated_admin_operator_context_invalid",
  );

  console.log("UI01B_DEDICATED_ADMIN_SETUP=PASS");
  console.log(
    `TARGET_PROOF=${targetProof.origin}|${targetProof.marker}|HTTP_${targetProof.status}`,
  );
  console.log(`FIXTURE_ID=${DEDICATED_ADMIN_FIXTURE_ID}`);
  console.log(`AUTH_ACTION=${auth.action}`);
  console.log(`AUTH_USER_ID=${auth.userId}`);
  console.log("AUTH_USER_COUNT=1");
  console.log("EMAIL_CONFIRMED=YES");
  console.log(`WORKFORCE_IDENTITY_ID=${workforce.identityId}`);
  console.log("WORKFORCE_ACTIVE=YES");
  console.log("WORKFORCE_SENIORITY=admin");
  console.log(`CAPABILITIES=${REQUIRED_ADMIN_CAPABILITIES.join(",")}`);
  console.log("PASSWORD_LOGIN=PASS");
  console.log("OPERATOR_CONTEXT=200:authorized");
  console.log(`LOGIN_FILE=${DEDICATED_ADMIN_LOGIN_PATH}`);
  console.log("LOGIN_URL=http://127.0.0.1:5175/inloggen?returnTo=%2Fbeheer");
}

async function cleanupDedicatedAdmin() {
  const config = await runtime();
  const targetProof = await proveDedicatedAdminWriteTarget(config);
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const users = await findDedicatedAdminUsers(service);
  if (users.length === 1) assertDedicatedAdminOwnership(users[0]);
  const stored = await readDedicatedAdminState();
  const authUserId = users[0]?.id ?? stored?.authUserId ?? "";
  if (users[0] && stored) {
    assert(
      users[0].id === stored.authUserId,
      "dedicated_admin_state_scope_mismatch",
    );
  }
  let workforceIdentityId = stored?.workforceIdentityId ?? "";
  if (UUID_PATTERN.test(authUserId)) {
    const snapshot = await dedicatedAdminSnapshot(config, authUserId);
    assert(snapshot.identityCount <= 1, "dedicated_admin_workforce_duplicate");
    if (snapshot.identityCount === 1) {
      if (workforceIdentityId) {
        assert(
          workforceIdentityId === snapshot.identityId,
          "dedicated_admin_state_scope_mismatch",
        );
      }
      workforceIdentityId = snapshot.identityId;
    }
  }
  const state: DedicatedAdminState = {
    fixtureId: DEDICATED_ADMIN_FIXTURE_ID,
    prefix: DEDICATED_ADMIN_FIXTURE_ID,
    authUserId,
    workforceIdentityId,
    createdAt: stored?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const fixtureState = dedicatedAdminFixtureState(state);
  const pilotBefore = await pilotState(config);
  await cleanupState(
    config,
    service,
    fixtureState,
    () => proveDedicatedAdminWriteTarget(config),
  );
  const residue = await fixtureResidue(config, fixtureState);
  const pilotUnchanged = pilotBefore === await pilotState(config);
  if (residue === 0 && pilotUnchanged) {
    try {
      await proveDedicatedAdminWriteTarget(config);
      await Deno.remove(DEDICATED_ADMIN_DIRECTORY, { recursive: true });
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
  }
  console.log(
    `UI01B_DEDICATED_ADMIN_CLEANUP=${
      residue === 0 && pilotUnchanged ? "PASS" : "FAIL"
    }`,
  );
  console.log(
    `TARGET_PROOF=${targetProof.origin}|${targetProof.marker}|HTTP_${targetProof.status}`,
  );
  console.log(`FIXTURE_ID=${DEDICATED_ADMIN_FIXTURE_ID}`);
  console.log(`DEDICATED_FIXTURE_ROWS_REMAIN=${residue === 0 ? "NO" : "YES"}`);
  console.log(`REAL_PILOT_UNCHANGED=${pilotUnchanged ? "YES" : "NO"}`);
  if (residue !== 0 || !pilotUnchanged) Deno.exitCode = 1;
}

if (import.meta.main) {
  assert(
    Deno.env.get("ENVAL_ALLOW_LOCAL_UI01B_FIXTURE_WRITES") === "YES",
    "local_fixture_writes_not_enabled",
  );

  const [operation, fixtureId, ...extra] = Deno.args;
  try {
    assert(extra.length === 0, "unexpected_arguments");
    if (operation === "setup" && fixtureId === undefined) await setup();
    else if (operation === "cleanup" && fixtureId) await cleanup(fixtureId);
    else if (operation === "admin-setup" && fixtureId === undefined) {
      await setupDedicatedAdmin();
    } else if (operation === "admin-cleanup" && fixtureId === undefined) {
      await cleanupDedicatedAdmin();
    } else {
      throw new FixtureError(
        "usage: setup | cleanup <fixture-id> | admin-setup | admin-cleanup",
      );
    }
  } catch (error) {
    console.error(
      `UI01B_OPERATOR_BROWSER_FIXTURE=FAIL:${safeDiagnostic(error)}`,
    );
    Deno.exitCode = 1;
  }
}
