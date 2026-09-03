#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveSupabaseTarget } from "./enval-supabase-target.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const FUNCTIONS_ENV_FILE = resolve(ROOT, "supabase/functions/.env.local");
const DEFAULT_VITE_URL = "http://127.0.0.1:5175";
const LOCAL_IDEMPOTENCY_TTL_SECONDS = "86400";
const REQUEST_TIMEOUT_MS = 5_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fixedLocalDataPlaneReference() {
  const config = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");
  const match = config.match(
    /^project_id\s*=\s*"([a-z0-9][a-z0-9_-]{1,63})"\s*$/m,
  );
  if (!match) fail("tenant_fixed_data_plane_reference_unavailable");
  return match[1];
}

const CURRENT_EDGE_ENTRYPOINTS = Object.freeze([
  "supabase/functions/api-app-auth-bootstrap/index.ts",
  "supabase/functions/api-app-presentation-bootstrap/index.ts",
  "supabase/functions/api-app-dashboard-get/index.ts",
  "supabase/functions/api-app-signup-submit/index.ts",
  "supabase/functions/api-app-signup-signing-presentation/index.ts",
  "supabase/functions/api-app-signup-signing-finalize/index.ts",
  "supabase/functions/api-app-compliance-source-event/index.ts",
  "supabase/functions/api-app-compliance-worklist/index.ts",
  "supabase/functions/api-app-ops-location-observation-record/index.ts",
  "supabase/functions/api-app-ops-location-root-create/index.ts",
  "supabase/functions/api-app-ops-location-version-accept/index.ts",
  "supabase/functions/api-app-ops-location-version-correct/index.ts",
  "supabase/functions/api-app-evidence-review-round-finalize/index.ts",
  "supabase/functions/api-app-evidence-review-correction-publish/index.ts",
  "supabase/functions/api-app-customer-correction-handoff/index.ts",
  "supabase/functions/api-app-customer-correction-signing-challenge/index.ts",
  "supabase/functions/api-app-customer-correction-signing-finalize/index.ts",
]);

function safeDiagnostic(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[REDACTED_KEY]")
    .replace(
      /\b(ANON_KEY|SERVICE_ROLE_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .split(/\r?\n/)
    .slice(0, 12)
    .join("\n")
    .slice(0, 2_000);
}

function fail(code, detail = "") {
  const suffix = detail ? `:${safeDiagnostic(detail)}` : "";
  throw new Error(`${code}${suffix}`);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: options.timeout ?? 30_000,
    env: {
      ...process.env,
      SUPABASE_TELEMETRY_DISABLED: "1",
      ...(options.env ?? {}),
    },
  });
  if (result.status !== 0) {
    fail(
      options.failureCode ?? "local_command_failed",
      result.stderr || result.stdout || result.error,
    );
  }
  return String(result.stdout ?? "");
}

function parseStatusEnvironment(raw) {
  const parsed = Object.create(null);
  for (const line of String(raw).split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    parsed[match[1]] = value;
  }
  return parsed;
}

function localStatusEnvironment(target) {
  const resolved = resolveSupabaseTarget({ target, operation: "status" });
  const raw = command(
    "supabase",
    ["--workdir", resolved.absoluteWorkdir, "status", "-o", "env"],
    { failureCode: `${target.toLowerCase()}_status_unavailable` },
  );
  const environment = parseStatusEnvironment(raw);
  if (!environment.API_URL || !environment.DB_URL) {
    fail(`${target.toLowerCase()}_status_incomplete`);
  }
  return Object.freeze({ resolved, environment });
}

function assertLocalUrl(raw, expectedPort) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("non_local_runtime_target");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== String(expectedPort)
  ) fail("non_local_runtime_target");
  return url;
}

