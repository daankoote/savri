import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import {
  BrowserEvidenceError,
  collectBrowserEvidence,
  EVIDENCE_SCHEMA_VERSION,
  parseCollectorRequest,
} from "../tools/enval-ui-review-collect.mjs";
import {
  buildReviewerArgv,
  ENVAL_REVIEW_ADAPTER,
  GENERIC_REVIEWER_CORE,
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

function temporaryRoot(prefix = "enval-ui-review-proof-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return realpathSync(root);
}

function projectFixture() {
  const root = temporaryRoot();
  const adapterTarget = join(root, ENVAL_REVIEW_ADAPTER);
  mkdirSync(dirname(adapterTarget), { recursive: true });
  writeFileSync(adapterTarget, "fixture\n");
  writeFileSync(join(root, "acceptance.md"), "# Acceptance\n");
  return root;
}

function manifestFixture(root, overrides = {}) {
  const screenshotName = "desktop-1440x900.png";
  writeFileSync(join(root, screenshotName), Buffer.from("png-evidence"));
  const manifest = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    reviewId: "ui-review03-proof",
    route: "/beheer",
    state: "unauthenticated operator login surface",
    requestedUrl: "http://127.0.0.1:5175/beheer",
    capturedAt: "2026-09-03T10:00:00.000Z",
    browserAutomationMechanism: "Playwright Chromium",
    collectorResult: "PASS",
    viewports: [
      {
        name: "desktop",
        width: 1440,
        height: 900,
        finalUrl: "http://127.0.0.1:5175/inloggen?returnTo=%2Fbeheer",
        screenshotPath: screenshotName,
        documentMetrics: {
          clientWidth: 1440,
          clientHeight: 900,
          scrollWidth: 1440,
          scrollHeight: 900,
        },
        consoleErrors: { count: 0, summaries: [] },
        runtimeErrors: { count: 0, summaries: [] },
        unsafeRequests: { count: 0, summaries: [] },
        result: "PASS",
      },
    ],
    consoleErrors: { count: 0 },
    runtimeErrors: { count: 0 },
    productWriteRequests: { count: 0, blocked: true },
    ...overrides,
  };
  const path = join(root, "evidence-manifest.json");
  writeFileSync(path, `${JSON.stringify(manifest)}\n`);
  return path;
}

function reviewerArgs(manifestPath, cycle = "1") {
  return [
    "--acceptance",
    "acceptance.md",
    "--manifest",
    manifestPath,
    "--cycle",
    cycle,
  ];
}

function reviewerResult(manifestPath) {
  return [
    "UI_REVIEW_STATUS=PASS",
    "REVIEW_CYCLE=1",
    "INDEPENDENT_CONTEXT=YES",
    "REVIEW_ONLY_AUTHORITY=YES",
    "ROUTES_REVIEWED=/beheer",
    "STATES_REVIEWED=unauthenticated operator login surface",
    "VIEWPORTS_REVIEWED=desktop 1440x900",
    "BROWSER_MECHANISM=Artifact evidence; no live browser opened or controlled",
    `EVIDENCE_MANIFEST=${manifestPath}`,
    "SCREENSHOT_EVIDENCE=desktop-1440x900.png",
    "CONSOLE_RUNTIME_EVIDENCE=0 console errors; 0 runtime errors",
    "FINDINGS=NONE",
    "UNREVIEWED=NONE",
    "PRODUCT_CODE_MODIFIED=NO",
    "HUMAN_FINAL_ACCEPTANCE_REQUIRED=YES",
    "STOP_TO_HUMAN=NO",
    "",
  ].join("\n");
}

function collectorArgs() {
  return [
    "--base-url",
    "http://127.0.0.1:5175",
    "--route",
    "/beheer",
    "--state",
    "unauthenticated operator login surface",
    "--review-id",
    "ui-review03-proof",
    "--ready-selector",
    "form.account-form",
    "--viewport",
    "desktop:1440x900",
    "--viewport",
    "narrow:820x1180",
  ];
}

function fakeBrowser() {
  const captures = [];
  let closed = false;
  return {
    captures,
    get closed() {
      return closed;
    },
    async newContext({ viewport }) {
      return {
        async route() {},
        async newPage() {
          return {
            on() {},
            async goto(url) {
              this.finalUrl = url.replace(
                "/beheer",
                "/inloggen?returnTo=%2Fbeheer",
              );
            },
            async waitForSelector() {},
            async waitForFunction() {},
            async waitForTimeout() {},
            url() {
              return this.finalUrl;
            },
            async screenshot({ path }) {
              writeFileSync(path, Buffer.from("png-evidence"));
              captures.push({ path, viewport });
            },
            async evaluate() {
              return {
                clientWidth: viewport.width,
                clientHeight: viewport.height,
                scrollWidth: viewport.width,
                scrollHeight: viewport.height,
              };
            },
          };
        },
        async close() {},
      };
    },
    async close() {
      closed = true;
    },
  };
}

