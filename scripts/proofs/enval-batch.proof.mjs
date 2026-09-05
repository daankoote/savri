import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  APPROVED_BATCH_BINDINGS,
  BATCH_TABS,
  BatchLaunchError,
  CODEX_UPDATE_OVERRIDE,
  codexLaunchArgv,
  deriveBatchIdentity,
  deriveBatchSpec,
  formatBatchHandoff,
  HERDR_PROJECT,
  HERDR_SESSION,
  MAIN_TABS,
  PERSISTENT_WORKSPACE,
  startBatch,
  verifyCodexCli,
  verifyHerdrCli,
  writeProjectResult,
} from "../tools/enval-batch.mjs";

const temporaryRoots = [];

after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

function git(root, args) {
  const result = run("git", ["-C", root, ...args], { cwd: root });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return String(result.stdout ?? "").trim();
}

function writeGovernance(root, { omit = null } = {}) {
  const files = new Map([
    ["AGENTS.md", "# Fixture governance\n"],
    [
      ".codex/hooks.json",
      JSON.stringify({
        hooks: {
          PreToolUse: [{
            hooks: [{ command: "node .codex/hooks/router.mjs" }],
          }],
          PermissionRequest: [{
            hooks: [{ command: "node .codex/hooks/router.mjs" }],
          }],
        },
      }),
    ],
    [".codex/hooks/router.mjs", "export {};\n"],
    [
      ".codex/config.toml",
      [
        'approval_policy = "on-request"',
        'approvals_reviewer = "auto_review"',
        'default_permissions = "enval-dev"',
        "[features]",
        "hooks = true",
        "",
      ].join("\n"),
    ],
    [
      ".codex/rules/enval.rules",
      [
        ...["add", "commit", "push", "merge", "rebase", "reset", "clean"]
          .map((command) =>
            `prefix_rule(pattern = ["git", "${command}"], decision = "forbidden")`
          ),
        ...["branch", "worktree"].map((command) =>
          `prefix_rule(pattern = ["git", "${command}"], decision = "prompt")`
        ),
        "",
      ].join("\n"),
    ],
  ]);
  for (const [relativePath, contents] of files) {
    if (relativePath === omit) continue;
    const path = join(root, relativePath);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
}

function fixture(options = {}) {
  const parent = realpathSync(
    mkdtempSync(join(tmpdir(), "enval-batch-proof-")),
  );
  temporaryRoots.push(parent);
  const root = join(parent, "enval");
  const worktreesRoot = join(parent, "enval-worktrees");
  mkdirSync(root);
  git(root, ["init", "-b", "main"]);
  writeGovernance(root, options);
  writeFileSync(join(root, "fixture.txt"), "first\n");
  git(root, ["add", "."]);
  git(root, [
    "-c",
    "user.name=ENVAL Proof",
    "-c",
    "user.email=proof@invalid.local",
    "commit",
    "-m",
    "fixture",
  ]);
  return { parent, root, worktreesRoot };
}

function commandResult(stdout = "") {
  return { status: 0, stdout, stderr: "", error: null };
}

function herdrJson(result) {
  return commandResult(`${JSON.stringify({ id: "proof", result })}\n`);
}

function recordingRun(calls, options = {}) {
  const state = {
    workspaces: [...(options.workspaces ?? [])],
    agents: [...(options.agents ?? [])],
    tabs: [...(options.tabs ?? [])],
    panes: [...(options.panes ?? [])],
    nextWorkspace: 40,
  };
  const recorded = (command, args, commandOptions) => {
    calls.push({ command, args: [...args], cwd: commandOptions.cwd });
    if (command === "codex") return commandResult("codex-cli 0.0.0\n");
    if (command !== "herdr") return run(command, args, commandOptions);

    if (args.length === 1 && args[0] === "--version") {
      return commandResult(options.version ?? "herdr 0.8.2\n");
    }
    const help = new Map([
      ["--help", "Usage: herdr --session <name> [options]\n"],
      [
        "workspace create --help",
        "Usage: herdr workspace create [OPTIONS]\n--cwd <PATH>\n--label <TEXT>\n--no-focus\n",
      ],
      [
        "workspace rename --help",
        "Usage: herdr workspace rename <WORKSPACE_ID> <LABEL>...\n",
      ],
      ["tab rename --help", "Usage: herdr tab rename <TAB_ID> <LABEL>...\n"],
      [
        "tab list --help",
        "Usage: herdr tab list [OPTIONS]\n--workspace <WORKSPACE_ID>\n",
      ],
      [
        "tab create --help",
        "Usage: herdr tab create [OPTIONS]\n--workspace <WORKSPACE_ID>\n--cwd <PATH>\n--label <TEXT>\n--no-focus\n",
      ],
      [
        "pane list --help",
        "Usage: herdr pane list [OPTIONS]\n--workspace <WORKSPACE_ID>\n",
      ],
      [
        "agent start --help",
        "Usage: herdr agent start <NAME> --kind <KIND> --pane <ID> [-- [AGENT_ARG]...]\npossible values: codex\n",
      ],
    ]);
    if (help.has(args.join(" "))) {
      return commandResult(help.get(args.join(" ")));
    }

    assert.deepEqual(args.slice(0, 2), ["--session", HERDR_SESSION]);
    const sessionArgs = args.slice(2);
    if (sessionArgs.join(" ") === "workspace list") {
      if (!state.workspaces.some((item) => item.workspace_id === "w-main")) {
        state.workspaces.unshift({ workspace_id: "w-main", label: "Main" });
        state.tabs.unshift(
          { tab_id: "w-main:t1", workspace_id: "w-main", label: "Codex" },
          { tab_id: "w-main:t2", workspace_id: "w-main", label: "Terminal" },
        );
        state.panes.unshift(
          {
            pane_id: "w-main:p1",
            tab_id: "w-main:t1",
            workspace_id: "w-main",
            cwd: commandOptions.cwd,
          },
          {
            pane_id: "w-main:p2",
            tab_id: "w-main:t2",
            workspace_id: "w-main",
            cwd: commandOptions.cwd,
          },
        );
      }
      return herdrJson({
        type: "workspace_list",
        workspaces: state.workspaces,
      });
    }
    if (sessionArgs.join(" ") === "agent list") {
      return herdrJson({ type: "agent_list", agents: state.agents });
    }
    if (sessionArgs[0] === "workspace" && sessionArgs[1] === "rename") {
      const workspace = state.workspaces.find(
        (item) => item.workspace_id === sessionArgs[2],
      );
      assert.ok(workspace);
      workspace.label = sessionArgs.slice(3).join(" ");
      return herdrJson({ type: "workspace_renamed", workspace });
    }
    if (sessionArgs[0] === "workspace" && sessionArgs[1] === "create") {
      const cwd = sessionArgs[sessionArgs.indexOf("--cwd") + 1];
      const label = sessionArgs[sessionArgs.indexOf("--label") + 1];
      const workspaceId = `w${state.nextWorkspace++}`;
      const workspace = { workspace_id: workspaceId, label };
      const tab = { tab_id: `${workspaceId}:t1`, workspace_id: workspaceId };
      const pane = {
        pane_id: `${workspaceId}:p1`,
        tab_id: tab.tab_id,
        workspace_id: workspaceId,
        cwd,
      };
      state.workspaces.push(workspace);
      state.tabs.push(tab);
      state.panes.push(pane);
      return herdrJson({
        type: "workspace_created",
        workspace,
        tab,
        root_pane: pane,
      });
    }
    if (sessionArgs[0] === "tab" && sessionArgs[1] === "list") {
      const workspaceId = sessionArgs[sessionArgs.indexOf("--workspace") + 1];
      return herdrJson({
        type: "tab_list",
        tabs: state.tabs.filter((tab) => tab.workspace_id === workspaceId),
      });
    }
    if (sessionArgs[0] === "tab" && sessionArgs[1] === "rename") {
      const tab = state.tabs.find((item) => item.tab_id === sessionArgs[2]);
      assert.ok(tab);
      tab.label = sessionArgs.slice(3).join(" ");
      return herdrJson({ type: "tab_renamed", tab });
    }
    if (sessionArgs[0] === "tab" && sessionArgs[1] === "create") {
      const workspaceId = sessionArgs[sessionArgs.indexOf("--workspace") + 1];
      const cwd = sessionArgs[sessionArgs.indexOf("--cwd") + 1];
      const label = sessionArgs[sessionArgs.indexOf("--label") + 1];
      const tab = {
        tab_id: `${workspaceId}:t${state.tabs.length + 1}`,
        workspace_id: workspaceId,
        label,
      };
      const pane = {
        pane_id: `${workspaceId}:p-${label.toLowerCase()}`,
        tab_id: tab.tab_id,
        workspace_id: workspaceId,
        cwd,
      };
      state.tabs.push(tab);
      state.panes.push(pane);
      return herdrJson({ type: "tab_created", tab, root_pane: pane });
    }
    if (sessionArgs[0] === "pane" && sessionArgs[1] === "list") {
      const workspaceId = sessionArgs[sessionArgs.indexOf("--workspace") + 1];
      return herdrJson({
        type: "pane_list",
        panes: state.panes.filter((pane) => pane.workspace_id === workspaceId),
      });
    }
    if (sessionArgs[0] === "agent" && sessionArgs[1] === "start") {
      if (options.agentStartError) {
        return {
          status: 1,
          stdout: "",
          stderr: JSON.stringify({ error: { code: options.agentStartError } }),
          error: null,
        };
      }
      const name = sessionArgs[2];
      const paneId = sessionArgs[sessionArgs.indexOf("--pane") + 1];
      const nativeArgs = sessionArgs.slice(sessionArgs.indexOf("--") + 1);
      const pane = state.panes.find((item) => item.pane_id === paneId);
      assert.ok(pane);
      const agent = {
        name,
        pane_id: paneId,
        workspace_id: pane.workspace_id,
      };
      state.agents.push(agent);
      return herdrJson({
        type: "agent_started",
        agent,
        argv: ["codex", ...nativeArgs],
      });
    }
    assert.fail(`unexpected Herdr command: ${args.join(" ")}`);
  };
  recorded.herdrState = state;
  return recorded;
}

async function captureFailure(action) {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof BatchLaunchError);
    return error.code;
  }
  assert.fail("expected BatchLaunchError");
}

