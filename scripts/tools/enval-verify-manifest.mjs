export const SAFETY = Object.freeze({
  SAFE_PURE: "SAFE_PURE",
  LOCAL_MUTATING: "LOCAL_MUTATING",
  LOCAL_SERVICE: "LOCAL_SERVICE",
  REMOTE: "REMOTE",
  MANUAL_GATED: "MANUAL_GATED",
});

export const COMMANDS = Object.freeze({
  "git-diff-check": Object.freeze({
    safety: SAFETY.SAFE_PURE,
    argv: Object.freeze(["git", "diff", "--check", "--", "."]),
  }),
  "node-check-changed": Object.freeze({
    safety: SAFETY.SAFE_PURE,
    argv: Object.freeze(["node", "--check", "{path}"]),
    perPath: true,
  }),
  "deno-check-changed": Object.freeze({
    safety: SAFETY.SAFE_PURE,
    argv: Object.freeze([
      "deno",
      "check",
      "--cached-only",
      "--unstable-sloppy-imports",
      "{path}",
    ]),
    perPath: true,
  }),
  "signup-journey-pure": Object.freeze({
    safety: SAFETY.SAFE_PURE,
    argv: Object.freeze([
      "deno",
      "run",
      "--cached-only",
      "--allow-read",
      "--unstable-sloppy-imports",
      "scripts/proofs/app-signup-journey.proof.ts",
    ]),
  }),
  "signup-unified-presentation-pure": Object.freeze({
    safety: SAFETY.SAFE_PURE,
    argv: Object.freeze([
      "deno",
      "run",
      "--cached-only",
      "--allow-read",
      "--unstable-sloppy-imports",
      "scripts/proofs/app-signup-unified-presentation.proof.ts",
    ]),
  }),
  "remote-baseline-proof": Object.freeze({
    safety: SAFETY.REMOTE,
    argv: Object.freeze([
      "node",
      "scripts/proofs/in-place-baseline-phase0-proof.mjs",
    ]),
  }),
  "remote-postgrest-proof": Object.freeze({
    safety: SAFETY.REMOTE,
    argv: Object.freeze([
      "node",
      "scripts/proofs/postgrest-authorized-health.proof.mjs",
    ]),
  }),
  "remote-sql-review": Object.freeze({
    safety: SAFETY.REMOTE,
    argv: null,
  }),
  "migration-or-sql-review": Object.freeze({
    safety: SAFETY.LOCAL_MUTATING,
    argv: null,
  }),
  "baseline-proposal-review": Object.freeze({
    safety: SAFETY.LOCAL_MUTATING,
    argv: null,
  }),
  "dependency-review": Object.freeze({
    safety: SAFETY.MANUAL_GATED,
    argv: null,
  }),
  "shell-or-python-review": Object.freeze({
    safety: SAFETY.MANUAL_GATED,
    argv: null,
  }),
});

