import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

export class PrimaryRuntimeError extends Error {
  constructor(code) {
    super(code);
    this.name = "PrimaryRuntimeError";
    this.code = code;
  }
}

function fail(code) {
  throw new PrimaryRuntimeError(code);
}

function regularFile(path, code) {
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size === 0) {
      fail(code);
    }
    return realpathSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
}

function regularDirectory(path, code) {
  try {
    const status = lstatSync(path);
    if (!status.isDirectory() || status.isSymbolicLink()) fail(code);
    return realpathSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") fail(code);
    throw error;
  }
}

function sameFileContents(left, right, code) {
  if (!readFileSync(left).equals(readFileSync(right))) fail(code);
}

export function resolvePrimaryRuntime(root, run = spawnSync) {
  const worktreeRoot = realpathSync(resolve(root));
  const result = run(
    "git",
    [
      "-C",
      worktreeRoot,
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ],
    {
      cwd: worktreeRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      shell: false,
    },
  );
  if (result.error || result.status !== 0) fail("primary_checkout_unavailable");
  const commonDirectory = realpathSync(String(result.stdout ?? "").trim());
  if (basename(commonDirectory) !== ".git") {
    fail("primary_checkout_invalid");
  }
  const primaryRoot = regularDirectory(
    dirname(commonDirectory),
    "primary_checkout_invalid",
  );
  if (realpathSync(join(primaryRoot, ".git")) !== commonDirectory) {
    fail("primary_checkout_invalid");
  }

  for (
    const relativePath of [
      "package.json",
      "package-lock.json",
      "app/package.json",
      "app/package-lock.json",
    ]
  ) {
    const worktreeFile = regularFile(
      join(worktreeRoot, relativePath),
      "dependency_contract_missing",
    );
    const primaryFile = regularFile(
      join(primaryRoot, relativePath),
      "primary_dependency_contract_missing",
    );
    sameFileContents(
      worktreeFile,
      primaryFile,
      "primary_dependency_contract_mismatch",
    );
  }

  const rootNodeModules = regularDirectory(
    join(primaryRoot, "node_modules"),
    "primary_root_dependencies_missing",
  );
  const appNodeModules = regularDirectory(
    join(primaryRoot, "app/node_modules"),
    "primary_app_dependencies_missing",
  );
  for (
    const relativePath of [
      "playwright",
    ]
  ) {
    regularDirectory(
      join(rootNodeModules, relativePath),
      "primary_dependency_missing",
    );
  }
  for (
    const relativePath of [
      "vite",
      "@vitejs/plugin-react",
      "react",
      "react-dom",
      "@supabase/supabase-js",
    ]
  ) {
    regularDirectory(
      join(appNodeModules, relativePath),
      "primary_dependency_missing",
    );
  }

  return Object.freeze({
    primaryRoot,
    rootNodeModules,
    appNodeModules,
    appEnvironmentFile: regularFile(
      join(primaryRoot, "app/.env.local"),
      "primary_app_env_missing",
    ),
    functionsEnvironmentFile: regularFile(
      join(primaryRoot, "supabase/functions/.env.local"),
      "primary_functions_env_missing",
    ),
  });
}