test("orchestrator registry owns the exact approved topology", () => {
  assert.equal(HERDR_PROJECT, "ENVAL");
  assert.equal(HERDR_SESSION, "ENVAL");
  assert.equal(PERSISTENT_WORKSPACE, "Main");
  assert.deepEqual(MAIN_TABS, ["Codex", "Terminal"]);
  assert.deepEqual(BATCH_TABS, ["Codex", "Terminal", "Reviewer"]);
  assert.deepEqual(APPROVED_BATCH_BINDINGS, {
    _Setup: { slug: "setup", branch: "setup", agentName: "enval-setup" },
    Beheer: { slug: "beheer", branch: "beheer", agentName: "enval-beheer" },
  });
  assert.deepEqual(deriveBatchIdentity("_Setup"), {
    workspaceName: "_Setup",
    ...APPROVED_BATCH_BINDINGS._Setup,
  });
  assert.deepEqual(deriveBatchSpec("beheer", "/tmp/worktrees", "beheer"), {
    slug: "beheer",
    branch: "beheer",
    worktree: "/tmp/worktrees/beheer",
  });
});

test("unapproved and alternate workspace names fail before commands", async () => {
  for (
    const workspace of [
      "Previous Beheer",
      "Beheer 2",
      "Autonomy Beheer",
      "beheer",
      "Dossiers",
      "Main",
    ]
  ) {
    const calls = [];
    assert.equal(
      await captureFailure(() =>
        startBatch(workspace, { run: recordingRun(calls) })
      ),
      "workspace_not_approved",
    );
    assert.equal(calls.length, 0);
  }
});