function managedLocalConfiguration(controlPlaneStatus) {
  const fixedDataPlaneReference = fixedLocalDataPlaneReference();
  assertLocalUrl(controlPlaneStatus.environment.API_URL, 56321);
  const databaseUrl = assertLocalUrl(
    controlPlaneStatus.environment.DB_URL.replace(/^postgresql:/, "http:"),
    56322,
  );
  if (!controlPlaneStatus.environment.SERVICE_ROLE_KEY) {
    fail("control_plane_service_role_missing");
  }

  const sql = `
    begin transaction read only;
    select concat_ws(E'\\t',
      t.id::text,
      r.normalized_value,
      l.id::text,
      l.deployment_ownership,
      l.provider_type,
      l.provider_project_ref,
      l.application_route_ref,
      l.secret_reference_id::text
    )
    from platform.tenants t
    join platform.routing_identities r on r.tenant_id=t.id
    join platform.data_plane_locators l on l.tenant_id=t.id
    where t.lifecycle_status='active'
      and t.public_slug='enval'
      and r.identity_kind='host'
      and r.lifecycle_status='active'
      and l.environment='local'
      and l.lifecycle_status='active';
    rollback;
  `;
  const output = command(
    "psql",
    [
      controlPlaneStatus.environment.DB_URL,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-Atq",
      "-c",
      sql,
    ],
    { failureCode: "control_plane_local_config_unavailable" },
  );
  const rows = output.trim().split(/\r?\n/).filter(Boolean);
  if (rows.length !== 1) fail("control_plane_local_config_ambiguous");
  const [
    tenantId,
    routingIdentity,
    locatorId,
    deploymentOwnership,
    providerType,
    dataPlaneReference,
    applicationRouteReference,
    secretReferenceId,
  ] = rows[0].split("\t");
  if (
    !UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(locatorId) ||
    !UUID_PATTERN.test(secretReferenceId) ||
    routingIdentity !== "enval.localhost" ||
    deploymentOwnership !== "ENVAL_MANAGED_DEDICATED" ||
    providerType !== "supabase" ||
    dataPlaneReference !== fixedDataPlaneReference ||
    !applicationRouteReference
  ) fail("control_plane_local_config_invalid");

  const controlPlaneApi = new URL(controlPlaneStatus.environment.API_URL);
  controlPlaneApi.hostname = "host.docker.internal";
  return Object.freeze({
    ENVIRONMENT: "local",
    ALLOWED_ORIGINS: [
      "http://127.0.0.1:5174",
      "http://localhost:5174",
      "http://127.0.0.1:5175",
      "http://localhost:5175",
    ].join(","),
    ENVAL_TENANT_RESOLUTION_AUTHORITY_MODE: "AUTHORITATIVE",
    ENVAL_TENANT_RESOLUTION_SHADOW_MODE: "static_single_tenant_v1",
    ENVAL_TENANT_REFERENCE: tenantId,
    ENVAL_TRUSTED_TENANT_ROUTING_KEY: routingIdentity,
    ENVAL_DATA_PLANE_LOCATOR_ID: locatorId,
    ENVAL_DATA_PLANE_DEPLOYMENT_OWNERSHIP: deploymentOwnership,
    ENVAL_DATA_PLANE_PROVIDER_TYPE: providerType,
    ENVAL_DATA_PLANE_REFERENCE: dataPlaneReference,
    ENVAL_FIXED_DATA_PLANE_REFERENCE: fixedDataPlaneReference,
    ENVAL_APPLICATION_ROUTE_REFERENCE: applicationRouteReference,
    ENVAL_DATA_PLANE_SECRET_REFERENCE_ID: secretReferenceId,
    ENVAL_PRESENTATION_SOURCE_MODE: "platform_control_plane_presentation_v1",
    ENVAL_CONTROL_PLANE_SUPABASE_URL: controlPlaneApi.toString().replace(
      /\/$/,
      "",
    ),
    ENVAL_CONTROL_PLANE_SERVICE_ROLE_KEY:
      controlPlaneStatus.environment.SERVICE_ROLE_KEY,
    APP_OPS_LOCATION_IDEMPOTENCY_TTL_SECONDS: LOCAL_IDEMPOTENCY_TTL_SECONDS,
  });
}

function edgeRuntimePreflight() {
  command(
    "deno",
    [
      "check",
      "--deny-import",
      "--no-lock",
      "--config",
      "supabase/functions/deno.json",
      ...CURRENT_EDGE_ENTRYPOINTS,
    ],
    {
      timeout: 60_000,
      failureCode: "edge_runtime_import_preflight_failed",
    },
  );
}

