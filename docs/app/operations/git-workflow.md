# Git, Worktree, Batch, Preview, And Terminal Workflow

Status: CURRENT operations contract.

This document owns Git authority, worktree routing, canonical batch and preview
operation, and human Terminal handoffs. Product canon and proof interpretation
live elsewhere.

## Git authority

The active integration branch is `main` in the protected canonical repository
root.

Codex may use only the read-only Git operations permitted by the effective
policy: status, diff, diff --stat, diff --check, log, show, branch, and
rev-parse. It preserves unrelated dirty and untracked files.

Daan owns staging, commits, cherry-picks, merges, pushes, history changes, and
deployments. Codex never autonomously runs add, commit, push, merge, rebase,
cherry-pick, revert, reset, restore, checkout, switch, clean, stash, rm, mv,
apply, or am.

Before edits, establish the expected branch, HEAD, index, tracked changes, and
untracked inventory. Stop before mutation when they differ from the task.
Before a human commit, report at least git diff --check, the exact changed file
list, diffstat, staged state, and worktree status.

Ignored migrations are not made visible by changing .gitignore. When Daan
chooses to stage one intended ignored migration, Daan may use
git add -f <exact-path>; Codex does not run it.

## Canonical runtime entrypoint

The active product runtime uses the canonical repository on `main` in the
single `Enval` workspace:

~~~text
WHERE
Session: ENVAL
Workspace: Enval
Tab: Terminal
Repository: /Users/daankoote/dev/enval
Branch: main

DO
node scripts/tools/enval-batch.mjs start Enval
~~~

The launcher validates the canonical repository, clean tracked/index state,
`main`, supported Codex and Herdr interfaces, the `Enval` workspace, its
`Codex` and `Terminal` tabs, and the `enval-main` General/Primary agent. It
refuses legacy workspace labels, a permanent Reviewer tab, conflicting pane
bindings, or multiple active agents. It neither creates nor changes branches or
worktrees; valid setup and integration worktrees remain outside the active
product topology. Task scope comes from `AGENTS.md`, the task contract and
risk-selected verification; Git history and integration remain human-controlled.

The launcher keeps technical IDs internal, uses the supported Herdr agent
mechanism, and launches Codex with on-request user approval, strict config, and
ordinary product web search disabled. It never
commits, merges, pushes, deploys, performs product work, or cleans data.

For review work, the primary uses only the temporary read-only specialists
defined by the project agent configuration and selected under `AGENTS.md`.
There is no permanent Reviewer tab, central review loop or result publisher.
For UI work, `scripts/tools/enval-ui-review-collect.mjs` only collects bounded
browser evidence. Daan and the main chat determine scope and acceptance.

Stored Herdr/worktree state does not prove a Codex process survived interruption
or reboot. Resume/relaunch only after the batch entrypoint has reconciled the
registered binding and live state; ambiguous recovery preserves state and stops.
Parallel product implementation remains disabled unless a separately approved
pilot provides isolated worktrees, services, fixtures, and human integration.

## Canonical local read-only probes

Individual identity and privacy-safe baseline reads use only these guarded
forms:

~~~text
node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe db-identity
node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe db-baseline
node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe api-health
node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe mailpit-health
~~~

Database probes pin 127.0.0.1:54322/postgres, use fixed SQL inside
BEGIN TRANSACTION READ ONLY and ROLLBACK, enforce read-only session state, and
emit privacy-safe identity/count metadata. HTTP probes make fixed GETs to the
exact loopback origin, reject redirects, send no credentials/body, discard
content, and emit only origin/status metadata.

Direct or arbitrary psql/curl, extra arguments, other targets, remote or unknown
hosts, other ports/databases, credentials, response content, cleanup, and all
writes remain fail closed.

## External worktree preview

Persistent previews are controlled from the canonical repository with its
checked-in tool and the single approved workspace:

~~~text
/usr/local/bin/node scripts/tools/enval-preview.mjs start Enval
/usr/local/bin/node scripts/tools/enval-preview.mjs status Enval
/usr/local/bin/node scripts/tools/enval-preview.mjs stop Enval
~~~

Run these commands from `/Users/daankoote/dev/enval` on `main`. A preview tool
from another worktree is a different executable authority and must not inspect
or control the Enval preview process.

The tool requires Node 22+ and snapshots the registered worktree below
`/private/tmp/enval-runtime/ENVAL/repositories/<repository-id>/worktrees/<worktree-id>/preview/enval`.
The deterministic path IDs are the first 16 hexadecimal characters of the
SHA-256 digest of each absolute path, so repositories and worktrees cannot
collide. Root/app dependencies are installed from unchanged lockfiles into that
external runtime. Git metadata, dependencies, private env files, logs, and
generated artifacts are excluded. No node_modules, lockfile change, or runtime
artifact is created in a worktree.

The guarded runtime may materialize only the approved deterministic local tenant
signing configuration. It never writes Auth, signup, Storage, or customer data.
Partial/conflicting/invalidated/non-local state fails closed. Readiness uses the
same tenant configuration, signing-material, legal-document, receipt, and
browser projection authorities as the application. Remote/production never
receives local fallback behavior.

While running, the preview owns one validated temporary source/app/node_modules
link to the matching external dependency tree. Source, link, and target must
resolve below `/private/tmp/enval-runtime/ENVAL/`. Occupied paths, traversal,
wrong targets, failure, stop, and interrupt fail closed and clean the link. Stop
terminates only the owned process group, verifies termination, and compares the
source worktree with its start fingerprint.

## Human Terminal handoffs

`ENVAL` -> `Enval` -> `Terminal` is the location for project-wide Git and
administration.

Every human action identifies:

~~~text
WHERE
Session: <session>
Workspace: <workspace>
Tab: Terminal
Repository: <repository>
Branch: <branch>

DO
<one exact command or bounded command block>
~~~

Result handoff and its privacy and time-of-reporting limits are owned by
`AGENTS.md`. Desktop result files and project-specific copy helpers remain
optional and are never the primary transport.

Human Terminal blocks must never run shell exit or replace the interactive
shell with exec. A check reports a non-zero status without closing the tab.
Do not close, rename, remove, or reconcile tabs/panes/workspaces as a side
effect of a handoff.

Prompts contain only task-specific delta. Permanent Git, batch, and Terminal
rules are linked, not copied into every task.

## Push and deploy

Push and deploy are explicit human actions. Local validation, a commit, or an
integration does not imply remote mutation or production acceptance.
