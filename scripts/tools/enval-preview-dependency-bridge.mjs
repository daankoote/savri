import {
  lstatSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const ENVAL_RUNTIME_ROOT = "/private/tmp/enval-runtime/ENVAL";

export class DependencyBridgeError extends Error {
  constructor(code) {
    super(code);
    this.name = "DependencyBridgeError";
    this.code = code;
  }
}

function fail(code) {
  throw new DependencyBridgeError(code);
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

function rejectTraversal(path, code) {
  if (
    typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path ||
    path.split(sep).includes("..")
  ) fail(code);
}

function canonicalDirectory(path, code) {
  rejectTraversal(path, code);
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
  if (!status.isDirectory() || status.isSymbolicLink()) fail(code);
  const canonical = realpathSync(path);
  if (canonical !== path) fail(code);
  return canonical;
}

function assertBelow(parent, candidate, code) {
  const child = relative(parent, candidate);
  if (
    !child || child === ".." || child.startsWith(`..${sep}`) ||
    isAbsolute(child)
  ) {
    fail(code);
  }
}

function bridgePaths({ runtimeRoot, sourceRoot, dependencyRoot }) {
  const projectRoot = canonicalDirectory(
    ENVAL_RUNTIME_ROOT,
    "dependency_bridge_project_root_invalid",
  );
  const canonicalRuntimeRoot = canonicalDirectory(
    runtimeRoot,
    "dependency_bridge_runtime_root_invalid",
  );
  assertBelow(
    projectRoot,
    canonicalRuntimeRoot,
    "dependency_bridge_runtime_outside_project",
  );

  const canonicalSourceRoot = canonicalDirectory(
    sourceRoot,
    "dependency_bridge_snapshot_invalid",
  );
  if (canonicalSourceRoot !== join(canonicalRuntimeRoot, "source")) {
    fail("dependency_bridge_snapshot_topology_invalid");
  }
  assertBelow(
    projectRoot,
    canonicalSourceRoot,
    "dependency_bridge_snapshot_outside_project",
  );

  const dependencyDirectory = canonicalDirectory(
    join(canonicalRuntimeRoot, "dependencies"),
    "dependency_bridge_dependencies_directory_invalid",
  );
  const canonicalDependencyRoot = canonicalDirectory(
    dependencyRoot,
    "dependency_bridge_dependency_root_invalid",
  );
  assertBelow(
    dependencyDirectory,
    canonicalDependencyRoot,
    "dependency_bridge_dependency_topology_invalid",
  );
  assertBelow(
    projectRoot,
    canonicalDependencyRoot,
    "dependency_bridge_dependency_outside_project",
  );

  const appRoot = canonicalDirectory(
    join(canonicalSourceRoot, "app"),
    "dependency_bridge_app_root_invalid",
  );
  assertBelow(
    projectRoot,
    appRoot,
    "dependency_bridge_location_outside_project",
  );
  const location = join(appRoot, "node_modules");
  if (resolve(location) !== location) {
    fail("dependency_bridge_location_traversal_refused");
  }

  const target = canonicalDirectory(
    join(canonicalDependencyRoot, "app", "node_modules"),
    "dependency_bridge_target_invalid",
  );
  assertBelow(
    projectRoot,
    target,
    "dependency_bridge_target_outside_project",
  );
  return Object.freeze({ location, target });
}

function validateExistingBridge(location, target) {
  const status = lstatSync(location);
  if (!status.isSymbolicLink()) fail("dependency_bridge_location_occupied");
  const rawTarget = readlinkSync(location);
  if (resolve(join(location, ".."), rawTarget) !== target) {
    fail("dependency_bridge_target_mismatch");
  }
  let canonicalTarget;
  try {
    canonicalTarget = realpathSync(location);
  } catch {
    fail("dependency_bridge_target_invalid");
  }
  if (canonicalTarget !== target) fail("dependency_bridge_target_mismatch");
}

export function inspectDependencyBridge(options) {
  const paths = bridgePaths(options);
  if (!pathExists(paths.location)) {
    return Object.freeze({ ...paths, exists: false });
  }
  validateExistingBridge(paths.location, paths.target);
  return Object.freeze({ ...paths, exists: true });
}

export function ensureDependencyBridge(options) {
  const bridge = inspectDependencyBridge(options);
  if (bridge.exists) return Object.freeze({ ...bridge, created: false });
  try {
    symlinkSync(bridge.target, bridge.location, "dir");
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  validateExistingBridge(bridge.location, bridge.target);
  return Object.freeze({ ...bridge, exists: true, created: true });
}

export function cleanupDependencyBridge(options) {
  const bridge = inspectDependencyBridge(options);
  if (!bridge.exists) return Object.freeze({ ...bridge, cleaned: false });
  unlinkSync(bridge.location);
  if (pathExists(bridge.location)) fail("dependency_bridge_cleanup_failed");
  return Object.freeze({ ...bridge, exists: false, cleaned: true });
}

export function installDependencyBridgeSignalCleanup(options, onSignal) {
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      let cleanupError = null;
      try {
        cleanupDependencyBridge(options);
      } catch (error) {
        cleanupError = error;
      }
      try {
        onSignal(signal);
      } finally {
        if (cleanupError) throw cleanupError;
      }
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return Object.freeze({
    dispose() {
      for (const [signal, handler] of handlers) {
        process.off(signal, handler);
      }
    },
  });
}
