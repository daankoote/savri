#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENVAL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const GENERIC_REVIEWER_CORE =
  ".agents/skills/independent-ui-review/SKILL.md";
export const ENVAL_REVIEW_ADAPTER = ".agents/skills/enval-ui-review/SKILL.md";
export const MAX_REVIEW_FIX_CYCLES = 2;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const TEXT_VALUE_PATTERN = /^[^\r\n]{1,240}$/;

export class UiReviewLaunchError extends Error {
  constructor(code) {
    super(code);
    this.name = "UiReviewLaunchError";
    this.code = code;
  }
}

function fail(code) {
  throw new UiReviewLaunchError(code);
}

function regularFile(path, code) {
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size === 0) {
      fail(code);
    }
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
}

function pathInside(root, path) {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) &&
    !child.startsWith(sep);
}

function projectFile(root, candidate, code) {
  const resolved = resolve(root, candidate);
  if (!pathInside(root, resolved)) fail(code);
  regularFile(resolved, code);
  if (realpathSync(resolved) !== resolved) fail(code);
  return relative(root, resolved);
}

function checkedText(value, code) {
  if (typeof value !== "string" || !TEXT_VALUE_PATTERN.test(value)) fail(code);
  return value;
}

function loopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("base_url_invalid");
  }
  if (
    url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username !== "" || url.password !== "" || url.search !== "" ||
    url.hash !== "" || url.pathname !== "/"
  ) fail("base_url_not_loopback_origin");
  return url.origin;
}

function reviewRoute(value, baseUrl) {
  checkedText(value, "route_invalid");
  if (!value.startsWith("/") || value.startsWith("//")) fail("route_invalid");
  const url = new URL(value, baseUrl);
  if (url.origin !== baseUrl) fail("route_outside_base_url");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseReviewRequest(argv, root = ENVAL_ROOT) {
  root = realpathSync(resolve(root));
  const values = { routes: [], states: [], dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      values.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined) fail("argument_value_missing");
    index += 1;
    if (argument === "--acceptance") values.acceptance = value;
    else if (argument === "--base-url") values.baseUrl = value;
    else if (argument === "--cycle") values.cycle = value;
    else if (argument === "--route") values.routes.push(value);
    else if (argument === "--state") values.states.push(value);
    else fail("argument_unknown");
  }

  const cycle = Number(values.cycle);
  if (!Number.isInteger(cycle) || cycle < 1 || cycle > MAX_REVIEW_FIX_CYCLES) {
    fail("review_cycle_invalid");
  }
  if (!values.acceptance) fail("acceptance_required");
  if (!values.baseUrl) fail("base_url_required");
  if (values.routes.length === 0) fail("route_required");

  const baseUrl = loopbackBaseUrl(values.baseUrl);
  return Object.freeze({
    acceptance: projectFile(root, values.acceptance, "acceptance_invalid"),
    baseUrl,
    cycle,
    dryRun: values.dryRun,
    routes: Object.freeze(
      values.routes.map((route) => reviewRoute(route, baseUrl)),
    ),
    states: Object.freeze(
      values.states.map((state) => checkedText(state, "state_invalid")),
    ),
  });
}

export function buildReviewPrompt(request) {
  const stopInstruction = request.cycle === MAX_REVIEW_FIX_CYCLES
    ? "This is cycle 2. Set STOP_TO_HUMAN=YES for FAIL or PARTIAL and stop to Daan."
    : "This is cycle 1. Return FAIL or PARTIAL findings to the implementation session; do not fix them.";
  return [
    "Use $independent-ui-review and $enval-ui-review.",
    "Run an independent, review-only ENVAL UI review in this fresh session.",
    `Review cycle: ${request.cycle} of ${MAX_REVIEW_FIX_CYCLES}.`,
    `Acceptance file: ${request.acceptance}`,
    `Loopback base URL: ${request.baseUrl}`,
    `Routes: ${JSON.stringify(request.routes)}`,
    `Required states: ${JSON.stringify(request.states)}`,
    stopInstruction,
    "Daan retains final browser and product acceptance.",
    "Do not modify repository or application state. Do not start another review cycle.",
  ].join("\n");
}

export function buildReviewerArgv(root, request) {
  return Object.freeze([
    "exec",
    "--ephemeral",
    "--cd",
    root,
    "--sandbox",
    "read-only",
    "--ask-for-approval",
    "never",
    "--config",
    'web_search="disabled"',
    "--enable",
    "hooks",
    "--strict-config",
    buildReviewPrompt(request),
  ]);
}

