import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import { ContactPage } from "./pages/ContactPage";
import { EreInfoPage } from "./pages/EreInfoPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SignupPage } from "./pages/SignupPage";
import { TermsPage } from "./pages/TermsPage";
import { UploadPage } from "./pages/UploadPage";
import type { AppNavigate, RoutedPageProps } from "./routes/types";
import { parseEvidenceReviewDetailRoute } from "./features/evidence-review/evidenceReviewRoutes";
import { readSafePostLoginReturnRoute } from "./features/auth/postLoginNavigation";
import {
  AUTH_ACCOUNT_ROUTE,
  AUTH_PASSWORD_REQUEST_ROUTE,
  AUTH_PASSWORD_UPDATE_ROUTE,
  AUTH_VERIFICATION_RESEND_ROUTE,
} from "./features/auth/authUxFlow";

const AccountPage = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountPage })));
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const ComplianceWorklistPage = lazy(() =>
  import("./pages/ComplianceWorklistPage").then((module) => ({ default: module.ComplianceWorklistPage })),
);
const OperatorOverviewPage = lazy(() =>
  import("./pages/OperatorOverviewPage").then((module) => ({ default: module.OperatorOverviewPage })),
);
const EvidenceReviewWorklistPage = lazy(() =>
  import("./pages/EvidenceReviewWorklistPage").then((module) => ({
    default: module.EvidenceReviewWorklistPage,
  })),
);
const EvidenceReviewCaseDetailPage = lazy(() =>
  import("./pages/EvidenceReviewCaseDetailPage").then((module) => ({
    default: module.EvidenceReviewCaseDetailPage,
  })),
);
const AuthProvider = lazy(() =>
  import("./features/auth/AuthProvider").then((module) => ({ default: module.AuthProvider })),
);

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

const routes = {
  "/": HomePage,
  "/upload": UploadPage,
  "/ere": EreInfoPage,
  "/contact": ContactPage,
  "/privacy": PrivacyPage,
  "/voorwaarden": TermsPage,
} as const;

type PageComponent = (props: RoutedPageProps) => ReactElement;

function isOperatorRoute(path: string): boolean {
  return path === "/beheer" || path === "/beheer/dossiers" ||
    path === "/intern/compliance" || path === "/intern/dossiers" ||
    parseEvidenceReviewDetailRoute(path) !== null;
}

export function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      setPath(normalizePath(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate: AppNavigate = (href, options = {}) => {
    const target = new URL(href, window.location.origin);
    const targetPath = normalizePath(target.pathname);
    const nextLocation = `${targetPath}${target.search}${target.hash}`;

    if (options.replace) {
      window.history.replaceState(null, "", nextLocation);
    } else {
      window.history.pushState(null, "", nextLocation);
    }
    setPath(targetPath);

    if (target.hash) {
      window.requestAnimationFrame(() => {
        document.querySelector(target.hash)?.scrollIntoView({ behavior: "smooth" });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  };

  const evidenceReviewCaseRef = parseEvidenceReviewDetailRoute(path);
  const loginReturnTo = path === "/inloggen"
    ? readSafePostLoginReturnRoute(window.location.search)
    : null;

  if (
    path === AUTH_ACCOUNT_ROUTE ||
    path === "/inloggen" ||
    path === AUTH_PASSWORD_REQUEST_ROUTE ||
    path === AUTH_PASSWORD_UPDATE_ROUTE ||
    path === AUTH_VERIFICATION_RESEND_ROUTE
  ) {
    const authIntent = path === AUTH_PASSWORD_UPDATE_ROUTE
      ? "password_recovery"
      : path === AUTH_PASSWORD_REQUEST_ROUTE ||
          path === AUTH_VERIFICATION_RESEND_ROUTE
      ? "public_request"
      : "portal";
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider
          key={authIntent}
          audience={loginReturnTo && isOperatorRoute(loginReturnTo)
            ? "operator"
            : "customer"}
          intent={authIntent}
        >
          <AccountPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  if (path === "/dashboard") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider key="dashboard">
          <DashboardPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  if (path === "/beheer") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider audience="operator">
          <OperatorOverviewPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  if (path === "/intern/compliance") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider audience="operator">
          <ComplianceWorklistPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  if (path === "/beheer/dossiers" || path === "/intern/dossiers") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider audience="operator">
          <EvidenceReviewWorklistPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  if (evidenceReviewCaseRef) {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider audience="operator">
          <EvidenceReviewCaseDetailPage
            caseRef={evidenceReviewCaseRef}
            navigate={navigate}
            currentPath={path}
          />
        </AuthProvider>
      </Suspense>
    );
  }

  if (path === "/aanmelden") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider key="signup">
          <SignupPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  const Page: PageComponent = routes[path as keyof typeof routes] ?? NotFoundPage;

  return <Page navigate={navigate} currentPath={path} />;
}

function RouteLoading() {
  return (
    <main className="page-shell">
      <section className="section">
        <div className="container">
          <div className="review-panel" role="status" aria-live="polite">
            <h3>Laden</h3>
            <p>Even geduld.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
