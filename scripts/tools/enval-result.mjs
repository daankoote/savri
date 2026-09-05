#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const RESULT_PROJECT = "ENVAL";
export const RESULT_WORKSPACES = Object.freeze(["Main", "_Setup", "Beheer"]);
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
const WORKSPACE_BY_ROOT = Object.freeze({
  "/Users/daankoote/dev/enval": "Main",
  "/Users/daankoote/dev/enval-worktrees/setup": "_Setup",
  "/Users/daankoote/dev/enval-worktrees/beheer": "Beheer",
});
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
const SHA_PATTERN = /^[a-f0-9]{40,64}$/;

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

function pendingEnvelope(context) {
  return Object.freeze({
    schemaVersion: 1,
    project: RESULT_PROJECT,
    workspace: context.workspace,
    runId: context.runId,
    tasklabel: context.tasklabel,
    startedAt: context.startedAt,
    resultState: "PENDING",
    branch: context.branch,
    startHead: context.startHead,
  });
}

export function beginResultRun(input, options = {}) {
  const resultRoot = options.resultRoot ?? DEFAULT_RESULT_ROOT;
  const workspace = validateWorkspace(input.workspace);
  const runId = validateRunId(input.runId ?? randomUUID());
  const startedAt = validateTimestamp(
    input.startedAt ?? new Date().toISOString(),
    "result_started_at_invalid",
  );
  const metadata = input.cwd ? gitMetadata(input.cwd) : {};
  const context = Object.freeze({
    schemaVersion: 1,
    project: RESULT_PROJECT,
    workspace,
    runId,
    tasklabel: normalizeTasklabel(input.tasklabel),
    startedAt,
    branch: safeOptional(input.branch ?? metadata.branch),
    startHead: safeOptional(input.startHead ?? metadata.startHead, SHA_PATTERN),
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
    schemaVersion: 1,
    project: RESULT_PROJECT,
    workspace,
    runId: context.runId,
    tasklabel: context.tasklabel,
    startedAt: context.startedAt,
    finishedAt: validateTimestamp(
      options.finishedAt ?? new Date().toISOString(),
      "result_finished_at_invalid",
    ),
    terminalStatus,
    branch: context.branch ?? null,
    startHead: context.startHead ?? null,
    finalReturn,
    stopDescription,
  });
  const contents = serialized(envelope);
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
  if (exists(paths.history)) {
    const existing = readJson(paths.history);
    return finish(existing, serialized(existing));
  }
  if (!acquireFinalizerLock(paths.finalizing)) return null;
  try {
    if (exists(paths.history)) {
      const existing = readJson(paths.history);
      return finish(existing, serialized(existing));
    }
    atomicWrite(paths.history, contents);
    return finish(envelope, contents);
  } finally {
    releaseFinalizerLock(paths.finalizing);
  }
}

export function terminalStatusFromReturn(value) {
  if (typeof value !== "string") return null;
  const leading = value.trimStart().match(
    /^(PASS|PARTIAL|FAIL|HUMAN_GATE|BLOCKED|INTERRUPTED|TIMEOUT)(?:\b|\s*[:—-])/
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
  return components.length > 0 ? components.join("-").slice(0, 160) : randomUUID();
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
  if (!workspace) return null;
  const shared = {
    resultRoot: options.resultRoot,
    mirrorProjectLatest: options.mirrorProjectLatest === true,
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
      stopDescription: `Codex session ended before a terminal RETURN (${reason || "unknown reason"}).`,
    });
  }
  return null;
}
