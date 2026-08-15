# Git Workflow

Status: CURRENT app workflow.

## Branch

Active development branch: `main`.

Codex may inspect Git read-only with `status`, `diff`, `diff --stat`,
`diff --check`, `log`, `show`, `branch`, and `rev-parse`.

Codex does not autonomously stage, commit, push, merge, rebase, cherry-pick,
revert, reset, clean, stash, amend, deploy, or otherwise mutate Git history.
Daan owns staging decisions, commits, pushes, and consequential history changes.

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
