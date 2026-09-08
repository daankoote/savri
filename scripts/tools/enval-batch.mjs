#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  beginResultRun,
  ENVAL_WORKSPACE_REGISTRY,
  finalizeActiveRun,
  ResultPublicationError,
  validateWorkspaceState,
} from "./enval-result.mjs";

export const ENVAL_ROOT = "/Users/daankoote/dev/enval";
export const ENVAL_WORKTREES_ROOT = "/Users/daankoote/dev/enval-worktrees";
export const HERDR_PROJECT = "ENVAL";
export const HERDR_SESSION = HERDR_PROJECT;
export const HERDR_VERSION = "0.8.2";
export const PERSISTENT_WORKSPACE = "Main";
export const MAIN_TABS = Object.freeze(["Codex", "Terminal"]);
export const BATCH_TABS = Object.freeze(["Codex", "Terminal", "Reviewer"]);
export const APPROVED_WORKSPACE_BINDINGS = ENVAL_WORKSPACE_REGISTRY;
export const APPROVED_BATCH_BINDINGS = Object.freeze({
  _Setup: APPROVED_WORKSPACE_BINDINGS._Setup,
  Beheer: APPROVED_WORKSPACE_BINDINGS.Beheer,
});
export const CODEX_UPDATE_OVERRIDE = "check_for_update_on_startup=false";
export const CODEX_NOTIFY_OVERRIDE =
  'notify=["node",".codex/hooks/enval-permission-router.mjs","--notify"]';
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

