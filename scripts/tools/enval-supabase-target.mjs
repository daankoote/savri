#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { executeValidatedReadOnlySql } from "./enval-readonly-sql.mjs";

export const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

export const TARGETS = Object.freeze({
  CONTROL_PLANE: Object.freeze({
    target: "CONTROL_PLANE",
    workdir: "platform/control-plane",
    projectId: "enval-control-plane",
    localPortFamily: "5632x",
    environmentPrefix: "ENVAL_CONTROL_PLANE_",
  }),
  TENANT_ENVAL: Object.freeze({
    target: "TENANT_ENVAL",
    workdir: ".",
    projectId: "enval",
    localPortFamily: "5432x",
    environmentPrefix: "ENVAL_TENANT_ENVAL_",
  }),
});

const OPERATIONS = Object.freeze({
  inspect: Object.freeze({ argv: null, mutating: false }),
  status: Object.freeze({ argv: ["status"], mutating: false }),
  start: Object.freeze({ argv: ["start"], mutating: true }),
  stop: Object.freeze({ argv: ["stop"], mutating: true }),
  "db-reset": Object.freeze({ argv: ["db", "reset"], mutating: true }),
});

const REMOTE_OPERATION_PATTERN =
  /^(link|unlink|push|pull|deploy|secrets|functions-deploy|migration-repair|remote)/;

const DB_IDENTITY_SQL = `BEGIN TRANSACTION READ ONLY;
SELECT pg_catalog.jsonb_build_object(
  'probe', 'db-identity',
  'database', current_database(),
  'user', current_user,
  'transaction_read_only', current_setting('transaction_read_only'),
  'marker', 'ENVAL_LOCAL_DB_IDENTITY_OK'
);
ROLLBACK;`;

const DB_BASELINE_SQL = `BEGIN TRANSACTION READ ONLY;
SELECT pg_catalog.jsonb_build_object(
  'probe', 'db-baseline',
  'auth_users', (SELECT count(*) FROM auth.users),
  'signup_intakes', (SELECT count(*) FROM public.app_signup_intakes),
  'cases', (SELECT count(*) FROM public.app_cases),
  'storage_objects', (SELECT count(*) FROM storage.objects),
  'marker', 'ENVAL_LOCAL_DB_BASELINE_OK'
);
ROLLBACK;`;

export const READ_ONLY_PROBES = Object.freeze({
  "db-identity": Object.freeze({
    kind: "sql",
    marker: "ENVAL_LOCAL_DB_IDENTITY_OK",
    sql: DB_IDENTITY_SQL,
  }),
  "db-baseline": Object.freeze({
    kind: "sql",
    marker: "ENVAL_LOCAL_DB_BASELINE_OK",
    sql: DB_BASELINE_SQL,
  }),
  "api-health": Object.freeze({
    kind: "http",
    marker: "ENVAL_LOCAL_API_HEALTH_OK",
    url: "http://127.0.0.1:54321/auth/v1/health",
  }),
  "mailpit-health": Object.freeze({
    kind: "http",
    marker: "ENVAL_LOCAL_MAILPIT_HEALTH_OK",
    url: "http://127.0.0.1:54324/api/v1/info",
  }),
});

