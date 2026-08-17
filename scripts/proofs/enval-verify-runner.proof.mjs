import { createHash } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  boundDiagnostic,
  buildPlan,
  formatEvidence,
  inspectMigrationOmissions,
  ROOT,
  runChecks,
  statusExitCode,
  validateManifest,
  verify,
} from "../tools/enval-verify.mjs";
import { SAFETY, VERIFY_MANIFEST } from "../tools/enval-verify-manifest.mjs";
import { resolveSupabaseTarget } from "../tools/enval-supabase-target.mjs";
import {
  parseCliArgs,
  redactSecrets,
  resolveLocalConnection,
  runReadOnlySqlProof,
  validateReadOnlySql,
} from "../tools/enval-readonly-sql.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function git(args) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  assert(result.status === 0, `git_fixture_failed:${args[0]}`);
  return result.stdout;
}

function hash(path) {
  return createHash("sha256").update(readFileSync(resolve(ROOT, path)))
    .digest("hex");
}

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

assert(validateManifest().length === 0, "manifest_metadata_invalid");
for (
  const id of [
    "deno-check-changed",
    "deno-check-browser-proof",
    "edge-static-check",
  ]
) {
  assert(
    VERIFY_MANIFEST.commands[id].argv.slice(0, 2).join(" ") ===
      "deno check" &&
      !VERIFY_MANIFEST.commands[id].argv.includes("--cached-only") &&
      VERIFY_MANIFEST.commands[id].argv.includes("--deny-import") &&
      VERIFY_MANIFEST.commands[id].argv.includes("--no-lock"),
    `deno_check_command_invalid:${id}`,
  );
}

const browserProofPlan = buildPlan({
  paths: ["scripts/proofs/app-signup-signing-kiss.proof.ts"],
  mode: "QUICK",
});
assert(
  browserProofPlan.selected.length === 2 &&
    browserProofPlan.selected.some((check) =>
      check.commandId === "deno-check-browser-proof" &&
      check.argv.includes("scripts/tools/deno-browser-proof.json")
    ) &&
    !browserProofPlan.selected.some((check) =>
      check.commandId === "deno-check-changed"
    ),
  "browser_proof_typecheck_profile_not_isolated",
);

const currentPaths = [
  "scripts/tools/enval-verify.mjs",
  "scripts/tools/enval-verify-manifest.mjs",
  "scripts/proofs/enval-verify-runner.proof.mjs",
];

const quick = buildPlan({
  paths: currentPaths,
  mode: "QUICK",
});
assert(
  quick.selected.length === 4 &&
    quick.selected.every((check) => check.safety === SAFETY.SAFE_PURE) &&
    quick.gated.length === 0 && quick.errors.length === 0,
  "quick_selected_non_safe_or_unexpected_checks",
);

