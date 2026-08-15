#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const LOCAL_HOST = "127.0.0.1";
const LOCAL_USER = "postgres";
const LOCAL_DATABASE = "postgres";
const LOCAL_PASSWORD = "postgres";

export const PROOF_DEFINITIONS = Object.freeze({
  "enval-local-readonly-catalog": Object.freeze({
    path: "scripts/proofs/enval-local-readonly-catalog.proof.sql",
    sha256: "b6b00bd0dd3a65cfb72688aa904cacc858a017a9874742c675054410be1a7465",
    marker: "ENVAL_LOCAL_READONLY_CATALOG_OK",
  }),
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stripSqlCommentsAndLiterals(sql) {
  let output = "";
  for (let index = 0; index < sql.length;) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index + 2);
      index = end < 0 ? sql.length : end;
      output += "\n";
      continue;
    }
    if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      if (end < 0) throw new Error("sql_unterminated_block_comment");
      output += " ";
      index = end + 2;
      continue;
    }
    const character = sql[index];
    if (character === "'" || character === '"') {
      const quote = character;
      output += " ";
      index += 1;
      let closed = false;
      while (index < sql.length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) throw new Error("sql_unterminated_quoted_value");
      continue;
    }
    if (character === "$") {
      const tag = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)
        ?.[0];
      if (tag) {
        const end = sql.indexOf(tag, index + tag.length);
        if (end < 0) throw new Error("sql_unterminated_dollar_quote");
        output += " ";
        index = end + tag.length;
        continue;
      }
    }
    output += character;
    index += 1;
  }
  return output;
}

export function validateReadOnlySql(sql) {
  const structural = stripSqlCommentsAndLiterals(sql).trim();
  if (!/^begin\s+transaction\s+read\s+only\s*;/i.test(structural)) {
    throw new Error("sql_missing_begin_transaction_read_only");
  }
  if (!/rollback\s*;\s*$/i.test(structural)) {
    throw new Error("sql_missing_terminal_rollback");
  }
  if (/^\s*\\/m.test(structural)) {
    throw new Error("sql_psql_meta_command_rejected");
  }
  const forbidden = /\b(insert|update|delete|merge|alter|create|drop|truncate|grant|revoke|comment|copy|call|do|vacuum|analyze|cluster|reindex|refresh|listen|notify|lock|checkpoint|discard|nextval|setval|lo_import|lo_export|pg_advisory_lock)\b/i;
  const match = structural.match(forbidden);
  if (match) throw new Error(`sql_mutation_keyword_rejected:${match[1]}`);
  if (/\bselect\b[\s\S]*\binto\b/i.test(structural)) {
    throw new Error("sql_select_into_rejected");
  }
  return true;
}

export function resolveLocalConnection(configText) {
  const projectId = configText.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (projectId !== "enval") throw new Error("local_project_id_not_enval");
  const dbSection = configText.match(/\[db\]([\s\S]*?)(?=\n\[[^\]]+\]|$)/)?.[1];
  const port = Number(dbSection?.match(/^port\s*=\s*(\d+)\s*$/m)?.[1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("local_db_port_invalid");
  }
  return Object.freeze({
    projectId,
    host: LOCAL_HOST,
    port,
    user: LOCAL_USER,
    database: LOCAL_DATABASE,
  });
}

export function redactSecrets(value, secrets = []) {
  let redacted = String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b(PGPASSWORD|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|JWT|TOKEN)\s*=\s*[^\s]+/gi, "$1=[REDACTED]")
    .replace(/password\s+(?:for\s+user\s+)?[^:\s]+/gi, "password [REDACTED]");
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

export function parseCliArgs(argv) {
  if (argv.length !== 2 || argv[0] !== "--proof-id") {
    throw new Error("only_manifest_proof_id_is_supported");
  }
  const proofId = argv[1];
  if (!PROOF_DEFINITIONS[proofId]) throw new Error("unknown_sql_proof_id");
  return { proofId };
}

export function runReadOnlySqlProof({
  proofId,
  cwd = ROOT,
  executor = spawnSync,
  readFile = readFileSync,
  definitions = PROOF_DEFINITIONS,
} = {}) {
  const definition = definitions[proofId];
  if (!definition) throw new Error("unknown_sql_proof_id");
  const proofPath = resolve(cwd, definition.path);
  const proofRoot = resolve(cwd, "scripts/proofs");
  if (!proofPath.startsWith(`${proofRoot}/`)) {
    throw new Error("sql_proof_path_outside_repository_proofs");
  }
  const sql = readFile(proofPath, "utf8");
  if (sha256(sql) !== definition.sha256) {
    throw new Error("sql_proof_hash_mismatch");
  }
  validateReadOnlySql(sql);

  const config = readFile(resolve(cwd, "supabase/config.toml"), "utf8");
  const connection = resolveLocalConnection(config);
  const childEnv = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "PGHOST",
    "PGHOSTADDR",
    "PGPORT",
    "PGUSER",
    "PGDATABASE",
    "PGSERVICE",
    "PGSERVICEFILE",
    "SUPABASE_DB_URL",
  ]) delete childEnv[name];
  Object.assign(childEnv, {
    PGHOST: connection.host,
    PGPORT: String(connection.port),
    PGUSER: connection.user,
    PGDATABASE: connection.database,
    PGPASSWORD: LOCAL_PASSWORD,
    PGCONNECT_TIMEOUT: "3",
    PGOPTIONS:
      "-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000",
  });
  const args = [
    "-X",
    "--no-password",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    `--file=${proofPath}`,
  ];
  const result = executor("psql", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024,
    env: childEnv,
  });
  if (result.status !== 0) {
    const detail = redactSecrets(
      result.stderr || result.stdout || result.error?.message || "psql_failed",
      [LOCAL_PASSWORD],
    );
    throw new Error(`local_readonly_sql_execution_failed:${detail}`);
  }
  const markerCount = String(result.stdout ?? "").split(definition.marker)
    .length - 1;
  if (markerCount !== 1) {
    throw new Error(`local_readonly_sql_marker_count:${markerCount}`);
  }
  return { marker: definition.marker, markerCount, connection };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const { proofId } = parseCliArgs(argv);
    const result = runReadOnlySqlProof({ proofId });
    process.stdout.write(`${result.marker}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${redactSecrets(error?.message || error)}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = main();

export { ROOT };
