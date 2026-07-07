import { useEffect, useState, type ReactElement } from "react";
import { ContactPage } from "./pages/ContactPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EreInfoPage } from "./pages/EreInfoPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SignupPage } from "./pages/SignupPage";
import { TermsPage } from "./pages/TermsPage";
import { UploadPage } from "./pages/UploadPage";
import type { AppNavigate, RoutedPageProps } from "./routes/types";

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
  "/dashboard": DashboardPage,
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

  const Page: PageComponent = routes[path as keyof typeof routes] ?? NotFoundPage;

  return <Page navigate={navigate} currentPath={path} />;
}
