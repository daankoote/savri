import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { routeEvent } from "../../.codex/hooks/enval-permission-router.mjs";
import {
  CLASSIFICATION,
  ROOT,
} from "../../.codex/hooks/command-classifier.mjs";
import {
  beginResultRun,
  finalizeActiveRun,
  handleResultHook,
  handleResultNotification,
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

function git(repository, args) {
  const result = spawnSync("git", ["-C", repository, ...args], {
    cwd: repository,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout ?? "").trim();
}

function scopeFixture(workspace) {
  const repository = root();
  const branch = workspace === "Main"
    ? "main"
    : workspace === "Beheer"
    ? "beheer"
    : "setup";
  git(repository, ["init", "-b", branch]);
  mkdirSync(join(repository, "app"), { recursive: true });
  mkdirSync(join(repository, "scripts/tools"), { recursive: true });
  writeFileSync(join(repository, "app/fixture.txt"), "product\n");
  writeFileSync(
    join(repository, "scripts/tools/enval-result.mjs"),
    "export {};\n",
  );
  git(repository, ["add", "."]);
  git(repository, [
    "-c",
    "user.name=ENVAL Proof",
    "-c",
    "user.email=proof@invalid.local",
    "commit",
    "-m",
    "scope fixture",
  ]);
  return repository;
}

function beginScopedHook(
  resultRoot,
  workspace,
  repository,
  runId,
  turnId = "turn-1",
) {
  return handleResultHook({
    hook_event_name: "UserPromptSubmit",
    cwd: repository,
    session_id: runId,
    turn_id: turnId,
    prompt: `TASKLABEL=${runId}`,
  }, {
    resultRoot,
    workspace,
    scopeRoot: repository,
    startedAt: "2026-09-07T10:00:00Z",
  });
}

function scopedLatest(resultRoot, workspace) {
  return readJson(join(resultRoot, workspace, "latest.txt"));
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

test("canonical Stop accepts role-owned tracked, index, and untracked work", () => {
  const resultRoot = root();
  const repository = scopeFixture("_Setup");
  beginScopedHook(resultRoot, "_Setup", repository, "owned-stop");
  const tool = join(repository, "scripts/tools/enval-result.mjs");
  writeFileSync(tool, "export const staged = true;\n");
  git(repository, ["add", "scripts/tools/enval-result.mjs"]);
  writeFileSync(tool, "export const unstaged = true;\n");
  mkdirSync(join(repository, "docs/app/operations"), { recursive: true });
  writeFileSync(join(repository, "docs/app/operations/note.md"), "note\n");
  handleResultHook({
    hook_event_name: "Stop",
    last_assistant_message: "OWNED_STATUS=PASS\n",
  }, { resultRoot, workspace: "_Setup", scopeRoot: repository });
  assert.equal(scopedLatest(resultRoot, "_Setup").terminalStatus, "PASS");
});

test("all canonical terminal lifecycle paths publish concrete FAIL on scope drift", () => {
  for (const lifecycle of ["Stop", "Interrupt", "SessionEnd", "notify"]) {
    const resultRoot = root();
    const repository = scopeFixture("_Setup");
    const runId = `drift-${lifecycle.toLowerCase()}`;
    beginScopedHook(resultRoot, "_Setup", repository, runId);
    writeFileSync(join(repository, "app/fixture.txt"), `${lifecycle}\n`);
    if (lifecycle === "notify") {
      handleResultNotification({
        type: "agent-turn-complete",
        "thread-id": runId,
        "turn-id": "turn-1",
        cwd: repository,
        "input-messages": [`TASKLABEL=${runId}`],
        "last-assistant-message": "DRIFT_STATUS=PASS\n",
      }, { resultRoot, workspace: "_Setup", scopeRoot: repository });
    } else {
      handleResultHook({
        hook_event_name: lifecycle,
        reason: lifecycle === "SessionEnd" ? "process exited" : undefined,
        last_assistant_message: "DRIFT_STATUS=PASS\n",
      }, { resultRoot, workspace: "_Setup", scopeRoot: repository });
    }
    const latest = scopedLatest(resultRoot, "_Setup");
    assert.equal(latest.terminalStatus, "FAIL");
    assert.equal(latest.finalReturn, null);
    assert.match(
      latest.stopDescription,
      /workspace_role_path_refused:SETUP_GOVERNANCE:app\/fixture\.txt/,
    );
  }
});

test("publication denies forbidden tracked, index, and untracked paths", () => {
  for (const state of ["tracked", "index", "untracked"]) {
    const resultRoot = root();
    const repository = scopeFixture("_Setup");
    beginScopedHook(resultRoot, "_Setup", repository, `state-${state}`);
    const path = state === "untracked"
      ? "app/new-product-file.txt"
      : "app/fixture.txt";
    writeFileSync(join(repository, path), `${state}\n`);
    if (state === "index") git(repository, ["add", path]);
    handleResultHook({
      hook_event_name: "Stop",
      last_assistant_message: "STATE_STATUS=PASS\n",
    }, { resultRoot, workspace: "_Setup", scopeRoot: repository });
    const latest = scopedLatest(resultRoot, "_Setup");
    assert.equal(latest.terminalStatus, "FAIL");
    assert.match(
      latest.stopDescription,
      new RegExp(
        `workspace_role_path_refused:SETUP_GOVERNANCE:${
          path.replaceAll(".", "\\.")
        }`,
      ),
    );
  }
});

test("Main preserves twelve baseline artifacts only while byte-identical", () => {
  for (const drift of ["none", "added", "modified", "removed"]) {
    const resultRoot = root();
    const repository = scopeFixture("Main");
    for (let index = 1; index <= 12; index += 1) {
      writeFileSync(
        join(repository, `artifact-${index}.txt`),
        `value-${index}\n`,
      );
    }
    const started = beginScopedHook(
      resultRoot,
      "Main",
      repository,
      `main-${drift}`,
    );
    assert.equal(started.context.scopeBaseline.untracked.length, 12);
    if (drift === "added") {
      writeFileSync(join(repository, "artifact-13.txt"), "new\n");
    }
    if (drift === "modified") {
      writeFileSync(join(repository, "artifact-1.txt"), "changed\n");
    }
    if (drift === "removed") rmSync(join(repository, "artifact-1.txt"));
    handleResultHook({
      hook_event_name: "Stop",
      last_assistant_message: "MAIN_STATUS=PASS\n",
    }, { resultRoot, workspace: "Main", scopeRoot: repository });
    const latest = scopedLatest(resultRoot, "Main");
    assert.equal(latest.terminalStatus, drift === "none" ? "PASS" : "FAIL");
    if (drift !== "none") {
      assert.match(
        latest.stopDescription,
        /workspace_untracked_baseline_drift:Main:artifact-/,
      );
    }
  }
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
  assert.throws(() =>
    finalizeActiveRun("_Setup", "PASS", {
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
    assert.equal(
      readJson(published.paths.latest).terminalStatus,
      terminalStatus,
    );
    assert.equal(readJson(published.paths.history).workspace, workspace);
  }
});

test("TIMEOUT and interrupt hooks publish useful runtime descriptions", () => {
  for (
    const [eventName, reason, expected] of [
      ["SessionEnd", "timeout", "TIMEOUT"],
      ["Interrupt", "", "INTERRUPTED"],
      ["SessionEnd", "process exited with code 1", "FAIL"],
    ]
  ) {
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
  const repository = scopeFixture("Beheer");
  for (
    const [runId, message, expected] of [
      [
        "partial-stop",
        "BATCH_STATUS=PARTIAL\nREASON=review exhaustion\n",
        "PARTIAL",
      ],
      [
        "missing-stop",
        "Implementation ended without the RETURN marker.",
        "BLOCKED",
      ],
    ]
  ) {
    beginScopedHook(resultRoot, "Beheer", repository, runId);
    handleResultHook({
      hook_event_name: "Stop",
      last_assistant_message: message,
    }, { resultRoot, workspace: "Beheer", scopeRoot: repository });
    const latest = readJson(join(resultRoot, "Beheer", "latest.txt"));
    assert.equal(latest.terminalStatus, expected);
    if (expected === "BLOCKED") {
      assert.match(
        latest.stopDescription,
        /without a recognized terminal RETURN/,
      );
    } else {
      assert.equal(latest.finalReturn, message);
    }
  }
});

test("agent-turn-complete fallback publishes terminal output without Stop", () => {
  for (const terminalStatus of ["PASS", "PARTIAL", "FAIL"]) {
    const resultRoot = root();
    const repository = scopeFixture("Main");
    const payload = {
      type: "agent-turn-complete",
      "thread-id": `notify-${terminalStatus.toLowerCase()}`,
      "turn-id": "turn-1",
      cwd: repository,
      "input-messages": [
        `TASKLABEL: notify-${terminalStatus.toLowerCase()}-proof`,
      ],
      "last-assistant-message": `NOTIFY_STATUS=${terminalStatus}`,
    };
    beginScopedHook(
      resultRoot,
      "Main",
      repository,
      payload["thread-id"],
    );
    const published = handleResultNotification(payload, {
      resultRoot,
      workspace: "Main",
      scopeRoot: repository,
    });
    assert.equal(published.envelope.workspace, "Main");
    assert.equal(published.envelope.terminalStatus, terminalStatus);
    assert.equal(
      readJson(published.paths.latest).finalReturn,
      `NOTIFY_STATUS=${terminalStatus}\n`,
    );
    assert.deepEqual(
      readJson(published.paths.latest),
      readJson(published.paths.history),
    );
  }
});

test("notifier without a trusted start baseline publishes concrete FAIL", () => {
  const resultRoot = root();
  const repository = scopeFixture("Main");
  const published = handleResultNotification({
    type: "agent-turn-complete",
    "thread-id": "notify-without-start",
    "turn-id": "turn-1",
    cwd: repository,
    "input-messages": ["TASKLABEL: notify-without-start-proof"],
    "last-assistant-message": "UNTRUSTED_STATUS=PASS",
  }, { resultRoot, workspace: "Main", scopeRoot: repository });
  assert.equal(published.envelope.terminalStatus, "FAIL");
  assert.equal(published.envelope.finalReturn, null);
  assert.match(
    published.envelope.stopDescription,
    /workspace_scope_baseline_required/,
  );
});

test("notify after Stop reuses immutable history instead of duplicating a run", () => {
  const resultRoot = root();
  const payload = {
    type: "agent-turn-complete",
    "thread-id": "notify-idempotent",
    "turn-id": "turn-1",
    cwd: "/Users/daankoote/dev/enval-worktrees/setup",
    "input-messages": ["TASKLABEL: notify-idempotent-proof"],
    "last-assistant-message": "IDEMPOTENT_STATUS=FAIL",
  };
  handleResultHook({
    hook_event_name: "UserPromptSubmit",
    cwd: payload.cwd,
    session_id: payload["thread-id"],
    turn_id: payload["turn-id"],
    prompt: payload["input-messages"][0],
  }, { resultRoot, startedAt: "2026-09-05T10:00:00Z" });
  handleResultHook({
    hook_event_name: "Stop",
    cwd: payload.cwd,
    last_assistant_message: payload["last-assistant-message"],
  }, { resultRoot });
  const published = handleResultNotification(payload, { resultRoot });
  assert.equal(published.alreadyFinalized, true);
  assert.equal(published.envelope.terminalStatus, "FAIL");
  assert.deepEqual(
    readdirSync(published.paths.runRoot).sort(),
    ["active-finalized.json", "context.json", "result.txt"],
  );
});

test("a delayed old notifier cannot replace a newer pending latest", () => {
  const resultRoot = root();
  const repository = scopeFixture("Main");
  const oldPayload = {
    type: "agent-turn-complete",
    "thread-id": "delayed-notify",
    "turn-id": "old-turn",
    cwd: repository,
    "input-messages": ["TASKLABEL: delayed-old-proof"],
    "last-assistant-message": "DELAYED_OLD_STATUS=PASS",
  };
  beginScopedHook(
    resultRoot,
    "Main",
    repository,
    oldPayload["thread-id"],
    oldPayload["turn-id"],
  );
  const old = handleResultNotification(oldPayload, {
    resultRoot,
    workspace: "Main",
    scopeRoot: repository,
  });
  beginResultRun({
    workspace: "Main",
    runId: "new-pending-run",
    tasklabel: "new-pending-proof",
    startedAt: "2026-09-05T10:01:00Z",
  }, { resultRoot });

  const delayed = handleResultNotification(oldPayload, {
    resultRoot,
    workspace: "Main",
    scopeRoot: repository,
  });
  const latest = readJson(join(resultRoot, "Main", "latest.txt"));
  assert.equal(delayed.alreadyFinalized, true);
  assert.equal(delayed.latestPreserved, true);
  assert.equal(latest.runId, "new-pending-run");
  assert.equal(latest.resultState, "PENDING");
  assert.equal(
    readJson(old.paths.history).terminalStatus,
    "PASS",
  );
});

test("PreToolUse HUMAN_GATE finalizes the active workspace before denying", () => {
  const resultRoot = root();
  const repository = scopeFixture("_Setup");
  beginScopedHook(resultRoot, "_Setup", repository, "human-gate");
  const routed = routeEvent({
    cwd: ROOT,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "git branch new-topic" },
  }, { resultRoot, workspace: "_Setup", scopeRoot: repository });
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

test("real notify argv protocol publishes when project Stop is not trusted", () => {
  const isolatedHome = root();
  const router = fileURLToPath(
    new URL("../../.codex/hooks/enval-permission-router.mjs", import.meta.url),
  );
  const payload = {
    type: "agent-turn-complete",
    "thread-id": "notify-protocol-session",
    "turn-id": "notify-protocol-turn",
    cwd: "/Users/daankoote/dev/enval-worktrees/setup",
    "input-messages": ["TASKLABEL: notify-protocol-proof"],
    "last-assistant-message": "NOTIFY_PROTOCOL_STATUS=FAIL",
  };
  const opened = spawnSync(process.execPath, [router], {
    cwd: payload.cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: isolatedHome },
    input: JSON.stringify({
      hook_event_name: "UserPromptSubmit",
      cwd: payload.cwd,
      session_id: payload["thread-id"],
      turn_id: payload["turn-id"],
      prompt: payload["input-messages"][0],
    }),
  });
  assert.equal(opened.status, 0, opened.stderr);
  const result = spawnSync(
    process.execPath,
    [router, "--notify", JSON.stringify(payload)],
    {
      cwd: "/Users/daankoote/dev/enval-worktrees/setup",
      encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  const latest = readJson(
    join(isolatedHome, ".herdr-results", "ENVAL", "_Setup", "latest.txt"),
  );
  assert.equal(latest.runId, "notify-protocol-session-notify-protocol-turn");
  assert.equal(latest.tasklabel, "notify-protocol-proof");
  assert.equal(latest.terminalStatus, "FAIL");
  assert.equal(latest.finalReturn, "NOTIFY_PROTOCOL_STATUS=FAIL\n");
});

test("unresolved lifecycle workspace fails visibly instead of completing", () => {
  const router = fileURLToPath(
    new URL("../../.codex/hooks/enval-permission-router.mjs", import.meta.url),
  );
  const result = spawnSync(process.execPath, [router], {
    cwd: "/Users/daankoote/dev/enval-worktrees/setup",
    encoding: "utf8",
    input: JSON.stringify({
      hook_event_name: "Stop",
      cwd: "/private/tmp/not-an-enval-worktree",
      last_assistant_message: "UNRESOLVED_STATUS=FAIL",
    }),
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /ENVAL_RESULT_PUBLICATION=FAIL/);
  assert.match(result.stderr, /FAILURE=result_workspace_unresolved/);
});

test("Main and Beheer concurrent smoke runs never share latest or history", async () => {
  const resultRoot = root();
  const moduleUrl = new URL("../tools/enval-result.mjs", import.meta.url).href;
  const script = [
    `import { beginResultRun, finalizeActiveRun } from ${
      JSON.stringify(moduleUrl)
    };`,
    "const [resultRoot, workspace, runId] = process.argv.slice(1);",
    "beginResultRun({workspace,runId,tasklabel:`${workspace}-smoke`,startedAt:'2026-09-05T10:00:00Z'}, {resultRoot});",
    "finalizeActiveRun(workspace,'PASS',{resultRoot,finishedAt:'2026-09-05T10:01:00Z',finalReturn:`${workspace}_STATUS=PASS\\n`});",
  ].join("");
  const child = (workspace, runId) =>
    new Promise((resolvePromise, reject) => {
      const processChild = spawn(process.execPath, [
        "--input-type=module",
        "-e",
        script,
        resultRoot,
        workspace,
        runId,
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      processChild.stderr.on("data", (chunk) => stderr += chunk);
      processChild.on("error", reject);
      processChild.on("exit", (code) =>
        code === 0 ? resolvePromise() : reject(
          new Error(`child ${workspace} failed (${code}): ${stderr}`),
        ));
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
    readJson(workspaceResultPaths("Main", main.runId, resultRoot).history)
      .workspace,
    "Main",
  );
  assert.equal(
    readJson(workspaceResultPaths("Beheer", beheer.runId, resultRoot).history)
      .workspace,
    "Beheer",
  );
});

test("terminal status parser accepts all canonical outcomes only", () => {
  for (
    const status of [
      "PASS",
      "PARTIAL",
      "FAIL",
      "HUMAN_GATE",
      "BLOCKED",
      "INTERRUPTED",
      "TIMEOUT",
    ]
  ) assert.equal(terminalStatusFromReturn(`TASK_STATUS=${status}\n`), status);
  assert.equal(terminalStatusFromReturn("TASK_STATUS=RUNNING\n"), null);
});
