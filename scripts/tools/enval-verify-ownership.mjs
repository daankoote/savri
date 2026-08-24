import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, relative, resolve } from "node:path";

export const COMPILER_AUTHORITY = Object.freeze({
  APP_TYPESCRIPT: "APP_TYPESCRIPT",
  DENO_NATIVE: "DENO_NATIVE",
  NON_TYPESCRIPT: "NON_TYPESCRIPT",
  UNKNOWN: "UNKNOWN",
});

const TYPESCRIPT_EXTENSIONS = Object.freeze([".ts", ".tsx", ".mts", ".cts"]);
const SOURCE_EXTENSIONS = Object.freeze([
  ...TYPESCRIPT_EXTENSIONS,
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const COMPILER_CHECK_IDS = new Set([
  "deno-check-changed",
  "deno-check-app-changed",
]);
const typescriptByRoot = new Map();

function repoPath(cwd, absolutePath) {
  return relative(cwd, absolutePath).replaceAll("\\", "/");
}

function typescriptApi(cwd) {
  if (typescriptByRoot.has(cwd)) return typescriptByRoot.get(cwd);
  const modulePath = resolve(
    cwd,
    "app/node_modules/typescript/lib/typescript.js",
  );
  if (!existsSync(modulePath)) return null;
  const api = createRequire(import.meta.url)(modulePath);
  typescriptByRoot.set(cwd, api);
  return api;
}

function resolveRelativeImport(importer, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(importer), specifier);
  const candidates = [base];
  const extension = extname(base).toLowerCase();
  if (!extension) {
    for (const candidateExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${base}${candidateExtension}`);
    }
    for (const candidateExtension of SOURCE_EXTENSIONS) {
      candidates.push(resolve(base, `index${candidateExtension}`));
    }
  } else if (!existsSync(base) && SOURCE_EXTENSIONS.includes(extension)) {
    const withoutExtension = base.slice(0, -extension.length);
    for (const candidateExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${withoutExtension}${candidateExtension}`);
    }
  }
  return candidates.find((candidate) =>
    existsSync(candidate) && statSync(candidate).isFile()
  ) ?? "UNRESOLVED";
}

export function fixedTypeScriptEntrypoints(command) {
  return [
    ...new Set(
      (command.argv ?? []).filter((part) =>
        part !== "{path}" && !part.startsWith("-") && !part.includes(",") &&
        TYPESCRIPT_EXTENSIONS.includes(
          extname(part).toLowerCase(),
        )
      ),
    ),
  ];
}

export function classifyTypeScriptEntry(path, { cwd }) {
  const entry = resolve(cwd, path);
  const parser = typescriptApi(cwd);
  if (!parser || !existsSync(entry)) {
    return Object.freeze({
      authority: COMPILER_AUTHORITY.UNKNOWN,
      entrypoint: path,
      graph: Object.freeze([]),
      reasons: Object.freeze([
        parser ? "missing_entry" : "typescript_api_missing",
      ]),
      unresolved: Object.freeze([path]),
    });
  }

  const queue = [entry];
  const visited = new Set();
  const reasons = new Set();
  const unresolved = new Set();
  const entryRepoPath = repoPath(cwd, entry);
  if (entryRepoPath.startsWith("app/src/")) reasons.add("app_entrypoint");

  while (queue.length > 0) {
    const absolutePath = queue.shift();
    if (visited.has(absolutePath)) continue;
    visited.add(absolutePath);
    const currentPath = repoPath(cwd, absolutePath);
    const extension = extname(absolutePath).toLowerCase();
    if (extension === ".tsx" || extension === ".jsx") reasons.add("jsx_graph");
    if (!SOURCE_EXTENSIONS.includes(extension)) continue;

    const source = readFileSync(absolutePath, "utf8");
    const imports = parser.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      const specifier = imported.fileName;
      if (specifier === "react" || specifier.startsWith("react/")) {
        reasons.add("react_import");
      }
      const target = resolveRelativeImport(absolutePath, specifier);
      if (target === "UNRESOLVED") {
        unresolved.add(`${currentPath}:${specifier}`);
      } else if (target) {
        queue.push(target);
      }
    }
  }

  const authority = unresolved.size > 0
    ? COMPILER_AUTHORITY.UNKNOWN
    : reasons.has("app_entrypoint") || reasons.has("jsx_graph") ||
        reasons.has("react_import")
    ? COMPILER_AUTHORITY.APP_TYPESCRIPT
    : COMPILER_AUTHORITY.DENO_NATIVE;
  return Object.freeze({
    authority,
    entrypoint: path,
    graph: Object.freeze(
      [...visited].map((item) => repoPath(cwd, item)).sort(),
    ),
    reasons: Object.freeze([...reasons].sort()),
    unresolved: Object.freeze([...unresolved].sort()),
  });
}

