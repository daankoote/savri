import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CLASSIFICATION, classifyScript, ROOT } from "./command-classifier.mjs";
import { HUMAN_GATE_MESSAGE, routeEvent } from "./enval-permission-router.mjs";

const fixtures = Object.freeze([
  ["safe direct git status", "git status", CLASSIFICATION.ALLOW],
  [
    "safe worktree inventory",
    "git worktree list --porcelain",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe NUL-delimited worktree inventory",
    "git worktree list --porcelain -z",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe named branch existence inspection",
    "git branch --list gov-batch01",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe current-base inspection",
    "git rev-parse --verify HEAD; git show --quiet --format=%H HEAD",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe wrapped branch",
    "/bin/zsh -c 'git branch --show-current'",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe double wrapped Git",
    "/bin/zsh -lc \"bash -c 'git status'\"",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe compound",
    "git status && pwd; sed -n '1,4p' AGENTS.md",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe rg inspection",
    "rg -n 'sandbox_mode' .codex/config.toml",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe guarded verifier",
    "node scripts/tools/enval-verify.mjs --mode QUICK --json",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe guarded SQL",
    "node scripts/tools/enval-readonly-sql.mjs --proof-id enval-local-readonly-catalog",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe local ready",
    "node scripts/tools/enval-local-dev.mjs --operation ready",
    CLASSIFICATION.ALLOW,
  ],
  ["safe Docker inspection", "docker ps", CLASSIFICATION.ALLOW],
  [
    "safe target inspection",
    "node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --operation status",
    CLASSIFICATION.ALLOW,
  ],
  ["deny wrapped git add", "/bin/zsh -c 'git add .'", CLASSIFICATION.DENY],
  [
    "deny wrapped git add with shell argument",
    "/bin/zsh -c 'git add .' ignored",
    CLASSIFICATION.DENY,
  ],
  ["deny Git global-option mutation", "git -C . add .", CLASSIFICATION.DENY],
  ["deny Git branch mutation", "git branch new-topic", CLASSIFICATION.DENY],
  [
    "deny Git branch deletion",
    "git branch --delete old-topic",
    CLASSIFICATION.DENY,
  ],
  [
    "deny mutating option disguised as branch listing",
    "git branch --list --delete old-topic",
    CLASSIFICATION.DENY,
  ],
  ...[
    "add ../enval-gov-batch01 gov-batch01",
    "remove ../enval-gov-batch01",
    "move ../enval-gov-batch01 ../enval-gov-batch01-moved",
    "prune",
    "repair",
    "lock ../enval-gov-batch01",
    "unlock ../enval-gov-batch01",
  ].map((operation) => [
    `deny Git worktree ${operation.split(" ")[0]}`,
    `git worktree ${operation}`,
    CLASSIFICATION.DENY,
  ]),
  [
    "deny ambiguous worktree operation",
    "git worktree inspect",
    CLASSIFICATION.DENY,
  ],
  [
    "deny unsupported worktree list option",
    "git worktree list --execute",
    CLASSIFICATION.DENY,
  ],
  ...[
    "commit -m nope",
    "merge topic",
    "rebase main",
    "reset --hard HEAD",
    "clean -fd",
    "stash push",
  ].map((operation) => [
    `deny Git mutation ${operation.split(" ")[0]}`,
    `git ${operation}`,
    CLASSIFICATION.DENY,
  ]),
  [
    "deny Git remote mutation",
    "git remote add origin example.invalid/repo",
    CLASSIFICATION.DENY,
  ],
  ["deny command transport mutation", "command git add .", CLASSIFICATION.DENY],
  ["deny env transport mutation", "env git push", CLASSIFICATION.DENY],
  [
    "deny env option transport mutation",
    "env -i git push",
    CLASSIFICATION.DENY,
  ],
  ["deny unsafe compound", "git status && git add .", CLASSIFICATION.DENY],
  [
    "deny file read followed by git add",
    "cat AGENTS.md; git add .",
    CLASSIFICATION.DENY,
  ],
  [
    "deny read-only Git followed by push",
    "git rev-parse HEAD; git push",
    CLASSIFICATION.DENY,
  ],
  ["deny git push", "git push", CLASSIFICATION.DENY],
  [
    "deny destructive DB",
    "psql -c 'delete from dossiers'",
    CLASSIFICATION.DENY,
  ],
  ["deny dependency install", "npm install", CLASSIFICATION.DENY],
  ["deny sudo", "sudo whoami", CLASSIFICATION.DENY],
  ["deny deploy script", "npm run deploy", CLASSIFICATION.DENY],
  [
    "deny remote network client",
    "curl https://example.com",
    CLASSIFICATION.DENY,
  ],
  ["deny Docker exec", "docker exec app env", CLASSIFICATION.DENY],
  [
    "deny mutating target wrapper",
    "node scripts/tools/enval-supabase-target.mjs --target CONTROL_PLANE --operation db-reset --execute",
    CLASSIFICATION.DENY,
  ],
  [
    "deny release verifier",
    "node scripts/tools/enval-verify.mjs --mode RELEASE",
    CLASSIFICATION.DENY,
  ],
  ["defer shell substitution", "echo $(git status)", CLASSIFICATION.DEFER],
  ["defer ambiguous pipe", "git status | cat", CLASSIFICATION.DEFER],
  ["defer sed mutation", "sed -i '' 's/a/b/' AGENTS.md", CLASSIFICATION.DEFER],
  ["defer unknown executable", "frobnicate --read-only", CLASSIFICATION.DEFER],
  ["defer generic shell", "zsh", CLASSIFICATION.DEFER],
  [
    "defer excessive wrapper depth",
    'zsh -c "bash -c \'sh -c \\"zsh -c \\\\\\"git status\\\\\\"\\"\'"',
    CLASSIFICATION.DEFER,
  ],
]);

