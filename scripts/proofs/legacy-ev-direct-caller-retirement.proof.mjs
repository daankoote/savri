import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const STATIC_HANDOFF_PATH = resolve(ROOT, "aanmelden.html");
const INDEX_PATH = resolve(ROOT, "index.html");
const STATIC_SCRIPT_PATH = resolve(ROOT, "assets/js/script.js");
const ELIGIBILITY_PATH = resolve(ROOT, "assets/js/eligibility.js");
const APP_ROUTER_PATH = resolve(ROOT, "app/src/App.tsx");
const REDIRECTS_PATH = resolve(ROOT, "_redirects");
const SITEMAP_PATH = resolve(ROOT, "sitemap.xml");
const LEAD_FUNCTION_PATH = resolve(
  ROOT,
  "supabase/functions/api-lead-submit/index.ts",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceFiles(root, extensions) {
  const paths = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) paths.push(...sourceFiles(path, extensions));
    else if (extensions.includes(extname(entry.name))) paths.push(path);
  }
  return paths;
}

function gitLines(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim().split(/\r?\n/).filter(Boolean);
}

const rootHtml = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name) === ".html")
  .map((entry) => join(ROOT, entry.name));
const shippedStaticSources = [
  ...rootHtml,
  ...sourceFiles(resolve(ROOT, "assets/js"), [".js", ".mjs"]),
];

const reachableEvDirectCallers = shippedStaticSources.filter((path) =>
  readFileSync(path, "utf8").includes("ev_direct")
);
assert(
  reachableEvDirectCallers.length === 0,
  `reachable_ev_direct_caller_retained:${reachableEvDirectCallers.map((path) => relative(ROOT, path)).join(",")}`,
);

const retiredStaticRouteLinks = shippedStaticSources.filter((path) =>
  readFileSync(path, "utf8").includes("/aanmelden.html")
);
assert(
  retiredStaticRouteLinks.length === 0,
  `legacy_aanmelden_link_retained:${retiredStaticRouteLinks.map((path) => relative(ROOT, path)).join(",")}`,
);

const handoff = readFileSync(STATIC_HANDOFF_PATH, "utf8");
assert(
  !handoff.includes('name="evrijder"') &&
    !handoff.includes("api-lead-submit") &&
    handoff.includes('href="/aanmelden"') &&
    handoff.includes('rel="canonical" href="https://www.enval.nl/aanmelden"'),
  "static_ev_application_handoff_invalid",
);

const staticScript = readFileSync(STATIC_SCRIPT_PATH, "utf8");
const indexHtml = readFileSync(INDEX_PATH, "utf8");
assert(
  !staticScript.includes("handleEvForm") &&
    !staticScript.includes('form[name="evrijder"]') &&
    !staticScript.includes('flow: "ev_direct"'),
  "static_ev_direct_handler_retained",
);

const contactStart = staticScript.indexOf("async function handleContactForm(e)");
assert(contactStart >= 0, "contact_handler_missing");
const contactHandler = staticScript.slice(contactStart);
assert(
  indexHtml.includes('<form class="form" name="contact"') &&
  contactHandler.includes('fetch(`${API_BASE}/api-lead-submit`') &&
    contactHandler.includes('flow: "contact"') &&
    contactHandler.includes("isValidEmail(email.value)") &&
    contactHandler.includes("showFieldError(subject") &&
    contactHandler.includes("showFieldError(message"),
  "contact_lead_flow_changed_or_incomplete",
);

const eligibility = readFileSync(ELIGIBILITY_PATH, "utf8");
assert(
  eligibility.includes('href="/aanmelden"') &&
    !eligibility.includes("/aanmelden.html"),
  "eligibility_cta_not_canonical",
);

const appRouter = readFileSync(APP_ROUTER_PATH, "utf8");
assert(
  appRouter.includes('if (path === "/aanmelden")') &&
    appRouter.includes("<SignupPage") &&
    !handoff.includes("SignupPage"),
  "canonical_signup_route_missing_or_duplicated",
);

const redirects = readFileSync(REDIRECTS_PATH, "utf8");
const sitemap = readFileSync(SITEMAP_PATH, "utf8");
assert(
  /^\/aanmelden\.html\s+\/aanmelden\s+302$/m.test(redirects) &&
    sitemap.includes("https://www.enval.nl/aanmelden</loc>") &&
    !sitemap.includes("https://www.enval.nl/aanmelden.html</loc>"),
  "canonical_signup_redirect_or_sitemap_missing",
);

assert(existsSync(LEAD_FUNCTION_PATH), "api_lead_submit_source_missing");
const leadFunction = readFileSync(LEAD_FUNCTION_PATH, "utf8");
assert(
  leadFunction.includes('if (flow === "ev_direct")') &&
    leadFunction.includes('if (flow === "contact")'),
  "retained_api_lead_submit_source_incomplete",
);

const trackedLegacyFunctionFiles = gitLines([
  "ls-tree",
  "-r",
  "--name-only",
  "HEAD",
  "supabase/functions",
]).filter((path) => path.startsWith("supabase/functions/api-dossier-"));
assert(trackedLegacyFunctionFiles.length > 0, "legacy_dossier_source_inventory_empty");
for (const path of trackedLegacyFunctionFiles) {
  assert(existsSync(resolve(ROOT, path)), `legacy_dossier_source_missing:${path}`);
}

const protectedRuntimeChanges = gitLines([
  "diff",
  "--name-only",
  "--",
  "app/src/App.tsx",
  "app/src/features/signup",
  "app/src/pages/HomePage.tsx",
  "app/src/pages/SignupPage.tsx",
  "supabase/functions/api-app-signup-*",
  "supabase/migrations",
]);
assert(
  protectedRuntimeChanges.length === 0,
  `current_signup_or_database_changed:${protectedRuntimeChanges.join(",")}`,
);

console.log("LEGACY_EV_DIRECT_CALLER_REMOVED_CURRENT_SIGNUP_RETAINED=PASS");