export const PATH_RULES = Object.freeze([
  Object.freeze({
    id: "remote-baseline-node-proof",
    match: Object.freeze({
      type: "exact",
      value: "scripts/proofs/in-place-baseline-phase0-proof.mjs",
    }),
    quick: Object.freeze(["remote-baseline-proof"]),
    targeted: Object.freeze(["remote-baseline-proof"]),
  }),
  Object.freeze({
    id: "remote-postgrest-node-proof",
    match: Object.freeze({
      type: "exact",
      value: "scripts/proofs/postgrest-authorized-health.proof.mjs",
    }),
    quick: Object.freeze(["remote-postgrest-proof"]),
    targeted: Object.freeze(["remote-postgrest-proof"]),
  }),
  Object.freeze({
    id: "remote-readonly-sql",
    match: Object.freeze({ type: "suffix", value: "-remote-readonly.sql" }),
    quick: Object.freeze(["remote-sql-review"]),
    targeted: Object.freeze(["remote-sql-review"]),
  }),
  Object.freeze({
    id: "baseline-proposals",
    match: Object.freeze({
      type: "prefix",
      value: "supabase/baseline-proposals/",
    }),
    quick: Object.freeze(["baseline-proposal-review"]),
    targeted: Object.freeze(["baseline-proposal-review"]),
  }),
  Object.freeze({
    id: "migration-and-sql",
    match: Object.freeze({ type: "suffix", value: ".sql" }),
    quick: Object.freeze(["migration-or-sql-review"]),
    targeted: Object.freeze(["migration-or-sql-review"]),
  }),
  Object.freeze({
    id: "dependency-locks",
    match: Object.freeze({
      type: "basenameOneOf",
      value: Object.freeze([
        "deno.lock",
        "package-lock.json",
        "npm-shrinkwrap.json",
        "pnpm-lock.yaml",
        "yarn.lock",
      ]),
    }),
    quick: Object.freeze(["dependency-review"]),
    targeted: Object.freeze(["dependency-review"]),
  }),
  Object.freeze({
    id: "package-manifests",
    match: Object.freeze({
      type: "basenameOneOf",
      value: Object.freeze([
        "package.json",
        "deno.json",
        "deno.jsonc",
        "supabase/functions/deno.json",
        "supabase/functions/import_map.json",
      ]),
    }),
    quick: Object.freeze(["dependency-review"]),
    targeted: Object.freeze(["dependency-review"]),
  }),
  Object.freeze({
    id: "javascript-static",
    match: Object.freeze({
      type: "extensions",
      value: Object.freeze([
        ".js",
        ".mjs",
        ".cjs",
      ]),
    }),
    quick: Object.freeze(["node-check-changed"]),
    targeted: Object.freeze(["node-check-changed"]),
  }),
  Object.freeze({
    id: "signup-client-typescript",
    match: Object.freeze({ type: "prefix", value: "app/src/features/signup/" }),
    quick: Object.freeze(["deno-check-changed"]),
    targeted: Object.freeze([
      "deno-check-changed",
      "signup-journey-pure",
      "signup-unified-presentation-pure",
    ]),
  }),
  Object.freeze({
    id: "typescript-static",
    match: Object.freeze({
      type: "extensions",
      value: Object.freeze([
        ".ts",
        ".tsx",
        ".mts",
        ".cts",
      ]),
    }),
    quick: Object.freeze(["deno-check-changed"]),
    targeted: Object.freeze(["deno-check-changed"]),
  }),
  Object.freeze({
    id: "shell-and-python",
    match: Object.freeze({
      type: "extensions",
      value: Object.freeze([
        ".sh",
        ".py",
      ]),
    }),
    quick: Object.freeze(["shell-or-python-review"]),
    targeted: Object.freeze(["shell-or-python-review"]),
  }),
  Object.freeze({
    id: "static-content",
    match: Object.freeze({
      type: "extensions",
      value: Object.freeze([
        ".css",
        ".html",
        ".json",
        ".md",
        ".svg",
        ".toml",
        ".txt",
        ".yaml",
        ".yml",
      ]),
    }),
    quick: Object.freeze([]),
    targeted: Object.freeze([]),
  }),
  Object.freeze({
    id: "extensionless-repo-contract",
    match: Object.freeze({
      type: "oneOf",
      value: Object.freeze([
        ".gitignore",
        "AGENTS.md",
      ]),
    }),
    quick: Object.freeze([]),
    targeted: Object.freeze([]),
  }),
]);

export const MIGRATION_BASELINE = Object.freeze({
  exceptions: Object.freeze({
    "supabase/migrations/20260720120000_app_ean_connection_domain_foundation.sql":
      Object.freeze({
        sha256:
          "83f278d70c239e890d5892102118c20425e167a6a99b4406588521bb6398cbd4",
        reason: "legacy RETIRE AFTER REPLACEMENT PROOF",
      }),
    "supabase/migrations/20260720143000_app_connection_write_rpcs.sql": Object
      .freeze({
        sha256:
          "11131138f43fd0560189609160b824175549d1b9019c7781c4180dba1210b371",
        reason: "legacy RETIRE AFTER REPLACEMENT PROOF",
      }),
  }),
});

export const VERIFY_MANIFEST = Object.freeze({
  commands: COMMANDS,
  pathRules: PATH_RULES,
  always: Object.freeze(["git-diff-check"]),
  migrationBaseline: MIGRATION_BASELINE,
});
