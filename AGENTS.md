# ENVAL Execution Contract

This repository inherits the effective user-global `AGENTS.md`. This file adds
only ENVAL-specific invariants, source routing, and hard safety boundaries. The
explicit task may narrow authority further but may not silently weaken these
rules.

## Priority and status

When ENVAL concerns compete, use this order:

1. law and official NEa authority;
2. auditability;
3. correctness;
4. security and Auth;
5. contracts;
6. customer/operator journey and UI;
7. performance and cost.

Documentation status is explicit: `CURRENT PROVEN`, `TARGET`, `DRAFT`,
`UNKNOWN`, `LEGACY`, and `PROOF ONLY`. Only implemented behavior with the
required green evidence is CURRENT PROVEN. Documentation cannot promote itself.

## Source routing

Start with `docs/app/00_CANON.md`, which owns product canon, status, source
order, and navigation. Then read only the task-relevant CURRENT contract,
`01_SYSTEM_MAP.md`, `04_TODO.md` gate, official source, proof, or tool.

Current code, schema, migrations, tests, and green proof output outrank stale
implementation prose. TARGET, DRAFT, PROOF ONLY, UNKNOWN, and LEGACY material
never becomes current by inference.

Owning operational documents:

- `docs/app/operations/git-workflow.md`: Git, worktrees, runner, results, and
  human Terminal policy.
- `docs/app/operations/run-debug.md`: diagnosis, test selection, proof labels,
  and evidence interpretation.
- `docs/app/operations/nea-implementation-roadmap.md`: subordinate execution
  sequence and work-package status; it grants no authority by itself.

## Inspect and reuse

Apply the global inspect/reuse order to current callers, shared modules,
contracts, data objects, tests, components, CSS, tokens, and responsive
patterns. Preserve unrelated changes and do not create near-duplicate
components, modules, business logic, or CSS. ENVAL additionally forbids
arbitrary tenant frontend code and per-tenant frontend forks.

Customer UI is task/status-first. Tenant Operator UI is action/decision-first.
ENVAL Control is platform-health/metadata-first and must not expose tenant
business data. Do not invent headings, helper text, marketing copy, legal
wording, compliance claims, or extra status labels. Use approved copy, then
CURRENT canonical copy, then only the minimum functional/accessibility wording.

Frontend reports additionally confirm no direct database or provider-specific
UI coupling and name the reused application contract.

## Application and tenant boundaries

UI consumes typed presentation/application DTOs and mutation commands. It does
not own business decisions, use database rows as UI/domain contracts, perform
direct browser business writes, or know database, Storage, provider, or
service-role internals.

Server-authoritative application/domain capabilities are reused through narrow
ports and adapters where a real responsibility exists. External integrations
enter through versioned tenant-bound adapters only after server-side tenant
resolution. They never receive direct database access, RLS bypass, service-role
credentials, cross-data-plane credentials, or another tenant's identifiers or
data.

Observed, parsed, derived, browser, or external data never mutates core truth by
itself. Preserve provenance and never infer legal, security, evidence, identity,
authority, eligibility, verification, or acceptance state from convenience
data.

## Data and security boundaries

- Use forward-only migrations.
- Do not delete or retire objects without caller, dependency, data, migration,
  rollback, retention, and audit evidence.
- Migration apply/reset, cleanup, deploy, remote mutation, remote SQL, and local
  mutation are consequential and require explicit human authority.
- Safe local read-only SQL/catalog/introspection may be autonomous only through
  the scoped, output-safe canonical contract.
- Never print secrets, credentials, tokens, JWTs, OTPs, signed URLs, private
  identifiers, personal data, or secret-bearing configuration.
- Remote worker control stays private; never expose Herdr, Codex, Docker, or
  repository services through public router ports.
- Auth, RLS, capabilities, tenant isolation, signing, evidence, immutable
  history, corrections, locks, and replay/idempotency fail closed.
- No generic shell authority, Full Access, danger-full-access, yolo, hook trust
  bypass, approval bypass, or sandbox bypass is permitted.

The sandbox is the primary boundary. Repository rules and hooks narrow commands
inside it. Proven-safe reads may use semantic classification; ambiguity remains
deferred or prompt-gated, and known mutations remain denied. Permission,
classifier, hook, or execution-governance changes require their own Setup
governance batch and never ride with product implementation.

Ordinary product batches have web search disabled. Governance/research may use
cached search only when explicitly required; live access requires an explicit
task need and never includes private data.

## Workspaces and authority

Human-visible topology and its technical bindings are orchestrator-owned:

- `Main`: protected integration and project administration;
- `_Setup`: governance, runner, hook/rule, and owning operations work;
- `Beheer`: product implementation, product proofs, and browser review.

No task invents a workspace, branch, worktree, tab, pane, agent, or technical
binding. Product code does not belong in `_Setup`; governance does not ride
with a Beheer product batch. Main remains the protected integration worktree.
The canonical runner, result, recovery, and Terminal contracts live in
`docs/app/operations/git-workflow.md`.

Codex may inspect Git only with the read-only operations allowed by the
effective policy. Daan owns staging, commits, cherry-picks, merges, pushes,
history changes, deployments, remote/destructive actions, and final browser or
product acceptance. Codex does not autonomously run Git mutations.

## Verification and review

Apply the global Tier A/B/C, green-evidence reuse, documentation-only, and loop
guard rules. ENVAL verification is selected by the changed authority and risk
cone, never by a desire to accumulate ceremonial checks.

RLS, authorization, capabilities, tenant boundaries, signing, OTP,
finalization/replay, schema/migrations, immutable history, evidence
independence, corrections, parser authority, and platform-support boundaries
require heavier targeted evidence or an earlier Tier B gate.

UI review starts only after deterministic and browser evidence is green.
Collection and independent review are separate. A fresh read-only reviewer uses
the acceptance criteria and bounded artifacts, never redesigns or edits, and
returns structured findings. Every fix gets refreshed evidence and a fresh
review. PASS stops; human/material/security gates stop immediately. Review
artifacts contain no secrets or unnecessary customer data. ENVAL's adapter and
collector own project runtime details; the user-global reviewer owns generic
methodology.

## Task and reporting discipline

Prompts contain only the task delta: goal, base state, in/out of scope,
acceptance, named checks, explicit authority, result location, and task-specific
stops. Do not repeat this file or operations documentation. Default to one
bounded problem and avoid broad refactors or unrelated cleanup.

Architecture/docs sync is required only when canon, status, ownership,
dependency, API, persistence, security/Auth, or operational boundaries
materially change. Update only the owning document and do not overclaim.

Final reports apply the compact global evidence contract and include only
ENVAL-specific acceptance markers required by the task.