for (const [name, command, expected] of fixtures) {
  test(name, () => {
    assert.equal(
      classifyScript(command, { cwd: ROOT }).classification,
      expected,
    );
  });
}

function event(hookEventName, command) {
  return {
    cwd: ROOT,
    hook_event_name: hookEventName,
    tool_name: "Bash",
    tool_input: { command },
  };
}

test("PreToolUse denies a human gate with the required stop instruction", () => {
  const routed = routeEvent(event("PreToolUse", "git commit -m nope"));
  assert.equal(routed.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(
    routed.output.hookSpecificOutput.permissionDecisionReason,
    HUMAN_GATE_MESSAGE,
  );
});

test("PreToolUse does not pre-approve a safe command", () => {
  assert.equal(routeEvent(event("PreToolUse", "git status")).output, null);
});

test("PermissionRequest allows worktree inventory", () => {
  assert.deepEqual(
    routeEvent(event("PermissionRequest", "git worktree list --porcelain"))
      .output,
    {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    },
  );
});

test("PermissionRequest denies a human gate", () => {
  const routed = routeEvent(event("PermissionRequest", "git push"));
  assert.deepEqual(routed.output.hookSpecificOutput.decision, {
    behavior: "deny",
    message: HUMAN_GATE_MESSAGE,
  });
});

test("PermissionRequest defers an unknown command with no hook decision", () => {
  assert.equal(
    routeEvent(event("PermissionRequest", "frobnicate")).output,
    null,
  );
});

test("command hook stdin/stdout protocol emits allow, deny, and no decision", () => {
  const router = fileURLToPath(
    new URL("./enval-permission-router.mjs", import.meta.url),
  );
  const invoke = (hookEventName, command) =>
    spawnSync(process.execPath, [router], {
      cwd: ROOT,
      encoding: "utf8",
      input: JSON.stringify(event(hookEventName, command)),
    });
  const allowed = invoke(
    "PermissionRequest",
    "git worktree list --porcelain",
  );
  const denied = invoke("PreToolUse", "git add .");
  const deferred = invoke("PermissionRequest", "frobnicate");
  assert.equal(allowed.status, 0);
  assert.equal(
    JSON.parse(allowed.stdout).hookSpecificOutput.decision.behavior,
    "allow",
  );
  assert.equal(denied.status, 0);
  assert.equal(
    JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision,
    "deny",
  );
  assert.equal(deferred.status, 0);
  assert.equal(deferred.stdout, "");
});

test("observability records only bounded metadata and a command hash", () => {
  const command = "git status --short";
  routeEvent(event("PermissionRequest", command));
  const log = readFileSync(
    join(tmpdir(), "enval-codex-hooks/permission-router.jsonl"),
    "utf8",
  );
  const entry = JSON.parse(log.trimEnd().split("\n").at(-1));
  assert.deepEqual(Object.keys(entry).sort(), [
    "at",
    "classification",
    "command_hash",
    "event",
    "reason",
  ]);
  assert.equal(entry.classification, CLASSIFICATION.ALLOW);
  assert.match(entry.command_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(entry).includes(command), false);
});

test("project permissions retain workspace sandbox and loopback-only network authority", () => {
  const config = readFileSync(
    new URL("../config.toml", import.meta.url),
    "utf8",
  );
  assert.match(config, /^approval_policy = "on-request"$/m);
  assert.match(config, /^approvals_reviewer = "auto_review"$/m);
  assert.match(config, /^default_permissions = "enval-dev"$/m);
  assert.match(config, /^extends = ":workspace"$/m);
  assert.match(config, /^"localhost" = "allow"$/m);
  assert.match(config, /^"127\.0\.0\.1" = "allow"$/m);
  assert.match(config, /^dangerously_allow_non_loopback_proxy = false$/m);
  assert.match(config, /^dangerously_allow_all_unix_sockets = false$/m);
  assert.doesNotMatch(
    config,
    /danger-full-access|bypassPermissions|full_access|yolo/i,
  );
});
