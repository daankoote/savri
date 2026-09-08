#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const RESULT_PROJECT = "ENVAL";
export const WORKSPACE_ROLES = Object.freeze({
  MAIN_INTEGRATION: "MAIN_INTEGRATION",
  BEHEER_PRODUCT: "BEHEER_PRODUCT",
  SETUP_GOVERNANCE: "SETUP_GOVERNANCE",
});
export const ENVAL_WORKSPACE_REGISTRY = Object.freeze({
  Main: Object.freeze({
    root: "/Users/daankoote/dev/enval",
    branch: "main",
    role: WORKSPACE_ROLES.MAIN_INTEGRATION,
  }),
  _Setup: Object.freeze({
    root: "/Users/daankoote/dev/enval-worktrees/setup",
    slug: "setup",
    branch: "setup",
    agentName: "enval-setup",
    role: WORKSPACE_ROLES.SETUP_GOVERNANCE,
  }),
  Beheer: Object.freeze({
    root: "/Users/daankoote/dev/enval-worktrees/beheer",
    slug: "beheer",
    branch: "beheer",
    agentName: "enval-beheer",
    role: WORKSPACE_ROLES.BEHEER_PRODUCT,
  }),
});
export const RESULT_WORKSPACES = Object.freeze(
  Object.keys(ENVAL_WORKSPACE_REGISTRY),
);
export const TERMINAL_STATUSES = Object.freeze([
  "PASS",
  "PARTIAL",
  "FAIL",
  "HUMAN_GATE",
  "BLOCKED",
  "INTERRUPTED",
  "TIMEOUT",
]);
export const DEFAULT_RESULT_ROOT = join(
  homedir(),
  ".herdr-results",
  RESULT_PROJECT,
);
const WORKSPACE_BY_ROOT = Object.freeze(Object.fromEntries(
  Object.entries(ENVAL_WORKSPACE_REGISTRY).map(([workspace, binding]) => [
    binding.root,
    workspace,
  ]),
));
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
const SHA_PATTERN = /^[a-f0-9]{40,64}$/;
const SETUP_TOOL_PATHS = Object.freeze([
  "scripts/tools/deno-app-proof.json",
  "scripts/tools/deno-browser-proof.json",
  "scripts/tools/enval-batch.mjs",
  "scripts/tools/enval-local-dev.mjs",
  "scripts/tools/enval-migration-chain-manifest.mjs",
  "scripts/tools/enval-preview-dependency-bridge.mjs",
  "scripts/tools/enval-preview.mjs",
  "scripts/tools/enval-primary-runtime.mjs",
  "scripts/tools/enval-readonly-sql.mjs",
  "scripts/tools/enval-result.mjs",
  "scripts/tools/enval-supabase-target.mjs",
  "scripts/tools/enval-ui-review-collect.mjs",
  "scripts/tools/enval-ui-review-loop.mjs",
  "scripts/tools/enval-ui-review-result.schema.json",
  "scripts/tools/enval-ui-review.mjs",
  "scripts/tools/enval-verify-manifest.mjs",
  "scripts/tools/enval-verify-ownership.mjs",
  "scripts/tools/enval-verify.mjs",
]);
const SETUP_PROOF_PATHS = Object.freeze([
  "scripts/proofs/enval-archived-migration-reference.proof.mjs",
  "scripts/proofs/enval-batch.proof.mjs",
  "scripts/proofs/enval-local-dev.proof.mjs",
  "scripts/proofs/enval-local-readonly-catalog.proof.sql",
  "scripts/proofs/enval-local-readonly-inspection.proof.mjs",
  "scripts/proofs/enval-migration-chain.proof.mjs",
  "scripts/proofs/enval-preview.proof.mjs",
  "scripts/proofs/enval-readonly-sql.proof.mjs",
  "scripts/proofs/enval-result.proof.mjs",
  "scripts/proofs/enval-ui-review.proof.mjs",
  "scripts/proofs/enval-verify-ownership.proof.mjs",
  "scripts/proofs/enval-verify-runner.proof.mjs",
]);

