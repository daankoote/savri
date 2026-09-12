import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildPlan, ROOT } from "../tools/enval-verify.mjs";
import { VERIFY_MANIFEST } from "../tools/enval-verify-manifest.mjs";
import {
  classifyTypeScriptEntry,
  COMPILER_AUTHORITY,
  verificationEntryInventory,
} from "../tools/enval-verify-ownership.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertThrowsWithMessage(callback, expectedMessage, assertionMessage) {
  try {
    callback();
  } catch (error) {
    assert(error instanceof Error, `${assertionMessage}_non_error`);
    assert(
      error.message === expectedMessage,
      `${assertionMessage}_wrong_error`,
    );
    return;
  }

  throw new Error(assertionMessage);
}

function requireExternalAppProof(paths) {
  const externalAppProofs = paths.filter((path) =>
    path.startsWith("scripts/proofs/") &&
    existsSync(resolve(ROOT, path)) &&
    classifyTypeScriptEntry(path, { cwd: ROOT }).authority ===
      COMPILER_AUTHORITY.APP_TYPESCRIPT
  );

  assert(externalAppProofs.length > 0, "external_app_proof_fixture_missing");
  return externalAppProofs;
}

const inventory = verificationEntryInventory(VERIFY_MANIFEST, { cwd: ROOT });
assert(
  inventory.every((entry) => entry.authority !== COMPILER_AUTHORITY.UNKNOWN),
  "manifest_typescript_authority_unknown",
);

const externalAppProofFixture =
  "scripts/proofs/app-signup-unified-presentation.proof.ts";
const denoRepresentative =
  "platform/runtime/customer-fact-resolution/customer_fact_resolution_policy.ts";
const deletedPath =
  "app/src/features/signup/presentation/CompactFactCorrectionEditor.tsx";
const changedPaths = [
  externalAppProofFixture,
  denoRepresentative,
  deletedPath,
];
const changedTypeScriptPaths = changedPaths.filter((path) =>
  /\.(?:ts|tsx|mts|cts)$/.test(path) && existsSync(resolve(ROOT, path))
);
const plan = buildPlan({ paths: changedPaths, mode: "INTEGRATION" });
assert(plan.errors.length === 0, "ownership_plan_invalid");

for (const path of changedTypeScriptPaths) {
  const classification = classifyTypeScriptEntry(path, { cwd: ROOT });
  assert(
    classification.authority !== COMPILER_AUTHORITY.UNKNOWN,
    `changed_typescript_authority_unknown:${path}`,
  );
  const compilerChecks = plan.selected.filter((check) => check.path === path);
  assert(
    compilerChecks.length === 1,
    `changed_typescript_compiler_authority_count_invalid:${path}`,
  );
  assert(
    compilerChecks[0].compilerAuthority === classification.authority,
    `changed_typescript_compiler_authority_mismatch:${path}`,
  );
}

const externalAppProofs = requireExternalAppProof(changedTypeScriptPaths);
assert(
  externalAppProofs.length === 1 &&
    externalAppProofs[0] === externalAppProofFixture,
  "external_app_proof_fixture_not_recognized",
);
assertThrowsWithMessage(
  () => requireExternalAppProof([]),
  "external_app_proof_fixture_missing",
  "missing_external_app_proof_not_rejected",
);
assertThrowsWithMessage(
  () => requireExternalAppProof([denoRepresentative]),
  "external_app_proof_fixture_missing",
  "non_app_proof_satisfied_external_app_requirement",
);

const cleanCheckoutPlan = buildPlan({ paths: [], mode: "INTEGRATION" });
assert(
  cleanCheckoutPlan.errors.length === 0 &&
    cleanCheckoutPlan.unclassifiedPaths.length === 0,
  "clean_checkout_ownership_plan_invalid",
);

const fixedExternalAppCommands = inventory.filter((entry) =>
  entry.authority === COMPILER_AUTHORITY.APP_TYPESCRIPT &&
  entry.entrypoints.some((path) => path.startsWith("scripts/proofs/"))
);
for (const entry of fixedExternalAppCommands) {
  const fixedCommandPlan = buildPlan({
    paths: entry.entrypoints,
    mode: "INTEGRATION",
  });
  assert(
    fixedCommandPlan.errors.length === 0,
    `fixed_app_command_plan_invalid:${entry.id}`,
  );
  const command = fixedCommandPlan.selected.find((check) =>
    check.commandId === entry.id
  );
  assert(
    command?.argv.includes("scripts/tools/deno-app-proof.json") &&
      command.compilerAuthority === COMPILER_AUTHORITY.APP_TYPESCRIPT,
    `external_app_proof_command_not_app_owned:${entry.id}`,
  );
}

assert(
  classifyTypeScriptEntry(denoRepresentative, { cwd: ROOT }).authority ===
      COMPILER_AUTHORITY.DENO_NATIVE &&
    plan.selected.some((check) =>
      check.path === denoRepresentative &&
      check.commandId === "deno-check-changed"
    ),
  "deno_native_representative_misclassified",
);

assert(
  changedPaths.includes(deletedPath) &&
    !plan.selected.some((check) => check.path === deletedPath),
  "deleted_path_emitted_as_compile_input",
);

const renamedOldPath =
  "app/src/features/dashboard/customerCorrectionSourceResolution.old.tsx";
const renamedNewPath =
  "app/src/features/dashboard/customerCorrectionSourceResolution.proof.tsx";
const renamedPlan = buildPlan({
  paths: [renamedOldPath, renamedNewPath],
  mode: "QUICK",
});
assert(
  !renamedPlan.selected.some((check) => check.path === renamedOldPath) &&
    renamedPlan.selected.some((check) =>
      check.path === renamedNewPath &&
      check.commandId === "deno-check-app-changed"
    ),
  "renamed_path_compiler_input_invalid",
);

const counts = Object.fromEntries(
  Object.values(COMPILER_AUTHORITY).map(
    (authority) => [
      authority,
      inventory.filter((entry) => entry.authority === authority).length,
    ],
  ),
);
console.log([
  "ENVAL_VERIFY_OWNERSHIP=PASS",
  `VERIFY_ENTRY_COUNT=${inventory.length}`,
  `TYPESCRIPT_VERIFY_ENTRY_COUNT=${counts.APP_TYPESCRIPT + counts.DENO_NATIVE}`,
  `APP_TYPESCRIPT_ENTRY_COUNT=${counts.APP_TYPESCRIPT}`,
  `DENO_NATIVE_ENTRY_COUNT=${counts.DENO_NATIVE}`,
  `NON_TYPESCRIPT_ENTRY_COUNT=${counts.NON_TYPESCRIPT}`,
  `UNKNOWN_AUTHORITY_ENTRY_COUNT=${counts.UNKNOWN}`,
  `APP_DEPENDENT_PROOFS_OUTSIDE_APP=${externalAppProofs.join(",")}`,
  "EXTERNAL_APP_PROOF_POSITIVE=PASS",
  "MISSING_EXTERNAL_APP_PROOF_REJECTED=PASS",
  "NON_APP_PROOF_REJECTED=PASS",
  "CLEAN_CHECKOUT_PATH_SET=PASS",
].join("\n"));
