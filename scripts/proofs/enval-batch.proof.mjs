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
  BatchLaunchError,
  codexLaunchArgv,
  deriveBatchSpec,
  startBatch,
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

function recordingRun(calls) {
  return (command, args, options) => {
    calls.push({ command, args: [...args], cwd: options.cwd });
    if (command === "codex") return fakeCodex();
    return run(command, args, options);
  };
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

test("valid start uses current main HEAD and launches Codex with Auto-review argv", async () => {
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
  let launched = null;
  const result = await startBatch("proof-current", {
    root,
    worktreesRoot,
    run: recordingRun(calls),
    launch: async (request) => {
      launched = request;
      return 0;
    },
  });

  assert.equal(result.baseHead, expectedHead);
  assert.equal(git(result.worktree, ["rev-parse", "HEAD"]), expectedHead);
  assert.equal(
    git(result.worktree, ["branch", "--show-current"]),
    result.branch,
  );
  assert.deepEqual(launched, {
    cwd: result.worktree,
    args: codexLaunchArgv(result.worktree),
  });

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

test("a main HEAD change during preflight is refused instead of using a stale base", async () => {
  const { root, worktreesRoot } = fixture();
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
      return fakeCodex();
    }
    return run(command, args, options);
  };

  assert.equal(
    await captureFailure(() =>
      startBatch("stale-base", {
        root,
        worktreesRoot,
        run: changingRun,
        launch: async () => 0,
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
        startBatch("dirty", {
          root,
          worktreesRoot,
          run: recordingRun([]),
          launch: async () => 0,
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
        startBatch("staged", {
          root,
          worktreesRoot,
          run: recordingRun([]),
          launch: async () => 0,
        })
      ),
      "main_tracked_dirty",
    );
  });

  await t.test("untracked tolerated", async () => {
    const { root, worktreesRoot } = fixture();
    writeFileSync(join(root, "historical-artifact.txt"), "untracked\n");
    const result = await startBatch("untracked-ok", {
      root,
      worktreesRoot,
      run: recordingRun([]),
      launch: async () => 0,
    });
    assert.equal(result.launchExitCode, 0);
  });
});

test("existing branch and worktree path conflicts are refused", async (t) => {
  await t.test("branch", async () => {
    const { root, worktreesRoot } = fixture();
    git(root, ["branch", "autonomy/existing"]);
    assert.equal(
      await captureFailure(() =>
        startBatch("existing", {
          root,
          worktreesRoot,
          run: recordingRun([]),
          launch: async () => 0,
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
        startBatch("occupied", {
          root,
          worktreesRoot,
          run: recordingRun([]),
          launch: async () => 0,
        })
      ),
      "worktree_path_exists",
    );
  });
});

test("missing Codex governance baseline is refused before creation", async () => {
  const { root, worktreesRoot } = fixture({ omit: ".codex/config.toml" });
  assert.equal(
    await captureFailure(() =>
      startBatch("no-governance", {
        root,
        worktreesRoot,
        run: recordingRun([]),
        launch: async () => 0,
      })
    ),
    "governance_file_missing_or_invalid:.codex/config.toml",
  );
});

test("shell injection text is rejected without executing or invoking commands", async () => {
  const { parent, root, worktreesRoot } = fixture();
  const calls = [];
  assert.equal(
    await captureFailure(() =>
      startBatch("safe;touch-pwned", {
        root,
        worktreesRoot,
        run: recordingRun(calls),
        launch: async () => 0,
      })
    ),
    "batch_slug_invalid",
  );
  assert.equal(calls.length, 0);
  assert.throws(() => readFileSync(join(parent, "touch-pwned")), {
    code: "ENOENT",
  });
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