export class ResultPublicationError extends Error {
  constructor(code) {
    super(code);
    this.name = "ResultPublicationError";
    this.code = code;
  }
}

function fail(code) {
  throw new ResultPublicationError(code);
}

function repositoryPath(relativePath) {
  if (
    typeof relativePath !== "string" || relativePath.length === 0 ||
    relativePath.startsWith("/") || relativePath.includes("\\") ||
    relativePath.split("/").some((part) =>
      part === "" || part === "." || part === ".."
    )
  ) fail("workspace_path_invalid");
  return relativePath;
}

function within(relativePath, directory) {
  return relativePath.startsWith(`${directory}/`);
}

export function roleOwnsPath(role, candidatePath) {
  const relativePath = repositoryPath(candidatePath);
  if (role === WORKSPACE_ROLES.MAIN_INTEGRATION) return false;
  if (role === WORKSPACE_ROLES.SETUP_GOVERNANCE) {
    return relativePath === "AGENTS.md" || within(relativePath, ".codex") ||
      within(relativePath, "docs/app/operations") ||
      SETUP_TOOL_PATHS.includes(relativePath) ||
      SETUP_PROOF_PATHS.includes(relativePath);
  }
  if (role === WORKSPACE_ROLES.BEHEER_PRODUCT) {
    return within(relativePath, "app") || within(relativePath, "supabase") ||
      (within(relativePath, "docs/app") &&
        !within(relativePath, "docs/app/operations")) ||
      (within(relativePath, "scripts/proofs") &&
        !SETUP_PROOF_PATHS.includes(relativePath));
  }
  fail("workspace_role_invalid");
}

export function validateWorkspacePaths(role, paths) {
  if (!Object.values(WORKSPACE_ROLES).includes(role)) {
    fail("workspace_role_invalid");
  }
  const checkedPaths = [...new Set(paths)].sort();
  for (const relativePath of checkedPaths) {
    if (!roleOwnsPath(role, relativePath)) {
      fail(`workspace_role_path_refused:${role}:${relativePath}`);
    }
  }
  return Object.freeze(checkedPaths);
}

function defaultRun(command, args, options) {
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    timeout: 10_000,
  });
}

function gitText(run, root, args, code) {
  const result = run("git", ["-C", root, ...args], { cwd: root });
  if (result.error || result.status !== 0) fail(code);
  return String(result.stdout ?? "");
}

function nulPaths(output) {
  if (output === "") return [];
  if (!output.endsWith("\0")) fail("workspace_git_state_invalid");
  return output.slice(0, -1).split("\0").map(repositoryPath);
}

function workspacePathSets(run, root, options = {}) {
  const unstaged = nulPaths(gitText(
    run,
    root,
    ["diff", "--no-renames", "--name-only", "-z"],
    "workspace_unstaged_inspection_failed",
  ));
  const staged = nulPaths(gitText(
    run,
    root,
    ["diff", "--cached", "--no-renames", "--name-only", "-z"],
    "workspace_index_inspection_failed",
  ));
  const untracked = options.includeUntracked
    ? nulPaths(gitText(
      run,
      root,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      "workspace_untracked_inspection_failed",
    ))
    : [];
  return Object.freeze({
    tracked: Object.freeze([...new Set(unstaged)].sort()),
    index: Object.freeze([...new Set(staged)].sort()),
    untracked: Object.freeze([...new Set(untracked)].sort()),
  });
}

function changedPaths(run, root, options = {}) {
  const sets = workspacePathSets(run, root, options);
  return Object.freeze([
    ...new Set([...sets.tracked, ...sets.index, ...sets.untracked]),
  ].sort());
}

