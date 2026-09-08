# ENVAL

ENVAL is a multi-tenant platform for legally and operationally controlled
electricity-registration workflows. Changes must remain secure, auditable,
modular and compatible with future tenant and integration boundaries.

## Working model

- One primary Codex thread owns each task and is the only writer.
- Use subagents only for bounded, independent, read-only exploration or review.
- Make the smallest complete change that satisfies the requested outcome.
- Reuse existing modules, components, styles, contracts and proof
  infrastructure.
- Do not add frameworks, abstractions or process machinery without demonstrated
  need.
- Read only documentation relevant to the task; never preload the complete set.
- Preserve unrelated tracked, untracked and user-owned work.

The full workflow is in `docs/app/operations/agent-operating-model.md`.

## Product invariants

- Browser and client input is non-authoritative.
- Authorization, tenant isolation and legal transitions are enforced
  server-side.
- Fail closed when identity, authority, signing, document or tenant
  configuration is incomplete or inconsistent.
- Preserve immutable signing, mandate, legal-evidence and audit records.
- Never expose secrets, credentials, OTP material, tokens or unnecessary
  personal data.
- Never weaken Auth, RLS, signing or tenant boundaries to make a check pass.
- Treat migrations and stored procedures as behavioural contracts.
- Preserve compatibility unless the task explicitly changes the contract.

Current product truth is in `docs/app/00_CANON.md`.

## Change discipline

Before editing, establish Goal, Context, Constraints, Done and Authority.
Inspect the smallest relevant surface, reproduce reported defects when practical
and fix the owning layer.

- Keep one coherent task scope.
- Avoid unrelated cleanup and formatting churn.
- Use existing copy authorities, design tokens and shared components.
- Do not add ad-hoc inline styling.
- Do not retry an unchanged failing action.

## Verification and documentation

- Use `$verify-enval-change` when code, schema, runtime contracts, tests or
  visible behaviour change.
- Use `$update-enval-docs` when product truth, status, contracts, architecture
  or operations change.
- Mutating proofs own and clean only exact current-run fixtures.
- Do not run the broadest suite unless risk or evidence requires it.

## Review routing

- Use `reviewer` for material security, signing, schema, concurrency or
  cross-layer risk.
- Use `ui_reviewer` for material visible UI changes.
- Use `docs_reviewer` for material semantic or cross-document documentation
  risk.
- Do not invoke reviewers for trivial work; run no more than two concurrently.
- If a custom reviewer is unavailable, use the built-in review path or a generic
  read-only subagent with the same bounded contract; do not block the task.

## Authority

Codex may inspect and edit the isolated task workspace, run relevant local
checks and use explicitly authorized exact local fixtures. Hosted reads use
scoped read-only capabilities.

Daan authorizes hosted writes, broad or historical cleanup, task commits during
the architecture cutover, integration into protected `main`, pushes, deployments
and destructive Git operations.

A denied optional action is skipped. Use `BLOCKED` only when missing authority
prevents the required outcome, with one exact `NEEDS` action.

## Completion

Finish only after the requested behaviour, sufficient verification, applicable
documentation, required review and current-run cleanup are complete.

Report only: `STATUS`, `OUTCOME`, `CHANGED`, `VERIFIED`, `NEXT`. Add `REVIEW`,
`COMMIT` or `NEEDS` only when applicable. Allowed statuses: `PASS`, `BLOCKED`,
`FAIL`, `CANCELLED`.
