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

import { CODEX_UPDATE_OVERRIDE } from "../tools/enval-batch.mjs";
import {
  BrowserEvidenceError,
  collectBrowserEvidence,
  EVIDENCE_SCHEMA_VERSION,
  parseCollectorRequest,
} from "../tools/enval-ui-review-collect.mjs";
import {
  buildReviewerArgv,
  buildReviewRequest,
  DEFAULT_MAX_REVIEW_FIX_CYCLES,
  ENVAL_REVIEW_ADAPTER,
  GENERIC_REVIEWER_CORE,
  HARD_MAX_REVIEW_FIX_CYCLES,
  startUiReview,
  UiReviewLaunchError,
} from "../tools/enval-ui-review.mjs";
import {
  applyFixResult,
  applyReviewResult,
  createBatchState,
  formatFinalOutcome,
  HERDR_TABS,
  launchReviewerInHerdr,
  runAutonomousReviewLoop,
  UiReviewLoopError,
} from "../tools/enval-ui-review-loop.mjs";

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

function implementationResult(summary = "implementation green") {
  return {
    status: "PASS",
    summary,
    checks: [{ name: "targeted", status: "PASS", evidence: "fixture proof" }],
  };
}

function batchState(root, overrides = {}) {
  return createBatchState({
    batchId: "ui-review04-proof",
    acceptance: "acceptance.md",
    implementationContextId: "implementation-proof-context",
    changedFiles: ["apps/web/src/proof.tsx"],
    implementationResult: implementationResult(),
    browserEvidenceManifest: manifestFixture(root),
    ...overrides,
  });
}

function finding(id = "UIR-001") {
  return {
    id,
    severity: "medium",
    route: "/beheer",
    state: "unauthenticated operator login surface",
    viewport: "desktop 1440x900",
    evidenceReference: "desktop-1440x900.png",
    text: "Align the observed control with the supplied acceptance.",
  };
}

