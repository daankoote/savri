---
name: update-enval-docs
description: Use when a task changes documented ENVAL behaviour, a contract, architecture, delivery status or an operating procedure; skip when implementation preserves documented truth.
---

# Update ENVAL documentation

## Goal

Keep current truth, completed history and outstanding work accurate without
copying the same rule across canon, TODO, changelog, architecture and
operations.

## Determine impact

From the semantic change, classify documentation impact as:

- `NONE`: implementation preserves documented behaviour and status;
- `UPDATE`: an owning document must change;
- `REVIEW`: material cross-document consistency must be checked.

File changes alone do not determine impact. A code change can have no docs
impact; a one-line semantic change can require several owning updates.

## Authority map

| Information                            | Owner                                          |
| -------------------------------------- | ---------------------------------------------- |
| Current product truth                  | `docs/app/00_CANON.md`                         |
| Material completed change              | `docs/app/03_CHANGELOG_APPEND_ONLY.md`         |
| Outstanding work and next state        | `docs/app/04_TODO.md`                          |
| Architectural boundary/decision        | `docs/app/architecture/`                       |
| Behavioural/internal/external contract | `docs/app/contracts/`                          |
| Agent lifecycle and authority          | `docs/app/operations/agent-operating-model.md` |
| Git/worktree/integration procedure     | `docs/app/operations/git-workflow.md`          |
| Diagnosis, proof and fixture mechanics | `docs/app/operations/run-debug.md`             |

Use links for related context; do not restate the owning rule.

## Workflow

1. State the semantic delta in one sentence.
2. Identify the single owner for each changed fact.
3. Read only owners and directly connected references.
4. Update current-state text in place.
5. Append changelog only for a material completed change.
6. Close, replace or add TODO entries based on actual remaining work.
7. Remove newly stale or contradictory statements.
8. Check links and terminology in the affected documentation cone.

## Integrity rules

- Canon describes what is true now, not an implementation diary.
- Changelog is append-only and does not claim more than verified delivery.
- TODO contains current outstanding work, not closed historical checkpoints.
- Architecture explains boundaries and decisions, not task commands.
- Contracts describe observable behaviour and authority.
- Operations docs do not absorb product truth.
- Never mark hosted delivery complete from local evidence alone.
- Never duplicate instructions already owned by `AGENTS.md` or a skill.
- Avoid broad formatting churn.

## Review routing

Invoke `docs_reviewer` only when the change is contractual, architectural,
cross-document or materially changes product status. Obvious single-owner
updates do not need a reviewer.

## Output

```text
DOCS_IMPACT=<NONE|UPDATE|REVIEW>
SEMANTIC_DELTA=<one sentence>
OWNERS=<files updated or checked>
STALE_TEXT_REMOVED=<summary or NONE>
OPEN_WORK=<remaining TODO or NONE>
```
