#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  delimiter,
  dirname,
  join,
  normalize,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  cleanupDependencyBridge,
  DependencyBridgeError,
  ENVAL_RUNTIME_ROOT,
  inspectDependencyBridge,
} from "./enval-preview-dependency-bridge.mjs";

export const ENVAL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const CANONICAL_REPOSITORY = "/Users/daankoote/dev/enval";
const HERDR_PROJECT = "ENVAL";
const APPROVED_PREVIEW_BINDINGS = Object.freeze({
  Enval: Object.freeze({ slug: "enval", branch: "main" }),
});

export function runtimeNamespace(path) {
  return createHash("sha256").update(resolve(path)).digest("hex").slice(0, 16);
}

export const PREVIEW_BASE = join(
  ENVAL_RUNTIME_ROOT,
  "repositories",
  runtimeNamespace(ENVAL_ROOT),
  "worktrees",
);
export const PREVIEW_URL = "http://127.0.0.1:5175";
export const MINIMUM_NODE_MAJOR = 22;
const LOCAL_DEV_TOOL = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "enval-local-dev.mjs",
);
const INSTALL_TIMEOUT_MS = 180_000;
const START_TIMEOUT_MS = 45_000;
const STOP_TIMEOUT_MS = 10_000;
const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".cache",
  ".tmp",
  ".turbo",
  ".vite",
  "artifacts",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "playwright-report",
  "temp",
  "test-results",
  "tmp",
]);
const EXCLUDED_FILE_PATTERN = /(?:\.log|\.pid|\.sock|\.tmp|\.temp|~)$/i;
const SECRET_FILE_PATTERN =
  /^(?:\.npmrc|\.netrc|credentials\.json)|\.(?:key|pem|p12|pfx)$/i;

export class PreviewError extends Error {
  constructor(code, detail = "") {
    super(detail ? `${code}:${detail}` : code);
    this.name = "PreviewError";
    this.code = code;
  }
}

function fail(code, detail = "") {
  throw new PreviewError(code, detail);
}

