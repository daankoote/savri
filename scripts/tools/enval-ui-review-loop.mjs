#!/usr/bin/env node

import {
  chmodSync,
  lstatSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  normalize,
  relative,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

import {
  DEFAULT_MAX_REVIEW_FIX_CYCLES,
  HARD_MAX_REVIEW_FIX_CYCLES,
  startUiReview,
} from "./enval-ui-review.mjs";

export const BATCH_STATE_SCHEMA_VERSION = 1;
export const HERDR_TABS = Object.freeze(["Codex", "Terminal", "Reviewer"]);
const PHASES = new Set(["READY_FOR_REVIEW", "FIX_REQUIRED", "COMPLETE"]);
const STOP_TYPES = new Set(["HUMAN_GATE", "MATERIAL_DECISION", "LOOP_GUARD"]);
const SECRET_KEY = /(?:authorization|password|secret|token|api[_-]?key|jwt)/i;
const TEXT_PATTERN = /^[^\r\n]{1,500}$/;

export class UiReviewLoopError extends Error {
  constructor(code) {
    super(code);
    this.name = "UiReviewLoopError";
    this.code = code;
  }
}

function fail(code) {
  throw new UiReviewLoopError(code);
}

function checkedText(value, code) {
  if (typeof value !== "string" || !TEXT_PATTERN.test(value)) fail(code);
  return value;
}

function plainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function temporaryPath(candidate, { mustExist = true } = {}) {
  const root = realpathSync(tmpdir());
  const unresolved = resolve(candidate);
  const path = mustExist ? realpathSync(unresolved) : resolve(
    realpathSync(dirname(unresolved)),
    relative(dirname(unresolved), unresolved),
  );
  const child = relative(root, path);
  if (
    child === "" || child === ".." || child.startsWith(`..${sep}`) ||
    child.startsWith(sep)
  ) fail("state_path_not_temporary");
  if (mustExist) {
    const status = lstatSync(unresolved);
    if (!status.isFile() || status.isSymbolicLink()) {
      fail("state_file_invalid");
    }
  }
  return path;
}

function jsonFile(candidate, code) {
  const path = temporaryPath(candidate);
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return plainObject(value, code);
  } catch (error) {
    if (error instanceof UiReviewLoopError) throw error;
    fail(code);
  }
}

function rejectSecretKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) rejectSecretKeys(item);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) fail("secret_field_refused");
    rejectSecretKeys(item);
  }
}

function bounded(value) {
  rejectSecretKeys(value);
  if (JSON.stringify(value).length > 128 * 1024) fail("batch_state_too_large");
  return value;
}

