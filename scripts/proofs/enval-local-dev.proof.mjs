import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { resolvePrimaryRuntime } from "../tools/enval-primary-runtime.mjs";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const source = readFileSync(
  new URL("../tools/enval-local-dev.mjs", import.meta.url),
  "utf8",
);
const signingSource = readFileSync(
  new URL("../tools/enval-local-signing-configuration.ts", import.meta.url),
  "utf8",
);
const migrationReadiness = source.match(
  /function parseMigrationState\(sourceRoot\) \{[\s\S]*?\n\}(?=\n\nfunction parseViteUrl)/,
)?.[0];

assert.ok(migrationReadiness, "migration readiness parser missing");
assert.match(
  migrationReadiness,
  /"migration",\s*"list",\s*"--local",\s*"--output-format",\s*"json"/,
  "migration readiness must explicitly request JSON output",
);
assert.match(
  migrationReadiness,
  /body = JSON\.parse\(raw\)/,
  "migration readiness must parse the explicitly requested JSON output",
);
assert.doesNotMatch(
  migrationReadiness,
  /"--agent"/,
  "migration readiness must not depend on ambient CLI agent detection",
);

let observedArgs;
const parseMigrationState = vm.runInNewContext(`(${migrationReadiness})`, {
  command(commandName, args) {
    assert.equal(commandName, "supabase");
    observedArgs = args;
    if (
      args.includes("--output-format") &&
      args[args.indexOf("--output-format") + 1] === "json"
    ) {
      return JSON.stringify({ migrations: [{ local: "1", remote: "1" }] });
    }
    return "LOCAL | REMOTE\n1 | 1\n";
  },
  fail(code) {
    throw new Error(code);
  },
});

assert.equal(parseMigrationState("/fixture"), 0);
assert.deepEqual(Array.from(observedArgs), [
  "--workdir",
  "/fixture",
  "migration",
  "list",
  "--local",
  "--output-format",
  "json",
]);

const runtime = resolvePrimaryRuntime(root);
assert.notEqual(
  runtime.primaryRoot,
  root,
  "proof must exercise a linked worktree",
);
assert.ok(runtime.rootNodeModules.endsWith("/node_modules"));
assert.ok(runtime.appNodeModules.endsWith("/app/node_modules"));

assert.match(source, /async function startFrontend\(/);
assert.match(source, /vite\.createServer\(\{/);
assert.match(source, /configFile: false/);
assert.match(source, /envDir: dirname\(runtime\.appEnvironmentFile\)/);
assert.match(source, /"LOCAL_FRONTEND_RUNTIME=OWNED"/);
assert.match(source, /"LOCAL_FUNCTIONS_RUNTIME=OWNED"/);
assert.match(
  source,
  /ENVAL_WORKFLOW_EMAIL_PORTAL_ORIGIN:\s*DEFAULT_VITE_URL/,
  "local workflow-email links must use the owned preview origin",
);
assert.match(
  source,
  /\/functions\/v1\/workflow-email-worker/,
  "local runtime must poll the owned workflow-email worker",
);
assert.match(
  source,
  /workflowEmailPollInFlight/,
  "local worker polling must prevent overlapping claims",
);
assert.match(
  source,
  /setInterval\(pollWorkflowEmail, 1_000\)/,
  "local worker polling must be bounded and explicit",
);
assert.match(
  source,
  /clearInterval\(workflowEmailPollTimer\)/,
  "local worker polling must be released during runtime cleanup",
);
assert.match(source, /TEMPORARY_DEPENDENCY_BRIDGE/);
assert.match(source, /cleanupDependencyBridge/);
assert.match(source, /"TRACKED_RUNTIME_LINKS_CREATED=NO"/);
assert.match(source, /localSigningConfiguration\(\s*"bootstrap"/);
assert.match(source, /localSigningConfiguration\(\s*"ready"/);
assert.match(source, /"SIGNING_CONFIGURATION=PASS"/);
assert.match(source, /async function waitForPresentationBootstrap\(/);
assert.match(source, /The owned Edge Functions runtime may still be starting/);
assert.match(
  signingSource,
  /new DataPlaneTenantConfigurationV1Adapter\(client\)/,
);
assert.match(signingSource, /resolveTenantSigningMaterialBundleV1\(/);
assert.match(signingSource, /resolveSigningLegalDocumentBundle\(/);
assert.match(signingSource, /LOCAL_SIGNING_LEGAL_DOCUMENT_DELIVERY=PASS/);
assert.doesNotMatch(
  signingSource,
  /\bauth\.|\bstorage\.|\bpublic\.app_signup_|\b(?:from|into|update|join)\s+(?:public\.)?app_signup_/i,
);
assert.doesNotMatch(source, /npm\s+(?:install|update)|ln\s+-s/);

process.stdout.write("LOCAL_RUNTIME06_REGRESSION=PASS\n");
process.stdout.write("AUTONOMY_LAUNCH01_GUARDED_RUNTIME=PASS\n");