function configProjectId(configText) {
  return configText.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

function scopedCwd(cwd, root) {
  const rel = relative(root, resolve(cwd)).replaceAll("\\", "/");
  if (rel === "" || (!rel.startsWith("../") && rel !== "..")) {
    if (rel === "supabase" || rel.startsWith("supabase/")) {
      return "TENANT_ENVAL";
    }
    if (
      rel === "platform/control-plane" ||
      rel.startsWith("platform/control-plane/")
    ) return "CONTROL_PLANE";
    return "NEUTRAL_REPOSITORY";
  }
  return "OUTSIDE_REPOSITORY";
}

function namespacePresence(env) {
  const keys = Object.keys(env ?? {});
  return Object.values(TARGETS).filter((target) =>
    keys.some((key) => key.startsWith(target.environmentPrefix))
  ).map((target) => target.target);
}

export function resolveSupabaseTarget({
  target,
  operation = "inspect",
  cwd = process.cwd(),
  env = process.env,
  root = ROOT,
} = {}) {
  const repositoryRoot = resolve(root);
  const normalizedTarget = String(target ?? "").trim().toUpperCase();
  const definition = TARGETS[normalizedTarget];
  if (!definition) {
    throw new Error(normalizedTarget ? "unknown_target" : "target_required");
  }
  if (REMOTE_OPERATION_PATTERN.test(operation)) {
    throw new Error("remote_operation_not_supported");
  }
  const operationDefinition = OPERATIONS[operation];
  if (!operationDefinition) throw new Error("unknown_operation");
  if (operationDefinition.mutating && normalizedTarget !== "CONTROL_PLANE") {
    throw new Error("tenant_enval_mutation_not_authorized");
  }

  const observedScope = scopedCwd(cwd, repositoryRoot);
  if (observedScope === "OUTSIDE_REPOSITORY") {
    throw new Error("current_directory_outside_repository");
  }
  if (
    observedScope !== "NEUTRAL_REPOSITORY" &&
    observedScope !== normalizedTarget
  ) {
    throw new Error("target_current_directory_mismatch");
  }

  const presentNamespaces = namespacePresence(env);
  if (operationDefinition.mutating && presentNamespaces.length > 1) {
    throw new Error("ambiguous_credential_namespaces");
  }
  if (
    operationDefinition.mutating && presentNamespaces.length === 1 &&
    presentNamespaces[0] !== normalizedTarget
  ) {
    throw new Error("credential_namespace_target_mismatch");
  }

  const absoluteWorkdir = resolve(repositoryRoot, definition.workdir);
  const configPath = resolve(absoluteWorkdir, "supabase/config.toml");
  let configText;
  try {
    configText = readFileSync(configPath, "utf8");
  } catch {
    throw new Error("target_config_missing");
  }
  if (configProjectId(configText) !== definition.projectId) {
    throw new Error("target_project_id_mismatch");
  }

  return Object.freeze({
    ...definition,
    absoluteWorkdir,
    configPath,
    operation,
    mutating: operationDefinition.mutating,
    supabaseArgv: operationDefinition.argv,
    localOnly: true,
  });
}

export function safeTargetEvidence(resolved) {
  return [
    `TARGET=${resolved.target}`,
    `WORKDIR=${resolved.workdir}`,
    `PROJECT_ID=${resolved.projectId}`,
    `PORT_FAMILY=${resolved.localPortFamily}`,
    `OPERATION=${resolved.operation}`,
    "LOCAL_ONLY=YES",
  ].join("\n");
}

function redactDiagnostic(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(
      /\b(ANON_KEY|SERVICE_ROLE_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .split(/\r?\n/)
    .slice(0, 20)
    .join("\n")
    .slice(0, 4_000);
}

export function executeSupabaseOperation(resolved, {
  executor = spawnSync,
  env = process.env,
} = {}) {
  if (!resolved.supabaseArgv) throw new Error("operation_has_no_subprocess");
  const argv = [
    "--workdir",
    resolved.absoluteWorkdir,
    ...resolved.supabaseArgv,
  ];
  const result = executor("supabase", argv, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    timeout: 180_000,
    env: { ...env, SUPABASE_TELEMETRY_DISABLED: "1" },
  });
  if (result.status !== 0) {
    throw new Error(
      `supabase_${resolved.operation}_failed:${result.status ?? "signal"}:` +
        redactDiagnostic(result.stderr || result.stdout || result.error),
    );
  }
  return Object.freeze({ status: 0 });
}

export function parseArgs(argv) {
  const parsed = {
    target: null,
    operation: "inspect",
    execute: false,
    probe: null,
  };
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") {
      if (seen.has(value)) throw new Error("duplicate_argument:--target");
      seen.add(value);
      parsed.target = argv[++index] ?? null;
    } else if (value === "--operation") {
      if (seen.has(value)) throw new Error("duplicate_argument:--operation");
      seen.add(value);
      parsed.operation = argv[++index] ?? "";
    } else if (value === "--execute") {
      if (seen.has(value)) throw new Error("duplicate_argument:--execute");
      seen.add(value);
      parsed.execute = true;
    } else if (value === "--probe") {
      if (seen.has(value)) throw new Error("duplicate_argument:--probe");
      seen.add(value);
      parsed.probe = argv[++index] ?? null;
    } else {
      throw new Error(`unknown_argument:${value}`);
    }
  }
  if (parsed.probe && (parsed.operation !== "inspect" || parsed.execute)) {
    throw new Error("readonly_probe_mixed_with_operation");
  }
  return parsed;
}

