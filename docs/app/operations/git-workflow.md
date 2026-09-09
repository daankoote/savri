# Git, Worktree, Batch, Preview, And Terminal Workflow

Status: CURRENT operations contract.

This document owns Git authority, worktree routing, canonical batch and preview
operation, and human Terminal handoffs. Product canon and proof interpretation
live elsewhere.

## Git authority

The active integration branch is main. Main is the protected integration
worktree.

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

## Canonical batch entrypoint

Normal batches start from Main with a human-supplied workspace label:

~~~text
node scripts/tools/enval-batch.mjs start Beheer
~~~

The launcher validates the canonical repository, Main's clean tracked/index
state, supported Codex and Herdr interfaces, and concrete worktree, workspace,
tab, pane, and agent conflicts. The supplied label deterministically defines the
leaf worktree, branch, and agent name. The launcher reuses that exact
workspace/worktree/tabs/agent on retry or resume and refuses duplicates,
conflicting bindings, or multiple active agents. Task scope comes from
`AGENTS.md`, the task contract, and risk-selected verification; Git history and
integration remain human-controlled.

The launcher keeps technical IDs internal, uses the supported Herdr agent
mechanism, and launches Codex with on-request user approval, strict config, and
ordinary product web search disabled. It never
commits, merges, pushes, deploys, performs product work, or cleans data.

For UI work, `scripts/tools/enval-ui-review-collect.mjs` only collects bounded
browser evidence. The primary task routes that evidence and the explicit
acceptance to a fresh, standalone read-only `ui_reviewer`; there is no central
review loop or result publisher. Daan and the main chat determine scope and
acceptance. Reviewer results return to the primary conversation.

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

Persistent previews are controlled from the approved Beheer worktree with its
canonical checked-in tool and one approved workspace:

~~~text
/usr/local/bin/node scripts/tools/enval-preview.mjs start Beheer
/usr/local/bin/node scripts/tools/enval-preview.mjs status Beheer
/usr/local/bin/node scripts/tools/enval-preview.mjs stop Beheer
~~~

Run these commands from the approved Beheer worktree root. A preview tool from
another worktree is a different executable authority and must not inspect or
control the Beheer preview process.

The tool requires Node 22+ and snapshots the registered worktree below
`/private/tmp/enval-runtime/ENVAL/repositories/<repository-id>/worktrees/<worktree-id>/preview/beheer`.
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

Main -> Terminal is the default location for project-wide Git and
administration. A batch Terminal is used only for batch-local work.

Every human action identifies:

~~~text
WHERE
Project: <project>
Workspace: <workspace>
Tab: Terminal

DO
<one exact command or bounded command block>
~~~

Manual evidence uses set -o pipefail, captures complete stdout/stderr with
2>&1 | tee to a semantic file inside the workspace-bound run directory, and
then transports that file. Never use terminal-latest.txt; use a step name such
as commit-sequence-precheck.txt, setup-commit-result.txt, or
main-integration-check.txt. Do not make Daan select scrollback and do not use
cat as the primary transport.

Human Terminal blocks must never run shell exit or replace the interactive
shell with exec. A check reports a non-zero status without closing the tab.
Do not close, rename, remove, or reconcile tabs/panes/workspaces as a side
effect of a handoff.

Prompts contain only task-specific delta. Permanent Git, batch, and Terminal
rules are linked, not copied into every task.

## Push and deploy

Push and deploy are explicit human actions. Local validation, a commit, or an
integration does not imply remote mutation or production acceptance.
