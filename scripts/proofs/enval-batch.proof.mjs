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

import {
  BATCH_TABS,
  BatchLaunchError,
  codexLaunchArgv,
  deriveBatchIdentity,
  deriveBatchSpec,
  deriveHerdrAgentName,
  formatBatchHandoff,
  HERDR_PROJECT,
  HERDR_SESSION,
  PERSISTENT_WORKSPACE,
  startBatch,
  verifyHerdrCli,
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
        ...["add", "commit", "push", "merge", "rebase", "reset", "clean"].map(
          (command) =>
            `prefix_rule(pattern = ["git", "${command}"], decision = "forbidden")`,
        ),
        ...["branch", "worktree"].map(
          (command) =>
            `prefix_rule(pattern = ["git", "${command}"], decision = "prompt")`,
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

function fakeCodex() {
  return { status: 0, stdout: "codex-cli proof\n", stderr: "", error: null };
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
    tabs: [],
    nextWorkspace: 40,
  };
  const recorded = (command, args, commandOptions) => {
    calls.push({ command, args: [...args], cwd: commandOptions.cwd });
    if (command === "codex") return fakeCodex();
    if (command !== "herdr") return run(command, args, commandOptions);

    if (args.length === 1 && args[0] === "--version") {
      return commandResult(options.version ?? "herdr 0.8.2\n");
    }
    if (args.length === 1 && args[0] === "--help") {
      return commandResult(
        options.rootHelp ?? "Usage: herdr --session <name> [options]\n",
      );
    }
    if (args.join(" ") === "workspace create --help") {
      return commandResult(
        options.workspaceHelp ??
          "Usage: herdr workspace create [OPTIONS]\n--cwd <PATH>\n--label <TEXT>\n--no-focus\n",
      );
    }
    if (args.join(" ") === "workspace rename --help") {
      return commandResult(
        options.workspaceRenameHelp ??
          "Usage: herdr workspace rename <WORKSPACE_ID> <LABEL>...\n",
      );
    }
    if (args.join(" ") === "tab rename --help") {
      return commandResult(
        options.tabRenameHelp ??
          "Usage: herdr tab rename <TAB_ID> <LABEL>...\n",
      );
    }
    if (args.join(" ") === "tab list --help") {
      return commandResult(
        options.tabListHelp ??
          "Usage: herdr tab list [OPTIONS]\n--workspace <WORKSPACE_ID>\n",
      );
    }
    if (args.join(" ") === "tab create --help") {
      return commandResult(
        options.tabCreateHelp ??
          "Usage: herdr tab create [OPTIONS]\n--workspace <WORKSPACE_ID>\n--cwd <PATH>\n--label <TEXT>\n--no-focus\n",
      );
    }
    if (args.join(" ") === "agent start --help") {
      return commandResult(
        options.agentHelp ??
          "Usage: herdr agent start <NAME> --kind <KIND> --pane <ID> [-- [AGENT_ARG]...]\npossible values: codex\n",
      );
    }

    assert.deepEqual(args.slice(0, 2), ["--session", HERDR_SESSION]);
    const sessionArgs = args.slice(2);
    if (sessionArgs.join(" ") === "workspace list") {
      if (
        !state.workspaces.some(
          (workspace) =>
            workspace.worktree?.checkout_path === commandOptions.cwd,
        )
      ) {
        state.workspaces.unshift({
          workspace_id: "w-main",
          label: "enval",
          worktree: { checkout_path: commandOptions.cwd },
        });
        state.tabs.unshift({
          tab_id: "w-main:t1",
          workspace_id: "w-main",
        });
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
    if (sessionArgs[0] === "tab" && sessionArgs[1] === "list") {
      const workspaceId = sessionArgs[sessionArgs.indexOf("--workspace") + 1];
      return herdrJson({
        type: "tab_list",
        tabs: state.tabs.filter((tab) => tab.workspace_id === workspaceId),
      });
    }
    if (sessionArgs[0] === "workspace" && sessionArgs[1] === "create") {
      const workspaceCwd = sessionArgs[sessionArgs.indexOf("--cwd") + 1];
      const label = sessionArgs[sessionArgs.indexOf("--label") + 1];
      const workspaceId = `w${state.nextWorkspace++}`;
      const workspace = {
        workspace_id: workspaceId,
        label,
        worktree: { checkout_path: workspaceCwd },
      };
      state.workspaces.push(workspace);
      const tab = { tab_id: `${workspaceId}:t7`, workspace_id: workspaceId };
      state.tabs.push(tab);
      return herdrJson({
        type: "workspace_created",
        workspace,
        tab,
        root_pane: {
          pane_id: `${workspaceId}:p93`,
          workspace_id: workspaceId,
          cwd: workspaceCwd,
        },
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
        tab_id: `${workspaceId}:t${state.tabs.length + 7}`,
        workspace_id: workspaceId,
        label,
      };
      state.tabs.push(tab);
      return herdrJson({
        type: "tab_created",
        tab,
        root_pane: {
          pane_id: `${workspaceId}:p-terminal`,
          workspace_id: workspaceId,
          cwd,
        },
      });
    }
    if (sessionArgs[0] === "agent" && sessionArgs[1] === "start") {
      if (options.agentStartError) {
        return {
          status: 1,
          stdout: "",
          stderr: JSON.stringify({
            id: "proof",
            error: { code: options.agentStartError, message: "proof failure" },
          }),
          error: null,
        };
      }
      const name = sessionArgs[2];
      const paneId = sessionArgs[sessionArgs.indexOf("--pane") + 1];
      const nativeArgs = sessionArgs.slice(sessionArgs.indexOf("--") + 1);
      const agent = { name, pane_id: paneId };
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

test("slug, branch, and leaf worktree derivation are deterministic", () => {
  const spec = deriveBatchSpec("gov-batch01", "/tmp/enval-worktrees");
  assert.equal(spec.branch, "autonomy/gov-batch01");
  assert.equal(spec.worktree, "/tmp/enval-worktrees/gov-batch01");
  for (
    const invalid of ["", "Gov-batch", "a/b", "a..b", "a_b", "a;touch-pwned"]
  ) {
    assert.throws(() => deriveBatchSpec(invalid), {
      name: "BatchLaunchError",
      code: "batch_slug_invalid",
    });
  }
});

test("human workspace names map to hidden technical slugs", () => {
  assert.deepEqual(deriveBatchIdentity("Beheer"), {
    workspaceName: "Beheer",
    slug: "beheer",
  });
  assert.deepEqual(deriveBatchIdentity("Mijn Dossiers", "dossiers-q3"), {
    workspaceName: "Mijn Dossiers",
    slug: "dossiers-q3",
  });
  assert.deepEqual(deriveBatchIdentity("Beheer V2", "beheer-v2", true), {
    workspaceName: "Beheer V2",
    slug: "beheer-v2",
  });
  for (
    const invalid of [
      "",
      "beheer",
      "operator-overview-v1",
      "Operator Overview V1",
      "BeheerV1",
      "autonomy/beheer",
      PERSISTENT_WORKSPACE,
    ]
  ) {
    assert.throws(() => deriveBatchIdentity(invalid), {
      name: "BatchLaunchError",
      code: "workspace_name_invalid",
    });
  }
});

test("Herdr agent names are deterministic, constrained, and collision-resistant", () => {
  const shortName = deriveHerdrAgentName("gov-herdr01");
  const longName = deriveHerdrAgentName("a".repeat(63));
  assert.equal(shortName, deriveHerdrAgentName("gov-herdr01"));
  assert.notEqual(shortName, deriveHerdrAgentName("gov-herdr02"));
  for (const name of [shortName, longName]) {
    assert.match(name, /^[a-z][a-z0-9_-]{0,31}$/);
    assert.ok(name.length <= 32);
  }
});

test("installed Herdr 0.8.2 exposes the launcher-required CLI semantics", () => {
  assert.deepEqual(verifyHerdrCli(), { version: "0.8.2" });
});

test("valid start uses current main HEAD and starts governed Codex through Herdr", async () => {
  const { root, worktreesRoot } = fixture();
  writeFileSync(join(root, "fixture.txt"), "second\n");
  git(root, ["add", "fixture.txt"]);
  git(root, [
    "-c",
    "user.name=ENVAL Proof",
    "-c",
    "user.email=proof@invalid.local",
    "commit",
    "-m",
    "current-main",
  ]);
  const expectedHead = git(root, ["rev-parse", "HEAD"]);
  const calls = [];
  const result = await startBatch("Proof Current", {
    root,
    worktreesRoot,
    run: recordingRun(calls),
  });

  assert.equal(result.baseHead, expectedHead);
  assert.equal(git(result.worktree, ["rev-parse", "HEAD"]), expectedHead);
  assert.equal(
    git(result.worktree, ["branch", "--show-current"]),
    result.branch,
  );
  assert.equal(result.herdrSession, HERDR_SESSION);
  assert.equal(result.herdrSession, HERDR_PROJECT);
  assert.equal(result.herdrWorkspace, "w40");
  assert.equal(result.herdrAgent, deriveHerdrAgentName("proof-current"));
  assert.deepEqual(result.tabs, BATCH_TABS);
  assert.equal(
    formatBatchHandoff(result),
    [
      "ENVAL_BATCH_START=PASS",
      "PROJECT=ENVAL",
      "WORKSPACE=Proof Current",
      "TABS=Codex,Terminal",
      "",
    ].join("\n"),
  );
  assert.doesNotMatch(
    formatBatchHandoff(result),
    /BATCH=|BRANCH=|WORKTREE=|HERDR_|AGENT=|autonomy\//,
  );
  assert.deepEqual(codexLaunchArgv(result.worktree), [
    "--cd",
    result.worktree,
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
  assert.equal(codexLaunchArgv(result.worktree).includes("--search"), false);

  const sessionCalls = calls.filter(
    (call) => call.command === "herdr" && call.args[0] === "--session",
  );
  assert.ok(sessionCalls.length > 0);
  for (const call of sessionCalls) {
    assert.deepEqual(call.args.slice(0, 2), ["--session", HERDR_SESSION]);
  }
  const workspaceCreate = sessionCalls.find(
    (call) => call.args[2] === "workspace" && call.args[3] === "create",
  );
  assert.deepEqual(workspaceCreate.args, [
    "--session",
    HERDR_SESSION,
    "workspace",
    "create",
    "--cwd",
    result.worktree,
    "--label",
    "Proof Current",
    "--no-focus",
  ]);
  const tabRename = sessionCalls.find(
    (call) =>
      call.args[2] === "tab" &&
      call.args[3] === "rename" &&
      call.args[4] === "w40:t7",
  );
  assert.deepEqual(tabRename.args, [
    "--session",
    HERDR_SESSION,
    "tab",
    "rename",
    "w40:t7",
    "Codex",
  ]);
  const tabCreate = sessionCalls.find(
    (call) =>
      call.args[2] === "tab" &&
      call.args[3] === "create" &&
      call.args.includes("w40"),
  );
  assert.deepEqual(tabCreate.args, [
    "--session",
    HERDR_SESSION,
    "tab",
    "create",
    "--workspace",
    "w40",
    "--cwd",
    result.worktree,
    "--label",
    "Terminal",
    "--no-focus",
  ]);
  const agentStart = sessionCalls.find(
    (call) => call.args[2] === "agent" && call.args[3] === "start",
  );
  assert.deepEqual(agentStart.args, [
    "--session",
    HERDR_SESSION,
    "agent",
    "start",
    result.herdrAgent,
    "--kind",
    "codex",
    "--pane",
    "w40:p93",
    "--",
    ...codexLaunchArgv(result.worktree),
  ]);

  const gitSubcommands = calls
    .filter((call) => call.command === "git")
    .map((call) => call.args[2]);
  assert.equal(
    gitSubcommands.filter((command) => command === "worktree").length >= 1,
    true,
  );
  for (
    const forbidden of [
      "add",
      "commit",
      "push",
      "merge",
      "rebase",
      "reset",
      "clean",
      "remove",
      "prune",
    ]
  ) {
    assert.equal(gitSubcommands.includes(forbidden), false, forbidden);
  }
});

test("two batches receive separate workspaces in the one ENVAL session", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls);
  const first = await startBatch("Workspace One", {
    root,
    worktreesRoot,
    run: batchRun,
  });
  const second = await startBatch("Workspace Two", {
    root,
    worktreesRoot,
    run: batchRun,
  });

  assert.equal(first.herdrSession, HERDR_SESSION);
  assert.equal(second.herdrSession, HERDR_SESSION);
  assert.notEqual(first.herdrWorkspace, second.herdrWorkspace);
  assert.deepEqual(
    batchRun.herdrState.workspaces.slice(1).map((workspace) => ({
      label: workspace.label,
      cwd: workspace.worktree.checkout_path,
    })),
    [
      { label: "Workspace One", cwd: first.worktree },
      { label: "Workspace Two", cwd: second.worktree },
    ],
  );
  assert.deepEqual(
    batchRun.herdrState.tabs.map((tab) => tab.label),
    ["Codex", "Terminal", "Codex", "Terminal", "Codex", "Terminal"],
  );
  assert.deepEqual(
    batchRun.herdrState.workspaces[0],
    {
      workspace_id: "w-main",
      label: "Main",
      worktree: { checkout_path: root },
    },
  );
  assert.equal(
    calls.some(
      (call) =>
        call.command === "herdr" &&
        call.args[0] === "--session" &&
        call.args[2] === "worktree",
    ),
    false,
  );
});

test("a main HEAD change during preflight is refused instead of using a stale base", async () => {
  const { root, worktreesRoot } = fixture();
  const baseRun = recordingRun([]);
  let advanced = false;
  const changingRun = (command, args, options) => {
    if (command === "codex") {
      if (!advanced) {
        advanced = true;
        writeFileSync(join(root, "fixture.txt"), "advanced-during-preflight\n");
        git(root, ["add", "fixture.txt"]);
        git(root, [
          "-c",
          "user.name=ENVAL Proof",
          "-c",
          "user.email=proof@invalid.local",
          "commit",
          "-m",
          "advance-during-preflight",
        ]);
      }
    }
    return baseRun(command, args, options);
  };

  assert.equal(
    await captureFailure(() =>
      startBatch("Stale Base", {
        root,
        worktreesRoot,
        run: changingRun,
      })
    ),
    "main_head_changed_during_launch",
  );
  assert.throws(() => readFileSync(join(worktreesRoot, "stale-base")), {
    code: "ENOENT",
  });
});

test("tracked-dirty and staged main are refused while untracked files are tolerated", async (t) => {
  await t.test("tracked dirty", async () => {
    const { root, worktreesRoot } = fixture();
    writeFileSync(join(root, "fixture.txt"), "dirty\n");
    assert.equal(
      await captureFailure(() =>
        startBatch("Dirty", {
          root,
          worktreesRoot,
          run: recordingRun([]),
        })
      ),
      "main_tracked_dirty",
    );
  });

  await t.test("staged", async () => {
    const { root, worktreesRoot } = fixture();
    writeFileSync(join(root, "fixture.txt"), "staged\n");
    git(root, ["add", "fixture.txt"]);
    assert.equal(
      await captureFailure(() =>
        startBatch("Staged", {
          root,
          worktreesRoot,
          run: recordingRun([]),
        })
      ),
      "main_tracked_dirty",
    );
  });

  await t.test("untracked tolerated", async () => {
    const { root, worktreesRoot } = fixture();
    writeFileSync(join(root, "historical-artifact.txt"), "untracked\n");
    const result = await startBatch("Untracked", {
      root,
      worktreesRoot,
      run: recordingRun([]),
    });
    assert.equal(result.herdrSession, HERDR_SESSION);
  });
});

test("existing branch and worktree path conflicts are refused", async (t) => {
  await t.test("branch", async () => {
    const { root, worktreesRoot } = fixture();
    git(root, ["branch", "autonomy/existing"]);
    assert.equal(
      await captureFailure(() =>
        startBatch("Existing", {
          root,
          worktreesRoot,
          run: recordingRun([]),
        })
      ),
      "branch_conflict",
    );
  });

  await t.test("worktree path", async () => {
    const { root, worktreesRoot } = fixture();
    mkdirSync(worktreesRoot);
    mkdirSync(join(worktreesRoot, "occupied"));
    assert.equal(
      await captureFailure(() =>
        startBatch("Occupied", {
          root,
          worktreesRoot,
          run: recordingRun([]),
        })
      ),
      "worktree_path_exists",
    );
  });
});

test("existing Herdr workspace or agent conflicts are refused before Git creation", async (t) => {
  await t.test("workspace label", async () => {
    const { root, worktreesRoot } = fixture();
    const calls = [];
    assert.equal(
      await captureFailure(() =>
        startBatch("Herdr Conflict", {
          root,
          worktreesRoot,
          run: recordingRun(calls, {
            workspaces: [{
              workspace_id: "w9",
              label: "Herdr Conflict",
              worktree: { checkout_path: "/tmp/other-worktree" },
            }],
          }),
        })
      ),
      "herdr_workspace_conflict",
    );
    assert.equal(
      calls.some(
        (call) =>
          call.command === "git" &&
          call.args[2] === "worktree" &&
          call.args[3] === "add",
      ),
      false,
    );
  });

  await t.test("agent name", async () => {
    const { root, worktreesRoot } = fixture();
    assert.equal(
      await captureFailure(() =>
        startBatch("Agent Conflict", {
          root,
          worktreesRoot,
          run: recordingRun([], {
            agents: [{ name: deriveHerdrAgentName("agent-conflict") }],
          }),
        })
      ),
      "herdr_agent_conflict",
    );
  });
});

test("unsupported Herdr fails closed before Git creation", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("Wrong Herdr", {
        root,
        worktreesRoot,
        run: recordingRun(calls, { version: "herdr 0.8.3\n" }),
      })
    ),
    "herdr_version_unsupported",
  );
  assert.equal(
    calls.some(
      (call) =>
        call.command === "git" &&
        call.args[2] === "worktree" &&
        call.args[3] === "add",
    ),
    false,
  );
});

test("Herdr agent startup failure leaves the created batch intact", async () => {
  const { root, worktreesRoot } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls, { agentStartError: "agent_not_ready" });
  assert.equal(
    await captureFailure(() =>
      startBatch("Start Blocked", { root, worktreesRoot, run: batchRun })
    ),
    "herdr_agent_start_failed:agent_not_ready",
  );
  assert.equal(
    git(root, ["branch", "--list", "autonomy/start-blocked"])
      .endsWith("autonomy/start-blocked"),
    true,
  );
  assert.equal(
    git(join(worktreesRoot, "start-blocked"), [
      "branch",
      "--show-current",
    ]),
    "autonomy/start-blocked",
  );
  assert.equal(batchRun.herdrState.workspaces.length, 2);
  assert.equal(
    calls.some(
      (call) =>
        call.command === "git" &&
        (["reset", "clean"].includes(call.args[2]) ||
          (call.args[2] === "worktree" &&
            ["remove", "prune"].includes(call.args[3]))),
    ),
    false,
  );
});

test("missing Codex governance baseline is refused before creation", async () => {
  const { root, worktreesRoot } = fixture({ omit: ".codex/config.toml" });
  assert.equal(
    await captureFailure(() =>
      startBatch("No Governance", {
        root,
        worktreesRoot,
        run: recordingRun([]),
      })
    ),
    "governance_file_missing_or_invalid:.codex/config.toml",
  );
});

test("non-human workspace text is rejected without invoking commands", async () => {
  const { parent, root, worktreesRoot } = fixture();
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("Safe;Touch Pwned", {
        root,
        worktreesRoot,
        run: recordingRun(calls),
      })
    ),
    "workspace_name_invalid",
  );
  assert.equal(calls.length, 0);
  assert.throws(() => readFileSync(join(parent, "touch-pwned")), {
    code: "ENOENT",
  });
});

test("permanent governance owns human Herdr navigation and RYB forward naming", () => {
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
      "## Human Herdr navigation and action location",
      "Project: <human project name>",
      "Workspace: <human workspace name>",
      "Tab: <Codex|Terminal|Reviewer>",
      "DO\n<exact action>",
      "`RYB`; persistent workspace `Main`",
      "`Daily`, `Games`, `Rankings`, and `Profile`",
    ]
  ) {
    assert.ok(governance.includes(required), required);
  }
  for (
    const required of [
      "node scripts/tools/enval-batch.mjs start Beheer",
      "PROJECT=ENVAL",
      "WORKSPACE=<human product name>",
      "TABS=Codex,Terminal",
      "`ENVAL -> Main` naming conventions",
    ]
  ) {
    assert.ok(workflow.includes(required), required);
  }
  assert.equal(workflow.includes("`enval-worker`"), false);
});

test("launcher source has no unrelated Git config, shell, or cleanup authority", () => {
  const source = readFileSync(
    new URL("../tools/enval-batch.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\["config"/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.doesNotMatch(source, /\b(?:rmSync|unlinkSync|rmdirSync)\b/);
  assert.doesNotMatch(source, /\["(?:commit|push|deploy|remove|prune|clean)"/);
});
