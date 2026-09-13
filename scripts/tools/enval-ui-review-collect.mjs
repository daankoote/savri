#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  PrimaryRuntimeError,
  resolvePrimaryRuntime,
} from "./enval-primary-runtime.mjs";

export const ENVAL_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const EVIDENCE_SCHEMA_VERSION = "enval_ui_review_evidence_v1";

const LOCAL_READINESS_TOOL = join(
  ENVAL_ROOT,
  "scripts/tools/enval-local-dev.mjs",
);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);
const TEXT_VALUE_PATTERN = /^[^\r\n]{1,240}$/;
const REVIEW_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const VIEWPORT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const CAPTURE_TIMEOUT_MS = 15_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class BrowserEvidenceError extends Error {
  constructor(code) {
    super(code);
    this.name = "BrowserEvidenceError";
    this.code = code;
  }
}

function fail(code) {
  throw new BrowserEvidenceError(code);
}

function pathInside(root, path) {
  const child = relative(root, path);
  return child !== "" && child !== ".." && !child.startsWith(`..${sep}`) &&
    !child.startsWith(sep);
}

function regularDirectory(path, code) {
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) fail(code);
}

function checkedText(value, code) {
  if (typeof value !== "string" || !TEXT_VALUE_PATTERN.test(value)) fail(code);
  return value;
}

function loopbackBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail("base_url_invalid");
  }
  if (
    url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname) ||
    url.username !== "" || url.password !== "" || url.search !== "" ||
    url.hash !== "" || url.pathname !== "/"
  ) fail("base_url_not_loopback_origin");
  return url.origin;
}

function reviewRoute(value, baseUrl) {
  checkedText(value, "route_invalid");
  if (!value.startsWith("/") || value.startsWith("//")) fail("route_invalid");
  const url = new URL(value, baseUrl);
  if (url.origin !== baseUrl) fail("route_outside_base_url");
  return `${url.pathname}${url.search}${url.hash}`;
}

function viewport(value) {
  checkedText(value, "viewport_invalid");
  const match = value.match(/^([a-z][a-z0-9_-]{0,31}):(\d{3,4})x(\d{3,4})$/);
  if (!match || !VIEWPORT_NAME_PATTERN.test(match[1])) fail("viewport_invalid");
  const width = Number(match[2]);
  const height = Number(match[3]);
  if (width < 320 || width > 2560 || height < 480 || height > 1800) {
    fail("viewport_invalid");
  }
  return Object.freeze({ name: match[1], width, height });
}

export function parseCollectorRequest(argv) {
  const values = { viewports: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (value === undefined) fail("argument_value_missing");
    index += 1;
    if (argument === "--base-url") values.baseUrl = value;
    else if (argument === "--route") values.route = value;
    else if (argument === "--state") values.state = value;
    else if (argument === "--review-id") values.reviewId = value;
    else if (argument === "--ready-selector") values.readySelector = value;
    else if (argument === "--viewport") values.viewports.push(value);
    else fail("argument_unknown");
  }
  if (!values.baseUrl) fail("base_url_required");
  if (!values.route) fail("route_required");
  if (!values.state) fail("state_required");
  if (!values.reviewId || !REVIEW_ID_PATTERN.test(values.reviewId)) {
    fail("review_id_invalid");
  }
  if (!values.readySelector) fail("ready_selector_required");
  if (values.viewports.length === 0) fail("viewport_required");

  const baseUrl = loopbackBaseUrl(values.baseUrl);
  const viewports = values.viewports.map(viewport);
  if (new Set(viewports.map(({ name }) => name)).size !== viewports.length) {
    fail("viewport_name_duplicate");
  }
  return Object.freeze({
    baseUrl,
    route: reviewRoute(values.route, baseUrl),
    state: checkedText(values.state, "state_invalid"),
    reviewId: values.reviewId,
    readySelector: checkedText(values.readySelector, "ready_selector_invalid"),
    viewports: Object.freeze(viewports),
  });
}

function defaultRun(command, args, options) {
  return spawnSync(command, args, {
    ...options,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
  });
}

