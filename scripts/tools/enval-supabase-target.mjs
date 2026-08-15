#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

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

function configProjectId(configText) {
  return configText.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

function scopedCwd(cwd) {
  const rel = relative(ROOT, resolve(cwd)).replaceAll("\\", "/");
  if (rel === "" || (!rel.startsWith("../") && rel !== "..")) {
    if (rel === "supabase" || rel.startsWith("supabase/")) return "TENANT_ENVAL";
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
} = {}) {
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

  const observedScope = scopedCwd(cwd);
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

  const absoluteWorkdir = resolve(ROOT, definition.workdir);
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
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(ANON_KEY|SERVICE_ROLE_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
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
  const argv = ["--workdir", resolved.absoluteWorkdir, ...resolved.supabaseArgv];
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

function parseArgs(argv) {
  const parsed = { target: null, operation: "inspect", execute: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--target") {
      parsed.target = argv[++index] ?? null;
    } else if (value === "--operation") {
      parsed.operation = argv[++index] ?? "";
    } else if (value === "--execute") {
      parsed.execute = true;
    } else {
      throw new Error(`unknown_argument:${value}`);
    }
  }
  return parsed;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const resolved = resolveSupabaseTarget(options);
    if (options.execute) executeSupabaseOperation(resolved);
    process.stdout.write(`${safeTargetEvidence(resolved)}\n`);
    if (options.execute) process.stdout.write("EXECUTION_STATUS=PASS\n");
    return 0;
  } catch (error) {
    process.stderr.write(`TARGET_GUARD_STATUS=FAIL\n${redactDiagnostic(error)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = main();
