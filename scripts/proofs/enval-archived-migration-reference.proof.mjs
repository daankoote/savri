#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TENANT_ENVAL_MIGRATION_CHAIN as chain,
} from "../tools/enval-migration-chain-manifest.mjs";
import {
  COMMANDS,
  PATH_RULES,
} from "../tools/enval-verify-manifest.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SOURCE_PATTERN = /\.(?:cjs|cts|js|mjs|mts|ts|tsx)$/;
const ARCHIVE_PREFIX = "supabase/migration-archive/";
const INTENTIONAL_ARCHIVE_DOCUMENTATION =
  "scripts/tools/enval-migration-chain-manifest.mjs";
const NEGATIVE_TEST = "scripts/proofs/enval-verify-runner.proof.mjs";
const NEGATIVE_TEST_MARKER = "simulatedArchivedAsActive";

function assert(value, code) {
  if (!value) throw new Error(code);
}

function sha256(path) {
  return createHash("sha256")
    .update(readFileSync(resolve(ROOT, path)))
    .digest("hex");
}

function sourcePathsFromManifest() {
  const paths = new Set([
    "scripts/tools/enval-migration-chain-manifest.mjs",
    "scripts/tools/enval-verify-manifest.mjs",
    "scripts/proofs/enval-verify-runner.proof.mjs",
  ]);
  for (const command of Object.values(COMMANDS)) {
    for (const argument of command.argv ?? []) {
      if (
        SOURCE_PATTERN.test(argument) &&
        (argument.startsWith("scripts/proofs/") ||
          argument.startsWith("scripts/tools/"))
      ) paths.add(argument);
    }
  }
  for (const rule of PATH_RULES) {
    const values = rule.match.type === "oneOf"
      ? rule.match.value
      : [rule.match.value];
    for (const value of values) {
      if (
        typeof value === "string" && SOURCE_PATTERN.test(value) &&
        (value.startsWith("scripts/proofs/") ||
          value.startsWith("scripts/tools/"))
      ) paths.add(value);
    }
  }
  for (const entry of readdirSync(resolve(ROOT, "scripts/tools"), {
    withFileTypes: true,
  })) {
    if (entry.isFile() && SOURCE_PATTERN.test(entry.name)) {
      paths.add(`scripts/tools/${entry.name}`);
    }
  }
  return [...paths].sort();
}

function isResolverReference(lines, lineIndex) {
  const context = lines.slice(
    Math.max(0, lineIndex - 4),
    Math.min(lines.length, lineIndex + 5),
  ).join("\n");
  return context.includes("resolveTenantEnvalArchivedMigrationPath") ||
    context.includes("archivedMigrationSource");
}

function isIntentionalReference(path, lines, lineIndex) {
  if (path === INTENTIONAL_ARCHIVE_DOCUMENTATION) return true;
  if (path !== NEGATIVE_TEST) return false;
  const context = lines.slice(
    Math.max(0, lineIndex - 18),
    Math.min(lines.length, lineIndex + 19),
  ).join("\n");
  return context.includes(NEGATIVE_TEST_MARKER);
}

try {
  const archived = [
    ...chain.currentPresentAppMigrations,
    ...chain.absentLegacyMigrations,
    ...chain.excludedConnectionMigrations,
  ];
  assert(archived.length === 41, "archived_version_count_not_exact");
  assert(
    new Set(archived.map((entry) => entry.version)).size === archived.length,
    "archived_version_collision",
  );
  for (const entry of archived) {
    assert(entry.path.startsWith(ARCHIVE_PREFIX), "archive_path_outside_root");
    assert(existsSync(resolve(ROOT, entry.path)), "archive_source_missing");
    assert(sha256(entry.path) === entry.sha256, "archive_source_hash_mismatch");
    assert(
      !existsSync(resolve(ROOT, entry.originalPath)),
      "archived_source_reactivated",
    );
  }

  const expectedActive = [chain.baseline, ...chain.forwardTail]
    .map((entry) => basename(entry.path)).sort();
  const actualActive = readdirSync(resolve(ROOT, chain.activeRoot))
    .filter((name) => name.endsWith(".sql")).sort();
  assert(
    actualActive.join("|") === expectedActive.join("|"),
    "active_chain_not_exact",
  );

  const stale = [];
  const intentional = [];
  for (const path of sourcePathsFromManifest()) {
    const absolute = resolve(ROOT, path);
    assert(existsSync(absolute), `current_verification_source_missing:${path}`);
    const lines = readFileSync(absolute, "utf8").split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      for (const entry of archived) {
        const archivedName = basename(entry.originalPath);
        if (!lines[lineIndex].includes(archivedName)) continue;
        if (isResolverReference(lines, lineIndex)) continue;
        if (isIntentionalReference(path, lines, lineIndex)) {
          intentional.push(`${path}:${lineIndex + 1}:${entry.version}`);
          continue;
        }
        stale.push(`${path}:${lineIndex + 1}:${entry.version}`);
      }
    }
  }
  assert(
    intentional.length === 5,
    `intentional_exception_inventory_changed:${intentional.join(",")}`,
  );
  assert(stale.length === 0, `stale_archived_active_paths:${stale.join(",")}`);

  console.log("ARCHIVED_MIGRATION_REFERENCE_GATE=PASS");
  console.log(`ARCHIVED_MIGRATION_VERSION_COUNT=${archived.length}`);
  console.log("STALE_ARCHIVED_ACTIVE_PATH_REFERENCES=0");
  console.log(`INTENTIONAL_ARCHIVE_REFERENCE_EXCEPTIONS=${intentional.length}`);
  console.log("ARCHIVE_SHA_PROVENANCE=PASS");
  console.log("ACTIVE_CHAIN_EXACT=PASS");
} catch (error) {
  console.error(
    `ARCHIVED_MIGRATION_REFERENCE_GATE=FAIL\n${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}
