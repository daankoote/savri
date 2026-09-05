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

function dependencyRuntime(worktreeRoot, run, environment) {
  const dependencyRootValue = environment?.ENVAL_PREVIEW_DEPENDENCY_ROOT;
  const secretRootValue = environment?.ENVAL_PREVIEW_SECRET_ROOT;
  if (!dependencyRootValue && !secretRootValue) return null;
  if (!dependencyRootValue || !secretRootValue) {
    fail("preview_runtime_configuration_incomplete");
  }

  const dependencyRoot = regularDirectory(
    resolve(dependencyRootValue),
    "preview_dependency_root_missing",
  );
  const repositoryCheck = run(
    "git",
    ["-C", dependencyRoot, "rev-parse", "--is-inside-work-tree"],
    {
      cwd: dependencyRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      shell: false,
    },
  );
  if (repositoryCheck.error) fail("preview_dependency_location_check_failed");
  if (repositoryCheck.status === 0) {
    fail("preview_dependencies_inside_repository");
  }

  const secretRoot = regularDirectory(
    resolve(secretRootValue),
    "preview_secret_root_missing",
  );
  regularDirectory(join(secretRoot, ".git"), "preview_secret_root_invalid");

  for (const relativePath of ["package.json", "package-lock.json"]) {
    sameFileContents(
      regularFile(
        join(worktreeRoot, relativePath),
        "dependency_contract_missing",
      ),
      regularFile(
        join(dependencyRoot, "root", relativePath),
        "preview_dependency_contract_missing",
      ),
      "preview_dependency_contract_mismatch",
    );
    sameFileContents(
      regularFile(
        join(worktreeRoot, "app", relativePath),
        "dependency_contract_missing",
      ),
      regularFile(
        join(dependencyRoot, "app", relativePath),
        "preview_dependency_contract_missing",
      ),
      "preview_dependency_contract_mismatch",
    );
  }

  const rootNodeModules = regularDirectory(
    join(dependencyRoot, "root/node_modules"),
    "preview_root_dependencies_missing",
  );
  const appNodeModules = regularDirectory(
    join(dependencyRoot, "app/node_modules"),
    "preview_app_dependencies_missing",
  );
  regularDirectory(
    join(rootNodeModules, "playwright"),
    "preview_dependency_missing",
  );
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
      "preview_dependency_missing",
    );
  }

  return Object.freeze({
    primaryRoot: secretRoot,
    dependencySource: "external_preview_runtime",
    rootNodeModules,
    appNodeModules,
    appEnvironmentFile: regularFile(
      join(secretRoot, "app/.env.local"),
      "primary_app_env_missing",
    ),
    functionsEnvironmentFile: regularFile(
      join(secretRoot, "supabase/functions/.env.local"),
      "primary_functions_env_missing",
    ),
  });
}

export function resolvePrimaryRuntime(
  root,
  run = spawnSync,
  environment = process.env,
) {
  const worktreeRoot = realpathSync(resolve(root));
  const previewRuntime = dependencyRuntime(worktreeRoot, run, environment);
  if (previewRuntime) return previewRuntime;
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
    dependencySource: "primary_checkout",
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