function defaultRun(command, args, options) {
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

function checkedRun(run, command, args, cwd, code) {
  const result = run(command, args, { cwd });
  if (result.error || result.status !== 0) fail(code);
  return String(result.stdout ?? "");
}

export function inspectCliVisualReviewCapability(
  root = ENVAL_ROOT,
  run = defaultRun,
) {
  const version = checkedRun(
    run,
    "codex",
    ["--version"],
    root,
    "codex_cli_unavailable",
  )
    .trim();
  const features = checkedRun(
    run,
    "codex",
    ["features", "list"],
    root,
    "codex_features_unavailable",
  );
  const mcp = checkedRun(
    run,
    "codex",
    ["mcp", "list"],
    root,
    "codex_mcp_unavailable",
  );
  const featureEnabled = (name) =>
    new RegExp(`^${name}\\s+\\S+(?:\\s+\\S+)*\\s+true$`, "m").test(features);
  const cuaEnabled = /^cua_repl\s+.*\s+enabled\s+/m.test(mcp);
  return Object.freeze({
    version,
    browserUse: featureEnabled("browser_use"),
    computerUse: featureEnabled("computer_use"),
    viewImage: featureEnabled("view_image"),
    cuaEnabled,
    supported: featureEnabled("browser_use") &&
      featureEnabled("computer_use") &&
      featureEnabled("view_image") && cuaEnabled,
  });
}

export function launchCodexCli({ args, cwd }) {
  return new Promise((resolveLaunch, rejectLaunch) => {
    const child = spawn("codex", args, { cwd, stdio: "inherit", shell: false });
    child.once("error", rejectLaunch);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectLaunch(new UiReviewLaunchError(`codex_cli_signal:${signal}`));
      } else resolveLaunch(code ?? 1);
    });
  });
}

export async function startUiReview(argv, options = {}) {
  const root = realpathSync(resolve(options.root ?? ENVAL_ROOT));
  regularFile(
    resolve(root, GENERIC_REVIEWER_CORE),
    "generic_reviewer_core_missing",
  );
  regularFile(
    resolve(root, ENVAL_REVIEW_ADAPTER),
    "enval_review_adapter_missing",
  );
  const request = parseReviewRequest(argv, root);
  const capability = inspectCliVisualReviewCapability(root, options.run);
  if (!capability.supported) fail("cli_visual_review_capability_missing");
  const launchRequest = Object.freeze({
    args: buildReviewerArgv(root, request),
    cwd: root,
  });
  if (request.dryRun) {
    return Object.freeze({
      capability,
      launchRequest,
      request,
      exitCode: null,
    });
  }
  const launch = options.launch ?? launchCodexCli;
  const exitCode = await launch(launchRequest);
  if (exitCode !== 0) fail(`codex_cli_exit:${exitCode}`);
  return Object.freeze({ capability, launchRequest, request, exitCode });
}

function dryRunReport(result) {
  return [
    "UI_REVIEW_LAUNCH=DRY_RUN",
    "INDEPENDENT_CONTEXT_REQUIRED=YES",
    "REVIEW_ONLY_AUTHORITY=YES",
    `MAX_REVIEW_FIX_CYCLES=${MAX_REVIEW_FIX_CYCLES}`,
    "DAAN_FINAL_ACCEPTANCE=YES",
    `CLI_VISUAL_REVIEW_CAPABILITY=${
      result.capability.supported ? "SUPPORTED" : "MISSING"
    }`,
    "BROWSER_MECHANISM=Codex CLI cua_repl browser bridge",
    "SCREENSHOT_MECHANISM=Codex CLI cua_repl screenshot and view_image",
    `CODEX_VERSION=${result.capability.version}`,
    `CODEX_ARGV=${JSON.stringify(result.launchRequest.args)}`,
    "",
  ].join("\n");
}

async function main(argv) {
  const result = await startUiReview(argv);
  if (result.request.dryRun) process.stdout.write(dryRunReport(result));
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof UiReviewLaunchError
      ? error.code
      : "unexpected_failure";
    process.stderr.write(`UI_REVIEW_LAUNCH=FAIL\nFAILURE=${code}\n`);
    process.exitCode = 1;
  });
}