export function validateWorkspaceState(run, root, workspaceName, options = {}) {
  const binding = ENVAL_WORKSPACE_REGISTRY[workspaceName];
  if (!binding) fail("workspace_not_approved");
  const branch = gitText(
    run,
    root,
    ["branch", "--show-current"],
    "workspace_branch_inspection_failed",
  ).trim();
  if (branch !== binding.branch) {
    fail(`workspace_branch_mismatch:${workspaceName}`);
  }
  const paths = changedPaths(run, root, options);
  validateWorkspacePaths(binding.role, paths);
  return Object.freeze({ role: binding.role, branch, paths });
}

function validateWorkspace(workspace) {
  if (!RESULT_WORKSPACES.includes(workspace)) fail("result_workspace_invalid");
  return workspace;
}

function validateRunId(runId) {
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    fail("result_run_id_invalid");
  }
  return runId;
}

function validateTimestamp(value, code) {
  if (
    typeof value !== "string" || value.length > 40 ||
    Number.isNaN(Date.parse(value))
  ) fail(code);
  return value;
}

function normalizeTasklabel(tasklabel) {
  if (typeof tasklabel !== "string" || tasklabel.includes("\0")) {
    fail("result_tasklabel_invalid");
  }
  const normalized = tasklabel.replace(/\s+/g, " ").trim();
  if (normalized.length === 0 || normalized.length > 120) {
    fail("result_tasklabel_invalid");
  }
  return normalized;
}

function safeOptional(value, pattern = null) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.includes("\0") || value.length > 160) {
    fail("result_metadata_invalid");
  }
  if (pattern && !pattern.test(value)) fail("result_metadata_invalid");
  return value;
}

function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function atomicWrite(path, contents) {
  const directory = dirname(path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, contents, { flag: "wx", mode: 0o600 });
    renameSync(temporary, path);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary may not have been created or may already have been renamed.
    }
    throw error;
  }
  chmodSync(path, 0o600);
}

function serialized(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function workspaceResultPaths(
  workspace,
  runId,
  resultRoot = DEFAULT_RESULT_ROOT,
) {
  validateWorkspace(workspace);
  validateRunId(runId);
  const workspaceRoot = join(resultRoot, workspace);
  const runRoot = join(workspaceRoot, "runs", runId);
  return Object.freeze({
    workspaceRoot,
    active: join(workspaceRoot, "active.json"),
    latest: join(workspaceRoot, "latest.txt"),
    runRoot,
    context: join(runRoot, "context.json"),
    finalizing: join(runRoot, ".finalizing"),
    history: join(runRoot, "result.txt"),
    projectLatest: join(resultRoot, "latest.txt"),
  });
}

export function workspaceForCwd(cwd) {
  if (typeof cwd !== "string" || cwd === "") return null;
  return WORKSPACE_BY_ROOT[resolve(cwd)] ?? null;
}

function sha256(...values) {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value);
  return hash.digest("hex");
}

function worktreePathHash(root, relativePath) {
  const path = join(root, repositoryPath(relativePath));
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return sha256("missing\0");
    throw error;
  }
  if (status.isSymbolicLink()) {
    return sha256("symlink\0", readlinkSync(path));
  }
  if (!status.isFile()) fail("workspace_scope_path_type_invalid");
  return sha256("file\0", readFileSync(path));
}

