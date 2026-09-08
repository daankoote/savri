import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  beginResultRun,
  finalizeActiveRun,
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
