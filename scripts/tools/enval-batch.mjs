#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENVAL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const CANONICAL_REPOSITORY = "/Users/daankoote/dev/enval";
export const HERDR_PROJECT = "ENVAL";
export const HERDR_SESSION = HERDR_PROJECT;
export const HERDR_VERSION = "0.8.2";
export const CANONICAL_WORKSPACE = "Enval";
export const CANONICAL_BRANCH = "main";
export const CANONICAL_TABS = Object.freeze(["Codex", "Terminal"]);
export const PRIMARY_AGENT = "enval-main";
export const CODEX_UPDATE_OVERRIDE = "check_for_update_on_startup=false";
const LEGACY_WORKSPACES = new Set(["Main", "Beheer", "beheer", "_Setup"]);
const GOVERNANCE_FILES = Object.freeze([
  "AGENTS.md",
  ".codex/config.toml",
  ".codex/rules/enval.rules",
  ".codex/agents/reviewer.toml",
  ".codex/agents/ui_reviewer.toml",
  ".codex/agents/docs_reviewer.toml",
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
  return error instanceof BatchLaunchError ? error.code : "unexpected_failure";
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

  const config = readFileSync(join(root, ".codex/config.toml"), "utf8");
  for (
    const setting of [
      /^approval_policy = "on-request"$/m,
      /^approvals_reviewer = "auto_review"$/m,
      /^default_permissions = "enval-dev"$/m,
      /^enabled = true$/m,
      /^max_concurrent_threads_per_session = 2$/m,
    ]
  ) {
    if (!setting.test(config)) fail("codex_config_baseline_invalid");
  }
  const instructions = readFileSync(join(root, "AGENTS.md"), "utf8");
  for (const rule of [/`enval-main`/, /General\/Primary/, /only writer/]) {
    if (!rule.test(instructions)) fail("agent_topology_contract_invalid");
  }
  const reviewerProfiles = new Map([
    [".codex/agents/reviewer.toml", "reviewer"],
    [".codex/agents/ui_reviewer.toml", "ui_reviewer"],
    [".codex/agents/docs_reviewer.toml", "docs_reviewer"],
  ]);
  for (const [file, name] of reviewerProfiles) {
    const profile = readFileSync(join(root, file), "utf8");
    if (
      !new RegExp(`^name = "${name}"$`, "m").test(profile) ||
      !/^sandbox_mode = "read-only"$/m.test(profile)
    ) {
      fail(`reviewer_profile_not_read_only:${file}`);
    }
  }
  return Object.freeze({ files: GOVERNANCE_FILES });
}

export function deriveBatchIdentity(workspaceName) {
  if (workspaceName !== CANONICAL_WORKSPACE) fail("workspace_name_invalid");
  return Object.freeze({
    workspaceName: CANONICAL_WORKSPACE,
    branch: CANONICAL_BRANCH,
    agentName: PRIMARY_AGENT,
  });
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
    ).trim() !== CANONICAL_BRANCH
  ) fail("integration_branch_not_main");
  trackedClean(run, root, "main_tracked_dirty");
  const currentHead = head(run, root);
  if (expectedHead !== null && currentHead !== expectedHead) {
    fail("main_head_changed_during_launch");
  }
  return currentHead;
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
    'web_search="disabled"',
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
  if (tabs.some((tab) => tab?.label === "Reviewer")) {
    fail("herdr_permanent_reviewer_rejected");
  }
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

function ensureCanonicalWorkspace(run, root) {
  const workspaces = listHerdrWorkspaces(run, root);
  if (workspaces.some((workspace) => LEGACY_WORKSPACES.has(workspace?.label))) {
    fail("herdr_legacy_workspace_rejected");
  }
  const named = workspaces.filter(
    (workspace) => workspace?.label === CANONICAL_WORKSPACE,
  );
  if (named.length > 1) fail("herdr_canonical_workspace_conflict");
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
    if (rootWorkspaces.length !== 1) fail("herdr_canonical_workspace_missing");
    workspace = rootWorkspaces[0];
    herdrChecked(
      run,
      [
        "--session",
        HERDR_SESSION,
        "workspace",
        "rename",
        workspace.workspace_id,
        CANONICAL_WORKSPACE,
      ],
      root,
      "herdr_canonical_workspace_rename_failed",
    );
  }
  const workspaceId = workspace?.workspace_id;
  if (typeof workspaceId !== "string" || workspaceId === "") {
    fail("herdr_canonical_workspace_response_invalid");
  }
  return reconcileStandardTabs(
    run,
    { worktree: root },
    workspaceId,
    CANONICAL_TABS,
  );
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
  if (options.root === undefined && root !== CANONICAL_REPOSITORY) {
    fail("repository_root_not_canonical");
  }

  const run = options.run ?? defaultRun;
  const launch = options.launch ?? launchHerdrCodex;
  const identity = deriveBatchIdentity(workspaceName);
  const spec = Object.freeze({
    worktree: root,
    workspaceName: identity.workspaceName,
    branch: identity.branch,
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

  governanceTrackedAndClean(run, root);
  validateGovernance(root);
  const baseHead = mainState(run, root);
  verifyCodexCli(run, root);
  verifyHerdrCli(run, root);
  const herdrWorkspace = ensureCanonicalWorkspace(run, root);
  const workspaceId = herdrWorkspace.workspaceId;

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
    baseHead,
    herdrSession: HERDR_SESSION,
    herdrWorkspace: workspaceId,
    herdrAgent: spec.agentName,
    workspaceReused: true,
    agentReused,
    tabs: CANONICAL_TABS,
  });
}

export function formatBatchHandoff(result) {
  return [
    "ENVAL_BATCH_START=PASS",
    `PROJECT=${HERDR_PROJECT}`,
    `WORKSPACE=${result.workspaceName}`,
    `TABS=${result.tabs.join(",")}`,
    `AGENT=${result.herdrAgent}`,
    `REPOSITORY=${result.worktree}`,
    `BRANCH=${result.branch}`,
    "",
  ].join("\n");
}

async function main(argv) {
  if (argv.length === 2 && argv[0] === "start") {
    try {
      const result = await startBatch(argv[1]);
      process.stdout.write(formatBatchHandoff(result));
    } catch (error) {
      const code = failureCode(error);
      const failure = `ENVAL_BATCH_START_STATUS=FAIL\nFAILURE=${code}\n`;
      process.stderr.write(failure);
      process.exitCode = 1;
    }
    return;
  }
  fail("usage:start_<workspace>");
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