const localService = buildPlan({
  paths: [
    ...currentPaths,
    "scripts/tools/enval-readonly-sql.mjs",
    "scripts/proofs/enval-local-readonly-catalog.proof.sql",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  localService.selected.filter((check) =>
    check.commandId === "local-readonly-catalog"
  ).length === 1 &&
    localService.selected.every((check) =>
      [SAFETY.SAFE_PURE, SAFETY.SAFE_LOCAL_READ].includes(check.safety)
    ) &&
    !localService.selected.some((check) => check.mutatesState),
  "local_service_selected_unsafe_check",
);

const controlPlaneLocalService = buildPlan({
  paths: [
    "platform/control-plane/supabase/config.toml",
    "platform/control-plane/supabase/migrations/20260815120000_platform_control_plane_foundation.sql",
    "platform/runtime/tenant-resolution/tenant_resolution.ts",
    "scripts/proofs/platform-control-plane-foundation.proof.ts",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  controlPlaneLocalService.selected.filter((check) =>
    check.commandId === "control-plane-foundation-local"
  ).length === 1 &&
    controlPlaneLocalService.selected.some((check) =>
      check.safety === SAFETY.SAFE_LOCAL_CONTROL_PLANE_WRITE &&
      check.mutatesState && !check.remote && !check.destructive
    ),
  "control_plane_local_transaction_not_classified_or_deduplicated",
);

const tenantEphemeralLocalService = buildPlan({
  paths: [
    "supabase/migrations/20260816160000_app_workforce_policy_foundation.sql",
    "scripts/proofs/app-workforce-policy-foundation.proof.ts",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  tenantEphemeralLocalService.selected.filter((check) =>
    check.commandId === "workforce-policy-foundation-local"
  ).length === 1 &&
    tenantEphemeralLocalService.selected.some((check) =>
      check.safety === SAFETY.SAFE_LOCAL_TENANT_EPHEMERAL_WRITE &&
      check.mutatesState && !check.remote && !check.destructive
    ),
  "tenant_ephemeral_local_proof_not_classified_or_deduplicated",
);

const tenantMigrationChainLocalService = buildPlan({
  paths: [
    "supabase/migrations/20260816150000_app_current_baseline.sql",
    "supabase/migration-archive/README.md",
    "scripts/tools/enval-migration-chain-manifest.mjs",
    "scripts/proofs/enval-migration-chain.proof.mjs",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  tenantMigrationChainLocalService.selected.filter((check) =>
    check.commandId === "tenant-migration-chain-local"
  ).length === 1 &&
    tenantMigrationChainLocalService.selected.some((check) =>
      check.safety === SAFETY.SAFE_LOCAL_TENANT_EPHEMERAL_WRITE &&
      check.mutatesState && !check.remote && !check.destructive
    ),
  "tenant_migration_chain_proof_not_classified_or_deduplicated",
);

const evidenceReviewLocalService = buildPlan({
  paths: [
    "supabase/migrations/20260817230000_app_evidence_review_foundation.sql",
    "scripts/proofs/app-evidence-review-foundation.proof.ts",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  evidenceReviewLocalService.selected.filter((check) =>
    check.commandId === "evidence-review-foundation-pure"
  ).length === 1 &&
    evidenceReviewLocalService.selected.filter((check) =>
      check.commandId === "evidence-review-foundation-local"
    ).length === 1 &&
    evidenceReviewLocalService.selected.some((check) =>
      check.commandId === "evidence-review-foundation-local" &&
      check.safety === SAFETY.SAFE_LOCAL_TENANT_EPHEMERAL_WRITE &&
      check.mutatesState && !check.remote && !check.destructive
    ),
  "evidence_review_local_proof_not_classified_or_deduplicated",
);

const evidenceReviewWorklistLocalService = buildPlan({
  paths: [
    "supabase/migrations/20260818090000_app_evidence_review_worklist_read.sql",
    "supabase/functions/_shared/app_evidence_review_worklist.ts",
    "supabase/functions/api-app-evidence-review-worklist/index.ts",
    "scripts/proofs/app-evidence-review-worklist-read.proof.ts",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  evidenceReviewWorklistLocalService.selected.filter((check) =>
    check.commandId === "evidence-review-worklist-read-pure"
  ).length === 1 &&
    evidenceReviewWorklistLocalService.selected.filter((check) =>
      check.commandId === "evidence-review-worklist-read-local"
    ).length === 1 &&
    evidenceReviewWorklistLocalService.selected.some((check) =>
      check.commandId === "evidence-review-worklist-read-local" &&
      check.safety === SAFETY.SAFE_LOCAL_TENANT_EPHEMERAL_WRITE &&
      check.mutatesState && !check.remote && !check.destructive
    ),
  "evidence_review_worklist_proof_not_classified_or_deduplicated",
);

const evidenceReviewCaseDetailLocalService = buildPlan({
  paths: [
    "supabase/migrations/20260818120000_app_evidence_review_case_detail_read.sql",
    "supabase/functions/_shared/app_evidence_review_case_detail.ts",
    "supabase/functions/api-app-evidence-review-case-detail/index.ts",
    "scripts/proofs/app-evidence-review-case-detail.proof.ts",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  evidenceReviewCaseDetailLocalService.selected.filter((check) =>
    check.commandId === "evidence-review-case-detail-pure"
  ).length === 1 &&
    evidenceReviewCaseDetailLocalService.selected.filter((check) =>
      check.commandId === "evidence-review-case-detail-local"
    ).length === 1 &&
    evidenceReviewCaseDetailLocalService.selected.some((check) =>
      check.commandId === "evidence-review-case-detail-local" &&
      check.safety === SAFETY.SAFE_LOCAL_TENANT_EPHEMERAL_WRITE &&
      check.mutatesState && !check.remote && !check.destructive
    ),
  "evidence_review_case_detail_proof_not_classified_or_deduplicated",
);

const evidenceReviewPreviewLocalService = buildPlan({
  paths: [
    "supabase/migrations/20260818150000_app_evidence_review_preview_read.sql",
    "supabase/functions/_shared/app_evidence_review_preview.ts",
    "supabase/functions/api-app-evidence-review-preview/index.ts",
    "scripts/proofs/app-evidence-review-preview.proof.ts",
  ],
  mode: "LOCAL_SERVICE",
});
assert(
  evidenceReviewPreviewLocalService.selected.filter((check) =>
    check.commandId === "evidence-review-preview-pure"
  ).length === 1 &&
    evidenceReviewPreviewLocalService.selected.filter((check) =>
      check.commandId === "evidence-review-preview-local"
    ).length === 1 &&
    evidenceReviewPreviewLocalService.selected.some((check) =>
      check.commandId === "evidence-review-preview-local" &&
      check.safety === SAFETY.SAFE_LOCAL_READ && !check.mutatesState &&
      !check.remote && !check.destructive
    ),
  "evidence_review_preview_proof_not_classified_or_deduplicated",
);

const evidenceReviewWorklistUiTargeted = buildPlan({
  paths: [
    "app/src/App.tsx",
    "app/src/features/evidence-review/EvidenceReviewWorklistPage.proof.tsx",
    "app/src/features/evidence-review/EvidenceReviewWorklistPage.tsx",
    "app/src/features/evidence-review/evidenceReviewWorklistClient.ts",
    "app/src/features/evidence-review/useEvidenceReviewWorklist.ts",
    "app/src/pages/EvidenceReviewWorklistPage.tsx",
  ],
  mode: "TARGETED",
});
assert(
  evidenceReviewWorklistUiTargeted.selected.filter((check) =>
    check.commandId === "evidence-review-worklist-ui-pure"
  ).length === 1 &&
    evidenceReviewWorklistUiTargeted.selected.some((check) =>
      check.commandId === "evidence-review-worklist-ui-pure" &&
      check.safety === SAFETY.SAFE_PURE && !check.mutatesState &&
      !check.remote && !check.destructive
    ),
  "evidence_review_worklist_ui_not_classified_or_deduplicated",
);

for (const fixture of [
  { target: null, operation: "inspect", expected: "target_required" },
  { target: "UNKNOWN", operation: "inspect", expected: "unknown_target" },
  { target: "CONTROL_PLANE", operation: "link", expected: "remote_operation_not_supported" },
  { target: "TENANT_ENVAL", operation: "db-reset", expected: "tenant_enval_mutation_not_authorized" },
]) {
  let failure = "";
  try {
    resolveSupabaseTarget({ ...fixture, cwd: ROOT, env: {} });
  } catch (error) {
    failure = String(error);
  }
  assert(failure.includes(fixture.expected), `target_guard_failed:${fixture.expected}`);
}
let ambiguousCredentialsRejected = false;
try {
  resolveSupabaseTarget({
    target: "CONTROL_PLANE",
    operation: "start",
    cwd: ROOT,
    env: {
      ENVAL_CONTROL_PLANE_DATABASE_URL: "present-not-printed",
      ENVAL_TENANT_ENVAL_DATABASE_URL: "present-not-printed",
    },
  });
} catch (error) {
  ambiguousCredentialsRejected = String(error).includes(
    "ambiguous_credential_namespaces",
  );
}
assert(ambiguousCredentialsRejected, "ambiguous_target_did_not_fail_closed");

const deduplicated = buildPlan({
  paths: [
    "app/src/features/signup/SignupPageShell.tsx",
    "app/src/features/signup/SignupFlowNavigation.tsx",
  ],
  mode: "TARGETED",
});
assert(
  deduplicated.selected.filter((check) =>
        check.commandId === "signup-journey-pure"
      ).length === 1 &&
    deduplicated.selected.filter((check) =>
        check.commandId === "signup-unified-presentation-pure"
      ).length === 1,
  "targeted_deduplication_failed",
);

const gated = buildPlan({
  paths: [
    "scripts/proofs/in-place-baseline-phase0-proof.mjs",
    "scripts/proofs/postgrest-authorized-health.proof.mjs",
    "supabase/baseline-proposals/wave-1/001_app_identity_audit_idempotency.sql",
    "scripts/proofs/local-mutation-fixture.sql",
  ],
  mode: "TARGETED",
});
assert(
  gated.gated.some((check) => check.safety === SAFETY.REMOTE_GATED) &&
    gated.gated.some((check) =>
      check.safety === SAFETY.DESTRUCTIVE_GATED
    ) &&
    gated.gated.some((check) =>
      check.safety === SAFETY.LOCAL_MUTATING_GATED
    ),
  "remote_destructive_or_mutating_check_not_gated",
);
const executed = [];
runChecks(gated, {
  executor(check) {
    executed.push(check.id);
    return { exitCode: 0, durationMs: 0, stdout: "", stderr: "" };
  },
});
assert(
  executed.every((id) =>
    !gated.gated.some((gatedCheck) => gatedCheck.id === id)
  ),
  "gated_check_reached_executor",
);

const integration = buildPlan({
  paths: [
    "app/src/features/signup/SignupPageShell.tsx",
    "app/src/features/signup/SignupFlowNavigation.tsx",
  ],
  mode: "INTEGRATION",
});
assert(
  integration.selected.some((check) => check.id === "local-readonly-catalog") &&
    integration.selected.some((check) => check.id === "app-typecheck-build") &&
    integration.selected.some((check) =>
      check.id === "git-diff-cached-check"
    ) &&
    integration.selected.some((check) => check.id === "edge-static-check") &&
    integration.selected.filter((check) =>
      check.commandId === "signup-journey-pure"
    ).length === 1 &&
    new Set(integration.selected.map((check) => check.dedupeKey)).size ===
      integration.selected.length,
  "integration_breadth_or_deduplication_failed",
);

const release = buildPlan({ paths: [], mode: "RELEASE" });
const releaseExecuted = [];
runChecks(release, {
  executor(check) {
    releaseExecuted.push(check.id);
    return {
      exitCode: 0,
      durationMs: 0,
      stdout: check.expectedMarker ?? "",
      stderr: "",
    };
  },
});
assert(
  release.gated.some((check) =>
    check.safety === SAFETY.LOCAL_MUTATING_GATED
  ) &&
    release.gated.some((check) =>
      check.safety === SAFETY.DESTRUCTIVE_GATED
    ) &&
    release.gated.some((check) => check.safety === SAFETY.REMOTE_GATED) &&
    release.gated.filter((check) => check.requiredForRelease).length === 3 &&
    releaseExecuted.every((id) =>
      !release.gated.some((check) => check.id === id)
    ),
  "release_gated_check_executed_or_missing",
);
const releaseEvidence = verify({
  mode: "RELEASE",
  executor(check) {
    return {
      exitCode: 0,
      durationMs: 0,
      stdout: check.expectedMarker ?? "",
      stderr: "",
    };
  },
});
assert(
  releaseEvidence.status === "GATED_REQUIRED" &&
    releaseEvidence.preCommitGate === releaseEvidence.status &&
    releaseEvidence.requiredReleaseGates.length === 3 &&
    releaseEvidence.planErrors.length === 0 &&
    releaseEvidence.unclassifiedPaths.length === 0 &&
    releaseEvidence.migrationOmissions.length === 0 &&
    releaseEvidence.failed === 0 &&
    statusExitCode(releaseEvidence) !== 0,
  "release_silently_passed_required_gates",
);

const sqlFixture = readFileSync(
  resolve(ROOT, "scripts/proofs/enval-local-readonly-catalog.proof.sql"),
  "utf8",
);
assert(validateReadOnlySql(sqlFixture), "readonly_sql_fixture_rejected");
const connection = resolveLocalConnection(
  readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8"),
);
assert(
  connection.projectId === "enval" &&
    connection.host === "127.0.0.1" && connection.port === 54322,
  "local_sql_connection_not_enval_loopback",
);
let remoteArgumentRejected = false;
try {
  parseCliArgs(["--database-url", "postgresql://remote.example/postgres"]);
} catch {
  remoteArgumentRejected = true;
}
assert(remoteArgumentRejected, "remote_database_argument_accepted");
const secretDiagnostic = redactSecrets(
  "DATABASE_URL=postgresql://user:secret@remote/db PGPASSWORD=secret",
  ["secret"],
);
assert(
  !secretDiagnostic.includes("postgresql://") &&
    !secretDiagnostic.includes("secret"),
  "sql_diagnostic_exposed_credentials",
);
const mutationSql =
  "BEGIN TRANSACTION READ ONLY; DELETE FROM public.fixture; ROLLBACK;";
let mutationExecutorCalled = false;
let mutationRejected = false;
try {
  runReadOnlySqlProof({
    proofId: "mutation-fixture",
    definitions: {
      "mutation-fixture": {
        path: "scripts/proofs/enval-local-readonly-catalog.proof.sql",
        sha256: hashText(mutationSql),
        marker: "NEVER",
      },
    },
    readFile(path) {
      return String(path).endsWith(".sql") ? mutationSql : "";
    },
    executor() {
      mutationExecutorCalled = true;
      return { status: 0, stdout: "NEVER", stderr: "" };
    },
  });
} catch (error) {
  mutationRejected = String(error).includes("sql_mutation_keyword_rejected");
}
assert(
  mutationRejected && !mutationExecutorCalled,
  "sql_mutation_reached_executor",
);

const realSqlProof = runReadOnlySqlProof({
  proofId: "enval-local-readonly-catalog",
});
assert(
  realSqlProof.markerCount === 1 &&
    realSqlProof.connection.host === "127.0.0.1",
  "real_local_readonly_sql_proof_failed",
);

const unknownManifest = {
  ...VERIFY_MANIFEST,
  globalChecks: [],
  pathRules: [{
    id: "unknown-check-fixture",
    match: { type: "exact", value: "fixture.unknown" },
    checks: ["not-registered"],
  }],
};
const unknownCheck = buildPlan({
  paths: ["fixture.unknown"],
  mode: "QUICK",
  manifest: unknownManifest,
});
assert(
  unknownCheck.selected.length === 0 &&
    unknownCheck.errors[0] === "unknown_check:not-registered:fixture.unknown",
  "unknown_check_did_not_fail_closed",
);
const unknownPath = buildPlan({
  paths: ["unmapped.enval-fixture"],
  mode: "QUICK",
});
assert(
  unknownPath.unclassifiedPaths[0] === "unmapped.enval-fixture",
  "unknown_path_did_not_fail_closed",
);

const stopAfterFailure = runChecks({
  selected: [
    {
      id: "first-failure",
      safety: SAFETY.SAFE_PURE,
      argv: ["fixture"],
    },
    {
      id: "must-not-run",
      safety: SAFETY.SAFE_PURE,
      argv: ["fixture"],
    },
  ],
}, {
  executor(check) {
    return {
      exitCode: check.id === "first-failure" ? 23 : 0,
      durationMs: 1,
      stdout: "x".repeat(20_000),
      stderr: "",
    };
  },
});
assert(
  stopAfterFailure.length === 1 && stopAfterFailure[0].exitCode === 23 &&
    stopAfterFailure[0].diagnostic.length <= 4_025,
  "failure_output_unbounded_or_execution_did_not_stop",
);
const boundedFailureOutput = formatEvidence({
  mode: "QUICK",
  status: "FAIL",
  h3aStatus: "FAIL",
  head: "fixture",
  diffHash: "fixture",
  selectedCheckCount: 2,
  passed: 1,
  failed: 1,
  skippedGated: 0,
  unclassifiedPaths: [],
  migrationOmission: "PASS",
  migrationBaselineUnresolved: [],
  migrationBaselineExceptions: [],
  migrationGitInclusionRequired: [],
  migrationGitVisibleCandidates: [],
  migrationStagedCandidates: [],
  preCommitGate: "NOT_APPLICABLE",
  preCommitOnly: false,
  durationMs: 2,
  checks: [
    { id: "earlier-pass", status: "PASS", durationMs: 1 },
    stopAfterFailure[0],
  ],
  planErrors: [],
  migrationOmissions: [],
  requiredReleaseGates: [],
});
assert(
  boundedFailureOutput.includes("first-failure | FAIL | exit=23") &&
    !boundedFailureOutput.includes("earlier-pass | PASS") &&
    boundedFailureOutput.length < 5_000,
  "failure_evidence_not_bounded_to_failing_check",
);

const compactRun = verify({
  mode: "QUICK",
  executor() {
    return {
      exitCode: 0,
      durationMs: 1,
      stdout: "green-log-that-must-not-appear",
      stderr: "",
    };
  },
});
const compactOutput = formatEvidence(compactRun);
for (
  const field of [
    "ENVAL_VERIFY_MODE=",
    "ENVAL_VERIFY_STATUS=",
    "HEAD=",
    "DIFF_HASH=",
    "SELECTED_CHECK_COUNT=",
    "PASSED=",
    "FAILED=",
    "SKIPPED_GATED=",
    "UNCLASSIFIED_PATHS=",
    "MIGRATION_OMISSION=",
    "PRE_COMMIT_GATE=",
    "TOTAL_DURATION_MS=",
  ]
) {
  assert(compactOutput.includes(field), `compact_field_missing:${field}`);
}
assert(
  !compactOutput.includes("green-log-that-must-not-appear") &&
    compactOutput.split("\n").length <= compactRun.selectedCheckCount + 22,
  "green_output_not_compact",
);
assert(
  JSON.parse(formatEvidence(compactRun, { json: true })).diffHash ===
    compactRun.diffHash,
  "json_evidence_invalid",
);
assert(
  statusExitCode({ status: "PASS" }) === 0 &&
    statusExitCode({ status: "FAIL" }) !== 0 &&
    boundDiagnostic("line\n".repeat(100)).split("\n").length <= 20,
  "exit_code_or_diagnostic_contract_failed",
);

const migrationStatusBefore = git([
  "status",
  "--short",
  "--ignored",
  "--",
  "supabase/migrations",
  "platform/control-plane/supabase/migrations",
]);
const repositoryStatusBefore = git([
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
  "--ignored=matching",
]);
const baselineBefore = inspectMigrationOmissions();
const activeTenantMigrationPaths = [
  VERIFY_MANIFEST.tenantMigrationChain.baseline,
  ...VERIFY_MANIFEST.tenantMigrationChain.forwardTail,
].map((entry) => entry.path);
const baselineHashesBefore = Object.fromEntries(
  baselineBefore.candidates.map((path) => [path, hash(path)]),
);
assert(
    baselineBefore.exceptions.length === 0 &&
    baselineBefore.unresolved.length === 0 &&
    baselineBefore.omissions.length === 0 &&
    baselineBefore.gitInclusionRequired.length === 0 &&
    activeTenantMigrationPaths.every((path) =>
      baselineBefore.trackedMigrations.includes(path) ||
      baselineBefore.gitVisibleCandidates.some((item) =>
        item.path === path && item.target === "TENANT_ENVAL"
      )
    ) &&
    VERIFY_MANIFEST.tenantMigrationChain.currentPresentAppMigrations.length ===
      29 &&
    VERIFY_MANIFEST.tenantMigrationChain.absentLegacyMigrations.length === 10 &&
    VERIFY_MANIFEST.tenantMigrationChain.excludedConnectionMigrations.length ===
      2 &&
    baselineBefore.trackedMigrations.includes(
      "platform/control-plane/supabase/migrations/20260815120000_platform_control_plane_foundation.sql",
    ) &&
    baselineBefore.trackedMigrations.includes(
      "platform/control-plane/supabase/migrations/20260816120000_platform_tenant_presentation_configs.sql",
    ) &&
    baselineBefore.inventories.map((item) => item.target).sort().join("|") ===
      "CONTROL_PLANE|TENANT_ENVAL",
  "migration_chain_classification_changed",
);
const preCommitOnlyEvidence = verify({
  mode: "INTEGRATION",
  preCommitOnly: true,
  executor() {
    throw new Error("pre_commit_only_executed_a_verification_command");
  },
});
assert(
  preCommitOnlyEvidence.status === "PASS" &&
    preCommitOnlyEvidence.preCommitGate === "PASS" &&
    preCommitOnlyEvidence.preCommitOnly &&
    preCommitOnlyEvidence.checks.length === 0 &&
    preCommitOnlyEvidence.migrationGitInclusionRequired.length === 0,
  "valid_visible_untracked_candidate_did_not_pass_pre_commit_gate",
);
assert(
  Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions).length === 0 &&
    baselineBefore.gitVisibleCandidates.every((item) =>
      git(["status", "--short", "--ignored", "--", item.path]).startsWith(
        "?? ",
      )
    ) &&
    VERIFY_MANIFEST.tenantMigrationChain.excludedConnectionMigrations.every(
      (entry) =>
        git(["status", "--short", "--ignored", "--", entry.originalPath]) ===
          "",
    ),
  "migration_chain_visibility_policy_failed",
);

const tenantProbePath =
  `supabase/migrations/99991231235959_enval_verify_probe_${process.pid}.sql`;
const controlPlaneProbePath =
  `platform/control-plane/supabase/migrations/99991231235959_enval_verify_probe_${process.pid}.sql`;
const probePaths = [tenantProbePath, controlPlaneProbePath];
const missingProbePaths = [
  `supabase/migrations/99991231235958_missing_${process.pid}.sql`,
  `platform/control-plane/supabase/migrations/99991231235958_missing_${process.pid}.sql`,
];
const probeAbsolutes = probePaths.map((path) => resolve(ROOT, path));
assert(probeAbsolutes.every((path) => !existsSync(path)), "migration_probe_preexists");
const createdProbes = [];
try {
  for (const probeAbsolute of probeAbsolutes) {
    writeFileSync(probeAbsolute, "-- transient migration omission probe\n", {
      flag: "wx",
    });
    createdProbes.push(probeAbsolute);
  }
  const withProbe = inspectMigrationOmissions();
  const simulatedIgnored = inspectMigrationOmissions({
    ignoredPaths: [
      ...Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
      tenantProbePath,
      controlPlaneProbePath,
    ],
    untrackedPaths: baselineBefore.gitVisibleCandidates.map((item) =>
      item.path
    ),
  });
  const simulatedStaged = inspectMigrationOmissions({
    ignoredPaths: Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
    untrackedPaths: baselineBefore.gitVisibleCandidates.map((item) =>
      item.path
    ),
    stagedPaths: probePaths,
    inventoryPaths: [
      ...baselineBefore.trackedMigrations,
      ...baselineBefore.gitVisibleCandidates.map((item) => item.path),
      ...Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
      ...probePaths,
    ],
  });
  const simulatedMissing = inspectMigrationOmissions({
    ignoredPaths: Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
    untrackedPaths: baselineBefore.gitVisibleCandidates.map((item) =>
      item.path
    ),
    missingPaths: missingProbePaths,
  });
  const invalidCandidateName =
    `supabase/migrations/not_ordered_probe_${process.pid}.sql`;
  const simulatedInvalidName = inspectMigrationOmissions({
    ignoredPaths: Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
    untrackedPaths: [invalidCandidateName],
    inventoryPaths: [invalidCandidateName],
  });
  const simulatedVersionCollision = inspectMigrationOmissions({
    ignoredPaths: Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
    untrackedPaths: [tenantProbePath],
    inventoryPaths: [
      tenantProbePath,
      "supabase/migrations/99991231235959_existing_migration.sql",
    ],
  });
  const currentTail = VERIFY_MANIFEST.tenantMigrationChain.forwardTail.at(-1);
  assert(currentTail, "tenant_migration_tail_missing");
  const activeWithoutCurrentTail = activeTenantMigrationPaths.filter((path) =>
    path !== currentTail.path
  );
  const simulatedMissingActive = inspectMigrationOmissions({
    ignoredPaths: [],
    untrackedPaths: [],
    trackedPaths: activeWithoutCurrentTail,
    missingPaths: [currentTail.path],
    inventoryPaths: activeWithoutCurrentTail,
  });
  const archivedActivePath = VERIFY_MANIFEST.tenantMigrationChain
    .currentPresentAppMigrations.find((entry) =>
      entry.originalPath.includes(
        "20260730150000_app_signup_connection_declaration_sources.sql",
      )
    )?.originalPath;
  assert(archivedActivePath, "archived_active_probe_source_missing");
  const simulatedArchivedAsActive = inspectMigrationOmissions({
    ignoredPaths: [],
    untrackedPaths: [],
    trackedPaths: activeTenantMigrationPaths,
    stagedPaths: [archivedActivePath],
    inventoryPaths: [...activeTenantMigrationPaths, archivedActivePath],
  });
  const wrongTargetPath =
    `platform/control-plane/supabase/migrations/${currentTail.path.split("/").at(-1)}`;
  const simulatedWrongTargetRoot = inspectMigrationOmissions({
    ignoredPaths: [],
    untrackedPaths: [],
    trackedPaths: activeWithoutCurrentTail,
    stagedPaths: [wrongTargetPath],
    missingPaths: [currentTail.path],
    inventoryPaths: [...activeWithoutCurrentTail, wrongTargetPath],
  });
  const outOfOrderPath =
    `supabase/migrations/20260816155000_out_of_order_${process.pid}.sql`;
  const simulatedOutOfOrder = inspectMigrationOmissions({
    ignoredPaths: [],
    untrackedPaths: baselineBefore.gitVisibleCandidates.map((item) =>
      item.path
    ),
    stagedPaths: [outOfOrderPath],
    inventoryPaths: [
      VERIFY_MANIFEST.tenantMigrationChain.baseline.path,
      ...VERIFY_MANIFEST.tenantMigrationChain.forwardTail.map((entry) =>
        entry.path
      ),
      outOfOrderPath,
    ],
  });
  const ambiguousWorkdir = inspectMigrationOmissions({
    ignoredPaths: Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
    untrackedPaths: baselineBefore.gitVisibleCandidates.map((item) => item.path),
    changedPaths: [
      "platform/ambiguous/supabase/migrations/99991231235959_probe.sql",
    ],
  });
  const controlPlaneMissingPath =
    `platform/control-plane/supabase/migrations/99991231235957_required_${process.pid}.sql`;
  const tenantCannotSatisfyControlPlane = inspectMigrationOmissions({
    ignoredPaths: Object.keys(VERIFY_MANIFEST.migrationBaseline.exceptions),
    untrackedPaths: [tenantProbePath],
    missingPaths: [controlPlaneMissingPath],
    inventoryPaths: [tenantProbePath],
  });
  assert(
    withProbe.gitInclusionRequired.length === 0 &&
    probePaths.every((probePath) =>
      withProbe.gitVisibleCandidates.some((item) =>
        item.path === probePath &&
        item.target === (probePath.startsWith("platform/")
          ? "CONTROL_PLANE"
          : "TENANT_ENVAL")
      ) &&
      git(["status", "--short", "--ignored", "--", probePath]).startsWith("?? ") &&
      simulatedIgnored.omissions.some((item) =>
        item.path === probePath && item.reason === "new_ignored_migration"
      )
    ) &&
      probePaths.every((probePath) =>
        simulatedStaged.stagedMigrationCandidates.some((item) =>
          item.path === probePath &&
          item.target === (probePath.startsWith("platform/")
            ? "CONTROL_PLANE"
            : "TENANT_ENVAL")
        )
      ) &&
      missingProbePaths.every((probePath) =>
        simulatedMissing.omissions.some((item) =>
          item.path === probePath && item.reason === "missing_migration" &&
          item.target === (probePath.startsWith("platform/")
            ? "CONTROL_PLANE"
            : "TENANT_ENVAL")
        )
      ) &&
      simulatedInvalidName.omissions.some((item) =>
        item.path === invalidCandidateName &&
        item.reason === "invalid_migration_candidate_name"
      ) &&
      simulatedVersionCollision.omissions.some((item) =>
        item.path === tenantProbePath &&
        item.reason === "migration_version_collision"
      ) &&
      simulatedMissingActive.omissions.some((item) =>
        item.path === currentTail.path &&
        item.reason === "migration_chain_entry_missing"
      ) &&
      simulatedArchivedAsActive.omissions.some((item) =>
        item.path === archivedActivePath &&
        item.reason === "migration_version_not_forward"
      ) &&
      simulatedWrongTargetRoot.omissions.some((item) =>
        item.path === currentTail.path &&
        item.reason === "migration_chain_entry_missing"
      ) &&
      simulatedOutOfOrder.omissions.some((item) =>
        item.path === outOfOrderPath &&
        item.reason === "migration_version_not_forward"
      ) &&
      ambiguousWorkdir.omissions.some((item) =>
        item.reason === "ambiguous_migration_workdir"
      ) &&
      tenantCannotSatisfyControlPlane.gitVisibleCandidates.some((item) =>
        item.path === tenantProbePath && item.target === "TENANT_ENVAL"
      ) &&
      tenantCannotSatisfyControlPlane.omissions.some((item) =>
        item.path === controlPlaneMissingPath &&
        item.target === "CONTROL_PLANE" && item.reason === "missing_migration"
      ),
    "migration_inventory_or_ambiguous_workdir_guard_failed",
  );
} finally {
  for (const probeAbsolute of createdProbes) {
    if (existsSync(probeAbsolute)) unlinkSync(probeAbsolute);
  }
}

const migrationStatusAfter = git([
  "status",
  "--short",
  "--ignored",
  "--",
  "supabase/migrations",
  "platform/control-plane/supabase/migrations",
]);
const repositoryStatusAfter = git([
  "status",
  "--porcelain=v1",
  "--untracked-files=all",
  "--ignored=matching",
]);
const baselineAfter = inspectMigrationOmissions();
assert(
  migrationStatusAfter === migrationStatusBefore &&
    repositoryStatusAfter === repositoryStatusBefore &&
    baselineAfter.omissions.length === 0 &&
    baselineAfter.candidates.length === baselineBefore.candidates.length &&
    baselineAfter.candidates.every((path) =>
      baselineHashesBefore[path] === hash(path)
    ) &&
    probeAbsolutes.every((path) => !existsSync(path)),
  "migration_probe_did_not_preserve_baseline_integrity",
);

console.log("enval-verify-runner-proof-ok");
