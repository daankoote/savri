# Git Workflow

Status: CURRENT app workflow.

## Branch

Active development branch: `main`.

Codex may inspect Git read-only with `status`, `diff`, `diff --stat`,
`diff --check`, `log`, `show`, `branch`, and `rev-parse`.

Codex does not autonomously stage, commit, push, merge, rebase, cherry-pick,
revert, reset, clean, stash, amend, deploy, or otherwise mutate Git history.
Daan owns staging decisions, commits, pushes, and consequential history changes.

## Canonical Batch Launch

For normal batches, Daan supplies only a lowercase kebab-case slug to the
canonical launcher:

```bash
node scripts/tools/enval-batch.mjs start <batch-slug>
```

Do not manually compose branch, worktree, and Codex launch commands except for
explicit recovery or debugging. The launcher uses the current clean `main` HEAD
as its base, keeps `main` as the protected integration worktree, creates
`autonomy/<batch-slug>` plus the leaf worktree
`/Users/daankoote/dev/enval-worktrees/<batch-slug>`, and refuses a stale or
conflicting base. Every implementation batch receives its own leaf branch,
worktree, and interactive Codex CLI session.

The launcher verifies the project-local governance baseline and starts Codex
with Auto-review and `web_search="disabled"`; ordinary product batches therefore
have no hosted web-search tool by default. Governance or research tasks may use
cached search only when explicitly required, and live search requires explicit
task need. Shell/network permission remains a separate boundary.

The launcher does not commit, merge, push, deploy, clean up, or launch Codex
Desktop. Its single slug input and deterministic batch result remain the seam for
possible later Herdr integration; no Herdr installation or coupling exists now.

## Before Edits

Run:

```bash
git branch --show-current
git log -1 --oneline
git status --short --untracked-files=all
```

Confirm:

- branch is expected
- HEAD is expected
- worktree state is understood

## During Edits

- Keep scope exactly as requested.
- Do not revert user changes.
- Do not modify root/static production files unless explicitly requested.
- Do not modify Supabase functions or migrations unless explicitly requested.
- Do not print secrets, tokens, JWTs, signed URLs, or runtime config values.

## Migrations

`supabase/migrations/` may be ignored locally.

When Daan chooses to stage one migration under an ignored path, Daan may use:

```bash
git add -f path/to/intended_migration.sql
```

Only Daan stages the intended migration. Codex does not run this command and does
not change `.gitignore` for that reason.

## Commits

Daan commits only after requested validation passes. Codex leaves the worktree
unstaged and reports the validation and diff evidence.

A normal small local commit does not automatically require a full/release gate.
Validation follows the active Tier A/B/C policy in `AGENTS.md` and
`docs/app/operations/run-debug.md`: targeted checks for small steps, relevant
broader checks at a logical batch boundary, and full gates only for release,
major cross-cutting milestones, explicit instruction or evidence of broader
risk. Valid green expensive checks are reused until their dependency/risk cone
changes.

Before commit:

```bash
git diff --check
git status --short --untracked-files=all
```

After commit:

```bash
git log -1 --oneline
git show --name-only --format=oneline --stat HEAD
git status --short --untracked-files=all
```

## Push And Deploy

Daan owns push. Deploy remains consequential and human-controlled; Codex does not
push or deploy autonomously.
