import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DOSSIER_JS_PATH = resolve(ROOT, "assets/js/pages/dossier.js");
const LEGACY_SCRIPT_PATH = resolve(ROOT, "assets/js/script.js");
const ACCESS_SAVE_SOURCE = resolve(
  ROOT,
  "supabase/functions/api-dossier-access-save/index.ts",
);
const ACCESS_UPDATE_SOURCE = resolve(
  ROOT,
  "supabase/functions/api-dossier-access-update/index.ts",
);
const RETIRED_CALLER = "api-dossier-access-update";

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

const dossierJs = readFileSync(DOSSIER_JS_PATH, "utf8");
const accessStart = dossierJs.indexOf("async function onAccessSave(e)");
const accessEnd = dossierJs.indexOf("async function onAddressSave(e)", accessStart);
assert(accessStart >= 0 && accessEnd > accessStart, "on_access_save_missing");
const onAccessSave = dossierJs.slice(accessStart, accessEnd);

assert(
  onAccessSave.includes('apiAuthed("api-dossier-access-save"'),
  "primary_access_save_missing",
);
assert(
  !onAccessSave.includes(RETIRED_CALLER),
  "secondary_access_update_retry_retained",
);
assert(
  /catch \(err\) \{\s*console\.error\(err\);\s*showToast\(err\.message \|\| "Opslaan mislukt\.", "error"\);\s*\}/s
    .test(onAccessSave),
  "primary_access_save_failure_not_surfaced",
);

const staticCallerFiles = [
  ...readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === ".html")
    .map((entry) => join(ROOT, entry.name)),
  ...sourceFiles(resolve(ROOT, "assets/js")),
].filter((path) => readFileSync(path, "utf8").includes(RETIRED_CALLER));
assert(
  staticCallerFiles.length === 0,
  `static_access_update_caller_retained:${staticCallerFiles.map((path) => relative(ROOT, path)).join(",")}`,
);

for (
  const endpoint of [
    "api-dossier-access-save",
    "api-dossier-address-save",
    "api-dossier-address-verify",
    "api-dossier-charger-delete",
    "api-dossier-charger-save",
    "api-dossier-consents-save",
    "api-dossier-doc-delete",
    "api-dossier-doc-download-url",
    "api-dossier-evaluate",
    "api-dossier-export",
    "api-dossier-get",
    "api-dossier-login-request",
    "api-dossier-observed-source-upsert",
    "api-dossier-upload-confirm",
    "api-dossier-upload-url",
    "api-dossier-verify",
  ]
) {
  assert(dossierJs.includes(endpoint), `other_legacy_caller_missing:${endpoint}`);
}
assert(
  readFileSync(LEGACY_SCRIPT_PATH, "utf8").includes("api-lead-submit"),
  "legacy_lead_caller_missing",
);

assert(existsSync(ACCESS_SAVE_SOURCE), "access_save_function_source_missing");
assert(
  existsSync(ACCESS_UPDATE_SOURCE),
  "access_update_function_source_missing",
);

console.log("LEGACY_ACCESS_UPDATE_CALLER_REMOVED_PRIMARY_RETAINED=PASS");