test("installed CLIs expose the required deterministic semantics", () => {
  assert.deepEqual(verifyHerdrCli(), { version: "0.8.2" });
  assert.match(verifyCodexCli().version, /^\d+\.\d+\.\d+/);
});

test("exact supplied workspace is provisioned without name leakage", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls);
  const result = await startBatch("Beheer", {
    root,
    worktreesRoot,
    run: batchRun,
  });

  assert.equal(result.workspaceName, "Beheer");
  assert.equal(result.branch, "beheer");
  assert.equal(result.workspaceReused, false);
  assert.equal(result.agentReused, false);
  assert.deepEqual(
    batchRun.herdrState.workspaces.map((workspace) => workspace.label),
    ["Main", "Beheer"],
  );
  assert.deepEqual(
    batchRun.herdrState.tabs.map((tab) => tab.label),
    ["Codex", "Terminal", "Codex", "Terminal", "Reviewer"],
  );
  const handoff = formatBatchHandoff(result);
  assert.equal(
    handoff,
    "ENVAL_BATCH_START=PASS\nPROJECT=ENVAL\nWORKSPACE=Beheer\nTABS=Codex,Terminal,Reviewer\n",
  );
  assert.doesNotMatch(
    handoff,
    /branch|worktree|agent|slug|autonomy|enval-beheer/i,
  );
  assert.deepEqual(codexLaunchArgv(result.worktree), [
    "--cd",
    result.worktree,
    "--ask-for-approval",
    "on-request",
    "--config",
    CODEX_UPDATE_OVERRIDE,
    "--config",
    'approvals_reviewer="auto_review"',
    "--config",
    'web_search="disabled"',
    "--enable",
    "hooks",
    "--strict-config",
  ]);
  const workspaceCreates = calls.filter((call) =>
    call.command === "herdr" && call.args[2] === "workspace" &&
    call.args[3] === "create"
  );
  assert.equal(workspaceCreates.length, 1);
  assert.equal(workspaceCreates[0].args.includes("Beheer"), true);
});

