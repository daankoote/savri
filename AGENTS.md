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

- During each small iteration, run only the smallest sufficient checks for the scope:
  a relevant unit/client/contract proof, targeted TypeScript or Deno check, focused
  security assertion, or safe read-only SQL introspection when necessary.
- Do not routinely run the full regression suite, all integration proofs,
  performance suites, destructive/local-service suites, or a complete app build.
- Run a build during an iteration only when bundling, imports, or runtime boundaries move.
- Before Daan commits a coherent round, run one broader non-destructive integration gate
  covering relevant regression, type correctness, build/integration, security/RLS/Auth,
  and applicable efficiency/performance behavior.
- Reserve full or heavy suites for release, architecture, or high-risk security, Auth,
  signing, and database boundaries.
- Never reduce coverage for speed; optimize selection, timing, and duplicate execution.
- Daan need not repeat an already-green deterministic check solely to duplicate evidence.

## Terminal ownership

- Codex normally verifies branch/HEAD/status, runs targeted tests and typecheck,
  runs a build when required, performs static searches, reviews the scoped diff,
  and reports `diff --check`, diffstat, and final status.
- Do not make Daan copy/paste the same safe deterministic terminal or SQL checks.

## Final evidence

Report compactly:

- changed/new files;
- reused modules and CSS, plus any new module and its reason;
- checks run with status and useful counts/timing, without full green logs;
- diff-check and diffstat;
- remaining risks and intentionally deferred gates;
- staged state and final Git status.
