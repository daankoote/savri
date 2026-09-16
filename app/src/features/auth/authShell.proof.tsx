import { renderToStaticMarkup } from "react-dom/server";
import { HomePage } from "../../pages/HomePage.tsx";
import { AccountPage } from "../../pages/AccountPage.tsx";
import { SignupPageShell } from "../signup/SignupPageShell.tsx";
import { AppHeader } from "../../shared/components/AppHeader.tsx";
import { PresentationBrandProvider } from "../../shared/presentation/PresentationBrandProvider.tsx";
import {
  projectPresentationBrand,
  validatePresentationBrandConfigV1,
} from "../../../../platform/runtime/presentation/presentation_brand_config.ts";
import { AuthProvider } from "./AuthProvider.tsx";
import type { AuthAudience } from "./authTypes.ts";
import {
  AUTH_ACCOUNT_COMPATIBILITY_ROUTE,
  AUTH_LOGIN_ROUTE,
  AUTH_PASSWORD_REQUEST_ROUTE,
  AUTH_PASSWORD_UPDATE_ROUTE,
  AUTH_VERIFICATION_RESEND_ROUTE,
  type AuthProviderIntent,
} from "./authUxFlow.ts";
import { readSafePostLoginReturnRoute } from "./postLoginNavigation.ts";

class ProofFailure extends Error {}

declare const Deno: {
  readTextFile(path: URL): Promise<string>;
  exit(code: number): never;
};

function assert(condition: boolean, code: string): asserts condition {
  if (!condition) throw new ProofFailure(code);
}

const root = new URL("../../../../", import.meta.url);
const source = (path: string) => Deno.readTextFile(new URL(path, root));
const navigate = (_href: string) => undefined;

const sessionValues = new Map<string, string>();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      hash: "",
      origin: "https://tenant.invalid",
      pathname: "/",
      search: "",
    },
    sessionStorage: {
      getItem: (key: string) => sessionValues.get(key) ?? null,
      removeItem: (key: string) => sessionValues.delete(key),
      setItem: (key: string, value: string) => sessionValues.set(key, value),
    },
  },
});

const presentationResult = validatePresentationBrandConfigV1({
  schemaVersion: "presentation-brand-config-v1",
  configVersion: "auth-shell-proof-v1",
  displayName: "Tenant Merk",
  shortMark: "TM",
  productLabel: "Tenantportaal",
  tagline: "Tenantdienst",
  assets: {
    logo: "/assets/tenant-logo.svg",
    altText: "Tenant Merk",
  },
  exportBasename: "tenant-documenten",
});
assert(presentationResult.ok, "proof_presentation_invalid");
const presentation = projectPresentationBrand(presentationResult.value);

function renderAccountRoute(
  currentPath: string,
  audience: AuthAudience,
  intent: AuthProviderIntent,
): string {
  return renderToStaticMarkup(
    <PresentationBrandProvider presentation={presentation}>
      <AuthProvider audience={audience} intent={intent}>
        <AccountPage currentPath={currentPath} navigate={navigate} />
      </AuthProvider>
    </PresentationBrandProvider>,
  );
}

const authRoutes = [
  { path: AUTH_LOGIN_ROUTE, intent: "portal" },
  { path: AUTH_PASSWORD_REQUEST_ROUTE, intent: "public_request" },
  { path: AUTH_PASSWORD_UPDATE_ROUTE, intent: "password_recovery" },
  { path: AUTH_VERIFICATION_RESEND_ROUTE, intent: "public_request" },
] as const;

for (const route of authRoutes) {
  const html = renderAccountRoute(route.path, "customer", route.intent);
  assert(
    html.includes("Tenant Merk") &&
      html.includes("Inloggen") &&
      !html.includes("Tenantdienst") &&
      !html.includes("ERE inboekservice") &&
      !html.includes("Powered by ENVAL") &&
      html.includes('data-app-surface="tenant_customer"') &&
      !html.includes("<nav"),
    `Q01_auth_route_not_minimal_tenant_header:${route.path}`,
  );
}

const emptyNavigationHtml = renderToStaticMarkup(
  <PresentationBrandProvider presentation={presentation}>
    <AppHeader
      currentPath={AUTH_LOGIN_ROUTE}
      identitySurface="public_auth"
      navigate={navigate}
      navigation={[]}
    />
  </PresentationBrandProvider>,
);
assert(
  emptyNavigationHtml.includes("Tenant Merk") &&
    emptyNavigationHtml.includes("Inloggen") &&
    !emptyNavigationHtml.includes("Tenantdienst") &&
    !emptyNavigationHtml.includes("<nav"),
  "Q02_explicit_empty_navigation_rendered_landmark",
);