function safeDetail(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/[^\s'\"<>]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "[REDACTED_KEY]")
    .replace(
      /\b(ANON_KEY|SERVICE_ROLE_KEY|SECRET|TOKEN|PASSWORD)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .split(/\r?\n/)
    .slice(0, 12)
    .join("\n")
    .slice(0, 2_000);
}

function defaultRun(command, args, options = {}) {
  return spawnSync(command, args, {
    ...options,
    encoding: options.encoding ?? "utf8",
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
  });
}

function checked(run, command, args, options, code) {
  const result = run(command, args, options);
  if (result.error || result.status !== 0) {
    fail(code, safeDetail(result.stderr || result.stdout || result.error));
  }
  return result;
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

function ensureOwnedDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail("preview_runtime_directory_invalid");
  }
  chmodSync(path, 0o700);
  return realpathSync(path);
}

function parseWorktrees(output) {
  const records = [];
  let record = null;
  for (const field of String(output).split("\0")) {
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

export function resolvePreviewSpec(workspaceName, run = defaultRun) {
  const binding = APPROVED_PREVIEW_BINDINGS[workspaceName];
  if (!binding) fail("workspace_not_approved");
  if (ENVAL_ROOT !== CANONICAL_REPOSITORY) {
    fail("repository_root_not_canonical");
  }
  const expectedSource = CANONICAL_REPOSITORY;
  const result = checked(
    run,
    "git",
    ["-C", ENVAL_ROOT, "worktree", "list", "--porcelain", "-z"],
    { cwd: ENVAL_ROOT, encoding: "utf8" },
    "worktree_inspection_failed",
  );
  const matches = parseWorktrees(result.stdout).filter((candidate) =>
    candidate.path === expectedSource || candidate.branch === binding.branch
  );
  if (
    matches.length !== 1 || matches[0].path !== expectedSource ||
    matches[0].branch !== binding.branch
  ) fail("worktree_binding_invalid");
  const status = lstatSync(expectedSource);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    fail("worktree_path_invalid");
  }
  return Object.freeze({
    workspaceName,
    slug: binding.slug,
    branch: binding.branch,
    sourceRoot: realpathSync(expectedSource),
    runtimeRoot: join(
      PREVIEW_BASE,
      runtimeNamespace(expectedSource),
      "preview",
      binding.slug,
    ),
  });
}

export function excludedPreviewPath(relativePath) {
  const normalizedPath = normalize(relativePath).replaceAll("\\", "/");
  if (
    normalizedPath === "" || normalizedPath === "." ||
    normalizedPath === ".." || normalizedPath.startsWith("../") ||
    normalizedPath.startsWith("/")
  ) return true;
  const parts = normalizedPath.split("/");
  if (parts.some((part) => EXCLUDED_DIRECTORY_NAMES.has(part.toLowerCase()))) {
    return true;
  }
  const fileName = parts.at(-1);
  const lowerName = fileName.toLowerCase();
  if (
    (lowerName === ".env" || lowerName.startsWith(".env.")) &&
    !lowerName.endsWith(".example") && !lowerName.endsWith(".sample")
  ) return true;
  return EXCLUDED_FILE_PATTERN.test(fileName) ||
    SECRET_FILE_PATTERN.test(fileName);
}

function gitFileList(sourceRoot, run, args) {
  const result = checked(
    run,
    "git",
    ["-C", sourceRoot, "ls-files", "-z", ...args],
    { cwd: sourceRoot, encoding: "buffer" },
    "source_inventory_failed",
  );
  return Buffer.from(result.stdout ?? Buffer.alloc(0)).toString("utf8")
    .split("\0").filter(Boolean);
}

export function sourceInventory(sourceRoot, run = defaultRun) {
  const tracked = gitFileList(sourceRoot, run, ["--cached"]);
  const untracked = gitFileList(sourceRoot, run, [
    "--others",
    "--exclude-standard",
  ]);
  const entries = [...new Set([...tracked, ...untracked])].sort();
  return Object.freeze({
    tracked: Object.freeze(tracked),
    untracked: Object.freeze(untracked),
    included: Object.freeze(
      entries.filter((relativePath) => !excludedPreviewPath(relativePath)),
    ),
    excludedCount: entries.filter(excludedPreviewPath).length,
  });
}

function safeSourceEntry(sourceRoot, relativePath) {
  const sourcePath = join(sourceRoot, relativePath);
  let status;
  try {
    status = lstatSync(sourcePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
  if (status.isFile()) {
    return Object.freeze({ sourcePath, status, type: "file" });
  }
  if (status.isSymbolicLink()) {
    const target = readlinkSync(sourcePath);
    if (target.startsWith(sep)) fail("absolute_source_symlink_refused");
    const resolvedTarget = resolve(dirname(sourcePath), target);
    const sourcePrefix = `${realpathSync(sourceRoot)}${sep}`;
    if (!resolvedTarget.startsWith(sourcePrefix)) {
      fail("escaping_source_symlink_refused");
    }
    return Object.freeze({ sourcePath, status, target, type: "symlink" });
  }
  fail("unsupported_source_entry");
}

function statusDigest(sourceRoot, run) {
  const result = checked(
    run,
    "git",
    [
      "-C",
      sourceRoot,
      "status",
      "--porcelain=v2",
      "-z",
      "--untracked-files=all",
    ],
    { cwd: sourceRoot, encoding: "buffer" },
    "source_status_failed",
  );
  return createHash("sha256").update(result.stdout ?? Buffer.alloc(0)).digest(
    "hex",
  );
}

export function fingerprintSource(sourceRoot, run = defaultRun) {
  const inventory = sourceInventory(sourceRoot, run);
  const hash = createHash("sha256");
  let copiedFiles = 0;
  let copiedSymlinks = 0;
  for (const relativePath of inventory.included) {
    const entry = safeSourceEntry(sourceRoot, relativePath);
    if (!entry) continue;
    hash.update(`${entry.type}\0${relativePath}\0${entry.status.mode}\0`);
    if (entry.type === "file") {
      hash.update(readFileSync(entry.sourcePath));
      copiedFiles += 1;
    } else {
      hash.update(entry.target);
      copiedSymlinks += 1;
    }
    hash.update("\0");
  }
  const contentDigest = hash.copy().digest("hex");
  hash.update(`status\0${statusDigest(sourceRoot, run)}`);
  return Object.freeze({
    digest: hash.digest("hex"),
    contentDigest,
    trackedCount: inventory.tracked.length,
    untrackedCount: inventory.untracked.length,
    includedCount: copiedFiles + copiedSymlinks,
    excludedCount: inventory.excludedCount,
    copiedFiles,
    copiedSymlinks,
    inventory,
  });
}

export function copySourceSnapshot(sourceRoot, targetRoot, fingerprint) {
  mkdirSync(targetRoot, { mode: 0o700 });
  for (const relativePath of fingerprint.inventory.included) {
    const entry = safeSourceEntry(sourceRoot, relativePath);
    if (!entry) continue;
    const targetPath = join(targetRoot, relativePath);
    mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
    if (entry.type === "file") {
      copyFileSync(entry.sourcePath, targetPath);
      chmodSync(targetPath, entry.status.mode & 0o777);
    } else {
      symlinkSync(entry.target, targetPath);
    }
  }
}

function fileHash(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function dependencyKey(sourceRoot) {
  const hash = createHash("sha256");
  hash.update(`node=${process.version}\0`);
  for (
    const relativePath of [
      "package.json",
      "package-lock.json",
      "app/package.json",
      "app/package-lock.json",
    ]
  ) {
    hash.update(
      `${relativePath}\0${fileHash(join(sourceRoot, relativePath))}\0`,
    );
  }
  return hash.digest("hex").slice(0, 24);
}

function npmEnvironment(runtimeRoot) {
  return {
    ...process.env,
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
    npm_config_audit: "false",
    npm_config_cache: join(runtimeRoot, "npm-cache"),
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  };
}

function installDependencyTree(
  sourceRoot,
  targetRoot,
  targetPrefix,
  sourcePrefix,
  run,
  env,
) {
  const contractRoot = join(targetRoot, targetPrefix);
  const sourceContractRoot = join(sourceRoot, sourcePrefix);
  mkdirSync(contractRoot, { recursive: true, mode: 0o700 });
  for (const fileName of ["package.json", "package-lock.json"]) {
    copyFileSync(
      join(sourceContractRoot, fileName),
      join(contractRoot, fileName),
    );
  }
  const lockPath = join(contractRoot, "package-lock.json");
  const before = fileHash(lockPath);
  const npmPath = join(dirname(process.execPath), "npm");
  if (!existsSync(npmPath)) fail("matching_npm_unavailable");
  checked(
    run,
    npmPath,
    ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
    {
      cwd: contractRoot,
      env,
      timeout: INSTALL_TIMEOUT_MS,
      encoding: "utf8",
    },
    "dependency_install_failed",
  );
  if (fileHash(lockPath) !== before) fail("dependency_lock_changed");
}

export function ensureDependencies(
  sourceRoot,
  runtimeRoot,
  run = defaultRun,
) {
  const key = dependencyKey(sourceRoot);
  const dependenciesRoot = ensureOwnedDirectory(
    join(runtimeRoot, "dependencies"),
  );
  const targetRoot = join(dependenciesRoot, key);
  const stampPath = join(targetRoot, "installed.json");
  if (pathExists(stampPath)) {
    let stamp;
    try {
      stamp = JSON.parse(readFileSync(stampPath, "utf8"));
    } catch {
      fail("dependency_stamp_invalid");
    }
    if (
      stamp?.key !== key || stamp?.node !== process.version ||
      !pathExists(join(targetRoot, "root/node_modules/playwright")) ||
      !pathExists(join(targetRoot, "app/node_modules/vite")) ||
      fileHash(join(targetRoot, "root/package-lock.json")) !==
        fileHash(join(sourceRoot, "package-lock.json")) ||
      fileHash(join(targetRoot, "app/package-lock.json")) !==
        fileHash(join(sourceRoot, "app/package-lock.json"))
    ) fail("dependency_cache_invalid");
    return Object.freeze({ key, root: targetRoot, installed: false });
  }

  const stagingRoot = join(dependenciesRoot, `.install-${key}-${randomUUID()}`);
  mkdirSync(stagingRoot, { mode: 0o700 });
  try {
    const env = npmEnvironment(runtimeRoot);
    installDependencyTree(sourceRoot, stagingRoot, "root", "", run, env);
    installDependencyTree(sourceRoot, stagingRoot, "app", "app", run, env);
    for (
      const requiredPath of [
        "root/node_modules/playwright",
        "app/node_modules/vite",
        "app/node_modules/@vitejs/plugin-react",
        "app/node_modules/react",
        "app/node_modules/react-dom",
        "app/node_modules/@supabase/supabase-js",
      ]
    ) {
      if (!pathExists(join(stagingRoot, requiredPath))) {
        fail("dependency_install_incomplete");
      }
    }
    writeFileSync(
      join(stagingRoot, "installed.json"),
      `${JSON.stringify({ key, node: process.version })}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    renameSync(stagingRoot, targetRoot);
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
  return Object.freeze({ key, root: targetRoot, installed: true });
}

function writeJsonAtomic(path, value) {
  const temporaryPath = `${path}.next-${randomUUID()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
}

function readState(runtimeRoot) {
  const statePath = join(runtimeRoot, "state.json");
  if (!pathExists(statePath)) return null;
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    fail("preview_state_invalid");
  }
}

function processExists(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function ownedProcess(state, run = defaultRun) {
  if (!processExists(state?.pid)) return false;
  const result = run(
    "ps",
    ["-p", String(state.pid), "-o", "pgid=", "-o", "command="],
    { encoding: "utf8" },
  );
  if (result.error || result.status !== 0) return false;
  const line = String(result.stdout ?? "").trim();
  const match = line.match(/^(\d+)\s+(.+)$/);
  return Boolean(
    match && Number(match[1]) === state.pid &&
      match[2].includes(LOCAL_DEV_TOOL) &&
      match[2].includes("--operation serve") &&
      match[2].includes(state.sourceRoot),
  );
}

async function wait(ms) {
  await new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function stopOwnedProcess(state, run = defaultRun) {
  if (!processExists(state?.pid)) return;
  if (!ownedProcess(state, run)) fail("preview_process_identity_mismatch");
  process.kill(-state.pid, "SIGTERM");
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline && processExists(state.pid)) await wait(100);
  if (processExists(state.pid)) {
    process.kill(-state.pid, "SIGKILL");
    const killDeadline = Date.now() + 2_000;
    while (Date.now() < killDeadline && processExists(state.pid)) {
      await wait(50);
    }
  }
  if (processExists(state.pid)) fail("preview_process_stop_failed");
}

function runtimeEnvironment(spec, dependencyRoot, sourceRoot) {
  return {
    ...process.env,
    PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
    ENVAL_PREVIEW_DEPENDENCY_ROOT: dependencyRoot,
    ENVAL_PREVIEW_SECRET_ROOT: ENVAL_ROOT,
    ENVAL_PREVIEW_SOURCE_ROOT: sourceRoot,
    DO_NOT_TRACK: "1",
    SUPABASE_TELEMETRY_DISABLED: "1",
  };
}

async function viteHealthy() {
  try {
    const response = await fetch(`${PREVIEW_URL}/intern/dossiers`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok && (await response.text()).includes('id="root"');
  } catch {
    return false;
  }
}

async function waitForVite(pid) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!processExists(pid)) fail("preview_process_exited_during_start");
    if (await viteHealthy()) return;
    await wait(250);
  }
  fail("vite_health_timeout");
}

function guardedReady(spec, dependencyRoot, sourceRoot, run) {
  return checked(
    run,
    process.execPath,
    [
      LOCAL_DEV_TOOL,
      "--operation",
      "ready",
      "--vite-url",
      PREVIEW_URL,
      "--source-root",
      sourceRoot,
    ],
    {
      cwd: spec.runtimeRoot,
      env: runtimeEnvironment(spec, dependencyRoot, sourceRoot),
      timeout: 90_000,
      encoding: "utf8",
    },
    "guarded_healthcheck_failed",
  );
}

function assertNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    fail("node_22_required", `${process.execPath}:${process.version}`);
  }
}

function publishSnapshot(runtimeRoot, stagingRoot) {
  const sourceRoot = join(runtimeRoot, "source");
  const previousRoot = join(runtimeRoot, ".source-previous");
  if (pathExists(previousRoot)) {
    rmSync(previousRoot, { recursive: true, force: true });
  }
  if (pathExists(sourceRoot)) renameSync(sourceRoot, previousRoot);
  try {
    renameSync(stagingRoot, sourceRoot);
    if (pathExists(previousRoot)) {
      rmSync(previousRoot, { recursive: true, force: true });
    }
  } catch (error) {
    if (!pathExists(sourceRoot) && pathExists(previousRoot)) {
      renameSync(previousRoot, sourceRoot);
    }
    throw error;
  }
  return sourceRoot;
}

export async function startPreview(workspaceName, options = {}) {
  assertNodeVersion();
  const run = options.run ?? defaultRun;
  const spawnProcess = options.spawnProcess ?? spawn;
  const spec = resolvePreviewSpec(workspaceName, run);
  const runtimeRoot = ensureOwnedDirectory(spec.runtimeRoot);
  const priorState = readState(runtimeRoot);
  if (priorState && processExists(priorState.pid)) {
    if (!ownedProcess(priorState, run)) {
      fail("preview_process_identity_mismatch");
    }
    fail("preview_already_running");
  }
  const priorBridgeLocation = join(runtimeRoot, "source/app/node_modules");
  if (pathExists(priorBridgeLocation)) {
    if (!priorState?.dependencyRoot) fail("dependency_bridge_unowned");
    cleanupDependencyBridge({
      runtimeRoot,
      sourceRoot: join(runtimeRoot, "source"),
      dependencyRoot: priorState.dependencyRoot,
    });
  }

  const before = fingerprintSource(spec.sourceRoot, run);
  const stagingRoot = join(runtimeRoot, `.source-${randomUUID()}`);
  try {
    copySourceSnapshot(spec.sourceRoot, stagingRoot, before);
    const copied = fingerprintSource(
      stagingRoot,
      (command, args, commandOptions) => {
        if (command === "git") {
          if (args.includes("ls-files")) {
            const list = before.inventory.included.join("\0");
            return {
              status: 0,
              stdout: commandOptions.encoding === "buffer"
                ? Buffer.from(`${list}\0`)
                : `${list}\0`,
              stderr: "",
            };
          }
          if (args.includes("status")) {
            return { status: 0, stdout: Buffer.alloc(0), stderr: "" };
          }
        }
        return defaultRun(command, args, commandOptions);
      },
    );
    if (
      copied.includedCount !== before.includedCount ||
      copied.contentDigest !== before.contentDigest
    ) {
      fail("snapshot_inventory_mismatch");
    }
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }

  const dependency = ensureDependencies(stagingRoot, runtimeRoot, run);
  const sourceRoot = publishSnapshot(runtimeRoot, stagingRoot);
  const logPath = join(runtimeRoot, "preview.log");
  const logFd = openSync(logPath, "a", 0o600);
  let child;
  try {
    child = spawnProcess(
      process.execPath,
      [
        LOCAL_DEV_TOOL,
        "--operation",
        "serve",
        "--source-root",
        sourceRoot,
      ],
      {
        cwd: runtimeRoot,
        env: runtimeEnvironment(spec, dependency.root, sourceRoot),
        detached: true,
        stdio: ["ignore", logFd, logFd],
      },
    );
    child.unref();
  } finally {
    closeSync(logFd);
  }
  const state = {
    schemaVersion: 1,
    project: HERDR_PROJECT,
    workspace: workspaceName,
    branch: spec.branch,
    pid: child.pid,
    status: "starting",
    url: PREVIEW_URL,
    node: process.version,
    nodePath: process.execPath,
    sourceWorktree: spec.sourceRoot,
    sourceRoot,
    sourceFingerprint: before.digest,
    trackedCount: before.trackedCount,
    untrackedCount: before.untrackedCount,
    includedCount: before.includedCount,
    excludedCount: before.excludedCount,
    dependencyRoot: dependency.root,
    dependencyKey: dependency.key,
    dependencyInstalled: dependency.installed,
    logPath,
    startedAt: new Date().toISOString(),
  };
  writeJsonAtomic(join(runtimeRoot, "state.json"), state);

  try {
    await waitForVite(child.pid);
    const ready = guardedReady(spec, dependency.root, sourceRoot, run);
    if (!/^LOCAL_READY=PASS$/m.test(String(ready.stdout ?? ""))) {
      fail("guarded_healthcheck_invalid");
    }
    const bridge = inspectDependencyBridge({
      runtimeRoot,
      sourceRoot,
      dependencyRoot: dependency.root,
    });
    if (!bridge.exists) fail("dependency_bridge_missing");
    const after = fingerprintSource(spec.sourceRoot, run);
    if (after.digest !== before.digest) fail("source_changed_during_start");
    state.status = "running";
    state.health = "PASS";
    state.sourceUnchanged = true;
    state.dependencyBridge = bridge.location;
    state.readyAt = new Date().toISOString();
    writeJsonAtomic(join(runtimeRoot, "state.json"), state);
    return Object.freeze(state);
  } catch (error) {
    await stopOwnedProcess(state, run).catch(() => {});
    cleanupDependencyBridge({
      runtimeRoot,
      sourceRoot,
      dependencyRoot: dependency.root,
    });
    state.status = "failed";
    state.health = "FAIL";
    writeJsonAtomic(join(runtimeRoot, "state.json"), state);
    throw error;
  }
}

export async function previewStatus(workspaceName, options = {}) {
  assertNodeVersion();
  const run = options.run ?? defaultRun;
  const spec = resolvePreviewSpec(workspaceName, run);
  const runtimeRoot = ensureOwnedDirectory(spec.runtimeRoot);
  const state = readState(runtimeRoot);
  if (!state) {
    return Object.freeze({ status: "stopped", workspace: workspaceName });
  }
  const running = processExists(state.pid);
  if (running && !ownedProcess(state, run)) {
    fail("preview_process_identity_mismatch");
  }
  if (running) {
    const bridge = inspectDependencyBridge({
      runtimeRoot,
      sourceRoot: state.sourceRoot,
      dependencyRoot: state.dependencyRoot,
    });
    if (!bridge.exists) fail("dependency_bridge_missing");
  }
  const health = running ? (await viteHealthy() ? "PASS" : "FAIL") : "STOPPED";
  return Object.freeze({
    ...state,
    status: running ? "running" : "stopped",
    health,
  });
}

export async function stopPreview(workspaceName, options = {}) {
  assertNodeVersion();
  const run = options.run ?? defaultRun;
  const spec = resolvePreviewSpec(workspaceName, run);
  const runtimeRoot = ensureOwnedDirectory(spec.runtimeRoot);
  const state = readState(runtimeRoot);
  if (!state) {
    return Object.freeze({ status: "stopped", workspace: workspaceName });
  }
  await stopOwnedProcess(state, run);
  const bridge = cleanupDependencyBridge({
    runtimeRoot,
    sourceRoot: state.sourceRoot,
    dependencyRoot: state.dependencyRoot,
  });
  const after = fingerprintSource(spec.sourceRoot, run);
  const sourceUnchanged = after.digest === state.sourceFingerprint;
  const stoppedState = {
    ...state,
    status: "stopped",
    health: "STOPPED",
    orphanProcesses: "NO",
    dependencyBridgeCleaned: !bridge.exists,
    sourceUnchanged,
    stoppedAt: new Date().toISOString(),
  };
  writeJsonAtomic(join(runtimeRoot, "state.json"), stoppedState);
  if (!sourceUnchanged) fail("source_changed_while_preview_running");
  return Object.freeze(stoppedState);
}

function outputState(state) {
  process.stdout.write(
    [
      `PREVIEW_STATUS=${String(state.status).toUpperCase()}`,
      `PROJECT=${HERDR_PROJECT}`,
      `WORKSPACE=${state.workspace}`,
      `URL=${state.url ?? PREVIEW_URL}`,
      `PID=${state.pid ?? "NONE"}`,
      `HEALTH=${state.health ?? "STOPPED"}`,
      `NODE=${state.node ?? process.version}`,
      `NODE_PATH=${state.nodePath ?? process.execPath}`,
      `SOURCE_UNCHANGED=${state.sourceUnchanged === false ? "NO" : "YES"}`,
      state.sourceFingerprint
        ? `SOURCE_FINGERPRINT=${state.sourceFingerprint}`
        : null,
      Number.isInteger(state.trackedCount)
        ? `TRACKED_SOURCE_FILES=${state.trackedCount}`
        : null,
      Number.isInteger(state.untrackedCount)
        ? `UNTRACKED_SOURCE_FILES=${state.untrackedCount}`
        : null,
      state.orphanProcesses
        ? `ORPHAN_PROCESSES=${state.orphanProcesses}`
        : null,
      state.dependencyBridge
        ? `DEPENDENCY_BRIDGE=${state.dependencyBridge}`
        : null,
      state.dependencyBridgeCleaned ? "DEPENDENCY_BRIDGE_CLEANED=YES" : null,
      state.dependencyRoot ? `DEPENDENCY_ROOT=${state.dependencyRoot}` : null,
      state.sourceRoot ? `SNAPSHOT_ROOT=${state.sourceRoot}` : null,
      `STATUS_COMMAND=${process.argv[0]} ${
        process.argv[1]
      } status ${state.workspace}`,
      `STOP_COMMAND=${process.argv[0]} ${
        process.argv[1]
      } stop ${state.workspace}`,
      "",
    ].filter((line) => line !== null).join("\n"),
  );
}

function parseArgs(argv) {
  if (argv.length !== 2 || !["start", "status", "stop"].includes(argv[0])) {
    fail("usage:start_status_stop_workspace");
  }
  return Object.freeze({ operation: argv[0], workspaceName: argv[1] });
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const state = options.operation === "start"
      ? await startPreview(options.workspaceName)
      : options.operation === "status"
      ? await previewStatus(options.workspaceName)
      : await stopPreview(options.workspaceName);
    outputState(state);
    return 0;
  } catch (error) {
    const code = error instanceof PreviewError ||
        error instanceof DependencyBridgeError
      ? error.message
      : `unexpected_failure:${error?.name ?? "Error"}`;
    process.stderr.write(`PREVIEW_STATUS=FAIL\nREASON=${safeDetail(code)}\n`);
    return 1;
  }
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked === import.meta.url) process.exitCode = await main();
