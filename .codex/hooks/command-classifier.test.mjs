import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CLASSIFICATION, classifyScript, ROOT } from "./command-classifier.mjs";
import { HUMAN_GATE_MESSAGE, routeEvent } from "./enval-permission-router.mjs";

const TEST_RESULT_ROOT = join(tmpdir(), "enval-command-classifier-results");
const routeForTest = (event) =>
  routeEvent(event, { resultRoot: TEST_RESULT_ROOT });

const fixtures = Object.freeze([
  ["safe direct git status", "git status", CLASSIFICATION.ALLOW],
  [
    "safe local hooks-path inspection",
    "git config --local --get core.hooksPath",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe local multi-value inspection",
    "git config --local --get-all core.hooksPath",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe local regexp inspection",
    "git config --local --get-regexp '^core\\.'",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe local config inventory",
    "git config --local --list",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe local config inventory with provenance",
    "git config --show-origin --local --show-scope --list",
    CLASSIFICATION.ALLOW,
  ],
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
    "safe branch ancestry inspection",
    "git branch --contains d9f5096",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe merge-base ancestry inspection",
    "git merge-base --is-ancestor d9f5096 HEAD",
    CLASSIFICATION.ALLOW,
  ],
  [
    "safe object existence inspection",
    "git cat-file -e d9f5096",
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
  [
    "safe UI review advance",
    `node scripts/tools/enval-ui-review-loop.mjs advance --state ${
      join(tmpdir(), "enval-ui-review/state.json")
    }`,
    CLASSIFICATION.ALLOW,
  ],
  ["safe Docker inspection", "docker ps", CLASSIFICATION.ALLOW],
  [
    "safe target inspection",
    "node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --operation status",
    CLASSIFICATION.ALLOW,
  ],
  ...["db-identity", "db-baseline", "api-health", "mailpit-health"].map(
    (probe) => [
      `safe canonical local ${probe} probe`,
      `node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe ${probe}`,
      CLASSIFICATION.ALLOW,
    ],
  ),
  ["deny wrapped git add", "/bin/zsh -c 'git add .'", CLASSIFICATION.DENY],
  [
    "deny wrapped git add with shell argument",
    "/bin/zsh -c 'git add .' ignored",
    CLASSIFICATION.DENY,
  ],
  [
    "defer malformed UI review loop",
    `node scripts/tools/enval-ui-review-loop.mjs advance --state ${
      join(tmpdir(), "state.json")
    } --state ${join(tmpdir(), "other.json")}`,
    CLASSIFICATION.DEFER,
  ],
  ["deny Git global-option mutation", "git -C . add .", CLASSIFICATION.DENY],
  [
    "deny local config value mutation",
    "git config --local core.hooksPath /tmp/x",
    CLASSIFICATION.DENY,
  ],
  ...[
    "--add core.hooksPath /tmp/x",
    "--replace-all core.hooksPath /tmp/x",
    "--unset core.hooksPath",
    "--unset-all core.hooksPath",
    "--rename-section core hooks",
    "--remove-section core",
    "--edit",
  ].map((operation) => [
    `deny local Git config ${operation.split(" ")[0]}`,
    `git config --local ${operation}`,
    CLASSIFICATION.DENY,
  ]),
  ...["--global", "--system", "--worktree", "--file .git/config"].map(
    (location) => [
      `deny non-local Git config read ${location.split(" ")[0]}`,
      `git config ${location} --get core.hooksPath`,
      CLASSIFICATION.DENY,
    ],
  ),
  [
    "deny ambiguous implicit Git config read",
    "git config --local core.hooksPath",
    CLASSIFICATION.DENY,
  ],
  [
    "deny mixed Git config read and mutation",
    "git config --local --get core.hooksPath --unset",
    CLASSIFICATION.DENY,
  ],
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
  [
    "deny branch rename",
    "git branch --move old-topic new-topic",
    CLASSIFICATION.DENY,
  ],
  [
    "deny branch force creation",
    "git branch --force new-topic HEAD",
    CLASSIFICATION.DENY,
  ],
  [
    "deny branch deletion disguised after contains",
    "git branch --contains HEAD --delete old-topic",
    CLASSIFICATION.DENY,
  ],
  [
    "defer non-ancestry merge-base",
    "git merge-base HEAD main",
    CLASSIFICATION.DEFER,
  ],
  [
    "defer non-existence cat-file mode",
    "git cat-file -p HEAD",
    CLASSIFICATION.DEFER,
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
  ...[
    "psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c 'BEGIN TRANSACTION READ ONLY; SELECT 1; ROLLBACK;'",
    "psql postgresql://postgres:postgres@remote.invalid:54322/postgres -c 'BEGIN TRANSACTION READ ONLY; SELECT 1; ROLLBACK;'",
    "psql postgresql://postgres:postgres@127.0.0.1:54323/postgres -c 'BEGIN TRANSACTION READ ONLY; SELECT 1; ROLLBACK;'",
    "psql postgresql://postgres:postgres@127.0.0.1:54322/other -c 'BEGIN TRANSACTION READ ONLY; SELECT 1; ROLLBACK;'",
    "psql $DATABASE_URL -c 'BEGIN TRANSACTION READ ONLY; SELECT 1; ROLLBACK;'",
    "psql $(printf local-target) -c 'BEGIN TRANSACTION READ ONLY; SELECT 1; ROLLBACK;'",
    "psql -f /tmp/read.sql",
    "psql -c '\\copy public.items to program true'",
    "psql -c '\\! whoami'",
  ].map((command, index) => [
    `deny direct database probe ${index + 1}`,
    command,
    CLASSIFICATION.DENY,
  ]),
  ...[
    "curl http://127.0.0.1:54321/auth/v1/health",
    "curl -X POST http://127.0.0.1:54321/auth/v1/health",
    "curl -X PUT http://127.0.0.1:54321/auth/v1/health",
    "curl -X PATCH http://127.0.0.1:54321/auth/v1/health",
    "curl -X DELETE http://127.0.0.1:54321/auth/v1/health",
    "curl http://localhost:54321/auth/v1/health",
    "curl http://127.0.0.1:54325/health",
    "curl https://example.invalid/health",
    "curl -H 'Authorization: Bearer value' http://127.0.0.1:54321/auth/v1/health",
    "curl -H 'Cookie: session=value' http://127.0.0.1:54321/auth/v1/health",
    "curl -L http://127.0.0.1:54321/auth/v1/health",
  ].map((command, index) => [
    `deny direct HTTP probe ${index + 1}`,
    command,
    CLASSIFICATION.DENY,
  ]),
  ...[
    "db-identity --execute",
    "db-identity --target TENANT_ENVAL",
    "unknown",
  ].map((suffix) => [
    `do not allow malformed canonical probe ${suffix.split(" ")[0]}`,
    `node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe ${suffix}`,
    CLASSIFICATION.DEFER,
  ]),
  [
    "deny canonical read chained to database write",
    "node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe db-identity && psql -c 'DELETE FROM public.items'",
    CLASSIFICATION.DENY,
  ],
  [
    "deny canonical read chained to exact-key cleanup",
    "node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe db-baseline; psql -c 'DELETE FROM public.items WHERE id = 1'",
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

const launcherGitPreflightAudit = Object.freeze([
  ["repository", "git rev-parse --show-toplevel", CLASSIFICATION.ALLOW],
  ["HEAD", "git rev-parse --verify HEAD", CLASSIFICATION.ALLOW],
  ["worktree state", "git status --short --branch", CLASSIFICATION.ALLOW],
  ["patch hygiene", "git diff --check", CLASSIFICATION.ALLOW],
  ["base history", "git log -1 --format=%H", CLASSIFICATION.ALLOW],
  ["base object", "git show --quiet --format=%H HEAD", CLASSIFICATION.ALLOW],
  ["current branch", "git branch --show-current", CLASSIFICATION.ALLOW],
  ["target branch", "git branch --list gov-batch01", CLASSIFICATION.ALLOW],
  [
    "containing branch",
    "git branch --contains d9f5096",
    CLASSIFICATION.ALLOW,
  ],
  [
    "commit ancestry",
    "git merge-base --is-ancestor d9f5096 HEAD",
    CLASSIFICATION.ALLOW,
  ],
  [
    "commit object",
    "git cat-file -e d9f5096",
    CLASSIFICATION.ALLOW,
  ],
  [
    "linked worktrees",
    "git worktree list --porcelain -z",
    CLASSIFICATION.ALLOW,
  ],
  [
    "local hooks path",
    "git config --local --get core.hooksPath",
    CLASSIFICATION.ALLOW,
  ],
  [
    "branch creation",
    "git branch gov-batch01",
    CLASSIFICATION.DENY,
  ],
  [
    "worktree creation",
    "git worktree add ../enval-gov-batch01 gov-batch01",
    CLASSIFICATION.DENY,
  ],
  [
    "local config mutation",
    "git config --local core.hooksPath /tmp/x",
    CLASSIFICATION.DENY,
  ],
  ["index mutation", "git add .", CLASSIFICATION.DENY],
  ["remote mutation", "git push", CLASSIFICATION.DENY],
]);

for (const [name, command, expected] of fixtures) {
  test(name, () => {
    assert.equal(
      classifyScript(command, { cwd: ROOT }).classification,
      expected,
    );
  });
}

for (const [metadata, command, expected] of launcherGitPreflightAudit) {
  test(`launcher Git preflight audit: ${metadata}`, () => {
    assert.deepEqual(classifyScript(command, { cwd: ROOT }), {
      classification: expected,
      reason: expected === CLASSIFICATION.ALLOW
        ? "READ_ONLY_GIT"
        : "HUMAN_GATE",
    });
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
  const routed = routeForTest(event("PreToolUse", "git commit -m nope"));
  assert.equal(routed.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(
    routed.output.hookSpecificOutput.permissionDecisionReason,
    HUMAN_GATE_MESSAGE,
  );
});

test("PreToolUse does not pre-approve a safe command", () => {
  assert.equal(routeForTest(event("PreToolUse", "git status")).output, null);
});

test("PermissionRequest allows worktree inventory", () => {
  assert.deepEqual(
    routeForTest(event("PermissionRequest", "git worktree list --porcelain"))
      .output,
    {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    },
  );
});

test("PermissionRequest allows local Git config inspection", () => {
  assert.deepEqual(
    routeForTest(
      event("PermissionRequest", "git config --local --get core.hooksPath"),
    ).output,
    {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "allow" },
      },
    },
  );
});

test("PermissionRequest allows only the fixed canonical local probes", () => {
  for (
    const probe of [
      "db-identity",
      "db-baseline",
      "api-health",
      "mailpit-health",
    ]
  ) {
    assert.deepEqual(
      routeForTest(
        event(
          "PermissionRequest",
          `node scripts/tools/enval-supabase-target.mjs --target TENANT_ENVAL --probe ${probe}`,
        ),
      ).output,
      {
        hookSpecificOutput: {
          hookEventName: "PermissionRequest",
          decision: { behavior: "allow" },
        },
      },
    );
  }
});

test("PreToolUse denies local Git config mutation", () => {
  const routed = routeForTest(
    event("PreToolUse", "git config --local core.hooksPath /tmp/x"),
  );
  assert.equal(routed.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(
    routed.output.hookSpecificOutput.permissionDecisionReason,
    HUMAN_GATE_MESSAGE,
  );
});

test("PermissionRequest denies a human gate", () => {
  const routed = routeForTest(event("PermissionRequest", "git push"));
  assert.deepEqual(routed.output.hookSpecificOutput.decision, {
    behavior: "deny",
    message: HUMAN_GATE_MESSAGE,
  });
});

test("PermissionRequest defers an unknown command with no hook decision", () => {
  assert.equal(
    routeForTest(event("PermissionRequest", "frobnicate")).output,
    null,
  );
});

test("command hook stdin/stdout protocol emits allow and no decision", () => {
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
    "git config --local --get core.hooksPath",
  );
  const deferred = invoke("PermissionRequest", "frobnicate");
  assert.equal(allowed.status, 0);
  assert.equal(
    JSON.parse(allowed.stdout).hookSpecificOutput.decision.behavior,
    "allow",
  );
  assert.equal(deferred.status, 0);
  assert.equal(deferred.stdout, "");
});

test("observability records only bounded metadata and a command hash", () => {
  const command = "git status --short";
  routeForTest(event("PermissionRequest", command));
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

test("exec policy leaves semantic Git metadata decisions to the hooks", () => {
  const rules = readFileSync(
    new URL("../rules/enval.rules", import.meta.url),
    "utf8",
  );
  assert.match(
    rules,
    /prefix_rule\(pattern = \["git", "branch"\], decision = "prompt"\)/,
  );
  assert.match(
    rules,
    /prefix_rule\(pattern = \["git", "worktree"\], decision = "prompt"\)/,
  );
  assert.doesNotMatch(
    rules,
    /prefix_rule\(pattern = \["git", "config"\], decision = "forbidden"\)/,
  );
  assert.match(
    rules,
    /prefix_rule\(pattern = \["node", "scripts\/tools\/enval-supabase-target\.mjs"\], decision = "prompt"\)/,
  );
  assert.match(
    rules,
    /prefix_rule\(pattern = \["psql"\], decision = "forbidden"\)/,
  );
  assert.match(
    rules,
    /prefix_rule\(pattern = \["curl"\], decision = "prompt"\)/,
  );
});
