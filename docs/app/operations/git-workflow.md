# Git Workflow

Status: CURRENT app workflow.

## Branch

Active development branch: `main`.

Do not switch, merge, rebase, cherry-pick, push, deploy, or amend unless the current task explicitly asks for it.

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

When a task explicitly asks to stage one migration under an ignored path, use:

```bash
git add -f path/to/intended_migration.sql
```

Only add the intended migration. Do not change `.gitignore` for that reason.

## Commits

Commit only after requested validation passes.

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

No push or deploy unless explicitly requested.
