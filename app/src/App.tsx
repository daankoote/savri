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

const AccountPage = lazy(() => import("./pages/AccountPage").then((module) => ({ default: module.AccountPage })));
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
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
  "/aanmelden": SignupPage,
  "/upload": UploadPage,
  "/ere": EreInfoPage,
  "/contact": ContactPage,
  "/privacy": PrivacyPage,
  "/voorwaarden": TermsPage,
} as const;

type PageComponent = (props: RoutedPageProps) => ReactElement;

export function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const handlePopState = () => {
      setPath(normalizePath(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate: AppNavigate = (href) => {
    const target = new URL(href, window.location.origin);
    const targetPath = normalizePath(target.pathname);

    window.history.pushState(null, "", `${targetPath}${target.hash}`);
    setPath(targetPath);

    if (target.hash) {
      window.requestAnimationFrame(() => {
        document.querySelector(target.hash)?.scrollIntoView({ behavior: "smooth" });
      });
    } else {
      window.scrollTo({ top: 0 });
    }
  };

  if (path === "/account") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider>
          <AccountPage navigate={navigate} currentPath={path} />
        </AuthProvider>
      </Suspense>
    );
  }

  if (path === "/dashboard") {
    return (
      <Suspense fallback={<RouteLoading />}>
        <AuthProvider>
          <DashboardPage navigate={navigate} currentPath={path} />
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
