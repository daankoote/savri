import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import {
  buildReviewerArgv,
  buildReviewPrompt,
  ENVAL_REVIEW_ADAPTER,
  GENERIC_REVIEWER_CORE,
  inspectCliVisualReviewCapability,
  MAX_REVIEW_FIX_CYCLES,
  parseReviewRequest,
  startUiReview,
  UiReviewLaunchError,
} from "../tools/enval-ui-review.mjs";

const REPOSITORY_ROOT = new URL("../..", import.meta.url).pathname.replace(
  /\/$/,
  "",
);
const temporaryRoots = [];

after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "enval-ui-review-proof-"));
  temporaryRoots.push(root);
  for (const path of [GENERIC_REVIEWER_CORE, ENVAL_REVIEW_ADAPTER]) {
    const target = join(root, path);
    mkdirSync(join(target, ".."), { recursive: true });
    writeFileSync(target, "fixture\n");
  }
  writeFileSync(join(root, "acceptance.md"), "# Acceptance\n");
  return realpathSync(root);
}

function fakeRun(command, args) {
  assert.equal(command, "codex");
  if (args[0] === "--version") {
    return { status: 0, stdout: "codex-cli proof\n", stderr: "" };
  }
  if (args[0] === "features") {
    return {
      status: 0,
      stdout: [
        "browser_use stable true",
        "computer_use stable true",
        "view_image stable true",
        "",
      ].join("\n"),
      stderr: "",
    };
  }
  if (args[0] === "mcp") {
    return {
      status: 0,
      stdout: "cua_repl command args env cwd enabled Unsupported\n",
      stderr: "",
    };
  }
  assert.fail(`unexpected command: ${command} ${args.join(" ")}`);
}

function requestArgs(cycle = "1") {
  return [
    "--acceptance",
    "acceptance.md",
    "--base-url",
    "http://localhost:5175",
    "--cycle",
    cycle,
    "--route",
    "/beheer",
    "--state",
    "authorized operator",
  ];
}

function assertSkillFrontmatter(source, name) {
  const frontmatter = source.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(frontmatter, `${name} frontmatter missing`);
  assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, "m"));
  assert.match(frontmatter[1], /^description: .+$/m);
}

test("generic core is project-agnostic and ENVAL truth stays in the adapter", () => {
  const core = readFileSync(
    join(REPOSITORY_ROOT, GENERIC_REVIEWER_CORE),
    "utf8",
  );
  const adapter = readFileSync(
    join(REPOSITORY_ROOT, ENVAL_REVIEW_ADAPTER),
    "utf8",
  );
  assertSkillFrontmatter(core, "independent-ui-review");
  assertSkillFrontmatter(adapter, "enval-ui-review");
  assert.doesNotMatch(core, /ENVAL|Daan|SurfaceShell|\/beheer/);
  assert.match(core, /fresh review-only Codex session/);
  assert.match(core, /There are at most two review\/fix cycles/);
  for (
    const expected of [
      "SurfaceShell",
      "desktop/tablet-first",
      "Powered by ENVAL",
      "capabilities",
      "inline CSS",
      "Daan retains final browser and product acceptance",
    ]
  ) assert.match(adapter, new RegExp(expected.replace("/", "\\/")));
});

test("request parsing accepts only two loopback review cycles and project acceptance", () => {
  const root = fixture();
  const request = parseReviewRequest(requestArgs(), root);
  assert.equal(request.cycle, 1);
  assert.equal(request.baseUrl, "http://localhost:5175");
  assert.deepEqual(request.routes, ["/beheer"]);
  assert.throws(() => parseReviewRequest(requestArgs("3"), root), {
    name: "UiReviewLaunchError",
    code: "review_cycle_invalid",
  });
  const remote = requestArgs();
  remote[3] = "https://example.com";
  assert.throws(() => parseReviewRequest(remote, root), {
    name: "UiReviewLaunchError",
    code: "base_url_not_loopback_origin",
  });
  const outside = requestArgs();
  outside[1] = "/tmp/outside-acceptance.md";
  assert.throws(() => parseReviewRequest(outside, root), {
    name: "UiReviewLaunchError",
    code: "acceptance_invalid",
  });
});