function temporaryFunctionsEnvironment(runtimeEnvironment) {
  const directory = mkdtempSync(join(tmpdir(), "enval-local-functions-"));
  const path = join(directory, "runtime.env");
  const existing = readFileSync(FUNCTIONS_ENV_FILE, "utf8").trimEnd();
  const derived = Object.entries(runtimeEnvironment).map(([key, value]) =>
    `${key}=${JSON.stringify(value)}`
  ).join("\n");
  writeFileSync(path, `${existing}\n${derived}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze({ directory, path });
}

async function fetchBounded(url, init = {}) {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    fail("local_health_request_failed", error?.name ?? "fetch_failed");
  }
}

function parseMigrationState() {
  const raw = command(
    "supabase",
    ["--workdir", ROOT, "migration", "list", "--local"],
    { failureCode: "tenant_migration_state_unavailable" },
  );
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    fail("tenant_migration_state_invalid");
  }
  if (!Array.isArray(body?.migrations) || body.migrations.length === 0) {
    fail("tenant_migration_state_invalid");
  }
  return body.migrations.filter((row) => row?.local !== row?.remote).length;
}

function parseViteUrl(raw) {
  const url = assertLocalUrl(raw, new URL(raw).port);
  if (!["5174", "5175"].includes(url.port) || url.pathname !== "/") {
    fail("vite_target_not_allowed");
  }
  return url.toString().replace(/\/$/, "");
}

async function ready(viteUrl) {
  const tenant = localStatusEnvironment("TENANT_ENVAL");
  localStatusEnvironment("CONTROL_PLANE");
  assertLocalUrl(tenant.environment.API_URL, 54321);
  const anonKey = tenant.environment.ANON_KEY;
  if (!anonKey) fail("tenant_anon_key_missing");

  const page = await fetchBounded(`${viteUrl}/intern/dossiers`);
  const pageBody = await page.text();
  if (!page.ok || !pageBody.includes('id="root"')) fail("vite_not_ready");

  const apiBase = `${tenant.environment.API_URL}/functions/v1`;
  const headers = {
    Authorization: `Bearer ${anonKey}`,
    apikey: anonKey,
    Origin: viteUrl,
  };
  const presentation = await fetchBounded(
    `${apiBase}/api-app-presentation-bootstrap`,
    { headers },
  );
  let presentationBody;
  try {
    presentationBody = await presentation.json();
  } catch {
    fail("presentation_bootstrap_invalid");
  }
  if (
    presentation.status !== 200 || presentationBody?.ok !== true ||
    presentationBody?.mode !== "presentation_bootstrap_browser"
  ) fail("presentation_bootstrap_not_ready");

  const authHealth = await fetchBounded(
    `${tenant.environment.API_URL}/auth/v1/health`,
    { headers: { apikey: anonKey } },
  );
  if (authHealth.status !== 200) fail("auth_service_not_ready");

  const auth = await fetchBounded(`${apiBase}/api-app-auth-bootstrap`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": `local-ready-${crypto.randomUUID()}`,
    },
    body: "{}",
  });
  let authBody;
  try {
    authBody = await auth.json();
  } catch {
    fail("auth_bootstrap_invalid");
  }
  if (
    auth.status !== 401 ||
    !["auth_required", "invalid_authorization"].includes(authBody?.code)
  ) {
    fail("auth_bootstrap_not_ready");
  }

  const finalizer = await fetchBounded(
    `${apiBase}/api-app-evidence-review-round-finalize`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `local-ready-${crypto.randomUUID()}`,
      },
      body: "{}",
    },
  );
  let finalizerBody;
  try {
    finalizerBody = await finalizer.json();
  } catch {
    fail("evidence_review_finalizer_invalid");
  }
  if (
    finalizer.status !== 401 ||
    finalizerBody?.code !== "authentication_required"
  ) fail("evidence_review_finalizer_not_ready");

  const correctionPublish = await fetchBounded(
    `${apiBase}/api-app-evidence-review-correction-publish`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `local-ready-${crypto.randomUUID()}`,
      },
      body: "{}",
    },
  );
  const correctionRead = await fetchBounded(
    `${apiBase}/api-app-customer-correction-handoff?caseRef=CASE-000000000000`,
    { headers },
  );
  let correctionPublishBody;
  let correctionReadBody;
  try {
    correctionPublishBody = await correctionPublish.json();
    correctionReadBody = await correctionRead.json();
  } catch {
    fail("correction_handoff_runtime_invalid");
  }
  if (
    correctionPublish.status !== 401 ||
    correctionPublishBody?.code !== "authentication_required" ||
    correctionRead.status !== 401 ||
    correctionReadBody?.code !== "authentication_required"
  ) fail("correction_handoff_runtime_not_ready");

  for (
    const endpoint of [
      "api-app-customer-correction-signing-challenge",
      "api-app-customer-correction-signing-finalize",
    ]
  ) {
    const response = await fetchBounded(`${apiBase}/${endpoint}`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Idempotency-Key": `local-ready-${crypto.randomUUID()}`,
      },
      body: "{}",
    });
    let body;
    try {
      body = await response.json();
    } catch {
      fail("customer_correction_signing_runtime_invalid");
    }
    if (
      response.status !== 400 ||
      !["invalid_input", "invalid_json"].includes(body?.code)
    ) fail("customer_correction_signing_runtime_not_ready");
  }

  const pending = parseMigrationState();
  if (pending !== 0) fail("tenant_migrations_pending", String(pending));
  process.stdout.write(
    [
      "LOCAL_READY=PASS",
      "VITE=PASS",
      "SUPABASE=PASS",
      "PRESENTATION_BOOTSTRAP=PASS",
      "AUTH_BOOTSTRAP=PASS",
      "EVIDENCE_REVIEW_FINALIZER=PASS",
      "EVIDENCE_REVIEW_CORRECTION_HANDOFF=PASS",
      "DOSSIERS_ROUTE=PASS",
      "PENDING_LOCAL_TENANT_MIGRATIONS=0",
    ].join("\n") + "\n",
  );
}

async function serve() {
  if (!existsSync(FUNCTIONS_ENV_FILE)) fail("functions_env_file_missing");
  localStatusEnvironment("TENANT_ENVAL");
  const controlPlane = localStatusEnvironment("CONTROL_PLANE");
  const runtimeEnvironment = managedLocalConfiguration(controlPlane);
  edgeRuntimePreflight();
  const temporaryEnvironment = temporaryFunctionsEnvironment(
    runtimeEnvironment,
  );
  process.stdout.write(
    [
      "LOCAL_FUNCTION_RUNTIME_PREFLIGHT=PASS",
      "TENANT_TARGET=TENANT_ENVAL",
      "PRESENTATION_SOURCE=platform_control_plane_presentation_v1",
      "TENANT_RESOLVER=static_single_tenant_v1",
      "SECRETS_PRINTED=NO",
    ].join("\n") + "\n",
  );

  try {
    const child = spawn(
      "supabase",
      [
        "--workdir",
        ROOT,
        "functions",
        "serve",
        "--env-file",
        temporaryEnvironment.path,
      ],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          SUPABASE_TELEMETRY_DISABLED: "1",
        },
        stdio: "inherit",
      },
    );
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => child.kill(signal));
    }
    const exitCode = await new Promise((resolveExit, rejectExit) => {
      child.once("error", (error) => rejectExit(error));
      child.once("exit", (code) => resolveExit(code ?? 1));
    }).catch((error) => fail("functions_serve_failed", error));
    process.exitCode = exitCode;
  } finally {
    rmSync(temporaryEnvironment.directory, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const parsed = { operation: null, viteUrl: DEFAULT_VITE_URL };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--operation") parsed.operation = argv[++index] ?? null;
    else if (value === "--vite-url") parsed.viteUrl = argv[++index] ?? "";
    else fail("unknown_argument", value);
  }
  if (!["serve", "ready"].includes(parsed.operation)) {
    fail("operation_required");
  }
  parsed.viteUrl = parseViteUrl(parsed.viteUrl);
  return parsed;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.operation === "serve") await serve();
  else await ready(options.viteUrl);
} catch (error) {
  process.stderr.write(`LOCAL_READY=FAIL\nREASON=${safeDiagnostic(error)}\n`);
  process.exitCode = 1;
}