function assertSkillFrontmatter(source, name) {
  const frontmatter = source.match(/^---\n([\s\S]+?)\n---\n/);
  assert.ok(frontmatter, `${name} frontmatter missing`);
  assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, "m"));
  assert.match(frontmatter[1], /^description: .+$/m);
}

test("user-global generic core is project-agnostic and repo adapter stays local", () => {
  const core = readFileSync(GENERIC_REVIEWER_CORE, "utf8");
  const adapter = readFileSync(
    join(REPOSITORY_ROOT, ENVAL_REVIEW_ADAPTER),
    "utf8",
  );
  assert.equal(
    GENERIC_REVIEWER_CORE,
    join(
      homedir(),
      ".agents/skills/independent-ui-review/SKILL.md",
    ),
  );
  assert.equal(
    existsSync(
      join(
        REPOSITORY_ROOT,
        ".agents/skills/independent-ui-review/SKILL.md",
      ),
    ),
    false,
  );
  assertSkillFrontmatter(core, "independent-ui-review");
  assertSkillFrontmatter(adapter, "enval-ui-review");
  assert.doesNotMatch(
    core,
    /ENVAL|Daan|SurfaceShell|\/beheer|5175|enval-local-dev|scripts\/tools/,
  );
  assert.match(core, /fresh review-only Codex session/);
  assert.match(core, /validated evidence\s+manifest/);
  assert.match(core, /do not require or\s+attempt live browser control/);
  assert.match(core, /There are at most two review\/fix cycles/);
  for (
    const genericSection of [
      "## Evidence boundary",
      "## Review method",
      "## Review-only authority",
      "## Independence lifecycle",
      "## Result contract",
    ]
  ) assert.doesNotMatch(adapter, new RegExp(genericSection));
  for (
    const expected of [
      "SurfaceShell",
      "desktop/tablet-first",
      "Powered by ENVAL",
      "capabilities",
      "inline CSS",
      "project-owned browser collector",
      "Daan retains final browser and product acceptance",
    ]
  ) assert.match(adapter, new RegExp(expected.replace("/", "\\/")));
});

test("collector request accepts only explicit loopback routes and viewports", () => {
  const request = parseCollectorRequest(collectorArgs());
  assert.equal(request.baseUrl, "http://127.0.0.1:5175");
  assert.equal(request.route, "/beheer");
  assert.deepEqual(request.viewports, [
    { name: "desktop", width: 1440, height: 900 },
    { name: "narrow", width: 820, height: 1180 },
  ]);

  const remote = collectorArgs();
  remote[1] = "https://example.com";
  assert.throws(() => parseCollectorRequest(remote), {
    name: "BrowserEvidenceError",
    code: "base_url_not_loopback_origin",
  });
  const duplicate = [...collectorArgs(), "--viewport", "desktop:1024x768"];
  assert.throws(() => parseCollectorRequest(duplicate), {
    name: "BrowserEvidenceError",
    code: "viewport_name_duplicate",
  });
});

test("collector uses guarded readiness and writes bounded read-only evidence", async () => {
  const root = projectFixture();
  const browser = fakeBrowser();
  const events = [];
  const result = await collectBrowserEvidence(collectorArgs(), {
    root,
    artifactRoot: root,
    now: () => new Date("2026-09-03T10:00:00.000Z"),
    run(command, args) {
      events.push({ command, args });
      return { status: 0, stdout: "LOCAL_READY=PASS\n", stderr: "" };
    },
    launch: async (options) => {
      assert.deepEqual(options, { headless: true });
      return browser;
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
        "http://127.0.0.1:5175",
      ],
    },
  ]);
  assert.equal(result.manifest.collectorResult, "PASS");
  assert.equal(result.manifest.productWriteRequests.count, 0);
  assert.equal(result.manifest.productWriteRequests.blocked, true);
  assert.equal(result.manifest.viewports.length, 2);
  assert.equal(
    result.manifest.viewports[0].finalUrl.includes("/inloggen"),
    true,
  );
  assert.equal(browser.captures.length, 2);
  assert.equal(browser.closed, true);
  assert.equal(
    readFileSync(result.manifestPath, "utf8").includes("Bearer"),
    false,
  );
});

