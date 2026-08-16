import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const HTML_PATH = resolve(ROOT, "dossier.html");
const JS_PATH = resolve(ROOT, "assets/js/pages/dossier.js");
const FUNCTION_PATH = resolve(
  ROOT,
  "supabase/functions/api-dossier-dev-unlock/index.ts",
);
const ENDPOINT = "api-dossier-dev-unlock";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceFiles(root) {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...sourceFiles(path));
    else if ([".js", ".mjs"].includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

const html = readFileSync(HTML_PATH, "utf8");
const javascript = readFileSync(JS_PATH, "utf8");

for (
  const marker of [
    "devUnlockBox",
    "btnDevUnlock",
    "devUnlockState",
    "Ontgrendel dossier (dev)",
  ]
) {
  assert(!html.includes(marker), `dev_unlock_html_trigger_retained:${marker}`);
}

for (
  const marker of [
    ENDPOINT,
    "onDevUnlockClicked",
    "isDevUnlockEnabled",
    "devUnlockBox",
    "btnDevUnlock",
    "devUnlockState",
  ]
) {
  assert(!javascript.includes(marker), `dev_unlock_js_caller_retained:${marker}`);
}

const staticCallerFiles = [
  ...readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".html")
    .map((entry) => join(ROOT, entry.name)),
  ...sourceFiles(resolve(ROOT, "assets/js")),
].filter((path) => readFileSync(path, "utf8").includes(ENDPOINT));
assert(
  staticCallerFiles.length === 0,
  `static_dev_unlock_caller_retained:${staticCallerFiles.map((path) => relative(ROOT, path)).join(",")}`,
);

assert(
  html.includes('id="statusPill"') &&
    html.includes('id="btnRefresh"') &&
    html.includes('id="btnExportDossier"'),
  "legacy_dossier_normal_ui_missing",
);
assert(
  javascript.includes('document.addEventListener("DOMContentLoaded"') &&
    javascript.includes("await reloadAll();") &&
    javascript.includes('apiPost("api-dossier-get"'),
  "legacy_dossier_normal_runtime_missing",
);

assert(existsSync(FUNCTION_PATH), "dev_unlock_function_source_missing");
const functionSource = readFileSync(FUNCTION_PATH, "utf8");
assert(
  functionSource.includes("dossier_dev_unlock_applied") &&
    functionSource.includes('dossierAuthority !== "developer"') &&
    functionSource.includes('.from("dossiers")'),
  "dev_unlock_function_source_not_intentionally_retained",
);

console.log("LEGACY_DEV_UNLOCK_CALLER_REMOVED_SOURCE_RETAINED=PASS");