test("retry and dirty resume reuse workspace, worktree, tabs, and agent", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls);
  const first = await startBatch("Beheer", {
    root,
    worktreesRoot,
    run: batchRun,
  });
  writeFileSync(join(first.worktree, "fixture.txt"), "in progress\n");
  const second = await startBatch("Beheer", {
    root,
    worktreesRoot,
    run: batchRun,
  });

  assert.equal(second.herdrWorkspace, first.herdrWorkspace);
  assert.equal(second.workspaceReused, true);
  assert.equal(second.agentReused, true);
  assert.equal(batchRun.herdrState.workspaces.length, 2);
  assert.equal(
    calls.filter((call) =>
      call.command === "herdr" && call.args[2] === "workspace" &&
      call.args[3] === "create"
    ).length,
    1,
  );
  assert.equal(
    calls.filter((call) =>
      call.command === "git" && call.args[2] === "worktree" &&
      call.args[3] === "add"
    ).length,
    1,
  );
  assert.equal(
    calls.filter((call) =>
      call.command === "herdr" && call.args[2] === "agent" &&
      call.args[3] === "start"
    ).length,
    1,
  );
});

test("a workspace cannot share another workspace worktree binding", async () => {
  const { root, worktreesRoot } = fixture();
  const beheerPath = join(worktreesRoot, "beheer");
  const calls = [];
  const batchRun = recordingRun(calls, {
    workspaces: [{ workspace_id: "w-setup", label: "_Setup" }],
    tabs: [{ tab_id: "w-setup:t1", workspace_id: "w-setup", label: "Codex" }],
    panes: [{
      pane_id: "w-setup:p1",
      tab_id: "w-setup:t1",
      workspace_id: "w-setup",
      cwd: beheerPath,
    }],
  });
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", { root, worktreesRoot, run: batchRun })
    ),
    "herdr_workspace_binding_conflict",
  );
  assert.equal(
    calls.some((call) =>
      call.command === "git" && call.args[2] === "worktree" &&
      call.args[3] === "add"
    ),
    false,
  );
});

