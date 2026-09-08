# ENVAL agent operating model

## Purpose

This document owns task topology, lifecycle, review routing, authority and cost
control. Product truth remains in canon and product contracts. Git mechanics
remain in `git-workflow.md`; diagnosis mechanics remain in `run-debug.md`.

## Topology

Daan and the main chat determine scope and acceptance. Each task uses one
primary Codex thread in an isolated task branch/worktree. The primary
implements, verifies, updates documentation and produces the handoff within the
bounded batch. It is the only writer.

Conditional read-only agents:

| Agent               | Use                                                   |
| ------------------- | ----------------------------------------------------- |
| Built-in `explorer` | Ownership or dependency discovery when unclear        |
| `reviewer`          | Correctness, security, data and cross-layer contracts |
| `ui_reviewer`       | Rendered visible behaviour and accessibility basics   |
| `docs_reviewer`     | Documentation ownership and semantic consistency      |

The `reviewer`, `ui_reviewer` and `docs_reviewer` profiles are standalone and
read-only. Custom TOML profiles are used only after the installed Codex surface
proves they load correctly. Until then, the primary uses the built-in review
path or a generic read-only subagent with the same compact contract.
Agent-loading failure is not a product blocker.

There are no permanent Main, Beheer, Setup, tester, Supabase, Netlify, Git or
deployment agents. `main` is a protected branch. External systems are tools.

Default: no subagents. Maximum: two concurrent read-only subagents. Delegate
only independent work whose quality or latency benefit exceeds the additional
model and coordination cost. Never create parallel writers.

## Task contract

Normal requests contain:

```text
GOAL=<observable outcome>
CONTEXT=<only task-specific facts>
CONSTRAINTS=<material boundaries>
DONE=<acceptance evidence>
AUTHORITY=<explicit mutations allowed>
```

Do not paste policies, complete diffs, full logs, documentation sets or old run
reports into the task. Durable rules are loaded from the repository.

## Lifecycle

1. Confirm goal, risk and authority.
2. Inspect the smallest connected change cone.
3. Reproduce the defect when practical.
4. Implement the smallest complete correction in the owning layer.
5. Run risk-selected verification.
6. Invoke only applicable read-only reviewers.
7. Resolve evidence-backed findings.
8. Re-run checks invalidated by the correction.
9. Update owning documentation.
10. Hand off compactly; Git commit, push and deployment remain human actions.

Use a plan for ambiguous, high-risk or materially cross-layer work. Do not
require a plan for an obvious low-risk edit.

## Review routing

| Change                                                       | Review                     |
| ------------------------------------------------------------ | -------------------------- |
| Trivial docs/copy/formatting                                 | None                       |
| Focused pure code with strong tests                          | Usually none               |
| Auth, RLS, signing, migration, stored procedure, concurrency | `reviewer`                 |
| Material visible UI                                          | `ui_reviewer`              |
| Material canon/contract/architecture/status change           | `docs_reviewer`            |
| Cross-layer UI and backend                                   | `reviewer` + `ui_reviewer` |

If three dimensions apply, run the two highest-risk reviewers first. Add the
third only when material risk remains. Reviewers report evidence-backed defects;
they do not edit or control acceptance independently.
`scripts/tools/enval-ui-review-collect.mjs` only collects browser evidence for a
targeted UI review.
`sandbox_mode = "read-only"` in a reviewer profile is a default, not the sole
security boundary: the parent review turn must itself use read-only permissions,
or the reviewer must receive only proven non-mutating tools.

## Failure and loop control

- Never repeat an unchanged failed command or approach.
- Try one materially safer route after a denied action when it can still satisfy
  acceptance.
- Continue independent safe work after an optional denial.
- Stop when evidence shows no material progress, a required decision is missing
  or authority is essential.
- Numeric attempt/review limits are introduced only after representative task
  evaluation; they are not universal standards.

## Verification and evidence

Use `$verify-enval-change`. Select the cheapest evidence that covers every
changed risk boundary, then broaden only after a relevant failure, changed
assumption or unresolved risk.

Reuse prior green evidence only when the code, configuration and assumptions it
covered are unchanged. Report product correctness, security/contracts,
environment health and fixture hygiene separately.

Historical residue is maintenance work unless the current task created or
changed it. A mutating proof records exact ownership keys at creation, cleans
them in `finally` and proves zero current-run residue.

## Documentation

The primary remains the documentation writer and uses `$update-enval-docs`.
`docs_reviewer` is conditional and read-only. One statement has one owner:

| Content                   | Owner                         |
| ------------------------- | ----------------------------- |
| Current product truth     | `00_CANON.md`                 |
| Completed material change | `03_CHANGELOG_APPEND_ONLY.md` |
| Outstanding work          | `04_TODO.md`                  |
| System design boundary    | `architecture/`               |
| Behavioural interface     | `contracts/`                  |
| Agent workflow            | This document                 |
| Git/integration           | `git-workflow.md`             |
| Diagnosis/proof mechanics | `run-debug.md`                |

## External systems

| System          | Routine capability                          | Daan authority                                          |
| --------------- | ------------------------------------------- | ------------------------------------------------------- |
| Local Supabase  | Read; exact authorized current-run fixtures | Migration apply, reset, broad/historical cleanup        |
| Hosted Supabase | Exact-project read-only MCP                 | Database/Auth/Storage/config writes and deployments     |
| Netlify         | Repository-local configuration and build results | Git push and every Netlify deployment              |
| Git             | Task-worktree edits and checks              | Staging, all commits, integration, push, destructive history |
| Moshi           | Optional terminal-primary notification      | Any custom notification infrastructure                  |

Netlify deployment acceptance remains with Daan and uses the Netlify dashboard
and Firefox. Netlify MCP, PAT, OAuth and agent-driven deployment are not required
procedures.

Hosted Supabase access is limited to the exact configured project, read-only
mode, read-only scopes and the project tool allowlist. Missing optional hosted
access does not block local work.

## Models and credits

Daan chooses the primary model. Reviewer files remain model-neutral. Shared
subagent defaults live in one configuration location and are changed only after
a small quality/cost evaluation.

Use cheaper suitable models for bounded read-heavy scans. Reserve stronger
reasoning for ambiguous, security-sensitive or cross-layer work. Do not use an
agent for deterministic commands, status polling, formatting or summaries the
primary already has. Do not automatically escalate beyond the approved ceiling.

## Permissions

Use one native Codex permission system. Never combine permission profiles with
legacy sandbox settings. Routine bounded repository reads, task-worktree edits
and deterministic local checks should not prompt. Machine config, credentials,
unknown folders, hosted writes, deployments and destructive operations remain
protected.

Rules block the action; they do not terminate the task. A missing essential
authority yields `BLOCKED` plus one precise `NEEDS` action.

## Communication and results

Operational work remains in the primary Codex conversation. Standalone reviewer
results return to it automatically. There is no central hook, router, result
publisher or review loop.

Statuses: `PASS`, `BLOCKED`, `FAIL`, `CANCELLED`.

Required final result fields:

```text
STATUS
OUTCOME
CHANGED
VERIFIED
NEXT
```

Add `REVIEW`, `COMMIT` or `NEEDS` only when applicable. An incomplete required
outcome is `BLOCKED` or `FAIL`, not a routine partial result.

Moshi is optional. Notify only terminal primary outcomes, suppress nested-agent
pushes and never change task status because notification delivery failed.