function reviewerResultFromPrompt(prompt, verdict = "PASS") {
  const reviewNumber = Number(prompt.match(/Review: ([0-9]+)/)?.[1]);
  const reviewContextId = prompt.match(/echo exactly: ([^\n]+)/)?.[1];
  return {
    schemaVersion: 1,
    verdict,
    reviewNumber,
    reviewContextId,
    independentContext: true,
    reviewOnlyAuthority: true,
    findings: verdict === "PASS" ? [] : [finding()],
    unreviewed: [],
    productCodeModified: false,
    humanFinalAcceptanceRequired: true,
  };
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
      command: process.execPath,
      args: [
        join(REPOSITORY_ROOT, "scripts/tools/enval-local-dev.mjs"),
        "--operation",
        "ready",
        "--vite-url",
        "http://127.0.0.1:5175",
        "--source-root",
        root,
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

test("review request includes all machine-readable handoff evidence", () => {
  const root = projectFixture();
  const state = batchState(root);
  const request = buildReviewRequest(state, root);
  assert.equal(request.reviewNumber, 1);
  assert.equal(request.maxFixCycles, DEFAULT_MAX_REVIEW_FIX_CYCLES);
  assert.deepEqual(request.changedFiles, ["apps/web/src/proof.tsx"]);
  assert.equal(request.implementationResult.status, "PASS");
  assert.equal(request.evidence.route, "/beheer");
  assert.equal(request.evidence.viewports[0].width, 1440);

  const failedRoot = projectFixture();
  const failedState = batchState(failedRoot);
  manifestFixture(failedRoot, { collectorResult: "FAIL" });
  assert.throws(
    () => buildReviewRequest(failedState, failedRoot),
    { name: "UiReviewLaunchError", code: "evidence_manifest_invalid" },
  );
});

test("launcher creates a fresh structured read-only reviewer invocation", () => {
  const root = projectFixture();
  const request = buildReviewRequest(batchState(root), root);
  const launch = buildReviewerArgv(root, request);
  assert.equal(launch.cwd, root);
  for (
    const value of [
      "--ephemeral",
      "read-only",
      CODEX_UPDATE_OVERRIDE,
      'web_search="disabled"',
      "--image",
      "--output-schema",
      "browser_use",
      "computer_use",
      "in_app_browser",
    ]
  ) assert.ok(launch.args.includes(value), value);
  for (
    const value of [
      "resume",
      "fork",
      "--approve-for-me",
      "danger-full-access",
      "--dangerously-bypass-approvals-and-sandbox",
    ]
  ) assert.equal(launch.args.includes(value), false, value);
  assert.match(launch.prompt, /Artifact-evidence mode is mandatory/);
  assert.match(launch.prompt, /Changed files:/);
  assert.match(launch.prompt, /Implementation result:/);
  assert.match(launch.prompt, /Prior reviewer findings:/);
  assert.match(launch.prompt, /stable IDs/i);
  assert.equal(DEFAULT_MAX_REVIEW_FIX_CYCLES, 4);
  assert.equal(HARD_MAX_REVIEW_FIX_CYCLES, 5);
});

test("Herdr launch routes each ephemeral reviewer into the Reviewer tab", async () => {
  const calls = [];
  const invocation = "00000000-0000-4000-8000-000000000004";
  const run = (command, args) => {
    calls.push({ command, args });
    const operation = args.slice(2, 4).join(" ");
    if (operation === "tab list") {
      return {
        status: 0,
        stdout: JSON.stringify({
          result: {
            type: "tab_list",
            tabs: [
              { tab_id: "w4:t1", label: "Codex" },
              { tab_id: "w4:t2", label: "Terminal" },
              { tab_id: "w4:t3", label: "Reviewer" },
            ],
          },
        }),
      };
    }
    if (operation === "pane list") {
      return {
        status: 0,
        stdout: JSON.stringify({
          result: {
            type: "pane_list",
            panes: [
              { pane_id: "w4:p1", tab_id: "w4:t1" },
              { pane_id: "w4:p2", tab_id: "w4:t2" },
              { pane_id: "w4:p3", tab_id: "w4:t3" },
            ],
          },
        }),
      };
    }
    if (operation === "pane run") {
      assert.equal(args[4], "w4:p3");
      assert.match(args[5], /'codex' '--ephemeral'/);
      assert.match(
        args[5],
        /ENVAL_REVIEW_DONE_00000000-0000-4000-8000-000000000004/,
      );
      return { status: 0, stdout: "" };
    }
    if (operation === "pane wait-output") {
      return {
        status: 0,
        stdout: JSON.stringify({
          result: {
            type: "output_matched",
            matched_line: `ENVAL_REVIEW_DONE_${invocation}=0`,
          },
        }),
      };
    }
    assert.fail(`unexpected command: ${command} ${args.join(" ")}`);
  };
  try {
    const status = await launchReviewerInHerdr(
      { args: ["--ephemeral"], cwd: REPOSITORY_ROOT, prompt: "review proof" },
      {
        env: {
          HERDR_ENV: "1",
          HERDR_SESSION: "ENVAL",
          HERDR_WORKSPACE_ID: "w4",
        },
        run,
        uuid: () => invocation,
      },
    );
    assert.equal(status, 0);
    assert.equal(calls.filter((call) => call.args.includes("w4:p3")).length, 2);
    const waitCall = calls.find((call) =>
      call.args.slice(2, 4).join(" ") === "pane wait-output"
    );
    assert.equal(waitCall.args.includes("--match"), false);
    assert.match(
      waitCall.args[waitCall.args.indexOf("--regex") + 1],
      /=\[0-9\]\+\$$/,
    );
  } finally {
    rmSync(join(tmpdir(), `enval-ui-review-prompt-${invocation}.txt`), {
      force: true,
    });
  }
});

test("installed Codex CLI parses the structured reviewer option order", () => {
  const root = projectFixture();
  mkdirSync(join(root, "scripts/tools"), { recursive: true });
  writeFileSync(
    join(root, "scripts/tools/enval-ui-review-result.schema.json"),
    '{"type":"object"}\n',
  );
  const launch = buildReviewerArgv(
    root,
    buildReviewRequest(batchState(root), root),
  );
  const result = spawnSync("codex", [...launch.args, "--help"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Run Codex non-interactively$/m);
});

test("review result schema gives every const and enum an explicit type", () => {
  const schema = JSON.parse(
    readFileSync(
      join(REPOSITORY_ROOT, "scripts/tools/enval-ui-review-result.schema.json"),
      "utf8",
    ),
  );
  function inspect(value) {
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "const") || Object.hasOwn(value, "enum")) {
      assert.equal(typeof value.type, "string");
    }
    for (const child of Object.values(value)) inspect(child);
  }
  inspect(schema);
});

test("real launch validates the structured reviewer result", async () => {
  const root = projectFixture();
  mkdirSync(join(root, "scripts/tools"), { recursive: true });
  writeFileSync(
    join(root, "scripts/tools/enval-ui-review-result.schema.json"),
    '{"type":"object"}\n',
  );
  const result = await startUiReview(batchState(root), {
    root,
    launch: async ({ resultPath, prompt }) => {
      writeFileSync(
        resultPath,
        JSON.stringify(reviewerResultFromPrompt(prompt)),
      );
      return 0;
    },
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.reviewResult.verdict, "PASS");

  await assert.rejects(
    () =>
      startUiReview(batchState(root), {
        root,
        launch: async ({ resultPath }) => {
          writeFileSync(resultPath, '{"verdict":"PASS"}\n');
          return 0;
        },
      }),
    (error) =>
      error instanceof UiReviewLaunchError &&
      error.code === "review_result_contract_invalid",
  );
});

function loopReview(state, verdict = "PASS") {
  return {
    verdict,
    reviewNumber: state.reviewNumber,
    reviewContextId: `fresh-review-${state.reviewNumber}`,
    findings: verdict === "PASS"
      ? []
      : [finding(`UIR-00${state.reviewNumber}`)],
  };
}

function loopFix(state, overrides = {}) {
  return {
    implementationContextId: state.implementationContextId,
    strategy: `strategy-${state.completedFixCycles + 1}`,
    hypothesis: `hypothesis-${state.completedFixCycles + 1}`,
    changedFiles: state.changedFiles,
    implementationResult: implementationResult("fix green"),
    browserEvidenceManifest: state.browserEvidenceManifest,
    ...overrides,
  };
}

test("PASS stops immediately with no fix or later review", async () => {
  const root = projectFixture();
  let reviews = 0;
  let fixes = 0;
  const result = await runAutonomousReviewLoop(batchState(root), {
    review: async (state) => {
      reviews += 1;
      return loopReview(state, "PASS");
    },
    fix: async () => {
      fixes += 1;
      assert.fail("fix must not run after PASS");
    },
  });
  assert.equal(result.outcome, "PASS");
  assert.equal(reviews, 1);
  assert.equal(fixes, 0);
  const outcome = formatFinalOutcome(result);
  for (
    const expected of [
      "AUTOMATIC_IMPLEMENTATION_REVIEW_HANDOFF=YES",
      "MANUAL_DAAN_RELAY_REQUIRED=NO",
      "INDEPENDENT_REVIEW_EACH_PASS=YES",
      "PASS_STOPS_IMMEDIATELY=YES",
      "HERDR_TABS=Codex,Terminal,Reviewer",
      "REVIEWER_TAB_MANUAL_ROUTING_REQUIRED=NO",
    ]
  ) assert.match(outcome, new RegExp(expected));
  assert.throws(() => applyReviewResult(result, loopReview(result)), {
    name: "UiReviewLoopError",
    code: "review_not_allowed_in_phase",
  });
});

test("FAIL routes to the same implementation context then PASS stops", async () => {
  const root = projectFixture();
  const contexts = [];
  const result = await runAutonomousReviewLoop(batchState(root), {
    review: async (state) =>
      loopReview(
        state,
        state.reviewNumber === 1 ? "FAIL" : "PASS",
      ),
    fix: async (state) => {
      contexts.push(state.implementationContextId);
      assert.deepEqual(state.activeFindings.map((item) => item.id), [
        "UIR-001",
      ]);
      return loopFix(state);
    },
  });
  assert.equal(result.outcome, "PASS");
  assert.equal(result.reviewInvocations.length, 2);
  assert.equal(result.completedFixCycles, 1);
  assert.deepEqual(contexts, ["implementation-proof-context"]);
});

test("four fixes receive one final review and unresolved FAIL becomes PARTIAL", async () => {
  const root = projectFixture();
  const result = await runAutonomousReviewLoop(batchState(root), {
    review: async (state) => loopReview(state, "FAIL"),
    fix: async (state) => loopFix(state),
  });
  assert.equal(result.outcome, "PARTIAL");
  assert.equal(result.completedFixCycles, 4);
  assert.equal(result.reviewInvocations.length, 5);
  assert.equal(result.stopReason.type, "MAX_REVIEW_FIX_CYCLES");
  assert.match(formatFinalOutcome(result), /FINAL_REVIEW_AFTER_FIX4=YES/);
});

test("human/material stops and Loop Guard stop before another review", async () => {
  const root = projectFixture();
  for (const type of ["HUMAN_GATE", "MATERIAL_DECISION"]) {
    let reviews = 0;
    const result = await runAutonomousReviewLoop(
      batchState(root, {
        stopCondition: { type, detail: "proof stop" },
      }),
      {
        review: async () => {
          reviews += 1;
          assert.fail("review must not run after early stop");
        },
        fix: async () => assert.fail("fix must not run after early stop"),
      },
    );
    assert.equal(result.outcome, "PARTIAL");
    assert.equal(result.stopReason.type, type);
    assert.equal(reviews, 0);
  }

  const failed = applyReviewResult(
    batchState(root),
    loopReview(batchState(root), "FAIL"),
  );
  const stoppedDuringFix = applyFixResult(failed, {
    implementationContextId: failed.implementationContextId,
    stopCondition: { type: "HUMAN_GATE", detail: "approval required" },
  });
  assert.equal(stoppedDuringFix.outcome, "PARTIAL");
  assert.equal(stoppedDuringFix.reviewInvocations.length, 1);
  assert.equal(stoppedDuringFix.completedFixCycles, 0);

  let state = applyReviewResult(
    batchState(root),
    loopReview(batchState(root), "FAIL"),
  );
  for (let attempt = 0; attempt < 3; attempt += 1) {
    state = applyFixResult(
      state,
      loopFix(state, {
        strategy: "same strategy",
        hypothesis: "same hypothesis",
      }),
    );
    if (attempt < 2) {
      state = applyReviewResult(state, loopReview(state, "FAIL"));
    }
  }
  assert.equal(state.outcome, "PARTIAL");
  assert.equal(state.stopReason.type, "LOOP_GUARD");
  assert.equal(state.reviewInvocations.length, 3);
});

test("CLI init reports a COMPLETE stop without READY_FOR_REVIEW", () => {
  const root = projectFixture();
  const requestPath = join(root, "request.json");
  const statePath = join(root, "state.json");
  writeFileSync(
    requestPath,
    `${
      JSON.stringify({
        batchId: "complete-init-proof",
        acceptance: "acceptance.md",
        implementationContextId: "implementation-proof-context",
        changedFiles: ["scripts/tools/enval-ui-review-loop.mjs"],
        implementationResult: implementationResult(),
        browserEvidenceManifest: manifestFixture(root),
        stopCondition: { type: "HUMAN_GATE", detail: "proof stop" },
      })
    }\n`,
  );
  const result = spawnSync(
    "node",
    [
      "scripts/tools/enval-ui-review-loop.mjs",
      "init",
      "--request",
      requestPath,
      "--state",
      statePath,
    ],
    { cwd: REPOSITORY_ROOT, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /UI_REVIEW04_STATUS=PARTIAL/);
  assert.doesNotMatch(result.stdout, /READY_FOR_REVIEW/);
  assert.equal(JSON.parse(readFileSync(statePath, "utf8")).phase, "COMPLETE");
});

test("hard maximum five requires explicit authorization", () => {
  const root = projectFixture();
  assert.throws(() => batchState(root, { maxFixCycles: 5 }), {
    name: "UiReviewLoopError",
    code: "review_fix_cycle_limit_invalid",
  });
  const state = batchState(root, { maxFixCycles: 5, hardMaxExplicit: true });
  assert.equal(state.maxFixCycles, 5);
  assert.deepEqual(HERDR_TABS, ["Codex", "Terminal", "Reviewer"]);
});