export function captureWorkspaceBaseline(workspace, root) {
  const binding = ENVAL_WORKSPACE_REGISTRY[workspace];
  if (!binding) fail("workspace_not_approved");
  let canonicalRoot;
  try {
    canonicalRoot = realpathSync(resolve(root));
  } catch {
    fail("workspace_scope_root_invalid");
  }
  const branch = gitText(
    defaultRun,
    canonicalRoot,
    ["branch", "--show-current"],
    "workspace_branch_inspection_failed",
  ).trim();
  if (branch !== binding.branch) fail(`workspace_branch_mismatch:${workspace}`);
  const head = gitText(
    defaultRun,
    canonicalRoot,
    ["rev-parse", "--verify", "HEAD^{commit}"],
    "workspace_head_inspection_failed",
  ).trim();
  if (!SHA_PATTERN.test(head)) fail("workspace_head_invalid");
  const paths = workspacePathSets(defaultRun, canonicalRoot, {
    includeUntracked: true,
  });
  validateWorkspacePaths(binding.role, [...paths.tracked, ...paths.index]);
  if (workspace !== "Main") {
    validateWorkspacePaths(binding.role, paths.untracked);
  }
  return Object.freeze({
    schemaVersion: 1,
    workspace,
    root: canonicalRoot,
    branch,
    head,
    untracked: Object.freeze(
      workspace === "Main"
        ? paths.untracked.map((path) =>
          Object.freeze({ path, sha256: worktreePathHash(canonicalRoot, path) })
        )
        : [],
    ),
  });
}

function validatePublicationScope(baseline, workspace) {
  if (
    baseline?.schemaVersion !== 1 ||
    baseline.workspace !== workspace ||
    !ENVAL_WORKSPACE_REGISTRY[baseline.workspace] ||
    typeof baseline.root !== "string"
  ) fail("workspace_scope_baseline_invalid");
  const current = captureWorkspaceBaseline(baseline.workspace, baseline.root);
  if (baseline.workspace === "Main") {
    const before = new Map(baseline.untracked.map((entry) => [
      entry.path,
      entry.sha256,
    ]));
    const after = new Map(current.untracked.map((entry) => [
      entry.path,
      entry.sha256,
    ]));
    const drift = [...new Set([...before.keys(), ...after.keys()])]
      .sort()
      .find((path) => before.get(path) !== after.get(path));
    if (drift) fail(`workspace_untracked_baseline_drift:Main:${drift}`);
  }
  return current;
}

function gitMetadata(cwd) {
  const read = (args) => {
    const result = spawnSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      shell: false,
      timeout: 3_000,
    });
    return result.status === 0 ? String(result.stdout ?? "").trim() : "";
  };
  const branch = read(["branch", "--show-current"]);
  const startHead = read(["rev-parse", "--verify", "HEAD^{commit}"]);
  return Object.freeze({
    branch: safeOptional(branch),
    startHead: SHA_PATTERN.test(startHead) ? startHead : null,
  });
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    fail("result_state_invalid");
  }
}

function publicContext({ scopeBaseline: _scopeBaseline, ...context }) {
  return context;
}

function pendingEnvelope(context) {
  return Object.freeze({ ...publicContext(context), resultState: "PENDING" });
}