export function classifyTypeScriptEntrypoints(paths, { cwd }) {
  const entries = paths.map((path) => classifyTypeScriptEntry(path, { cwd }));
  const authorities = new Set(entries.map((entry) => entry.authority));
  const authority = authorities.has(COMPILER_AUTHORITY.UNKNOWN) ||
      authorities.size !== 1
    ? COMPILER_AUTHORITY.UNKNOWN
    : entries[0]?.authority ?? COMPILER_AUTHORITY.UNKNOWN;
  return Object.freeze({ authority, entries: Object.freeze(entries) });
}

export function verificationCommandAuthority(command, { cwd }) {
  const entrypoints = fixedTypeScriptEntrypoints(command);
  if (entrypoints.length > 0) {
    return classifyTypeScriptEntrypoints(entrypoints, { cwd });
  }
  return Object.freeze({
    authority: command.compilerAuthority ?? COMPILER_AUTHORITY.NON_TYPESCRIPT,
    entries: Object.freeze([]),
  });
}

export function verificationEntryInventory(manifest, { cwd }) {
  return Object.freeze(
    Object.values(manifest.commands).map((command) => {
      const classification = verificationCommandAuthority(command, { cwd });
      return Object.freeze({
        id: command.id,
        authority: classification.authority,
        entrypoints: Object.freeze(fixedTypeScriptEntrypoints(command)),
        entries: classification.entries,
      });
    }),
  );
}

export function compilerCheckForPath(commandId, path, manifest, { cwd }) {
  if (!COMPILER_CHECK_IDS.has(commandId)) return commandId;
  const classification = classifyTypeScriptEntry(path, { cwd });
  if (classification.authority === COMPILER_AUTHORITY.APP_TYPESCRIPT) {
    return "deno-check-app-changed";
  }
  if (classification.authority === COMPILER_AUTHORITY.DENO_NATIVE) {
    return "deno-check-changed";
  }
  return null;
}

export function commandWithCompilerAuthority(
  command,
  { cwd, entrypoint = null },
) {
  const classification = verificationCommandAuthority(command, { cwd });
  if (classification.authority === COMPILER_AUTHORITY.UNKNOWN) return null;
  const argv = [...(command.argv ?? [])];
  if (
    classification.authority === COMPILER_AUTHORITY.APP_TYPESCRIPT &&
    argv[0] === "deno" && ["run", "check"].includes(argv[1])
  ) {
    const fixedEntrypoints = fixedTypeScriptEntrypoints(command);
    const effectiveEntrypoints = fixedEntrypoints.length > 0
      ? fixedEntrypoints
      : entrypoint
      ? [entrypoint]
      : [];
    const config = effectiveEntrypoints.length > 0 &&
        effectiveEntrypoints.every((path) => path.startsWith("app/"))
      ? "app/tsconfig.json"
      : "scripts/tools/deno-app-proof.json";
    const configIndex = argv.indexOf("--config");
    if (configIndex >= 0) argv.splice(configIndex, 2);
    if (!argv.includes("--node-modules-dir=manual")) {
      argv.splice(2, 0, "--node-modules-dir=manual");
    }
    argv.splice(3, 0, "--config", config);
  }
  return Object.freeze({
    ...command,
    argv: command.argv ? Object.freeze(argv) : null,
    compilerAuthority: classification.authority,
  });
}
