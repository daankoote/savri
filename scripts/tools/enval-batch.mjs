#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ENVAL_ROOT = "/Users/daankoote/dev/enval";
export const ENVAL_WORKTREES_ROOT = "/Users/daankoote/dev/enval-worktrees";
export const HERDR_SESSION = "enval-worker";
export const HERDR_VERSION = "0.8.2";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HERDR_AGENT_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const GOVERNANCE_FILES = Object.freeze([
  "AGENTS.md",
  ".codex/hooks.json",
  ".codex/config.toml",
  ".codex/rules/enval.rules",
]);

export class BatchLaunchError extends Error {
  constructor(code) {
    super(code);
    this.name = "BatchLaunchError";
    this.code = code;
  }
}

function fail(code) {
  throw new BatchLaunchError(code);
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

export function validateGovernance(root) {
  for (const file of GOVERNANCE_FILES) {
    regularFile(join(root, file), `governance_file_missing_or_invalid:${file}`);
  }

  const hooksRoot = join(root, ".codex/hooks");
  let hookFiles = 0;
  try {
    for (const entry of readdirSync(hooksRoot, { recursive: true })) {
      const path = join(hooksRoot, entry);
      const status = lstatSync(path);
      if (status.isSymbolicLink()) fail("codex_hooks_symlink_refused");
      if (status.isFile()) {
        regularFile(path, "codex_hook_file_invalid");
        hookFiles += 1;
      }
    }
  } catch (error) {
    if (error?.code === "ENOENT") fail("codex_hooks_directory_missing");
    throw error;
  }
  if (hookFiles === 0) fail("codex_hooks_empty");

  let hooks;
  try {
    hooks = JSON.parse(readFileSync(join(root, ".codex/hooks.json"), "utf8"));
  } catch {
    fail("codex_hooks_json_invalid");
  }
  for (const event of ["PreToolUse", "PermissionRequest"]) {
    if (
      !Array.isArray(hooks?.hooks?.[event]) || hooks.hooks[event].length === 0
    ) {
      fail(`codex_hook_event_missing:${event}`);
    }
  }
  const hookTargets =
    JSON.stringify(hooks).match(/\.codex\/hooks\/[a-zA-Z0-9._/-]+/g) ?? [];
  if (hookTargets.length === 0) fail("codex_hook_command_missing");
  for (const target of new Set(hookTargets)) {
    if (target.includes("..")) fail("codex_hook_path_invalid");
    regularFile(join(root, target), `codex_hook_target_missing:${target}`);
  }

  const config = readFileSync(join(root, ".codex/config.toml"), "utf8");
  for (
    const setting of [
      /^approval_policy = "on-request"$/m,
      /^approvals_reviewer = "auto_review"$/m,
      /^default_permissions = "enval-dev"$/m,
      /^hooks = true$/m,
    ]
  ) {
    if (!setting.test(config)) fail("codex_config_baseline_invalid");
  }
  return Object.freeze({ hookFileCount: hookFiles });
}

export function deriveBatchSpec(slug, worktreesRoot = ENVAL_WORKTREES_ROOT) {
  if (
    typeof slug !== "string" || slug.length > 63 || !SLUG_PATTERN.test(slug)
  ) {
    fail("batch_slug_invalid");
  }
  const root = resolve(worktreesRoot);
  const worktree = resolve(root, slug);
  if (dirname(worktree) !== root) fail("leaf_worktree_invalid");
  return Object.freeze({ slug, branch: `autonomy/${slug}`, worktree });
}

export function deriveHerdrAgentName(slug) {
  if (
    typeof slug !== "string" || slug.length > 63 || !SLUG_PATTERN.test(slug)
  ) {
    fail("batch_slug_invalid");
  }
  const digest = createHash("sha256").update(slug).digest("hex").slice(0, 12);
  const name = `enval-${slug.slice(0, 13)}-${digest}`;
  if (!HERDR_AGENT_PATTERN.test(name)) fail("herdr_agent_name_invalid");
  return name;
}

function defaultRun(command, args, options) {
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

function checked(run, command, args, cwd, code) {
  const result = run(command, args, { cwd });
  if (result.error || result.status !== 0) fail(code);
  return String(result.stdout ?? "");
}

function herdrFailureCode(result, code) {
  try {
    const detail = JSON.parse(String(result.stderr ?? ""))?.error?.code;
    if (typeof detail === "string" && /^[a-zA-Z0-9._-]+$/.test(detail)) {
      return `${code}:${detail}`;
    }
  } catch {
    // Herdr syntax and process errors are not guaranteed to be JSON.
  }
  return code;
}

function herdrChecked(run, args, cwd, code) {
  const result = run("herdr", args, { cwd });
  if (result.error || result.status !== 0) {
    fail(herdrFailureCode(result, code));
  }
  return String(result.stdout ?? "");
}

function herdrResponse(run, args, cwd, expectedType, code) {
  const stdout = herdrChecked(
    run,
    ["--session", HERDR_SESSION, ...args],
    cwd,
    code,
  );
  let response;
  try {
    response = JSON.parse(stdout);
  } catch {
    fail(`${code}_response_invalid`);
  }
  if (response?.result?.type !== expectedType) {
    fail(`${code}_response_invalid`);
  }
  return response.result;
}

function git(run, root, args, code) {
  return checked(run, "git", ["-C", root, ...args], root, code);
}

function trackedClean(run, root, code) {
  if (
    git(
      run,
      root,
      ["status", "--porcelain=v1", "--untracked-files=no"],
      `${code}_inspection_failed`,
    ) !== ""
  ) fail(code);
}

function governanceTrackedAndClean(run, root) {
  if (
    git(
      run,
      root,
      [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        ".codex",
        "AGENTS.md",
      ],
      "governance_git_state_inspection_failed",
    ) !== ""
  ) fail("governance_not_tracked_and_clean");
}

function head(run, root) {
  const value = git(
    run,
    root,
    ["rev-parse", "--verify", "HEAD^{commit}"],
    "main_head_unavailable",
  ).trim();
  if (!/^[a-f0-9]{40,64}$/.test(value)) fail("main_head_invalid");
  return value;
}

function mainState(run, root, expectedHead = null) {
  if (
    git(
      run,
      root,
      ["branch", "--show-current"],
      "integration_branch_inspection_failed",
    ).trim() !== "main"
  ) fail("integration_branch_not_main");
  trackedClean(run, root, "main_tracked_dirty");
  const currentHead = head(run, root);
  if (expectedHead !== null && currentHead !== expectedHead) {
    fail("main_head_changed_during_launch");
  }
  return currentHead;
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function noConflicts(run, root, spec) {
  const branches = git(
    run,
    root,
    [
      "branch",
      "--all",
      "--list",
      "--format=%(refname)",
      spec.branch,
      `*/${spec.branch}`,
    ],
    "branch_conflict_inspection_failed",
  );
  if (branches.trim() !== "") fail("branch_conflict");

  const fields = git(
    run,
    root,
    ["worktree", "list", "--porcelain", "-z"],
    "worktree_conflict_inspection_failed",
  ).split("\0");
  if (
    fields.includes(`worktree ${spec.worktree}`) ||
    fields.includes(`branch refs/heads/${spec.branch}`)
  ) fail("worktree_conflict");
  if (pathExists(spec.worktree)) fail("worktree_path_exists");
}

function ensureWorktreesRoot(root) {
  if (!pathExists(root)) mkdirSync(root);
  const status = lstatSync(root);
  if (
    !status.isDirectory() || status.isSymbolicLink() ||
    realpathSync(root) !== resolve(root)
  ) fail("worktrees_root_invalid");
}

export function codexLaunchArgv(worktree) {
  return Object.freeze([
    "--cd",
    worktree,
    "--ask-for-approval",
    "on-request",
    "--config",
    'approvals_reviewer="auto_review"',
    "--config",
    'web_search="disabled"',
    "--enable",
    "hooks",
    "--strict-config",
  ]);
}

export function verifyHerdrCli(run = defaultRun, cwd = ENVAL_ROOT) {
  const version = herdrChecked(
    run,
    ["--version"],
    cwd,
    "herdr_cli_unavailable",
  ).trim();
  if (version !== `herdr ${HERDR_VERSION}`) {
    fail("herdr_version_unsupported");
  }

  const rootHelp = herdrChecked(
    run,
    ["--help"],
    cwd,
    "herdr_root_help_unavailable",
  );
  if (!rootHelp.includes("--session <name>")) {
    fail("herdr_session_semantics_unsupported");
  }

  const workspaceHelp = herdrChecked(
    run,
    ["workspace", "create", "--help"],
    cwd,
    "herdr_workspace_help_unavailable",
  );
  for (const expected of ["--cwd <PATH>", "--label <TEXT>", "--no-focus"]) {
    if (!workspaceHelp.includes(expected)) {
      fail("herdr_workspace_semantics_unsupported");
    }
  }

  const agentHelp = herdrChecked(
    run,
    ["agent", "start", "--help"],
    cwd,
    "herdr_agent_help_unavailable",
  );
  for (
    const expected of [
      "agent start <NAME>",
      "--kind <KIND>",
      "--pane <ID>",
      "[-- [AGENT_ARG]...]",
      "codex",
    ]
  ) {
    if (!agentHelp.includes(expected)) {
      fail("herdr_agent_semantics_unsupported");
    }
  }
  return Object.freeze({ version: HERDR_VERSION });
}

function ensureNoHerdrConflicts(run, cwd, spec, agentName) {
  const workspaceList = herdrResponse(
    run,
    ["workspace", "list"],
    cwd,
    "workspace_list",
    "herdr_workspace_list_failed",
  );
  if (!Array.isArray(workspaceList.workspaces)) {
    fail("herdr_workspace_list_response_invalid");
  }
  for (const workspace of workspaceList.workspaces) {
    const checkoutPath = workspace?.worktree?.checkout_path;
    if (
      workspace?.label === spec.slug ||
      (typeof checkoutPath === "string" &&
        resolve(checkoutPath) === spec.worktree)
    ) {
      fail("herdr_workspace_conflict");
    }
  }

  const agentList = herdrResponse(
    run,
    ["agent", "list"],
    cwd,
    "agent_list",
    "herdr_agent_list_failed",
  );
  if (!Array.isArray(agentList.agents)) {
    fail("herdr_agent_list_response_invalid");
  }
  if (agentList.agents.some((agent) => agent?.name === agentName)) {
    fail("herdr_agent_conflict");
  }
}

function createHerdrWorkspace(run, spec) {
  const result = herdrResponse(
    run,
    [
      "workspace",
      "create",
      "--cwd",
      spec.worktree,
      "--label",
      spec.slug,
      "--no-focus",
    ],
    spec.worktree,
    "workspace_created",
    "herdr_workspace_creation_failed",
  );
  const workspaceId = result.workspace?.workspace_id;
  const paneId = result.root_pane?.pane_id;
  if (
    typeof workspaceId !== "string" || workspaceId === "" ||
    typeof paneId !== "string" || paneId === "" ||
    result.workspace?.label !== spec.slug ||
    result.root_pane?.workspace_id !== workspaceId
  ) {
    fail("herdr_workspace_creation_response_invalid");
  }
  const returnedCwd = result.root_pane?.cwd;
  const returnedCheckout = result.workspace?.worktree?.checkout_path;
  if (
    !(
      typeof returnedCwd === "string" &&
      resolve(returnedCwd) === spec.worktree
    ) &&
    !(
      typeof returnedCheckout === "string" &&
      resolve(returnedCheckout) === spec.worktree
    )
  ) {
    fail("herdr_workspace_cwd_mismatch");
  }
  return Object.freeze({ workspaceId, paneId });
}

export function launchHerdrCodex(
  { run = defaultRun, args, cwd, agentName, paneId },
) {
  const result = herdrResponse(
    run,
    [
      "agent",
      "start",
      agentName,
      "--kind",
      "codex",
      "--pane",
      paneId,
      "--",
      ...args,
    ],
    cwd,
    "agent_started",
    "herdr_agent_start_failed",
  );
  if (
    result.agent?.name !== agentName ||
    result.agent?.pane_id !== paneId ||
    !Array.isArray(result.argv) ||
    result.argv.length < args.length ||
    JSON.stringify(result.argv.slice(-args.length)) !== JSON.stringify(args)
  ) {
    fail("herdr_agent_start_response_invalid");
  }
  return Object.freeze({ agentName, paneId });
}

export async function startBatch(slug, options = {}) {
  const configuredRoot = resolve(options.root ?? ENVAL_ROOT);
  let root;
  try {
    root = realpathSync(configuredRoot);
  } catch {
    fail("repository_root_missing");
  }
  if (root !== configuredRoot) fail("repository_root_not_canonical");

  const run = options.run ?? defaultRun;
  const worktreesRoot = resolve(options.worktreesRoot ?? ENVAL_WORKTREES_ROOT);
  const launch = options.launch ?? launchHerdrCodex;
  const spec = deriveBatchSpec(slug, worktreesRoot);
  const agentName = deriveHerdrAgentName(slug);
  if (
    git(
      run,
      root,
      ["rev-parse", "--show-toplevel"],
      "repository_identity_unavailable",
    ).trim() !== root
  ) fail("repository_identity_mismatch");

  const baseHead = mainState(run, root);
  governanceTrackedAndClean(run, root);
  validateGovernance(root);
  noConflicts(run, root, spec);
  checked(run, "codex", ["--version"], root, "codex_cli_unavailable");
  verifyHerdrCli(run, root);
  ensureNoHerdrConflicts(run, root, spec, agentName);

  mainState(run, root, baseHead);
  noConflicts(run, root, spec);
  ensureNoHerdrConflicts(run, root, spec, agentName);
  ensureWorktreesRoot(worktreesRoot);
  git(
    run,
    root,
    ["worktree", "add", "-b", spec.branch, spec.worktree, baseHead],
    "worktree_creation_failed",
  );

  if (
    git(
      run,
      spec.worktree,
      ["branch", "--show-current"],
      "created_branch_verification_failed",
    ).trim() !== spec.branch
  ) fail("created_branch_mismatch");
  if (head(run, spec.worktree) !== baseHead) fail("created_base_head_mismatch");
  trackedClean(run, spec.worktree, "created_worktree_tracked_dirty");
  governanceTrackedAndClean(run, spec.worktree);
  validateGovernance(spec.worktree);

  const herdrWorkspace = createHerdrWorkspace(run, spec);
  await launch({
    run,
    args: codexLaunchArgv(spec.worktree),
    cwd: spec.worktree,
    agentName,
    paneId: herdrWorkspace.paneId,
  });
  return Object.freeze({
    ...spec,
    baseHead,
    herdrSession: HERDR_SESSION,
    herdrWorkspace: herdrWorkspace.workspaceId,
    herdrAgent: agentName,
  });
}

export function formatBatchHandoff(result) {
  return [
    "ENVAL_BATCH_START=PASS",
    `BATCH=${result.slug}`,
    `BRANCH=${result.branch}`,
    `WORKTREE=${result.worktree}`,
    `HERDR_SESSION=${result.herdrSession}`,
    `HERDR_WORKSPACE=${result.herdrWorkspace}`,
    `HERDR_AGENT=${result.herdrAgent}`,
    `BASE_HEAD=${result.baseHead}`,
    `ATTACH_COMMAND=herdr session attach ${result.herdrSession}`,
    "",
  ].join("\n");
}

async function main(argv) {
  if (argv.length !== 2 || argv[0] !== "start") {
    fail("usage:start_<batch-slug>");
  }
  const result = await startBatch(argv[1]);
  process.stdout.write(formatBatchHandoff(result));
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof BatchLaunchError
      ? error.code
      : "unexpected_failure";
    process.stderr.write(`ENVAL_BATCH_START=FAIL\nFAILURE=${code}\n`);
    process.exitCode = 1;
  });
}
