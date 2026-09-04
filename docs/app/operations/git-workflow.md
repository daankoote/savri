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
worktree, Herdr workspace, and interactive Codex agent. All batch workspaces live
in the one named persistent Herdr session `enval-worker`; the launcher uses the
workspace root pane returned by Herdr and does not predict pane IDs or delegate
Git-worktree creation to Herdr.

Before Git branch/worktree creation, the launcher verifies installed Herdr 0.8.2,
the required session/workspace/agent CLI semantics, Codex availability, and the
project-local governance baseline. It then starts Codex through Herdr's supported
agent mechanism with on-request approval, Auto-review, hooks, strict config, and
`web_search="disabled"`; ordinary product batches therefore have no hosted
web-search tool by default. Governance or research tasks may use cached search
only when explicitly required, and live search requires explicit task need.
Shell/network permission remains a separate boundary.

The launcher does not commit, merge, push, deploy, clean up, or launch Codex
Desktop. Detaching a Herdr client does not stop the batch agent. The shared named
session topology permits a later remote client attachment without changing batch
architecture.

## Worker Startup And Recovery

Status: CURRENT PROVEN on the temporary MacBook Worker. The M6 replacement is
TARGET and must preserve this architecture.

After reboot and user login, the expected worker dependency order is:

1. Tailscale starts and restores private device reachability.
2. macOS Remote Login remains enabled so SSH is available over Tailscale.
3. the `moshi-hook` LaunchAgent starts from
   `~/Library/LaunchAgents/app.getmoshi.moshi-hook.plist`.
4. Docker Desktop starts and its engine becomes available.
5. Herdr is available on demand; its stored `enval-worker` session may be
   stopped.
6. Moshi may reopen the stored `enval-worker/enval` workspace, while the
   canonical batch launcher remains the normal path for creating a new batch
   workspace and Codex agent.

Docker availability is a worker dependency for batches that use the local ENVAL
stack. Stored Herdr state, repository state, or remote shell access does not
prove that the Docker engine is ready.

A reboot or power loss never proves that an active Codex process survived. Do
not claim that a batch continued through reboot merely because its Herdr
session, workspace, branch, or worktree is still stored. Before any recovery,
reconcile the stored Herdr workspace and agent, the leaf branch and worktree,
and the live Codex process. Resume or relaunch only when that state is safe and
the action is explicit. Otherwise surface the interrupted batch to Daan without
creating, deleting, cleaning, or replacing state. Automatic reboot-resume is not
enabled.

Daan does not manually compose normal Git, Herdr, and Codex recovery commands.
For normal control Daan either reopens the stored workspace in Moshi or supplies
the batch slug to the canonical launcher. Until canonical tooling provides a
safe explicit recovery action for any further case, that case stops with the
stored state intact for Daan.

## Private Remote Control

No public router ports or port forwarding are required or permitted for this
worker path. Tailscale provides private reachability, Remote Login provides SSH,
the `moshi-hook` makes the host available to Moshi, and Moshi is the remote
control client for the persistent Herdr workspace.

The proven iPhone control path is:

```text
ExpressVPN off -> Tailscale on -> Moshi -> Herdr
```

Moshi uses the private Tailscale/SSH path; it does not make Herdr, Codex,
Docker, or repository services public.

## M6 Worker Migration

Moving from the temporary MacBook Worker to the M6 changes the host, not the
architecture or security boundary. Before autonomous ENVAL work on the M6,
install, migrate where appropriate, and verify the following machine-local
assets and settings without assuming that copied files prove active services:

- `~/.codex/AGENTS.md`;
- `~/.agents/skills/independent-ui-review/`;
- `~/.config/moshi/`;
- `~/Library/LaunchAgents/app.getmoshi.moshi-hook.plist`;
- Tailscale device and account setup;
- macOS Remote Login configuration;
- Docker startup configuration and engine readiness;
- Herdr installation and the `enval-worker` session conventions; and
- Codex CLI installation and configuration.

The M6 must retain the same private Tailscale -> SSH/Moshi -> Herdr -> Codex
control path, Docker dependency, canonical batch launcher, and no-public-router-
ports boundary. Migration and verification are separate future work; this
contract does not copy assets, configure the M6, or resume an interrupted batch.

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
