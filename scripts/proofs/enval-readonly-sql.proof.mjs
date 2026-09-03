import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseCliArgs,
  PROOF_DEFINITIONS,
  ROOT,
  runReadOnlySqlProof,
  validateReadOnlySql,
  validateStructuredOutput,
} from "../tools/enval-readonly-sql.mjs";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hash(path) {
  return createHash("sha256")
    .update(readFileSync(resolve(ROOT, path)))
    .digest("hex");
}

function expectFailure(action, expectedMessage) {
  try {
    action();
  } catch (error) {
    assert(
      String(error).includes(expectedMessage),
      `unexpected_failure:${expectedMessage}`,
    );
    return;
  }
  throw new Error(`expected_failure_missing:${expectedMessage}`);
}

const definition = PROOF_DEFINITIONS["local-runtime04-migration-parity"];
assert(definition, "runtime04_proof_not_registered");
assert(hash(definition.path) === definition.sha256, "runtime04_proof_hash_invalid");
assert(
  definition.sources.every((source) => hash(source.path) === source.sha256),
  "runtime04_source_hash_invalid",
);
assert(
  validateReadOnlySql(readFileSync(resolve(ROOT, definition.path), "utf8")),
  "runtime04_readonly_sql_invalid",
);
assert(
  parseCliArgs(["--proof-id", "local-runtime04-migration-parity"]).proofId ===
    "local-runtime04-migration-parity",
  "runtime04_proof_id_rejected",
);
expectFailure(
  () => parseCliArgs(["--database-url", "postgresql://remote.invalid/postgres"]),
  "only_manifest_proof_id_is_supported",
);

const fixturePayload = {
  proof: "LOCAL_RUNTIME04",
  marker: definition.marker,
  ledger_220000_applied: false,
  ledger_230000_applied: false,
  migration_220000_parity: "FULL_PARITY",
  migration_220000_mismatches: [],
  migration_230000_parity: "PARTIAL_PARITY",
  migration_230000_mismatches: ["constraints"],
};
const fixtureJson = JSON.stringify(fixturePayload);
const structured = validateStructuredOutput(
  definition,
  `BEGIN\n${fixtureJson}\nROLLBACK\n`,
);
assert(
  structured.output === fixtureJson &&
    structured.payload.proof === "LOCAL_RUNTIME04",
  "runtime04_structured_output_invalid",
);
expectFailure(
  () =>
    validateStructuredOutput(
      definition,
      "x".repeat(definition.maxOutputBytes + 1),
    ),
  "sql_proof_output_too_large",
);
expectFailure(
  () => validateStructuredOutput(definition, `${fixtureJson}\n${fixtureJson}`),
  "sql_proof_output_line_count_invalid",
);
expectFailure(
  () =>
    validateStructuredOutput(
      definition,
      JSON.stringify({ ...fixturePayload, unexpected: true }),
    ),
  "sql_proof_output_contract_invalid",
);

let mutationExecutorCalled = false;
const mutationSql =
  "BEGIN TRANSACTION READ ONLY; DELETE FROM public.fixture; ROLLBACK;";
expectFailure(
  () =>
    runReadOnlySqlProof({
      proofId: "mutation-fixture",
      definitions: {
        "mutation-fixture": {
          path: definition.path,
          sha256: createHash("sha256").update(mutationSql).digest("hex"),
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
    }),
  "sql_mutation_keyword_rejected",
);
assert(!mutationExecutorCalled, "runtime04_mutation_reached_executor");

let sourceHashExecutorCalled = false;
expectFailure(
  () =>
    runReadOnlySqlProof({
      proofId: "source-hash-fixture",
      definitions: {
        "source-hash-fixture": {
          path: definition.path,
          sha256: definition.sha256,
          marker: definition.marker,
          sources: [{
            path: definition.sources[0].path,
            sha256: "0".repeat(64),
          }],
        },
      },
      executor() {
        sourceHashExecutorCalled = true;
        return { status: 0, stdout: definition.marker, stderr: "" };
      },
    }),
  "sql_proof_source_hash_mismatch",
);
assert(!sourceHashExecutorCalled, "runtime04_source_mismatch_reached_executor");

const realProof = runReadOnlySqlProof({
  proofId: "local-runtime04-migration-parity",
});
assert(
  realProof.markerCount === 1 &&
    realProof.connection.host === "127.0.0.1" &&
    realProof.payload?.proof === "LOCAL_RUNTIME04" &&
    Array.isArray(realProof.payload.migration_220000_mismatches) &&
    Array.isArray(realProof.payload.migration_230000_mismatches),
  "runtime04_real_guarded_proof_failed",
);

console.log("ENVAL_READONLY_SQL_PROOF=PASS");