function failureCode(error) {
  return error instanceof BatchLaunchError ||
      error instanceof ResultPublicationError
    ? error.code
    : "unexpected_failure";
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
  for (
    const event of [
      "PreToolUse",
      "PermissionRequest",
      "UserPromptSubmit",
      "Stop",
      "Interrupt",
      "SessionEnd",
    ]
  ) {
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

export function deriveBatchSpec(
  slug,
  worktreesRoot = ENVAL_WORKTREES_ROOT,
  branch = slug,
) {
  if (
    typeof slug !== "string" || slug.length > 63 || !SLUG_PATTERN.test(slug) ||
    typeof branch !== "string" || branch.length > 63 ||
    !SLUG_PATTERN.test(branch)
  ) {
    fail("batch_slug_invalid");
  }
  const root = resolve(worktreesRoot);
  const worktree = resolve(root, slug);
  if (dirname(worktree) !== root) fail("leaf_worktree_invalid");
  return Object.freeze({ slug, branch, worktree });
}

export function deriveBatchIdentity(workspaceName) {
  const binding = typeof workspaceName === "string"
    ? APPROVED_BATCH_BINDINGS[workspaceName]
    : null;
  if (!binding) fail("workspace_not_approved");
  if (!HERDR_AGENT_PATTERN.test(binding.agentName)) {
    fail("herdr_agent_name_invalid");
  }
  deriveBatchSpec(binding.slug, ENVAL_WORKTREES_ROOT, binding.branch);
  return Object.freeze({ workspaceName, ...binding });
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

function worktreeBindings(run, root) {
  const output = git(
    run,
    root,
    ["worktree", "list", "--porcelain", "-z"],
    "worktree_binding_inspection_failed",
  );
  const records = [];
  let record = null;
  for (const field of output.split("\0")) {
    if (field.startsWith("worktree ")) {
      if (record) records.push(record);
      record = { path: resolve(field.slice("worktree ".length)) };
    } else if (record && field.startsWith("branch ")) {
      record.branch = field.slice("branch refs/heads/".length);
    }
  }
  if (record) records.push(record);
  return records;
}

function ensureWorktreesRoot(root) {
  if (!pathExists(root)) mkdirSync(root);
  const status = lstatSync(root);
  if (
    !status.isDirectory() || status.isSymbolicLink() ||
    realpathSync(root) !== resolve(root)
  ) fail("worktrees_root_invalid");
}

function ensureAssignedWorktree(run, root, spec) {
  const bindings = worktreeBindings(run, root);
  const byPath = bindings.filter((binding) => binding.path === spec.worktree);
  const byBranch = bindings.filter((binding) => binding.branch === spec.branch);
  if (byPath.length > 1 || byBranch.length > 1) {
    fail("worktree_binding_conflict");
  }
  if (byPath.length === 1 || byBranch.length === 1) {
    if (
      byPath.length !== 1 || byBranch.length !== 1 ||
      byPath[0] !== byBranch[0]
    ) fail("worktree_binding_conflict");
    return Object.freeze({ created: false, head: head(run, spec.worktree) });
  }
  if (pathExists(spec.worktree)) fail("worktree_path_exists");

  const existingBranch = git(
    run,
    root,
    ["branch", "--list", "--format=%(refname)", spec.branch],
    "branch_binding_inspection_failed",
  ).trim();
  ensureWorktreesRoot(dirname(spec.worktree));
  if (existingBranch === `refs/heads/${spec.branch}`) {
    git(
      run,
      root,
      ["worktree", "add", spec.worktree, spec.branch],
      "worktree_reconciliation_failed",
    );
  } else if (existingBranch === "") {
    const baseHead = mainState(run, root);
    git(
      run,
      root,
      ["worktree", "add", "-b", spec.branch, spec.worktree, baseHead],
      "worktree_creation_failed",
    );
  } else {
    fail("branch_binding_conflict");
  }
  return Object.freeze({ created: true, head: head(run, spec.worktree) });
}

export function codexLaunchArgv(worktree) {
  return Object.freeze([
    "--cd",
    worktree,
    "--ask-for-approval",
    "on-request",
    "--config",
    CODEX_UPDATE_OVERRIDE,
    "--config",
    'approvals_reviewer="auto_review"',
    "--config",
    'web_search="disabled"',
    "--config",
    CODEX_NOTIFY_OVERRIDE,
    "--enable",
    "hooks",
    "--strict-config",
  ]);
}

export function verifyCodexCli(run = defaultRun, cwd = ENVAL_ROOT) {
  const version = checked(
    run,
    "codex",
    ["--config", CODEX_UPDATE_OVERRIDE, "--strict-config", "--version"],
    cwd,
    "codex_cli_override_preflight_failed",
  ).trim();
  if (!/^codex-cli \d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    fail("codex_cli_version_invalid");
  }
  return Object.freeze({ version: version.slice("codex-cli ".length) });
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

  const workspaceRenameHelp = herdrChecked(
    run,
    ["workspace", "rename", "--help"],
    cwd,
    "herdr_workspace_rename_help_unavailable",
  );
  if (
    !workspaceRenameHelp.includes(
      "workspace rename <WORKSPACE_ID> <LABEL>...",
    )
  ) {
    fail("herdr_workspace_rename_semantics_unsupported");
  }

  const tabRenameHelp = herdrChecked(
    run,
    ["tab", "rename", "--help"],
    cwd,
    "herdr_tab_rename_help_unavailable",
  );
  if (!tabRenameHelp.includes("tab rename <TAB_ID> <LABEL>...")) {
    fail("herdr_tab_rename_semantics_unsupported");
  }

  const tabListHelp = herdrChecked(
    run,
    ["tab", "list", "--help"],
    cwd,
    "herdr_tab_list_help_unavailable",
  );
  if (!tabListHelp.includes("--workspace <WORKSPACE_ID>")) {
    fail("herdr_tab_list_semantics_unsupported");
  }

  const tabCreateHelp = herdrChecked(
    run,
    ["tab", "create", "--help"],
    cwd,
    "herdr_tab_create_help_unavailable",
  );
  for (
    const expected of [
      "--workspace <WORKSPACE_ID>",
      "--cwd <PATH>",
      "--label <TEXT>",
      "--no-focus",
    ]
  ) {
    if (!tabCreateHelp.includes(expected)) {
      fail("herdr_tab_create_semantics_unsupported");
    }
  }

  const paneListHelp = herdrChecked(
    run,
    ["pane", "list", "--help"],
    cwd,
    "herdr_pane_list_help_unavailable",
  );
  if (!paneListHelp.includes("--workspace <WORKSPACE_ID>")) {
    fail("herdr_pane_list_semantics_unsupported");
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

function listHerdrWorkspaces(run, cwd) {
  const result = herdrResponse(
    run,
    ["workspace", "list"],
    cwd,
    "workspace_list",
    "herdr_workspace_list_failed",
  );
  if (!Array.isArray(result.workspaces)) {
    fail("herdr_workspace_list_response_invalid");
  }
  return result.workspaces;
}

function listHerdrTabs(run, cwd, workspaceId) {
  const result = herdrResponse(
    run,
    ["tab", "list", "--workspace", workspaceId],
    cwd,
    "tab_list",
    "herdr_tab_list_failed",
  );
  if (!Array.isArray(result.tabs)) fail("herdr_tab_list_response_invalid");
  return result.tabs;
}

function listHerdrPanes(run, cwd, workspaceId) {
  const result = herdrResponse(
    run,
    ["pane", "list", "--workspace", workspaceId],
    cwd,
    "pane_list",
    "herdr_pane_list_failed",
  );
  if (!Array.isArray(result.panes)) fail("herdr_pane_list_response_invalid");
  return result.panes;
}

function reconcileStandardTabs(run, spec, workspaceId, expectedTabs) {
  let tabs = listHerdrTabs(run, spec.worktree, workspaceId);
  for (const label of expectedTabs) {
    if (tabs.filter((tab) => tab?.label === label).length > 1) {
      fail("herdr_tab_duplicate");
    }
  }
  const unexpected = tabs.filter((tab) => !expectedTabs.includes(tab?.label));
  if (!tabs.some((tab) => tab?.label === expectedTabs[0])) {
    if (unexpected.length !== 1) fail("herdr_codex_tab_ambiguous");
    const tabId = unexpected[0]?.tab_id;
    if (typeof tabId !== "string" || tabId === "") {
      fail("herdr_codex_tab_response_invalid");
    }
    herdrChecked(
      run,
      [
        "--session",
        HERDR_SESSION,
        "tab",
        "rename",
        tabId,
        expectedTabs[0],
      ],
      spec.worktree,
      "herdr_codex_tab_rename_failed",
    );
    tabs = listHerdrTabs(run, spec.worktree, workspaceId);
  } else if (unexpected.length !== 0) {
    fail("herdr_unapproved_tab");
  }

  for (const label of expectedTabs.slice(1)) {
    if (tabs.some((tab) => tab?.label === label)) continue;
    herdrChecked(
      run,
      [
        "--session",
        HERDR_SESSION,
        "tab",
        "create",
        "--workspace",
        workspaceId,
        "--cwd",
        spec.worktree,
        "--label",
        label,
        "--no-focus",
      ],
      spec.worktree,
      `herdr_${label.toLowerCase()}_tab_creation_failed`,
    );
  }

  tabs = listHerdrTabs(run, spec.worktree, workspaceId);
  if (
    tabs.length !== expectedTabs.length ||
    expectedTabs.some(
      (label) => tabs.filter((tab) => tab?.label === label).length !== 1,
    )
  ) fail("herdr_tabs_reconciliation_failed");

  const panes = listHerdrPanes(run, spec.worktree, workspaceId);
  if (panes.length !== expectedTabs.length) fail("herdr_panes_ambiguous");
  for (const pane of panes) {
    if (
      typeof pane?.cwd !== "string" || resolve(pane.cwd) !== spec.worktree ||
      !tabs.some((tab) => tab?.tab_id === pane?.tab_id)
    ) fail("herdr_workspace_binding_conflict");
  }
  const codexTab = tabs.find((tab) => tab.label === expectedTabs[0]);
  const codexPanes = panes.filter((pane) => pane.tab_id === codexTab.tab_id);
  if (codexPanes.length !== 1 || typeof codexPanes[0]?.pane_id !== "string") {
    fail("herdr_codex_pane_ambiguous");
  }
  return Object.freeze({
    workspaceId,
    tabId: codexTab.tab_id,
    paneId: codexPanes[0].pane_id,
  });
}

function ensurePersistentWorkspace(run, root) {
  const workspaces = listHerdrWorkspaces(run, root);
  const named = workspaces.filter(
    (workspace) => workspace?.label === PERSISTENT_WORKSPACE,
  );
  if (named.length > 1) fail("herdr_main_workspace_conflict");
  let workspace = named[0];
  if (!workspace) {
    const rootWorkspaces = workspaces.filter((candidate) => {
      const workspaceId = candidate?.workspace_id;
      if (typeof workspaceId !== "string" || workspaceId === "") return false;
      const panes = listHerdrPanes(run, root, workspaceId);
      return panes.length > 0 && panes.every(
        (pane) => typeof pane?.cwd === "string" && resolve(pane.cwd) === root,
      );
    });
    if (rootWorkspaces.length !== 1) fail("herdr_main_workspace_missing");
    workspace = rootWorkspaces[0];
    herdrChecked(
      run,
      [
        "--session",
        HERDR_SESSION,
        "workspace",
        "rename",
        workspace.workspace_id,
        PERSISTENT_WORKSPACE,
      ],
      root,
      "herdr_main_workspace_rename_failed",
    );
  }
  const workspaceId = workspace?.workspace_id;
  if (typeof workspaceId !== "string" || workspaceId === "") {
    fail("herdr_main_workspace_response_invalid");
  }
  return reconcileStandardTabs(
    run,
    { worktree: root },
    workspaceId,
    MAIN_TABS,
  );
}

function findAssignedWorkspace(run, root, spec) {
  const workspaces = listHerdrWorkspaces(run, root);
  const approved = new Set([
    PERSISTENT_WORKSPACE,
    ...Object.keys(APPROVED_BATCH_BINDINGS),
  ]);
  if (workspaces.some((workspace) => !approved.has(workspace?.label))) {
    fail("herdr_unapproved_workspace");
  }
  const assigned = workspaces.filter(
    (workspace) => workspace?.label === spec.workspaceName,
  );
  if (assigned.length > 1) fail("herdr_workspace_conflict");
  for (const workspace of workspaces) {
    const workspaceId = workspace?.workspace_id;
    if (typeof workspaceId !== "string" || workspaceId === "") {
      fail("herdr_workspace_list_response_invalid");
    }
    const panes = listHerdrPanes(run, root, workspaceId);
    if (
      workspace !== assigned[0] &&
      panes.some(
        (pane) =>
          typeof pane?.cwd === "string" &&
          resolve(pane.cwd) === spec.worktree,
      )
    ) {
      fail("herdr_workspace_binding_conflict");
    }
  }
  return assigned[0] ?? null;
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
      spec.workspaceName,
      "--no-focus",
    ],
    spec.worktree,
    "workspace_created",
    "herdr_workspace_creation_failed",
  );
  const workspaceId = result.workspace?.workspace_id;
  const tabId = result.tab?.tab_id;
  const paneId = result.root_pane?.pane_id;
  if (
    typeof workspaceId !== "string" || workspaceId === "" ||
    typeof tabId !== "string" || tabId === "" ||
    typeof paneId !== "string" || paneId === "" ||
    result.workspace?.label !== spec.workspaceName ||
    result.tab?.workspace_id !== workspaceId ||
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
  return Object.freeze({ workspaceId, tabId, paneId });
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

export async function startBatch(workspaceName, options = {}) {
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
  const identity = deriveBatchIdentity(workspaceName);
  const spec = Object.freeze({
    ...deriveBatchSpec(identity.slug, worktreesRoot, identity.branch),
    workspaceName: identity.workspaceName,
    agentName: identity.agentName,
  });
  if (
    git(
      run,
      root,
      ["rev-parse", "--show-toplevel"],
      "repository_identity_unavailable",
    ).trim() !== root
  ) fail("repository_identity_mismatch");

  validateWorkspaceState(run, root, PERSISTENT_WORKSPACE);
  governanceTrackedAndClean(run, root);
  validateGovernance(root);
  verifyCodexCli(run, root);
  verifyHerdrCli(run, root);
  ensurePersistentWorkspace(run, root);
  const existingWorkspace = findAssignedWorkspace(run, root, spec);

  const worktree = ensureAssignedWorktree(run, root, spec);

  if (
    git(
      run,
      spec.worktree,
      ["branch", "--show-current"],
      "created_branch_verification_failed",
    ).trim() !== spec.branch
  ) fail("created_branch_mismatch");
  if (head(run, spec.worktree) !== worktree.head) {
    fail("created_base_head_mismatch");
  }
  if (worktree.created) {
    trackedClean(run, spec.worktree, "created_worktree_tracked_dirty");
  }
  validateWorkspaceState(run, spec.worktree, workspaceName);
  validateGovernance(spec.worktree);

  const createdWorkspace = existingWorkspace
    ? null
    : createHerdrWorkspace(run, spec);
  const workspaceId = existingWorkspace?.workspace_id ??
    createdWorkspace.workspaceId;
  const herdrWorkspace = reconcileStandardTabs(
    run,
    spec,
    workspaceId,
    BATCH_TABS,
  );

  const agentList = herdrResponse(
    run,
    ["agent", "list"],
    spec.worktree,
    "agent_list",
    "herdr_agent_list_failed",
  );
  if (!Array.isArray(agentList.agents)) {
    fail("herdr_agent_list_response_invalid");
  }
  const workspaceAgents = agentList.agents.filter(
    (agent) => agent?.workspace_id === workspaceId,
  );
  if (workspaceAgents.length > 1) fail("herdr_workspace_agent_conflict");
  if (
    agentList.agents.some(
      (agent) =>
        agent?.name === spec.agentName &&
        agent?.workspace_id !== workspaceId,
    )
  ) fail("herdr_agent_conflict");
  let agentReused = false;
  if (workspaceAgents.length === 1) {
    const agent = workspaceAgents[0];
    if (
      agent?.name !== spec.agentName ||
      agent?.pane_id !== herdrWorkspace.paneId
    ) fail("herdr_workspace_agent_conflict");
    agentReused = true;
  } else {
    await launch({
      run,
      args: codexLaunchArgv(spec.worktree),
      cwd: spec.worktree,
      agentName: spec.agentName,
      paneId: herdrWorkspace.paneId,
    });
  }
  return Object.freeze({
    ...spec,
    baseHead: worktree.head,
    herdrSession: HERDR_SESSION,
    herdrWorkspace: workspaceId,
    herdrAgent: spec.agentName,
    workspaceReused: existingWorkspace !== null,
    agentReused,
    tabs: BATCH_TABS,
  });
}

export function formatBatchHandoff(result) {
  return [
    "ENVAL_BATCH_START=PASS",
    `PROJECT=${HERDR_PROJECT}`,
    `WORKSPACE=${result.workspaceName}`,
    `TABS=${result.tabs.join(",")}`,
    "",
  ].join("\n");
}

async function main(argv) {
  if (argv.length === 2 && argv[0] === "start") {
    const identity = deriveBatchIdentity(argv[1]);
    const publication = beginResultRun({
      workspace: argv[1],
      runId: `launcher-${randomUUID()}`,
      tasklabel: "batch-launch",
      branch: identity.branch,
      cwd: ENVAL_ROOT,
    });
    try {
      const result = await startBatch(argv[1]);
      const handoff = formatBatchHandoff(result);
      finalizeActiveRun(argv[1], "PASS", { finalReturn: handoff });
      process.stdout.write(handoff + `RUN_ID=${publication.context.runId}\n`);
    } catch (error) {
      const code = failureCode(error);
      const failure = `ENVAL_BATCH_START_STATUS=FAIL\nFAILURE=${code}\n`;
      finalizeActiveRun(argv[1], "FAIL", { finalReturn: failure });
      process.stderr.write(failure);
      process.exitCode = 1;
    }
    return;
  }
  fail("usage:start_<approved-workspace>");
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    const code = failureCode(error);
    process.stderr.write(`ENVAL_BATCH_START=FAIL\nFAILURE=${code}\n`);
    process.exitCode = 1;
  });
}
