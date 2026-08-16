#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  MODES,
  SAFETY,
  VERIFY_MANIFEST,
} from "./enval-verify-manifest.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const MAX_DIAGNOSTIC_CHARS = 4_000;
const MAX_DIAGNOSTIC_LINES = 20;

function git(args, cwd = ROOT) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git_${args[0]}_failed:${result.status ?? "signal"}`);
  }
  return result.stdout;
}

function nulList(value) {
  return value.split("\0").filter(Boolean);
}

export function collectChangedPaths(cwd = ROOT) {
  const paths = new Set([
    ...nulList(git(["diff", "--name-only", "-z"], cwd)),
    ...nulList(git(["diff", "--cached", "--name-only", "-z"], cwd)),
    ...nulList(git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
    ], cwd)),
  ]);
  return [...paths].sort();
}

function isSafeRepoPath(path) {
  return typeof path === "string" && path.length > 0 &&
    !path.startsWith("/") && path !== ".." && !path.startsWith("../") &&
    !path.includes("/../") && !path.includes("\0") &&
    !path.includes("\n") && !path.includes("\r");
}

function matches(path, matcher) {
  switch (matcher.type) {
    case "exact":
      return path === matcher.value;
    case "prefix":
      return path.startsWith(matcher.value);
    case "suffix":
      return path.endsWith(matcher.value);
    case "oneOf":
      return matcher.value.includes(path);
    case "basenameOneOf":
      return matcher.value.includes(basename(path));
    case "extensions":
      return matcher.value.includes(extname(path).toLowerCase());
    default:
      return false;
  }
}

function materializeCommand(commandId, command, path) {
  const needsPath = command.argv?.some((part) => part === "{path}") ?? false;
  if (needsPath && !path) return null;
  const argv = command.argv?.map((part) => part === "{path}" ? path : part) ??
    null;
  return {
    id: command.perPath ? `${commandId}:${path}` : commandId,
    commandId,
    dedupeKey: command.dedupeKey.replaceAll("{path}", path ?? ""),
    path: command.perPath ? path : null,
    safety: command.safety,
    argv,
    runner: command.runner,
    domain: command.domain,
    minimumMode: command.minimumMode,
    serviceRequirements: command.serviceRequirements,
    mutatesState: command.mutatesState,
    destructive: command.destructive,
    remote: command.remote,
    expectedDurationMs: command.expectedDurationMs,
    expectedMarker: command.expectedMarker,
    requiredForRelease: command.requiredForRelease,
  };
}

function modeRank(mode, modes = MODES) {
  return modes.indexOf(mode);
}

function executableSafety(mode, safety, modes = MODES) {
  if (safety === SAFETY.SAFE_PURE) return true;
  if (safety === SAFETY.SAFE_LOCAL_READ) {
    return modeRank(mode, modes) >= modeRank("LOCAL_SERVICE", modes);
  }
  if (safety === SAFETY.SAFE_LOCAL_CONTROL_PLANE_WRITE) {
    return modeRank(mode, modes) >= modeRank("LOCAL_SERVICE", modes);
  }
  if (safety === SAFETY.SAFE_GENERATED_WRITE) {
    return modeRank(mode, modes) >= modeRank("INTEGRATION", modes);
  }
  return false;
}

export function validateManifest(manifest = VERIFY_MANIFEST) {
  const errors = [];
  const inventoryTargets = new Set();
  const inventoryRoots = new Set();
  const requiredFields = [
    "id",
    "runner",
    "domain",
    "applicablePaths",
    "safety",
    "minimumMode",
    "serviceRequirements",
    "mutatesState",
    "destructive",
    "remote",
    "expectedDurationMs",
    "dedupeKey",
  ];
  for (const [id, command] of Object.entries(manifest.commands)) {
    if (command.id !== id) errors.push(`manifest_id_mismatch:${id}`);
    for (const field of requiredFields) {
      if (command[field] === undefined) {
        errors.push(`manifest_field_missing:${id}:${field}`);
      }
    }
    if (!manifest.modes.includes(command.minimumMode)) {
      errors.push(`manifest_mode_invalid:${id}:${command.minimumMode}`);
    }
    if (command.remote && command.safety !== SAFETY.REMOTE_GATED) {
      errors.push(`manifest_remote_not_gated:${id}`);
    }
    if (command.destructive && command.safety !== SAFETY.DESTRUCTIVE_GATED) {
      errors.push(`manifest_destructive_not_gated:${id}`);
    }
    if (
      command.safety === SAFETY.SAFE_LOCAL_CONTROL_PLANE_WRITE &&
      (!command.mutatesState || command.remote || command.destructive)
    ) {
      errors.push(`manifest_control_plane_write_invalid:${id}`);
    }
  }
  for (const inventory of manifest.migrationInventories ?? []) {
    if (
      !inventory?.target || !isSafeRepoPath(inventory?.root) ||
      !inventory.root.endsWith("supabase/migrations") ||
      typeof inventory.candidateFilenamePattern !== "string"
    ) {
      errors.push("manifest_migration_inventory_invalid");
      continue;
    }
    try {
      const pattern = new RegExp(inventory.candidateFilenamePattern);
      if (!pattern.test("20991231235959_valid_migration.sql")) {
        errors.push("manifest_migration_candidate_pattern_invalid");
      }
    } catch {
      errors.push("manifest_migration_candidate_pattern_invalid");
    }
    if (
      inventoryTargets.has(inventory.target) ||
      inventoryRoots.has(inventory.root)
    ) {
      errors.push("manifest_migration_inventory_duplicate");
    }
    inventoryTargets.add(inventory.target);
    inventoryRoots.add(inventory.root);
  }
  if (inventoryTargets.size < 1) {
    errors.push("manifest_migration_inventory_missing");
  }
  return [...new Set(errors)].sort();
}

export function buildPlan({
  paths,
  mode,
  manifest = VERIFY_MANIFEST,
}) {
  if (!manifest.modes.includes(mode)) {
    throw new Error(`unsupported_mode:${mode}`);
  }

  const selected = new Map();
  const gated = new Map();
  const unclassifiedPaths = [];
  const errors = validateManifest(manifest);

  const addCommand = (commandId, path = null, minimumMode = null) => {
    const command = manifest.commands[commandId];
    if (!command) {
      errors.push(`unknown_check:${commandId}${path ? `:${path}` : ""}`);
      return;
    }
    const requiredMode = minimumMode &&
        modeRank(minimumMode, manifest.modes) >
          modeRank(command.minimumMode, manifest.modes)
      ? minimumMode
      : command.minimumMode;
    if (
      modeRank(mode, manifest.modes) < modeRank(requiredMode, manifest.modes)
    ) return;
    const instance = materializeCommand(commandId, command, path);
    if (!instance) {
      errors.push(`invalid_check_template:${commandId}`);
      return;
    }
    if (!executableSafety(mode, command.safety, manifest.modes)) {
      gated.set(instance.dedupeKey, instance);
      return;
    }
    if (!instance.argv?.length) {
      errors.push(`safe_check_has_no_command:${commandId}`);
      return;
    }
    selected.set(instance.dedupeKey, instance);
  };

  for (const entry of manifest.globalChecks ?? []) {
    if (typeof entry === "string") addCommand(entry);
    else addCommand(entry.id, null, entry.minimumMode);
  }

  for (const path of paths) {
    if (!isSafeRepoPath(path)) {
      unclassifiedPaths.push(path || "<empty>");
      continue;
    }
    const rule = manifest.pathRules.find((candidate) =>
      matches(path, candidate.match)
    );
    if (!rule) {
      unclassifiedPaths.push(path);
      continue;
    }
    const commandIds = rule.checks ??
      (mode === "QUICK" ? rule.quick : rule.targeted);
    if (!Array.isArray(commandIds)) {
      errors.push(`invalid_rule_commands:${rule.id}:${mode}`);
      continue;
    }
    for (const commandId of commandIds) addCommand(commandId, path);
  }

  return {
    mode,
    paths: [...paths],
    selected: [...selected.values()],
    gated: [...gated.values()],
    unclassifiedPaths: [...new Set(unclassifiedPaths)].sort(),
    errors: [...new Set(errors)].sort(),
  };
}

function fileSha256(path, cwd = ROOT) {
  const bytes = readFileSync(resolve(cwd, path));
  return createHash("sha256").update(bytes).digest("hex");
}

export function inspectMigrationOmissions({
  cwd = ROOT,
  baseline = VERIFY_MANIFEST.migrationBaseline,
  inventories = VERIFY_MANIFEST.migrationInventories,
  ignoredPaths = null,
  untrackedPaths = null,
  trackedPaths = null,
  stagedPaths = null,
  missingPaths = null,
  inventoryPaths = null,
  changedPaths = null,
} = {}) {
  const migrationPathspecs = [
    ":(glob)**/supabase/migrations/*.sql",
    ":(glob)**/supabase/migrations/**/*.sql",
  ];
  const ignored = ignoredPaths ?? nulList(git([
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "-z",
    "--",
    ...migrationPathspecs,
  ], cwd));
  const untracked = untrackedPaths ?? nulList(git([
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...migrationPathspecs,
  ], cwd));
  const tracked = trackedPaths ?? nulList(git([
    "ls-files",
    "--cached",
    "-z",
    "--",
    ...migrationPathspecs,
  ], cwd));
  const staged = stagedPaths ?? nulList(git([
    "diff",
    "--cached",
    "--name-only",
    "--diff-filter=A",
    "-z",
    "--",
    ...migrationPathspecs,
  ], cwd));
  const missing = missingPaths ?? [...new Set([
    ...nulList(git([
      "diff",
      "--name-only",
      "--diff-filter=D",
      "-z",
      "--",
      ...migrationPathspecs,
    ], cwd)),
    ...nulList(git([
      "diff",
      "--cached",
      "--name-only",
      "--diff-filter=D",
      "-z",
      "--",
      ...migrationPathspecs,
    ], cwd)),
  ])];
  const changed = changedPaths ?? collectChangedPaths(cwd);
  const ignoredCandidates = [...new Set(ignored)]
    .filter((path) => path.endsWith(".sql"))
    .sort();
  const untrackedCandidates = [...new Set(untracked)]
    .filter((path) => path.endsWith(".sql"))
    .sort();
  const trackedCandidates = [...new Set(tracked)]
    .filter((path) => path.endsWith(".sql"))
    .sort();
  const stagedCandidates = [...new Set(staged)]
    .filter((path) => path.endsWith(".sql"))
    .sort();
  const missingCandidates = [...new Set(missing)]
    .filter((path) => path.endsWith(".sql"))
    .sort();
  const inventoriedPaths = [...new Set(
    inventoryPaths ?? [
      ...trackedCandidates,
      ...untrackedCandidates,
      ...ignoredCandidates,
    ],
  )].filter((path) => path.endsWith(".sql")).sort();
  const candidates = [...new Set([
    ...ignoredCandidates,
    ...untrackedCandidates,
  ])].sort();
  const exceptions = [];
  const unresolved = [];
  const omissions = [];
  const gitInclusionRequired = [];
  const gitVisibleCandidates = [];
  const stagedMigrationCandidates = [];
  const unresolvedBaseline = baseline.unresolved ?? {};

  const matchingInventories = (path) => inventories.filter((inventory) => {
    const prefix = `${inventory.root}/`;
    if (!path.startsWith(prefix)) return false;
    const relativePath = path.slice(prefix.length);
    return relativePath.length > 0 && !relativePath.includes("/");
  });
  const ambiguousCandidates = new Set(candidates.filter((path) =>
    matchingInventories(path).length !== 1
  ));
  for (const path of ambiguousCandidates) {
    omissions.push({ path, reason: "ambiguous_migration_workdir" });
  }

  const migrationShaped = changed.filter((path) =>
    /(?:^|\/)supabase\/migrations\/.*\.sql$/.test(path)
  );
  for (const path of migrationShaped) {
    if (
      matchingInventories(path).length !== 1 &&
      !ambiguousCandidates.has(path)
    ) {
      omissions.push({ path, reason: "ambiguous_migration_workdir" });
    }
  }

  for (const path of missingCandidates) {
    const matches = matchingInventories(path);
    if (matches.length !== 1) {
      if (!ambiguousCandidates.has(path)) {
        omissions.push({ path, reason: "ambiguous_migration_workdir" });
      }
      continue;
    }
    omissions.push({
      path,
      target: matches[0].target,
      reason: "missing_migration",
    });
  }

  const validateCommitCandidate = (path, inclusion) => {
    const matches = matchingInventories(path);
    if (matches.length !== 1) {
      if (!ambiguousCandidates.has(path)) {
        omissions.push({ path, reason: "ambiguous_migration_workdir" });
      }
      return;
    }
    const inventory = matches[0];
    const filename = basename(path);
    const filenamePattern = new RegExp(inventory.candidateFilenamePattern);
    if (!filenamePattern.test(filename)) {
      omissions.push({
        path,
        target: inventory.target,
        reason: "invalid_migration_candidate_name",
      });
      return;
    }
    if (inclusion === "UNTRACKED_VISIBLE" && !existsSync(resolve(cwd, path))) {
      omissions.push({
        path,
        target: inventory.target,
        reason: "missing_migration",
      });
      return;
    }
    const version = filename.slice(0, 14);
    const prefix = `${inventory.root}/`;
    const collisions = inventoriedPaths.filter((candidate) =>
      candidate !== path && candidate.startsWith(prefix) &&
      basename(candidate).startsWith(version)
    );
    if (collisions.length > 0) {
      omissions.push({
        path,
        target: inventory.target,
        reason: "migration_version_collision",
      });
      return;
    }
    const evidence = {
      path,
      target: inventory.target,
      reason: inclusion === "STAGED_NEW"
        ? "staged migration candidate"
        : "Git-visible untracked migration candidate",
    };
    if (inclusion === "STAGED_NEW") {
      stagedMigrationCandidates.push(evidence);
    } else {
      gitVisibleCandidates.push(evidence);
    }
  };

  for (const path of ignoredCandidates) {
    if (ambiguousCandidates.has(path)) continue;
    const hash = fileSha256(path, cwd);
    const exception = baseline.exceptions[path];
    if (exception) {
      if (hash === exception.sha256) {
        exceptions.push({ path, reason: exception.reason });
      } else {
        omissions.push({ path, reason: "baseline_exception_hash_changed" });
      }
      continue;
    }
    const open = unresolvedBaseline[path];
    if (open) {
      if (hash === open.sha256) {
        unresolved.push({ path, reason: open.reason });
      } else {
        omissions.push({ path, reason: "unresolved_baseline_hash_changed" });
      }
      continue;
    }
    omissions.push({ path, reason: "new_ignored_migration" });
  }

  for (const path of untrackedCandidates) {
    if (ambiguousCandidates.has(path)) continue;
    if (ignoredCandidates.includes(path)) continue;
    if (baseline.exceptions[path]) {
      omissions.push({ path, reason: "baseline_exception_not_ignored" });
      continue;
    }
    const open = unresolvedBaseline[path];
    if (open) {
      const hash = fileSha256(path, cwd);
      if (hash === open.sha256) {
        unresolved.push({ path, reason: open.reason });
      } else {
        omissions.push({ path, reason: "unresolved_baseline_hash_changed" });
      }
      continue;
    }
    validateCommitCandidate(path, "UNTRACKED_VISIBLE");
  }

  for (const path of stagedCandidates) {
    if (ignoredCandidates.includes(path)) {
      omissions.push({ path, reason: "staged_migration_is_ignored" });
      continue;
    }
    validateCommitCandidate(path, "STAGED_NEW");
  }

  for (const [path, expected] of Object.entries(baseline.exceptions)) {
    if (!ignoredCandidates.includes(path)) {
      omissions.push({ path, reason: "baseline_exception_missing" });
    } else if (!expected.reason) {
      omissions.push({ path, reason: "baseline_exception_reason_missing" });
    }
  }
  for (const [path, expected] of Object.entries(unresolvedBaseline)) {
    if (!candidates.includes(path)) {
      omissions.push({ path, reason: "unresolved_baseline_missing" });
    } else if (!expected.reason) {
      omissions.push({ path, reason: "unresolved_baseline_reason_missing" });
    }
  }

  return {
    inventories,
    candidates,
    exceptions,
    unresolved,
    omissions,
    gitInclusionRequired,
    gitVisibleCandidates,
    stagedMigrationCandidates,
    trackedMigrations: trackedCandidates,
  };
}

export function computeDiffHash(paths, cwd = ROOT) {
  const digest = createHash("sha256");
  for (const path of [...paths].sort()) {
    digest.update(`${path}\0`);
    try {
      digest.update(readFileSync(resolve(cwd, path)));
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      digest.update("<deleted>");
    }
    digest.update("\0");
  }
  return digest.digest("hex");
}

export function boundDiagnostic(value) {
  const lines = String(value ?? "")
    .replaceAll(ROOT, "<repo>")
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b(PGPASSWORD|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|JWT|TOKEN)\s*=\s*[^\s]+/gi, "$1=[REDACTED]")
    .split(/\r?\n/)
    .slice(0, MAX_DIAGNOSTIC_LINES)
    .join("\n");
  if (lines.length <= MAX_DIAGNOSTIC_CHARS) return lines;
  return `${lines.slice(0, MAX_DIAGNOSTIC_CHARS)}\n<diagnostic-truncated>`;
}

function defaultExecutor(check, cwd = ROOT) {
  const started = performance.now();
  const [command, ...args] = check.argv;
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: process.env,
  });
  return {
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Math.max(0, Math.round(performance.now() - started)),
  };
}

export function runChecks(plan, {
  cwd = ROOT,
  executor = defaultExecutor,
  dryRun = false,
} = {}) {
  const results = [];
  if (dryRun) return results;
  for (const check of plan.selected) {
    if (!executableSafety(plan.mode, check.safety) || !check.argv?.length) {
      results.push({
        id: check.id,
        status: "FAIL",
        exitCode: 96,
        durationMs: 0,
        diagnostic: "executor_rejected_non_safe_check",
      });
      break;
    }
    const result = executor(check, cwd);
    const markerCount = check.expectedMarker
      ? String(result.stdout ?? "").split(check.expectedMarker).length - 1
      : null;
    const passed = result.exitCode === 0 &&
      (markerCount === null || markerCount > 0);
    results.push({
      id: check.id,
      status: passed ? "PASS" : "FAIL",
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      markerCount,
      diagnostic: passed
        ? ""
        : boundDiagnostic(
          result.stderr || result.stdout || result.signal ||
            (markerCount === 0 ? "expected_marker_missing" : "check_failed"),
        ),
    });
    if (!passed) break;
  }
  return results;
}

function compactItems(items, formatter) {
  return items.length ? items.map(formatter).join(",") : "NONE";
}

export function statusExitCode(evidence) {
  if (evidence.status === "PASS") return 0;
  if (evidence.status === "GATED_REQUIRED") return 3;
  return 1;
}

export function formatEvidence(evidence, { json = false } = {}) {
  if (json) return `${JSON.stringify(evidence)}\n`;
  const lines = [
    `ENVAL_VERIFY_MODE=${evidence.mode}`,
    `ENVAL_VERIFY_STATUS=${evidence.status}`,
    `H3A_STATUS=${evidence.h3aStatus}`,
    `MODE=${evidence.mode}`,
    `PRE_COMMIT_GATE=${evidence.preCommitGate}`,
    `PRE_COMMIT_ONLY=${evidence.preCommitOnly ? "YES" : "NO"}`,
    `HEAD=${evidence.head}`,
    `DIFF_HASH=${evidence.diffHash}`,
    `SELECTED_CHECK_COUNT=${evidence.selectedCheckCount}`,
    `PASSED=${evidence.passed}`,
    `FAILED=${evidence.failed}`,
    `SKIPPED_GATED=${evidence.skippedGated}`,
    `UNCLASSIFIED_PATHS=${compactItems(evidence.unclassifiedPaths, (x) => x)}`,
    `MIGRATION_OMISSION=${evidence.migrationOmission}`,
    `MIGRATION_BASELINE_UNRESOLVED=${
      compactItems(
        evidence.migrationBaselineUnresolved,
        (x) => `${x.path}:${x.reason}`,
      )
    }`,
    `MIGRATION_BASELINE_EXCEPTIONS=${
      compactItems(
        evidence.migrationBaselineExceptions,
        (x) => `${x.path}:${x.reason}`,
      )
    }`,
    `MIGRATION_GIT_INCLUSION_REQUIRED=${compactItems(
      evidence.migrationGitInclusionRequired,
      (x) => `${x.path}:${x.reason}`,
    )}`,
    `MIGRATION_GIT_VISIBLE_CANDIDATES=${compactItems(
      evidence.migrationGitVisibleCandidates,
      (x) => `${x.path}:${x.target}`,
    )}`,
    `MIGRATION_STAGED_CANDIDATES=${compactItems(
      evidence.migrationStagedCandidates,
      (x) => `${x.path}:${x.target}`,
    )}`,
    `DURATION_MS=${evidence.durationMs}`,
    `TOTAL_DURATION_MS=${evidence.durationMs}`,
  ];
  const displayedChecks = evidence.status === "FAIL"
    ? evidence.checks.filter((check) => check.status === "FAIL")
    : evidence.checks;
  for (const check of displayedChecks) {
    if (check.status === "PASS") {
      const markers = check.markerCount === null
        ? ""
        : ` | markers=${check.markerCount}`;
      lines.push(`${check.id} | PASS | ${check.durationMs}ms${markers}`);
    } else {
      lines.push(`${check.id} | FAIL | exit=${check.exitCode}`);
      if (check.diagnostic) lines.push(check.diagnostic);
    }
  }
  if (evidence.planErrors.length) {
    lines.push(`PLAN_FAILURE=${evidence.planErrors.join(",")}`);
  }
  if (evidence.migrationOmissions.length) {
    lines.push(`MIGRATION_FAILURE=${
      compactItems(
        evidence.migrationOmissions,
        (x) => `${x.path}:${x.reason}`,
      )
    }`);
  }
  if (evidence.requiredReleaseGates.length) {
    lines.push(`GATED_REQUIRED=${evidence.requiredReleaseGates.join(",")}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseArgs(argv) {
  const parsed = {
    mode: null,
    dryRun: false,
    json: false,
    preCommitOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode") {
      parsed.mode = argv[index + 1]?.toUpperCase() ?? null;
      index += 1;
    } else if (argument === "--dry-run") {
      parsed.dryRun = true;
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument === "--pre-commit-only") {
      parsed.preCommitOnly = true;
    } else {
      throw new Error(`unknown_argument:${argument}`);
    }
  }
  if (!MODES.includes(parsed.mode)) {
    throw new Error(`--mode must be one of ${MODES.join(",")}`);
  }
  if (parsed.preCommitOnly && parsed.mode !== "INTEGRATION") {
    throw new Error("--pre-commit-only requires --mode INTEGRATION");
  }
  return parsed;
}