const publicHeaderHtml = renderToStaticMarkup(
  <PresentationBrandProvider presentation={presentation}>
    <AppHeader currentPath="/" navigate={navigate} />
  </PresentationBrandProvider>,
);
for (
  const label of [
    "Home",
    "Opbrengst",
    "Aanmerking",
    "Aanmelden",
    "ERE info",
    "Contact",
    "Inloggen",
  ]
) {
  assert(
    publicHeaderHtml.includes(`>${label}</a>`),
    `Q03_public_navigation_item_missing:${label}`,
  );
}
assert(
  publicHeaderHtml.includes('<nav class="header-nav"'),
  "Q03_public_navigation_landmark_missing",
);
assert(
  publicHeaderHtml.includes('href="/inloggen"') &&
    !publicHeaderHtml.includes('href="/account"'),
  "Q03_public_login_route_not_canonical",
);

const homeHtml = renderToStaticMarkup(
  <PresentationBrandProvider presentation={presentation}>
    <HomePage currentPath="/" navigate={navigate} />
  </PresentationBrandProvider>,
);
assert(
  homeHtml.includes('data-app-surface="public"') &&
    homeHtml.includes('<nav class="header-nav"') &&
    homeHtml.includes(">Inloggen</a>"),
  "Q04_public_route_lost_default_navigation",
);

const signupHtml = renderToStaticMarkup(
  <PresentationBrandProvider presentation={presentation}>
    <AuthProvider>
      <SignupPageShell currentPath="/aanmelden" navigate={navigate} />
    </AuthProvider>
  </PresentationBrandProvider>,
);
assert(
  signupHtml.includes('data-app-surface="tenant_public"') &&
    signupHtml.includes('<nav class="header-nav"') &&
    signupHtml.includes(">Inloggen</a>"),
  "Q05_signup_lost_default_public_navigation",
);

const operatorHtml = renderAccountRoute("/inloggen", "operator", "portal");
assert(
  operatorHtml.includes('data-app-surface="tenant_operator"') &&
    operatorHtml.includes("Tenant Merk") &&
    operatorHtml.includes("Inloggen") &&
    !operatorHtml.includes(">Beheer<") &&
    !operatorHtml.includes("Tenantdienst") &&
    !operatorHtml.includes("<nav"),
  "Q06_operator_login_surface_or_navigation_invalid",
);
const workforceHeaderHtml = renderToStaticMarkup(
  <PresentationBrandProvider presentation={presentation}>
    <AppHeader
      currentPath="/beheer"
      identitySurface="tenant_operator"
      navigate={navigate}
      navigation={[
        { label: "Overzicht", href: "/beheer", active: true },
        { label: "Dossiers", href: "/beheer/dossiers" },
      ]}
      onLogout={async () => true}
      surface="tenant_operator"
    />
  </PresentationBrandProvider>,
);
assert(
  workforceHeaderHtml.indexOf(">Overzicht</a>") <
      workforceHeaderHtml.indexOf(">Dossiers</a>") &&
    workforceHeaderHtml.indexOf(">Dossiers</a>") <
      workforceHeaderHtml.indexOf(">Uitloggen</button>") &&
    workforceHeaderHtml.includes('<button aria-busy="false"') &&
    workforceHeaderHtml.includes('type="button">Uitloggen</button>') &&
    !operatorHtml.includes(">Uitloggen</button>") &&
    !publicHeaderHtml.includes(">Uitloggen</button>"),
  "Q06b_workforce_logout_order_or_surface_isolation_invalid",
);
assert(
  readSafePostLoginReturnRoute("?returnTo=%2Fbeheer") === "/beheer" &&
    readSafePostLoginReturnRoute("?returnTo=https%3A%2F%2Fattacker.invalid") ===
      null,
  "Q07_operator_return_safety_changed",
);

