import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

import {
  BrowserEvidenceError,
  collectBrowserEvidence,
  parseCollectorRequest,
} from "../tools/enval-ui-review-collect.mjs";

const REPOSITORY_ROOT = realpathSync(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const temporaryRoots = [];

after(() => {
  for (const root of temporaryRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "enval-ui-review-collect-proof-"));
  temporaryRoots.push(root);
  return realpathSync(root);
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

test("collector request accepts only explicit loopback routes and viewports", () => {
  const source = readFileSync(
    new URL("../tools/enval-ui-review-collect.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /enval-(?:batch|result|ui-review)\.mjs/);

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
  const root = temporaryRoot();
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
        root: temporaryRoot(),
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