async function launchPrimaryPlaywright(root, launchOptions) {
  try {
    const runtime = resolvePrimaryRuntime(root);
    const playwright = await import(
      pathToFileURL(join(runtime.rootNodeModules, "playwright/index.mjs")).href
    );
    return await playwright.chromium.launch(launchOptions);
  } catch (error) {
    if (error instanceof PrimaryRuntimeError) fail(error.code);
    throw error;
  }
}

function inspectLocalReviewReadiness(baseUrl, root, run) {
  const result = run(
    process.execPath,
    [
      LOCAL_READINESS_TOOL,
      "--operation",
      "ready",
      "--vite-url",
      baseUrl,
      "--source-root",
      root,
    ],
    { cwd: root },
  );
  if (
    result.error || result.status !== 0 ||
    !/^LOCAL_READY=PASS$/m.test(String(result.stdout ?? ""))
  ) fail("local_review_readiness_failed");
}

function checkedArtifactRoot(candidate) {
  const temporaryRoot = realpathSync(tmpdir());
  const artifactRoot = realpathSync(resolve(candidate));
  regularDirectory(artifactRoot, "artifact_root_invalid");
  if (!pathInside(temporaryRoot, artifactRoot)) {
    fail("artifact_root_not_temporary");
  }
  return artifactRoot;
}

function isLoopbackRequest(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  return ["data:", "blob:", "about:"].includes(url.protocol) ||
    (["http:", "https:"].includes(url.protocol) &&
      LOOPBACK_HOSTS.has(url.hostname));
}

function safeLocation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!LOOPBACK_HOSTS.has(url.hostname)) return "external";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "unknown";
  }
}

function summaryCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([summary, count]) => ({ summary, count }));
}

function errorKind(error) {
  const name = typeof error?.name === "string" ? error.name : "Error";
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : "Error";
}

function safeFailureDetail(value) {
  return String(value ?? "failure")
    .replace(/[^\s@]+@[^\s@]+/g, "[address]")
    .replace(/(?:Password|password)\s*[:=]\s*\S+/g, "password=[redacted]")
    .split(/\r?\n/, 1)[0]
    .slice(0, 240);
}

