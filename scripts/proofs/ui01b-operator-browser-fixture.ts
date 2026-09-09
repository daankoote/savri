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
  activationUserId: string;
  activationEmail: string;
  activationPassword: string;
  activationCustomerId: string;
  activationIdentityId: string;
  activationDossierId: string;
  activationCaseId: string;
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
type PortalAuthorityState = {
  fixtureId: string;
  customerAuthUserId: string;
  customerCustomerId: string;
  customerIdentityId: string;
  customerDossierId: string;
  customerCaseId: string;
  customerSecondDossierId: string;
  customerSecondCaseId: string;
  businessAuthUserId: string;
  businessCustomerId: string;
  businessIdentityId: string;
  businessDossierId: string;
  businessCaseId: string;
  reviewerAuthUserId: string;
  reviewerWorkforceIdentityId: string;
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
export const PORTAL_AUTHORITY_FIXTURE_ID = "portal-authority-v1";
export const PORTAL_CUSTOMER_EMAIL = "klant.portal@enval.test";
export const PORTAL_CUSTOMER_PASSWORD = "Enval-Local-Customer-2026!";
export const PORTAL_BUSINESS_EMAIL = "bedrijf.portal@enval.test";
export const PORTAL_BUSINESS_PASSWORD = "Enval-Local-Business-2026!";
export const PORTAL_REVIEWER_EMAIL = "beheer.reviewer@enval.test";
export const PORTAL_REVIEWER_PASSWORD = "Enval-Local-Reviewer-2026!";
const PORTAL_AUTHORITY_DIRECTORY =
  `${FIXTURE_ROOT}/${PORTAL_AUTHORITY_FIXTURE_ID}`;
const PORTAL_AUTHORITY_STATE_PATH = `${PORTAL_AUTHORITY_DIRECTORY}/state.json`;
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
    .replaceAll(PORTAL_CUSTOMER_EMAIL, "[portal-c-address]")
    .replaceAll(PORTAL_CUSTOMER_PASSWORD, "[portal-customer-password]")
    .replaceAll(PORTAL_BUSINESS_EMAIL, "[portal-business-address]")
    .replaceAll(PORTAL_BUSINESS_PASSWORD, "[portal-business-password]")
    .replaceAll(PORTAL_REVIEWER_EMAIL, "[portal-reviewer-address]")
    .replaceAll(PORTAL_REVIEWER_PASSWORD, "[portal-reviewer-password]")
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

async function createActivationCustomerContext(
  config: LocalRuntime,
  state: FixtureState,
) {
  await proveDedicatedAdminWriteTarget(config);
  await psql(
    config.dbUrl,
    `begin;
    insert into public.app_customers (
      id,customer_type,display_name,primary_email_normalized,status
    ) values (
      ${quote(state.activationCustomerId)},'particulier',
      'Local activation fixture',${quote(state.activationEmail)},'active'
    );
    insert into public.app_customer_identities (
      id,customer_id,auth_user_id,email_normalized,email_verified_at,
      identity_provider,status
    ) values (
      ${quote(state.activationIdentityId)},${quote(state.activationCustomerId)},
      null,${quote(state.activationEmail)},clock_timestamp(),'supabase','active'
    );
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values (
      ${quote(state.activationDossierId)},${quote(state.activationCustomerId)},
      'LOCAL-ACTIVATION','particulier','submitted',clock_timestamp()
    );
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      ${quote(state.activationCaseId)},${quote(state.activationCustomerId)},
      ${quote(`CASE-${state.activationDossierId}`)},clock_timestamp(),'system',
      ${quote(`fixture:${state.fixtureId}`)},'app_customer_dossier',
      ${quote(state.activationDossierId)},
      ${quote(`${state.fixtureId}-activation`)}
    );
    commit;`,
  );
}

async function cleanupActivationCustomerContext(
  config: LocalRuntime,
  state: FixtureState,
) {
  if (
    ![
      state.activationCustomerId,
      state.activationIdentityId,
      state.activationDossierId,
      state.activationCaseId,
    ].every((value) => UUID_PATTERN.test(value))
  ) return;
  await proveDedicatedAdminWriteTarget(config);
  await psql(
    config.dbUrl,
    `begin;
    set local session_replication_role=replica;
    delete from public.app_audit_events
     where actor_ref=${quote(`supabase_auth_user:${state.activationUserId}`)};
    delete from public.app_idempotency_keys
     where scope=${
      quote(`api-app-auth-bootstrap:v4:auth_user:${state.activationUserId}`)
    };
    delete from public.app_customer_access_grants
     where customer_id=${quote(state.activationCustomerId)};
    delete from public.app_cases
     where id=${quote(state.activationCaseId)};
    delete from public.app_customer_dossiers
     where id=${quote(state.activationDossierId)};
    delete from public.app_customer_identities
     where id=${quote(state.activationIdentityId)};
    delete from public.app_customers
     where id=${quote(state.activationCustomerId)};
    commit;`,
  );
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
  search = "",
): Promise<Readonly<{ status: number; body: Json }>> {
  const response = await fetch(
    `${config.apiUrl}/functions/v1/api-app-operator-context${search}`,
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
  const authUserIds = [
    state.authOnlyUserId,
    state.activationUserId,
    state.workforceUserId,
  ]
    .filter((value) => UUID_PATTERN.test(value))
    .map(quote);
  const authUserIdsSql = authUserIds.length > 0
    ? authUserIds.join(",")
    : "null::uuid";
  const workforceIdentitySql = UUID_PATTERN.test(state.workforceIdentityId)
    ? quote(state.workforceIdentityId)
    : "null::uuid";
  const activationCustomerSql = UUID_PATTERN.test(state.activationCustomerId)
    ? quote(state.activationCustomerId)
    : "null::uuid";
  const activationIdentitySql = UUID_PATTERN.test(state.activationIdentityId)
    ? quote(state.activationIdentityId)
    : "null::uuid";
  const activationDossierSql = UUID_PATTERN.test(state.activationDossierId)
    ? quote(state.activationDossierId)
    : "null::uuid";
  const activationCaseSql = UUID_PATTERN.test(state.activationCaseId)
    ? quote(state.activationCaseId)
    : "null::uuid";
  const result = await psql(
    config.dbUrl,
    `begin read only;
    select concat_ws('|',
      (select count(*) from auth.users
       where id in (${authUserIdsSql})
          or lower(email)=${quote(state.activationEmail)}),
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
       where key like ${quote(`${state.prefix}%`)}),
      (select count(*) from public.app_customer_access_grants
       where customer_id=${activationCustomerSql}),
      (select count(*) from public.app_cases
       where id=${activationCaseSql}),
      (select count(*) from public.app_customer_dossiers
       where id=${activationDossierSql}),
      (select count(*) from public.app_customer_identities
       where id=${activationIdentitySql}),
      (select count(*) from public.app_customers
       where id=${activationCustomerSql}),
      (select count(*) from public.app_audit_events
       where actor_ref=${
      quote(`supabase_auth_user:${state.activationUserId}`)
    }),
      (select count(*) from public.app_idempotency_keys
       where scope=${
      quote(`api-app-auth-bootstrap:v4:auth_user:${state.activationUserId}`)
    })
    );
    rollback;`,
  );
  const counts = result.split("|").map(Number);
  assert(
    counts.length === 16 && counts.every(Number.isFinite),
    "residue_query_invalid",
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

async function cleanupState(
  config: LocalRuntime,
  service: SupabaseClient,
  state: FixtureState,
  beforeWrite?: () => Promise<unknown>,
  strictAuthDelete = false,
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
  for (
    const userId of [
      state.authOnlyUserId,
      state.activationUserId,
      state.workforceUserId,
    ]
  ) {
    if (UUID_PATTERN.test(userId)) {
      await beforeWrite?.();
      const deleted = await service.auth.admin.deleteUser(userId);
      if (strictAuthDelete && deleted.error) {
        const remaining = await service.auth.admin.getUserById(userId);
        assert(
          Boolean(remaining.error) || !remaining.data.user,
          "fixture_auth_cleanup_failed",
        );
      }
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
    activationUserId: "",
    activationEmail: `${fixtureId}-activation@example.invalid`,
    activationPassword: `LocalOnly!${crypto.randomUUID()}Aa1`,
    activationCustomerId: crypto.randomUUID(),
    activationIdentityId: crypto.randomUUID(),
    activationDossierId: crypto.randomUUID(),
    activationCaseId: crypto.randomUUID(),
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
    assert(
      (await findPortalAuthUsers(service, state.activationEmail)).length === 0,
      "activation_fixture_auth_already_exists",
    );
    await createActivationCustomerContext(config, state);
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
    const activationLoginPath = `${directory}/activation-login.txt`;
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
      activationLoginPath,
      [
        "LOCAL DISPOSABLE UI-01B ACTIVATION LOGIN",
        `Email: ${state.activationEmail}`,
        `Password: ${state.activationPassword}`,
        "Browser activation creates this Auth-only user for the current run.",
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
    console.log(`ACTIVATION_LOGIN_FILE=${activationLoginPath}`);
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
      await cleanupActivationCustomerContext(config, state);
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
  const activationUsers = await findPortalAuthUsers(
    service,
    state.activationEmail,
  );
  assert(
    activationUsers.length <= 1 &&
      (activationUsers.length === 0 ||
        Date.parse(activationUsers[0].created_at) >=
          Date.parse(state.createdAt)),
    "activation_fixture_auth_ownership_invalid",
  );
  state.activationUserId = activationUsers[0]?.id ?? "";
  await writePrivate(statePath, JSON.stringify(state, null, 2));
  await cleanupActivationCustomerContext(config, state);
  await cleanupState(config, service, state, undefined, true);
  const residue = await fixtureResidue(config, state);
  const pilotUnchanged = state.pilotBefore === await pilotState(config);
  if (residue === 0 && pilotUnchanged) {
    await Deno.remove(`${directory}/auth-only-login.txt`).catch(() =>
      undefined
    );
    await Deno.remove(`${directory}/activation-login.txt`).catch(() =>
      undefined
    );
    await Deno.remove(`${directory}/workforce-login.txt`).catch(() =>
      undefined
    );
    state.authOnlyPassword = "";
    state.activationPassword = "";
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
    activationUserId: "",
    activationEmail: "",
    activationPassword: "",
    activationCustomerId: "",
    activationIdentityId: "",
    activationDossierId: "",
    activationCaseId: "",
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

async function findPortalAuthUsers(
  service: SupabaseClient,
  email: string,
) {
  const matches = [];
  for (let page = 1; page <= 100; page += 1) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 100 });
    assert(!listed.error, "portal_fixture_auth_list_failed");
    const users = listed.data.users ?? [];
    matches.push(
      ...users.filter((user) => user.email?.toLowerCase() === email),
    );
    if (users.length < 100) break;
    assert(page < 100, "portal_fixture_auth_list_unbounded");
  }
  assert(matches.length <= 1, "portal_fixture_auth_duplicate_detected");
  return matches;
}

function assertPortalAuthOwnership(
  user: { user_metadata?: Record<string, unknown> },
  kind: "customer" | "business" | "reviewer",
) {
  assert(
    user.user_metadata?.fixture_id === PORTAL_AUTHORITY_FIXTURE_ID &&
      user.user_metadata?.fixture_kind === kind &&
      user.user_metadata?.fixture_status === "SYNTHETIC_LOCAL_ONLY",
    "portal_fixture_email_owned_by_non_fixture_user",
  );
}

async function createPortalAuthUser(
  config: LocalRuntime,
  service: SupabaseClient,
  email: string,
  password: string,
  kind: "customer" | "business" | "reviewer",
): Promise<string> {
  const matches = await findPortalAuthUsers(service, email);
  assert(
    matches.length === 0,
    "portal_fixture_state_missing_for_existing_user",
  );
  await proveDedicatedAdminWriteTarget(config);
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      fixture_id: PORTAL_AUTHORITY_FIXTURE_ID,
      fixture_kind: kind,
      fixture_status: "SYNTHETIC_LOCAL_ONLY",
    },
  });
  assert(
    !created.error && created.data.user?.id,
    `portal_${kind}_auth_create_failed`,
  );
  return created.data.user.id;
}

async function createPortalCustomerContext(
  config: LocalRuntime,
  input: Readonly<{
    authUserId: string;
    email: string;
    accountType: "particulier" | "zakelijk";
    label: "customer" | "business";
    customerId: string;
    identityId: string;
    dossierId: string;
    caseId: string;
  }>,
) {
  const requestId = `${PORTAL_AUTHORITY_FIXTURE_ID}-${input.label}`;
  await proveDedicatedAdminWriteTarget(config);
  await psql(
    config.dbUrl,
    `begin;
    insert into public.app_customers (
      id,customer_type,display_name,primary_email_normalized,status
    ) values (
      ${quote(input.customerId)},${quote(input.accountType)},
      ${quote(`Local ${input.label} fixture`)},${quote(input.email)},'active'
    );
    insert into public.app_customer_identities (
      id,customer_id,auth_user_id,email_normalized,email_verified_at,
      identity_provider,status
    ) values (
      ${quote(input.identityId)},${quote(input.customerId)},${
      quote(input.authUserId)
    },
      ${quote(input.email)},clock_timestamp(),'supabase','active'
    );
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values (
      ${quote(input.dossierId)},${quote(input.customerId)},
      ${quote(`LOCAL-${input.label.toUpperCase()}`)},
      ${quote(input.accountType)},'submitted',clock_timestamp()
    );
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      ${quote(input.caseId)},${quote(input.customerId)},${
      quote(`CASE-${input.dossierId}`)
    },
      clock_timestamp(),'system',
      ${quote(`fixture:${PORTAL_AUTHORITY_FIXTURE_ID}`)},
      'app_customer_dossier',${quote(input.dossierId)},${quote(requestId)}
    );
    insert into public.app_customer_access_grants (
      auth_user_id,customer_id,granted_case_id,access_basis,source_class,
      source_ref,request_id
    ) values (
      ${quote(input.authUserId)},${quote(input.customerId)},null,
      'bound_customer_identity','app_customer_identity',
      ${quote(input.identityId)},${quote(requestId)}
    );
    commit;`,
  );
}

async function createAdditionalPortalCase(
  config: LocalRuntime,
  input: Readonly<{
    accountType: "particulier" | "zakelijk";
    caseId: string;
    customerId: string;
    dossierId: string;
    label: string;
  }>,
) {
  await proveDedicatedAdminWriteTarget(config);
  await psql(
    config.dbUrl,
    `begin;
    insert into public.app_customer_dossiers (
      id,customer_id,dossier_number,account_type,status,submitted_at
    ) values (
      ${quote(input.dossierId)},${quote(input.customerId)},
      ${quote(`LOCAL-${input.label.toUpperCase()}`)},
      ${quote(input.accountType)},'submitted',clock_timestamp()
    );
    insert into public.app_cases (
      id,customer_id,case_reference,created_at,created_by_actor_type,
      created_by_actor_ref,source_class,source_ref,request_id
    ) values (
      ${quote(input.caseId)},${quote(input.customerId)},
      ${quote(`CASE-${input.dossierId}`)},clock_timestamp(),'system',
      ${quote(`fixture:${PORTAL_AUTHORITY_FIXTURE_ID}`)},
      'app_customer_dossier',${quote(input.dossierId)},
      ${quote(`${PORTAL_AUTHORITY_FIXTURE_ID}-${input.label}`)}
    );
    commit;`,
  );
}

async function customerBootstrap(config: LocalRuntime, token: string) {
  const response = await fetch(
    `${config.apiUrl}/functions/v1/api-app-auth-bootstrap`,
    {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
        Origin: "http://127.0.0.1:5175",
      },
      body: "{}",
      signal: AbortSignal.timeout(10_000),
    },
  );
  return Object.freeze({
    status: response.status,
    body: await response.json().catch(() => ({})) as Json,
  });
}

async function dashboardRead(
  config: LocalRuntime,
  token: string,
  dossierId: string,
) {
  const response = await fetch(
    `${config.apiUrl}/functions/v1/api-app-dashboard-get`,
    {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:5175",
      },
      body: JSON.stringify({ dossier_id: dossierId }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  return response.status;
}

async function readPortalAuthorityState(): Promise<
  PortalAuthorityState | null
> {
  try {
    const state = JSON.parse(
      await Deno.readTextFile(PORTAL_AUTHORITY_STATE_PATH),
    ) as PortalAuthorityState;
    assert(
      state.fixtureId === PORTAL_AUTHORITY_FIXTURE_ID &&
        [
          state.customerAuthUserId,
          state.customerCustomerId,
          state.customerIdentityId,
          state.customerDossierId,
          state.customerCaseId,
          state.customerSecondDossierId,
          state.customerSecondCaseId,
          state.businessAuthUserId,
          state.businessCustomerId,
          state.businessIdentityId,
          state.businessDossierId,
          state.businessCaseId,
          state.reviewerAuthUserId,
          state.reviewerWorkforceIdentityId,
        ].every((value) => value === "" || UUID_PATTERN.test(value)),
      "portal_fixture_state_invalid",
    );
    return state;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return null;
    throw error;
  }
}

function portalStateComplete(state: PortalAuthorityState): boolean {
  return [
    state.customerAuthUserId,
    state.customerCustomerId,
    state.customerIdentityId,
    state.customerDossierId,
    state.customerCaseId,
    state.customerSecondDossierId,
    state.customerSecondCaseId,
    state.businessAuthUserId,
    state.businessCustomerId,
    state.businessIdentityId,
    state.businessDossierId,
    state.businessCaseId,
    state.reviewerAuthUserId,
    state.reviewerWorkforceIdentityId,
  ].every((value) => UUID_PATTERN.test(value));
}

async function persistPortalAuthorityState(state: PortalAuthorityState) {
  state.updatedAt = new Date().toISOString();
  await writePrivate(
    PORTAL_AUTHORITY_STATE_PATH,
    JSON.stringify(state, null, 2),
  );
}

function reviewerFixtureState(state: PortalAuthorityState): FixtureState {
  return {
    fixtureId: PORTAL_AUTHORITY_FIXTURE_ID,
    prefix: PORTAL_AUTHORITY_FIXTURE_ID,
    authOnlyUserId: "",
    authOnlyEmail: "",
    authOnlyPassword: "",
    activationUserId: "",
    activationEmail: "",
    activationPassword: "",
    activationCustomerId: "",
    activationIdentityId: "",
    activationDossierId: "",
    activationCaseId: "",
    workforceUserId: state.reviewerAuthUserId,
    workforceEmail: PORTAL_REVIEWER_EMAIL,
    workforcePassword: PORTAL_REVIEWER_PASSWORD,
    workforceIdentityId: state.reviewerWorkforceIdentityId,
    pilotBefore: "",
    createdAt: state.createdAt,
    cleanedAt: null,
  };
}

async function assertPortalAuthorityMatrix(
  config: LocalRuntime,
  service: SupabaseClient,
  state: PortalAuthorityState,
) {
  const adminState = await readDedicatedAdminState();
  assert(adminState, "dedicated_admin_fixture_required");
  const customerToken = await accessToken(
    config,
    PORTAL_CUSTOMER_EMAIL,
    PORTAL_CUSTOMER_PASSWORD,
  );
  const businessToken = await accessToken(
    config,
    PORTAL_BUSINESS_EMAIL,
    PORTAL_BUSINESS_PASSWORD,
  );
  const reviewerToken = await accessToken(
    config,
    PORTAL_REVIEWER_EMAIL,
    PORTAL_REVIEWER_PASSWORD,
  );
  const adminToken = await accessToken(
    config,
    DEDICATED_ADMIN_EMAIL,
    DEDICATED_ADMIN_PASSWORD,
  );
  const [
    customerPortal,
    businessPortal,
    reviewerPortal,
    adminPortal,
    customerOperator,
    businessOperator,
    reviewerOperator,
    adminOperator,
    customerCrossRead,
    businessCrossRead,
    reviewerCrossTenant,
    reviewerCapabilityInjection,
  ] = await Promise.all([
    customerBootstrap(config, customerToken),
    customerBootstrap(config, businessToken),
    customerBootstrap(config, reviewerToken),
    customerBootstrap(config, adminToken),
    operatorContext(config, customerToken),
    operatorContext(config, businessToken),
    operatorContext(config, reviewerToken),
    operatorContext(config, adminToken),
    dashboardRead(config, customerToken, state.businessDossierId),
    dashboardRead(config, businessToken, state.customerDossierId),
    operatorContext(config, reviewerToken, "?tenant_id=other"),
    operatorContext(
      config,
      reviewerToken,
      "?capability=workforce.policy.manage",
    ),
  ]);
  assert(
    customerPortal.status === 200 &&
      JSON.stringify(customerPortal.body.portal_contexts) ===
        JSON.stringify(["customer"]) &&
      Array.isArray(customerPortal.body.dossiers) &&
      customerPortal.body.dossiers.length === 2 &&
      customerPortal.body.dossiers.every((dossier) =>
        typeof dossier === "object" && dossier !== null &&
        (dossier as Json).portal_context === "customer"
      ),
    "portal_customer_positive_failed",
  );
  assert(
    businessPortal.status === 200 &&
      JSON.stringify(businessPortal.body.portal_contexts) ===
        JSON.stringify(["business"]),
    "portal_business_positive_failed",
  );
  assert(
    reviewerPortal.status === 403 &&
      reviewerPortal.body.code === "portal_context_not_authorized" &&
      adminPortal.status === 403 &&
      adminPortal.body.code === "portal_context_not_authorized",
    "portal_workforce_customer_denial_failed",
  );
  const reviewerCapabilities = Array.isArray(
      reviewerOperator.body.effective_capabilities,
    )
    ? reviewerOperator.body.effective_capabilities.filter(
      (value): value is string => typeof value === "string",
    )
    : [];
  assert(
    customerOperator.status === 403 && businessOperator.status === 403 &&
      reviewerOperator.status === 200 &&
      reviewerOperator.body.authorized === true &&
      REQUIRED_ADMIN_CAPABILITIES.every((capability) =>
        reviewerCapabilities.includes(capability)
      ) &&
      !reviewerCapabilities.includes("workforce.member.manage") &&
      !reviewerCapabilities.includes("workforce.policy.manage") &&
      adminOperator.status === 200 && adminOperator.body.authorized === true,
    "portal_operator_matrix_failed",
  );
  assert(
    reviewerCrossTenant.status === 400 &&
      reviewerCapabilityInjection.status === 400,
    "portal_operator_scope_injection_allowed",
  );
  assert(
    customerCrossRead === 404 && businessCrossRead === 404,
    "portal_cross_customer_read_allowed",
  );
  const directClient = createClient(config.apiUrl, config.anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${customerToken}` } },
  });
  const [directGrantRead, directOrganizationRead, directCaseRoleRead] =
    await Promise.all([
      directClient.from("app_customer_access_grants").select("customer_id"),
      directClient.from("app_party_organization_versions").select("party_id"),
      directClient.from("app_case_party_roles").select("case_id"),
    ]);
  assert(
    [directGrantRead, directOrganizationRead, directCaseRoleRead].every(
      (result) => Boolean(result.error) || result.data?.length === 0,
    ),
    "portal_authenticated_direct_table_read_allowed",
  );
  await proveDedicatedAdminWriteTarget(config);
  const databaseMatrix = await psql(
    config.dbUrl,
    `begin read only;
    select concat_ws('|',
      (select count(*) from public.app_customer_access_grants
       where auth_user_id=${quote(state.customerAuthUserId)}
         and customer_id=${quote(state.customerCustomerId)}),
      (select count(*) from public.app_customer_access_grants
       where auth_user_id=${quote(state.customerAuthUserId)}
         and customer_id=${quote(state.businessCustomerId)}),
      (select count(*) from public.app_customer_access_grants
       where auth_user_id=${quote(state.businessAuthUserId)}
         and customer_id=${quote(state.businessCustomerId)}),
      (select count(*) from public.app_workforce_identities
       where auth_user_id in (
         ${quote(state.customerAuthUserId)},
         ${quote(state.businessAuthUserId)}
       )),
      (select count(*) from public.app_customer_access_grants
       where auth_user_id in (
         ${quote(state.reviewerAuthUserId)},
         ${quote(adminState.authUserId)}
       ))
    );
    rollback;`,
  );
  assert(databaseMatrix === "1|0|1|0|0", "portal_database_matrix_invalid");
  const directDatabasePrivileges = await psql(
    config.dbUrl,
    `begin read only;
    select concat_ws('|',
      has_table_privilege('authenticated','public.app_customer_access_grants','select'),
      has_table_privilege('authenticated','public.app_party_organization_versions','select'),
      has_table_privilege('authenticated','public.app_case_party_roles','select'),
      has_function_privilege(
        'authenticated',
        'public.app_bootstrap_customer_auth_v7(uuid,text,text,text,text,text,text,text,text,text)',
        'execute'
      )
    );
    rollback;`,
  );
  assert(
    directDatabasePrivileges === "f|f|f|f",
    "portal_authenticated_direct_database_privilege_allowed",
  );
}

async function setupPortalAuthority() {
  const config = await runtime();
  await proveDedicatedAdminWriteTarget(config);
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  const existing = await readPortalAuthorityState();
  let state: PortalAuthorityState;
  if (existing) {
    assert(
      portalStateComplete(existing),
      "portal_fixture_partial_state_requires_cleanup",
    );
    for (
      const [email, kind, userId] of [
        [PORTAL_CUSTOMER_EMAIL, "customer", existing.customerAuthUserId],
        [PORTAL_BUSINESS_EMAIL, "business", existing.businessAuthUserId],
        [PORTAL_REVIEWER_EMAIL, "reviewer", existing.reviewerAuthUserId],
      ] as const
    ) {
      const users = await findPortalAuthUsers(service, email);
      assert(
        users.length === 1 && users[0].id === userId,
        "portal_fixture_auth_changed",
      );
      assertPortalAuthOwnership(users[0], kind);
    }
    state = { ...existing, updatedAt: new Date().toISOString() };
  } else {
    await Deno.mkdir(PORTAL_AUTHORITY_DIRECTORY, {
      recursive: true,
      mode: 0o700,
    });
    await Deno.chmod(PORTAL_AUTHORITY_DIRECTORY, 0o700);
    const now = new Date().toISOString();
    state = {
      fixtureId: PORTAL_AUTHORITY_FIXTURE_ID,
      customerAuthUserId: "",
      customerCustomerId: "",
      customerIdentityId: "",
      customerDossierId: "",
      customerCaseId: "",
      customerSecondDossierId: "",
      customerSecondCaseId: "",
      businessAuthUserId: "",
      businessCustomerId: "",
      businessIdentityId: "",
      businessDossierId: "",
      businessCaseId: "",
      reviewerAuthUserId: "",
      reviewerWorkforceIdentityId: "",
      createdAt: now,
      updatedAt: now,
    };
    await persistPortalAuthorityState(state);
    state.customerAuthUserId = await createPortalAuthUser(
      config,
      service,
      PORTAL_CUSTOMER_EMAIL,
      PORTAL_CUSTOMER_PASSWORD,
      "customer",
    );
    await persistPortalAuthorityState(state);
    state.businessAuthUserId = await createPortalAuthUser(
      config,
      service,
      PORTAL_BUSINESS_EMAIL,
      PORTAL_BUSINESS_PASSWORD,
      "business",
    );
    await persistPortalAuthorityState(state);
    state.reviewerAuthUserId = await createPortalAuthUser(
      config,
      service,
      PORTAL_REVIEWER_EMAIL,
      PORTAL_REVIEWER_PASSWORD,
      "reviewer",
    );
    await persistPortalAuthorityState(state);
    state.customerCustomerId = crypto.randomUUID();
    state.customerIdentityId = crypto.randomUUID();
    state.customerDossierId = crypto.randomUUID();
    state.customerCaseId = crypto.randomUUID();
    state.customerSecondDossierId = crypto.randomUUID();
    state.customerSecondCaseId = crypto.randomUUID();
    await persistPortalAuthorityState(state);
    await createPortalCustomerContext(config, {
      authUserId: state.customerAuthUserId,
      email: PORTAL_CUSTOMER_EMAIL,
      accountType: "particulier",
      label: "customer",
      customerId: state.customerCustomerId,
      identityId: state.customerIdentityId,
      dossierId: state.customerDossierId,
      caseId: state.customerCaseId,
    });
    await createAdditionalPortalCase(config, {
      accountType: "particulier",
      caseId: state.customerSecondCaseId,
      customerId: state.customerCustomerId,
      dossierId: state.customerSecondDossierId,
      label: "customer-2",
    });
    state.businessCustomerId = crypto.randomUUID();
    state.businessIdentityId = crypto.randomUUID();
    state.businessDossierId = crypto.randomUUID();
    state.businessCaseId = crypto.randomUUID();
    await persistPortalAuthorityState(state);
    await createPortalCustomerContext(config, {
      authUserId: state.businessAuthUserId,
      email: PORTAL_BUSINESS_EMAIL,
      accountType: "zakelijk",
      label: "business",
      customerId: state.businessCustomerId,
      identityId: state.businessIdentityId,
      dossierId: state.businessDossierId,
      caseId: state.businessCaseId,
    });
    state.reviewerWorkforceIdentityId = await createWorkforce(config, {
      fixtureId: PORTAL_AUTHORITY_FIXTURE_ID,
      prefix: PORTAL_AUTHORITY_FIXTURE_ID,
      authOnlyUserId: "",
      authOnlyEmail: "",
      authOnlyPassword: "",
      activationUserId: "",
      activationEmail: "",
      activationPassword: "",
      activationCustomerId: "",
      activationIdentityId: "",
      activationDossierId: "",
      activationCaseId: "",
      workforceUserId: state.reviewerAuthUserId,
      workforceEmail: PORTAL_REVIEWER_EMAIL,
      workforcePassword: PORTAL_REVIEWER_PASSWORD,
      workforceIdentityId: "",
      pilotBefore: "",
      createdAt: new Date().toISOString(),
      cleanedAt: null,
    });
    await persistPortalAuthorityState(state);
  }
  await persistPortalAuthorityState(state);
  for (
    const [name, email, password] of [
      ["customer", PORTAL_CUSTOMER_EMAIL, PORTAL_CUSTOMER_PASSWORD],
      ["business", PORTAL_BUSINESS_EMAIL, PORTAL_BUSINESS_PASSWORD],
      ["reviewer", PORTAL_REVIEWER_EMAIL, PORTAL_REVIEWER_PASSWORD],
    ]
  ) {
    await writePrivate(
      `${PORTAL_AUTHORITY_DIRECTORY}/${name}-login.txt`,
      [
        `LOCAL ENVAL ${name.toUpperCase()} LOGIN`,
        `Email: ${email}`,
        `Password: ${password}`,
        "Local Supabase only. Do not commit or reuse outside this fixture.",
      ].join("\n") + "\n",
    );
  }
  await assertPortalAuthorityMatrix(config, service, state);
  console.log("PORTAL_AUTHORITY_FIXTURE_SETUP=PASS");
  console.log(`FIXTURE_ID=${PORTAL_AUTHORITY_FIXTURE_ID}`);
  console.log(
    `CUSTOMER_LOGIN_FILE=${PORTAL_AUTHORITY_DIRECTORY}/customer-login.txt`,
  );
  console.log(
    `BUSINESS_LOGIN_FILE=${PORTAL_AUTHORITY_DIRECTORY}/business-login.txt`,
  );
  console.log(
    `REVIEWER_LOGIN_FILE=${PORTAL_AUTHORITY_DIRECTORY}/reviewer-login.txt`,
  );
  console.log("CUSTOMER_PORTAL=ALLOW");
  console.log("CUSTOMER_CASE_SWITCH=AVAILABLE");
  console.log("BUSINESS_PORTAL=ALLOW");
  console.log("CUSTOMER_BEHEER=DENY");
  console.log("BUSINESS_BEHEER=DENY");
  console.log("REVIEWER_BEHEER=ALLOW");
  console.log("ADMIN_BEHEER=ALLOW");
  console.log("REVIEWER_ADMIN_CAPABILITIES=DENY");
  console.log("REVIEWER_CUSTOMER_PORTAL=DENY");
  console.log("ADMIN_CUSTOMER_PORTAL=DENY");
  console.log("CROSS_CUSTOMER_READ=DENY");
  console.log("CROSS_TENANT_INPUT=DENY");
  console.log("DIRECT_AUTHENTICATED_DOMAIN_READ=DENY");
  console.log("DIRECT_AUTHENTICATED_DATABASE_PRIVILEGES=DENY");
}

async function cleanupPortalAuthority() {
  const config = await runtime();
  await proveDedicatedAdminWriteTarget(config);
  const service = createClient(config.apiUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });
  let state = await readPortalAuthorityState();
  assert(state, "portal_fixture_state_missing");
  const recoverPortalAuthUserId = async (
    email: string,
    kind: "customer" | "business" | "reviewer",
    recordedId: string,
  ) => {
    const users = await findPortalAuthUsers(service, email);
    if (users.length === 0) return recordedId;
    assertPortalAuthOwnership(users[0], kind);
    assert(
      recordedId === "" || recordedId === users[0].id,
      "portal_fixture_auth_changed",
    );
    return users[0].id;
  };
  state = {
    ...state,
    customerAuthUserId: await recoverPortalAuthUserId(
      PORTAL_CUSTOMER_EMAIL,
      "customer",
      state.customerAuthUserId,
    ),
    businessAuthUserId: await recoverPortalAuthUserId(
      PORTAL_BUSINESS_EMAIL,
      "business",
      state.businessAuthUserId,
    ),
    reviewerAuthUserId: await recoverPortalAuthUserId(
      PORTAL_REVIEWER_EMAIL,
      "reviewer",
      state.reviewerAuthUserId,
    ),
  };
  if (
    UUID_PATTERN.test(state.reviewerAuthUserId) &&
    !UUID_PATTERN.test(state.reviewerWorkforceIdentityId)
  ) {
    const discoveredIdentityId = await psql(
      config.dbUrl,
      `begin read only;
      select coalesce((
        select id::text from public.app_workforce_identities
        where auth_user_id=${quote(state.reviewerAuthUserId)}
        order by created_at,id limit 1
      ),'');
      rollback;`,
    );
    assert(
      discoveredIdentityId === "" || UUID_PATTERN.test(discoveredIdentityId),
      "portal_reviewer_identity_discovery_invalid",
    );
    state = {
      ...state,
      reviewerWorkforceIdentityId: discoveredIdentityId,
    };
  }
  await cleanupState(
    config,
    service,
    reviewerFixtureState(state),
    () => proveDedicatedAdminWriteTarget(config),
    true,
  );
  await proveDedicatedAdminWriteTarget(config);
  const customerAuthIds = [
    state.customerAuthUserId,
    state.businessAuthUserId,
  ].filter((value) => UUID_PATTERN.test(value));
  const customerIds = [
    state.customerCustomerId,
    state.businessCustomerId,
  ].filter((value) => UUID_PATTERN.test(value));
  const identityIds = [
    state.customerIdentityId,
    state.businessIdentityId,
  ].filter((value) => UUID_PATTERN.test(value));
  const dossierIds = [
    state.customerDossierId,
    state.customerSecondDossierId,
    state.businessDossierId,
  ].filter((value) => UUID_PATTERN.test(value));
  const caseIds = [
    state.customerCaseId,
    state.customerSecondCaseId,
    state.businessCaseId,
  ].filter((value) => UUID_PATTERN.test(value));
  const uuidList = (values: string[]) =>
    values.length ? values.map(quote).join(",") : "null::uuid";
  await psql(
    config.dbUrl,
    `begin;
    set local session_replication_role=replica;
    delete from public.app_customer_access_grants
     where auth_user_id in (${uuidList(customerAuthIds)})
        or customer_id in (${uuidList(customerIds)});
    delete from public.app_cases
     where id in (${uuidList(caseIds)});
    delete from public.app_customer_dossiers
     where id in (${uuidList(dossierIds)});
    delete from public.app_customer_identities
     where id in (${uuidList(identityIds)});
    delete from public.app_customers
     where id in (${uuidList(customerIds)});
    commit;`,
  );
  for (const userId of customerAuthIds) {
    await proveDedicatedAdminWriteTarget(config);
    const deleted = await service.auth.admin.deleteUser(userId);
    assert(!deleted.error, "portal_fixture_auth_cleanup_failed");
  }
  const portalResidue = Number(
    await psql(
      config.dbUrl,
      `begin read only;
      select
        (select count(*) from auth.users
         where id in (${uuidList(customerAuthIds)})) +
        (select count(*) from public.app_customer_access_grants
         where auth_user_id in (${uuidList(customerAuthIds)})
            or customer_id in (${uuidList(customerIds)})) +
        (select count(*) from public.app_cases
         where id in (${uuidList(caseIds)})) +
        (select count(*) from public.app_customer_dossiers
         where id in (${uuidList(dossierIds)})) +
        (select count(*) from public.app_customer_identities
         where id in (${uuidList(identityIds)})) +
        (select count(*) from public.app_customers
         where id in (${uuidList(customerIds)}));
      rollback;`,
    ),
  );
  const workforceResidue = await fixtureResidue(
    config,
    reviewerFixtureState(state),
  );
  assert(
    portalResidue === 0 && workforceResidue === 0,
    "portal_fixture_cleanup_residue",
  );
  await Deno.remove(PORTAL_AUTHORITY_DIRECTORY, { recursive: true });
  console.log("PORTAL_AUTHORITY_FIXTURE_CLEANUP=PASS");
  console.log(`FIXTURE_ID=${PORTAL_AUTHORITY_FIXTURE_ID}`);
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
    } else if (operation === "portal-setup" && fixtureId === undefined) {
      await setupPortalAuthority();
    } else if (operation === "portal-cleanup" && fixtureId === undefined) {
      await cleanupPortalAuthority();
    } else {
      throw new FixtureError(
        "usage: setup | cleanup <fixture-id> | admin-setup | admin-cleanup | portal-setup | portal-cleanup",
      );
    }
  } catch (error) {
    console.error(
      `UI01B_OPERATOR_BROWSER_FIXTURE=FAIL:${safeDiagnostic(error)}`,
    );
    Deno.exitCode = 1;
  }
}