export function beginResultRun(input, options = {}) {
  const resultRoot = options.resultRoot ?? DEFAULT_RESULT_ROOT;
  const workspace = validateWorkspace(input.workspace);
  const runId = validateRunId(input.runId ?? randomUUID());
  const startedAt = validateTimestamp(
    input.startedAt ?? new Date().toISOString(),
    "result_started_at_invalid",
  );
  const inferredScopeRoot = workspaceForCwd(input.cwd) === workspace
    ? input.cwd
    : null;
  const scopeRoot = options.captureScopeBaseline === false
    ? null
    : options.scopeRoot ?? inferredScopeRoot;
  if (options.requireScopeBaseline === true && scopeRoot === null) {
    fail("workspace_scope_baseline_required");
  }
  const scopeBaseline = scopeRoot === null
    ? null
    : captureWorkspaceBaseline(workspace, scopeRoot);
  const metadata = scopeBaseline
    ? { branch: scopeBaseline.branch, startHead: scopeBaseline.head }
    : input.cwd
    ? gitMetadata(input.cwd)
    : {};
  const context = Object.freeze({
    schemaVersion: 1,
    project: RESULT_PROJECT,
    workspace,
    runId,
    tasklabel: normalizeTasklabel(input.tasklabel),
    startedAt,
    branch: safeOptional(
      scopeBaseline?.branch ?? input.branch ?? metadata.branch,
    ),
    startHead: safeOptional(
      scopeBaseline?.head ?? input.startHead ?? metadata.startHead,
      SHA_PATTERN,
    ),
    scopeBaseline,
  });
  const paths = workspaceResultPaths(workspace, runId, resultRoot);
  mkdirSync(join(paths.workspaceRoot, "runs"), {
    recursive: true,
    mode: 0o700,
  });
  const active = readJson(paths.active);
  if (active && active.runId !== runId) {
    finalizeActiveRun(workspace, "INTERRUPTED", {
      resultRoot,
      finishedAt: startedAt,
      stopDescription: "A newer run replaced this unfinished run.",
      mirrorProjectLatest: options.mirrorProjectLatest,
    });
  }
  try {
    mkdirSync(paths.runRoot, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = readJson(paths.context);
    if (JSON.stringify(existing) !== JSON.stringify(context)) {
      fail("result_run_id_conflict");
    }
    if (exists(paths.history)) fail("result_run_already_finalized");
  }
  if (!exists(paths.context)) atomicWrite(paths.context, serialized(context));
  atomicWrite(paths.active, serialized(context));
  const pending = serialized(pendingEnvelope(context));
  atomicWrite(paths.latest, pending);
  if (options.mirrorProjectLatest === true) {
    atomicWrite(paths.projectLatest, pending);
  }
  return Object.freeze({ context, paths });
}

function validateFinalText(value, code) {
  if (value === null || value === undefined) return null;
  if (
    typeof value !== "string" || value.includes("\0") ||
    value.length === 0 || value.length > 32 * 1024
  ) fail(code);
  return value.endsWith("\n") ? value : `${value}\n`;
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function releaseFinalizerLock(path) {
  try {
    unlinkSync(path);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function acquireFinalizerLock(path) {
  try {
    writeFileSync(path, `${JSON.stringify({ pid: process.pid })}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  const owner = readJson(path);
  if (processIsAlive(owner?.pid)) return false;
  releaseFinalizerLock(path);
  try {
    writeFileSync(path, `${JSON.stringify({ pid: process.pid })}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  }
}

export function finalizeActiveRun(workspace, terminalStatus, options = {}) {
  const resultRoot = options.resultRoot ?? DEFAULT_RESULT_ROOT;
  validateWorkspace(workspace);
  if (!TERMINAL_STATUSES.includes(terminalStatus)) {
    fail("result_terminal_status_invalid");
  }
  const workspaceRoot = join(resultRoot, workspace);
  const activePath = join(workspaceRoot, "active.json");
  const context = readJson(activePath);
  if (!context) return null;
  validateRunId(context.runId);
  if (context.workspace !== workspace || context.project !== RESULT_PROJECT) {
    fail("result_active_context_invalid");
  }
  const paths = workspaceResultPaths(workspace, context.runId, resultRoot);
  const finalReturn = validateFinalText(
    options.finalReturn,
    "result_return_invalid",
  );
  const stopDescription = validateFinalText(
    options.stopDescription,
    "result_stop_description_invalid",
  );
  if ((finalReturn === null) === (stopDescription === null)) {
    fail("result_final_payload_invalid");
  }
  const envelope = Object.freeze({
    ...publicContext(context),
    finishedAt: validateTimestamp(
      options.finishedAt ?? new Date().toISOString(),
      "result_finished_at_invalid",
    ),
    terminalStatus,
    finalReturn,
    stopDescription,
  });
  const finish = (finalEnvelope, finalContents) => {
    atomicWrite(paths.latest, finalContents);
    if (options.mirrorProjectLatest === true) {
      atomicWrite(paths.projectLatest, finalContents);
    }
    const current = readJson(activePath);
    if (current?.runId === context.runId) {
      renameSync(activePath, join(paths.runRoot, "active-finalized.json"));
    }
    return Object.freeze({ envelope: finalEnvelope, paths });
  };
  if (!acquireFinalizerLock(paths.finalizing)) return null;
  try {
    if (exists(paths.history)) {
      const existing = readJson(paths.history);
      return finish(existing, serialized(existing));
    }
    let finalEnvelope = envelope;
    try {
      if (context.scopeBaseline) {
        validatePublicationScope(context.scopeBaseline, workspace);
      } else if (options.requireScopeBaseline === true) {
        fail("workspace_scope_baseline_required");
      }
    } catch (error) {
      const code = error instanceof ResultPublicationError
        ? error.code
        : "workspace_scope_validation_failed";
      finalEnvelope = Object.freeze({
        ...envelope,
        terminalStatus: "FAIL",
        finalReturn: null,
        stopDescription: `Workspace role validation failed: ${code}`,
      });
    }
    const finalContents = serialized(finalEnvelope);
    atomicWrite(paths.history, finalContents);
    return finish(finalEnvelope, finalContents);
  } finally {
    releaseFinalizerLock(paths.finalizing);
  }
}

export function terminalStatusFromReturn(value) {
  if (typeof value !== "string") return null;
  const leading = value.trimStart().match(
    /^(PASS|PARTIAL|FAIL|HUMAN_GATE|BLOCKED|INTERRUPTED|TIMEOUT)(?:\b|\s*[:—-])/,
  );
  if (leading) return leading[1];
  const matches = [...value.matchAll(
    /(?:^|\n)(?:[A-Z][A-Z0-9_]*_STATUS|STATUS)=(PASS|PARTIAL|FAIL|HUMAN_GATE|BLOCKED|INTERRUPTED|TIMEOUT)(?=\n|$)/g,
  )];
  return matches.at(-1)?.[1] ?? null;
}

function hookRunId(event) {
  const components = [event?.session_id, event?.turn_id]
    .filter((value) => typeof value === "string" && value !== "")
    .map((value) => value.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 72));
  return components.length > 0
    ? components.join("-").slice(0, 160)
    : randomUUID();
}

function hookTasklabel(prompt) {
  if (typeof prompt !== "string") return "codex-turn";
  const explicit = prompt.match(/^TASKLABEL\s*[:=]\s*(.+)$/mi)?.[1];
  const goal = prompt.match(/^GOAL\s*\n+\s*([^\n]+)/mi)?.[1];
  const candidate = (explicit ?? goal ?? "codex-turn")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return candidate || "codex-turn";
}

export function handleResultHook(event, options = {}) {
  const workspace = options.workspace ?? workspaceForCwd(event?.cwd);
  if (!workspace) fail("result_workspace_unresolved");
  const shared = {
    resultRoot: options.resultRoot,
    mirrorProjectLatest: options.mirrorProjectLatest === true,
    requireScopeBaseline: true,
    scopeRoot: options.scopeRoot,
  };
  if (event?.hook_event_name === "UserPromptSubmit") {
    return beginResultRun({
      workspace,
      runId: hookRunId(event),
      tasklabel: options.tasklabel ?? hookTasklabel(event.prompt),
      startedAt: options.startedAt,
      cwd: event.cwd,
    }, shared);
  }
  if (event?.hook_event_name === "Stop") {
    const finalReturn = typeof event.last_assistant_message === "string"
      ? event.last_assistant_message
      : "";
    const terminalStatus = terminalStatusFromReturn(finalReturn);
    return finalizeActiveRun(workspace, terminalStatus ?? "BLOCKED", {
      ...shared,
      finalReturn: terminalStatus ? finalReturn : null,
      stopDescription: terminalStatus
        ? null
        : "Codex stopped without a recognized terminal RETURN status.",
    });
  }
  if (event?.hook_event_name === "Interrupt") {
    const status = options.terminalStatus ?? "INTERRUPTED";
    return finalizeActiveRun(workspace, status, {
      ...shared,
      stopDescription: status === "HUMAN_GATE"
        ? "The ENVAL permission hook stopped a human-gated action."
        : "Codex reported an interrupted run.",
    });
  }
  if (event?.hook_event_name === "SessionEnd") {
    const reason = String(event.reason ?? "").toLowerCase();
    const status = reason.includes("timeout")
      ? "TIMEOUT"
      : reason.includes("interrupt") || reason.includes("cancel")
      ? "INTERRUPTED"
      : "FAIL";
    return finalizeActiveRun(workspace, status, {
      ...shared,
      stopDescription: `Codex session ended before a terminal RETURN (${
        reason || "unknown reason"
      }).`,
    });
  }
  return null;
}

function notificationPrompt(inputMessages) {
  if (!Array.isArray(inputMessages)) return "";
  return inputMessages
    .filter((value) => typeof value === "string")
    .join("\n")
    .slice(0, 32 * 1024);
}

function republishExistingNotification(workspace, runId, resultRoot) {
  const paths = workspaceResultPaths(workspace, runId, resultRoot);
  const existing = readJson(paths.history);
  if (!existing) return null;
  const active = readJson(paths.active);
  const latest = readJson(paths.latest);
  const latestBelongsToRun = latest?.runId === runId;
  if (active?.runId === runId) {
    const recovered = finalizeActiveRun(workspace, existing.terminalStatus, {
      resultRoot,
      requireScopeBaseline: true,
      finalReturn: existing.finalReturn,
      stopDescription: existing.stopDescription,
    });
    if (recovered) {
      return Object.freeze({
        ...recovered,
        alreadyFinalized: true,
        latestPreserved: false,
      });
    }
  }
  return Object.freeze({
    envelope: existing,
    paths,
    alreadyFinalized: true,
    latestPreserved: !latestBelongsToRun,
  });
}

export function handleResultNotification(payload, options = {}) {
  if (payload?.type !== "agent-turn-complete") {
    fail("result_notification_invalid");
  }
  if (
    typeof payload["thread-id"] !== "string" ||
    payload["thread-id"] === "" ||
    typeof payload["turn-id"] !== "string" ||
    payload["turn-id"] === ""
  ) fail("result_notification_invalid");
  const workspace = options.workspace ?? workspaceForCwd(payload.cwd);
  if (!workspace) fail("result_workspace_unresolved");
  const event = {
    session_id: payload["thread-id"],
    turn_id: payload["turn-id"],
  };
  const runId = hookRunId(event);
  const resultRoot = options.resultRoot ?? DEFAULT_RESULT_ROOT;
  const existing = republishExistingNotification(
    workspace,
    runId,
    resultRoot,
  );
  if (existing) return existing;

  const workspaceRoot = join(resultRoot, workspace);
  const active = readJson(join(workspaceRoot, "active.json"));
  if (active?.runId !== runId) {
    try {
      beginResultRun({
        workspace,
        runId,
        tasklabel: options.tasklabel ?? hookTasklabel(
          notificationPrompt(payload["input-messages"]),
        ),
        startedAt: options.startedAt,
        cwd: payload.cwd,
      }, {
        resultRoot,
        mirrorProjectLatest: options.mirrorProjectLatest === true,
        captureScopeBaseline: false,
      });
    } catch (error) {
      if (error?.code !== "result_run_already_finalized") throw error;
      const published = republishExistingNotification(
        workspace,
        runId,
        resultRoot,
      );
      if (!published) throw error;
      return published;
    }
  }

  const finalReturn = typeof payload["last-assistant-message"] === "string"
    ? payload["last-assistant-message"]
    : "";
  const terminalStatus = terminalStatusFromReturn(finalReturn);
  return finalizeActiveRun(workspace, terminalStatus ?? "BLOCKED", {
    resultRoot,
    mirrorProjectLatest: options.mirrorProjectLatest === true,
    requireScopeBaseline: true,
    finalReturn: terminalStatus ? finalReturn : null,
    stopDescription: terminalStatus
      ? null
      : "Codex completed without a recognized terminal RETURN status.",
  });
}
