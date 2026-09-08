# Git, Worktree, Runner, Result, And Terminal Workflow

Status: CURRENT operations contract.

This document owns Git authority, worktree/workspace routing, canonical runner
and preview operation, result publication, and human Terminal handoffs. Product
canon and proof interpretation live elsewhere.

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

## Worktree and workspace responsibilities

The orchestrator owns the human name, branch, worktree, tabs, panes, and agent
binding. No prompt, agent, or launcher invents or repairs an alternate binding.

~~~text
Role               Workspace  Owned paths
MAIN_INTEGRATION   Main       integration/admin; no implementation paths
SETUP_GOVERNANCE  _Setup     AGENTS, .codex, operations, approved runners/proofs
BEHEER_PRODUCT     Beheer     app, Supabase, product docs and product proofs
~~~

Main has tabs Codex and Terminal. _Setup and Beheer have tabs Codex, Terminal,
and Reviewer. Beheer cannot change AGENTS.md, .codex, Setup runners, or
operations governance. _Setup cannot change app code, Edge Functions,
migrations, product contracts, or product proofs. A path without an explicit
owner is refused rather than inferred.

No other human workspace name is approved. A new workspace requires Daan's
explicit agreement and a bounded registry/governance change. Names such as
Previous Beheer, Beheer 2, or Autonomy Beheer are forbidden. One human
workspace has at most one active batch/worktree binding.

Product implementation belongs in Beheer, not _Setup. Setup governance does
not ride with a Beheer product change. Main is used for controlled integration
and project administration. Worktree synchronization and history mutation
remain human actions.

## Canonical batch runner

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
mechanism, and launches Codex with on-request approval, Auto-review, strict
config, and ordinary product web search disabled. It never
commits, merges, pushes, deploys, performs product work, or cleans data.

After project hook/configuration source changes, an already-open Codex process
is stale. Start a fresh session and trust the exact reviewed hooks;
`Continue without trusting (hooks won't run)` is invalid and
`--dangerously-bypass-hook-trust` is forbidden.

For UI work, the implementation run produces bounded evidence before the
project review loop starts a fresh read-only reviewer. Findings return through
the runner; Daan does not shuttle reviewer messages. PASS stops immediately.
Review cycle limits and evidence rules live in the root AGENTS.md.

Stored Herdr/worktree state does not prove a Codex process survived interruption
or reboot. Resume/relaunch only after the canonical runner has reconciled the
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

Persistent previews are controlled from Main -> Terminal with the canonical
Setup-owned tool and one approved workspace:

~~~text
/usr/local/bin/node ../enval-worktrees/setup/scripts/tools/enval-preview.mjs start Beheer
/usr/local/bin/node ../enval-worktrees/setup/scripts/tools/enval-preview.mjs status Beheer
/usr/local/bin/node ../enval-worktrees/setup/scripts/tools/enval-preview.mjs stop Beheer
~~~

The tool requires Node 22+, snapshots the registered worktree into
~/.herdr-runtime/ENVAL/preview/beheer/source, and installs root/app dependencies
from unchanged lockfiles into the external runtime. Git metadata, dependencies,
private env files, logs, and generated artifacts are excluded. No node_modules,
lockfile change, or runtime artifact is created in a worktree.

The guarded runtime may materialize only the approved deterministic local tenant
signing configuration. It never writes Auth, signup, Storage, or customer data.
Partial/conflicting/invalidated/non-local state fails closed. Readiness uses the
same tenant configuration, signing-material, legal-document, receipt, and
browser projection authorities as the application. Remote/production never
receives local fallback behavior.

While running, the preview owns one validated temporary source/app/node_modules
link to the matching external dependency tree. Source, link, and target must
resolve below ~/.herdr-runtime/ENVAL/. Occupied paths, traversal, wrong targets,
failure, stop, and interrupt fail closed and clean the link. Stop terminates
only the owned process group, verifies termination, and compares the source
worktree with its start fingerprint.

## Result publication

scripts/tools/enval-result.mjs is the single ENVAL result authority.
UserPromptSubmit opens a workspace run; Stop publishes the recognized terminal
return; Interrupt and SessionEnd publish bounded fallback status. The configured
agent-turn-complete notifier is an idempotent fallback when Stop is unavailable.
All terminal paths share the locked workspace-role and baseline validation.
Current hard permission denials publish HUMAN_GATE through the same authority.

Terminal statuses are PASS, PARTIAL, FAIL, HUMAN_GATE, BLOCKED, INTERRUPTED, and
TIMEOUT. Publication failure is non-zero and recorded without secrets.

The canonical human entrypoint is:

~/.herdr-results/ENVAL/<human-workspace>/latest.txt

Immutable history is:

~/.herdr-results/ENVAL/<human-workspace>/runs/<run-id>/result.txt

Each run atomically replaces its workspace latest with PENDING and later its
terminal envelope. Parallel workspaces never share active state, latest, or
history. The project-level latest is transitional and non-canonical.

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

Prompts contain only task-specific delta. Permanent Git, runner, result, and
Terminal rules are linked, not copied into every task.

## Push and deploy

Push and deploy are explicit human actions. Local validation, a commit, or an
integration does not imply remote mutation or production acceptance.