test("collector stops before browser launch when guarded readiness fails", async () => {
  let launched = false;
  await assert.rejects(
    () =>
      collectBrowserEvidence(collectorArgs(), {
        root: projectFixture(),
        artifactRoot: temporaryRoot(),
        run: () => ({ status: 1, stdout: "", stderr: "LOCAL_READY=FAIL\n" }),
        launch: async () => {
          launched = true;
          return fakeBrowser();
        },
      }),
    (error) =>
      error instanceof BrowserEvidenceError &&
      error.code === "local_review_readiness_failed",
  );
  assert.equal(launched, false);
});

test("review request requires a passing temporary manifest and screenshot", () => {
  const root = projectFixture();
  const manifestPath = manifestFixture(root);
  const request = parseReviewRequest(reviewerArgs(manifestPath), root);
  assert.equal(request.cycle, 1);
  assert.equal(request.evidence.route, "/beheer");
  assert.equal(request.evidence.viewports[0].width, 1440);

  const failedRoot = projectFixture();
  const failedManifest = manifestFixture(failedRoot, {
    collectorResult: "FAIL",
  });
  assert.throws(
    () => parseReviewRequest(reviewerArgs(failedManifest), failedRoot),
    { name: "UiReviewLaunchError", code: "evidence_manifest_invalid" },
  );
  assert.throws(
    () => parseReviewRequest(reviewerArgs(manifestPath, "3"), root),
    {
      name: "UiReviewLaunchError",
      code: "review_cycle_invalid",
    },
  );
});

test("launcher attaches screenshots to a fresh read-only browser-disabled Codex exec", () => {
  const root = projectFixture();
  const request = parseReviewRequest(
    reviewerArgs(manifestFixture(root), "2"),
    root,
  );
  const launch = buildReviewerArgv(root, request);
  assert.equal(launch.cwd, root);
  assert.ok(launch.args.includes("--ephemeral"));
  assert.ok(launch.args.includes("read-only"));
  assert.ok(launch.args.includes('web_search="disabled"'));
  assert.ok(launch.args.includes("--image"));
  assert.ok(launch.args.includes("browser_use"));
  assert.ok(launch.args.includes("computer_use"));
  assert.ok(launch.args.includes("in_app_browser"));
  assert.ok(!launch.args.includes("resume"));
  assert.ok(!launch.args.includes("fork"));
  assert.ok(!launch.args.includes("--approve-for-me"));
  assert.ok(!launch.args.includes("danger-full-access"));
  assert.ok(
    !launch.args.includes("--dangerously-bypass-approvals-and-sandbox"),
  );
  assert.match(launch.prompt, /Artifact-evidence mode is mandatory/);
  assert.match(launch.prompt, /Do not open or control a live browser/);
  assert.match(launch.prompt, /cycle 2/);
  assert.match(launch.prompt, /STOP_TO_HUMAN=YES/);
  assert.equal(launch.args.includes(launch.prompt), false);
  assert.equal(MAX_REVIEW_FIX_CYCLES, 2);
});

test("installed Codex CLI parses the generated artifact reviewer option order", () => {
  const root = projectFixture();
  const request = parseReviewRequest(reviewerArgs(manifestFixture(root)), root);
  const launch = buildReviewerArgv(root, request);
  const result = spawnSync(
    "codex",
    [...launch.args, "--help"],
    { cwd: root, encoding: "utf8", shell: false },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Run Codex non-interactively$/m);
});

test("dry run proves artifact launch contract without starting a reviewer", async () => {
  const root = projectFixture();
  const manifestPath = manifestFixture(root);
  let launched = false;
  const result = await startUiReview(
    [...reviewerArgs(manifestPath), "--dry-run"],
    {
      root,
      launch: async () => {
        launched = true;
        return 0;
      },
    },
  );
  assert.equal(launched, false);
  assert.equal(result.exitCode, null);
  assert.equal(result.launchRequest.cwd, root);
});

test("real launch requires a reviewer result artifact", async () => {
  const root = projectFixture();
  const manifestPath = manifestFixture(root);
  const result = await startUiReview(reviewerArgs(manifestPath), {
    root,
    launch: async ({ resultPath }) => {
      writeFileSync(resultPath, reviewerResult(manifestPath));
      return 0;
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.reviewResult.UI_REVIEW_STATUS, "PASS");
  assert.match(
    readFileSync(result.launchRequest.resultPath, "utf8"),
    /UI_REVIEW_STATUS=PASS/,
  );
});

test("real launch rejects an incomplete reviewer result contract", async () => {
  const root = projectFixture();
  const manifestPath = manifestFixture(root);
  await assert.rejects(
    () =>
      startUiReview(reviewerArgs(manifestPath), {
        root,
        launch: async ({ resultPath }) => {
          writeFileSync(resultPath, "UI_REVIEW_STATUS=PASS\n");
          return 0;
        },
      }),
    (error) =>
      error instanceof UiReviewLaunchError &&
      error.code === "review_result_contract_invalid",
  );
});