function commandResult(command, args, code, run = spawnSync) {
  const result = run(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
  if (result.error || result.status !== 0) fail(code);
  return String(result.stdout ?? "");
}

function herdrArgs(args, env = process.env) {
  const session = env.HERDR_SESSION;
  if (env.HERDR_ENV !== "1" || !session) fail("herdr_context_required");
  return ["--session", session, ...args];
}

function herdrJsonResult(args, expectedType, code, env, run) {
  let response;
  try {
    response = JSON.parse(
      commandResult("herdr", herdrArgs(args, env), code, run),
    );
  } catch (error) {
    if (error instanceof UiReviewLoopError) throw error;
    fail(`${code}_response_invalid`);
  }
  if (response?.result?.type !== expectedType) fail(`${code}_response_invalid`);
  return response.result;
}

function reviewerPane(env = process.env, run = spawnSync) {
  const workspaceId = env.HERDR_WORKSPACE_ID;
  if (!workspaceId) fail("herdr_workspace_required");
  const tabs = herdrJsonResult(
    ["tab", "list", "--workspace", workspaceId],
    "tab_list",
    "herdr_tab_list_failed",
    env,
    run,
  ).tabs;
  if (!Array.isArray(tabs)) fail("herdr_tab_list_response_invalid");
  const reviewerTabs = tabs.filter((tab) => tab?.label === HERDR_TABS[2]);
  if (reviewerTabs.length !== 1) {
    fail("herdr_reviewer_tab_missing_or_ambiguous");
  }
  const panes = herdrJsonResult(
    ["pane", "list", "--workspace", workspaceId],
    "pane_list",
    "herdr_pane_list_failed",
    env,
    run,
  ).panes;
  if (!Array.isArray(panes)) fail("herdr_pane_list_response_invalid");
  const matching = panes.filter(
    (pane) =>
      pane?.tab_id === reviewerTabs[0].tab_id ||
      pane?.tab?.tab_id === reviewerTabs[0].tab_id,
  );
  if (matching.length !== 1 || typeof matching[0].pane_id !== "string") {
    fail("herdr_reviewer_pane_missing_or_ambiguous");
  }
  return matching[0].pane_id;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function launchReviewerInHerdr(
  { args, cwd, prompt },
  options = {},
) {
  const env = options.env ?? process.env;
  const run = options.run ?? spawnSync;
  const paneId = reviewerPane(env, run);
  const invocation = options.uuid?.() ?? randomUUID();
  const promptPath = resolve(
    tmpdir(),
    `enval-ui-review-prompt-${invocation}.txt`,
  );
  writeFileSync(promptPath, prompt, { mode: 0o600 });
  const sentinel = `ENVAL_REVIEW_DONE_${invocation}`;
  const command = [
    "codex",
    ...args,
  ].map(shellQuote).join(" ") +
    ` < ${
      shellQuote(promptPath)
    }; review_status=$?; printf '${sentinel}=%s\\n' "$review_status"`;
  commandResult(
    "herdr",
    herdrArgs(["pane", "run", paneId, command], env),
    "herdr_reviewer_start_failed",
    run,
  );
  const matched = herdrJsonResult(
    [
      "pane",
      "wait-output",
      paneId,
      "--match",
      `${sentinel}=`,
      "--source",
      "recent-unwrapped",
      "--lines",
      "80",
      "--timeout",
      "3600000",
    ],
    "output_matched",
    "herdr_reviewer_wait_failed",
    env,
    run,
  );
  const text = typeof matched.read?.text === "string" ? matched.read.text : "";
  const match = text.match(new RegExp(`${sentinel}=([0-9]+)`));
  if (!match) fail("herdr_reviewer_status_missing");
  return Promise.resolve(Number(match[1]));
}

function changedFiles(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    fail("changed_files_invalid");
  }
  const unique = new Set();
  for (const file of value) {
    checkedText(file, "changed_file_invalid");
    const normalized = normalize(file);
    if (
      isAbsolute(file) || normalized === ".." ||
      normalized.startsWith(`..${sep}`)
    ) {
      fail("changed_file_invalid");
    }
    unique.add(file);
  }
  if (unique.size !== value.length) fail("changed_file_duplicate");
  return [...value];
}

function implementationResult(value) {
  plainObject(value, "implementation_result_invalid");
  if (
    value.status !== "PASS" || !Array.isArray(value.checks) ||
    value.checks.length === 0
  ) {
    fail("implementation_result_not_green");
  }
  checkedText(value.summary, "implementation_result_invalid");
  for (const check of value.checks) {
    plainObject(check, "implementation_check_invalid");
    checkedText(check.name, "implementation_check_invalid");
    if (check.status !== "PASS") fail("implementation_result_not_green");
    checkedText(check.evidence, "implementation_check_invalid");
  }
  return structuredClone(value);
}

function findings(value) {
  if (!Array.isArray(value) || value.length > 100) fail("findings_invalid");
  const ids = new Set();
  for (const finding of value) {
    plainObject(finding, "finding_invalid");
    if (
      typeof finding.id !== "string" || !/^UIR-[0-9]{3,}$/.test(finding.id) ||
      ids.has(finding.id) ||
      !["critical", "high", "medium", "low"].includes(finding.severity)
    ) fail("finding_invalid");
    ids.add(finding.id);
    for (
      const field of [
        "route",
        "state",
        "viewport",
        "evidenceReference",
        "text",
      ]
    ) checkedText(finding[field], "finding_invalid");
  }
  return structuredClone(value);
}

function stopCondition(value) {
  if (value == null) return null;
  plainObject(value, "stop_condition_invalid");
  if (!STOP_TYPES.has(value.type)) fail("stop_condition_invalid");
  return Object.freeze({
    type: value.type,
    detail: checkedText(value.detail, "stop_condition_invalid"),
  });
}

function maxCycles(value, explicit) {
  const cycles = value ?? DEFAULT_MAX_REVIEW_FIX_CYCLES;
  if (cycles === DEFAULT_MAX_REVIEW_FIX_CYCLES && explicit !== true) {
    return cycles;
  }
  if (cycles === HARD_MAX_REVIEW_FIX_CYCLES && explicit === true) return cycles;
  fail("review_fix_cycle_limit_invalid");
}

export function createBatchState(input) {
  plainObject(input, "batch_request_invalid");
  const stop = stopCondition(input.stopCondition);
  const state = {
    schemaVersion: BATCH_STATE_SCHEMA_VERSION,
    batchId: checkedText(input.batchId, "batch_id_invalid"),
    acceptance: checkedText(input.acceptance, "acceptance_invalid"),
    implementationContextId: checkedText(
      input.implementationContextId,
      "implementation_context_invalid",
    ),
    changedFiles: changedFiles(input.changedFiles),
    implementationResult: implementationResult(input.implementationResult),
    browserEvidenceManifest: checkedText(
      input.browserEvidenceManifest,
      "evidence_manifest_invalid",
    ),
    maxFixCycles: maxCycles(input.maxFixCycles, input.hardMaxExplicit),
    hardMaxExplicit: input.hardMaxExplicit === true,
    phase: stop ? "COMPLETE" : "READY_FOR_REVIEW",
    reviewNumber: 1,
    completedFixCycles: 0,
    priorFindings: findings([]),
    activeFindings: findings([]),
    reviewInvocations: [],
    fixAttempts: [],
    outcome: stop ? "PARTIAL" : null,
    stopReason: stop,
  };
  return Object.freeze(bounded(state));
}

export function validateBatchState(input) {
  const state = plainObject(structuredClone(input), "batch_state_invalid");
  if (
    state.schemaVersion !== BATCH_STATE_SCHEMA_VERSION ||
    !PHASES.has(state.phase) ||
    !Number.isInteger(state.reviewNumber) || state.reviewNumber < 1 ||
    !Number.isInteger(state.completedFixCycles) ||
    state.completedFixCycles < 0 ||
    state.reviewNumber !== state.completedFixCycles + 1 ||
    !Array.isArray(state.reviewInvocations) || !Array.isArray(state.fixAttempts)
  ) fail("batch_state_invalid");
  checkedText(state.batchId, "batch_id_invalid");
  checkedText(state.acceptance, "acceptance_invalid");
  checkedText(state.implementationContextId, "implementation_context_invalid");
  state.changedFiles = changedFiles(state.changedFiles);
  state.implementationResult = implementationResult(state.implementationResult);
  state.priorFindings = findings(state.priorFindings);
  state.activeFindings = findings(state.activeFindings);
  checkedText(state.browserEvidenceManifest, "evidence_manifest_invalid");
  maxCycles(state.maxFixCycles, state.hardMaxExplicit);
  if (state.reviewNumber > state.maxFixCycles + 1) fail("batch_state_invalid");
  if (
    state.phase === "COMPLETE" && !["PASS", "PARTIAL"].includes(state.outcome)
  ) {
    fail("batch_state_invalid");
  }
  return Object.freeze(bounded(state));
}

export function applyReviewResult(inputState, reviewResult) {
  const state = structuredClone(validateBatchState(inputState));
  if (state.phase !== "READY_FOR_REVIEW") fail("review_not_allowed_in_phase");
  plainObject(reviewResult, "review_result_invalid");
  if (
    !["PASS", "FAIL"].includes(reviewResult.verdict) ||
    reviewResult.reviewNumber !== state.reviewNumber ||
    typeof reviewResult.reviewContextId !== "string" ||
    reviewResult.reviewContextId === state.implementationContextId ||
    state.reviewInvocations.some(
      (invocation) =>
        invocation.reviewContextId === reviewResult.reviewContextId,
    ) || !Array.isArray(reviewResult.findings)
  ) fail("review_result_invalid");
  const reviewedFindings = findings(reviewResult.findings);
  state.reviewInvocations.push({
    reviewNumber: state.reviewNumber,
    reviewContextId: reviewResult.reviewContextId,
    verdict: reviewResult.verdict,
  });
  state.activeFindings = reviewedFindings;
  if (reviewResult.verdict === "PASS") {
    if (reviewResult.findings.length !== 0) fail("passing_review_has_findings");
    state.phase = "COMPLETE";
    state.outcome = "PASS";
    state.stopReason = { type: "REVIEW_PASS", detail: "browser-ready" };
  } else if (state.reviewNumber === state.maxFixCycles + 1) {
    if (reviewResult.findings.length === 0) {
      fail("failing_review_has_no_findings");
    }
    state.phase = "COMPLETE";
    state.outcome = "PARTIAL";
    state.stopReason = {
      type: "MAX_REVIEW_FIX_CYCLES",
      detail: `final review ${state.reviewNumber} failed`,
    };
  } else {
    if (reviewResult.findings.length === 0) {
      fail("failing_review_has_no_findings");
    }
    state.phase = "FIX_REQUIRED";
  }
  return Object.freeze(bounded(state));
}

export function applyFixResult(inputState, fixResult) {
  const state = structuredClone(validateBatchState(inputState));
  if (state.phase !== "FIX_REQUIRED") fail("fix_not_allowed_in_phase");
  plainObject(fixResult, "fix_result_invalid");
  if (fixResult.implementationContextId !== state.implementationContextId) {
    fail("implementation_context_changed");
  }
  const stop = stopCondition(fixResult.stopCondition);
  if (stop) {
    state.phase = "COMPLETE";
    state.outcome = "PARTIAL";
    state.stopReason = stop;
    return Object.freeze(bounded(state));
  }
  const attempt = {
    fixCycle: state.completedFixCycles + 1,
    strategy: checkedText(fixResult.strategy, "fix_strategy_invalid"),
    hypothesis: checkedText(fixResult.hypothesis, "fix_hypothesis_invalid"),
  };
  const repeated = [...state.fixAttempts, attempt].slice(-3);
  if (
    repeated.length === 3 &&
    repeated.every(
      (item) =>
        item.strategy === attempt.strategy &&
        item.hypothesis === attempt.hypothesis,
    )
  ) {
    state.fixAttempts.push(attempt);
    state.completedFixCycles += 1;
    state.reviewNumber += 1;
    state.phase = "COMPLETE";
    state.outcome = "PARTIAL";
    state.stopReason = {
      type: "LOOP_GUARD",
      detail:
        "same fix strategy repeated three times without new evidence or hypothesis",
    };
    return Object.freeze(bounded(state));
  }
  state.fixAttempts.push(attempt);
  state.completedFixCycles += 1;
  state.reviewNumber += 1;
  state.priorFindings = structuredClone(state.activeFindings);
  state.changedFiles = changedFiles(fixResult.changedFiles);
  state.implementationResult = implementationResult(
    fixResult.implementationResult,
  );
  state.browserEvidenceManifest = checkedText(
    fixResult.browserEvidenceManifest,
    "evidence_manifest_invalid",
  );
  state.phase = "READY_FOR_REVIEW";
  return Object.freeze(bounded(state));
}

export async function runAutonomousReviewLoop(initialState, handlers) {
  let state = validateBatchState(initialState);
  while (state.phase !== "COMPLETE") {
    if (state.phase === "READY_FOR_REVIEW") {
      state = applyReviewResult(state, await handlers.review(state));
      continue;
    }
    state = applyFixResult(state, await handlers.fix(state));
  }
  return state;
}

export function formatFinalOutcome(state) {
  state = validateBatchState(state);
  if (state.phase !== "COMPLETE") fail("batch_not_complete");
  return [
    `UI_REVIEW04_STATUS=${state.outcome}`,
    "AUTOMATIC_IMPLEMENTATION_REVIEW_HANDOFF=YES",
    "MANUAL_DAAN_RELAY_REQUIRED=NO",
    "INDEPENDENT_REVIEW_EACH_PASS=YES",
    `DEFAULT_MAX_REVIEW_FIX_CYCLES=${DEFAULT_MAX_REVIEW_FIX_CYCLES}`,
    `HARD_MAX_REVIEW_FIX_CYCLES=${HARD_MAX_REVIEW_FIX_CYCLES}`,
    "PASS_STOPS_IMMEDIATELY=YES",
    "FINAL_REVIEW_AFTER_FIX4=YES",
    `HERDR_TABS=${HERDR_TABS.join(",")}`,
    "REVIEWER_TAB_MANUAL_ROUTING_REQUIRED=NO",
    `REVIEWS_COMPLETED=${state.reviewInvocations.length}`,
    `FIX_CYCLES_COMPLETED=${state.completedFixCycles}`,
    `STOP_REASON=${state.stopReason.type}`,
    "",
  ].join("\n");
}

function writeState(path, state) {
  path = temporaryPath(path, { mustExist: false });
  const temporary = `${path}.next`;
  if (dirname(temporary) !== dirname(path)) fail("state_path_invalid");
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

function optionMap(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || values.has(key)) {
      fail("arguments_invalid");
    }
    values.set(key, value);
  }
  return values;
}