const [
  appSource,
  accountPageSource,
  authLayoutSource,
  authUxSource,
  dashboardGuardSource,
  dashboardSidebarSource,
  emailRequestSource,
  headerSource,
  passwordRecoverySource,
  signupSource,
  uiCollectorSource,
  operatorGuardSource,
  operatorOverviewPageSource,
  evidenceWorklistPageSource,
  evidenceDetailPageSource,
  compliancePageSource,
  componentsCss,
  layoutCss,
] = await Promise.all([
  source("app/src/App.tsx"),
  source("app/src/pages/AccountPage.tsx"),
  source("app/src/features/auth/AuthPageLayout.tsx"),
  source("app/src/features/auth/authUxFlow.ts"),
  source("app/src/features/auth/DashboardRouteGuard.tsx"),
  source("app/src/features/dashboard/DashboardSidebar.tsx"),
  source("app/src/features/auth/AuthEmailRequestPage.tsx"),
  source("app/src/shared/components/AppHeader.tsx"),
  source("app/src/features/auth/PasswordRecoveryPage.tsx"),
  source("app/src/features/signup/SignupPageShell.tsx"),
  source("scripts/tools/enval-ui-review-collect.mjs"),
  source("app/src/features/operator/OperatorRouteGuard.tsx"),
  source("app/src/pages/OperatorOverviewPage.tsx"),
  source("app/src/pages/EvidenceReviewWorklistPage.tsx"),
  source("app/src/pages/EvidenceReviewCaseDetailPage.tsx"),
  source("app/src/pages/ComplianceWorklistPage.tsx"),
  source("app/src/styles/components.css"),
  source("app/src/styles/layout.css"),
]);
assert(
  appSource.includes("AUTH_ACCOUNT_COMPATIBILITY_ROUTE") &&
    appSource.includes("AUTH_LOGIN_ROUTE") &&
    appSource.includes("AUTH_PASSWORD_REQUEST_ROUTE") &&
    appSource.includes("AUTH_PASSWORD_UPDATE_ROUTE") &&
    appSource.includes("AUTH_VERIFICATION_RESEND_ROUTE") &&
    appSource.includes("isOperatorRoute(loginReturnTo)") &&
    accountPageSource.includes("navigation={[]}") &&
    accountPageSource.includes('identitySurface="public_auth"') &&
    accountPageSource.includes('auth.audience === "operator"') &&
    headerSource.includes("navigation = publicNavigation") &&
    headerSource.includes("navigation.length > 0 || onLogout") &&
    !signupSource.includes("navigation={[]}"),
  "Q08_route_or_composition_contract_invalid",
);

assert(
  appSource.includes(
    'window.history.replaceState(null, "", AUTH_LOGIN_ROUTE)',
  ) &&
    appSource.includes(
      "if (path === AUTH_ACCOUNT_COMPATIBILITY_ROUTE) return <RouteLoading />",
    ) &&
    !appSource.includes(
      "AUTH_ACCOUNT_COMPATIBILITY_ROUTE ||",
    ) &&
    AUTH_ACCOUNT_COMPATIBILITY_ROUTE === "/account" &&
    AUTH_LOGIN_ROUTE === "/inloggen",
  "Q09_account_compatibility_redirect_not_exact_replace",
);

assert(
  [
    emailRequestSource,
    passwordRecoverySource,
  ].every((value) =>
    value.includes("AUTH_LOGIN_ROUTE") &&
    !value.includes('navigate("/account")')
  ) &&
    dashboardGuardSource.includes("completeAuthLogout") &&
    dashboardSidebarSource.includes("completeAuthLogout") &&
    authUxSource.includes("navigate(AUTH_LOGIN_ROUTE, { replace: true })") &&
    headerSource.includes('{ label: "Inloggen", href: "/inloggen" }') &&
    !headerSource.includes('{ label: "Inloggen", href: "/account" }'),
  "Q10_internal_login_caller_not_canonical",
);

assert(
  !authLayoutSource.includes("AuthAudience") &&
    !authLayoutSource.includes(">Beheer<") &&
    !authLayoutSource.includes(">Klantportaal<") &&
    accountPageSource.includes('identitySurface="public_auth"') &&
    !accountPageSource.includes("platformAttribution"),
  "Q11_auth_identity_or_attribution_contract_invalid",
);

assert(
  uiCollectorSource.includes(': "/inloggen"') &&
    uiCollectorSource.includes('"/inloggen#activeren"') &&
    !uiCollectorSource.includes('"/account#activeren"'),
  "Q12_browser_fixture_login_route_stale",
);

assert(
  [
    operatorOverviewPageSource,
    evidenceWorklistPageSource,
    evidenceDetailPageSource,
    compliancePageSource,
  ].every((value) =>
    value.includes("{(context, logout) =>") &&
    value.includes("onLogout={logout}")
  ) &&
    operatorGuardSource.includes("completeAuthLogout") &&
    operatorGuardSource.includes("signOut: auth.signOut") &&
    headerSource.includes("logoutRunningRef.current") &&
    headerSource.includes("disabled={logoutRunning}") &&
    componentsCss.includes(".header-nav button") &&
    layoutCss.includes(".header-nav button"),
  "Q13_workforce_logout_composition_loading_or_responsive_contract_invalid",
);

console.log("PUBLIC_AUTH_IDENTITY_V1_Q01_Q12=PASS");
console.log("WORKFORCE_HEADER_LOGOUT_STRUCTURE=PASS");
Deno.exit(0);
