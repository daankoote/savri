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
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  BatchLaunchError,
  CANONICAL_BRANCH,
  CANONICAL_REPOSITORY,
  CANONICAL_TABS,
  CANONICAL_WORKSPACE,
  CODEX_UPDATE_OVERRIDE,
  codexLaunchArgv,
  deriveBatchIdentity,
  ENVAL_ROOT,
  formatBatchHandoff,
  HERDR_PROJECT,
  HERDR_SESSION,
  PRIMARY_AGENT,
  startBatch,
  verifyCodexCli,
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

function writeGovernance(root, options = {}) {
  const reviewerMode = options.reviewerMode ?? "read-only";
  const files = new Map([
    [
      "AGENTS.md",
      "`enval-main` is General/Primary and the only writer.\n",
    ],
    [
      ".codex/config.toml",
      [
        'approval_policy = "on-request"',
        'approvals_reviewer = "auto_review"',
        'default_permissions = "enval-dev"',
        "[agents]",
        "enabled = true",
        "max_concurrent_threads_per_session = 2",
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
        "",
      ].join("\n"),
    ],
    [
      ".codex/agents/reviewer.toml",
      `name = "reviewer"\nsandbox_mode = "${reviewerMode}"\n`,
    ],
    [
      ".codex/agents/ui_reviewer.toml",
      'name = "ui_reviewer"\nsandbox_mode = "read-only"\n',
    ],
    [
      ".codex/agents/docs_reviewer.toml",
      'name = "docs_reviewer"\nsandbox_mode = "read-only"\n',
    ],
  ]);
  for (const [relativePath, contents] of files) {
    if (relativePath === options.omit) continue;
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
}

function fixture(options = {}) {
  const parent = realpathSync(
    mkdtempSync(join(tmpdir(), "enval-batch-proof-")),
  );
  temporaryRoots.push(parent);
  const root = join(parent, "enval");
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
  return { parent, root };
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
      if (state.workspaces.length === 0 && options.autoWorkspace !== false) {
        const label = options.defaultWorkspaceLabel ?? CANONICAL_WORKSPACE;
        state.workspaces.push({ workspace_id: "w-enval", label });
        state.tabs.push(
          { tab_id: "w-enval:t1", workspace_id: "w-enval", label: "Codex" },
          { tab_id: "w-enval:t2", workspace_id: "w-enval", label: "Terminal" },
        );
        state.panes.push(
          {
            pane_id: "w-enval:p1",
            tab_id: "w-enval:t1",
            workspace_id: "w-enval",
            cwd: commandOptions.cwd,
          },
          {
            pane_id: "w-enval:p2",
            tab_id: "w-enval:t2",
            workspace_id: "w-enval",
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
      const agent = { name, pane_id: paneId, workspace_id: pane.workspace_id };
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
  assert.fail("expected ENVAL error");
}

function canonicalHerdrState(root, options = {}) {
  return {
    workspaces: [
      { workspace_id: "w-enval", label: options.label ?? CANONICAL_WORKSPACE },
      ...(options.extraWorkspaces ?? []),
    ],
    tabs: [
      { tab_id: "w-enval:t1", workspace_id: "w-enval", label: "Codex" },
      { tab_id: "w-enval:t2", workspace_id: "w-enval", label: "Terminal" },
      ...(options.extraTabs ?? []),
    ],
    panes: [
      {
        pane_id: "w-enval:p1",
        tab_id: "w-enval:t1",
        workspace_id: "w-enval",
        cwd: options.cwd ?? root,
      },
      {
        pane_id: "w-enval:p2",
        tab_id: "w-enval:t2",
        workspace_id: "w-enval",
        cwd: options.cwd ?? root,
      },
      ...(options.extraPanes ?? []),
    ],
    agents: options.agents ?? [],
  };
}

test("canonical identity is fixed to ENVAL Enval main", () => {
  assert.equal(ENVAL_ROOT, realpathSync(new URL("../..", import.meta.url)));
  assert.equal(HERDR_PROJECT, "ENVAL");
  assert.equal(HERDR_SESSION, "ENVAL");
  assert.equal(CANONICAL_WORKSPACE, "Enval");
  assert.equal(CANONICAL_REPOSITORY, "/Users/daankoote/dev/enval");
  assert.equal(CANONICAL_BRANCH, "main");
  assert.equal(PRIMARY_AGENT, "enval-main");
  assert.deepEqual(CANONICAL_TABS, ["Codex", "Terminal"]);
  assert.deepEqual(deriveBatchIdentity("Enval"), {
    workspaceName: "Enval",
    branch: "main",
    agentName: "enval-main",
  });
});

test("legacy and alternate workspace inputs fail before commands", async () => {
  for (
    const workspace of ["", "Beheer", "beheer", "Main", "_Setup", "Reviewer"]
  ) {
    const { root } = fixture();
    const calls = [];
    assert.equal(
      await captureFailure(() =>
        startBatch(workspace, { root, run: recordingRun(calls) })
      ),
      "workspace_name_invalid",
    );
    assert.equal(calls.length, 0);
  }
});

test("CLI rejects a legacy workspace without touching Herdr", () => {
  const result = spawnSync(
    process.execPath,
    [
      new URL("../tools/enval-batch.mjs", import.meta.url).pathname,
      "start",
      "Beheer",
    ],
    { encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(
    result.stderr,
    "ENVAL_BATCH_START_STATUS=FAIL\nFAILURE=workspace_name_invalid\n",
  );
});

test("CLI interfaces are verified hermetically", () => {
  const { root } = fixture();
  const batchRun = recordingRun([]);
  assert.deepEqual(verifyHerdrCli(batchRun, root), { version: "0.8.2" });
  assert.match(verifyCodexCli(batchRun, root).version, /^\d+\.\d+\.\d+$/);
});

test("canonical fixture reuses Enval with Codex Terminal and enval-main", async () => {
  const { root } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls);
  const result = await startBatch("Enval", { root, run: batchRun });

  assert.equal(result.workspaceName, "Enval");
  assert.equal(result.worktree, root);
  assert.equal(result.branch, "main");
  assert.equal(result.herdrAgent, "enval-main");
  assert.equal(result.workspaceReused, true);
  assert.equal(result.agentReused, false);
  assert.deepEqual(batchRun.herdrState.workspaces, [
    { workspace_id: "w-enval", label: "Enval" },
  ]);
  assert.deepEqual(
    batchRun.herdrState.tabs.map((tab) => tab.label),
    ["Codex", "Terminal"],
  );
  assert.deepEqual(batchRun.herdrState.agents, [{
    name: "enval-main",
    pane_id: "w-enval:p1",
    workspace_id: "w-enval",
  }]);
  assert.equal(
    calls.some((call) => call.command === "git" && call.args[2] === "worktree"),
    false,
  );
  assert.equal(
    calls.some((call) =>
      call.command === "herdr" && call.args.includes("Reviewer")
    ),
    false,
  );
  assert.equal(
    formatBatchHandoff(result),
    [
      "ENVAL_BATCH_START=PASS",
      "PROJECT=ENVAL",
      "WORKSPACE=Enval",
      "TABS=Codex,Terminal",
      "AGENT=enval-main",
      `REPOSITORY=${root}`,
      "BRANCH=main",
      "",
    ].join("\n"),
  );
  assert.deepEqual(codexLaunchArgv(root), [
    "--cd",
    root,
    "--ask-for-approval",
    "on-request",
    "--config",
    CODEX_UPDATE_OVERRIDE,
    "--config",
    'web_search="disabled"',
    "--strict-config",
  ]);
});

test("an existing canonical primary is reused exactly", async () => {
  const { root } = fixture();
  const state = canonicalHerdrState(root, {
    agents: [{
      name: "enval-main",
      pane_id: "w-enval:p1",
      workspace_id: "w-enval",
    }],
  });
  const calls = [];
  const result = await startBatch("Enval", {
    root,
    run: recordingRun(calls, state),
  });
  assert.equal(result.agentReused, true);
  assert.equal(
    calls.some((call) =>
      call.command === "herdr" && call.args[2] === "agent" &&
      call.args[3] === "start"
    ),
    false,
  );
});

test("legacy Herdr workspaces are rejected without mutation", async () => {
  for (const label of ["Main", "Beheer", "beheer", "_Setup"]) {
    const { root } = fixture();
    const calls = [];
    const state = canonicalHerdrState(root, { label });
    assert.equal(
      await captureFailure(() =>
        startBatch("Enval", { root, run: recordingRun(calls, state) })
      ),
      "herdr_legacy_workspace_rejected",
    );
    assert.equal(
      calls.some((call) =>
        call.command === "herdr" && call.args[2] === "workspace" &&
        call.args[3] === "rename"
      ),
      false,
    );
  }
});

test("a legacy beheer branch is rejected before Herdr", async () => {
  const { root } = fixture();
  git(root, ["switch", "-c", "beheer"]);
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("Enval", { root, run: recordingRun(calls) })
    ),
    "integration_branch_not_main",
  );
  assert.equal(calls.some((call) => call.command === "herdr"), false);
});

test("a legacy worktree pane binding is rejected", async () => {
  const { parent, root } = fixture();
  const legacyRoot = join(parent, "enval-worktrees", "beheer");
  const state = canonicalHerdrState(root, { cwd: legacyRoot });
  assert.equal(
    await captureFailure(() =>
      startBatch("Enval", { root, run: recordingRun([], state) })
    ),
    "herdr_workspace_binding_conflict",
  );
});

test("a permanent Reviewer tab is rejected", async () => {
  const { root } = fixture();
  const state = canonicalHerdrState(root, {
    extraTabs: [{
      tab_id: "w-enval:t3",
      workspace_id: "w-enval",
      label: "Reviewer",
    }],
    extraPanes: [{
      pane_id: "w-enval:p3",
      tab_id: "w-enval:t3",
      workspace_id: "w-enval",
      cwd: root,
    }],
  });
  assert.equal(
    await captureFailure(() =>
      startBatch("Enval", { root, run: recordingRun([], state) })
    ),
    "herdr_permanent_reviewer_rejected",
  );
});

test("a permanent second workspace agent is rejected", async () => {
  const { root } = fixture();
  const state = canonicalHerdrState(root, {
    agents: [
      { name: "enval-main", pane_id: "w-enval:p1", workspace_id: "w-enval" },
      {
        name: "enval-reviewer",
        pane_id: "w-enval:p2",
        workspace_id: "w-enval",
      },
    ],
  });
  assert.equal(
    await captureFailure(() =>
      startBatch("Enval", { root, run: recordingRun([], state) })
    ),
    "herdr_workspace_agent_conflict",
  );
});

test("unrelated integration workspace state remains untouched", async () => {
  const { root } = fixture();
  const state = canonicalHerdrState(root, {
    extraWorkspaces: [{ workspace_id: "w-integration", label: "Integration" }],
  });
  const batchRun = recordingRun([], state);
  await startBatch("Enval", { root, run: batchRun });
  assert.deepEqual(batchRun.herdrState.workspaces, [
    { workspace_id: "w-enval", label: "Enval" },
    { workspace_id: "w-integration", label: "Integration" },
  ]);
});

test("tracked-dirty main is refused before Herdr", async () => {
  const { root } = fixture();
  writeFileSync(join(root, "fixture.txt"), "dirty\n");
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("Enval", { root, run: recordingRun(calls) })
    ),
    "main_tracked_dirty",
  );
  assert.equal(calls.some((call) => call.command === "herdr"), false);
});

test("unsupported Herdr and Codex fail before topology mutation", async (t) => {
  await t.test("Herdr", async () => {
    const { root } = fixture();
    const calls = [];
    assert.equal(
      await captureFailure(() =>
        startBatch("Enval", {
          root,
          run: recordingRun(calls, { version: "herdr 0.8.3\n" }),
        })
      ),
      "herdr_version_unsupported",
    );
    assert.equal(calls.some((call) => call.args.includes("workspace")), false);
  });
  await t.test("Codex", async () => {
    const { root } = fixture();
    const calls = [];
    const batchRun = recordingRun(calls);
    const refusingRun = (command, args, options) =>
      command === "codex"
        ? { status: 2, stdout: "", stderr: "unsupported", error: null }
        : batchRun(command, args, options);
    assert.equal(
      await captureFailure(() =>
        startBatch("Enval", { root, run: refusingRun })
      ),
      "codex_cli_override_preflight_failed",
    );
    assert.equal(calls.some((call) => call.command === "herdr"), false);
  });
});

test("governance and reviewer read-only baselines fail closed", async (t) => {
  await t.test("missing config", async () => {
    const { root } = fixture({ omit: ".codex/config.toml" });
    assert.equal(
      await captureFailure(() =>
        startBatch("Enval", { root, run: recordingRun([]) })
      ),
      "governance_file_missing_or_invalid:.codex/config.toml",
    );
  });
  await t.test("writable reviewer", async () => {
    const { root } = fixture({ reviewerMode: "workspace-write" });
    assert.equal(
      await captureFailure(() =>
        startBatch("Enval", { root, run: recordingRun([]) })
      ),
      "reviewer_profile_not_read_only:.codex/agents/reviewer.toml",
    );
  });
});

test("agent startup failure leaves repository and topology intact", async () => {
  const { root } = fixture();
  const calls = [];
  const batchRun = recordingRun(calls, { agentStartError: "agent_not_ready" });
  assert.equal(
    await captureFailure(() => startBatch("Enval", { root, run: batchRun })),
    "herdr_agent_start_failed:agent_not_ready",
  );
  assert.equal(git(root, ["branch", "--show-current"]), "main");
  assert.deepEqual(batchRun.herdrState.workspaces, [
    { workspace_id: "w-enval", label: "Enval" },
  ]);
  assert.equal(
    calls.some((call) => call.command === "git" && call.args[2] === "worktree"),
    false,
  );
});

test("launcher source has no Git mutation, permanent reviewer, or result helper", () => {
  const source = readFileSync(
    new URL("../tools/enval-batch.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /shell:\s*true/);
  assert.doesNotMatch(source, /\b(?:rmSync|unlinkSync|rmdirSync|mkdirSync)\b/);
  assert.doesNotMatch(source, /\["worktree",\s*"add"/);
  assert.doesNotMatch(source, /\["(?:commit|push|deploy|switch|checkout)"/);
  assert.doesNotMatch(
    source,
    /enval-(?:permission-router|result)\.mjs|CODEX_NOTIFY_OVERRIDE|notify=/,
  );
  assert.doesNotMatch(source, /CANONICAL_TABS[^\n]+Reviewer/);
  assert.doesNotMatch(source, /Desktop|copy-paste-enval/);
});
