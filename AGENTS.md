# ENVAL Execution Contract

## Source routing

- Start with `docs/app/00_CANON.md`; it is the authority and navigation index.
- Then read only the task-relevant CURRENT contract, `01_SYSTEM_MAP.md`,
  `04_TODO.md` gate, NEa authority, proof, or tool source.
- Current code, schema, migrations, tests, and green proofs outrank stale docs.
- TARGET, DRAFT, PROOF ONLY, UNKNOWN, and LEGACY never become CURRENT by inference.
- This file routes execution; it is not product, legal, security, or architecture canon.

## Inspect before modify

- Before building, inspect existing modules, components, helpers, services, CSS,
  design tokens, layout patterns, callers, and relevant database objects.
- Reuse existing patterns and keep one responsibility per module.
- Do not duplicate helpers, services, business logic, CSS, or near-equivalent modules.
- Do not use inline CSS. Prefer tokens, shared classes, composition, and modifiers.
- Keep a small coherent fileset; avoid cosmetic refactors outside the task.
- Preserve unrelated and dirty worktree changes exactly.

## Truth and safety boundaries

- Observed, derived, parser, browser, or external data never mutates core truth by itself.
- Preserve provenance; never infer legal, security, evidence, identity, authority,
  eligibility, verification, or acceptance status from convenience data.
- Use forward-only migrations. Do not delete or retire anything without dependency,
  caller, data, migration, rollback, retention, and audit evidence.
- Migration apply, reset, cleanup, deploy, remote mutation, and remote SQL are
  consequential and never autonomous.
- Safe local read-only SQL/catalog/introspection proofs may be autonomous when scoped,
  output-safe, and required. Local mutation remains human-gated.
- Never print secrets, tokens, credentials, JWTs, signed URLs, private identifiers, or PII.

## Git boundary

- Autonomous read-only Git is limited to `status`, `diff`, `diff --stat`,
  `diff --check`, `log`, `show`, `branch`, and `rev-parse`.
- Codex must not autonomously run `git add`, `commit`, `push`, `merge`, `rebase`,
  `cherry-pick`, `revert`, `reset`, `clean`, or `stash`.
- Daan owns staging decisions, commits, pushes, and all consequential history changes.

## Task and iteration shape

- A normal task needs only: Goal, Context, Constraints, and Done when.
- Default to small bounded batches: one problem or invariant where practical.
- Avoid giant multi-feature changes, broad refactors, and unrelated cleanup.

## Verification strategy

- Classify verification before running it:
  - Tier A is the default after each small implementation step. Identify changed
    layers, affected shared dependencies/callers and realistic regression risks,
    then run the minimum targeted checks that cover that risk cone.
  - Tier B is the logical-batch gate for a coherent feature or workstream slice.
    Run the relevant broader regression, build, browser, SQL/security and
    integration checks only where that batch changed or depends on them.
  - Tier C is release-grade/full validation. Use it only for release/deploy
    readiness, a major cross-cutting architecture milestone, explicit Daan/ChatGPT
    instruction, or evidence from lower tiers that materially broadens risk.
- A normal local commit is not automatically Tier B or Tier C.
- Documentation-only work uses targeted document/reference/consistency checks and
  no runtime suite unless an executable contract changed.
- Run a build only when bundling, imports, runtime boundaries or a logical frontend
  batch make build coverage useful. Small visual/copy changes use targeted
  frontend/static checks; defer responsive/browser proof to the coherent UI batch
  unless interaction, Auth or data flow requires it earlier.
- RLS, authorization, capabilities, tenant boundaries, signing, OTP,
  finalization/replay, schema/migrations, immutable history, locks, evidence
  independence, corrections, parser authority and platform-support boundaries
  require heavier Tier A coverage or an earlier Tier B gate, not unrelated suites.
- Within one logical batch, reuse a green expensive check while its relevant
  production code, shared dependencies, proof/test, schema/migration and
  configuration/environment remain unchanged. Re-run it when that risk cone changes.
- Never reduce regression quality for speed; reduce latency by selecting checks,
  reusing valid green evidence and avoiding duplicate execution.

## Failure loop guard

- Do not repeat an identical failing command more than twice without a new
  hypothesis or changed condition.
- Every retry must state the hypothesis or condition being tested.
- After bounded attempts, report the exact failure, hypotheses tested, changes
  attempted, likely root cause and recommended next action. Stop for direction
  before materially expanding scope or risk.

## Architecture and documentation sync

- Reconcile architecture/docs only when a canon/invariant, ownership boundary,
  architectural dependency, security/Auth model or CURRENT/TARGET workstream status
  materially changes. Small implementation details do not trigger documentation churn.

## Terminal ownership

- Codex normally verifies branch/HEAD/status, runs targeted tests and typecheck,
  runs a build when required, performs static searches, reviews the scoped diff,
  and reports `diff --check`, diffstat, and final status.
- Do not make Daan copy/paste the same safe deterministic terminal or SQL checks.

## Final evidence

Report compactly:

- changed/new files;
- reused modules and CSS, plus any new module and its reason;
- `TEST_TIER_USED`, changed layers, regression risks, targeted checks and results;
- valid previously-green checks reused, broader checks intentionally excluded, and
  whether Tier B or Tier C is required now with a reason;
- diff-check and diffstat;
- remaining risks and intentionally deferred gates;
- staged state and final Git status.