function safeSqlProbeOutput(probe, stdout) {
  const lines = String(stdout ?? "").split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line && !["BEGIN", "ROLLBACK"].includes(line));
  if (lines.length !== 1) throw new Error("readonly_sql_output_invalid");
  let payload;
  try {
    payload = JSON.parse(lines[0]);
  } catch {
    throw new Error("readonly_sql_output_invalid");
  }
  const expectedKeys = probe === "db-identity"
    ? ["database", "marker", "probe", "transaction_read_only", "user"]
    : [
      "auth_users",
      "cases",
      "marker",
      "probe",
      "signup_intakes",
      "storage_objects",
    ];
  const definition = READ_ONLY_PROBES[probe];
  if (
    Object.keys(payload).sort().join("|") !== expectedKeys.join("|") ||
    payload.probe !== probe || payload.marker !== definition.marker
  ) throw new Error("readonly_sql_output_contract_invalid");
  if (probe === "db-identity") {
    if (
      payload.database !== "postgres" || payload.user !== "postgres" ||
      payload.transaction_read_only !== "on"
    ) {
      throw new Error("readonly_sql_identity_invalid");
    }
  } else {
    for (
      const key of ["auth_users", "signup_intakes", "cases", "storage_objects"]
    ) {
      if (!Number.isSafeInteger(payload[key]) || payload[key] < 0) {
        throw new Error("readonly_sql_count_invalid");
      }
    }
  }
  return Object.freeze(payload);
}

export async function runReadOnlyProbe(resolved, probe, {
  sqlExecutor = executeValidatedReadOnlySql,
  fetcher = fetch,
} = {}) {
  if (resolved.target !== "TENANT_ENVAL" || resolved.mutating) {
    throw new Error("readonly_probe_target_invalid");
  }
  const definition = READ_ONLY_PROBES[probe];
  if (!definition) throw new Error("readonly_probe_unknown");
  if (definition.kind === "sql") {
    const executed = sqlExecutor({
      sql: definition.sql,
      marker: definition.marker,
      cwd: resolved.absoluteWorkdir,
    });
    return safeSqlProbeOutput(probe, executed.stdout);
  }
  const url = new URL(definition.url);
  if (
    url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
    !["54321", "54324"].includes(url.port) || url.username || url.password ||
    url.search || url.hash
  ) throw new Error("readonly_http_target_invalid");
  const response = await fetcher(url, {
    method: "GET",
    redirect: "manual",
    headers: Object.freeze({ Accept: "application/json" }),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== 200 || response.url !== url.href) {
    throw new Error("readonly_http_health_failed");
  }
  await response.body?.cancel().catch(() => undefined);
  return Object.freeze({
    probe,
    origin: url.origin,
    status: response.status,
    marker: definition.marker,
  });
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const resolved = resolveSupabaseTarget(options);
    if (options.probe) {
      const result = await runReadOnlyProbe(resolved, options.probe);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return 0;
    }
    if (options.execute) executeSupabaseOperation(resolved);
    process.stdout.write(`${safeTargetEvidence(resolved)}\n`);
    if (options.execute) process.stdout.write("EXECUTION_STATUS=PASS\n");
    return 0;
  } catch (error) {
    process.stderr.write(
      `TARGET_GUARD_STATUS=FAIL\n${redactDiagnostic(error)}\n`,
    );
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = await main();