test("duplicate or unapproved Herdr workspaces fail closed", async (t) => {
  await t.test("duplicate approved label", async () => {
    const { root, worktreesRoot } = fixture();
    const batchRun = recordingRun([], {
      workspaces: [
        { workspace_id: "w-a", label: "Beheer" },
        { workspace_id: "w-b", label: "Beheer" },
      ],
    });
    assert.equal(
      await captureFailure(() =>
        startBatch("Beheer", { root, worktreesRoot, run: batchRun })
      ),
      "herdr_workspace_conflict",
    );
  });
  await t.test("unapproved human label", async () => {
    const { root, worktreesRoot } = fixture();
    const batchRun = recordingRun([], {
      workspaces: [{ workspace_id: "w-x", label: "Previous Beheer" }],
    });
    assert.equal(
      await captureFailure(() =>
        startBatch("Beheer", { root, worktreesRoot, run: batchRun })
      ),
      "herdr_unapproved_workspace",
    );
  });
});

test("both approved batch workspaces remain separate in one ENVAL project", async () => {
  const { root, worktreesRoot } = fixture();
  const batchRun = recordingRun([]);
  const beheer = await startBatch("Beheer", {
    root,
    worktreesRoot,
    run: batchRun,
  });
  const setup = await startBatch("_Setup", {
    root,
    worktreesRoot,
    run: batchRun,
  });
  assert.notEqual(beheer.herdrWorkspace, setup.herdrWorkspace);
  assert.deepEqual(
    batchRun.herdrState.workspaces.map((workspace) => workspace.label),
    ["Main", "Beheer", "_Setup"],
  );
});

test("the default root workspace is reconciled to Main without an alternate", async () => {
  const { root, worktreesRoot } = fixture();
  const batchRun = recordingRun([], {
    workspaces: [{ workspace_id: "w-main", label: "enval" }],
    tabs: [{ tab_id: "w-main:t1", workspace_id: "w-main" }],
    panes: [{
      pane_id: "w-main:p1",
      tab_id: "w-main:t1",
      workspace_id: "w-main",
      cwd: root,
    }],
  });
  await startBatch("Beheer", { root, worktreesRoot, run: batchRun });
  assert.deepEqual(
    batchRun.herdrState.workspaces.map((workspace) => workspace.label),
    ["Main", "Beheer"],
  );
  assert.deepEqual(
    batchRun.herdrState.tabs
      .filter((tab) => tab.workspace_id === "w-main")
      .map((tab) => tab.label),
    MAIN_TABS,
  );
});

test("tracked-dirty main is refused when an approved binding must be created", async () => {
  const { root, worktreesRoot } = fixture();
  writeFileSync(join(root, "fixture.txt"), "dirty\n");
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", {
        root,
        worktreesRoot,
        run: recordingRun(calls),
      })
    ),
    "main_tracked_dirty",
  );
  assert.equal(
    calls.some((call) =>
      call.command === "git" && call.args[2] === "worktree" &&
      call.args[3] === "add"
    ),
    false,
  );
});

test("an occupied assigned worktree path fails closed", async () => {
  const { root, worktreesRoot } = fixture();
  mkdirSync(worktreesRoot);
  mkdirSync(join(worktreesRoot, "beheer"));
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", {
        root,
        worktreesRoot,
        run: recordingRun([]),
      })
    ),
    "worktree_path_exists",
  );
});

test("unsupported Herdr fails before worktree creation", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", {
        root,
        worktreesRoot,
        run: recordingRun(calls, { version: "herdr 0.8.3\n" }),
      })
    ),
    "herdr_version_unsupported",
  );
  assert.equal(
    calls.some((call) =>
      call.command === "git" && call.args[2] === "worktree" &&
      call.args[3] === "add"
    ),
    false,
  );
});

test("unsupported Codex fails before Herdr or worktree mutation", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls);
  const refusingRun = (command, args, options) =>
    command === "codex"
      ? { status: 2, stdout: "", stderr: "unsupported", error: null }
      : batchRun(command, args, options);
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", { root, worktreesRoot, run: refusingRun })
    ),
    "codex_cli_override_preflight_failed",
  );
  assert.equal(calls.some((call) => call.command === "herdr"), false);
});