async function captureViewport(browser, request, artifactRoot, viewportSpec) {
  const consoleEvents = [];
  const runtimeEvents = [];
  const unsafeRequests = [];
  const context = await browser.newContext({
    viewport: { width: viewportSpec.width, height: viewportSpec.height },
  });
  try {
    await context.route("**/*", async (route) => {
      const browserRequest = route.request();
      const method = browserRequest.method().toUpperCase();
      const url = browserRequest.url();
      if (!isLoopbackRequest(url)) {
        runtimeEvents.push(`blocked_external_request:${safeLocation(url)}`);
        await route.abort("blockedbyclient");
        return;
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        unsafeRequests.push(`${method}:${safeLocation(url)}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      consoleEvents.push(`console_error:${safeLocation(location.url ?? "")}`);
    });
    page.on("pageerror", (error) => {
      runtimeEvents.push(`page_error:${errorKind(error)}`);
    });
    page.on("requestfailed", (failedRequest) => {
      const failure = failedRequest.failure()?.errorText ?? "request_failed";
      runtimeEvents.push(
        `request_failed:${failedRequest.method()}:${
          safeLocation(failedRequest.url())
        }:${failure === "net::ERR_BLOCKED_BY_CLIENT" ? "blocked" : "failed"}`,
      );
    });

    await page.goto(new URL(request.route, request.baseUrl).href, {
      waitUntil: "domcontentloaded",
      timeout: CAPTURE_TIMEOUT_MS,
    });
    await page.waitForSelector(request.readySelector, {
      state: "visible",
      timeout: CAPTURE_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () => !document.fonts || document.fonts.status === "loaded",
      null,
      { timeout: CAPTURE_TIMEOUT_MS },
    );
    await page.waitForTimeout(250);

    const finalUrl = page.url();
    const parsedFinalUrl = new URL(finalUrl);
    if (
      parsedFinalUrl.protocol !== "http:" ||
      !LOOPBACK_HOSTS.has(parsedFinalUrl.hostname)
    ) fail("final_url_not_loopback");

    const screenshotName =
      `${viewportSpec.name}-${viewportSpec.width}x${viewportSpec.height}.png`;
    const screenshotPath = join(artifactRoot, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const documentMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    return Object.freeze({
      name: viewportSpec.name,
      width: viewportSpec.width,
      height: viewportSpec.height,
      finalUrl,
      screenshotPath: basename(screenshotPath),
      documentMetrics,
      consoleErrors: Object.freeze({
        count: consoleEvents.length,
        summaries: Object.freeze(summaryCounts(consoleEvents)),
      }),
      runtimeErrors: Object.freeze({
        count: runtimeEvents.length,
        summaries: Object.freeze(summaryCounts(runtimeEvents)),
      }),
      unsafeRequests: Object.freeze({
        count: unsafeRequests.length,
        summaries: Object.freeze(summaryCounts(unsafeRequests)),
      }),
      result: unsafeRequests.length === 0 ? "PASS" : "FAIL",
    });
  } finally {
    await context.close();
  }
}

export async function collectBrowserEvidence(argv, options = {}) {
  const root = realpathSync(
    resolve(
      options.root ?? process.env.ENVAL_PREVIEW_SOURCE_ROOT ?? ENVAL_ROOT,
    ),
  );
  const request = parseCollectorRequest(argv);
  inspectLocalReviewReadiness(request.baseUrl, root, options.run ?? defaultRun);
  const artifactRoot = checkedArtifactRoot(
    options.artifactRoot ?? mkdtempSync(join(tmpdir(), "enval-ui-review-")),
  );
  const launch = options.launch ??
    ((launchOptions) => launchPrimaryPlaywright(root, launchOptions));
  const browser = await launch({ headless: true });
  const captures = [];
  try {
    for (const viewportSpec of request.viewports) {
      captures.push(
        await captureViewport(browser, request, artifactRoot, viewportSpec),
      );
    }
  } finally {
    await browser.close();
  }

  const consoleErrors = captures.flatMap((capture) =>
    Array.from({ length: capture.consoleErrors.count }, () => "console_error")
  );
  const runtimeErrors = captures.flatMap((capture) =>
    Array.from({ length: capture.runtimeErrors.count }, () => "runtime_error")
  );
  const collectorResult = captures.every((capture) => capture.result === "PASS")
    ? "PASS"
    : "FAIL";
  const manifest = Object.freeze({
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    reviewId: request.reviewId,
    route: request.route,
    state: request.state,
    requestedUrl: new URL(request.route, request.baseUrl).href,
    capturedAt: (options.now ?? (() => new Date()))().toISOString(),
    browserAutomationMechanism: "Playwright Chromium",
    collectorResult,
    viewports: Object.freeze(captures),
    consoleErrors: Object.freeze({ count: consoleErrors.length }),
    runtimeErrors: Object.freeze({ count: runtimeErrors.length }),
    productWriteRequests: Object.freeze({
      count: captures.reduce(
        (total, capture) => total + capture.unsafeRequests.count,
        0,
      ),
      blocked: true,
    }),
  });
  const manifestPath = join(artifactRoot, "evidence-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze({ artifactRoot, manifest, manifestPath, request });
}

function privateFixtureFile(path, code) {
  const temporaryRoot = realpathSync(tmpdir());
  const privateTemporaryRoot = realpathSync("/private/tmp");
  const resolvedPath = realpathSync(resolve(path));
  const status = lstatSync(resolvedPath);
  if (
    !status.isFile() || status.isSymbolicLink() ||
    (!pathInside(temporaryRoot, resolvedPath) &&
      !pathInside(privateTemporaryRoot, resolvedPath)) ||
    (status.mode & 0o077) !== 0
  ) fail(code);
  return resolvedPath;
}

function fixtureLogin(path) {
  const source = readFileSync(
    privateFixtureFile(path, "login_file_invalid"),
    "utf8",
  );
  const email = source.match(/^Email: ([^\r\n]+)$/m)?.[1] ?? "";
  const password = source.match(/^Password: ([^\r\n]+)$/m)?.[1] ?? "";
  if (
    !/^[^\s@]+@[^\s@]+$/.test(email) || password.length < 8 ||
    password.length > 240
  ) fail("login_file_invalid");
  return Object.freeze({ email, password });
}

function portalAuthorityState(path) {
  let state;
  try {
    state = JSON.parse(readFileSync(
      privateFixtureFile(path, "portal_state_invalid"),
      "utf8",
    ));
  } catch (error) {
    if (error instanceof BrowserEvidenceError) throw error;
    fail("portal_state_invalid");
  }
  const required = [
    "customerDossierId",
    "customerSecondDossierId",
    "businessDossierId",
  ];
  if (
    state?.fixtureId !== "portal-authority-v1" ||
    !required.every((field) => UUID_PATTERN.test(state[field]))
  ) fail("portal_state_invalid");
  return Object.freeze({
    businessDossierId: state.businessDossierId,
    customerDossierId: state.customerDossierId,
    customerSecondDossierId: state.customerSecondDossierId,
  });
}

function parsePortalAuthorityRequest(argv) {
  const values = { viewports: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (value === undefined) fail("argument_value_missing");
    index += 1;
    if (argument === "--base-url") values.baseUrl = value;
    else if (argument === "--review-id") values.reviewId = value;
    else if (argument === "--portal-state") values.portalState = value;
    else if (argument === "--customer-login") values.customerLogin = value;
    else if (argument === "--business-login") values.businessLogin = value;
    else if (argument === "--reviewer-login") values.reviewerLogin = value;
    else if (argument === "--admin-login") values.adminLogin = value;
    else if (argument === "--auth-only-login") values.authOnlyLogin = value;
    else if (argument === "--activation-login") values.activationLogin = value;
    else if (argument === "--viewport") values.viewports.push(value);
    else fail("argument_unknown");
  }
  if (!values.baseUrl) fail("base_url_required");
  if (!values.reviewId || !REVIEW_ID_PATTERN.test(values.reviewId)) {
    fail("review_id_invalid");
  }
  if (values.viewports.length === 0) fail("viewport_required");
  for (
    const field of [
      "portalState",
      "customerLogin",
      "businessLogin",
      "reviewerLogin",
      "adminLogin",
      "authOnlyLogin",
      "activationLogin",
    ]
  ) {
    if (!values[field]) fail("fixture_file_required");
  }
  const viewports = values.viewports.map(viewport);
  if (new Set(viewports.map(({ name }) => name)).size !== viewports.length) {
    fail("viewport_name_duplicate");
  }
  return Object.freeze({
    baseUrl: loopbackBaseUrl(values.baseUrl),
    reviewId: values.reviewId,
    viewports: Object.freeze(viewports),
    state: portalAuthorityState(values.portalState),
    logins: Object.freeze({
      activation: fixtureLogin(values.activationLogin),
      admin: fixtureLogin(values.adminLogin),
      authOnly: fixtureLogin(values.authOnlyLogin),
      business: fixtureLogin(values.businessLogin),
      customer: fixtureLogin(values.customerLogin),
      reviewer: fixtureLogin(values.reviewerLogin),
    }),
  });
}

const PORTAL_ALLOWED_POST_PATHS = new Set([
  "/auth/v1/signup",
  "/auth/v1/token",
  "/functions/v1/api-app-auth-bootstrap",
  "/functions/v1/api-app-dashboard-get",
]);
const PORTAL_EXPECTED_DENIAL_PATHS = new Set([
  "/functions/v1/api-app-auth-bootstrap",
  "/functions/v1/api-app-operator-context",
]);

function isExpectedPortalDenialConsole(message) {
  if (
    message.type() !== "error" ||
    !/^Failed to load resource: the server responded with a status of 403/.test(
      message.text(),
    )
  ) return false;
  try {
    return PORTAL_EXPECTED_DENIAL_PATHS.has(
      new URL(message.location().url).pathname,
    );
  } catch {
    return false;
  }
}

async function portalJourney(
  browser,
  request,
  artifactRoot,
  viewportSpec,
  name,
  journey,
) {
  const consoleEvents = [];
  const expectedDenialEvents = [];
  const runtimeEvents = [];
  const unexpectedRequests = [];
  const observedRequests = [];
  const context = await browser.newContext({
    viewport: { width: viewportSpec.width, height: viewportSpec.height },
  });
  try {
    await context.route("**/*", async (route) => {
      const browserRequest = route.request();
      const method = browserRequest.method().toUpperCase();
      const rawUrl = browserRequest.url();
      if (!isLoopbackRequest(rawUrl)) {
        unexpectedRequests.push(`external:${safeLocation(rawUrl)}`);
        await route.abort("blockedbyclient");
        return;
      }
      const url = new URL(rawUrl);
      observedRequests.push(`${method}:${url.pathname}${url.search}`);
      if (
        !["GET", "HEAD", "OPTIONS"].includes(method) &&
        !(method === "POST" && PORTAL_ALLOWED_POST_PATHS.has(url.pathname))
      ) {
        unexpectedRequests.push(`${method}:${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (isExpectedPortalDenialConsole(message)) {
        expectedDenialEvents.push(safeLocation(message.location().url));
      } else if (message.type() === "error") {
        consoleEvents.push(
          `console_error:${safeLocation(message.location().url ?? "")}`,
        );
      }
    });
    page.on("pageerror", (error) => {
      runtimeEvents.push(`page_error:${errorKind(error)}`);
    });
    await journey(page, observedRequests);
    const screenshotName =
      `${viewportSpec.name}-${name}-${viewportSpec.width}x${viewportSpec.height}.png`;
    await page.screenshot({
      path: join(artifactRoot, screenshotName),
      fullPage: false,
    });
    return Object.freeze({
      name,
      screenshotPath: screenshotName,
      consoleErrors: consoleEvents.length,
      expectedSecurityDenials: expectedDenialEvents.length,
      runtimeErrors: runtimeEvents.length,
      unexpectedRequests: unexpectedRequests.length,
    });
  } finally {
    await context.close();
  }
}

async function gotoLocal(page, request, route) {
  await page.goto(new URL(route, request.baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: CAPTURE_TIMEOUT_MS,
  });
}

async function signIn(page, request, login, returnTo = null) {
  const route = returnTo
    ? `/inloggen?returnTo=${encodeURIComponent(returnTo)}`
    : "/inloggen";
  await gotoLocal(page, request, route);
  await page.getByLabel("E-mailadres").fill(login.email);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(login.password);
  await page.locator("form button[type=submit]").click();
}

async function waitHeading(page, name) {
  await page.getByRole("heading", { name, exact: true }).waitFor({
    state: "visible",
    timeout: CAPTURE_TIMEOUT_MS,
  });
}

async function proveCustomerJourney(page, request) {
  await signIn(page, request, request.logins.customer);
  await waitHeading(page, "Klantportaal");
  if (new URL(page.url()).pathname !== "/dashboard") {
    fail("customer_handoff_failed");
  }
  const dossierSelect = page.getByLabel("Selecteer dossier");
  await dossierSelect.waitFor({
    state: "visible",
    timeout: CAPTURE_TIMEOUT_MS,
  });
  const values = await dossierSelect.locator("option").evaluateAll((options) =>
    options.map((option) => option.value)
  );
  const expected = [
    request.state.customerDossierId,
    request.state.customerSecondDossierId,
  ];
  if (
    values.length !== 2 || !expected.every((value) => values.includes(value)) ||
    values.includes(request.state.businessDossierId)
  ) fail("customer_case_scope_leak");
  await dossierSelect.selectOption(request.state.customerSecondDossierId);
  await page.waitForFunction(
    (id) =>
      document.querySelector("select[aria-label='Selecteer dossier']")
        ?.value === id,
    request.state.customerSecondDossierId,
    { timeout: CAPTURE_TIMEOUT_MS },
  );
  await page.getByRole("button", { name: "Nieuwe aanvraag", exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === "/aanmelden", {
    timeout: CAPTURE_TIMEOUT_MS,
  });
  await page.goBack({ waitUntil: "domcontentloaded" });
  await waitHeading(page, "Klantportaal");
  await page.goForward({ waitUntil: "domcontentloaded" });
  if (new URL(page.url()).pathname !== "/aanmelden") {
    fail("customer_forward_recovery_failed");
  }
  await page.goBack({ waitUntil: "domcontentloaded" });
  await waitHeading(page, "Klantportaal");
  if (
    await page.getByRole("heading", {
      name: "Bedrijfsportaal",
      exact: true,
    }).count() > 0
  ) {
    fail("customer_business_context_leak");
  }
  await gotoLocal(page, request, "/beheer");
  await waitHeading(page, "Geen toegang");
}

async function proveBusinessJourney(page, request) {
  await signIn(page, request, request.logins.business);
  await waitHeading(page, "Bedrijfsportaal");
  if (new URL(page.url()).pathname !== "/dashboard") {
    fail("business_handoff_failed");
  }
  if (
    await page.getByRole("heading", { name: "Klantportaal", exact: true })
      .count() > 0
  ) {
    fail("business_customer_context_leak");
  }
  await gotoLocal(page, request, "/beheer");
  await waitHeading(page, "Geen toegang");
}

async function proveAuthOnlyJourney(page, request) {
  await signIn(page, request, request.logins.authOnly);
  await page.getByText("Dit account heeft geen toegang tot dit portaal.", {
    exact: true,
  }).waitFor({ state: "visible", timeout: CAPTURE_TIMEOUT_MS });
  await gotoLocal(page, request, "/dashboard");
  await waitHeading(page, "Inloggen niet gelukt");
  await gotoLocal(page, request, "/beheer");
  await waitHeading(page, "Geen toegang");
}

async function proveActivationJourney(page, request) {
  await gotoLocal(page, request, "/inloggen#activeren");
  await page.getByLabel("E-mailadres").fill(request.logins.activation.email);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(
    request.logins.activation.password,
  );
  await page.getByLabel("Wachtwoord herhalen", { exact: true }).fill(
    request.logins.activation.password,
  );
  await page.locator("form button[type=submit]").click();
  await waitHeading(page, "Klantportaal");
  if (new URL(page.url()).pathname !== "/dashboard") {
    fail("activation_handoff_failed");
  }
}

async function proveWorkforceJourney(page, request, login, role, observed) {
  await signIn(page, request, login, "/beheer");
  await waitHeading(page, "Overzicht");
  await page.getByRole("link", { name: "Dossiers", exact: true }).waitFor({
    state: "visible",
    timeout: CAPTURE_TIMEOUT_MS,
  });
  await gotoLocal(page, request, "/beheer?tenant_id=other&capability=other");
  await waitHeading(page, "Overzicht");
  const contextRequests = observed.filter((item) =>
    item.includes("/functions/v1/api-app-operator-context")
  );
  if (
    contextRequests.length === 0 ||
    contextRequests.some((item) => item.includes("?"))
  ) fail(`${role}_operator_scope_leak`);
  await gotoLocal(page, request, "/dashboard");
  await waitHeading(page, "Inloggen niet gelukt");
}

export async function collectPortalAuthorityBrowserEvidence(
  argv,
  options = {},
) {
  const root = realpathSync(resolve(options.root ?? ENVAL_ROOT));
  const request = parsePortalAuthorityRequest(argv);
  inspectLocalReviewReadiness(request.baseUrl, root, options.run ?? defaultRun);
  const artifactRoot = checkedArtifactRoot(
    options.artifactRoot ?? mkdtempSync(join(tmpdir(), "enval-portal-r7-")),
  );
  const browser = await (options.launch ??
    ((launchOptions) => launchPrimaryPlaywright(root, launchOptions)))({
      headless: true,
    });
  const captures = [];
  try {
    for (const viewportSpec of request.viewports) {
      const run = (name, journey) =>
        portalJourney(
          browser,
          request,
          artifactRoot,
          viewportSpec,
          name,
          journey,
        );
      captures.push(
        await run(
          "customer",
          (page) => proveCustomerJourney(page, request),
        ),
      );
      captures.push(
        await run(
          "business",
          (page) => proveBusinessJourney(page, request),
        ),
      );
      captures.push(
        await run(
          "auth-only",
          (page) => proveAuthOnlyJourney(page, request),
        ),
      );
      captures.push(
        await run(
          "activation",
          (page) => proveActivationJourney(page, request),
        ),
      );
      captures.push(
        await run(
          "reviewer",
          (page, observed) =>
            proveWorkforceJourney(
              page,
              request,
              request.logins.reviewer,
              "reviewer",
              observed,
            ),
        ),
      );
      captures.push(
        await run(
          "admin",
          (page, observed) =>
            proveWorkforceJourney(
              page,
              request,
              request.logins.admin,
              "admin",
              observed,
            ),
        ),
      );
    }
  } finally {
    await browser.close();
  }
  const totals = captures.reduce((result, capture) => ({
    consoleErrors: result.consoleErrors + capture.consoleErrors,
    expectedSecurityDenials: result.expectedSecurityDenials +
      capture.expectedSecurityDenials,
    runtimeErrors: result.runtimeErrors + capture.runtimeErrors,
    unexpectedRequests: result.unexpectedRequests + capture.unexpectedRequests,
  }), {
    consoleErrors: 0,
    expectedSecurityDenials: 0,
    runtimeErrors: 0,
    unexpectedRequests: 0,
  });
  const result = [
      totals.consoleErrors,
      totals.runtimeErrors,
      totals.unexpectedRequests,
    ].every((count) => count === 0)
    ? "PASS"
    : "FAIL";
  const manifest = Object.freeze({
    schemaVersion: "enval_portal_authority_browser_evidence_v1",
    reviewId: request.reviewId,
    capturedAt: (options.now ?? (() => new Date()))().toISOString(),
    browserAutomationMechanism: "existing Playwright Chromium collector",
    result,
    viewports: request.viewports,
    captures,
    totals,
  });
  const manifestPath = join(artifactRoot, "portal-authority-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return Object.freeze({ artifactRoot, manifest, manifestPath });
}

async function main(argv) {
  if (argv[0] === "portal-authority") {
    const result = await collectPortalAuthorityBrowserEvidence(argv.slice(1));
    process.stdout.write(
      [
        `PORTAL_BROWSER_MATRIX=${result.manifest.result}`,
        `EVIDENCE_MANIFEST=${result.manifestPath}`,
        `VIEWPORTS=${
          result.manifest.viewports.map((item) => item.name).join(",")
        }`,
        `CONSOLE_ERROR_COUNT=${result.manifest.totals.consoleErrors}`,
        `EXPECTED_SECURITY_DENIAL_COUNT=${result.manifest.totals.expectedSecurityDenials}`,
        `RUNTIME_ERROR_COUNT=${result.manifest.totals.runtimeErrors}`,
        `UNEXPECTED_REQUEST_COUNT=${result.manifest.totals.unexpectedRequests}`,
        "",
      ].join("\n"),
    );
    if (result.manifest.result !== "PASS") process.exitCode = 1;
    return;
  }
  const result = await collectBrowserEvidence(argv);
  process.stdout.write(
    [
      `BROWSER_EVIDENCE_COLLECTOR=${result.manifest.collectorResult}`,
      `EVIDENCE_MANIFEST=${result.manifestPath}`,
      `SCREENSHOT_ARTIFACTS=${
        result.manifest.viewports.map((capture) =>
          join(result.artifactRoot, capture.screenshotPath)
        ).join(",")
      }`,
      `CONSOLE_ERROR_COUNT=${result.manifest.consoleErrors.count}`,
      `RUNTIME_ERROR_COUNT=${result.manifest.runtimeErrors.count}`,
      `PRODUCT_WRITE_REQUEST_COUNT=${result.manifest.productWriteRequests.count}`,
      "",
    ].join("\n"),
  );
  if (result.manifest.collectorResult !== "PASS") process.exitCode = 1;
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invoked === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    const code = error instanceof BrowserEvidenceError
      ? error.code
      : `unexpected_failure:${errorKind(error)}:${
        safeFailureDetail(error?.message)
      }`;
    process.stderr.write(`BROWSER_EVIDENCE_COLLECTOR=FAIL\nFAILURE=${code}\n`);
    process.exitCode = 1;
  });
}