async function main(argv) {
  const operation = argv[0];
  const options = optionMap(argv.slice(1));
  if (operation === "init") {
    const request = jsonFile(options.get("--request"), "batch_request_invalid");
    const state = createBatchState(request);
    writeState(options.get("--state"), state);
    process.stdout.write("UI_REVIEW_LOOP_STATE=READY_FOR_REVIEW\n");
    return;
  }
  const statePath = options.get("--state");
  const state = validateBatchState(jsonFile(statePath, "batch_state_invalid"));
  if (operation === "advance") {
    const result = await startUiReview(state, {
      launch: launchReviewerInHerdr,
    });
    const next = applyReviewResult(state, result.reviewResult);
    writeState(statePath, next);
    process.stdout.write(
      next.phase === "COMPLETE"
        ? formatFinalOutcome(next)
        : `UI_REVIEW_LOOP_STATE=FIX_REQUIRED\nFINDINGS=${
          JSON.stringify(next.activeFindings)
        }\n`,
    );
    return;
  }
  if (operation === "record-fix") {
    const fix = jsonFile(options.get("--fix"), "fix_result_invalid");
    const next = applyFixResult(state, fix);
    writeState(statePath, next);
    process.stdout.write(
      next.phase === "COMPLETE"
        ? formatFinalOutcome(next)
        : "UI_REVIEW_LOOP_STATE=READY_FOR_REVIEW\n",
    );
    return;
  }
  if (operation === "outcome") {
    process.stdout.write(formatFinalOutcome(state));
    return;
  }
  fail("operation_invalid");
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof UiReviewLoopError
      ? error.code
      : "unexpected_failure";
    process.stderr.write(`UI_REVIEW_LOOP=FAIL\nFAILURE=${code}\n`);
    process.exitCode = 1;
  });
}