export function verify({
  mode,
  dryRun = false,
  preCommitOnly = false,
  cwd = ROOT,
  manifest = VERIFY_MANIFEST,
  executor = defaultExecutor,
} = {}) {
  const started = performance.now();
  const paths = collectChangedPaths(cwd);
  const plan = buildPlan({ paths, mode, manifest });
  const migration = inspectMigrationOmissions({
    cwd,
    baseline: manifest.migrationBaseline,
  });
  if (preCommitOnly && mode !== "INTEGRATION") {
    throw new Error("pre_commit_only_requires_integration_mode");
  }
  const checks = preCommitOnly
    ? []
    : runChecks(plan, { cwd, executor, dryRun });
  const failedChecks = checks.filter((check) => check.status === "FAIL");
  const failed = plan.unclassifiedPaths.length > 0 || plan.errors.length > 0 ||
    migration.omissions.length > 0 || failedChecks.length > 0;
  const requiredReleaseGates = plan.gated
    .filter((check) => check.requiredForRelease)
    .map((check) => check.id)
    .sort();
  const status = failed
    ? "FAIL"
    : mode === "RELEASE" && requiredReleaseGates.length > 0
    ? "GATED_REQUIRED"
    : "PASS";
  const preCommitGate = mode === "INTEGRATION"
    ? status
    : mode === "RELEASE"
    ? status === "PASS" ? "PASS" : status
    : "NOT_APPLICABLE";
  return {
    mode,
    status,
    preCommitGate,
    h3aStatus: failed
      ? "FAIL"
      : migration.unresolved.length > 0
      ? "PARTIAL"
      : "PASS",
    head: git(["rev-parse", "--short", "HEAD"], cwd).trim(),
    diffHash: computeDiffHash(paths, cwd),
    selectedCheckCount: preCommitOnly ? 0 : plan.selected.length,
    passed: checks.filter((check) => check.status === "PASS").length,
    failed: failedChecks.length + plan.unclassifiedPaths.length +
      plan.errors.length + migration.omissions.length,
    skippedGated: plan.gated.length,
    unclassifiedPaths: plan.unclassifiedPaths,
    migrationOmission: migration.omissions.length
      ? "FAIL"
      : migration.unresolved.length
      ? "BASELINE_UNRESOLVED"
      : migration.gitInclusionRequired.length
      ? "GIT_INCLUSION_REQUIRED"
      : "PASS",
    migrationBaselineUnresolved: migration.unresolved,
    migrationBaselineExceptions: migration.exceptions,
    migrationGitInclusionRequired: migration.gitInclusionRequired,
    migrationGitVisibleCandidates: migration.gitVisibleCandidates,
    migrationStagedCandidates: migration.stagedMigrationCandidates,
    migrationOmissions: migration.omissions,
    requiredReleaseGates,
    planErrors: plan.errors,
    checks,
    dryRun,
    preCommitOnly,
    durationMs: Math.max(0, Math.round(performance.now() - started)),
  };
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const evidence = verify(options);
    process.stdout.write(formatEvidence(evidence, options));
    return statusExitCode(evidence);
  } catch (error) {
    process.stderr.write(
      `ENVAL_VERIFY_STATUS=FAIL\n${boundDiagnostic(error)}\n`,
    );
    return 2;
  }
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) process.exitCode = main();

export { ROOT };