test("launcher creates a new ephemeral read-only Codex exec without bypasses", () => {
  const root = fixture();
  const request = parseReviewRequest(requestArgs("2"), root);
  const argv = buildReviewerArgv(root, request);
  assert.equal(argv[0], "exec");
  assert.ok(argv.includes("--ephemeral"));
  assert.deepEqual(
    argv.slice(argv.indexOf("--sandbox"), argv.indexOf("--sandbox") + 2),
    [
      "--sandbox",
      "read-only",
    ],
  );
  assert.deepEqual(
    argv.slice(
      argv.indexOf("--ask-for-approval"),
      argv.indexOf("--ask-for-approval") + 2,
    ),
    ["--ask-for-approval", "never"],
  );
  assert.ok(argv.includes('web_search="disabled"'));
  assert.ok(argv.includes("hooks"));
  assert.ok(argv.includes("--strict-config"));
  assert.ok(!argv.includes("resume"));
  assert.ok(!argv.includes("fork"));
  assert.ok(!argv.includes("danger-full-access"));
  assert.ok(!argv.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.match(buildReviewPrompt(request), /cycle 2/);
  assert.match(buildReviewPrompt(request), /STOP_TO_HUMAN=YES/);
  assert.equal(MAX_REVIEW_FIX_CYCLES, 2);
});

test("real launch uses guarded readiness without generic curl", async () => {
  const root = fixture();
  const events = [];
  const run = (command, args) => {
    if (command === "node") {
      events.push({ command, args });
      return { status: 0, stdout: "LOCAL_READY=PASS\n", stderr: "" };
    }
    return fakeRun(command, args);
  };
  await startUiReview(requestArgs(), {
    root,
    run,
    launch: async () => {
      events.push({ command: "codex", args: ["exec"] });
      return 0;
    },
  });
  assert.deepEqual(events, [
    {
      command: "node",
      args: [
        "scripts/tools/enval-local-dev.mjs",
        "--operation",
        "ready",
        "--vite-url",
        "http://localhost:5175",
      ],
    },
    { command: "codex", args: ["exec"] },
  ]);
});

test("failed guarded local readiness stops before reviewer launch", async () => {
  const root = fixture();
  let launched = false;
  const run = (command, args) => {
    if (command === "node") {
      return { status: 1, stdout: "", stderr: "LOCAL_READY=FAIL\n" };
    }
    return fakeRun(command, args);
  };
  await assert.rejects(
    () =>
      startUiReview(requestArgs(), {
        root,
        run,
        launch: async () => {
          launched = true;
          return 0;
        },
      }),
    (error) =>
      error instanceof UiReviewLaunchError &&
      error.code === "local_review_readiness_failed",
  );
  assert.equal(launched, false);
});

test("current capability contract requires browser, computer, screenshot and CUA", () => {
  const capability = inspectCliVisualReviewCapability(fixture(), fakeRun);
  assert.deepEqual(capability, {
    version: "codex-cli proof",
    browserUse: true,
    computerUse: true,
    viewImage: true,
    cuaEnabled: true,
    supported: true,
  });
  const missingCua = (command, args) => {
    const result = fakeRun(command, args);
    if (args[0] === "mcp") return { ...result, stdout: "" };
    return result;
  };
  assert.equal(
    inspectCliVisualReviewCapability(fixture(), missingCua).supported,
    false,
  );
});

test("dry run proves launch contract without starting a reviewer", async () => {
  const root = fixture();
  let launched = false;
  const result = await startUiReview([...requestArgs(), "--dry-run"], {
    root,
    run: fakeRun,
    launch: async () => {
      launched = true;
      return 0;
    },
  });
  assert.equal(launched, false);
  assert.equal(result.exitCode, null);
  assert.equal(result.capability.supported, true);
  assert.equal(result.launchRequest.cwd, root);
});

test("unsupported visual stack fails closed before launch", async () => {
  const root = fixture();
  const noVisualRun = (command, args) => {
    const result = fakeRun(command, args);
    if (args[0] === "features") {
      return { ...result, stdout: "browser_use stable false\n" };
    }
    return result;
  };
  await assert.rejects(
    () => startUiReview(requestArgs(), { root, run: noVisualRun }),
    (error) =>
      error instanceof UiReviewLaunchError &&
      error.code === "cli_visual_review_capability_missing",
  );
});
