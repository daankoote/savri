import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { routeEvent } from "../../.codex/hooks/enval-permission-router.mjs";
import { CLASSIFICATION, ROOT } from "../../.codex/hooks/command-classifier.mjs";
import {
  beginResultRun,
  finalizeActiveRun,
  handleResultHook,
  terminalStatusFromReturn,
  workspaceResultPaths,
} from "../tools/enval-result.mjs";

const roots = [];

after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function root() {
  const value = mkdtempSync(join(tmpdir(), "enval-result-proof-"));
  roots.push(value);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function publish(resultRoot, workspace, runId, terminalStatus) {
  const startedAt = "2026-09-05T10:00:00.000Z";
  beginResultRun({
    workspace,
    runId,
    tasklabel: `${workspace.toLowerCase()}-proof`,
    startedAt,
    branch: workspace === "Main" ? "main" : workspace.toLowerCase(),
    startHead: "a".repeat(40),
  }, { resultRoot });
  return finalizeActiveRun(workspace, terminalStatus, {
    resultRoot,
    finishedAt: "2026-09-05T10:01:00.000Z",
    finalReturn: `RESULT_STATUS=${terminalStatus}\n`,
  });
}

test("PASS publishes Main latest plus exclusive immutable run history", () => {
  const resultRoot = root();
  const published = publish(resultRoot, "Main", "main-pass", "PASS");
  const latest = readJson(published.paths.latest);
  const history = readJson(published.paths.history);
  assert.deepEqual(latest, history);
  assert.equal(latest.project, "ENVAL");
  assert.equal(latest.workspace, "Main");
  assert.equal(latest.runId, "main-pass");
  assert.equal(latest.tasklabel, "main-proof");
  assert.equal(latest.terminalStatus, "PASS");
  assert.equal(latest.branch, "main");
  assert.equal(latest.startHead, "a".repeat(40));
  assert.equal(finalizeActiveRun("Main", "FAIL", { resultRoot }), null);
  assert.equal(readJson(published.paths.history).terminalStatus, "PASS");
  assert.deepEqual(
    readdirSync(published.paths.runRoot).sort(),
    ["active-finalized.json", "context.json", "result.txt"],
  );
  assert.deepEqual(
    readdirSync(published.paths.workspaceRoot).sort(),
    ["latest.txt", "runs"],
  );
});

test("status parsing prefers a leading verdict and otherwise the final marker", () => {
  assert.equal(
    terminalStatusFromReturn("PARTIAL\nCHECK_STATUS=PASS\n"),
    "PARTIAL",
  );
  assert.equal(
    terminalStatusFromReturn("CHECK_STATUS=PASS\nFINAL_STATUS=FAIL\n"),
    "FAIL",
  );
});

test("invalid final payload cannot strand the run lock", () => {
  const resultRoot = root();
  beginResultRun({
    workspace: "_Setup",
    runId: "validation-recovery",
    tasklabel: "validation-recovery-proof",
    startedAt: "2026-09-05T10:00:00Z",
  }, { resultRoot });
  const paths = workspaceResultPaths(
    "_Setup",
    "validation-recovery",
    resultRoot,
  );
  assert.throws(() => finalizeActiveRun("_Setup", "PASS", {
    resultRoot,
    finalReturn: "x".repeat(33 * 1024),
  }), { code: "result_return_invalid" });
  assert.equal(readdirSync(paths.runRoot).includes(".finalizing"), false);
  const recovered = finalizeActiveRun("_Setup", "FAIL", {
    resultRoot,
    finalReturn: "RECOVERY_STATUS=FAIL\n",
  });
  assert.equal(recovered.envelope.terminalStatus, "FAIL");
});

test("a dead finalizer owner is reclaimed before terminal publication", () => {
  const resultRoot = root();
  beginResultRun({
    workspace: "Beheer",
    runId: "dead-owner",
    tasklabel: "dead-owner-proof",
    startedAt: "2026-09-05T10:00:00Z",
  }, { resultRoot });
  const paths = workspaceResultPaths("Beheer", "dead-owner", resultRoot);
  writeFileSync(paths.finalizing, '{"pid":2147483647}\n');
  const recovered = finalizeActiveRun("Beheer", "INTERRUPTED", {
    resultRoot,
    stopDescription: "Recovered after dead finalizer owner.",
  });
  assert.equal(recovered.envelope.terminalStatus, "INTERRUPTED");
  assert.equal(readdirSync(paths.runRoot).includes(".finalizing"), false);
});

test("transition mirror is explicit and byte-identical to workspace latest", () => {
  const resultRoot = root();
  beginResultRun({
    workspace: "_Setup",
    runId: "transition-mirror",
    tasklabel: "transition-proof",
    startedAt: "2026-09-05T10:00:00Z",
  }, { resultRoot, mirrorProjectLatest: true });
  const published = finalizeActiveRun("_Setup", "PASS", {
    resultRoot,
    mirrorProjectLatest: true,
    finishedAt: "2026-09-05T10:01:00Z",
    finalReturn: "TRANSITION_STATUS=PASS\n",
  });
  assert.equal(
    readFileSync(published.paths.projectLatest, "utf8"),
    readFileSync(published.paths.latest, "utf8"),
  );
});

test("PARTIAL, HUMAN_GATE, and FAIL each replace their workspace latest", () => {
  for (const terminalStatus of ["PARTIAL", "HUMAN_GATE", "FAIL"]) {
    const resultRoot = root();
    const workspace = terminalStatus === "PARTIAL" ? "Beheer" : "_Setup";
    const published = publish(
      resultRoot,
      workspace,
      terminalStatus.toLowerCase(),
      terminalStatus,
    );
    assert.equal(readJson(published.paths.latest).terminalStatus, terminalStatus);
    assert.equal(readJson(published.paths.history).workspace, workspace);
  }
});

test("TIMEOUT and interrupt hooks publish useful runtime descriptions", () => {
  for (const [eventName, reason, expected] of [
    ["SessionEnd", "timeout", "TIMEOUT"],
    ["Interrupt", "", "INTERRUPTED"],
    ["SessionEnd", "process exited with code 1", "FAIL"],
  ]) {
    const resultRoot = root();
    handleResultHook({
      hook_event_name: "UserPromptSubmit",
      cwd: "/Users/daankoote/dev/enval-worktrees/setup",
      session_id: `session-${expected}`,
      turn_id: "turn-1",
    }, { resultRoot, workspace: "_Setup", startedAt: "2026-09-05T10:00:00Z" });
    handleResultHook({ hook_event_name: eventName, reason }, {
      resultRoot,
      workspace: "_Setup",
    });
    const latest = readJson(join(resultRoot, "_Setup", "latest.txt"));
    assert.equal(latest.terminalStatus, expected);
    assert.match(latest.stopDescription, /Codex/);
    assert.equal(latest.finalReturn, null);
  }
});

test("a new run immediately replaces stale latest with its own pending marker", () => {
  const resultRoot = root();
  publish(resultRoot, "Main", "old-run", "PASS");
  beginResultRun({
    workspace: "Main",
    runId: "new-run",
    tasklabel: "new-proof",
    startedAt: "2026-09-05T11:00:00Z",
  }, { resultRoot });
  const latest = readJson(join(resultRoot, "Main", "latest.txt"));
  assert.equal(latest.runId, "new-run");
  assert.equal(latest.resultState, "PENDING");
  assert.equal(latest.terminalStatus, undefined);
  assert.equal(
    readJson(workspaceResultPaths("Main", "old-run", resultRoot).history)
      .terminalStatus,
    "PASS",
  );
});

test("Stop uses the final RETURN status and missing RETURN fails closed", () => {
  const resultRoot = root();
  for (const [runId, message, expected] of [
    ["partial-stop", "BATCH_STATUS=PARTIAL\nREASON=review exhaustion\n", "PARTIAL"],
    ["missing-stop", "Implementation ended without the RETURN marker.", "BLOCKED"],
  ]) {
    beginResultRun({
      workspace: "Beheer",
      runId,
      tasklabel: "stop-proof",
      startedAt: "2026-09-05T10:00:00Z",
    }, { resultRoot });
    handleResultHook({
      hook_event_name: "Stop",
      last_assistant_message: message,
    }, { resultRoot, workspace: "Beheer" });
    const latest = readJson(join(resultRoot, "Beheer", "latest.txt"));
    assert.equal(latest.terminalStatus, expected);
    if (expected === "BLOCKED") {
      assert.match(latest.stopDescription, /without a recognized terminal RETURN/);
    } else {
      assert.equal(latest.finalReturn, message);
    }
  }
});

test("PreToolUse HUMAN_GATE finalizes the active workspace before denying", () => {
  const resultRoot = root();
  beginResultRun({
    workspace: "_Setup",
    runId: "human-gate",
    tasklabel: "hook-proof",
    startedAt: "2026-09-05T10:00:00Z",
  }, { resultRoot });
  const routed = routeEvent({
    cwd: ROOT,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git branch new-topic" },
  }, { resultRoot, workspace: "_Setup" });
  assert.equal(routed.classification, CLASSIFICATION.DENY);
  assert.ok(
    routed.output?.hookSpecificOutput,
    `expected PreToolUse deny output, received ${JSON.stringify(routed)}`,
  );
  assert.equal(routed.output.hookSpecificOutput.permissionDecision, "deny");
  const latest = readJson(join(resultRoot, "_Setup", "latest.txt"));
  assert.equal(latest.terminalStatus, "HUMAN_GATE");
  assert.match(latest.stopDescription, /permission hook/);
});

test("real hook stdin protocol opens and finalizes the _Setup route", () => {
  const isolatedHome = root();
  const router = fileURLToPath(
    new URL("../../.codex/hooks/enval-permission-router.mjs", import.meta.url),
  );
  const invoke = (event) => {
    const result = spawnSync(process.execPath, [router], {
      cwd: "/Users/daankoote/dev/enval-worktrees/setup",
      encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome },
      input: JSON.stringify(event),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  };
  invoke({
    hook_event_name: "UserPromptSubmit",
    cwd: "/Users/daankoote/dev/enval-worktrees/setup",
    session_id: "protocol-session",
    turn_id: "protocol-turn",
    prompt: "GOAL\n\nProve lifecycle publication",
  });
  invoke({
    hook_event_name: "Stop",
    cwd: "/Users/daankoote/dev/enval-worktrees/setup",
    last_assistant_message: "PROTOCOL_STATUS=PASS\n",
  });
  const latest = readJson(
    join(isolatedHome, ".herdr-results", "ENVAL", "_Setup", "latest.txt"),
  );
  assert.equal(latest.runId, "protocol-session-protocol-turn");
  assert.equal(latest.tasklabel, "Prove lifecycle publication");
  assert.equal(latest.terminalStatus, "PASS");
});

test("Main and Beheer concurrent smoke runs never share latest or history", async () => {
  const resultRoot = root();
  const moduleUrl = new URL("../tools/enval-result.mjs", import.meta.url).href;
  const script = [
    `import { beginResultRun, finalizeActiveRun } from ${JSON.stringify(moduleUrl)};`,
    "const [resultRoot, workspace, runId] = process.argv.slice(1);",
    "beginResultRun({workspace,runId,tasklabel:`${workspace}-smoke`,startedAt:'2026-09-05T10:00:00Z'}, {resultRoot});",
    "finalizeActiveRun(workspace,'PASS',{resultRoot,finishedAt:'2026-09-05T10:01:00Z',finalReturn:`${workspace}_STATUS=PASS\\n`});",
  ].join("");
  const child = (workspace, runId) => new Promise((resolvePromise, reject) => {
    const processChild = spawn(process.execPath, ["--input-type=module", "-e", script, resultRoot, workspace, runId], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    processChild.stderr.on("data", (chunk) => stderr += chunk);
    processChild.on("error", reject);
    processChild.on("exit", (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`child ${workspace} failed (${code}): ${stderr}`)));
  });
  await Promise.all([
    child("Main", "main-concurrent"),
    child("Beheer", "beheer-concurrent"),
  ]);
  const main = readJson(join(resultRoot, "Main", "latest.txt"));
  const beheer = readJson(join(resultRoot, "Beheer", "latest.txt"));
  assert.equal(main.runId, "main-concurrent");
  assert.equal(beheer.runId, "beheer-concurrent");
  assert.notEqual(main.workspace, beheer.workspace);
  assert.equal(
    readJson(workspaceResultPaths("Main", main.runId, resultRoot).history).workspace,
    "Main",
  );
  assert.equal(
    readJson(workspaceResultPaths("Beheer", beheer.runId, resultRoot).history).workspace,
    "Beheer",
  );
});

test("terminal status parser accepts all canonical outcomes only", () => {
  for (const status of [
    "PASS", "PARTIAL", "FAIL", "HUMAN_GATE", "BLOCKED", "INTERRUPTED", "TIMEOUT",
  ]) assert.equal(terminalStatusFromReturn(`TASK_STATUS=${status}\n`), status);
  assert.equal(terminalStatusFromReturn("TASK_STATUS=RUNNING\n"), null);
});
