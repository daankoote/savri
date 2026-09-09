import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { resolvePrimaryRuntime } from "../tools/enval-primary-runtime.mjs";
import {
  cleanupDependencyBridge,
  ensureDependencyBridge,
  ENVAL_RUNTIME_ROOT,
  inspectDependencyBridge,
  installDependencyBridgeSignalCleanup,
} from "../tools/enval-preview-dependency-bridge.mjs";
import {
  copySourceSnapshot,
  dependencyKey,
  ensureDependencies,
  excludedPreviewPath,
  fingerprintSource,
  MINIMUM_NODE_MAJOR,
  PREVIEW_BASE,
  resolvePreviewSpec,
  runtimeNamespace,
} from "../tools/enval-preview.mjs";

const temporaryRoots = [];

after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot(prefix = "enval-preview-proof-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(path, value = "fixture\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function sourceFixture() {
  const root = temporaryRoot();
  const files = {
    tracked: [
      "package.json",
      "package-lock.json",
      "app/package.json",
      "app/package-lock.json",
      "app/src/App.tsx",
      "public/logo.svg",
      "app/.env.example",
    ],
    untracked: [
      "app/src/OperatorOverviewPage.tsx",
      "app/.env.local",
      "preview.log",
      "tmp/generated.json",
    ],
  };
  for (const relativePath of [...files.tracked, ...files.untracked]) {
    write(join(root, relativePath), `${relativePath}\n`);
  }
  return { root, files };
}

function inventoryRun(files, status = Buffer.from("fixture-status")) {
  return (_command, args, options) => {
    if (args.includes("ls-files")) {
      const values = args.includes("--others")
        ? files.untracked
        : files.tracked;
      const output = Buffer.from(`${values.join("\0")}\0`);
      return {
        status: 0,
        stdout: options.encoding === "buffer" ? output : output.toString(),
        stderr: "",
      };
    }
    if (args.includes("status")) {
      return { status: 0, stdout: status, stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "unexpected" };
  };
}

function dependencyDirectories(root) {
  for (
    const relativePath of [
      "root/node_modules/playwright",
      "app/node_modules/vite",
      "app/node_modules/@vitejs/plugin-react",
      "app/node_modules/react",
      "app/node_modules/react-dom",
      "app/node_modules/@supabase/supabase-js",
    ]
  ) mkdirSync(join(root, relativePath), { recursive: true });
}

function dependencyBridgeFixture() {
  mkdirSync(join(ENVAL_RUNTIME_ROOT, "preview"), {
    recursive: true,
    mode: 0o700,
  });
  const runtimeRoot = mkdtempSync(
    join(ENVAL_RUNTIME_ROOT, "preview", ".bridge-proof-"),
  );
  temporaryRoots.push(runtimeRoot);
  const sourceRoot = join(runtimeRoot, "source");
  const dependencyRoot = join(runtimeRoot, "dependencies", "fixture-key");
  mkdirSync(join(sourceRoot, "app"), { recursive: true });
  mkdirSync(join(dependencyRoot, "app", "node_modules"), {
    recursive: true,
  });
  return { runtimeRoot, sourceRoot, dependencyRoot };
}

test("Node runtime and approved Beheer worktree are explicit", () => {
  assert.ok(Number(process.versions.node.split(".")[0]) >= MINIMUM_NODE_MAJOR);
  const output = [
    "worktree /Users/daankoote/dev/enval",
    "branch refs/heads/main",
    "",
    "worktree /Users/daankoote/dev/enval-worktrees/beheer",
    "branch refs/heads/beheer",
    "",
  ].join("\0");
  const spec = resolvePreviewSpec("Beheer", () => ({
    status: 0,
    stdout: output,
    stderr: "",
  }));
  assert.equal(spec.workspaceName, "Beheer");
  assert.equal(spec.branch, "beheer");
  assert.equal(spec.sourceRoot, "/Users/daankoote/dev/enval-worktrees/beheer");
  assert.equal(ENVAL_RUNTIME_ROOT, "/private/tmp/enval-runtime/ENVAL");
  assert.equal(
    PREVIEW_BASE,
    join(
      ENVAL_RUNTIME_ROOT,
      "repositories",
      runtimeNamespace("/Users/daankoote/dev/enval"),
      "worktrees",
    ),
  );
  assert.equal(
    spec.runtimeRoot,
    join(
      PREVIEW_BASE,
      runtimeNamespace(spec.sourceRoot),
      "preview",
      "beheer",
    ),
  );
  assert.notEqual(
    spec.runtimeRoot,
    join(
      PREVIEW_BASE,
      runtimeNamespace("/Users/daankoote/dev/enval-worktrees/setup"),
      "preview",
      "beheer",
    ),
  );
  const source = readFileSync(
    new URL("../tools/enval-preview.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /\$\{delimiter\}\$\{process\.env\.PATH/);
  assert.doesNotMatch(source, /\.herdr-runtime/);
  assert.doesNotMatch(source, /enval-(?:batch|result)\.mjs/);
  assert.throws(() => resolvePreviewSpec("Beheer 2"), {
    name: "PreviewError",
    code: "workspace_not_approved",
  });
});

test("snapshot includes tracked and relevant untracked source but excludes secrets and artifacts", () => {
  const fixture = sourceFixture();
  const run = inventoryRun(fixture.files);
  const before = fingerprintSource(fixture.root, run);
  assert.equal(before.trackedCount, fixture.files.tracked.length);
  assert.equal(before.untrackedCount, fixture.files.untracked.length);
  assert.equal(before.excludedCount, 3);
  assert.equal(
    before.inventory.included.includes("app/src/OperatorOverviewPage.tsx"),
    true,
  );
  assert.equal(before.inventory.included.includes("app/.env.local"), false);
  assert.equal(before.inventory.included.includes("app/.env.example"), true);

  const snapshot = join(temporaryRoot(), "source");
  copySourceSnapshot(fixture.root, snapshot, before);
  const copied = fingerprintSource(snapshot, run);
  assert.equal(copied.contentDigest, before.contentDigest);
  assert.equal(
    readFileSync(join(snapshot, "app/src/App.tsx"), "utf8"),
    "app/src/App.tsx\n",
  );
  assert.equal(
    existsSync(join(snapshot, "app/src/OperatorOverviewPage.tsx")),
    true,
  );
  assert.equal(existsSync(join(snapshot, "app/.env.local")), false);
  assert.equal(existsSync(join(snapshot, "preview.log")), false);
  assert.equal(existsSync(join(snapshot, "tmp/generated.json")), false);
  for (
    const path of [".git/config", "node_modules/vite", "build/app.js", "x.pid"]
  ) {
    assert.equal(excludedPreviewPath(path), true, path);
  }
});

test("npm ci installs both pinned lockfile contracts only below the external runtime", () => {
  const fixture = sourceFixture();
  const runtimeRoot = temporaryRoot();
  const calls = [];
  const dependency = ensureDependencies(
    fixture.root,
    runtimeRoot,
    (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      dependencyDirectories(join(options.cwd, ".."));
      return { status: 0, stdout: "", stderr: "" };
    },
  );
  assert.equal(dependency.installed, true);
  assert.equal(dependency.key, dependencyKey(fixture.root));
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(({ args }) => args), [
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
  ]);
  assert.ok(
    calls.every(({ cwd }) => cwd.startsWith(realpathSync(runtimeRoot))),
  );
  assert.equal(existsSync(join(fixture.root, "node_modules")), false);
  assert.equal(existsSync(join(fixture.root, "app/node_modules")), false);

  const reused = ensureDependencies(fixture.root, runtimeRoot, () => {
    throw new Error("npm must not run for a verified cache");
  });
  assert.equal(reused.installed, false);
});

test("guarded runtime resolves external dependencies and references secrets in place", () => {
  const fixture = sourceFixture();
  const dependencyRoot = temporaryRoot();
  const secretRoot = temporaryRoot();
  mkdirSync(join(secretRoot, ".git"));
  write(join(secretRoot, "app/.env.local"), "PRIVATE=not-read-by-proof\n");
  write(
    join(secretRoot, "supabase/functions/.env.local"),
    "PRIVATE=not-read-by-proof\n",
  );
  for (const relativePath of ["package.json", "package-lock.json"]) {
    write(
      join(dependencyRoot, "root", relativePath),
      readFileSync(join(fixture.root, relativePath)),
    );
    write(
      join(dependencyRoot, "app", relativePath),
      readFileSync(join(fixture.root, "app", relativePath)),
    );
  }
  dependencyDirectories(dependencyRoot);

  const runtime = resolvePrimaryRuntime(
    fixture.root,
    () => ({ status: 1, stdout: "", stderr: "not a repository" }),
    {
      ENVAL_PREVIEW_DEPENDENCY_ROOT: dependencyRoot,
      ENVAL_PREVIEW_SECRET_ROOT: secretRoot,
    },
  );
  assert.equal(runtime.dependencySource, "external_preview_runtime");
  assert.equal(runtime.primaryRoot, realpathSync(secretRoot));
  assert.ok(runtime.rootNodeModules.includes("enval-preview-proof-"));
  assert.ok(runtime.appNodeModules.includes("enval-preview-proof-"));
  assert.ok(runtime.appEnvironmentFile.includes("enval-preview-proof-"));
  assert.equal(existsSync(join(fixture.root, ".env.local")), false);
});

test("temporary dependency bridge is canonical, exact and lifecycle-clean", () => {
  for (const outcome of ["PASS", "FAIL"]) {
    const fixture = dependencyBridgeFixture();
    const bridge = ensureDependencyBridge(fixture);
    assert.equal(bridge.created, true, outcome);
    assert.equal(lstatSync(bridge.location).isSymbolicLink(), true, outcome);
    assert.equal(readlinkSync(bridge.location), bridge.target, outcome);
    assert.equal(realpathSync(bridge.location), bridge.target, outcome);
    assert.ok(bridge.location.startsWith(`${ENVAL_RUNTIME_ROOT}/`), outcome);
    assert.ok(bridge.target.startsWith(`${ENVAL_RUNTIME_ROOT}/`), outcome);
    assert.ok(
      realpathSync(fixture.sourceRoot).startsWith(`${ENVAL_RUNTIME_ROOT}/`),
      outcome,
    );
    const cleaned = cleanupDependencyBridge(fixture);
    assert.equal(cleaned.cleaned, true, outcome);
    assert.equal(existsSync(bridge.location), false, outcome);
  }
});

test("SIGINT and SIGTERM clean the bridge before the runtime exits", async () => {
  const moduleUrl = new URL(
    "../tools/enval-preview-dependency-bridge.mjs",
    import.meta.url,
  ).href;
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const fixture = dependencyBridgeFixture();
    const worker = `
      import {
        ensureDependencyBridge,
        installDependencyBridgeSignalCleanup,
      } from ${JSON.stringify(moduleUrl)};
      const options = JSON.parse(process.env.ENVAL_BRIDGE_PROOF_OPTIONS);
      installDependencyBridgeSignalCleanup(options, (signal) => {
        process.stdout.write(\`BRIDGE_SIGNAL=\${signal}\\n\`);
        process.exit(signal === "SIGINT" ? 130 : 143);
      });
      ensureDependencyBridge(options);
      process.stdout.write("BRIDGE_READY=YES\\n");
      setInterval(() => {}, 1_000);
    `;
    const child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", worker],
      {
        env: {
          ...process.env,
          ENVAL_BRIDGE_PROOF_OPTIONS: JSON.stringify(fixture),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => output += chunk);
    child.stderr.on("data", (chunk) => output += chunk);
    try {
      const ready = Promise.withResolvers();
      const timeout = setTimeout(
        () => ready.reject(new Error(`${signal}_bridge_ready_timeout`)),
        5_000,
      );
      const observeReady = (chunk) => {
        if (String(chunk).includes("BRIDGE_READY=YES")) ready.resolve();
      };
      child.stdout.on("data", observeReady);
      await ready.promise.finally(() => {
        clearTimeout(timeout);
        child.stdout.off("data", observeReady);
      });
      assert.equal(
        existsSync(join(fixture.sourceRoot, "app", "node_modules")),
        true,
      );
      child.kill(signal);
      const [code, exitSignal] = await once(child, "exit");
      assert.equal(code, signal === "SIGINT" ? 130 : 143, output);
      assert.equal(exitSignal, null, output);
      assert.match(output, new RegExp(`BRIDGE_SIGNAL=${signal}`));
      assert.equal(
        existsSync(join(fixture.sourceRoot, "app", "node_modules")),
        false,
      );
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit");
      }
    }
  }
});

test("temporary dependency bridge refuses occupied, mismatched and unsafe paths", () => {
  const occupied = dependencyBridgeFixture();
  mkdirSync(join(occupied.sourceRoot, "app", "node_modules"));
  assert.throws(() => ensureDependencyBridge(occupied), {
    name: "DependencyBridgeError",
    code: "dependency_bridge_location_occupied",
  });

  const mismatched = dependencyBridgeFixture();
  const wrongTarget = join(
    mismatched.runtimeRoot,
    "dependencies",
    "wrong-key",
    "app",
    "node_modules",
  );
  mkdirSync(wrongTarget, { recursive: true });
  symlinkSync(
    wrongTarget,
    join(mismatched.sourceRoot, "app", "node_modules"),
    "dir",
  );
  assert.throws(() => inspectDependencyBridge(mismatched), {
    name: "DependencyBridgeError",
    code: "dependency_bridge_target_mismatch",
  });

  const traversal = dependencyBridgeFixture();
  assert.throws(
    () =>
      ensureDependencyBridge({
        ...traversal,
        sourceRoot: `${traversal.sourceRoot}/../source`,
      }),
    {
      name: "DependencyBridgeError",
      code: "dependency_bridge_snapshot_invalid",
    },
  );

  const outside = sourceFixture();
  assert.throws(
    () =>
      ensureDependencyBridge({
        runtimeRoot: outside.root,
        sourceRoot: join(outside.root, "source"),
        dependencyRoot: join(outside.root, "dependencies", "fixture-key"),
      }),
    {
      name: "DependencyBridgeError",
      code: "dependency_bridge_runtime_root_invalid",
    },
  );
});