test("missing Codex governance baseline is refused before creation", async () => {
  const { root, worktreesRoot } = fixture({ omit: ".codex/config.toml" });
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", {
        root,
        worktreesRoot,
        run: recordingRun([]),
      })
    ),
    "governance_file_missing_or_invalid:.codex/config.toml",
  );
});

test("agent startup failure preserves the approved workspace and worktree", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls, { agentStartError: "agent_not_ready" });
  assert.equal(
    await captureFailure(() =>
      startBatch("Beheer", { root, worktreesRoot, run: batchRun })
    ),
    "herdr_agent_start_failed:agent_not_ready",
  );
  assert.equal(
    git(root, ["branch", "--list", "beheer"]).endsWith("beheer"),
    true,
  );
  assert.equal(
    git(join(worktreesRoot, "beheer"), ["branch", "--show-current"]),
    "beheer",
  );
  assert.deepEqual(
    batchRun.herdrState.workspaces.map((workspace) => workspace.label),
    ["Main", "Beheer"],
  );
  assert.equal(
    calls.some((call) =>
      call.command === "git" &&
      (["reset", "clean"].includes(call.args[2]) ||
        (call.args[2] === "worktree" &&
          ["remove", "prune"].includes(call.args[3])))
    ),
    false,
  );
});

test("project result writer atomically updates only the stable entrypoint", () => {
  const { parent } = fixture();
  const resultFile = join(parent, ".herdr-results", "ENVAL", "latest.txt");
  const first = "HERDR_TOPOLOGY01_STATUS=PASS\nFILES_CHANGED=proof\n";
  const second = "NEXT_BATCH_STATUS=PARTIAL\nREASON=proof\n";
  assert.equal(writeProjectResult(first, resultFile), resultFile);
  assert.equal(readFileSync(resultFile, "utf8"), first);
  writeProjectResult(second, resultFile);
  assert.equal(readFileSync(resultFile, "utf8"), second);
  assert.throws(() => writeProjectResult("not a return block\n", resultFile), {
    code: "project_result_invalid",
  });

  const isolatedHome = join(parent, "home");
  mkdirSync(isolatedHome);
  const cliResult = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../tools/enval-batch.mjs", import.meta.url)),
      "result",
    ],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: isolatedHome },
      input: first,
    },
  );
  assert.equal(cliResult.status, 0, cliResult.stderr);
  assert.equal(
    readFileSync(
      join(isolatedHome, ".herdr-results", "ENVAL", "latest.txt"),
      "utf8",
    ),
    first,
  );
  assert.match(
    cliResult.stdout,
    /RESULT_FILE=~\/\.herdr-results\/ENVAL\/latest\.txt/,
  );
});

test("permanent authorities document topology, Git, lean handoffs, and results", () => {
  const governance = readFileSync(
    new URL("../../AGENTS.md", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../../docs/app/operations/git-workflow.md", import.meta.url),
    "utf8",
  );
  for (
    const required of [
      "The current exact orchestrator-owned ENVAL topology",
      "No other human workspace name",
      "Main -> Terminal",
      "~/.herdr-results/ENVAL/latest.txt",
      "never requires Daan to shuttle messages",
      "Lean handoffs remain task-delta-only",
    ]
  ) assert.ok(governance.includes(required), required);
  for (
    const required of [
      "A new workspace requires",
      "Previous Beheer",
      "One human workspace has at most one active",
      "Main -> Terminal",
      "Daan performs commits, cherry-picks, and pushes",
      "node scripts/tools/enval-batch.mjs result",
      "~/.herdr-results/ENVAL/latest.txt",
    ]
  ) assert.ok(workflow.includes(required), required);
});

test("launcher source has no shell, cleanup, commit, or push authority", () => {
  const source = readFileSync(
    new URL("../tools/enval-batch.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.doesNotMatch(source, /\b(?:rmSync|unlinkSync|rmdirSync)\b/);
  assert.doesNotMatch(source, /\["(?:commit|push|deploy|remove|prune|clean)"/);
});
